# 三家项目的「skill / 知识库」到底是什么

你的理解是对的：**skill 就是"用户放进项目里供 Agent 读的说明书"**。但三家在这个理解上走了三条不同的路，这一页讲清楚每家具体怎么做的、彼此差在哪。

## 一、skill 的字面定义（先对齐一下概念）

**skill = 一个目录里的一份 SKILL.md**。SKILL.md 是 markdown 文件，分两部分：

```yaml
---
name: pdf-tools                              # 技能名（缺省用目录名）
description: 用 pdf 工具处理 PDF 文件（什么时候该用）  # 一句话描述，这一句最重要
disable-model-invocation: true               # 可选：禁止模型自己调，只能用户显式调
---

# 给模型看的详细步骤 / 命令模板 / 注意事项
```

两份内容各自的作用：

- **`name` + `description`**（frontmatter）——**一直放在 system prompt 里**，让模型"知道有这个技能"。`description` 写得含糊的 skill 永远不会被用到；写得清楚的 skill 模型才会主动调。
- **正文**（markdown）——**默认不进 context**，模型想看时才去读。原文指令用的描述："disable-model-invocation" = 不让模型自动调，只能用户 `/skill:xxx` 显式调。

这是从 pi 源码注释（`packages/coding-agent/src/core/skills.ts`）直接抄来的设计意图，原话：

> 平时只在 system prompt 里放一行"名字 + 描述 + 文件位置"，当任务和某段描述匹配时，模型自己用 read 工具去读那份 SKILL.md，正文这时才进入上下文。这就是所谓的"渐进式披露"（progressive disclosure）。

把这个记牢，下面所有比较都建立在这上面。

## 二、你的直觉「对」的部分

**用户放进项目里供 Agent 读** — 没错，这是 skill 的本质。三家都是这个意思。差别只是：

| 维度 | AtkBrain | T3MP3ST | CyberStrike |
| --- | --- | --- | --- |
| 用户放的是不是 SKILL.md？ | **是**（6 份 SKILL.md） | **不是**（TS 代码 + JSON 工件） | **是**（7,662 份 SKILL.md） |
| 放哪？ | 仓库根 `skills/` | `src/resources/` + `bench/` | 仓库根 `.cyberstrike/skill/` |
| Agent 读不读？ | 读，每次猎面前拷到工作区 | 不读——它的"知识"是**评测基准**，给 verify-claims 重算用 | 读，启动时全文注入或按需取 |

所以 T3MP3ST 严格说不算"skill"流派——它的 bench/ 是**给评分脚本用的**，不是给 Agent 读的。这是你直觉对、但要注意边界的地方。

## 三、Agent 会不会"自己生成 skill"？

你的第二个问题——这是有意思的地方。**纯 Agent 自动生成 skill 在这三个项目里都没有**。但有三种"半自动"路径，效果是让 skill 库随项目成长：

### 3.1 AtkBrain 的 `kali-kit`：动态生成的 skill

```python
# backend/atkbrain/agents/kali_kit.py
def skill_markdown() -> str:
    """本机 Kali 渗透工具清单（绝对路径）。"""
    # 从本机实际存在的工具拼出 SKILL.md 全文
    ...
```

它**不是让 Agent 写**，是让"项目本身"在每次猎面启动时，**根据当前机器实际装了哪些工具、哪些词表存在**，**重新生成一份** `kali-kit/SKILL.md`，拷到工作区供 Pi 读取。

为什么需要这样？因为不同机器装的不同——A 机的 nmap 在 `/usr/bin/nmap`，B 机在 `/snap/bin/nmap`；A 机的词表是 rockyou.txt，B 机被设成禁用。换台机器或被改过设置，**重新生成 skill 才能用**。所以**skill 是"描述部署"而不是"通用方法论"**——它把"当前环境的真相"变成模型能用的指令。

源码注释原话："禁止把本模块的目录全文注入系统提示。"——它依赖运行时的具体路径与词表数。

### 3.2 CyberStrike 的 skills：静态且巨大，靠结构化字段让 Agent 自动串

CyberStrike 也有"动态性"，但**不在技能生成上，而在它怎么被 Agent 用**。
- 7,662 个 SKILL.md **全由项目作者（用户）放进仓库**，文件本身不变；
- 它给每条 skill 加了**结构化字段**（`chain_with` / `severity_boost` / `prerequisites`），让方法论引擎**自动**把"单条低危 → 链路高危"——但引擎代码是项目作者写的，Agent 本身不写技能。

### 3.3 T3MP3ST 的剧本文件蒸馏：**Agent 的执行**

`src/resources/ai-redteam-playbook.ts` 是 TS 常量数组（人写的）；但 `bench/obsidivm-evolution/proposals-ledger.json` 是**Agent 跑出来的账本**——每条带 `gen_added / history / lift_total / last_state / regressions / improvements`，记录"每一代 Agent 加了什么 / 被否了什么 / 升了几个代"。这是**Agent 的"知识沉淀"机制**：它不写 skill 文件本身，而是**把执行结果落成账本**。下一局新 Agent 接手时可以读到这份账本，知道哪些套路已经试过。

## 四、三家的设计意图（讲清楚选型）

直接复制三个项目源码里我看到的自我描述，让你判断"哪种符合我的需要"。

### 4.1 AtkBrain：领域窄（5–20 项规则）时学它

源码 `project_skills.py` 头部注释原话：

> 源文件在仓库根 `skills/`（进 git）。会话启动时**按赛道拷进该猎工作区 `<ws>/.agents/skills/`**，猎面 Pi 用 `--no-skills` + `--skill` 精确加载。**不写 `~/.pi/`**。

具体三步流程：

1. `skill_names(objective=...)` 按赛道挑该拷的——CTF → `("recon-fanout",)`；红队 → `("recon-spiral",)`；SRC → `("src-hunt-playbook",)`。都加共享的 `kali-kit` + `waf-bypass-methodology`。
2. `install_into_workspace(workspace, objective=...)` 把这一组目录**整个复制**到 `<ws>/.agents/skills/`。**注意——它同时清理已拷贝但本轮不在名单里的旧目录**，避免残留。
3. `skill_abs_paths(workspace, names)` 返回**绝对路径列表**，交给 Pi 拉起时用 `--no-skills --skill <绝对路径1> --skill <绝对路径2>` 精确加载。

**`--no-skills`** 这个参数特别关键：关掉 Pi 默认加载的所有内置技能，**只加载本会话明确指定的**——防止从者或工人误用其它项目残留的全局技能。

适用场景：你的领域规则就 5–20 项，手工挑得过来；你希望"每个 Agent 只看自己用得到的那一点"。

### 4.2 T3MP3ST：领域抽象方法论 + 需要可重算基准时学它

`scripts/verify-claims.mjs` 头部原话：

> SCOPE — read this honestly: this is a **REPRODUCIBILITY / REGRESSION check of our OWN committed artifacts, NOT a third-party audit**.

它的"知识"路径与"社交"完全分叉：

| 知识 | 用途 |
| --- | --- |
| `src/resources/ai-redteam-playbook.ts`（TS 数组）| Agent 加载的方法论——每条 `redteamUse` 字段告诉模型"在 garak / promptfoo / agent loop 里怎么用" |
| `bench/xbow/results/`、`bench/cybench/`、`bench/obsidivm-evolution/ledger.json` 等 | 已提交的工件，作为评分依据；verify-claims 重算 README 里的数字 |

**verify-claims 是 T3MP3ST 的入库校验**：flag 大小写不敏感比对、捏造识别（`looksFabricated()` 拦截 placeholder/fake/example/leetspeak）、最佳成绩必须从**固定提交的运行集**重推。

适用场景：你的领域方法论抽象（不是"具体工具"）且需要可重复核验的基准数字。

### 4.3 CyberStrike：领域广（数千项）+ 社区可分发时学它

`src/skill/signing.ts` 顶部有**官方 Ed25519 公钥**，对每个 SKILL.md 校验四级：

| 状态 | 判定 |
| --- | --- |
| `official` | 有 `cyberstrike-official` 签名且校验通过 |
| `community` | 有签名但签的不是官方（第三方作者） |
| `unverified` | 没有哈希头 |
| `tampered` | 有签名但内容哈希对不上——**被篡改** |

这是工作规模问题：知识库 10 个时信任与否无所谓；7,662 个 + 社区可分发时，**没有签名机制就是裸奔**。T3MP3ST 的 `bench/` 是"作者自己提交的工件"，靠 git 历史 + verify-claims 反捏造过滤解决；CyberStrike 的 `.cyberstrike/skill/` 是"用户可以本地装的第三方技能"，需要 Ed25519 解决——**两种信任模型针对不同的分发场景**。

同时它给每条 skill 加了**结构化字段**（`chains_with` / `severity_boost` / `prerequisites` / `tech_stack`）——这些字段让方法论引擎**自动**做出"单条低危 → 链路高危"的升档决策，不需要 Agent 主动声明严重度。

适用场景：你有几千项分散内容，要让社区分发，作者分散但整体可信度要保证。

## 五、用户放进项目 → Agent 读 的完整链路图

```text
用户                                  Agent / 框架                           运行时
──────────────────────────────────   ─────────────────────────────────────   ──────────────────────────────────
SKILL.md（写在仓库）                   │
        ▼                            ▼
                       1. AtkBrain: 拷到 <ws>/.agents/skills/
                       2. CyberStrike: 启动时注入 system prompt
                          或 skill 工具按需取
                                        ▼
                                模型读 SKILL.md（read 工具）
                                        ▼
                                按 SKILL.md 里的命令/方法论做动作
```

你的直觉"用户放进项目里供 Agent 读"在这一行图里**全部成立**。三家只在这一行的"怎么发现/怎么取用/怎么防伪"上分了叉。

## 六、回答你的具体问题

> **「Agent 会不会自己生成 skill（针对一定项目）」？**

直答：**纯自动生成 skill 文件，三个项目都没有**。但有三种"半自动"，按你的"针对项目"程度由低到高：

1. **AtkBrain 的 `kali-kit`：** 不是 Agent 生成，是**项目代码本身**在每次猎面启动时按"本机当前真实工具与词表"重新生成——所以 skill 里写的路径与数字永远是当前环境真相。
2. **CyberStrike 的 `chain_with` 等字段：** Agent **不写** skill 文件，但引擎靠结构化字段**自动编排**——单条低危自动升级为链路高危。
3. **T3MP3ST 的 `bench/obsidivm-evolution/ledger.json`：** Agent **不写** skill，但**把执行结果落成账本**（带 `gen_added` / `lift_total` / `last_state` 的演化记录）——这是最接近"Agent 自己沉淀经验"的机制，但沉淀的是**执行账本**而非"知识"。

如果你的需求是"让 Agent 自己写一份方法论文档给下次用"，三个项目都没有现成方案——你可以参考 T3MP3ST 的 `ledger.json` 思路**自己攒账本**（每次跑出来 JSON 落盘），下次新 Agent 启动时读账本+读 skill 一起。

下一轮：要我把"T3MP3ST 的 ai-redteam playbook 全表"或"CyberStrike 方法论引擎五个 .ts 文件详解"挖出来给你看吗？指出来我继续。
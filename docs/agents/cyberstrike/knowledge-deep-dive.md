# 三个项目的知识库与 skill 详细对比（AtkBrain / T3MP3ST / CyberStrike）

这一页把后三个项目各自的“知识怎么放、怎么被发现、怎么被调用”讲清楚。三家的选择彼此差异极大，值得逐一拆。

## AtkBrain：6 个 SKILL.md + 工具路径模板

### 知识形态

仓库根 `skills/` 下 **6 个目录**，每个目录里是一份 SKILL.md（5 个固定 + 1 个动态生成）：

| 技能目录 | 来源 | 用途 |
| --- | --- | --- |
| `kali-kit` | **运行时生成**（`backend/atkbrain/agents/kali_kit.py` 里的 `skill_markdown()`） | 本机工具绝对路径、词表路径、可复制命令。带“禁止 which/ls /usr/share/wordlists / 猜包名”纪律 |
| `waf-bypass-methodology` | 静态 | payload 被 WAF/403/406 拦截页拦住时的回退路径 |
| `recon-fanout` | 静态 | **CTF 用**：先看入口找 flag，不升圈 |
| `recon-spiral` | 静态 | **红队用**：三圈小/中/大扫描，连续 6 个无增长才升圈 |
| `src-hunt-playbook` | 静态 | **SRC 用** |
| `ad-security`（参考目录） | 静态 | Active Directory 专门测试 |

### 调用机制（不写 `~/.pi/`，拷到工作区精确加载）

`backend/atkbrain/agents/project_skills.py` 头部注释把全部设计意图写明：

> 源文件在仓库根 `skills/`（进 git）。会话启动时**按赛道拷进该猎工作区 `backend/data/workspaces/<pid>/.agents/skills/`**，猎面 Pi 用 `--no-skills` + `--skill` 精确加载。**不写 `~/.pi/`**。

三步流程：

1. `skill_names(objective=...)` 按赛道挑出该拷的技能目录——CTF → `("recon-fanout",)`；SRC → `("src-hunt-playbook",)`；红队 → `("recon-spiral",)`；都加共享的 `kali-kit` 与 `waf-bypass-methodology`。
2. `install_into_workspace(workspace, objective=...)` 把这一组技能目录**整个复制**到 `<workspace>/.agents/skills/`。同时清理已拷贝但本轮不在名单里的旧目录（避免残留）。
3. `skill_abs_paths(workspace, names)` 返回**绝对路径列表**，交给 `ProjectAgent` 拉起 Pi 时用：
   ```text
   pi --mode rpc ... --no-skills --skill <绝对路径1> --skill <绝对路径2> ...
   ```

注意三个细节：

- **`--no-skills`** 关掉 Pi 默认加载的所有内置技能，**只加载本会话明确的 `--skill`**——防止从者或工人误用其它项目残留的全局技能；
- **`--skill` 接绝对路径**（不是名字），是 Pi 的 `--skill` 接路径而非 glob，避免和系统里其它同名技能混淆；
- **`kali-kit` 不是静态文件**——它由 `skill_markdown()` 从 `WL_DIR_*` 常量拼出当前机器的词表行数和大小限制（CTF/红队都禁 rockyou），拷到工作区后才落地。源是 `backend/atkbrain/agents/kali_kit.py`，注释明确写“禁止把本模块的目录全文注入系统提示”——它依赖运行时的具体路径与词表数，只有这样才有用。

### 内容形态示例（kali-kit）

`skill_markdown()` 生成的 `kali-kit/SKILL.md` 头部 frontmatter：

```yaml
name: kali-kit
description: >
  This machine's Kali pentest tools: absolute binary paths, pinned wordlists,
  copy-paste commands (nmap, ffuf, hydra, ssh, sshpass, socat, sqlmap, JSFinder,
  bypass-403, nxc, impacket, binutils). Call only after you already decided you
  need that scanner or wordlist for an unknown surface. Do not call to start a
  CTF puzzle — encoding, crypto, protocol, or a hinted path is local python3 /
  openssl / http_request, not this skill. Never which / ls wordlists.
  Shared by CTF and red team. Not recon policy — that is recon-fanout /
  recon-spiral.
```

正文分四块：**本机工具纪律**（禁止 which/ls / 猜包名/CTF/红队禁用 rockyou 等）、**Web 能力**（每个工具一条可复制命令，附词表行数）、**账号密码**（hydra 三档：176 用户 + 1021 密码 → 3559 密码 → 88406 密码）、**Yakit 纪律**（红队/SRC 顶栏开 Yakit 时禁止自设 HTTP_PROXY）。

注意：**CTF 和红队不是同一份技能**——`recon-fanout` 与 `recon-spiral` 互斥，由 `objective_allows_flag(objective)` 与 `objective_is_src(objective)` 决定。同一份 `kali-kit` 加 `waf-bypass-methodology` 是共用的。

## T3MP3ST：Playbook 数组 + bench/ 工件库

### 知识形态（不是 SKILL.md，是 TS 代码 + JSON 工件）

T3MP3ST **没有 SKILL.md**——它的“知识”是两种结构化形态：

**A. `src/resources/ai-redteam-playbook.ts` 的 TypeScript 数组**

每条技术一条 `RedTeamTechnique` 对象，5 个字段（`id`、`category`、`principle`、`redteamUse`、`defense`）：

```ts
{
  id: "refusal-suppression-inversion",
  category: "Refusal Suppression & Semantic Inversion",
  principle: "Alignment couples safe behavior to EMITTING a refusal token-sequence...",
  redteamUse: "garak: extend the refusal-suppression probe family with affect-justification...",
  defense: "Flag prompts that forbid the assistant's own refusal phrases..."
}
```

整张表是 **AI 红队战术方法论**——每条都明确告诉你这条模型在哪个安全工具（garak / promptfoo / agent loop）里怎么用、以及它的防御信号。文件头注释说：“Carriers are public + goal-agnostic; the target {Z} content is supplied per-engagement.”

**B. `bench/` 的 11 个基准目录**

| 目录 | 内容形态 | 用途 |
| --- | --- | --- |
| `xbow/` | `xben_list.txt` + `results/` | XBOW 公开 CTF 基准的官方结果 |
| `cybench/` | `results/` | Cybench 23/40 基准 |
| `cve-zero/` | （空） | 待补充 |
| `cve-hunt/` | 3 个 JSON | CVE 狩猎基准 |
| `obsidivm-probes/` | 5 个 JSON | 自建实测靶 |
| `obsidivm-evolution/` | `ledger.json` + `proposals-ledger.json` | 跨代版本的提案与改进记录（按 finding 追踪升代/降代/被否） |
| `binary-vulns/` | 1 个 JSON | 二进制漏洞检测语料 |
| `cloud-misconfig/` | `corpus.json` + `sample-checkov-output.json` | Terraform 误配检测（checkov 评测） |
| `mobile-static/` | `corpus.json` | Android 清单静态扫描 |
| `model-matrix/` | 3 个 JSON | 不同模型在评测上的对比 |
| `platform/` | 1 个 JSON | 综合平台基准 |

`obsidivm-evolution/proposals-ledger.json` 的格式特别值得看：每条提案带 `gen_added / history / lift_total / last_state / regressions / improvements`——这是把“基准数字怎么来的”做成一类可追溯的演化账本（与 README 的 27/27 数字直接对得上）。

### 调用机制（verify-claims）

T3MP3ST **不通过 LLM 调用知识库**——它的核心循环每次执行后，**结果落进 bench/ 的 JSON 工件**。下游消费方式不是再走 AI：

```text
src/agents/agent/ 调 src/resources/ai-redteam-playbook.ts → 加载到 ai_red_team 操作员 → 用 garak/promptfoo 跑 → 工件入 bench/
  → scripts/verify-claims.mjs 重算 README 数字 → 头部原话：
  "this is a REPRODUCIBILITY / REGRESSION check of our OWN committed artifacts, NOT a third-party audit"
```

`scripts/verify-claims.mjs` 头部声明两件事：

1. 它**只重算** README 的 27 个数字（XBEN 黑盒 pass@1 floor 91/104、Cybench 23/40 hint-free、CVE-Zero 8/10 等），不重新跑评测；
2. 三个反拟合机制：flag 大小写不敏感比对、捏造识别（`looksFabricated()` 拦截 placeholder/fake/example/leetspeak）、最佳成绩必须从**固定提交的运行集**重推。

这构成与 AtkBrain/CyberStrike 截然不同的可信化路径：**不是入库硬校验，是落库后用脚本重算 + 边界声明**。

### 与 bench 配套的脚本家族

- `scripts/cve-zero-hunt.mjs`：CVE-Zero 基准的猎手评测
- `scripts/model-matrix.mjs`：多模型对比
- `scripts/cve-zero-split.mjs`：评测切分
- `scripts/passk.mjs`：pass@k 计算

benchmark 工件 + 重算脚本 + verify-claims 三件套，构成 T3MP3ST 的整个知识库使用方式——**benchmark 是它的知识库，verify-claims 是它的入库校验**。

## CyberStrike：7,662 个 SKILL.md + 方法论引擎

### 知识形态（最大体量）

`.cyberstrike/skill/` 递归扫描下 **7,662 个 SKILL.md**——比 T3MP3ST 与 AtkBrain 都大两个数量级。分区：

| 分区 | 文件数 | 内容 |
| --- | --- | --- |
| `WEB/OWASP_WSTG_4.2/` | 125 | WSTG 用例全集 |
| `CIS_benchmarks/` | 约 5000 | CIS 安全基准（云智能体用） |
| `NIST/` | 约 1600 | NIST 控制项 |
| `mitre_attack*` | 约 690 | MITRE ATT&CK（企业/ICS/移动） |
| `attack-*` | 17 个目录 | 单项攻击技法（SSRF、JWT、请求走私等） |
| `*-postexploit` / `*-assessment` | 13 个目录 | 各平台后渗透与评估 |

### SKILL.md 的结构化字段（CyberStrike 独有）

以 `wstg-apit-00` 为例，frontmatter 不止是 name/description：

```yaml
name: wstg-apit-00
description: "API Testing Overview"
category: api-testing              # 分类
owasp_id: WSTG-APIT-00             # OWASP 编号
version: "1.0.0"
author: cyberstrike-official
tags: [api, rest, graphql, soap, wstg, apit]
tech_stack: []                     # 适配的技术栈
cwe_ids: []                        # 关联的 CWE
chains_with: []                    # 可串联的攻击用例
severity_boost: {}                 # 命中后严重度提升规则
prerequisites: []                  # 前置条件
```

四个独有的工程化字段：

- **`chains_with`** — 攻击链关联：方法论引擎的 chain 检测依据。如果发现出现在另一条用例的 `chains_with` 里，说明两者可串联，链上整体严重度升级（**单独低危 → 串联高危**）。T3MP3ST 与 AtkBrain 的知识库都没有这类字段。
- **`severity_boost`** — 命中后严重度提升规则。引擎会按规则自动升档，不需要模型主动声明。
- **`prerequisites`** — 前置条件（需要的工具、需要的访问等）。方法论引擎在执行前查这个来拒绝已不复用的能力。
- **`tech_stack`** — 适配的技术栈标签，方便智能体快速挑选相关条目。

### 调用机制（三条路并存）

#### 1. 启动时静态注入（最重）

`agent.ts` 的 `skills` 字段列出技能名，启动时 `Skill.get()` 全文取出，**直接拼进 system prompt**——这是最昂贵但最强大的方式，适合“必须默认知道”的方法论。

例子（来自源码）：

| 智能体 | 静态注入的技能 |
| --- | --- |
| `web-application` | 4 个 WSTG 用例：`wstg-recon-config`、`wstg-auth-session`、`wstg-injection`、`wstg-logic-client-api` |
| `cloud-security` | 13 个：6 个 CIS 基准 + 4 个云后渗透 + 3 个评估 |
| `internal-network` | 11 个：`ad-security`、`kerberos-attacks`、`ebpf-attacks` 等 |
| 每个测试器 | 2-5 份 WSTG 用例（按其负责的漏洞类别） |

#### 2. `skill` 工具运行时按需（最常用）

模型想读某份技能时调 `skill(name)`（`src/tool/skill.ts`），工具参数只有 `name`。执行流程（仓库注释原话）：

> `skill.require(name)` → 拿到元数据（路径/定位）；找不到直接 fatal；
> 走权限检查：`ask({ permission: "skill", patterns: [name], always: [name] })`；
> 在技能目录下用 ripgrep 列出**非 SKILL.md 的附带文件**作为辅助上下文。

这条路径的开销来自“通过权限闸 + ripgrep 列文件”——权限层相当于告诉用户“模型此刻读了哪个技能”。

#### 3. `methodology_*` 工具族（CyberStrike 独有）

公开方法论协议里那五个工具（`add_intel` / `methodology_status` / `update_vrt_check` / `scope_check` / `record_coverage_note`）本质上也是“用知识库”，但它们操作的是**情报库与覆盖率库**，而不是 SKILL.md。它们配合 `chains_with`、`severity_boost`、`prerequisites` 三个字段——这就是为什么方法论引擎能自动把单条低危升级为链路高危。

### 信任机制（CyberStrike 与 T3MP3ST 的关键差异）

`src/skill/signing.ts` 顶部有**官方 Ed25519 公钥**（`OFFICIAL_PUBLIC_KEY_B64`，32 字节原 key），对每个技能校验四级：

| 状态 | 判定 |
| --- | --- |
| `official` | 有 `cyberstrike-official` 签名且哈希校验通过 |
| `community` | 有签名但签的不是官方（第三方作者） |
| `unverified` | 没有哈希头 |
| `tampered` | 有签名但内容哈希对不上——**被篡改** |

这对应一个**工作规模问题**：当你的知识库是 10 个 SKILL.md，信任与否无所谓；当是 7,662 个且支持社区分发时，**没有签名机制就是裸奔**。T3MP3ST 的 `bench/` 是“作者自己提交的工件”，靠 git 历史 + verify-claims 的反捏造过滤解决；CyberStrike 的 `.cyberstrike/skill/` 是“用户可以本地装的第三方技能”，需要 Ed25519 解决——**这两种信任模型针对不同的分发场景**。

## 三家知识库的完整对照

| 维度 | AtkBrain | T3MP3ST | CyberStrike |
| --- | --- | --- | --- |
| **形态** | 5 个静态 SKILL.md + 1 个运行时生成的 `kali-kit` | 1 个 TS 数组的 playbook + 11 个 bench 目录的 JSON 工件 | 7,662 个 SKILL.md 分 7 大区 |
| **位置** | 仓库根 `skills/` | `src/resources/` + `bench/` | 仓库根 `.cyberstrike/skill/` |
| **载入策略** | 拷到工作区 `<ws>/.agents/skills/`，Pi 用 `--no-skills --skill <绝对路径>` 精确加载 | 不“载入”——工件是评分与凭据；playbook 加载到 `ai_red_team` 操作员 | 启动时静态注入 system prompt 或 `skill` 工具运行时按需 |
| **结构化字段** | 简 frontmatter（name/description） | TypeScript 类型（id/category/principle/redteamUse/defense）+ 工件 schema | 强结构化：`chains_with` / `severity_boost` / `prerequisites` / `tech_stack` + `cwe_ids` / `tags` / `category` |
| **自动化能力** | 靠人类挑的赛道 → 选技能目录 | 评测可重算（verify-claims 27 项） | 方法论引擎（`chains_with` 自动升链、`coverage` 自动计算）|
| **信任机制** | 无（git 来源） | 无（git + verify-claims 反捏造过滤） | **Ed25519 签名四级**（official/community/unverified/tampered） |
| **二次审查** | 二次验证 + 独立红队评级（finding 层） | 反驳裁决 + 引用校验（disprove 路径） | 触发证据门槛 + candidate 降级（report_vulnerability） |
| **规模化能力** | 6 个技能（够手工选） | 数十个评测工件（verify-claims 处理） | 数千个技能（必须 Ed25519 + 自动编排） |

## 选型参考

如果你的项目在类似位置上卡住了——即“想给 Agent 加一个领域知识库”——上面三家的设计可以分别对照：

- **领域窄（5–20 项规则）**：学 AtkBrain。手工挑目录、按赛道拷到工作区、用 Pi 的 `--skill` 精确加载。骨架代码很少，重点是挑清楚“什么是常识 vs 什么是按需查阅”。
- **领域抽象方法论 + 需要可重算基准**：学 T3MP3ST。把方法论写成 TS 常量/类型，把评测做成一组 JSON 工件 + 重算脚本。剧情主线是“把 AI 的产出沉淀成可追溯的演化账本”，而不是把 SKILL.md 当成容器。
- **领域广（数千项分散内容）+ 社区可分发**：学 CyberStrike。必须有 Ed25519 签名、必须有结构化字段（至少 chains_with）、必须有方法论引擎做编排——手工挑 7662 个技能是不可能的。

哪一种选型都不是“更好”——是“你的知识库是哪种形状就配哪种工程化”。这一页也是想说明：三个项目面对的是**不同的工作规模与不同的分发场景**，选择了**各自合适的形态**——而不是哪个项目“更先进”。
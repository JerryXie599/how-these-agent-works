# 工具层：Arsenal、审批与范围控制

T3MP3ST 的架构决定（见[推理后端](/agents/t3mp3st/keyless-backbone)）是：被借用的 agent 只产出文本，**框架的工具层（Arsenal，`src/arsenal/`）是整个系统里唯一能产生实际动作的地方**。这一页讲工具清单的构成、危险工具的审批机制、以及执行前的范围拦截。

## 工具清单

| 形态 | 数量 | 说明 |
| --- | --- | --- |
| 内置工具（默认启用） | 36 | Node 原生实现：DNS 查询、端口扫描、HTTP 请求、指纹识别、目录枚举、SSL 分析、JWT 解析等 |
| 全量工具（设置 `T3MP3ST_FULL_ARSENAL`） | 111 | 追加 75 个适配器，包装外部 CLI（nmap、gobuster、sqlmap 等）。README 注明：危险驱动（metasploit、hydra、pacu、frida）走的是窄化的专用路径，不是通用命令执行 |

两类数字都可由 `npm run verify-claims` 重算（见[证据与复现](/agents/t3mp3st/evidence-and-receipts)）。

## 审批门控（approval.ts）

**哪些工具需要审批**：源码注释（`approval.ts:19`）给出的定义是——一个工具是否受审批门控，取决于它是否带有受限的风险等级（riskTier）。默认情况下受门控的是**选装的专业后渗透驱动**（metasploit、hydra 等）和 Kali+ 适配器工具；36 个内置工具默认**不受**门控，除非设置 `T3MP3ST_GATE_BUILTINS=1` 给它们也打上风险等级。

**两条批准路径**：

| 路径 | 场景 |
| --- | --- |
| 预授权清单 | 无人值守运行时的事先白名单；清单内的受门控工具直接执行 |
| 交互批准 | 某个受门控工具首次使用时询问一次，批准后本会话内有效 |

**失败安全（fail-safe）原则**：一个受门控工具既不在预授权清单、也没有配置交互批准者时，**直接拒绝**（拒绝码 `denied-no-approver`）。"没有配置批准渠道"不会导致"默认放行"。

每次批准或拒绝的决策（工具名、时间、结果）都记录进审计轨迹。

## 范围拦截（Scope）

这是 README 列出的差异化能力之一：**Egress-scope containment，默认开启**。语义：任务设定了授权目标后，内置联网工具会在**启动任何进程之前**检查目标地址——不是授权目标及其子域、也不是本机回环/内网测试地址的，一律拒绝，错误信息为 `SCOPE DENIED`。

拦截点分布在每个出口，而不是集中在一处兜底：

| 拦截点 | 位置 |
| --- | --- |
| 内置工具统一入口 | `src/arsenal/index.ts:398`（"refused before execution"） |
| 外部 CLI 适配器 | `src/arsenal/adapter-tools.ts:621`（"without spawning anything"） |
| 危险驱动 | `src/arsenal/post-ex.ts:78,180`（metasploit / hydra 各自独立检查） |

三个位置的共同点：拦截发生在**进程启动之前**。这个顺序是实质性的——如果先 spawn 再拦截，网络流量已经发出去了。

## 单次工具执行的检查顺序

![工具执行模型 流程图](/diagrams/agents-t3mp3st-arsenal-and-gate-1.png)

一次工具调用按固定顺序通过三层检查：**风险门控（是否需要批准、是否已批准）→ 范围校验（目标是否在授权内）→ 执行**。两层拒绝都返回具体原因（源码注释要求 "it states WHY it blocked"），而不是笼统的失败。

## 与其他 Agent 的权限设计对照

| 话题 | Pi | Claude Code | DSH | opencode | T3MP3ST |
| --- | --- | --- | --- | --- | --- |
| 控制粒度 | 扩展 hook | 模式 × 规则 | 审批接口 | 每 agent Ruleset | 工具风险分级 |
| 默认姿态 | 信任扩展 | manual 档起步 | 缺答即拒 | 宽松基线 | 未批准即拒 |
| 危险工具处理 | 无特殊处理 | bypass 模式警告 | 沙箱隔离 | 无沙箱（宿主权限） | 双批准路径 + 全审计 |
| 范围控制 | 无 | 部分保护路径 | 沙箱边界 | external_directory | 执行前按目标地址拒绝 |
| 审计 | 日志 | hooks | 事件溯源 | SQLite | 每次门控决策入库 |

一个可以带走的观察：**"能不能用这个工具"（风险控制）和"能不能打这个目标"（范围控制）是两个独立的维度**。Claude Code 主要管前者，AtkBrain 主要管后者（授权范围 + 内网可达），DSH 与 T3MP3ST 两者都管。设计自己的 Agent 时值得把这两个轴分开考虑。

下一步：[证据与复现](/agents/t3mp3st/evidence-and-receipts)——一条发现从"模型说的"到"有证据的"要经过什么。
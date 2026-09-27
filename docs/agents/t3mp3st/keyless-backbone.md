# 推理后端：keyless 模式

T3MP3ST 自己不调用模型。它的推理来源有三类：**本机已经登录好的 coding agent**（不需要 API key，README 称 keyless 模式，也是默认卖点）、云模型（OpenRouter / Anthropic / OpenAI 等）、本地模型（Ollama / LM Studio / vLLM）。这一页讲第一类是怎么实现的，实现集中在 `src/agent/local-agents.ts`（约 700 行）。

## 核心机制：子进程 + 一次性调用

对本机 agent 的全部用法就是：**spawn 一个子进程，发一条一次性 prompt，收回一段文本**。没有会话、没有流式回传、没有工具回传——被借用的 agent 只负责"读这段材料，给出判断"。

五家支持的后端与实际调用命令（来自 `local-agents.ts`）：

| Agent | 调用方式 | 关键限制 |
| --- | --- | --- |
| Claude Code | `claude -p <prompt> --output-format text` | headless 单次模式 |
| Codex | `codex exec --ephemeral --skip-git-repo-check --sandbox read-only --color never` | 强制只读沙箱 |
| Hermes | `hermes -z <prompt>` | `--yolo` 仅在设置 `T3MP3ST_HERMES_YOLO=1` 时附加 |
| OpenCode | `opencode run <prompt>`，环境变量 `OPENCODE_PERMISSION={"*":"deny"}` | 其内部工具全部拒绝 |
| Oh My Pi | `omp --no-tools -p <prompt>` | 无工具模式 |

注意每一家的工具能力都被显式关闭（只读沙箱、权限全 deny、无工具）。原因见下文"执行权归工具层"。

## 认证：借用登录态，不碰 API key

`local-agents.ts` 的文件头注释解释了这个设计的原因：如果不做环境清洗，被拉起的 CLI 会读到 T3MP3ST 自己的 API key 并拿去调用（返回 401），而不是用用户原有的登录。所以：

- spawn 前剥掉所有模型供应商相关的环境变量（`PROVIDER_ENV_TO_STRIP`）；
- 每个 CLI 回退到它自己的登录凭据：macOS keychain（Claude Code）、`~/.codex/auth.json`、`~/.hermes/.env` 等；
- 认证探测**只检查凭据文件是否存在，从不读取内容**（源码注释 "PRESENCE ONLY — contents are never read"）；
- Windows 路径单独处理（如 Hermes 桌面版登录在 `%LOCALAPPDATA%\hermes\` 而不是 `~/.hermes/`，只查 POSIX 路径会把已登录的安装误判为未登录）。

## 执行权归工具层

后端 agent 只产出文本建议；**一切有副作用的动作由框架自己的 Arsenal 执行**（见[工具层与范围控制](/agents/t3mp3st/arsenal-and-gate)）。三家后端的限制方式：

- Codex：`--sandbox read-only`，结构上不能写文件；
- OpenCode：`OPENCODE_PERMISSION={"*":"deny"}`，工具层全部拒绝；
- Oh My Pi：`--no-tools`，没有工具面。

源码注释的表述是："OpenCode remains a planning backbone; Arsenal owns every executable tool action."

## 失败与边界情况的处理

| 问题 | 处理（`local-agents.ts`） |
| --- | --- |
| CLI 不在 PATH | `resolveBin()` 额外扫描各家原生安装目录（如 `~/.opencode/bin`）、npm 全局目录，Windows 用 `where.exe` |
| 模型响应慢 | 三档独立超时：`T3MP3ST_LOCAL_AGENT_TIMEOUT_MS` / `TASK_TIMEOUT_MS` / `GENERAL_TIMEOUT_MS` |
| CLI 静默失败 | 识别失败输出特征，按"模型调用失败"处理，走回退链 |
| 会话复用的风险 | Claude Code 会话复用**默认关闭**。README 的解释：被恢复的会话可能带着模型侧的上下文与既有工具权限，超出框架的证据边界；只有显式设置 `T3MP3ST_TRUST_CLAUDE_SESSION=1` 才复用，且仅限单个任务 |

## 三类推理来源的全景

keyless 本机 agent 只是 `src/llm/index.ts`（LLMBackbone）支持的一类：

| 来源 | 说明 |
| --- | --- |
| 本机 agent（keyless） | 上表五家，使用各自的原生登录 |
| 云供应商 | OpenRouter、Anthropic、OpenAI、Venice、xAI、Novita |
| 本地模型 | Ollama / LM Studio / vLLM（OpenAI 兼容接口）；通过文本协议驱动，不要求模型支持原生 function-calling |
| Mock | 确定性响应，用于测试 |

调用走统一回退链（`safeLLMCall`）：主模型 → 响应为空（少于 10 字符）或失败 → 换备用模型 → 三级 JSON 解析（代码块提取 → 非贪婪匹配 → 正则兜底）。空响应会自动触发回退。

## 与本站其他项目的 headless 用法对照

| | Pi（AtkBrain 中） | Claude Code | opencode | T3MP3ST 的用法 |
| --- | --- | --- | --- | --- |
| headless 入口 | `pi --mode rpc` 子进程 + JSONL | `claude -p` | `opencode run` | 一次性子进程，只收一段文本 |
| 工具权限 | `--no-builtin-tools` + 扩展桥注册 | 权限模式 | `OPENCODE_PERMISSION` | 全部关闭，动作归自家工具层 |
| 会话 | 进程池复用 | 默认不复用（需显式开关） | 无 | 默认无状态 |
| 认证 | 各自 provider | keychain 登录态 | 原生登录 | 借用原生登录，剥离平台自身的 key |

对照：AtkBrain 把 Pi 作为**完整运行时**嵌入（RPC、工具注册、事件流全部用上）；T3MP3ST 只取一段文本回答，其余全部自己掌控。这是"复用运行时"与"只复用模型调用"两种集成深度的极端。

下一步：[操作员与杀伤链](/agents/t3mp3st/operators-and-killchain)。
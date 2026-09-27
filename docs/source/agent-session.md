# AgentSession 运行层

如果 `Agent` 是发动机，`AgentSession` 就是把发动机装进车里的那层：它处理会话、资源、认证、扩展、压缩、内置工具和产品行为。

Pi 的 SDK 文档也把 `AgentSession` 定义为管理生命周期、消息历史、模型状态、压缩和事件流的核心对象。

## 它包住了什么

[![它包住了什么 流程图](/diagrams/source-agent-session-1.png)](/diagrams/source-agent-session-1.png)

## prompt() 的前置工作

用户调用 `session.prompt(text)` 时，并不是直接交给模型。Pi 会先做一串 preflight：

1. 如果是扩展命令，例如 `/mycommand`，交给扩展执行。
2. 触发 input hook，允许扩展拦截或改写输入。
3. 展开技能命令和 prompt template。
4. 如果 Agent 正在运行，根据 `streamingBehavior` 放进 steering 或 follow-up 队列。
5. 检查模型是否存在、认证是否可用。
6. 必要时先触发压缩。
7. 构造用户消息和扩展注入的 custom message。
8. 触发 `before_agent_start`，允许扩展改系统提示词或注入消息。
9. 调用底层 `agent.prompt(messages)`。

[![prompt() 的前置工作 流程图](/diagrams/source-agent-session-2.png)](/diagrams/source-agent-session-2.png)

## 会话持久化在哪里发生

底层 `Agent` 只维护内存状态。`AgentSession` 订阅 Agent 事件，在 `message_end` 时把消息 append 到 `SessionManager`。

这是一种很清晰的分层：

| 层 | 是否关心磁盘 |
| --- | --- |
| `Agent Loop` | 不关心 |
| `Agent` | 不关心，只管状态和事件 |
| `AgentSession` | 关心，把事件转成持久化 |
| `SessionManager` | 只关心 JSONL 和树结构 |

## Runtime 重建

为什么还需要 `AgentSessionRuntime`？

因为有些操作不是“在当前会话追加消息”，而是替换整个运行上下文：

| 操作 | 为什么要重建 |
| --- | --- |
| `/new` | 新 session file、新 leaf |
| `/resume` | 切到另一个 session file |
| `/fork` | 基于旧会话创建新文件 |
| 改 cwd | 资源加载、工具 cwd、项目设置都变了 |

这时只替换 `messages` 不够，工具、扩展、资源、设置都可能要按新 cwd 重新构造。

::: tip v0.87：SessionManager 是 provider context 的唯一事实来源
从 v0.87 起，直接赋值 `session.agent.state.messages` 不再影响后续请求历史。要恢复或修改上下文，正规做法是：用 `SessionManager.inMemory(cwd, { id }, entries)` 重建、用 `session.navigateTree()` 导航分支、或通过 `session.sessionManager` 追加 entry 后调用 `session.refreshContext()`。这也让 `appendContextEdit()`（对单条消息做“省略/替换”而不改原始历史）成为可能。
:::

## 下一代：AgentHarness

如果你注意到 `pi-agent-core` 里出现了一个 `harness/` 目录，那是在往“更完整的运行时”演进。同一颗 `Agent` 内核，现在有两条被包装的路线：

[![下一代：AgentHarness 流程图](/diagrams/source-agent-session-3.png)](/diagrams/source-agent-session-3.png)

| 代次 | 运行层 | 会话模型 | 现状 |
| --- | --- | --- | --- |
| 当前主线 | `AgentSession` + `SessionManager`（`pi-coding-agent`） | JSONL v3，`id`/`parentId`/`leafId` 树 | 稳定、文档和扩展生态围绕它展开 |
| 下一代 | `AgentHarness`（`packages/agent/src/harness/`，v2 API） | v4 lane-based `Session`/`SessionRepo`/`JsonlSessionRepo` | 自 v0.84.0 起为 `pi-agent-core` 默认导出，coding-agent 的 experimental mini/micro 已在用 |

AgentHarness 引入了 lane-based 会话（每条分支是一条 lane，带独立的操作记录、全局事实与共享序号）、耐久执行（durable operation records，配合工具 `replay` 策略恢复不确定的副作用）、内置文件工具和压缩，并保留读取 v3 旧文件的 `legacy-v3` codec。它和 `AgentSession` 解决的是同一个问题，只是把“会话 + 工具 + 压缩”下沉到了内核层。

## 教学版怎么对应

我们的教学版不会完整实现 `AgentSessionRuntime`，但会保留这个分层思想：

| Pi | 教学版 |
| --- | --- |
| `Agent` | `runAgentLoop()` + 内存 context |
| `AgentSession` | `/api/prompt` 里的 orchestrator |
| `SessionManager` | `JsonlSessionStore` |
| `ResourceLoader` | 静态 system prompt + 工具注册表 |
| `ExtensionRunner` | 简化 hooks |

当你理解这个映射，就不会被 Pi 的真实代码量吓到。它本质上是在把同一条链路做得更完整、更可扩展。

# DSH Agent 循环与工具管线

dsh 的循环实现在 `dsh-agent-loop` 包里，它的 README 开头毫不客气地写道：这是**全 Harness 唯一包含具体循环逻辑的包**。其余一切都是抽象服务或插件。本章讲这个循环、它脚下的工具管线，以及 dsh 独有的 Code Mode。

## ReactLoopAgent：循环本体

对外的入口是 `ctx.agentLoop` / `ctx.agents.create()`。创建一个 Agent 后，生命周期分三层：

```text
Agent
 └── session（会话）
      └── turn（一次完整响应，可多步）
           └── step（一次模型调用）
```

模型调用本身与 pi、Claude Code 无异：组装消息 → 流式请求 → 处理 `tool_use` → 回写结果 → 继续。真正值得注意的是它旁边的**收件箱（inbox）**。

## 收件箱：followup / steer / inject

dsh 用一个统一的 `send()` 原语管理"人怎么在 Agent 运行中插话"：

| 方法 | 语义 | 类比 |
| --- | --- | --- |
| `followup()` | 排队，**下一轮**开头被领取 | pi 的 `followUp()` |
| `steer()` | 注入并**立即唤醒**，改变当前走向 | pi 的 `steer()` |
| `inject()` | 只注入上下文，**不唤醒** | 环境信息的静默更新 |

三条工程细节让它从"API 设计"升级成"机制"：

1. **turn 边界原子领取**：pending 的输入在回合边界一次性领取，不会在工具执行到一半时被塞进去。
2. **事件先行**：每次收件箱变更先广播规范化的 `agent/inbox/spliced` 事件，再更新投影——UI 与存储永远看到同一种真相。
3. **权威在事件**：谁在什么时候说了什么，是日志里的既定事实，不是内存里的可变状态。这与 DSH 的会话设计一脉相承（下一章展开）。

## 工具管线：六步包装

每次工具调用走 `ctx.tools.execute()` 的完整管线：

![工具管线：六步包装 流程图](/diagrams/agents-dsh-loop-and-tools-1.png)

对照着看：

| 阶段 | DSH | Claude Code | Pi |
| --- | --- | --- | --- |
| 拦截 | pre-execute 门 | PreToolUse hook | `tool_call` hook |
| 审批 | `ctx.approval`（fail-closed） | 权限模式 + 规则 | 扩展自己实现 |
| 执行保护 | guards + around 包装 | 工具本体内置 | 工具本体内置 |
| 后处理 | finalizeContent + result 事件 | PostToolUse hook | `tool_result` hook |

两个独有的设计：

- **guards 是单调的**：文件系统策略（`dsh-fs-observation-policy`）强制"读后才可写、版本守卫写"——工具想写一个自己没读过的文件会被拦下，想写的文件若在读取后被外部改动也会被拦下。
- **审批缺答即拒（fail-closed）**：审批结果只有 `allowed-once / rejected / cancelled / unavailable` 四种，`unavailable`（没人应答）按拒绝处理。审计走 `approval/asked` + `approval/decided` 事件。

并行度由 `agent-loop.maxParallelToolCalls`（默认 10）控制，且只有 `isConcurrencySafe` 精确为 `true` 的调用才允许并行——保守但可预测。

## Code Mode：模型写代码调用工具

这是 dsh 最有意思的差异化设计（PTC = Programmatic Tool Calling）。`tools.mode` 配成 `code` 或 `both` 时：

![Code Mode：模型写代码调用工具 流程图](/diagrams/agents-dsh-loop-and-tools-2.png)

- 工具目录被生成为一个 TypeScript SDK（`tools:sdk`），模型在 `run_code` 里写 `import { read, grep } from 'tools:sdk'` 这样的程序，一次跑完多步操作。
- **上下文收益巨大**：传统模式里"搜索 → 读文件 → 再搜索"每步的完整结果都要占用上下文；Code Mode 下中间结果留在 worker 里，只有最终值回写。
- `code` 模式下模型直呼其他工具名会被解析为 `UNKNOWN_TOOL` 错误——强制走程序化路径。`config/agent-presets/code` 就是这个模式。

Claude Code 用子代理对抗上下文膨胀，pi 用压缩——DSH 给出了第三种答案：**让模型写代码，把编排成本从上下文转移到执行沙箱**。

## 循环之上的编排原语

dsh 给模型（和人）准备了一整套编排工具，全部注册在工具表里：

| 工具/机制 | 作用 |
| --- | --- |
| `dsh-tool-subagent` | spawn（全新子 Agent）/ fork（继承父日志前缀），可配 codex、claude-code 等外部提供方 |
| `dsh-tool-jobs` | 后台作业：`job_output` / `job_list` / `job_kill` |
| `dsh-tool-workflow` | 模型编写 JS 编排脚本，在 worker 线程执行 |
| `dsh-tool-ralph` | Ralph 循环：最多 64 轮的 fresh-agent 循环 |
| `dsh-tool-skill` + `dsh-skill-filesystem` | 技能注册表与文件系统发现（SKILL.md） |
| `dsh-tool-todo` | 事件溯源日志上的 `todo_write` |
| `dsh-tool-ask-user` | 向人提问的接缝 |
| `dsh-tool-cordis` | 运行时自指：`cordis_inspect` / `cordis_define` / `cordis_run` / `cordis_stop`，模型可以写插件并挂载（vm 沙箱 + 浏览器半区热投递） |

最后一条值得单独念一遍：**模型可以在运行时给自己装插件**。`cordis` preset（创造模式）就是为此准备的。安全边界由 host-runner 的 vm 沙箱和审批闸门共同守住。

## 与 Pi 对照

| 话题 | Pi | DSH |
| --- | --- | --- |
| 循环实现 | `runAgentLoop`，核心包可读 | `ReactLoopAgent`，包 README 自述"唯一具体实现" |
| 运行中插话 | `steer()` / `followUp()` | 收件箱三原语 + 事件先行 |
| 工具拦截 | 扩展 `tool_call` hook | pre-execute 门 + fail-closed 审批 |
| 上下文膨胀 | 压缩摘要 entry | Code Mode + 结果裁剪 + 压缩（三层） |
| 模型自扩展 | 扩展由人写 | 模型可运行时写插件（vm 沙箱） |

下一步：[事件溯源会话与两层压缩](/agents/dsh/session-and-compaction)，看这一切怎么被记录、被延续。

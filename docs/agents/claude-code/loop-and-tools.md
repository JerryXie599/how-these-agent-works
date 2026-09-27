# Agent Loop 与工具系统

把 Claude Code 的架构图放大到循环这一层，你会看到与 pi 的 `runAgentLoop` 相同的形状：**准备上下文 → 请求模型 → 处理工具 → 回写 → 继续或停止**。本章讲这条链路上每一步发生什么，以及工具系统怎么组织。

## 一次请求的完整链路

![一次请求的完整链路 流程图](/diagrams/agents-claude-code-loop-and-tools-1.png)

几个值得注意的细节：

- **模型是被"喂"着走的**。每轮回写 tool result 后重新请求模型，模型可以选择继续请求工具（循环继续）或输出文本结束本轮。这与 pi 的 `agentLoop` 完全同构。
- **拒绝也是合法结果**。权限拒绝不会中断会话，拒绝原因作为 tool result 回写，模型会换一种方式重试或询问用户。
- **Stop hook 是回合边界**。模型停止响应时触发 `Stop` hook，这是用户做自动检查或强制继续的挂点。

## 工具清单：循环的手脚

Claude Code 的内置工具集随版本演进，以下是当前的核心成员（按用途分组）：

| 分组 | 工具 | 说明 |
| --- | --- | --- |
| 读文件 | `Read` · `Glob` · `Grep` | 读图片/PDF、按模式找文件、内容搜索 |
| 改文件 | `Write` · `Edit` · `NotebookEdit` | 精确字符串替换式编辑，而非整文件重写 |
| 执行 | `Bash` | 持久 shell，支持后台运行与输出摘取 |
| 检索 | `WebFetch` · `WebSearch` | 抓取与搜索，受域名权限规则约束 |
| 编排 | `Agent`（Task） | 委派子代理，独立上下文窗口 |
| 规划 | `TodoWrite` · `EnterPlanMode` / `ExitPlanMode` | 任务清单与计划模式切换 |
| 交互 | `AskUserQuestion` | 把选择题抛给用户 |
| 技能 | `Skill` | 调用已安装的 Agent Skills |

三条设计观察：

1. **Edit 是"精确替换"不是"重写文件"**。模型必须先 `Read` 拿到旧字符串，再提交替换。这天然形成"先读后写"的保护，与 DSH 的版本守卫写异曲同工。
2. **Bash 是持久会话**。`shell-snapshots/` 在启动时捕获你的别名与函数，让每条命令都在熟悉的环境里执行；长命令可转后台，用 `BashOutput` 摘取输出。
3. **工具集可被外部扩展**。MCP 服务器带来的工具以 `mcp__<server>__<tool>` 命名进入同一张表，见[子代理、MCP 与扩展](/agents/claude-code/subagents-and-mcp)。

## 工具执行的三层包装

一次工具调用从模型提出到结果回写，要经过三层包装：

![工具执行的三层包装 流程图](/diagrams/agents-claude-code-loop-and-tools-2.png)

| 层 | 谁负责 | 能做什么 |
| --- | --- | --- |
| 拦截层 | PreToolUse hook | 匹配工具名，改参数、拒绝（exit 2）或放行 |
| 决策层 | 权限系统 | 按规则与模式决定 allow / ask / deny，可弹出确认框 |
| 执行层 | 工具本体 | 真正的副作用，超时与输出截断在这里处理 |
| 审计层 | PostToolUse hook | 看到执行结果，可格式化、脱敏、触发自动检查 |

Pi 的对应物是扩展的 `tool_call` / `tool_result` hook——单个拦截点。Claude Code 把它拆成了**拦截、决策、审计三段**，中间插入了完整的权限规则引擎。这是"个人工具"与"企业可用产品"的分野：后者必须回答"谁批准了这个操作"。

## 并行与串行

模型可以在一条消息里请求多个工具调用。Claude Code 会判断哪些调用可以并行（例如读几个文件），哪些必须串行（例如同一文件的两次编辑），并在整批完成后触发 `PostToolBatch` hook。并行执行的结果按请求顺序回写，保证上下文一致性。

## 与 Pi 对照

| 话题 | Pi | Claude Code |
| --- | --- | --- |
| 循环实现 | `runAgentLoop`（可读源码） | 引擎内置（行为观察） |
| 工具定义 | 统一 schema，`pi-ai` 抹平 | 内置固定集 + MCP 动态注册 |
| 拦截点 | 扩展 `tool_call` hook | PreToolUse + 权限系统 + PostToolUse 三层 |
| 拒绝语义 | hook 返回拒绝信息 | 拒绝原因回写，模型自行调整 |
| 并行工具 | 支持并行执行 | 支持，批量完成后有 PostToolBatch hook |

下一步去[权限模式与 Hooks](/agents/claude-code/permission-and-hooks)把中间那层"决策"拆开。

# Claude Code 总体架构

Claude Code 的架构可以用一句话概括：**一个引擎，多端入口，两道闸门，一份磁盘状态**。这句话展开就是本章的交互架构图。

<ArchifyEmbed src="/archify/claude-code-architecture.html" title="Claude Code 总体架构（Archify 交互图）" />

## 引擎与入口

引擎是一个查询循环（query loop）：接收用户消息，组装上下文，流式请求 Anthropic Messages API，处理模型返回的 `tool_use` 块，回写结果，直到模型不再请求工具。循环本身不复杂——复杂的是它周围的一切。

| 组件 | 职责 | 关键事实 |
| --- | --- | --- |
| 多端入口 | CLI、VS Code/JetBrains、Desktop/Web、Agent SDK | 共享同一引擎、同一份设置与会话 |
| Agent Loop | 查询循环与状态维护 | 单一上下文窗口，流式处理 |
| Anthropic API | 模型调用 | Messages API，流式返回文本与 `tool_use` 块 |
| 上下文与记忆 | CLAUDE.md、auto memory 注入 | 每次会话启动时读取 |
| 子代理 | Task 工具委派 | 独立上下文窗口，单独的 transcript |

## 两道闸门：Hooks 与权限

架构图下方那排红色节点是本章的重点：**每一个副作用都要按固定顺序过闸门**。

![两道闸门：Hooks 与权限 流程图](/diagrams/agents-claude-code-architecture-1.png)

这个顺序是固定的：**PreToolUse hook → 权限决策 → 执行 → PostToolUse hook**。hook 的 exit code 2 可以一票否决任何工具调用；权限规则按 deny → ask → allow 求值，先匹配先赢。细节在[权限模式与 Hooks](/agents/claude-code/permission-and-hooks)展开。

## 磁盘状态：~/.claude

Claude Code 把几乎所有状态明文放在 `~/.claude/`（可用 `CLAUDE_CONFIG_DIR` 重定向）：

| 路径 | 内容 |
| --- | --- |
| `projects/<项目 slug>/<session>.jsonl` | 完整会话记录：每条消息、每次工具调用与结果 |
| `projects/<项目 slug>/<session>/subagents/` | 子代理各自的 transcript |
| `projects/<项目 slug>/<session>/tool-results/` | 超大工具输出落盘，避免撑爆上下文 |
| `projects/<项目 slug>/memory/` | auto memory：`MEMORY.md` 索引 + 主题文件 |
| `file-history/<session>/` | 编辑前快照，检查点回退用（保留最近 100 个） |
| `shell-snapshots/` | 启动时捕获的 shell 别名与函数，供 Bash 工具复现环境 |
| `history.jsonl` | 你敲过的每一条 prompt（上箭头召回、Ctrl+R 搜索） |
| `settings.json` 等五个文件 | 分层设置，另有 `~/.claude.json` 存登录态与项目信任 |

对比 pi 的 `.pi/` 目录和 JSONL 会话树，两者的共同选择是：**JSONL 明文记录一切，会话可以离开 UI 独立存在**。差异是 pi 的会话是树（可分支），Claude Code 的会话是线性记录加检查点回退。

## 与 Pi 三层架构对照

| Pi | Claude Code | 备注 |
| --- | --- | --- |
| `pi-ai` 模型协议层 | （未拆出）引擎直连 Anthropic API | 只服务一家供应商，不需要抹平层 |
| `pi-agent-core` Agent Loop | 查询引擎 | 同一个循环形状 |
| `pi-coding-agent` 产品层 | 入口 + 闸门 + 存储全部产品能力 | Claude Code 的产品层最重 |
| `ResourceLoader` 装配 `.pi/` | CLAUDE.md + auto memory + Skills 装配 | 详见[上下文与记忆](/agents/claude-code/context-and-memory) |
| 扩展 hooks | Hooks + 权限系统 | Claude Code 把拦截做成了三级流水线 |

Pi 为了支持多供应商，把"抹平差异"独立成一层；Claude Code 只服务自家 API，省掉这一层，把省下的复杂度花在了权限与上下文上。**没有对错，只有取舍**。

## 学习路径上的下一步

- 想看循环里每一步发生了什么 → [Agent Loop 与工具系统](/agents/claude-code/loop-and-tools)
- 想深挖闸门 → [权限模式与 Hooks](/agents/claude-code/permission-and-hooks)
- 想理解长会话为什么不崩 → [上下文、记忆与压缩](/agents/claude-code/context-and-memory)

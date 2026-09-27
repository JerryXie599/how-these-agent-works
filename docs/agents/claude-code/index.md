# Claude Code 是什么

Claude Code 是 Anthropic 官方的 agentic coding tool：它能读你的代码库、编辑文件、执行命令，并与你的开发工具链集成。与我们重点拆解的 pi 相比，它是**闭源**的——但这不妨碍我们认真拆解它，因为它的权限设计、上下文工程和子代理编排是目前产品化 Agent 里最完整的参考实现。

::: tip 资料来源声明
Claude Code 不公开源码。本章所有结论来自三类可靠来源：Anthropic 官方文档（code.claude.com/docs，2026-09 核对）、官方博客，以及可直接观察的磁盘行为（`~/.claude/` 目录）。涉及推断的地方会明确标注。
:::

## 一个引擎，多个入口

Claude Code 最容易被误解的地方，是把它当成"一个终端工具"。实际上终端 CLI 只是入口之一：

| 入口 | 形态 | 说明 |
| --- | --- | --- |
| Terminal CLI | Node.js + Ink 的终端 UI | 最经典的 `claude` 命令 |
| VS Code / JetBrains 扩展 | IDE 内嵌面板 | 与 CLI 共享设置和会话 |
| Desktop / Web | 独立应用与网页端 | 支持并行跑多个后台会话 |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` | 把同一个引擎嵌入你自己的程序，headless 运行 |

所有入口连接的是**同一个引擎**：设置、CLAUDE.md、MCP 服务器、会话历史都是共享的。这一点和 pi 的思路一致——UI 是引擎的一层皮，而不是引擎本身。

## 心智模型：先记住三个东西

在读后面的章节之前，先建立三个最小心智模型：

1. **权限闸门是产品核心**。Claude Code 有六种权限模式、一套 allow/ask/deny 规则语法和一整套 hooks 事件，全部围绕一个问题：模型提出的每个副作用，由谁在什么条件下放行。
2. **上下文是稀缺资源，被精细管理**。CLAUDE.md、auto memory、技能、自动压缩、检查点——它用了几乎所有已知手段来保证长会话不崩。
3. **会话是 JSONL，一切可回放**。`~/.claude/projects/` 下每条会话是一个 JSONL 文件，记录每条消息、每次工具调用与结果，可恢复、可分叉、可回退检查点。

## 与 Pi 的第一眼对照

| | Pi | Claude Code |
| --- | --- | --- |
| 架构 | 三层分包，核心循环独立成包 | 一个引擎，多端入口共享 |
| 源码 | 开源 monorepo | 闭源，行为驱动拆解 |
| 扩展 | `.pi/` 扩展 + hooks | Skills · 插件 · MCP · Hooks |
| 权限 | 扩展 `tool_call` hook 拦截 | 权限模式 × 规则语法 × hooks 三层 |
| 会话 | JSONL entry **树**（可分支） | JSONL 记录 + 检查点回退 |
| 适合谁 | 想读懂源码、自己实现一个 | 想理解产品级 Agent 的完整形态 |

两者的循环本质相同——这正是[总览页](/agents/)说的"同一个循环"。差异集中在**工程化包装**：Claude Code 把权限和上下文管理做到了极高的完成度。

## 本章节怎么读

| 顺序 | 页面 | 读完你会知道 |
| --- | --- | --- |
| 1 | [总体架构](/agents/claude-code/architecture) | 引擎、入口、闸门、存储如何组成一张图 |
| 2 | [Agent Loop 与工具系统](/agents/claude-code/loop-and-tools) | 一次请求的完整链路，工具清单怎么长出来的 |
| 3 | [权限模式与 Hooks](/agents/claude-code/permission-and-hooks) | 六种模式、规则语法、hook 事件与 exit 2 语义 |
| 4 | [上下文、记忆与压缩](/agents/claude-code/context-and-memory) | CLAUDE.md、auto memory、压缩与检查点怎么协作 |
| 5 | [子代理、MCP 与扩展](/agents/claude-code/subagents-and-mcp) | Task 委派、MCP 工具命名、Skills 与插件体系 |

如果你已经读完 pi 的[核心概念](/concepts/what-is-agent)，建议把每节末尾的「与 Pi 对照」表当作主线——同样的循环，看 Anthropic 的工程选择有什么不同。

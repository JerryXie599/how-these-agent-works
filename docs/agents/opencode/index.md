# opencode 是什么

opencode 是一个开源的 AI coding agent（仓库 [anomalyco/opencode](https://github.com/anomalyco/opencode)，MIT 许可）。它和我们前面拆的 pi、Claude Code、DSH 最大的不同，用一句话就能说清：

> **opencode 把 server 做成了系统的中心：终端 TUI、桌面端、IDE 插件、编辑器协议，全部只是这台 server 的客户端。**

::: tip 版本与资料来源
本章按 **opencode 1.18.32**（2026-09-24 克隆的快照）核对，全部结论来自源码与仓库内设计文档（`specs/v2/*`、`CONTEXT.md`、`AGENTS.md`）。快照里同时存在 **V1 生产运行时**与 **V2 Effect-native 重写**两套实现，本章会明确区分。
:::

## 技术栈一眼看

| 项 | 事实 |
| --- | --- |
| 语言/运行时 | 全栈 TypeScript，Bun 1.3.14 workspaces + Turbo |
| 核心抽象 | Effect 4（Service / Layer / Schema / Stream） |
| HTTP 层 | Effect `HttpApi`，路由反射生成客户端 SDK |
| TUI | TypeScript + SolidJS + OpenTUI（不是 Go——那是更早的历史实现） |
| 桌面端 | Electron 壳，内置 spawn 一个 server sidecar |
| 存储 | SQLite + Drizzle（`~/.local/share/opencode/opencode.db`） |
| LLM 接入 | models.dev 模型目录 + Vercel AI SDK + 自研协议适配层 |

## 心智模型：一个 server，多种入口

![心智模型：一个 server，多种入口 流程图](/diagrams/agents-opencode-index-1.png)

`Server.Default()` 本身就是一个 `fetch` 函数——"监听端口"只是它的可选外壳。因此：

- **TUI 默认进程内嵌入**：TUI 跑在 worker 里，用 RPC 把请求直接交给同进程的 server，不开端口；
- **`opencode serve`** 让它变成可被网络访问的独立服务；
- **`opencode attach`** 让另一个终端连上远端 server。

三种形态下的请求行为完全一致——这是 opencode 架构最值得学的一手。

## 心智模型之外：内置双 agent

opencode 出厂自带 **build**（全权限，负责改代码）与 **plan**（只读，负责出计划）两个主 agent，外加 **general**、**explore** 两个子代理，以及 `compaction` / `title` / `summary` 三个隐藏 agent。每个 agent 携带**自己的一套权限 Ruleset**——这是它最有辨识度的设计，详见[权限与 Agents](/agents/opencode/permission-and-agents)。

## 与其它三个 Agent 第一眼对照

| | Pi | Claude Code | DSH | opencode |
| --- | --- | --- | --- | --- |
| 架构中心 | 小核心 + 扩展 | 引擎 + 闸门 | cordis 插件树 | **可嵌入的 server** |
| 客户端 | TUI / RPC / print | CLI / IDE / Web | 浏览器 / headless | TUI / Desktop / IDE / ACP |
| 通信 | 进程内 | 多端共享引擎 | HTTP↑ WS↓ | **HTTP + SSE，本地退化为 RPC** |
| 会话存储 | JSONL 树 | JSONL + 检查点 | 事件溯源 .zstd | **SQLite** |
| 权限 | 扩展 hook | 六模式 + 规则 | fail-closed 审批 | 每 agent 一套 Ruleset |
| 技术栈 | TypeScript | 闭源 | cordis/TS | Bun + Effect + Solid |

## 本章节怎么读

| 顺序 | 页面 | 读完你会知道 |
| --- | --- | --- |
| 1 | [总体架构](/agents/opencode/architecture) | server / 协议 / 包分层怎么组织 |
| 2 | [Agent 循环与工具系统](/agents/opencode/loop-and-tools) | V1 主循环、V2 运行器、工具清单与并发 |
| 3 | [权限与 Agents](/agents/opencode/permission-and-agents) | 每 agent 一套 Ruleset，ask/allow/deny 怎么求值 |
| 4 | [会话、上下文与快照](/agents/opencode/context-and-sessions) | SQLite 表结构、压缩摘要、Context Epoch、revert |
| 5 | [扩展机制](/agents/opencode/extendability) | 自定义 agent/command/tool/plugin/MCP/LSP |

如果你是按顺序读到这里的，建议带着一个问题读：**"把 server 放在中心"这个选择，让哪些设计变简单了，又让哪些变复杂了？**
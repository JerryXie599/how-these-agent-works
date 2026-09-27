# opencode 总体架构

opencode 的架构可以用一句话概括：**一个可嵌入的 server，一套反射生成的 SDK，一堆只做客户端的 UI**。先看交互架构图，再逐层拆。

<ArchifyEmbed src="/archify/opencode-architecture.html" title="opencode 总体架构（Archify 交互图）" />

## 包分层：一条被明文规定的依赖方向

仓库的 `AGENTS.md` 用一句话规定了依赖方向：

> runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol but **never Core or Server**.

![包分层：一条被明文规定的依赖方向 流程图](/diagrams/agents-opencode-architecture-1.png)

| 包 | 职责 |
| --- | --- |
| `schema` | 跨端共享的纯记录与品牌 ID，禁止加载数据库与原生模块 |
| `protocol` | `HttpApi` 的路径、分组、错误、游标定义 |
| `server` | 路由实现、鉴权、CORS、PTY 环境 |
| `client` | 由 `HttpApi` 反射生成的两套客户端（Promise 与 `/effect`） |
| `core` | V2 领域内核：会话、工具注册表、System Context、快照、权限 |
| `llm` | 供应商无关协议适配（anthropic-messages / openai-chat / gemini / bedrock-converse…） |
| `tui` | 终端 UI（SolidJS + OpenTUI），通过 SDK 访问 server |

`client` 由 `HttpApi` **反射生成**是这套分层的关键：加一个端点，SDK 自动就有对应方法——TUI 规范里明文要求「TUI 只依赖 SDK，缺数据就去 server 加端点，而不是 import 后端实现」。这跟 pi 用 `pi-ai` 隔离供应商差异是同一思路，隔离的维度不同。

## 通信协议：HTTP + SSE，本地退化为进程内 RPC

| 通道 | 协议 | 用途 |
| --- | --- | --- |
| 命令/查询 | HTTP JSON | `/session/:id/messages`、`/permission/:id/reply` 等 |
| 实例级事件 | SSE `GET /event` | 全实例的实时事件流 |
| 会话级重放 | SSE `sessions.events({after})` | 带游标的可重放事件（断线续传基础） |
| 本地嵌入 | 进程内 RPC | TUI 默认形态：`Rpc.emit("global.event")` 直连 `Server.Default().fetch` |
| WebSocket | 仅生命周期管理 | 服务关闭时统一 close，不是主数据通道 |
| 编辑器 | ACP（Agent Client Protocol） | `opencode acp`，VS Code 等编辑器按协议接入 |

TUI 侧的实现：订阅 SDK 的事件流，做 **16ms 批处理 + 1s→30s 指数退避重连**，注释写明是为了「让所有 store 更新合并成一次渲染」。这是 HTTP/SSE 架构下把前端做流畅的标准手法。

## V1 与 V2：双轨演进的快照

这份快照里同时存在两套会话实现，读源码前必须知道：

| | V1（生产路径） | V2（重写目标） |
| --- | --- | --- |
| 代码位置 | `packages/opencode/src/session/` | `packages/core/src/session/` |
| 循环实现 | `prompt.ts` 的 `runLoop`（单体） | `runner/llm.ts`（Effect-native，契约注释 40+ 行） |
| 设计文档 | 行为即文档 | `specs/v2/session.md` 等，含 parity 清单 |
| 状态 | 用户实际在用 | 部分能力 parity 为 partial/missing |

仓库里的 `specs/v2/session.md` 有一张「V1 对齐清单」，逐项标注 `complete / partial / missing`——**这是判断"哪些是已实现、哪些是规划"的权威依据**，教程后续章节提到 V2 时会明确标注。

## 与 Pi 三层架构对照

| 话题 | Pi | opencode |
| --- | --- | --- |
| 供应商隔离 | `pi-ai` 统一消息协议 | `llm` 包 + models.dev 目录 + AI SDK |
| 核心循环 | `pi-agent-core` 独立包 | V1 在 `opencode` 包内，V2 在 `core` 包 |
| 产品层 | TUI + RPC + SDK | **server + 反射 SDK + 多端客户端** |
| 扩展装配 | `.pi/` ResourceLoader | 配置发现 + plugin/MCP/LSP |
| 前后端边界 | 进程内 | 明确的服务边界（可拆可嵌） |

pi 的边界画在"供应商 vs 核心"；opencode 的边界画在"服务端 vs 客户端"——前者为多模型，后者为多入口。

下一步：[Agent 循环与工具系统](/agents/opencode/loop-and-tools)。
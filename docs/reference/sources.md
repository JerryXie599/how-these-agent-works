# 资料来源

本教程基于 Pi 官方文档、GitHub 源码和本仓库中的教学实现整理。内容经过重新组织，目标是教学，不是逐字源码翻译。

## 官方文档

| 资料 | 用途 |
| --- | --- |
| [Pi Documentation](https://pi.dev/docs/latest) | 总体定位、安装、文档导航 |
| [SDK](https://pi.dev/docs/latest/sdk) | `createAgentSession`、`AgentSession`、事件、SDK 用法 |
| [Sessions](https://pi.dev/docs/latest/sessions) | 会话保存、树导航、分支、命名、fork/clone |
| [Session File Format](https://pi.dev/docs/latest/session-format) | JSONL 格式、entry 类型、`id` / `parentId` 树结构 |
| [Compaction](https://pi.dev/docs/latest/compaction) | 上下文压缩、branch summary、cut point 规则 |
| [Extensions](https://pi.dev/docs/latest/extensions) | 扩展、工具注册、事件 hook、命令、UI 能力 |
| [RPC Mode](https://pi.dev/docs/latest/rpc) | RPC / UI 集成时的事件订阅和外部前端通信参考 |
| [Skills](https://pi.dev/docs/latest/skills) | 技能发现、按需加载、`SKILL.md` 结构 |
| [Prompt Templates](https://pi.dev/docs/latest/prompt-templates) | 区分 prompt template、skill、context file 的职责 |
| [Xiaomi MiMo First API Call](https://platform.xiaomimimo.com/docs/zh-CN/quick-start/first-api-call) | 可选真实模型 Demo 的 OpenAI-compatible 调用方式 |
| [Xiaomi MiMo Model and Rate Limit](https://platform.xiaomimimo.com/docs/zh-CN/quick-start/model) | 可选真实模型 Demo 的模型名、函数调用和上下文窗口信息 |

## GitHub 源码

| 源码 | 教程中对应内容 |
| --- | --- |
| [earendil-works/pi](https://github.com/earendil-works/pi) | Pi monorepo 总览 |
| `packages/ai/src/types.ts` | `Message`、`ToolCall`、`Context`、`TranscriptContext`、`AssistantMessageEvent` |
| `packages/ai/src/models.ts` | `Models.stream()` / `streamSimple()` / `complete()` 统一模型调用入口 |
| `packages/ai/src/api/*` | 各家 API 的请求适配器（`openai-responses`、`anthropic-messages`、`google-generative-ai` 等） |
| `packages/ai/src/providers/*` | provider 定义与模型目录（`openai.ts`、`anthropic.ts`、`openai.models.ts` 等） |
| `packages/ai/src/legacy-api-aliases.ts` | 旧版顶层 `streamSimple` 的 deprecated 别名 |
| `packages/agent/src/types.ts` | `AgentTool`、`AgentEvent`、`AgentLoopConfig` |
| `packages/agent/src/agent-loop.ts` | Agent Loop、工具执行、stream assistant response、`prepareRequest` / `finishTurn` |
| `packages/agent/src/agent.ts` | Agent 状态、队列、订阅和生命周期 |
| `packages/agent/src/harness/` | 新一代 `AgentHarness`：lane-based 会话（v4 JSONL）、内置工具、压缩、技能、prompt templates |
| `packages/coding-agent/src/core/agent-session.ts` | session prompt 链路、扩展 hook、压缩、模型管理 |
| `packages/coding-agent/src/core/agent-session-runtime.ts` | new/resume/fork/import 等运行时重建 |
| `packages/coding-agent/src/core/session-manager.ts` | JSONL 会话（v3）、树结构、上下文构建、`appendContextEdit` |
| `packages/coding-agent/src/core/resource-loader.ts` | 扩展、技能、prompt、上下文文件加载 |
| `packages/coding-agent/src/core/system-prompt.ts` | 系统提示词构造 |
| `packages/coding-agent/src/core/extensions/types.ts` | 扩展 API、事件、工具、上下文类型 |
| `packages/coding-agent/src/core/extensions/runner.ts` | 扩展事件分发和结果合并 |
| `packages/coding-agent/src/core/tools/` | 内置 read/bash/edit/write/grep/find/ls 工具 |
| `packages/coding-agent/src/core/compaction/` | compaction、branch summary、文件操作追踪 |

## 本教程中的实现

| 目录 | 说明 |
| --- | --- |
| `examples/demos/` | 四个核心渐进式小 Demo + 一个可选真模型烟测 Demo |
| `examples/teaching-agent/` | React + Node 教学版目标项目 |

## 阅读建议

先读教程，再读源码。直接从 Pi 源码入口读起，容易被扩展、TUI、模型供应商兼容性淹没。先在教学版里把核心闭环跑通，再回到真实源码，很多“复杂”会变成“必要的工程化边界”。

## 本轮核对过的官方信息

| 官方信息 | 教程中如何使用 |
| --- | --- |
| Pi 官方文档说明 Pi 是小核心、通过 TypeScript extensions、skills、prompt templates、themes 和 packages 扩展 | 用来解释为什么本教程把核心 loop 和产品能力分开讲 |
| SDK 文档列出 `createAgentSession()`、`AgentSession`、事件、工具、ResourceLoader、会话管理 | 用来组织 `AgentSession` 运行层和源码阅读地图 |
| Extensions 文档覆盖工具、命令、事件和 UI 扩展 | 用来解释 before/after tool hook 与扩展点 |
| Session Format 文档说明 JSONL session file、entry 类型和树结构 | 用来讲 `id` / `parentId` / `leafId` 与 compaction entry |
| Compaction 文档说明 auto-compaction 与 branch summarization 的触发和结构 | 用来补齐会话格式与压缩链路章节 |
| Xiaomi MiMo 文档说明 OpenAI-compatible `/chat/completions`、`api-key` header 和 `mimo-v2.5-pro` | 用来新增可选 Demo 5，但不把真实 key 写入仓库 |
| Pi SDK 和 `pi-ai` 源码边界说明模型调用、事件、工具和会话职责分层 | 用来补充 OpenAI-compatible adapter 教学链路 |

## 最近核对记录

- 2026-09-24：pi 上游更新到 **v0.87.1**（本地参考目录已同步，`main` = `b45597504`，包版本 `@earendil-works/pi-ai@0.87.1`）。本次只同步版本与相关变化，**未逐页复核**：教程常引用的四个核心文件里，`packages/ai/src/types.ts` 变化最大——模型被拆成三个家族（新增 `BaseModel` / `ModelTypeMap` / `ModelType` / `AnyModel`，`ImagesApi`→`ImageApi`、`ImagesModel`→`ImageModel`，并新增结构化分类模型 `classify()` 一族），请求选项新增 `onProviderStreamEvent` 调试钩子（`AgentOptions` 也透传了它）；`packages/agent/src/agent.ts` 只是新增该钩子的透传，`agent-loop.ts` 与 `agent/types.ts` 无改动。

- 2026-09-22：按 Pi **v0.87.0**（`main` 分支最新）重新核对源码。参考目录为 `/Users/jerry/CTFmac/培训/第五周/pi`，确认包名与版本为 `@earendil-works/pi-ai@0.87.0`、`@earendil-works/pi-agent-core@0.87.0`、`@earendil-works/pi-coding-agent@0.87.0`、`@earendil-works/pi-tui@0.87.0`。
- 2026-09-22：主要差异——`stream.ts` → `models.ts` + `api/`；顶层 `streamSimple` 变 deprecated 别名；`pi-agent-core` 新增 `harness/`（v2 API、v4 lane-based 会话）；`shouldStopAfterTurn` → `finishTurn`；新增 `context_edit` entry、`context_with_system` 扩展事件、按模型压缩预算、零保留压缩。
- 2026-05-26：重新核对官方 Docs、SDK、Extensions、Session Format、Compaction、Skills 和 GitHub 仓库页面。
- 2026-05-26：本地源码参考目录为 `/tmp/pi-source`，确认包名与版本为 `@earendil-works/pi-ai`、`@earendil-works/pi-agent-core`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`。

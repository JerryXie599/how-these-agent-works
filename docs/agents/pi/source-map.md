# 源码拆解


读 Pi 源码最容易卡住的地方，不是某个函数太难，而是入口太多：CLI、TUI、SDK、RPC、扩展、工具、模型供应商都在同一个 monorepo 里。正确读法是先找“稳定骨架”，再看产品层怎么把骨架包装成可用工具。

::: tip 版本对照
本文按 **Pi v0.87.0**（2026-09-22）核对。相比教程最初写作时的 v0.78.0，源码有几处关键移动，但下面的“稳定骨架”仍然成立（2026-09-24 注：pi 上游已发布 v0.87.1，本地参考目录已同步；本页尚未逐页复核到 v0.87.1，与教程相关的变化记在《来源与核对记录》）：

- 模型入口从 `packages/ai/src/stream.ts` 移到 `packages/ai/src/models.ts`（`Models.stream()` / `Models.streamSimple()`）；每家 API 的请求适配器落在 `packages/ai/src/api/*`，旧的顶层 `streamSimple` 保留在 `packages/ai/src/legacy-api-aliases.ts` 并标记 deprecated。
- `packages/ai/src/providers/` 现在主要负责 provider 与模型目录定义，真正的“供应商差异抹平”在 `packages/ai/src/api/`。
- `pi-agent-core` 新增 `packages/agent/src/harness/`：新一代 `AgentHarness`（v2 API，lane-based 会话、耐久执行、内置工具、压缩），自 v0.84.0 起成为该包默认导出；`pi-coding-agent` 的核心仍运行在 `AgentSession` + `SessionManager` 上。
:::

## 先看哪一层

[![先看哪一层 流程图](/diagrams/source-source-map-1.png)](/diagrams/source-source-map-1.png)

这个顺序的好处是，你先理解“消息和事件长什么样”，再看 loop 怎么消费它们，最后才进入会话、扩展、TUI 这些产品复杂度。

本教程把这条路线拆成五个源码页：

| 顺序 | 页面 | 读完应该得到什么 |
| --- | --- | --- |
| 1 | [pi-ai 模型协议层](/source/model-protocol) | 为什么 provider 差异不能泄漏到 Agent Loop |
| 2 | [Agent Loop 主循环](/source/agent-loop) | 模型请求、工具执行、工具结果回写的最小闭环 |
| 3 | [工具、扩展与资源加载](/source/tools-extensions) | 工具能力、扩展插槽和启动资源如何装配 |
| 4 | [AgentSession 运行层](/source/agent-session) | `prompt()` preflight、持久化、runtime 重建 |
| 5 | [会话格式与压缩链路](/source/session-compaction) | JSONL 树、compaction、branch summary 如何工作 |
| 6 | [进阶压缩边界](/source/advanced-compaction) | `reserveTokens`、turn boundary、split turn 和重复压缩为什么必要 |

## 三个包的边界

| 包 | 先读文件 | 读懂后你应该能回答 |
| --- | --- | --- |
| `pi-ai` | `src/types.ts`、`src/models.ts`（`Models.stream`）与 `src/api/` | 模型调用统一成了哪些消息、事件、工具协议？ |
| `pi-agent-core` | `src/types.ts`、`src/agent-loop.ts`、`src/agent.ts` | Agent 如何一轮轮请求模型、执行工具、维护状态？ |
| `pi-coding-agent` | `src/core/sdk.ts`、`src/core/agent-session.ts`、`src/core/session-manager.ts` | 一个纯 loop 如何变成有会话、扩展、压缩和工具的产品？ |

Pi 官方文档也按相近维度组织：总览强调 Pi 是一个小核心、靠扩展和技能成长的 terminal coding harness；SDK 文档把 `createAgentSession()`、`AgentSession`、事件、工具、ResourceLoader 列为编程入口；Session Format 文档解释 JSONL 会话和树结构。

## 一条主线读到底

建议第一次阅读只追一条路径：用户输入一句话，到磁盘里出现一条 session message。

[![一条主线读到底 流程图](/diagrams/source-source-map-2.png)](/diagrams/source-source-map-2.png)

先不要追所有扩展 hook。等这条主线通了，再回头看每个 hook 插在哪里。

## 第二遍再读扩展点

扩展系统很强，但它不是 Agent 的第一性原理。第二遍可以按“扩展能拦在哪里”来读：

| 扩展点 | 所在阶段 | 作用 |
| --- | --- | --- |
| `input` | `AgentSession.prompt()` 前 | 改写或接管用户输入 |
| `before_agent_start` | 构造消息后、调用 Agent 前 | 注入 custom message 或修改 system prompt |
| `context` | 模型请求前、构建上下文时 | 过滤、切片、改写发给模型的消息（不包含 system prompt 与工具声明，Pi 会在之后自动恢复） |
| `context_with_system` | 模型请求前 | 对包含 system message 的完整 transcript 做逐请求变换，结果原样发送（v0.87 新增） |
| `before_provider_request` | 请求模型前 | 修改 provider payload |
| `tool_call` | 工具执行前 | 审批、拦截、改参数 |
| `tool_result` | 工具执行后 | 脱敏、截断、改结果 |
| `turn_end` / `agent_before_settle` | 一轮结束 / 会话落定前 | 持久化结构性 entry，或要求再发起一次模型请求（v0.87 起成为可行动边界） |
| `session_before_compact` | 压缩前 | 自定义压缩策略 |

这些扩展点解释了为什么 Pi 的核心 loop 不需要知道所有产品需求：产品需求被挂在运行层和 hook 上。

## 常见读源码误区

| 误区 | 会卡在哪里 | 建议 |
| --- | --- | --- |
| 从 TUI 组件开始读 | UI 状态很多，看不见 Agent 主线 | 先读 `packages/agent` |
| 从模型 provider 开始读 | 各家 API 差异太多 | 先读 `pi-ai/src/types.ts` 的统一协议 |
| 只看 `AgentSession` | 会觉得它什么都做 | 先把 Agent/SessionManager/ResourceLoader 分开 |
| 忽略测试 | 看不到边界条件 | 对照 `packages/agent/test` 里的 loop 行为 |

## 和本教程的对应关系

| 本教程章节 | 对应源码 |
| --- | --- |
| Agent 到底是什么 | `packages/agent/src/agent-loop.ts` 的最小循环 |
| 消息、流式事件与状态 | `packages/ai/src/types.ts`、`packages/agent/src/types.ts` |
| 工具调用机制 | `executeToolCalls`、`prepareToolCall`、`finalizeExecutedToolCall` |
| 会话、树与分支 | `packages/coding-agent/src/core/session-manager.ts`（新一代见 `packages/agent/src/harness/session/`） |
| 上下文、技能与压缩 | `resource-loader.ts`、`system-prompt.ts`、`compaction/` |
| 教学版目标项目 | `examples/teaching-agent/src/server/agent/*` |

## 源码里的五个不变量

源码读到后面，文件会很多。你可以反复用这五个不变量校准自己有没有跑偏：

| 不变量 | 你应该在哪里看到 |
| --- | --- |
| 模型输入输出被统一成结构化消息和事件 | `pi-ai` |
| Agent Loop 不直接做产品 I/O | `pi-agent-core` |
| 工具副作用必须经过 schema、hook 和 tool result | `agent-loop.ts` 与 `tools/` |
| 会话不是数组，而是 JSONL entry tree | `session-manager.ts` |
| 长上下文用摘要 entry 承接，而不是删除历史 | `compaction/` |

读源码时只要发现某段代码在保护这些不变量，就先理解它“为什么存在”，再看它“具体怎么写”。


`@earendil-works/pi-ai` 是 Pi 里最容易被低估的一层。它不负责“让 Agent 更聪明”，而是负责一件更底层的事：把不同模型供应商的输入、输出、流式事件和工具调用整理成同一种协议。

如果没有这一层，Agent Loop 里会到处出现这样的分支：

```ts
if (provider === "anthropic") {
  // 解析 tool_use
} else if (provider === "openai-responses") {
  // 解析 function_call
} else if (provider === "google") {
  // 解析另一套结构
}
```

这会让核心 loop 很快失控。Pi 的思路是：供应商差异在 `pi-ai` 里解决，`pi-agent-core` 只消费统一后的消息和事件。

## 这一层解决什么问题

| 问题 | 如果没有协议层 | Pi 的做法 |
| --- | --- | --- |
| 工具调用结构不同 | Agent Loop 要理解每家 API | 统一成 `ToolCall` content block |
| 流式输出格式不同 | UI 和 loop 被 provider 细节污染 | 统一成 `AssistantMessageEvent` |
| token 用量字段不同 | 压缩逻辑拿不到稳定 usage | 统一成 `Usage` |
| 错误和中止表达不同 | 运行时难以恢复 | 统一成 `stopReason` 和错误消息 |
| thinking / cache / 图片能力差异 | 上层到处写兼容代码 | 由 model/provider capability 描述 |

## 核心类型关系

[![核心类型关系 流程图](/diagrams/source-model-protocol-1.png)](/diagrams/source-model-protocol-1.png)

可以把 `Context` 理解成模型请求的稳定输入。注意 v0.86 起 `systemPrompt` 变成可选：它是“leading system message”的简写，进入 provider 前会被 `normalizeContext()` 折叠成 transcript 里的 system message，并规范化为 `TranscriptContext`：

```ts
type Context = {
  systemPrompt?: string; // 可选，简写；normalizeContext() 会折叠进 messages
  messages: Message[];
  tools?: Tool[];
};
```

输出不是一个字符串，而是一条 `AssistantMessage`（v0.87 中它还携带 `api`、`provider`、`model`、`usage` 等元数据，便于 UI 和成本统计）：

```ts
type AssistantMessage = {
  role: "assistant";
  content: Array<TextContent | ThinkingContent | ToolCall>;
  api: Api;
  provider: ProviderId;
  model: string;
  stopReason: "pending" | "stop" | "length" | "toolUse" | "error" | "aborted" | "deferred";
  usage: Usage;
  timestamp: number;
};
```

这就是为什么本教程一直强调“消息不是字符串”。工具调用、thinking、错误、图片和 token 用量都需要结构化位置。

## 从 provider 到 Agent 的转换链路

[![从 provider 到 Agent 的转换链路 流程图](/diagrams/source-model-protocol-2.png)](/diagrams/source-model-protocol-2.png)

注意这个链路里有两个方向的转换：

| 方向 | 转换内容 |
| --- | --- |
| 出站 | Pi 的 `Message[]`、`Tool[]` 转成供应商请求体 |
| 入站 | 供应商事件转成 Pi 的 `AssistantMessageEvent` |

上层拿到的是统一事件，所以 `runAgentLoop` 不需要知道远端具体协议。

## 应该先读哪些源码

| 文件 | 阅读目标 |
| --- | --- |
| `packages/ai/src/types.ts` | `Message`、`Tool`、`Context`、`TranscriptContext`、`AssistantMessageEvent`、`Model` |
| `packages/ai/src/models.ts` | `Models` 类：`stream()` / `streamSimple()` / `complete()` 如何驱动 provider |
| `packages/ai/src/utils/transcript.ts` | `normalizeContext()` 如何把 `Context` 规范化为 `TranscriptContext` |
| `packages/ai/src/api/transform-messages.ts` | 消息如何转成供应商格式 |
| `packages/ai/src/api/openai-responses.ts` | 一个真实 API 适配器怎么处理工具和流式事件 |
| `packages/ai/src/api/anthropic-messages.ts` | 对比另一家的差异如何被抹平 |
| `packages/ai/src/api/lazy.ts` + `packages/ai/src/index.ts` | provider/api 如何注册和查找 |
| `packages/ai/src/providers/openai.ts` | provider 定义（模型目录、默认参数）长什么样 |

::: tip 版本说明
教程早期写作时读的 `packages/ai/src/stream.ts` 已经不存在。v0.80 前后 Pi 把模型入口收敛为 `Models` 类，并把每家 API 的请求适配器独立成 `packages/ai/src/api/*.ts`（懒加载版本为 `*.lazy.ts`）。顶层的 `streamSimple` / `completeSimple` 仍可从 `packages/ai/src/legacy-api-aliases.ts` 拿到，但已标记 deprecated，新代码请走 `Models.stream()` 或对应 API 模块的 `streamSimple`。
:::

第一次读时，不要陷进每家 API 的参数细节。先抓住三个不变量：

1. 上层只传 `Context`（进入 provider 前会先被 `normalizeContext()` 规范化）。
2. 下层只吐 `AssistantMessageEvent`。
3. 最终都能组装成 `AssistantMessage`。

## 和教学版 MockModel 的关系

教学版没有实现 `pi-ai`，而是用 `MockModel` 站在同一个位置上：

[![和教学版 MockModel 的关系 流程图](/diagrams/source-model-protocol-3.png)](/diagrams/source-model-protocol-3.png)

`MockModel` 的任务不是模拟某一家供应商，而是模拟协议层给 loop 的结果：

```ts
const assistant = await model.complete({
  systemPrompt,
  messages,
  tools
});
```

只要它返回的 `AssistantMessage` 结构不变，未来换成真实模型时，`runAgentLoop()` 就不需要重写。

## 常见误区

| 误区 | 为什么会出问题 |
| --- | --- |
| 直接让业务代码调用 OpenAI/Anthropic SDK | 后面每换一家模型都要改 Agent Loop |
| 把工具调用塞进文本里解析 | JSON 不稳定，模型输出稍微变形就炸 |
| 只保存最终文本，不保存 usage | 压缩和成本统计会失去依据 |
| 把 provider 错误直接 throw 到 UI | session、事件流和工具状态无法收尾 |

## 小练习

打开 `examples/teaching-agent/src/server/agent/mockModel.ts`，给 `complete()` 增加一个分支：当用户输入包含“写笔记”时返回 `write_note` 工具调用。你会发现只要返回结构符合 `AssistantMessage`，loop 不需要知道“模型为什么这么想”。


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


Pi 的会话系统看起来像“保存聊天记录”，实际承担的是 Agent 的长期记忆、树形探索、恢复、压缩和扩展持久化。

官方 Session Format 文档明确说明：session 是 JSONL，每一行有 `type` 字段，条目通过 `id` / `parentId` 形成树。这是 Pi 能在同一个文件里做原地分支的基础。

## JSONL 为什么适合 Agent

```text
{"type":"session","version":3,"id":"s1","cwd":"/repo"}
{"type":"message","id":"u1","parentId":null,"message":{"role":"user","content":"修复测试"}}
{"type":"message","id":"a1","parentId":"u1","message":{"role":"assistant","content":[]}}
{"type":"compaction","id":"c1","parentId":"a1","summary":"前面已经定位到...","firstKeptEntryId":"u8"}
```

JSONL 有几个工程上的好处：

| 好处 | 对 Agent 的意义 |
| --- | --- |
| append-only | 每条消息完成就能写入，崩溃损失小 |
| 每行独立 | 解析坏行、迁移版本、外部脚本处理都更简单 |
| 天然日志形态 | 适合记录 message、model_change、compaction、custom entry |
| 不强制线性 | 配合 `parentId` 可以表达树 |

## entry 类型不是装饰

Pi 的 session entry 不只包括消息。不同 entry 负责恢复不同维度的运行状态：

| entry | 解决的问题 |
| --- | --- |
| `message` | 构建后续 LLM 上下文 |
| `model_change` | 恢复当前模型选择 |
| `thinking_level_change` | 恢复 reasoning 设置 |
| `compaction` | 用摘要替代旧上下文 |
| `branch_summary` | 切换分支时携带离开分支的发现 |
| `context_edit` | v0.87 新增：对某条消息做“省略/替换”而不改写原始历史，用于编辑模型上下文 |
| `custom` | 扩展保存自己的状态 |
| `custom_message` | 扩展注入可进入上下文的消息 |
| `label` / `session_info` | UI 和会话管理信息 |

很多教学项目只保存 `role/content`，这对玩具聊天没问题，但一旦要恢复真实 Agent 行为，就会不够。

::: tip 版本说明
`packages/coding-agent/src/core/session-manager.ts` 里 `CURRENT_SESSION_VERSION = 3`，教程里“v3、`id`/`parentId` 树”的说法对当前主线仍然成立。下一代 `AgentHarness`（`packages/agent/src/harness/session/`）则升级为 v4 lane-based JSONL（`JsonlSessionRepo`，每个分支是一条 lane），并保留 `legacy-v3` 读取器来迁移旧文件。两种模型的学习主线一致：稳定 `id`、`parentId`、当前 leaf，append-only JSONL。
:::

## 从 leaf 构建上下文

构建上下文时，Pi 不是读取文件里的所有 message，而是从当前 `leafId` 沿 `parentId` 回到根，再反转。

[![从 leaf 构建上下文 流程图](/diagrams/source-session-compaction-1.png)](/diagrams/source-session-compaction-1.png)

如果当前 leaf 是 `a3`，上下文路径是 `u1 -> a1 -> u3 -> a3`。`u2 -> a2` 仍在文件里，但不属于当前分支。

伪代码如下：

```ts
function buildPath(leafId: string, entries: Map<string, Entry>) {
  const path: Entry[] = [];
  let current = entries.get(leafId);

  while (current) {
    path.unshift(current);
    current = current.parentId ? entries.get(current.parentId) : undefined;
  }

  return path;
}
```

## 压缩不是删除历史

上下文压缩经常被误解成“删掉旧消息”。Pi 的设计更像追加一条新的摘要 entry：

[![压缩不是删除历史 流程图](/diagrams/source-session-compaction-2.png)](/diagrams/source-session-compaction-2.png)

关键点有三个：

1. 原始历史仍在 JSONL 文件中。
2. 后续上下文使用摘要和最近消息。
3. 摘要 entry 记录 `firstKeptEntryId`，说明从哪里开始保留原文。

这让系统同时拥有“短上下文可继续工作”和“完整历史可审计/重建”两个能力。

## 什么时候压缩

Pi 的 compaction 逻辑会根据上下文 token 和模型窗口判断。核心条件可以简化成：

```ts
contextTokens > contextWindow - reserveTokens
```

默认策略会预留一段响应空间，再向前选择 cut point，并保留最近一段消息。保留最近消息非常重要，因为最新工具输出、错误日志和用户约束通常不能只靠摘要。

[![什么时候压缩 流程图](/diagrams/source-session-compaction-3.png)](/diagrams/source-session-compaction-3.png)

## branch summary 和 compaction 的区别

| 机制 | 触发 | 目的 |
| --- | --- | --- |
| Compaction | 上下文过长或用户 `/compact` | 减少当前分支的 token 占用 |
| Branch Summary | `/tree` 导航或切换分支 | 把离开分支的重要发现带到新分支 |

它们都用摘要，但解决的问题不同。压缩是在同一条路上“减重”，branch summary 是换路时“带经验”。

## 源码阅读路线

| 文件 | 看什么 |
| --- | --- |
| `packages/coding-agent/src/core/session-manager.ts` | entry 类型、JSONL 读写、leaf、树导航、context 构建 |
| `packages/coding-agent/src/core/compaction/compaction.ts` | 触发条件、token 估算、cut point、CompactionEntry |
| `packages/coding-agent/src/core/compaction/branch-summarization.ts` | 分支切换时如何生成 summary |
| `packages/coding-agent/src/core/compaction/utils.ts` | 消息序列化、文件操作追踪、summary prompt |
| `packages/coding-agent/src/core/messages.ts` | compaction/custom/branch summary 如何变成 AgentMessage |
| `packages/agent/src/harness/session/` + `packages/agent/src/harness/compaction/` | 下一代：v4 lane-based 会话与同款压缩实现 |

读源码时，重点看两个转换：

1. `SessionEntry[]` 如何变成 `AgentMessage[]`。
2. 老消息如何变成 `CompactionEntry` 再重新进入上下文。

## 教学版保留了什么

| Pi | 教学版 |
| --- | --- |
| JSONL session file | `.teaching-agent/session.jsonl` |
| `id` / `parentId` / `leafId` | 保留 |
| 多种 entry 类型 | 只实现 `message` 和简化 `compaction` |
| LLM summary | 用确定性 summarizer 模拟 |
| branch summary | 作为扩展方向 |

教学版的目标是让读者先掌握结构，不让真实压缩 prompt、token 估算和分支 UI 把主线冲散。

如果你已经理解这条主线，下一页 [进阶：真实 Pi 为什么压缩更复杂](/source/advanced-compaction) 会继续拆 `reserveTokens`、`keepRecentTokens`、turn boundary、split turn、重复压缩和文件操作追踪这些真实边界。

## 小练习

在 `examples/teaching-agent/src/server/agent/sessionStore.ts` 里给 compaction entry 加一个 `tokensBefore` 字段，并在前端时间线里展示它。这个练习能把“压缩是运行时事件”这件事变得很直观。


工具让 Agent 能做事，扩展让用户能改变 Agent 的行为，资源加载则决定启动时有哪些工具、技能、提示模板和上下文文件进入运行时。

这三者放在一起理解，会比逐个看文件更清楚：工具是能力，扩展是插槽，ResourceLoader 是装配线。

## 三者的边界

| 机制 | 核心职责 | 什么时候运行 |
| --- | --- | --- |
| Tool | 被模型调用，执行本地副作用或查询 | Agent Loop 发现 `toolCall` 后 |
| Extension | 监听事件、注册工具/命令、拦截输入和工具 | 会话生命周期、模型请求、工具执行、UI 交互中 |
| ResourceLoader | 发现扩展、技能、prompt templates、context files | 创建 session 或 reload 时 |

[![三者的边界 流程图](/diagrams/source-tools-extensions-1.png)](/diagrams/source-tools-extensions-1.png)

## 工具从哪里来

Pi 的工具大致有两类：

| 来源 | 例子 | 特点 |
| --- | --- | --- |
| 内置工具 | `read`、`bash`、`edit`、`write`、`grep`、`find`、`ls` | coding agent 的基础能力 |
| 扩展工具 | 用户通过 `pi.registerTool()` 注册 | 可以接外部服务、公司内部系统或自定义工作流 |

工具定义不仅是给模型看的“说明”，也是运行时的安全边界。v0.87 中 `AgentTool` 的结构大致是这样（简化）：

```ts
interface AgentTool<TParams extends TSchema, TDetails = any> {
  name: string;
  description: string;
  label?: string;          // UI 展示名
  parameters: TSchema;     // TypeBox schema
  prepareArguments?: (args: unknown) => unknown; // schema 校验前的参数兼容 shim
  execute: (toolCallId: string, params, signal?: AbortSignal, onUpdate?) => Promise<AgentToolResult<TDetails>>;
  executionMode?: "sequential" | "parallel";      // 默认并行，可覆盖为串行
  replay?: "never" | "safe";                      // 耐久意图恢复策略
}
```

真正执行前，Pi 会找工具、调用 `prepareArguments` 做参数兼容、用 `validateToolArguments` 校验 schema，并触发工具事件。任何一步失败，都应该变成 tool result，而不是让进程直接崩溃。

::: tip v0.86 起内置工具默认启用严格 schema 采样
`read`、`bash`、`powershell`、`edit`、`write` 这些内置工具默认开启 strict JSON-schema（constrained sampling），让模型输出严格合法的参数。扩展想关闭时，可以在工具定义里显式声明 `constrainedSampling: false`。
:::

## 扩展事件像一排检查点

官方扩展文档把扩展定义为 TypeScript 模块，可以订阅生命周期事件、注册工具、增加命令、自定义 UI 和持久化状态。理解它时，可以把事件看成一排检查点：

[![扩展事件像一排检查点 流程图](/diagrams/source-tools-extensions-2.png)](/diagrams/source-tools-extensions-2.png)

不同扩展只需要挂在自己关心的位置：

| 需求 | 更适合的扩展点 |
| --- | --- |
| 禁止写 `.env` | `tool_call` |
| 给每次运行自动加上下文 | `before_agent_start` |
| 改写发给模型的完整上下文 | `context` / `context_with_system` |
| 改写 provider 请求 | `before_provider_request` |
| 自定义压缩摘要格式 | `session_before_compact` |
| 在本轮落定前持久化结构性条目或要求再请求一次 | `turn_end` / `agent_before_settle` |
| 加一个 `/deploy` 命令 | `registerCommand()` |
| 保存扩展自己的状态 | `appendEntry()` |

::: tip v0.87 扩展事件的变化
新增了 `context`（过滤/切片/改写消息，Pi 会保证 system prompt 与工具声明在 handler 之后自动恢复）、`context_with_system`（对包含 system 的完整 transcript 原样发送结果）、`agent_before_settle` / `agent_settled`。`turn_end` 从只读通知升级为可行动边界：可以返回 `{ entries, continue }` 持久化条目并安排下一次请求。另外 `pi.on()` 现在返回取消订阅函数。
:::

## 为什么扩展不应该塞进 Agent Loop

一个常见冲动是把所有产品需求都写进 loop：权限审批、Git 快照、远程执行、公司内部工具、UI 渲染。这样短期快，长期会让 loop 无法测试。

Pi 把这些需求放到扩展系统里，核心 loop 只保留最稳定的控制流：

[![为什么扩展不应该塞进 Agent Loop 流程图](/diagrams/source-tools-extensions-3.png)](/diagrams/source-tools-extensions-3.png)

这和浏览器事件、Express 中间件、数据库 hook 的思路类似：核心做少一点，插槽设计清楚一点。

## Skills 和 Prompt Templates 不是扩展的替代品

| 机制 | 本质 | 典型用途 | 是否执行代码 |
| --- | --- | --- | --- |
| Extension | TypeScript 运行时代码 | 工具、命令、事件拦截、UI | 是 |
| Skill | 按需加载的说明书和资产 | 可复用工作流、操作步骤、脚本说明 | 可包含脚本，但由 Agent 决定调用 |
| Prompt Template | 可复用用户提示 | 常用任务模板 | 否 |
| Context File | 项目长期规则 | 编码规范、运行命令、仓库约定 | 否 |

初学者最容易混用这几个东西。判断方法很简单：

1. 需要改变运行时行为，用 Extension。
2. 需要教 Agent 做一类任务，用 Skill。
3. 需要复用一段用户输入，用 Prompt Template。
4. 需要长期告诉 Agent 项目规则，用 Context File。

## 源码阅读路线

| 文件 | 看什么 |
| --- | --- |
| `packages/coding-agent/src/core/resource-loader.ts` | 资源如何从 cwd、agentDir、settings 进入运行时 |
| `packages/coding-agent/src/core/extensions/types.ts` | 扩展 API、事件、工具定义和上下文类型 |
| `packages/coding-agent/src/core/extensions/runner.ts` | 扩展事件如何分发和收集结果 |
| `packages/coding-agent/src/core/tools/index.ts` | 内置工具如何组装 |
| `packages/coding-agent/src/core/tools/tool-definition-wrapper.ts` | 工具定义如何适配 Agent 内核 |
| `packages/coding-agent/src/core/skills.ts` | Skills 如何发现和描述 |
| `packages/coding-agent/src/core/prompt-templates.ts` | Prompt template 如何展开 |

::: tip 新一代运行时
`pi-agent-core` 的 `packages/agent/src/harness/` 把“coding agent 运行时”做成了内核层的一部分：`harness/tools/`（read/bash/edit/write/image）、`harness/skills.ts`、`harness/prompt-templates.ts`、`harness/system-prompt.ts` 都能在这里找到对应实现。`pi-coding-agent` 目前仍走 `ResourceLoader` + `ExtensionRunner` 这条成熟链路，harness 是其下一代替代。
:::

读这部分时，建议先看“注册”和“触发”两条线：

| 线索 | 你要找的问题 |
| --- | --- |
| 注册线 | 工具、命令、事件 handler 是什么时候加入 runtime 的？ |
| 触发线 | 用户输入、模型请求、工具执行、压缩时分别触发哪些事件？ |

## 教学版保留了什么

教学版没有实现完整扩展系统，但保留了三个关键思想：

| Pi | 教学版 |
| --- | --- |
| `registerTool()` | `ToolRegistry.register()` |
| `tool_call` / `tool_result` 事件 | `tool_start` / `tool_end` 事件时间线 |
| ResourceLoader 动态发现 | 静态注册 `list_files`、`read_file`、`write_note` |

这已经足够让读者理解：模型不能直接做副作用，所有能力都要通过受控工具暴露。

## 小练习

在教学版里加一个非常小的 hook：执行 `write_note` 前，如果文件名不是 `.md` 结尾，就返回错误 tool result。这个练习能帮你体会为什么生产级 Agent 需要 `tool_call` 拦截点。

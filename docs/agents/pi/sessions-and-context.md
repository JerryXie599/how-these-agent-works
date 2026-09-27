# 会话、压缩与扩展机制


会话不是聊天记录的简单数组。对 coding agent 来说，会话承担了三个职责：

1. 保存历史，支持继续工作。
2. 支持从早期节点重新探索另一条路径。
3. 为上下文构建、压缩和导出提供结构化材料。

Pi 使用 JSONL 文件保存会话，并用 `id` / `parentId` 把条目组织成树。

## 为什么是 JSONL

JSONL 的每一行都是一个独立 JSON 对象。

```json
{"type":"session","version":3,"id":"s1","cwd":"/project"}
{"type":"message","id":"a1","parentId":null,"message":{"role":"user","content":"修 README"}}
{"type":"message","id":"a2","parentId":"a1","message":{"role":"assistant","content":[]}}
```

::: tip 真实 Pi 与教学版的版本号
Pi 当前主线的 `SessionManager`（`packages/coding-agent/src/core/session-manager.ts`）使用 `version: 3`：v1 是早期线性 entry，v2 引入 `id` / `parentId` 树结构，v3 统一了扩展消息命名。本教程的教学版协议故意使用 `version: 1`，只是表示“教学版文件格式第 1 版”，不是在复刻 Pi 的真实版本号。

新一代 `AgentHarness`（`packages/agent/src/harness/session/`）已升级为 v4 lane-based JSONL，并保留 `legacy-v3` 读取器。两者的学习主线是一致的：稳定 `id`、`parentId`、当前 `leafId`，以及通过 JSONL append 保存历史。
:::

它的好处是：

| 优点 | 解释 |
| --- | --- |
| 追加写简单 | 每产生一个条目就 append 一行 |
| 崩溃恢复友好 | 已写入的行仍可解析 |
| 适合长会话 | 不必每次重写整个大 JSON |
| 便于外部工具处理 | `rg`、脚本、日志工具都能扫 |

## 树结构

[![树结构 流程图](/diagrams/concepts-sessions-1.png)](/diagrams/concepts-sessions-1.png)

如果当前 leaf 是 `D`，上下文就是 `A -> B -> C -> D`。当你跳回 `B` 并提交新用户消息，就产生 `E -> F` 这条新分支。旧分支不会丢。

## leaf 的意义

`leafId` 是当前会话视角的末端。构建上下文时，不是把文件里所有条目都发给模型，而是从 leaf 一路沿 `parentId` 回溯到根，再反转成顺序。

```ts
function buildContext(leaf: Entry, byId: Map<string, Entry>) {
  const path: Entry[] = [];
  let current: Entry | undefined = leaf;
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path.flatMap(entryToMessage);
}
```

## 分支时用户消息怎么处理

Pi 的 `/tree` 有一个很妙的交互：如果你选中一条用户消息，它不是把 leaf 移到这条消息，而是移到它的父节点，并把这条用户消息放回编辑器。

这样你可以改写原问题，然后重新提交，形成一条新分支。

[![分支时用户消息怎么处理 流程图](/diagrams/concepts-sessions-2.png)](/diagrams/concepts-sessions-2.png)

## 分支摘要

当你从一条长分支切到另一条分支时，有时不想完全丢掉离开分支上的重要发现。Pi 支持 branch summary：把离开的分支总结成一个条目，附着到新位置。

这不是普通压缩，而是“跨分支携带经验”。

## Session entry 不只保存消息

Pi 的 session file 里不只有 `message`。它还会记录模型切换、thinking level、compaction、branch summary、自定义扩展条目和 session 名称等。这样恢复会话时，系统不只是恢复聊天文本，而是恢复“当时的运行上下文”。

| entry 类型 | 为什么要保存 |
| --- | --- |
| `message` | 构造后续 LLM 上下文 |
| `model_change` | 恢复时知道上一轮用的 provider/model |
| `thinking_level_change` | 恢复 reasoning 设置 |
| `compaction` | 长会话用摘要替代旧消息 |
| `branch_summary` | 分支跳转后携带离开分支的经验 |
| `context_edit` | v0.87 新增：省略/替换单条消息而不改写原始历史 |
| `custom` / `custom_message` | 扩展持久化自己的状态或注入上下文 |

教学版只实现 `message` 和最小 `compaction`，但类型上保留了继续扩展的空间。

## 常见误区

| 误区 | 后果 | 修正 |
| --- | --- | --- |
| 用数组下标表示历史位置 | 删除、压缩、分支后引用会错 | 用稳定 `id` 和 `parentId` |
| 切分支时删除旧分支 | 失去探索记录，无法回滚 | 保留旧 entry，只移动 leaf |
| 压缩后把旧消息全删掉 | 以后无法审计和重新构建分支 | 追加 compaction entry，不破坏原始历史 |
| 只保存 assistant 最终文本 | 工具结果和错误丢失 | 用户、助手、工具结果都作为消息保存 |

## 教学版保留什么

我们的教学版会保留：

| 能力 | 保留程度 |
| --- | --- |
| JSONL append | 保留 |
| `id` / `parentId` | 保留 |
| `leafId` | 保留 |
| 从 leaf 构建上下文 | 保留 |
| branch summary | 作为扩展练习 |
| 完整 TUI tree selector | 不实现，只用 API/日志展示 |

## 小练习

运行：

```bash
npm run demo:03
```

观察输出里的两条分支。然后把 Demo 改成三条分支，试着预测每个 leaf 对应的上下文路径。


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


Agent 每次请求模型时，并不是只发送用户刚输入的一句话。通常还会包含：

| 内容 | 来源 |
| --- | --- |
| 系统提示词 | Agent 内置规则、工具说明、行为约束 |
| 项目上下文 | `AGENTS.md`、项目规则、当前工作目录 |
| 技能索引 | 可用技能的名称和描述 |
| 历史消息 | 当前会话 leaf 上的消息路径 |
| 工具定义 | 当前启用工具的 schema |

这就是为什么上下文管理会变成 Agent 框架的核心问题。

## ResourceLoader 做什么

Pi 的 `DefaultResourceLoader`（`packages/coding-agent/src/core/resource-loader.ts`）负责加载这些资源：

[![ResourceLoader 做什么 流程图](/diagrams/concepts-context-1.png)](/diagrams/concepts-context-1.png)

::: tip 新一代运行时
`pi-agent-core` 的 `packages/agent/src/harness/` 把这些资源加载也下沉到了内核层：`harness/skills.ts`、`harness/prompt-templates.ts`、`harness/system-prompt.ts` 与这里的职责一一对应，`AgentHarnessResources` 把 skills 和 prompt templates 作为显式资源交给运行时。当前主线（`pi-coding-agent`）仍走上面的 `DefaultResourceLoader`。
:::

重点不是“加载文件”本身，而是把外部资源转成稳定的运行时输入：系统提示词、工具、命令、事件处理器。

## 技能为什么不是一直全文注入

Pi 的 Skills 机制只在系统提示词中放技能名称和描述。真正需要时，模型再用 `read` 读取完整 `SKILL.md`。

这样做的原因很实际：如果每个技能的全文都塞进系统提示词，长一点的技能库会直接吃掉上下文窗口。

[![技能为什么不是一直全文注入 流程图](/diagrams/concepts-context-2.png)](/diagrams/concepts-context-2.png)

## 上下文压缩

长会话一定会遇到上下文窗口限制。Pi 的 compaction 不是简单删除老消息，而是：

1. 找到可以切分的旧消息范围。
2. 用模型把旧内容总结成结构化摘要。
3. 写入 `CompactionEntry`。
4. 后续构建上下文时，发送“摘要 + 最近保留消息”。

[![上下文压缩 流程图](/diagrams/concepts-context-3.png)](/diagrams/concepts-context-3.png)

## 为什么压缩要保留最近消息

摘要适合保存“做过什么、得出什么结论”，但它不适合替代最新几轮的细节。最近消息里通常有：

| 内容 | 为什么要保留原文 |
| --- | --- |
| 最新工具输出 | 模型可能还要基于精确文本继续处理 |
| 刚修改的文件片段 | 摘要容易丢细节 |
| 当前用户约束 | 最新指令应高优先级保留 |
| 错误日志 | 错误堆栈摘要后可能失真 |

所以真实系统通常是“摘要旧内容 + 原样保留最近内容”的组合。

## 教学版的简化压缩

我们的 Demo 4 会用一个非常朴素的 token 估算：按字符长度近似。压缩器也不是调用真实模型，而是把旧消息压成一段摘要文本。

它不智能，但能展示关键结构：

```ts
{
  type: "compaction",
  summary: "用户让 Agent 检查 README，工具读取了 README...",
  firstKeptEntryId: "entry_8",
  tokensBefore: 12400
}
```

理解结构比一开始追求摘要质量更重要。真正接模型时，你只需要替换 summarizer。

## 压缩策略要解决两个风险

| 风险 | 表现 | 策略 |
| --- | --- | --- |
| 摘要过粗 | 模型忘记关键文件、约束、错误 | 摘要中明确“已完成、关键事实、剩余任务、风险” |
| 保留太多 | 压缩后仍然接近窗口上限 | 只保留最近高价值消息，旧消息靠摘要承接 |

真实 Pi 还要处理“模型返回 context overflow 错误后自动压缩并重试”的场景。这里的重点是：压缩不是用户主动整理笔记，而是 Agent runtime 的生存机制。

## Skills、Context Files、Prompt Templates 的边界

| 机制 | 适合放什么 | 不适合放什么 |
| --- | --- | --- |
| Context Files | 项目长期规则，例如编码规范、运行命令 | 一次性任务说明 |
| Skills | 可复用工作流，例如“如何做性能审计” | 当前项目私有状态 |
| Prompt Templates | 常用 prompt 模板和参数 | 大段知识库全文 |
| Compaction Summary | 历史会话事实和当前进度 | 新规则或新权限 |

把这些边界分清楚，读者后面自己扩展教学版 Agent 时就不会把所有东西都塞进 system prompt。

## 常见误区

| 误区 | 后果 | 修正 |
| --- | --- | --- |
| 把所有技能全文放进系统提示词 | token 很快耗尽 | 只放索引，按需读取全文 |
| 压缩摘要写得像聊天总结 | 丢失文件路径、命令、错误 | 用工程化摘要结构 |
| 工具输出不截断就进上下文 | 一次日志可能撑爆窗口 | 工具层截断，必要时摘要 |
| 忽略最新用户指令优先级 | 摘要中的旧目标覆盖新目标 | 最近消息原文保留，并在 prompt 中强调优先级 |

## 小练习

把 `examples/demos/04-compaction.ts` 中的 `keepRecentCount` 从 `2` 改成 `4`，观察摘要内容和最终上下文如何变化。


前面的压缩页把主线讲成“摘要旧消息 + 保留最近消息”。这个模型对教学版足够好，因为它能让你先抓住两个核心不变量：

1. 原始 session 历史不删除。
2. 后续模型上下文由 summary 和 recent messages 重新拼出来。

但真实 Pi 面对的是更麻烦的工程问题：模型上下文窗口有限，工具输出可能很长，用户可能在会话树里跳分支，一个巨大 turn 可能自己就超过保留预算，扩展还可能接管压缩。官方 Compaction 文档和 `packages/coding-agent/src/core/compaction/` 源码把这些边界都显式处理了。

## 事实核对

| 结论 | 官方文档 / 源码位置 | 教学时怎么理解 |
| --- | --- | --- |
| 自动压缩触发条件是 `contextTokens > contextWindow - reserveTokens` | [Compaction 文档](https://pi.dev/docs/latest/compaction) 与 `compaction.ts` | 压缩不是按消息条数触发，而是给下一次模型回复预留空间 |
| 当前默认 `reserveTokens` 为 `16384`，`keepRecentTokens` 为 `20000` | [Compaction Settings](https://pi.dev/docs/latest/compaction#settings) | 一个控制“要留多少输出空间”，一个控制“最近原文保留多少” |
| `CompactionEntry` 记录 `summary`、`firstKeptEntryId`、`tokensBefore` 和可选 `details` | [Session Format](https://pi.dev/docs/latest/session-format) | summary 不是孤立文本，它带着恢复上下文所需的边界指针 |
| Pi 通常在 turn 边界切分，且不会在 `toolResult` 处切 | [Cut Point Rules](https://pi.dev/docs/latest/compaction#cut-point-rules) | 工具调用和工具结果必须保持语义连续 |
| split turn 会额外摘要这个 turn 的前半段 | [Split Turns](https://pi.dev/docs/latest/compaction#split-turns) | 一个超长 turn 不能简单整段保留或整段丢给历史摘要 |
| branch summary 发生在 `/tree` 切换分支时，解决的问题不同于 compaction | [Branch Summarization](https://pi.dev/docs/latest/compaction#branch-summarization) | compaction 是同一路径减重，branch summary 是换路径时带走经验 |
| 默认摘要会累计文件读写信息 | [Cumulative File Tracking](https://pi.dev/docs/latest/compaction#cumulative-file-tracking) | 代码 Agent 需要知道哪些文件被读过、改过，而不只是聊天摘要 |
| v0.86 起 `reserveTokens` / `keepRecentTokens` 可以按模型覆盖（`compaction.modelOverrides`） | [Per-model overrides](https://pi.dev/docs/latest/compaction#per-model-overrides) | 不同模型上下文窗口、输出长度差异很大，统一预算会过头或不足 |
| v0.87 起支持“保留零原文”的压缩（`sessionManager.appendCompaction(summary, null, tokensBefore)`） | `SessionManager.appendCompaction` | 摘要 entry 以自身 id 作为 kept boundary，适合明确不再需要旧原文的场景 |
| v0.87 起 `ContextEditEntry` 可以省略/替换单条消息，不经过压缩 | [ContextEditEntry](https://pi.dev/docs/latest/session-format#contexteditentry) | 编辑上下文不等于压缩：前者精确改一条，后者成段摘要 |

这些细节不是为了炫技。它们共同解决一个问题：压缩后，模型看到的上下文必须仍然像“连续工作现场”，而不是一段抽象回忆录。

## 触发条件：不是消息多，而是预算不够

教学版可以用“上下文字符串长度超过阈值”模拟压缩。真实 Pi 更接近下面这个流程：

[![触发条件：不是消息多，而是预算不够 流程图](/diagrams/source-advanced-compaction-1.png)](/diagrams/source-advanced-compaction-1.png)

公式是：

```ts
contextTokens > contextWindow - reserveTokens
```

这里的 `reserveTokens` 很关键。Agent 不是只要“输入塞得下”就行，还要给模型回复、工具调用参数和后续事件留空间。否则模型刚开始输出就可能撞上下文限制。

`keepRecentTokens` 解决另一个问题：哪些内容必须保留原文。最近的报错、工具输出、用户补充约束常常非常具体，过早摘要会损失细节。

## firstKeptEntryId 是恢复指针

很多人第一次实现压缩，会只保存一个 `summary` 字段。这样页面能展示，但恢复上下文时会立刻遇到问题：summary 后面到底从哪条原文消息接上？

Pi 用 `firstKeptEntryId` 明确这个边界。

| 字段 | 作用 | 没有它会怎样 |
| --- | --- | --- |
| `summary` | 旧上下文摘要 | 只能知道大概发生过什么 |
| `firstKeptEntryId` | 后续原文从哪个 entry 开始保留 | 重建上下文时可能重复消息，也可能漏掉消息 |
| `tokensBefore` | 压缩前上下文 token 规模 | 无法在 UI、日志和扩展里解释这次压缩替换了多少上下文 |
| `details` | 默认可保存读写文件等实现细节 | 摘要只剩自然语言，丢掉代码工作现场的结构化线索 |

可以把压缩后的上下文想成：

```text
system prompt
compaction summary
messages from firstKeptEntryId to current leaf
```

注意：JSONL 文件里旧消息仍然存在。`firstKeptEntryId` 只是告诉运行时“下次喂给模型时从哪里接回原文”。

## cut point：为什么不能随便切

工具调用让切分变复杂了。一次工具调用不是单条消息，而是至少包含：

1. assistant 发出 `toolCall`。
2. tool 执行并生成 `toolResult`。
3. assistant 读取结果后继续回答。

如果压缩刚好切在 `toolResult` 前后，模型可能看到一个没有来源的工具结果，或者看到一个没有结果的工具调用。这会破坏对话协议。

[![cut point：为什么不能随便切 流程图](/diagrams/source-advanced-compaction-2.png)](/diagrams/source-advanced-compaction-2.png)

官方规则里，合法 cut point 可以是用户消息、assistant 消息、bashExecution、自定义消息或 branch summary，但不会切在 tool result 上。直觉上讲：可以从一轮的起点接上，也可以从 assistant 的一个稳定输出点接上，但不能把“工具调用和结果”拆成孤儿。

## split turn：一个 turn 自己太大怎么办

通常一个 turn 从用户消息开始，到下一条用户消息前结束。理想情况下，压缩在 turn 边界上切：旧 turn 摘要掉，新 turn 保留原文。

但代码 Agent 经常遇到一个超长 turn：

[![split turn：一个 turn 自己太大怎么办 流程图](/diagrams/source-advanced-compaction-3.png)](/diagrams/source-advanced-compaction-3.png)

如果这个 turn 已经超过 `keepRecentTokens`，Pi 不能简单说“整个 turn 都保留”。这时 cut point 会落在 turn 内部，形成 split turn。真实实现会把 turn 前半段作为 `turnPrefixMessages` 单独摘要，再把后半段原文保留下来。

这一步保护的是连续性：模型仍能知道这个巨大 turn 前面做了什么，同时不会把整个巨大工具输出都塞进下一轮请求。

## 重复压缩：摘要也会成为历史

长会话不会只压缩一次。第二次、第三次压缩时，Pi 需要处理之前已经存在的 compaction entry。

核心原则是：下一次摘要的范围从上一次保留边界附近继续算，而不是简单从上一个 compaction entry 后面开始。官方文档说明，重复压缩会从前一次 `firstKeptEntryId` 的保留边界开始处理；如果找不到该 entry，则退回到前一个 compaction 后的 entry。

这样做的原因很实在：上一次被“保留原文”的消息，下一次可能已经变旧了，也应该有机会进入新的 summary。否则最近上下文会越滚越大，压缩效果越来越差。

## branch summary：它不是压缩

`branch_summary` 和 `compaction` 都是摘要，但触发场景完全不同。

| 维度 | compaction | branch summary |
| --- | --- | --- |
| 触发 | 上下文超过阈值，或用户运行 `/compact` | 用户在 `/tree` 中切换到另一条分支 |
| 摘要对象 | 当前路径上的旧上下文 | 正在离开的分支，从旧 leaf 到共同祖先 |
| 目标 | 减少 token 占用 | 把离开分支的重要发现带到新位置 |
| 写入 entry | `type: "compaction"` | `type: "branch_summary"` |
| 恢复方式 | summary + `firstKeptEntryId` 后的原文 | 作为 branch summary message 注入上下文 |

一个常见误区是：切分支时直接把旧分支全丢掉。对探索式编程来说，这很可惜。你可能在 A 分支里读过关键文件、验证过失败假设，后来切到 B 分支继续实现。branch summary 的价值就是把这些“走过的弯路”变成可携带经验。

## 文件操作追踪：代码 Agent 不能只靠自然语言

Pi 官方摘要格式里包含 `<read-files>` 和 `<modified-files>`。默认实现会从被摘要消息里的工具调用、之前的 compaction details、嵌套 branch summary details 中累计文件操作。

这对代码 Agent 很重要：

| 信息 | 为什么不能只写进普通 summary |
| --- | --- |
| 读过哪些文件 | 后续模型可以避免重复探索，或知道证据来自哪里 |
| 改过哪些文件 | 恢复任务时能快速聚焦风险区域 |
| 工具结果是否很长 | 摘要时可以截断展示，但保留结构化线索 |
| previous summary 的 details | 多次压缩后仍能累计历史工作现场 |

从工程角度看，`details` 是“给程序读的摘要”，自然语言 summary 是“给模型读的摘要”。两者配合，恢复质量会比只存一段文本稳定得多。

## v0.86+ 的新边界：按模型预算、零保留与上下文编辑

最近几个版本把压缩从“一个全局策略”拆成了更细的控制面：

| 能力 | 引入版本 | 解决什么问题 |
| --- | --- | --- |
| 按模型覆盖 `reserveTokens` / `keepRecentTokens` | v0.86 | 一个上下文 20 万 token 的模型和一个 4 万的模型用同一套预算，不是过头就是不足。`compaction.modelOverrides` 让每个模型有自己的保留策略 |
| 零保留压缩 `appendCompaction(summary, null, tokensBefore)` | v0.87 | 有些场景明确知道旧原文不再需要，摘要 entry 直接把自身 id 作为 kept boundary，不再留原文 |
| `ContextEditEntry` | v0.87 | 想“省略某一条消息”或“替换某条消息的文本”时，不再需要触发整段压缩。`appendContextEdit(entryId, null)` 省略，`appendContextEdit(entryId, { role, content })` 替换；原始历史、usage 和 UI 历史都不变 |

理解这三者的关系：压缩是“成段摘要并留边界指针”，零保留是“摘要后不留原文”，上下文编辑是“精确改一条”。它们共用同一个 SessionManager 事实来源，所以能混用而不打架。

## 教学版为什么不全实现

教学版 `JsonlSessionStore.compactIfNeeded()` 故意只实现最小闭环：

| 真实 Pi 能力 | 教学版处理 | 为什么这样安排 |
| --- | --- | --- |
| 根据真实 token usage 判断 | 用近似字符长度模拟 | 本科生先理解触发点，不被 provider usage 细节打断 |
| `reserveTokens` / `keepRecentTokens` | 固定阈值和保留条数 | 保持 Demo 可预测，方便观察 JSONL |
| turn boundary / split turn | 不做复杂切分 | 工具调用链路已经在 loop 章节单独学习 |
| 文件操作追踪 | 不实现 details | 避免把工具语义、摘要 prompt 和 session store 混在第一版里 |
| branch summary | 放到扩展方向 | 需要会话树 UI 支撑，适合作为二阶段练习 |

这不是偷懒，而是教学顺序。你先做出一个能跑、能保存、能压缩的最小 Agent，再回头把真实边界逐个补进去，会比一开始复刻 Pi 的完整压缩系统更稳。

## 小练习

在教学版基础上做一个“轻量真实化”的压缩练习：

1. 给 `compactIfNeeded()` 增加 `reserveApproxChars` 和 `keepRecentApproxChars` 两个参数。
2. 选择 `firstKeptEntryId` 时，不再按消息条数保留，而是从最新消息向前累加近似字符数。
3. 如果遇到 `toolResult`，保证它前面的 assistant tool call 也被保留，避免出现孤立工具结果。
4. 在 compaction event 里展示 `tokensBefore`、`firstKeptEntryId` 和 `keptMessageCount`。

完成后，你会更直观地理解真实 Pi 为什么要把压缩做成一个独立模块：它不是字符串裁剪，而是在保护协议边界、上下文预算和工程恢复能力。

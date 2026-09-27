# opencode 会话、上下文与快照

opencode 的持久化方案是四个 Agent 里最"数据库"的：不是 JSONL，是 **SQLite**。本章讲三件事——会话怎么存、上下文怎么压、文件怎么回退。

## SQLite：会话库的结构

数据库位置：`~/.local/share/opencode/opencode.db`（macOS/Linux；非 stable 渠道带 channel 后缀）。核心表：

| 表 | 作用 |
| --- | --- |
| `session` | 会话元信息：目录、标题、模型、agent、成本、token 计数、revert 状态 |
| `message` / `part` | V1 消息与消息分片（`data` 列为整块 JSON） |
| `session_message` | V2 投影消息，带显式 `seq` 与 `(session_id, seq)` 唯一索引 |
| `session_input` | durable 收件箱：`admitted_seq` / `promoted_seq` 双游标 |
| `session_context_epoch` | 不可变的 System Context 基线与快照游标 |
| `permission` | 「总是允许」的项目级批准 |
| `event` / `event_sequence` | 事件表，支撑 `sessions.events({after})` 的可重放 SSE |

![SQLite：会话库的结构 流程图](/diagrams/agents-opencode-context-and-sessions-1.png)

和另外三个 Agent 对照着看这张表结构：

| | Pi | Claude Code | DSH | opencode |
| --- | --- | --- | --- | --- |
| 格式 | JSONL entry 树 | JSONL 线性 | JSONL.zstd 事件日志 | **SQLite** |
| 可查询性 | grep | grep | 需解压 | **SQL 全查（含 FTS）** |
| 分支 | 树内分支 | fork | 截断重放 | `POST /session/:id/fork` |
| 事件重放 | 无 | 无 | 有 | **有（`after` 游标）** |

代价也真实存在：SQLite 让"用编辑器打开会话看看"变成"得先装个 DB 工具"。仓库里保留的 legacy JSON 导出就是为了这个。

## 上下文压缩：结构化滚动摘要

触发规则（V2 specs）：每轮 provider 调用前估算整个模型可见请求，超过「上下文窗口 − max(输出预留, `compaction.buffer`)」预算且存在更早的完整轮次时压缩。关键参数：

| 参数 | 默认值 |
| --- | --- |
| `buffer` | 20,000 tokens |
| `keep.tokens` | 8,000 tokens |
| 工具输出截断 | 2,000 字符 |
| 摘要输出预算 | 4,096 tokens |

和别的 Agent"摘要成一段话"不同，opencode 的摘要走**固定 Markdown 模板**：

```text
Objective            ← 目标
Important Details    ← 重要细节
Work Status          ← Completed / Active / Blocked
Next Move            ← 下一步
Relevant Files       ← 相关文件
```

重复压缩时是「旧摘要 + 新对话 → 新摘要」的滚动合并，指令里写明冲突以新对话为准。模板化的好处很直接：**结构稳定，模型每轮拿到的是同一种形状的上下文**，而不是每次都不一样的一段散文。

另外两条兜底策略：

- **provider 溢出兜底**：模型报"上下文太长"时补做一次压缩，只重试一次物理请求；第二次还溢出就是终态失败——不循环、不重放已经发生的副作用。
- **压缩后清空 provider-native 消息**：带签名/加密推理的供应商消息在压缩后失效，主动清掉比传入后报错强。

## Context Epoch：把 system prompt 变增量

这是 V2 最有特色的上下文模型（设计文档在 `CONTEXT.md`）：

| 概念 | 含义 |
| --- | --- |
| System Context | 结构化上下文事实集合（刻意不叫 system prompt） |
| Context Source | 有稳定 key + 渲染器的独立来源（环境、日期、AGENTS.md、技能目录…） |
| Context Epoch | 一棵不可变基线存活的时间段 |
| Mid-Conversation System Message | 上下文变化时插入的**时序 System 消息** |

行为要点：会话首个完整观测在任何 prompt 可见之前初始化 epoch；多个 source 的变化**合并成一条** System 消息，在安全边界原子提交；一次完成的压缩会从当前上下文直接渲染新基线。

为什么要这么设计？因为主流供应商都有 **prompt cache**——把 system prompt 放在最前面、一次写好不动，缓存命中率最高。opencode 的选择是：基线不可变，变化以尾部 System 消息注入。**改上下文不再打碎缓存**，这是把供应商成本模型读透之后的设计。

## 快照与回退：revert / unrevert / fork

| 能力 | 实现 |
| --- | --- |
| 文件快照 V1 | git 实现（track/patch/restore/revert/diff），有 7 天 prune 与大小上限 |
| 文件快照 V2 | 内容寻址树（capture/restore/diff），capture 尽力而为 |
| 消息级回退 | `POST /session/:id/revert` / `unrevert`：扫描边界之后所有 assistant 消息的快照起点，按文件去重得到恢复目标 |
| 分支 | `POST /session/:id/fork`，`parent_id` 支撑子会话 |

pi 用会话树分支解决"回到过去重新走"，opencode 用「消息级 revert + 文件快照恢复」——回退时**代码文件与会话状态一起回滚**，这比纯会话回退更接近"后悔药"的真实需求。

## 与另外三个 Agent 对照

| 话题 | Pi | Claude Code | DSH | opencode |
| --- | --- | --- | --- | --- |
| 存储 | JSONL 树 | JSONL + 检查点 | 事件溯源 .zstd | SQLite + 事件表 |
| 压缩触发 | 上下文超限 | 接近上限自动 + /compact | 压力 0.8 摘要 + 结果裁剪 | 预算触发 + 溢出兜底 |
| 摘要形态 | 自由摘要 entry | 自由摘要 | `<compacted-summary>` 标记 | 固定模板滚动合并 |
| 上下文前缀 | 每轮重建 | 每轮重建 | 摘要重放 | **增量 System 消息护住 prompt cache** |
| 回退 | 树分支 | 文件检查点 | 事件截断重放 | 消息 revert + 文件快照 |

下一步：[opencode 的扩展机制](/agents/opencode/extendability)。
# DSH 事件溯源会话与两层压缩

dsh 处理"记忆"的方式是三个 Agent 里最体系的：**事件溯源（event sourcing）**。一句话版本：append-only 日志是唯一事实源，你看到的一切（消息历史、会话列表、统计）都是从日志派生的投影。

## 会话即日志

每个会话在磁盘上是这样的：

```text
~/.dsh/sessions/
└── --Users-jerry-work-demo--/        # 归一化的 cwd
    └── session-e382f54e-…/
        └── session.jsonl.zstd        # zstd 压缩 + 校验和头的 JSONL
```

![会话即日志 流程图](/diagrams/agents-dsh-session-and-compaction-1.png)

| 设计选择 | 含义 |
| --- | --- |
| 首行是不可变 `SessionHeader` | 记录 version、id、cwd、创建时间、delegationDepth、**agentPreset**——preset 被持久化，恢复会话时工具与提示词原样恢复 |
| zstd 压缩 + 校验和头帧 | 长会话的磁盘成本与完整性 |
| 消息历史是**投影**，不是存储 | 想换一种"看"历史的方式（比如重放时改表面），不需要改存储 |
| 每种事件都在日志里 | 审批问答、收件箱变更、goal 修订全部可回放 |

与 pi 对照：pi 的 JSONL 是**entry 树**（节点 + 父指针，天然分支）；dsh 的 JSONL 是**事件流水**（线性追加，用投影和 checkpoint 表达"回到过去"）。Claude Code 则是线性记录 + 文件检查点。三种 JSONL，三种时间观。

## 检查点：模型请求与副作用前

`dsh-session-checkpoint-policy` 在**模型请求**与**工具副作用**之前打语义检查点。因为日志可回放，"回到某个检查点重来"等价于"截断日志 + 按需重放"——不需要 pi 那样的树结构，也能安全地反悔。

## 两层压缩

dsh 把"上下文快满了怎么办"拆成两层，每层各司其职：

![两层压缩 流程图](/diagrams/agents-dsh-session-and-compaction-2.png)

| | 第一层 `dsh-compaction-tool-result-pruner` | 第二层 `dsh-compaction-basic` |
| --- | --- | --- |
| 触发 | 结果超过阈值（默认 8192 字符） | token 压力达到 0.8 |
| 花费 | **零模型调用** | 一次 LLM 摘要调用 |
| 手段 | 头/尾保留 + 省略标记 | 重放前缀 + 生成 `<compacted-summary>` 标记消息 |
| 可逆性 | 完全可逆（原始在日志里） | 不可逆（但旧事件仍可从日志重建会话） |
| 人控 | 自动 | `/compact` 命令（`dsh-command-compact`） |

两个值得欣赏的细节：

1. **摘要前先重放前缀以复用 KV cache**。压缩本身也是一次模型调用，dsh 把要压缩的历史原样重放给模型（命中 prompt cache），再让模型输出摘要——省真金白银。
2. **压缩只改"表面"，不动"存储"**。日志里的旧事件还在，投影换了。这意味着理论上可以做"试验性压缩"再反悔——树状会话的分支能力，用事件溯源同样能表达。

超大工具文本另有 `dsh-spill*` 落盘机制：写文件、返回定位符，按需回读。

## goal：事件溯源的目标状态机

dsh 有一个 pi 和 Claude Code 都没有的显式概念：**goal（当前目标）**。

| 事实 | 说明 |
| --- | --- |
| 谁能操纵 | 人用 `/goal` 命令，模型用 goal 工具，Web 上有 GoalBar |
| 怎么记录 | 每次变更追加 `goal/change` 事件，带修订号 CAS 栅栏防竞态 |
| 状态机 | create / edit / pause / resume / complete / block / clear |
| **continuation authority 永不持久化** | 重启后目标还在，但要**显式 resume** 才会继续跑——防止"重启后无人监督的 Agent 自己复活" |
| 轮次上限 | goal 轮次驱动器默认 256 轮封顶，防失控循环 |

"目标活着，但授权不活着"是一个非常产品化的安全判断，值得记进你的设计笔记。

## 会话的周边能力

| 包 | 能力 |
| --- | --- |
| `dsh-session-query` + SQLite | 跨会话全文搜索（FTS5） |
| `dsh-session-title*` | 首条消息让 LLM 生成会话标题 |
| `dsh-session-stats` | 统计投影（token、轮次） |
| `dsh-session-telemetry-otel` | OpenTelemetry 遥测（可关） |
| `dsh-session-reference` | 跨会话引用 |
| `dsh-attachment*` | 内容寻址的附件存储 |

## 与 Pi、Claude Code 对照

| 话题 | Pi | Claude Code | DSH |
| --- | --- | --- | --- |
| 会话格式 | JSONL entry 树 | JSONL 线性记录 | JSONL.zstd 事件日志 + 投影 |
| 分支/回退 | 树分支，任意节点分叉 | 文件检查点回退 | checkpoint 事件 + 截断重放 |
| 压缩触发 | 上下文超限（可 hook） | 接近上限自动 + /compact | 结果裁剪(8192) + 压力 0.8 摘要 |
| 压缩成本 | 摘要模型调用 | 摘要模型调用 | 裁剪零成本 + 摘要复用 KV cache |
| 目标管理 | 无显式概念 | TodoWrite 任务清单 | goal 状态机 + 轮次上限 |

下一步：[配置即代码与 Presets](/agents/dsh/config-and-presets)，把这些能力装配起来的那套配置体系。

# opencode Agent 循环与工具系统

opencode 的循环有两套实现：V1 是用户实际在跑的 `runLoop`，V2 是 Effect 重写的 `SessionRunner`。本章先讲 V1 的真实行为，再用 V2 的契约注释看这个循环被重构成了什么形状。

## V1 主循环：runLoop

循环体在 `packages/opencode/src/session/prompt.ts`，骨架非常直白：

```text
while (true):
  1. 标记会话 busy，记录 step 计数
  2. 取任务：subtask / compaction / 溢出检测
  3. 组装提示词（含 SessionReminders 修补）
  4. llm.stream 流式请求（一个 provider turn）
  5. 处理流：文本 / 工具调用 / 结束原因
  6. 工具调用 → 权限求值 → 执行 → 结果回写
  7. 判断退出：没有待结算工具 + finish 不是 tool-calls → break
```

几个真实存在的工程细节：

| 细节 | 行为 |
| --- | --- |
| 退出条件 | 最后一条 assistant 消息有 `finish`、不属于 `["tool-calls","unknown"]`、没有未结算工具、且属于本轮用户消息 |
| 为什么这么绕 | 有些供应商带工具调用也返回 stop，所以必须继续循环把工具结果回传 |
| 步数上限 | `agent.steps ?? Infinity`，到上限注入「不要再调用工具，仅用文本总结」的提示 |
| 死循环保护 | `DOOM_LOOP_THRESHOLD = 3`，对应权限键 `doom_loop` |
| 首轮副作用 | `step === 1` 时 fork 出会话标题生成 |
| 工具并发 | **unbounded**——同一轮里模型发的多个工具调用全部并行，不等串行 |

和 pi 的对照很直接：pi 的 `runAgentLoop` 通过 hook 让产品层定制停止条件；opencode 把「什么时候停」写死在循环里，用 `steps` 配置和权限键做兜底。

## V2 运行器：把循环变成契约

V2 的 `core/src/session/runner/llm.ts` 顶部有一段 40 多行的设计契约注释，可以概括为四条规则：

![V2 运行器：把循环变成契约 流程图](/diagrams/agents-opencode-loop-and-tools-1.png)

四条规则各自解决一个真实问题：

1. **恰好一次 `llm.stream`**：杜绝重试风暴与重复计费；溢出重试只允许一次物理请求。
2. **先持久化再执行**：进程崩溃后能知道「哪些工具已经启动过」。
3. **await 工具 fiber**：一轮内的工具结果必须全部结算，循环才能推进。
4. **重载投影历史**：模型看到的历史从 SQLite 投影重建，而不是内存里的可变数组。

### 消息投递：durable 收件箱

V2 把"用户消息"也做成了持久化队列（`session_input` 表，双游标 `admitted_seq` / `promoted_seq`）：

| 投递方式 | 语义 |
| --- | --- |
| `steer` | 在下一个 provider-turn 边界 promote，立即影响走向 |
| `queue` | FIFO 排队，会话将空闲时一次 promote 一条 |

这与 pi 的 `steer()` / `followUp()`、DSH 的收件箱三原语是同一类机制——**"Agent 跑到一半人想插话"是所有成熟 Agent 都要回答的问题**，opencode 给的是数据库级答案。

### 崩溃恢复的诚实态度

启动新一轮前，上一进程遗留的 `running` 工具会被标记为 `Tool execution interrupted` 失败——**绝不静默重放副作用**。而"崩溃后自动续跑"在 V2 parity 清单里明确标为 deferred（还没做），教程不会替它宣称。

## 工具系统

### 工具清单（V1 注册表）

| 分组 | 工具 |
| --- | --- |
| 文件 | `read` · `write` · `edit` · `patch`（apply_patch） |
| 搜索 | `glob` · `grep` · `lsp`（符号与诊断） |
| 执行 | `bash`（持久 shell） |
| 编排 | `task`（子代理）· `todowrite` |
| 网络 | `webfetch` · `websearch` |
| 交互 | `question`（向人提问）· `plan_exit`（退出计划模式） |
| 技能 | `skill` |
| 实验 | `execute`（Code Mode：模型写 JS 组合工具，受限执行） |

工具注册表的接口签名值得注意：`tools({ providerID, modelID, agent, permission })`——**工具清单是按 模型 × agent × 权限 过滤后的结果**，不是一份固定的全局清单。同一个工具，换个 agent 或换个模型就可能不存在。

### 工具结果的有界化

工具输出有统一上限（行数或字节先到者），超限输出保留「首尾预览 + 受管输出文件绝对路径」，文件放在共享平铺目录、可过期。持久可重放的记录是**有界预览**而不是文件内容——和 pi 的截断、DSH 的 pruner、Claude Code 的 tool-results 落盘是同一个问题的四种答法。

### 并发与顺序

| 层面 | 行为 |
| --- | --- |
| 单轮内多工具 | unbounded 并行执行 |
| 事件发布 | Semaphore(1) 串行，保证 UI/存储看到一致顺序 |
| 会话之间 | 同会话串行、异会话并行（SessionRunCoordinator） |
| 结账点 | 工具结算事件携带所属 assistant 消息 ID，便于对账 |

## 与另外三个 Agent 对照

| 话题 | Pi | Claude Code | DSH | opencode |
| --- | --- | --- | --- | --- |
| 循环实现 | 独立核心包 | 引擎内置 | ReactLoopAgent | V1 runLoop / V2 Runner |
| 停止条件 | hook 可定制 | 引擎判断 | goal 状态机加持 | 写死 + steps/doom_loop 兜底 |
| 工具过滤 | 扩展装配 | 权限规则 | preset 组合 | **模型 × agent × 权限** |
| 运行中插话 | steer/followUp | 排队 | 收件箱三原语 | durable 收件箱（steer/queue） |
| 输出有界化 | 截断 | tool-results 落盘 | 结果裁剪 | 预览 + 受管文件 |

下一步：[权限与 Agents](/agents/opencode/permission-and-agents)——每个 agent 一套 Ruleset 是怎么工作的。
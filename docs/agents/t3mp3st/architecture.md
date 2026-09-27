# T3MP3ST 总体架构

<ArchifyEmbed src="/archify/t3mp3st-architecture.html" title="T3MP3ST 总体架构（Archify 交互图）" />

这一页回答三个问题：代码由哪些模块组成、从下达目标到执行经过哪些环节、单个任务内部的执行循环长什么样。

## 模块地图

| 模块 | 源码位置 | 职责 |
| --- | --- | --- |
| 三层接口 | `src/cli.ts` / `src/server.ts` / `src/mcp-server.ts` | CLI REPL、HTTP API（Express + SSE，端口 3333）、MCP server（stdio）；三种入口驱动同一套内部系统 |
| 战略层 | `src/general/index.ts`（OpGeneral） | 把自然语言目标转成结构化行动计划（OpPlan），启动并监控执行 |
| 编排器 | `src/index.ts`（TempestCommand） | 每秒一次调度循环：安全检查、任务生成、阶段推进、派发 |
| 操作员池 | `src/operators/index.ts`（OperatorCell） | 8 类角色的生成、容量限制、状态管理 |
| 执行循环 | `src/agent/index.ts`（AgentLoop） | 单个任务的执行：请求模型 → 调工具 → 看结果 → 迭代 |
| 工具层 | `src/arsenal/` | 工具注册表、审批门控、范围检查、执行历史 |
| 证据与任务 | `src/evidence/` + `src/mission/` | 证据校验、工作单、裁决、任务恢复 |
| 推理后端 | `src/llm/` + `src/agent/local-agents.ts` | 云模型、本地模型、本机 coding agent 三类推理来源的接入 |

一个值得注意的规模事实：最大的单文件是接口层的 `server.ts`（8276 行）——它除了路由，还承载工作单、监视信号与自愈动作（见[证据与复现](/agents/t3mp3st/evidence-and-receipts)）。

## 从目标到执行：三个环节

**环节一：战略规划（OpGeneral）。** `src/general/index.ts` 的输入是一段自然语言目标（可附约束、范围提示、紧迫度、OPSEC 偏好），输出是结构化的 OpPlan（行动代号、摘要、阶段划分）。随后按计划配置并启动编排器，并在执行过程中根据进展调整：转向、升级、撤退、重排优先级。对应 API：`/api/general/plan`（只规划）、`/api/general/execute`（执行已有计划）、`/api/general/auto`（规划加执行）。

**环节二：调度循环（TempestCommand）。** `tick()` 每 1 秒执行一次（`src/index.ts:824` 的定时器），五个动作按固定顺序：

![编排器：每秒一次的 tick 流程图](/diagrams/agents-t3mp3st-architecture-1.png)

1. OPSEC 检查：触发全局中止条件则暂停全部操作员；
2. 种任务：首轮有目标时，按声明式模板（`createReconTasks` / `createVulnScanTasks` / `createExploitTasks`…）把当前杀伤链阶段展开成具体任务，进入 `TaskQueue`（带优先级与依赖）；
3. 阶段推进：当前阶段任务全部完成后才进入下一阶段——阶段是顺序门，不跳步；
4. 任务派发：按角色匹配空闲操作员，派发前检查任务依赖；
5. 自动扩编：某类角色不足时自动生成，每类上限 3 个。

**环节三：任务执行（AgentLoop）。** 每个任务由一个操作员跑一个 ReAct 循环（`src/agent/index.ts`），参数与规则：

![一次任务的执行路径 流程图](/diagrams/agents-t3mp3st-architecture-2.png)

- 最多 15 轮迭代（`maxIterations` 默认值，`agent/index.ts:138`），超过后强制要求给出结论；
- 工具输出截断到 4096 字符再进上下文；
- 同一工具加相同参数的重复调用直接拒绝（防止原地打转）；
- 支持一次请求内并行多个工具调用；
- 产出的每条 finding 带 `provenance: 'tool'` 标记和原始工具输出——这个标记是后续证据校验的依据（见[证据与复现](/agents/t3mp3st/evidence-and-receipts)）。

数据流向：操作员的发现进入证据库（EvidenceVault），同步更新目标模型（Target：端口、服务、漏洞），使后续阶段的操作员自动拿到更完整的目标准备——各阶段之间通过这份共享数据衔接，不通过对话历史。

## 诚实边界：哪些是已验证的

README 的 "What ships today" 表与 WHITEPAPER 的 "How is real vs. scaffolding" 一节给出了明确状态，本章如实转述：

| 组件 | 状态 | 说明 |
| --- | --- | --- |
| Recon 引擎 | ✅ 稳定 | 真实执行 nmap/DNS/HTTP/指纹工具，发现可溯源到工具输出 |
| 任务引擎 + War Room + OpGeneral | ✅ 稳定 | keyless 模式经本机 agent 可用 |
| Arsenal / MCP / HTTP API | ✅ 稳定 | 默认 36 个工具，可选扩到 111 个 |
| 白盒源码分析 | ⚠️ 实验 | tree-sitter 多语言接入，部分语言 fail-open |
| Scanner / Exploiter / Infiltrator / Exfiltrator / Ghost 等 | ⚠️ 实验 | 跑同一个真实执行循环，但作为协同编队未做基准验证 |
| cloud / persistence / swarm / cognition 模块 | 🚧 计划 | `src/stubs/` 下是接口桩 |

所有公开基准数字来自**单 Agent 循环**（README 原文注明 "these ran a single-agent ReAct loop, not the 8-operator swarm"）。

## 与 AtkBrain 的架构对照

| 话题 | AtkBrain | T3MP3ST |
| --- | --- | --- |
| 状态中枢 | 攻击图（SQLite，入库校验） | 目标模型 + 证据库 + 工作单 |
| 编排方式 | 单主循环 + 御主按轮监督 | 每秒定时调度 + 角色池 + 战略层 |
| 行动规划 | 御主按轮出方案 | OpGeneral 一次性产出 OpPlan，执行中调整 |
| 外部接口 | API / WebSocket | CLI / REST / MCP |
| 状态标注 | V1/V2 parity 清单 | "what ships today" 状态表 + verify-claims 复算 |

下一步：[推理后端](/agents/t3mp3st/keyless-backbone)——框架怎么在不配 API key 的情况下获得推理能力。
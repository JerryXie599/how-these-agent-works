# T3MP3ST 是什么

T3MP3ST 是 [elder-plinius](https://github.com/elder-plinius/T3MP3ST) 开发的开源多 Agent 攻防框架（v1.0.0，AGPL-3.0）。主仓库 `src/` 下约 5.5 万行 TypeScript（最大单文件 `server.ts` 8276 行），另有约 2.8 万行的 War Room 单页界面。它只应在已获书面授权的目标上使用；本章只拆解架构与工程机制。

::: warning 授权使用边界
这是一个进攻性安全工具，仓库用整节篇幅声明：只可用于你拥有书面授权的目标。本章只拆解它的软件架构，不涉及攻击操作指导。
:::

## 它解决什么问题

本站前几个项目（pi / Claude Code / DSH / opencode）回答的是"一个 coding agent 自己怎么做好"。T3MP3ST 回答另一个问题：**已经有了一个能干活的 agent，怎么把它编进一支分工明确的队伍、给它配受控的工具、并且相信它交回来的结论。**

它的关键架构决定是：**框架自身不做 LLM 调用与推理。** 推理委托给外部——默认是你本机已经登录好的 coding agent（Claude Code、Codex、OpenCode 等，不需要再配 API key，README 称之为 keyless），也可以是云模型或本地模型。框架自己负责的是：编排、工具执行、结果校验。这种"推理外包、执行自留"的分工见[推理后端](/agents/t3mp3st/keyless-backbone)。

## 五层架构

![架构分层：五层 流程图](/diagrams/agents-t3mp3st-index-1.png)

| 层 | 职责 | 详见 |
| --- | --- | --- |
| 三层接口 | CLI REPL、HTTP API（Express + SSE，端口 3333）、MCP server（stdio），三种方式驱动同一套系统 | [总体架构](/agents/t3mp3st/architecture) |
| 战略层（OpGeneral，`src/general/`） | 输入一句自然语言目标，产出结构化行动计划（OpPlan），执行中按需调整 | [总体架构](/agents/t3mp3st/architecture) |
| 编排层（TempestCommand，`src/index.ts`） | 每秒一次调度循环：安全检查、任务生成、阶段推进、派发 | [操作员与杀伤链](/agents/t3mp3st/operators-and-killchain) |
| 执行层（8 个操作员，`src/operators/`） | 每个操作员是一类角色（探测、扫描、利用等），执行统一的 ReAct 循环 | [操作员与杀伤链](/agents/t3mp3st/operators-and-killchain) |
| 工具层（Arsenal，`src/arsenal/`） | 全部可执行动作的唯一入口：36 个内置工具（可扩到 111 个），带审批与范围检查 | [工具层与范围控制](/agents/t3mp3st/arsenal-and-gate) |

## 三个有代表性的机制

**推理与执行分离。** 被借用的 agent 只产出文本（计划、判断），它们的工具能力在调用时被显式关闭（只读沙箱、工具全禁、无工具模式）；一切有副作用的动作只能通过框架自己的工具层执行，并经过审批与范围检查。

**结论必须带证据。** 一个漏洞结论（finding）必须引用产生它的真实工具输出才能被采信；宣布"此路不通"必须引用源码中真实存在的防护代码，引用会被逐一核对，防止模型编造理由否定真漏洞。见[证据与复现](/agents/t3mp3st/evidence-and-receipts)。

**数字可复算。** README 里的每个基准数字都能用 `npm run verify-claims` 从仓库内提交的 JSON 工件重算，并且脚本开头明确声明这是"对自家工件的可复现性检查，不是第三方审计"。

## 诚实边界（项目自己声明的）

README 与 WHITEPAPER 都有专门的"哪些是真的"章节，本章如实转述：8 个操作员里**只有 Recon 是完整引擎**（真实执行 nmap/DNS/HTTP/指纹工具）；其余 7 个跑的是同一套真实执行循环，但**作为协同编队的效果没有经过基准验证**——所有公开数字来自单 Agent 循环。各章节末尾有对应的状态速查。

## 与本站其他项目的第一眼对照

| | Pi | Claude Code | DSH | opencode | AtkBrain | T3MP3ST |
| --- | --- | --- | --- | --- | --- | --- |
| 是什么 | 编码 Agent | 编码 Agent | 编码 Agent | 编码 Agent | 攻防平台（嵌入 Pi） | 攻防框架（推理外包） |
| 推理来源 | 自带供应商层 | 自家模型 | 多供应商 | 多供应商 | 外部 Pi 运行时 | 本机 coding agent / 云 / 本地模型 |
| 组织单元 | 单 agent + 扩展 | 主循环 + 子代理 | preset | 每 agent 权限 | 自循环 + 御主-从者 | 8 类角色 + 杀伤链 |
| 权限模型 | 扩展 hook | 六模式 + 规则 | fail-closed 审批 | 每 agent Ruleset | 四道闸 + 代理链 | 工具风险分级 + 批准审计 + 范围拦截 |

## 章节导航

| 顺序 | 页面 | 内容 |
| --- | --- | --- |
| 0 | [任务实况](/agents/t3mp3st/walkthrough) | 跟着一次真实格式的执行从头走到尾，先建立整体画面 |
| 1 | [总体架构](/agents/t3mp3st/architecture) | 模块地图、战略层、每秒调度循环、执行循环参数 |
| 2 | [推理后端](/agents/t3mp3st/keyless-backbone) | 怎么复用本机已登录的 agent、认证处理、降权、回退链 |
| 3 | [操作员与杀伤链](/agents/t3mp3st/operators-and-killchain) | 8 类角色、状态机与禁用、调度、任务模板 |
| 4 | [工具层与范围控制](/agents/t3mp3st/arsenal-and-gate) | 工具清单、审批门控、范围拦截 |
| 5 | [证据与复现](/agents/t3mp3st/evidence-and-receipts) | 证据门、工作单、反驳裁决、数字复算 |
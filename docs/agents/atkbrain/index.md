# AtkBrain 是什么

AtkBrain（完整名 StrikeAgent_AtkBrain-Flash，夜安团队 SEC 开发，AGPL-3.0-only 协议，商业使用需单独授权）是一个 **AI 渗透测试平台**：给定一个已授权的测试目标，它自动执行探测、利用、验证，并产出漏洞报告。它只应在有明确书面授权的环境中使用；本章只拆解它的软件架构，不涉及渗透方法本身。

::: tip 资料来源
本章按 v0.7.0-beta.3 源码核对。所有结论来自项目源码（`backend/atkbrain/`、`frontend/`、`pi/extensions/`）与项目内 README，关键机制标注了对应文件。
:::

## 组成

整个系统由四部分组成：

| 部分 | 位置 | 职责 |
| --- | --- | --- |
| 控制台 | `frontend/` | React 18 + TypeScript + Vite 单页应用。提供项目列表、攻击图可视化（d3-force）、时间线、漏洞库、对话界面，通过 REST 和 WebSocket 与后端通信 |
| 后端 | `backend/atkbrain/`（Python 3.12 + FastAPI + SQLite，约 4.9 万行） | 平台主体：任务编排、循环引擎、工具执行、权限守卫、攻击图存储、记忆库、报告生成、登录鉴权 |
| 运行时 | 外部 npm 包 Pi（`@earendil-works/pi-coding-agent`） | 以子进程方式提供"能调用工具的对话循环"：模型请求、流式解析、工具调用协议、会话内上下文压缩都由 Pi 完成，模型为 deepseek-flash |
| 桥接扩展 | `pi/extensions/atkbrain-tools.ts`（约 120 行） | 唯一连接 Pi 与后端的通道：拦截 Pi 内置工具、从后端拉取工具清单注册、把每次工具调用转发回后端 |

理解这个划分的关键是：**平台自己的代码里没有 LLM 对话循环。** 循环（请求模型、解析流、调用工具、压缩上下文）全部由外部 Pi 进程完成；平台代码负责的是循环之外的一切——什么时候开始下一轮、工具能不能执行、结果怎么落到图上、什么时候结束。

## 技术栈

| 项 | 事实 |
| --- | --- |
| 后端语言 | Python 3.12，FastAPI + aiosqlite + pydantic-settings + argon2 |
| 前端 | React 18 + TypeScript + Vite + d3-force（攻击图布局） |
| 运行时 | Pi CLI（`pi --mode rpc`），模型 deepseek-flash |
| 存储 | 单库 SQLite（WAL 模式）：项目、攻击图节点/边、发现、Intent、记忆、事件、账号都在一个库里 |
| 部署 | Docker（Kali 基础镜像）+ Caddy 终结 TLS；控制台端口 2334，API 端口 2333 |
| 依赖特点 | 没有 openai SDK、没有 LangChain——所有模型调用都通过拉起 Pi 子进程完成 |

## 运行方式

部署后打开控制台，新建任务（单目标或集群，分红队 / CTF / SRC 三条赛道），引擎开始自动循环；人在对话框里发的指令会立刻打断当前轮次。执行过程中控制台实时显示攻击图、时间线和每一步工具调用。结束后平台生成 HTML/PDF 交付报告。

## 与本站其他 Agent 的关系

AtkBrain 是本站五个 Agent 里唯一**把另一个 Agent（Pi）当作运行时组件**的项目。对照：

| | Pi | Claude Code | DSH | opencode | AtkBrain |
| --- | --- | --- | --- | --- | --- |
| 定位 | coding harness | coding agent | 配置即代码 harness | 可嵌入 server 的 agent | 攻防平台（运行时嵌 Pi） |
| 对话循环 | 自有 | 自有 | 自有 | 自有 | 外包给 Pi 子进程 |
| 状态存于 | 会话 JSONL 树 | 会话 JSONL | 事件溯源日志 | SQLite 投影 | 攻击图（SQLite） |
| 每轮上下文 | 会话续接 | 会话续接 | 会话续接 | 会话续接 | 每轮重建，状态在图 |
| 执行控制 | 扩展 hook | 权限模式 + Hooks | fail-closed 审批 + 沙箱 | 每 agent Ruleset | 四道闸 + 代理链 |

## 章节导航

| 顺序 | 页面 | 内容 |
| --- | --- | --- |
| 0 | [任务实况](/agents/atkbrain/walkthrough) | 跟着一次真实格式的执行从头走到尾，先建立整体画面 |
| 1 | [总体架构](/agents/atkbrain/architecture) | 后端目录职责、一次任务与一次工具调用的完整流转、Pi 进程管理 |
| 2 | [攻击图](/agents/atkbrain/attack-graph) | 核心数据结构：节点/边类型、写入校验、读取方、Intent 管理 |
| 3 | [自循环与御主-从者](/agents/atkbrain/loop-and-supervision) | 主循环结构、三种角色、停止判定、御主问询与方案绑定 |
| 4 | [执行安全](/agents/atkbrain/safety-gates) | 工具执行前的四道闸门与代理链 |
| 5 | [反夸大、记忆与报告](/agents/atkbrain/memory-and-report) | 二次验证、评级、记忆蒸馏、报告生成 |

建议顺序阅读。如果只关心一个设计，读[攻击图](/agents/atkbrain/attack-graph)——其余机制都围绕它展开。
# 架构图合集

一页看全本站所有 Archify 交互架构图。每张图都支持：缩放平移、引导视图探索、明暗主题切换、4× 高清导出。嵌入预览是完整画布的等比缩放，需要原生交互时点 **「放大体验 ⛶」** 全屏，或 **「新窗口打开 ↗」** 独立查看。

| 架构图 | 直接打开 | 对应章节 |
| --- | --- | --- |
| 同一个循环（总览工作流） | [agents-overview.html](/archify/agents-overview.html) | [总览：同一个循环](/agents/) |
| Pi 总体架构 | [pi-architecture.html](/archify/pi-architecture.html) | [Pi 的总体架构](/concepts/pi-architecture) |
| Claude Code 总体架构 | [claude-code-architecture.html](/archify/claude-code-architecture.html) | [Claude Code 总体架构](/agents/claude-code/architecture) |
| DSH 总体架构 | [dsh-architecture.html](/archify/dsh-architecture.html) | [DSH 总体架构与启动链路](/agents/dsh/architecture) |
| opencode 总体架构 | [opencode-architecture.html](/archify/opencode-architecture.html) | [opencode 总体架构](/agents/opencode/architecture) |
| AtkBrain 总体架构 | [atkbrain-architecture.html](/archify/atkbrain-architecture.html) | [AtkBrain 总体架构](/agents/atkbrain/architecture) |
| T3MP3ST 总体架构 | [t3mp3st-architecture.html](/archify/t3mp3st-architecture.html) | [T3MP3ST 总体架构](/agents/t3mp3st/architecture) |
| CyberStrike 总体架构 | [cyberstrike-architecture.html](/archify/cyberstrike-architecture.html) | [CyberStrike 总体架构](/agents/cyberstrike/architecture) |
| AtkBrain 自循环（工作流） | [atkbrain-loop.html](/archify/atkbrain-loop.html) | [AtkBrain 自循环与御主-从者](/agents/atkbrain/loop-and-supervision) |
| 教程站点总体架构 | [site-architecture.html](/archify/site-architecture.html) | [如何新增一个 Agent](/agents/extend) |

---

## 总览：同一个循环

六个项目共享的主循环：组装上下文 → 请求模型 → 权限闸门 → 执行工具 → 回写。先看这张，再对照下面几张架构图找差异。

<ArchifyEmbed src="/archify/agents-overview.html" title="同一个循环：六个项目" />

---

## Pi 总体架构

三层分包的终端 coding harness：产品层 `pi-coding-agent` 包着核心运行时 `pi-agent-core`，模型协议层 `pi-ai` 把供应商差异关在最外圈。三个引导视图分别对应主链路、副作用拦截、持久化与资源。

<ArchifyEmbed src="/archify/pi-architecture.html" title="Pi 总体架构：三个包如何分工" />

---

## Claude Code 总体架构

一个引擎、多端入口（CLI / IDE / Desktop/Web），所有副作用按固定顺序过两道闸门（PreToolUse hook → 权限决策），磁盘状态集中在 `~/.claude/`。三个引导视图对应主链路、一次工具调用的闸门顺序、长会话与记忆。

<ArchifyEmbed src="/archify/claude-code-architecture.html" title="Claude Code 总体架构" />

---

## DSH 总体架构

配置即代码的 cordis 插件树：profile 叠 patch 层挂载出 Host / Agent 双平面，浏览器 Client 平面本身也是插件系统，会话走事件溯源日志。三个引导视图对应启动主链路、工具调用闸门、preset 与压缩。

<ArchifyEmbed src="/archify/dsh-architecture.html" title="DSH 总体架构" />

---

## opencode 总体架构

以可嵌入 server 为中心的 Bun + Effect 架构：TUI / Desktop / IDE / ACP 全部是 server 的客户端，HTTP + SSE 通信（本地退化为进程内 RPC），SQLite 存会话。三个引导视图对应主链路、工具闸门、持久化与外部服务。

<ArchifyEmbed src="/archify/opencode-architecture.html" title="opencode 总体架构" />

---

## AtkBrain 总体架构

把 Pi 当运行时的攻防平台：控制台 → API → 自循环引擎 → Pi 子进程池，工具调用经扩展桥回后端过四道闸，攻击图是唯一状态中枢。三个引导视图对应控制台到运行时、一次工具调用的闸门链、状态监督与沉淀。

<ArchifyEmbed src="/archify/atkbrain-architecture.html" title="AtkBrain 总体架构" />

---

## T3MP3ST 总体架构

借脑型攻防框架：三层接口 → OpGeneral 战略层 → TempestCommand 每秒 tick 编排 → 8 操作员池 → ReAct 循环，推理交给本机已登录的 coding agent（keyless），所有可执行动作收归 Arsenal，门控 fail-safe、出界目标执行前 SCOPE DENIED。三个引导视图对应主链路、执行闸门、证据与复现。

<ArchifyEmbed src="/archify/t3mp3st-architecture.html" title="T3MP3ST 总体架构" />

---

## AtkBrain 自循环（工作流）

御主-从者循环的运行视角：人工指令打断本轮，引擎每轮重建简报后 fanout 工人，工人工具调用过四道闸，从者写图、简报从图重建——状态外置的循环闭环。三个引导视图对应从指令到工人、图怎么喂回下一轮、御主与闸门。

<ArchifyEmbed src="/archify/atkbrain-loop.html" title="AtkBrain 自循环：御主-从者" />

---

## 教程站点总体架构

本站自己是怎么组装的：Archify 规格经 showcase 校验交付为自包含 HTML、mermaid 源码离线渲染为 PNG，两条资产管线汇入 VitePress 站点；`agents.mjs` 注册表一处驱动侧边栏与首页。三个引导视图对应交互图管线、流程图管线、注册表与教学代码。

<ArchifyEmbed src="/archify/site-architecture.html" title="教程站点总体架构" />

---

## CyberStrike 总体架构

opencode 的攻击性安全分叉：继承 opencode 的 server / 会话库 / 多供应商骨架，叠加 23 个安全智能体、hackbrowser → 分析 → 编排 → 9 个分类测试器的代理流水线、7,662 个技能文件与方法论引擎。三个引导视图对应主链路、代理测试流水线、技能注入与报告。

<ArchifyEmbed src="/archify/cyberstrike-architecture.html" title="CyberStrike 总体架构" />

---

## 想改图或新增？

规格 JSON 在仓库 `archify-specs/` 下，改完用 Archify 重新校验交付即可；新增 Agent 的完整流程见[如何新增一个 Agent](/agents/extend)。

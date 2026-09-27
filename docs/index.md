---
layout: home
hero:
  name: AI Agent 原理与实现
  text: 拆解 pi · Claude Code · DSH · opencode · AtkBrain · T3MP3ST · CyberStrike
  tagline: 同一个 Agent 循环，从 coding agent 到攻防框架的七种工程化实现。逐层拆给你看。
  image:
    src: /logo.svg
    alt: AI Agent 教程
  actions:
    - theme: brand
      text: 从总览开始
      link: /agents/
    - theme: alt
      text: 直接看 Pi 实现
      link: /concepts/what-is-agent
features:
  - title: 七个项目，一个形状
    details: pi、Claude Code、DSH、opencode、AtkBrain、T3MP3ST、CyberStrike 共享同一套「组装上下文 → 请求模型 → 过闸门 → 执行工具 → 回写」的循环。先看共性，再比较差异。
    link: /agents/
  - title: 交互式架构图
    details: 每个项目配有 Archify 生成的可交互架构图：缩放、视图探索、明暗主题，支持一键导出。
    link: /architectures
  - title: 不是源码翻译
    details: 先建立最小心智模型，再逐层拆解实现。每一节都回答「为什么需要这一层」。
    link: /concepts/what-is-agent
  - title: 渐进式 Demo 与可运行项目
    details: 四个核心 Demo 覆盖循环、工具、会话树、压缩；最后实现一个 React + Node + TypeScript 的教学版 Agent。
    link: /project/overview
---

## 从一张流程图开始

下面这张交互式流程图是整个站点的地图：七个项目都在跑同一个循环。差异不在循环本身，而在界面形态、权限闸门的严格程度和持久化格式。点击图中的「播放故事」或切换视图，可以先建立整体印象，再进入各项目的章节。

<ArchifyEmbed src="/archify/agents-overview.html" title="同一个循环：七个项目" />

## 七个项目怎么选

本站解析分两类：**通用 coding agent**（pi、Claude Code、DSH、opencode——帮人在终端写代码）与**渗透 agent**（AtkBrain、T3MP3ST、CyberStrike——在已授权环境下做攻击面侦察与漏洞验证，仅限授权使用）。两类共用同一个循环骨架，对照着读最能看清"哪些是本质、哪些是场景特化"。

| | Pi | Claude Code | DSH | opencode | AtkBrain | T3MP3ST | CyberStrike |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 一句话定位 | 小核心 + 扩展的终端 coding harness | Anthropic 官方多端 coding Agent | DeepSeek 的配置即代码 Harness | 以可嵌入 server 为中心的 coding agent | 攻击图驱动的 AI 渗透平台（运行时嵌 Pi） | 借本机 agent 当大脑的多 Agent 攻防框架 | opencode 的攻击性安全分叉（13+ 安全智能体） |
| 源码可见性 | 开源，可逐行读 | 闭源，按官方文档与行为拆解 | 启动器开源，组件为 npm 包 | 开源，含完整设计文档（specs） | 开源 AGPL（商用需授权），仅限授权环境 | 开源 AGPL，含白皮书与功能状态表 | 开源 AGPL，与 opencode 逐文件同源可比 |
| 扩展机制 | `.pi/` 扩展 + hooks | Skills · 插件 · MCP · Hooks | cordis 插件树 + profile 叠层 | 自定义 agent/command/tool + plugin + MCP + LSP | Pi 扩展桥 + 后端工具表动态注册 | Arsenal 工具 + 操作员 archetype + MCP | 继承 opencode 插件体系 + Ed25519 签名技能库 |
| 权限闸门 | 扩展 `tool_call` hook | 权限模式 + allow/ask/deny + Hooks | fail-closed 审批 + 系统级沙箱 | 每 agent 一套 Ruleset（ask/allow/deny） | 四道闸（命令/范围/可达/身份）+ 代理链 | 工具风险层批准 + 执行前 Scope 拦截 | Ruleset 当攻击面纪律：测试器封直连、编排器零权限 |
| 会话持久化 | JSONL entry 树 | JSONL 记录 + 检查点 | 事件溯源日志 + 投影 | SQLite + 可重放事件流 | SQLite 攻击图（状态中枢） | 任务/证据/回执台账（bench/ 即收据库） | SQLite + 16 张安全新表（漏洞/请求/凭据/覆盖率） |
| 上下文压缩 | 摘要 entry 承接 | 自动压缩 + /compact | 结果裁剪 + LLM 摘要两层 | 结构化滚动摘要 + Context Epoch | 不用长会话：每轮重建，状态外置 | 不适用：借脑式一次性调用 | 继承 opencode 压缩 + 技能按需加载 |
| 技术栈 | TypeScript | 闭源 | cordis / TS | Bun + Effect + SolidJS | Python FastAPI + React + Pi RPC | TypeScript + Express + MCP | Bun + OpenTUI（opencode 同源） |

- 想**读懂源码、自己实现一个**：从 [Pi](/agents/pi/) 开始，它开源、分层清晰，配套渐进式 Demo 和教学版项目。
- 想理解**产品级 Agent 怎么管权限和上下文**：读 [Claude Code](/agents/claude-code/)，它的权限模式与 Hooks 设计是业界参考。
- 想看**配置即代码、一切皆插件**的激进设计：读 [DSH](/agents/dsh/)，它的 profile 叠层和事件溯源会话很有启发性。
- 想看**服务端/客户端边界怎么画**、多端复用一个引擎：读 [opencode](/agents/opencode/)，server 可嵌入是它的第一原理。
- 想看 **Pi 被嵌进真实产品**、状态外置到图、执行被闸门看守：读 [AtkBrain](/agents/atkbrain/)，它是长任务 Agent 工程化的极端样本。
- 想看**已有 agent 怎么被组队、发武器、并建立证据链**：读 [T3MP3ST](/agents/t3mp3st/)，"借脑不借权"与 verify-claims 复现文化值得学。
- 想看**同一个骨架怎么垂直化成安全工具**：读 [CyberStrike](/agents/cyberstrike/)，它与 opencode 章节逐文件对照着读效果最好。

## 这套教程适合谁

你不需要已经写过 Agent 框架，但最好具备这些基础：TypeScript、Node.js、HTTP API、React 的基本状态管理，以及能读懂一些异步代码。

这套教程默认读者是计算机本科毕业生：已经知道“调用大模型 API”是什么，但还没有把“模型、工具、状态、流式事件、会话持久化”串成一个完整系统。

## 站点中的代码

教程中的小 Demo 位于 `examples/demos/`，最终项目位于 `examples/teaching-agent/`。你可以先读概念，再运行代码；也可以反过来，先跑起来再回头看解释。

## 联系与赞助

原 README 里的作者联系方式与赞助二维码已经整理到 [联系与赞助](/contact)。如果这套教程帮你把 Agent 系统想清楚了，欢迎去那里找作者继续交流。

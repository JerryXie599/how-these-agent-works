# Pi 是什么

Pi（[earendil-works/pi](https://github.com/earendil-works/pi)）是一个小核心的终端 coding agent。整篇教程就是研究它"自己怎么做"——架构、循环、工具、会话、上下文、扩展。代码量小但每行都对着真实工程问题，是学好 Agent 系统的首选入门样本。

::: tip 版本与资料来源
本章按 **pi v0.87.0** 源码核对。所有结论来自项目内 README、源码（`packages/ai` / `packages/agent` / `packages/coding-agent`）以及教程自带的源码拆解。
:::

## 怎么读这一章

按其他 Agent 章节同样的固定槽位组织：

| 顺序 | 页面 | 内容 |
| --- | --- | --- |
| 1 | [总体架构](/agents/pi/architecture) | pi 的三层分包：`pi-ai` / `pi-agent-core` / `pi-coding-agent` 各自负责什么 |
| 2 | [Agent 循环与工具系统](/agents/pi/loop-and-tools) | 一次请求的完整链路、消息/事件/状态、内置工具与扩展插槽 |
| 3 | [会话、压缩与扩展机制](/agents/pi/sessions-and-context) | JSONL 会话树与分支、上下文压缩、`.pi/` 资源加载、技能与扩展 |
| 4 | [源码拆解](/agents/pi/source-map) | 关键文件路径与"应该看哪几行"指南 |

如果你要照着做一遍：站点保留了原教学版项目在 `examples/teaching-agent/`，是个 React + Node + TypeScript 的简化版 Pi，可以独立运行。

## 与本站其他项目的对照

本站其它 Agent（Claude Code / DSH / opencode / AtkBrain / T3MP3ST / CyberStrike）都基于一个事实：循环骨架相同，差异在于"哪一层做哪个决定"。Pi 是这个循环的最早样本——其它项目都在它的基础上做变体。回到[总览：同一个循环](/agents/)可以看完整对照。
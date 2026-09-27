# 子代理、MCP 与扩展

当一个上下文窗口不够用时，Claude Code 的答案是"开分身"；当内置工具不够用时，答案是"接外挂"。本章讲清这两种扩展，外加 Skills 与插件体系。

## 子代理：Task 工具与独立上下文

主循环觉得一件事"值得单独开一个上下文"时，会通过 `Agent`（Task）工具委派一个子代理：

![子代理：Task 工具与独立上下文 流程图](/diagrams/agents-claude-code-subagents-and-mcp-1.png)

关键事实：

- **独立上下文窗口**。子代理的搜索、试错、大量中间输出不占主代理的窗口，只有最终报告回写。这是对抗上下文膨胀的编排手段，与压缩正交。
- **可并行**。多个子代理同时跑不同子任务，主代理汇总。架构图里 `SubagentStart` / `SubagentStop` hook 就挂在这条路径上。
- **transcript 落盘**。每个子代理的完整记录存在 `projects/<slug>/<session>/subagents/`，可回溯它到底干了什么。
- **类型与记忆**。子代理可定制（如只读的 Explore 型），`memory: user` 的子代理还拥有跨会话的 `agent-memory/`。

Pi 没有内置子代理，但 DSH 有 spawn/fork 两种委派模式——三者对照在本章末尾。

## MCP：外挂工具的标准协议

MCP（Model Context Protocol）是连接外部工具与数据源的开放标准。Claude Code 里每个 MCP 服务器暴露的工具进入工具表时统一命名：

```text
mcp__<server>__<tool>       # 普通 MCP 工具
mcp__plugin_<plugin>_<server>__<tool>   # 插件自带的 MCP 工具
```

工程上值得注意的三点：

1. **权限规则原生覆盖 MCP**。`mcp__server`、`mcp__server__*`、`mcp__server__tool` 三种粒度都能写进 allow/deny；MCP 工具和其他工具过同一道权限闸门。
2. **服务器来源分层**：用户级（`~/.claude.json`）、项目级 `.mcp.json`、插件自带——与设置分层思想一致。
3. **Elicitation 事件**：MCP 服务器向用户要输入时触发 hook，人机交互也被协议化了。

对比 pi：pi 通过扩展系统把外部服务包成工具（同一张工具 schema 表）；Claude Code 选择支持行业标准协议，让生态而不是仓库本身生产工具。

## Skills 与插件：把流程沉淀成资产

| 概念 | 形态 | 解决什么问题 |
| --- | --- | --- |
| Skill | 一个目录 + SKILL.md（含触发描述） | 把"做某类事的方法"教给模型，按需展开 |
| Slash command | 一条 `/命令` + Markdown 提示模板 | 把常用 prompt 固化成一键操作 |
| Hook 配置 | `hooks/hooks.json` | 插件可以自带闸门逻辑 |
| 插件 | 以上打包 + 版本化市场分发 | 整套能力一键安装、跨项目共享 |

Skills 的机制尤其值得学：SKILL.md 的 frontmatter 写"什么时候用我"，模型在合适时机调用 `Skill` 工具把全文展开进上下文——**上下文按需付费**，而不是一股脑塞系统提示。pi 的技能机制与之同构。

## Agent SDK：把引擎交给你编排

`@anthropic-ai/claude-agent-sdk` 是官方 SDK 形态：无 UI、headless 运行同一个引擎，把编排权交给你的程序。你能拿到：

- 每条消息与工具调用的流式事件（类似 pi 的 `AgentEvent` 流）；
- 自定义工具与 MCP 配置；
- `canUseTool` 回调——权限决策不再是弹窗，而是你代码里的一个函数；
- 会话恢复与 fork。

pi 从第一天就是 SDK 优先的设计（`createAgentSession()`）；Claude Code 是产品先行、SDK 后补。殊途同归说明一件事：**引擎与 UI 分离，是所有 Agent 最终都会收敛到的架构**。

## 三 Agent 扩展机制对照

| 话题 | Pi | Claude Code | DSH |
| --- | --- | --- | --- |
| 子代理 | 无内置 | Task 工具 + subagent 目录 | spawn / fork + report 续接 |
| 外部工具 | 扩展系统包装 | MCP 标准 + 内置工具 | MCP client + cordis 工具 |
| 技能 | `.pi/skills` SKILL.md | Skills + 插件市场 | skill 注册表 + 文件系统发现 |
| 注入方式 | 扩展 hook 改上下文 | hooks + Skills + MCP 三通道 | patch 叠层 + 运行时自指 cordis 工具 |
| 极端程度 | 中：核心稳定 + 扩展 | 高：通道多但各自收敛 | 激进：模型可以自己写插件挂载 |

DSH 那一格的"模型自己写插件"不是笔误——它把 cordis 框架本身做成了模型可操作的工具（`cordis_define` / `cordis_run`），这是下一章的主角。

→ 继续读 [DSH 是什么](/agents/dsh/)

# opencode 扩展机制

opencode 的扩展面是四个 Agent 里最宽的：自定义 agent、命令、工具、插件、MCP、LSP、技能、编辑器协议——每条通道都有自己的约定。本章按"从轻到重"过一遍。

## 扩展全景图

![扩展全景图 流程图](/diagrams/agents-opencode-extendability-1.png)

## 一、自定义 Agent（Markdown）

在 `{agent,agents}/**/*.md` 放一个 Markdown 文件，frontmatter 写配置、正文当提示词：

```markdown
---
description: 只为审查 PR 的只读 agent
mode: subagent        # primary | subagent | all
model: anthropic/claude-sonnet-4-5
permission:
  edit: deny
  bash: { "git *": allow }
---
你是代码审查员。只读代码，发现问题时给出最小修复建议。
```

可配字段：模型、temperature、`steps` 步数上限、`permission`（注意 `tools: {name: boolean}` 是已废弃写法，内部会归一化成权限）。也可以全部写在配置文件里。

**这套设计值得学的点**：agent = 提示词 + 模型 + 权限，三者一处声明。Claude Code 的子代理更像"任务"（临时委派），opencode 的 agent 更像"岗位"（有固定权限边界）。

## 二、自定义 Command（Markdown）

`{command,commands}/**/*.md`，支持 `$ARGUMENTS` 与位置参数 `$1..$n`；内置 `init`、`review` 两个命令。MCP 服务器暴露的 prompt 和技能也能作为命令来源——命令表统一管理 `command / mcp / skill` 三种来源，还能标记 `subtask` 让它以子任务形式执行。

## 三、自定义 Tool（TypeScript）

`{tool,tools}/*.{js,ts}` 目录下的文件，导出即注册，文件名/导出键就是工具名。插件也可以通过 `tool` 字段注册工具，工具参数沿用过 Zod 兼容层并保留原始 JSON Schema。

## 四、Plugin（npm / 本地 / git）

配置 `plugin: [...]` 接受 npm 包名、本地路径或 git 地址；本地目录 `{plugin,plugins}/*.{ts,js}` 也会加载。加载器保留每条插件的 `Origin`（来自哪个配置文件、global 还是 local），所以排查"这个插件哪来的"有据可查。

V2 内核的 `PluginHost` 暴露的是**按领域划分的 hook 域**：`agent / command / skill / provider / model / catalog / credential / integration / reference / aisdk`。约定是「输入不可变、输出走 Immer draft、可 cancel、顺序触发」——和 DSH 的 cordis 插件行相比，opencode 的插件更面向"领域扩展"而不是"重新组装系统"。

## 五、MCP 与 LSP：外部世界的两个标准接口

| | 支持情况 |
| --- | --- |
| MCP local | stdio：command / cwd / environment / timeout |
| MCP remote | url / headers / OAuth（client_id、scope、callback_port、redirect_uri） |
| MCP 能力 | 目前只开 `roots`；sampling / elicitation / tasks 被显式注释掉并附了 issue 号 |
| LSP | 内置 server 生命周期管理，诊断与符号通过 `lsp` 工具和 read 附带诊断暴露给模型 |

LSP 集成是 opencode 的差异化能力：模型读文件时能同时看到编译器诊断，改完代码能立刻知道有没有引入类型错误——**把编辑器的反馈循环搬进了 Agent**。

## 六、技能与协议出口

- **Skill**：`SKILL.md` 目录发现（含远端下载与缓存），路径做严格安全校验（拒绝 `..`、URL、绝对路径、编码绕过）。
- **ACP**：`opencode acp` 通过 Agent Client Protocol 把 agent 暴露给编辑器。
- **GitHub Action**：在 PR 评论 `/opencode fix this`，机器人开分支改代码并提 PR。
- **VS Code 扩展**：`sdks/vscode`。
- **会话分享**：`share_url` + share/unshare 端点，跨机器查看同一条会话。

## 四个 Agent 的扩展机制总对照

| 通道 | Pi | Claude Code | DSH | opencode |
| --- | --- | --- | --- | --- |
| Agent 定义 | 无（单 agent + 扩展） | `.claude/agents` 子代理 | preset 组合 | **Markdown frontmatter** |
| 命令/技能 | 提示模板 + `.pi/skills` | Slash command + Skills | `/compact`/`/goal` + skill | command md + SKILL.md |
| 工具扩展 | 扩展系统 | MCP | cordis 工具 + MCP | **{tool,tools}/*.ts + plugin + MCP** |
| 插件体系 | `.pi/` 扩展 | 插件市场 + hooks | **cordis 插件树** | plugin + V2 PluginHost |
| 语言服务 | 无 | 无 | 无 | **内置 LSP 集成** |
| 编辑器/CI | RPC 集成 | VS Code / GitHub Actions | — | **ACP / VS Code / GitHub Action** |
| 极端设计 | 核心极小 | 通道多而收敛 | 模型自己写插件 | **server 可嵌入 + SDK 反射生成** |

四家的路线其实很好记：**pi 追求核心纯度，Claude Code 追求产品完整度，DSH 追求配置自由，opencode 追求服务边界**。读到这里，[总览页](/agents/)那张大表应该每一格都有温度了。

想把这些结构复用到一个自建 Agent 上？回到[教学版目标项目](/project/overview)看 pi 路线的实现；想给本站加第五个 Agent 讲解？看[如何新增一个 Agent](/agents/extend)。
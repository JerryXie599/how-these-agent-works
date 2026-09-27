# 权限模式与 Hooks

如果说 Agent Loop 是 Claude Code 的骨架，权限系统就是它的免疫系统。这一层的设计深度是三个 Agent 里最高的：**六种权限模式 × 一套规则语法 × 一套 hooks 事件**，三层叠在一起。

## 六种权限模式

模式决定"默认姿态"：没被规则覆盖的调用按什么处理。

| 模式 | 行为 | 适用场景 |
| --- | --- | --- |
| `default`（manual） | 每个工具首次使用时弹窗询问 | 默认；手动审批 |
| `acceptEdits` | 自动接受文件编辑与常见文件系统命令（mkdir、touch、mv、cp） | 信任编辑、盯防命令 |
| `plan` | 只读：能读文件、跑只读命令，不能改源码 | 让模型先出计划 |
| `auto` | 自动批准调用，后台分类器核验动作与请求是否一致 | 熟练后的日常档 |
| `dontAsk` | 会弹窗的一律自动拒绝（预批准规则照常放行） | 无人值守但要求保守 |
| `bypassPermissions` | 跳过询问（仍受少部分保护路径约束） | 容器/虚拟机里跑批 |

三个工程细节值得注意：

- 启动模式由设置的 `permissions.defaultMode` 决定；`auto` 与 `bypassPermissions` **不允许**来自项目级设置——防止仓库作者替使用者开危险模式。
- 计划模式（plan）是权限系统的一部分，不是独立功能：它就是"只读权限集"。退出计划模式（ExitPlanMode）需要用户批准。
- 模式可以在会话中切换（Shift+Tab 循环），也可以被 `--permission-mode` 覆盖。

## 规则语法：allow / ask / deny

规则长这样：

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)", "Read(~/projects/**)"],
    "ask": ["Bash(git push *)"],
    "deny": ["Read(./.env)", "WebFetch(domain:evil.example)"]
  }
}
```

| 语法要素 | 含义 |
| --- | --- |
| `Bash(npm run build)` | 精确匹配单条命令 |
| `Bash(npm run *)` | 前缀通配；复合命令需每个子命令都命中 |
| `Read(path)` / `Edit(path)` | gitignore 风格路径：`~/`、`//`、`./`、`!` 反选 |
| `WebFetch(domain:example.com)` | 域名约束，支持 `*` 通配 |
| `mcp__server__*` | 按 MCP 服务器或工具名匹配 |

求值顺序是硬性的：**deny → ask → allow，先匹配先赢**。deny 无法被 allow 局部豁免——`Bash(aws *)` 的 deny 会压住 `Bash(aws s3 ls)` 的 allow。这个"宁可错杀"的顺序是安全系统的正确姿势。

规则来自分层设置（企业托管 > 命令行 > 项目 local > 项目 shared > 用户），列表类键跨层合并。分层细节与 DSH 的 patch 叠层异曲同工，对照见[DSH 的配置章](/agents/dsh/config-and-presets)。

## Hooks：把"你的代码"插进循环

Hooks 是在固定事件点上执行你配置的处理器。配置长这样：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "./scripts/guard.sh" }]
      }
    ]
  }
}
```

事件覆盖了 Agent 的一生（节选）：

| 阶段 | 事件 |
| --- | --- |
| 会话 | `SessionStart` · `SessionEnd` · `Setup` |
| 每回合 | `UserPromptSubmit` · `Stop` · `StopFailure` |
| 工具调用 | `PreToolUse` · `PermissionRequest` · `PostToolUse` · `PostToolUseFailure` · `PostToolBatch` |
| 子代理 | `SubagentStart` · `SubagentStop` · `TaskCreated` · `TaskCompleted` |
| 压缩 | `PreCompact`（manual/auto）· `PostCompact` |
| 其他 | `Notification` · `FileChanged` · `WorktreeCreate` · MCP 专属 `Elicitation` |

处理器有五种类型：`command`（shell 命令，JSON 走 stdin）、`http`（POST 到 URL）、`mcp_tool`（调用某个 MCP 工具）、`prompt`（用一次 LLM 调用做判定）、`agent`（实验性：派一个带工具的子代理去验证条件）。可以看到，连"拦截器本身"都在用 Agent 的方式实现。

### exit 2 的特殊语义

命令类 hook 的退出码是协议的一部分：

- **exit 0**：成功。stdout 若是 JSON 则解析为结构化决策（如 `permissionDecision: "deny"`）。
- **exit 2**：**阻断性错误**。无条件拦截——`PreToolUse` 拦工具、`UserPromptSubmit` 拒输入，连输出里写 "allow" 也无效。
- 其他非零：非阻断错误，仅记录。

官方文档特意强调："exit code 2 是唯一能仅凭退出码就阻断的退出码"。写策略 hook 时要故意 `exit 2`，而不是随手 `exit 1`。

### hook 决策不越过权限规则

一个容易误解的点：**hook 放行不等于权限放行**。PreToolUse hook 说"允许"后，权限规则照常求值；反过来，hook 用 exit 2 可以拦掉任何允许规则。两者是串联的两道独立闸门，不是覆盖关系。

## 与 Pi 对照

| 话题 | Pi | Claude Code |
| --- | --- | --- |
| 拦截点 | 扩展 `tool_call` / `tool_result` hook | PreToolUse / PostToolUse + 独立权限层 |
| 审批 UI | 扩展自己弹 | 内置确认框 + PermissionRequest hook |
| 规则语法 | 无（逻辑写在扩展代码里） | 声明式 allow/ask/deny 字符串规则 |
| 分层来源 | `.pi/` 目录按项目/全局装配 | 企业 > CLI > 项目 local > 项目 shared > 用户 |
| 事件密度 | 生命周期 + 工具 + 压缩约 10 个 | 会话/回合/工具/子代理/压缩等 20+ 个 |

Pi 的哲学是"给你一个拦截点，逻辑自己写"；Claude Code 的哲学是"把常见策略做成声明式配置，复杂逻辑再写 hook"。前者灵活，后者可审计——企业环境几乎必然走向后者。

动手实验的读者可以参考[常见错误](/reference/pitfalls)里 hook 不生效的几种典型原因。

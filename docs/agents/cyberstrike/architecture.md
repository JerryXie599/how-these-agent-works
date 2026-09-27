# CyberStrike 总体架构

<ArchifyEmbed src="/archify/cyberstrike-architecture.html" title="CyberStrike 总体架构（Archify 交互图）" />

这一页回答两个问题：继承自 opencode 的部分是什么、CyberStrike 自己加了什么。

## 继承的骨架

以下部分与 opencode 逐字节相同（diff 实测约 290 个文件），工作机制见 [opencode 章节](/agents/opencode/)，此处只列要点：

| 组件 | 继承自 | 要点 |
| --- | --- | --- |
| 多供应商接入 | `src/provider/` | 15+ 模型供应商，模型目录机制不变 |
| 会话存储 | `src/storage/` + `src/session/session.sql.ts` | SQLite（bun:sqlite + drizzle）；CyberStrike 在库中新增了漏洞、请求、Web 凭据/角色/对象、覆盖率等 16 张表 |
| HTTP server | `src/server/` | Hono + OpenAPI，REST/SSE 接口，TUI 与 Web 都是它的客户端 |
| 权限 Ruleset | `src/permission/next.ts` | `{permission, pattern, action}` 通配规则、按 agent 合并——CyberStrike 在此之上做安全特化（见[代理测试流水线](/agents/cyberstrike/proxy-pipeline)） |
| 技能加载框架 | `src/skill/` | 递归扫描 SKILL.md、按需加载；CyberStrike 增加了 Ed25519 签名校验 |
| TUI | `src/cli/cmd/tui/` | OpenTUI + Solid；注意 opencode 上游后来把 TUI 迁成了 Go 包，CyberStrike 保留的是 fork 时点的 TS 版本并做了定制 |

一个读代码时要知道的事实：本站 opencode 章节基于 v1.18.32，而 CyberStrike v1.1.16 的分叉点更早（CHANGELOG 显示 2026-02 首发 0.1.0）。两者之间的部分差异是版本漂移，不是 CyberStrike 的主动改动。

## CyberStrike 新增的部分

| 新增 | 位置 | 职责 |
| --- | --- | --- |
| 安全智能体 | `src/agent/agent.ts`（23 个角色定义）+ `src/agent/prompt/` | 主智能体、4 个领域智能体（Web/移动/云/内网）、代理流水线编排器与 9 个测试器 |
| 方法论引擎 | `src/methodology/`（phase / chain / intel / validation / performance） | 跟踪测试进度：当前阶段、攻击链、情报、验证门、各智能体表现；带 SQL 持久化 |
| 代理流水线 | `src/session/web/` + `src/session/ingest-queue.ts` | 浏览器捕获的数据（端点、角色、凭据、页面对象）入库，供测试器流水线消费 |
| hackbrowser | `packages/hackbrowser/` | Playwright + LLM 导航的浏览器爬取器，捕获 HTTP 流量与 UI 上下文 |
| Bolt 客户端 | `src/mcp/bolt-auth.ts` + `src/mcp/index.ts` | 远程工具服务器的配对、签名、调用 |
| 安全工具 | `src/tool/registry.ts`（约 60 个） | `report_vulnerability`、`http_replay`、`scope_check`、`generate_report`、各平台后利用钩子等 |
| 报告生成 | `src/tool/generate-report.ts` | 从会话库汇编报告（见[Bolt 与报告](/agents/cyberstrike/bolt-and-report)） |

## 数据如何流动

一次 Web 测试任务的完整链路：

1. 用户在 TUI 下达目标，主智能体（cyberstrike）规划并执行侦察；
2. 需要浏览器交互时，调 `hackbrowser` 工具拉起浏览器爬取器，捕获的 HTTP 流量与页面 UI 上下文入库；
3. 代理分析器（小模型）从捕获数据提取应用结构（角色、对象、函数）；
4. 编排器（proxy-agent）按应用结构派发 9 个漏洞测试器，每个测试器只负责一类漏洞；
5. 测试器的一切发包经由 `http_replay` 工具（权限强制），发现写入 `report_vulnerability`；
6. 方法论引擎持续记录覆盖率与攻击链；任务收口时 `generate_report` 汇编报告。

每一步的机制在后续页面展开：[智能体与技能库](/agents/cyberstrike/agents-and-skills) → [代理测试流水线](/agents/cyberstrike/proxy-pipeline) → [Bolt 与报告](/agents/cyberstrike/bolt-and-report)。

## 与 opencode 章节的阅读关系

| 话题 | 去 opencode 章节看 | 去 CyberStrike 章节看 |
| --- | --- | --- |
| server / 会话 / TUI 机制 | ✅ 完整拆解 | 只讲差异 |
| 权限 Ruleset 基础语法 | ✅ | 安全特化用法 |
| 智能体定义 | 通用 agent | 23 个安全角色 |
| 技能机制 | SKILL.md 框架 | 7,662 个技能 + 签名 + 方法论注入 |
| MCP | 机制 | Bolt 远程执行 + 4 个安全 MCP 服务器 |

下一页：[智能体与技能库](/agents/cyberstrike/agents-and-skills)。
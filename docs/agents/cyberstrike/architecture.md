# CyberStrike 总体架构

<ArchifyEmbed src="/archify/cyberstrike-architecture.html" title="CyberStrike 总体架构（Archify 交互图）" />

这一页回答三个问题：继承自 opencode 的骨架是什么、CyberStrike 自己加了哪些子系统、数据在这些子系统之间怎么流动。

## 继承的骨架

以下部分与 opencode 逐字节相同（逐文件 diff 实测约 290 个文件），工作机制在 [opencode 章节](/agents/opencode/)已完整拆解，这里只列与 CyberStrike 特化相关的要点：

| 组件 | 继承自 | 在 CyberStrike 中的状态 |
| --- | --- | --- |
| 多供应商接入 | `src/provider/` | 不变；15+ 供应商，模型目录机制相同 |
| 会话存储 | `src/storage/` + `src/session/session.sql.ts` | **库被扩展了**：在 opencode 的 session/message/part/todo 表之外新增 16 张安全表（见下文） |
| HTTP server | `src/server/` | 不变；Hono + OpenAPI，TUI 与 Web 都是客户端 |
| 权限 Ruleset | `src/permission/next.ts` | 语法不变（`{permission, pattern, action}` 通配规则、按 agent 合并）；CyberStrike 把它用出了新的花样（见[代理测试流水线](/agents/cyberstrike/proxy-pipeline)） |
| 技能加载框架 | `src/skill/` | 递归扫描 + 按需加载不变；CyberStrike 增加了 Ed25519 签名校验与官方公钥 |
| TUI | `src/cli/cmd/tui/` | OpenTUI + Solid。注意：opencode 上游后来把 TUI 迁成了独立 Go 包，CyberStrike 保留的是分叉时点的 TS 版本并做了定制（Bolt/MCP 状态面板） |

一个读代码时需要知道的事实：本站 opencode 章节基于 v1.18.32，而 CyberStrike v1.1.16 的分叉点更早（CHANGELOG 首个版本 0.1.0 发布于 2026-02）。两者之间的部分差异属于版本漂移，不是 CyberStrike 的主动改动。

## CyberStrike 新增的子系统

| 子系统 | 位置 | 职责 | 详见 |
| --- | --- | --- | --- |
| 安全智能体 | `src/agent/agent.ts`（23 个角色定义）+ `src/agent/prompt/` | 每个角色 = 方法论提示词 + 权限规则 + 可选技能注入 | [智能体与技能库](/agents/cyberstrike/agents-and-skills) |
| 方法论引擎 | `src/methodology/`（phase / chain / intel / validation / performance，带 SQL 持久化） | 跟踪测试阶段、攻击链、情报、覆盖率、验证门、智能体表现 | [智能体与技能库](/agents/cyberstrike/agents-and-skills) |
| 代理流水线 | `src/session/web/`（五张结构表）+ `src/session/ingest-queue.ts` + `src/agent/prompt/orchestrator|analyzer|vuln/` | 把浏览器捕获的流量变成分类漏洞报告 | [代理测试流水线](/agents/cyberstrike/proxy-pipeline) |
| hackbrowser | `packages/hackbrowser/` | Playwright + LLM 导航的浏览器爬取器，捕获 HTTP 与 UI 上下文 | [代理测试流水线](/agents/cyberstrike/proxy-pipeline) |
| Bolt 客户端 | `src/mcp/bolt-auth.ts` + `src/mcp/index.ts` | 远程工具服务器的配对、签名、调用（服务端独立部署） | [Bolt 与报告](/agents/cyberstrike/bolt-and-report) |
| 安全工具 | `src/tool/registry.ts`（约 60 个） | `http_replay`、`report_vulnerability`、`scope_check`、`generate_report`、11 个平台钩子等 | [代理测试流水线](/agents/cyberstrike/proxy-pipeline) |
| 报告生成 | `src/tool/generate-report.ts` | 确定性汇编 9 个部分 + 3 个 AI 占位段 | [Bolt 与报告](/agents/cyberstrike/bolt-and-report) |

## 会话库：新增的 16 张表

CyberStrike 对 SQLite 会话库的扩展值得单独列——这些表就是它的"数据模型"：

| 表 | 列数 | 存什么 |
| --- | --- | --- |
| `session` / `message` / `part` / `todo` / `permission` | — | opencode 原有，不变 |
| `vulnerability` | 20 | 漏洞：严重度、CWE、复现步骤、业务影响、建议、PoC、**candidate 列**（未确认候选的降级标记） |
| `request` | 31 | 每个捕获的 HTTP 请求：方法、路径、原文、体哈希、触发它的 UI 元素、凭据、UI 上下文 |
| `web_credential` | 6 | 测试凭据（label、headers、关联角色） |
| `web_role` | 5 | 应用角色（普通用户/管理员…），含发现来源 |
| `web_object` / `web_object_value` | 9+7 | 应用数据对象：字段、敏感字段、ID 字段；每个凭据看到的对象值 |
| `web_function` | 8 | 应用功能（action_type + 关联请求/角色/对象） |
| `endpoint_template` | 9 | 端点路径模板（去参数归一化），带置信度与命中计数 |
| `request_observation` | 8 | 请求观察记录（操作组哈希、值哈希、槽位） |
| `coverage_note` | 8 | 覆盖率笔记：资产 × 漏洞类别 × 已测范围 |
| `web_retest_queue` | 7 | 重测队列：待重新验证的请求 |

这张表设计传达的信息：**Web 攻击面被建模成"角色 × 对象 × 功能 × 端点模板"四个维度的数据库**，而不是一段对话记录。测试器查这些表就知道"哪个凭据见过哪个对象的哪些字段"——IDOR 测试（越权访问）直接变成"用凭据 A 去读凭据 B 发现的对象 ID"。

## 数据如何流动

一次 Web 测试任务的完整链路：

1. 用户在 TUI 下达目标；主智能体（cyberstrike）规划，执行侦察（ensure_tools 确认工具就位）。
2. 需要 Web 交互时调 `hackbrowser`：浏览器爬取目标（可按多个凭据分别登录爬取），HTTP 请求与 UI 上下文实时入库。
3. proxy-analyzer（小模型）从捕获数据提取应用结构，写入五张结构表。
4. proxy-agent 编排器读结构，按漏洞类别派发 9 个测试器。
5. 每个测试器：查会话上下文 → 构造测试矩阵 → 一切发包走 `http_replay` → 确认的调 `report_vulnerability`，越类线索走 `add_intel` 交接。
6. 方法论引擎同步记录覆盖率与攻击链；`generate_report` 收口时汇编交付报告。

每一步的机制：[智能体与技能库](/agents/cyberstrike/agents-and-skills) → [代理测试流水线](/agents/cyberstrike/proxy-pipeline) → [Bolt 与报告](/agents/cyberstrike/bolt-and-report)。

## 与 opencode 章节的阅读关系

| 话题 | opencode 章节 | CyberStrike 章节 |
| --- | --- | --- |
| server / 会话 / TUI 机制 | 完整拆解 | 只讲差异 |
| 权限 Ruleset 语法 | 基础语法 | 把它用作攻击面纪律 |
| 智能体定义 | 通用 agent + 子代理 | 23 个安全角色 |
| 技能机制 | SKILL.md 框架 | 7,662 个技能 + 签名 + 方法论注入 |
| MCP | 机制 | Bolt 远程执行 + 4 个安全 MCP 服务器 |

下一页：[智能体与技能库](/agents/cyberstrike/agents-and-skills)。
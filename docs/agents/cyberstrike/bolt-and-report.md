# Bolt 远程执行与报告生成

这一页讲两个相对独立但都很实用的机制：**Bolt**（把安全工具放到远程服务器上执行）和**报告生成**（把会话库里的数据汇编成交付报告）。

## Bolt：远程工具执行

问题：渗透测试工具（nmap、sqlmap、nuclei 这类）通常装在一台专门的攻击服务器上，而不是测试者的笔记本。CyberStrike 的解法是 Bolt——一个远程工具执行服务器：工具装在 VPS 或容器里，本地终端通过 MCP 协议远程调用。

| 组成 | 位置 | 说明 |
| --- | --- | --- |
| Bolt 服务器 | **独立仓库**，不在本仓库 | 部署在装好工具的服务器上 |
| 客户端与配对 | `src/mcp/bolt-auth.ts`（约 100 行核心） | 本仓库内的全部实现 |
| 连接管理 | `src/mcp/index.ts`（`createBolt`） | 把 Bolt 工具并入 MCP 工具注册表 |
| 管理 API | `src/server/routes/bolt.ts` | 添加/配对/连接/断开/删除多个 Bolt |
| 凭据 | `~/.cyberstrike/bolt-keys/` | 本地保存的 Ed25519 密钥对 |

**配对流程**（`bolt-auth.ts:46-100`）：

1. 用管理员 token 调 `POST /pair`，获取一次性配对码；
2. 本地生成 Ed25519 密钥对，客户端 ID 取公钥 SHA-256 指纹的前 16 位十六进制；
3. `POST /pair/exchange` 交换公钥，拿到服务器公钥与客户端 ID；
4. 之后每次请求用私钥签名：签的内容是"时间戳 + 随机数 + 方法 + 路径 + 请求体哈希"。

**连接即 MCP over HTTPS**：Bolt 不是一个普通的 MCP 配置——实现方式是把 MCP 传输层的 fetch 替换成签名版本（每次请求自动注入签名头），连到 Bolt 服务器的 `/mcp` 端点。换服务器地址会强制重新配对。支持配置多台 Bolt（1:N），从 TUI 管理；Bolt 提供的工具与本地 MCP 工具一起进入懒加载注册表（防止工具声明撑爆上下文）。

一个边界说明：本仓库只有客户端，Bolt 服务端的实现不在其中，本章不对服务端行为下结论。

## 工具清单

`src/tool/registry.ts` 注册约 60 个工具，分三类来源：

| 来源 | 工具 | 说明 |
| --- | --- | --- |
| 继承 opencode | bash、read/write/edit、glob/grep、task、webfetch、skill、lsp 等 | 通用能力不变 |
| 安全新增 | `report_vulnerability`、`triage_vulnerability`、`http_replay` / `http_replay_raw`、`inject_probe`、`hackbrowser`、Web 会话读写（角色/对象/凭据）、`scope_check`、`generate_report` | 流水线与报告（见[代理测试流水线](/agents/cyberstrike/proxy-pipeline)） |
| 平台钩子与审计 | `awshook` / `azurehook` / `kubehook` / `gcphook` / `linuxhook` 等 11 个后利用钩子、`cloud_audit` / `k8s_audit` / `ci_audit` | CHANGELOG 称 linuxhook 内含 120 个 TypeScript 后利用程序 |

外部工具（nmap、nuclei、sqlmap 等）不是内置实现：`src/tool/ensure-tools.ts` 负责检测与安装，通过 bash 执行。Bolt 的意义正在于此——这些工具可以在远程服务器上执行。

## 报告生成

实现在 `src/tool/generate-report.ts`（工具名 `generate_report`），机制是**确定性汇编为主、AI 补写为辅**：

```text
1. 从会话库拉取：已确认漏洞、情报、覆盖率、方法论阶段、攻击链、验证门、各智能体表现
2. 按固定结构汇编 9 个部分：执行摘要 / 发现（按严重度排序）/ 覆盖率 / 方法论 / 攻击链
   / 攻击面 / 时间线 / 智能体表现 / 验证结果
3. 报告中留 3 个 <!-- AI: ... --> 占位段（执行摘要等需要推理归纳的部分），由模型补写
4. 写入 .cyberstrike/reports/report-<时间戳>.md
```

设计取向与 T3MP3ST 的"母版 + 槽位"相同：**事实部分由代码从数据库汇编（不可编造），模型只负责需要归纳能力的段落**。CHANGELOG 称之为 HackerOne 格式友好的混合报告。

支撑数据来自会话库 CyberStrike 新增的 16 张表：漏洞表、请求表、Web 凭据/角色/对象表、覆盖率笔记表、重测队列表等——也就是说，报告质量取决于流水线（[上一页](/agents/cyberstrike/proxy-pipeline)）落库的数据完整性。

## 与其他项目的报告机制对照

| | AtkBrain | T3MP3ST | CyberStrike |
| --- | --- | --- | --- |
| 事实来源 | 会话库 + 攻击图 | bench/ 提交工件 | 会话库 16 张新表 |
| 模型角色 | 无工具会话改写 | 只输出槽位 JSON | 填 3 个占位段 |
| 版式控制 | HTML 母版槽位 | HTML 母版 14 槽 | Markdown 固定 9 节 |
| 交付门槛 | 二次验证后出正式漏洞页 | 证据门 + verify-claims | 漏洞需确认状态 |
| 输出 | HTML/PDF | HTML/PDF | Markdown（HackerOne 友好） |

## 本章小结

回到本站的总图看：CyberStrike 与 AtkBrain、T3MP3ST 一起代表了第三条路线——**不做通用 Agent，把某个安全领域的方法论、工具与交付物全部工程化**。三家的分工:AtkBrain 强在"状态外置的自主循环"，T3MP3ST 强在"证据纪律与可复算"，CyberStrike 强在"成熟 Agent 骨架上的方法论流水线"。

想继续深入：仓库的 `README.md`（英文主文档）、`WHITEPAPER.md`、`.cyberstrike/skill/SKILL_GUIDE.md` 是三个入口。想给本站加下一个案例，见[如何新增一个 Agent](/agents/extend)。
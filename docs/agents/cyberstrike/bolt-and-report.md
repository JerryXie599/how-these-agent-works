# Bolt 远程执行与报告生成

这一页讲两个把 CyberStrike 从"玩具"变成"可用工具"的机制：**Bolt**（把安全工具放到远程服务器上执行）和**报告生成**（把会话库里的数据汇编成 HackerOne 格式友好的交付报告）。

## Bolt：远程工具执行

问题：渗透测试工具（nmap、sqlmap、nuclei 这类）通常装在一台专门的攻击服务器（VPS/容器）上，而不是测试者的笔记本。CyberStrike 的解法是 Bolt——一个远程工具执行服务器：工具装在远端，本地终端通过 MCP 协议远程调用，支持同时挂多台。

| 组成 | 位置 | 说明 |
| --- | --- | --- |
| Bolt 服务器 | **独立仓库/部署物**，不在本仓库 | 装好渗透工具包的服务器上运行；本仓库不做服务端实现断言 |
| 配对客户端 | `src/mcp/bolt-auth.ts`（核心约 100 行） | Ed25519 密钥交换 |
| 连接层 | `src/mcp/index.ts`（`createBolt`，L589-691） | 把 Bolt 工具并入 MCP 工具注册表 |
| 管理 API | `src/server/routes/bolt.ts` | 添加/配对/连接/断开/删除，支持配置多台（`Config.Bolt` 是 record，注释标注 "Docker Kali containers"） |
| 凭据存储 | `~/.cyberstrike/bolt-keys/` | 本地保存的 Ed25519 密钥对 |

### 配对流程（`bolt-auth.ts:46-100`）

1. 用管理员 token 调 `POST /pair`，获取一次性配对码；
2. 本地生成 Ed25519 密钥对，客户端 ID 取公钥 SHA-256 指纹的前 16 位十六进制；
3. `POST /pair/exchange` 交换公钥，拿到服务器公钥与客户端 ID；
4. 凭据写入本地数据目录；之后每次请求用私钥签名，签名内容为：`时间戳 + 随机数 + HTTP 方法 + 路径 + 请求体哈希`。

### 连接即 MCP over HTTPS

Bolt 不是一个普通的 MCP stdio 配置。`createBolt` 的实现方式：把 MCP 的 `StreamableHTTPClientTransport` 的 `fetch` 替换为签名版本（`signedTransportFetch`，每次请求自动注入签名头），连到 `{bolt 地址}/mcp`。两个细节：

- 修改 Bolt 地址会**强制重新配对**（旧凭据作废）；
- 未配对时状态为 `needs_auth`，TUI 弹提示引导配对。

Bolt 提供的工具与普通 MCP 工具一起进入懒加载注册表（`src/tool/lazy-registry.ts`）——注册表有约 30k token 的预算（每工具约 500 token），防止工具声明撑爆上下文。

## 工具清单

`src/tool/registry.ts` 注册约 60 个工具，按来源分三类：

| 来源 | 工具 | 说明 |
| --- | --- | --- |
| 继承 opencode | bash、read/write/edit、glob/grep、task、webfetch、skill、lsp 等 | 通用能力不变 |
| 安全新增 | `report_vulnerability`、`triage_vulnerability`、`http_replay` / `http_replay_raw`、`inject_probe`、`csrf_extract`、`hackbrowser`、Web 会话读写（`web_write_role/object/object_value/function`、`web_get_*`）、方法论工具（`add_intel`、`methodology_status`、`update_vrt_check`、`record_coverage_note`、`scope_check`、`ensure_tools`、`attack_script`）、`generate_report` | 流水线与报告（见[代理测试流水线](/agents/cyberstrike/proxy-pipeline)） |
| 平台钩子与审计 | `awshook` / `azurehook` / `kubehook` / `gcphook` / `linuxhook` / `winhook` / `machook` / `ebpf` / `containerhook` / `iachook` / `llmhook`（11 个后利用钩子）、`cloud_audit` / `k8s_audit` / `ci_audit` / `cipipe` | CHANGELOG 称 linuxhook 内含 120 个 TypeScript 后利用程序 |

外部工具（nmap、nuclei、sqlmap、nikto 等）不是内置实现：`src/tool/ensure-tools.ts` 负责检测与安装，通过 bash 执行；公共方法论提示词里同时规定了 `ensure_tools` 的使用纪律——只在用户明确要求主动测试时才装，被动咨询不装。Bolt 的意义正在于此：这些外部工具可以在远程服务器上执行。

## 报告生成

实现在 `src/tool/generate-report.ts`（工具名 `generate_report`），机制是**确定性汇编为主、AI 补写为辅**：

```text
1. 从会话库拉取数据（全部来自 CyberStrike 新增的 16 张表 + 方法论引擎）：
   已确认漏洞（vulnerability 表）· 情报与覆盖率（intel.computeCoverage /
   computePerAssetCoverage）· 覆盖率笔记 · 方法论阶段 · 攻击链（chain.load）
   · 请求 · 验证门结果（validation.runAllGates）· 各智能体表现
2. 汇编 9 个部分（ALL_SECTIONS，可按 include_sections 裁剪）：
   executive_summary / findings / coverage / methodology / chains
   / attack_surface / timeline / agent_performance / validation
3. 漏洞按 critical → info 排序；每个智能体在报告里有代号
   （STRIKER / INTERCEPTOR / GHOST / AURORA / PHANTOM / CIPHER / COMMANDER）
4. 报告中留 3 个 <!-- AI: ... --> 占位段，由模型补写需要推理归纳的部分
5. 用 write 工具存到 .cyberstrike/reports/report-<时间戳>.md
```

设计取向：**事实部分由代码从数据库汇编（不可编造），模型只负责需要归纳能力的段落**。CHANGELOG 1.1.15 称之为 "hybrid HackerOne-ready report generation"。

支撑这份报告的数据来自会话库 CyberStrike 新增的 16 张表（vulnerability 20 列、request 31 列、Web 凭据/角色/对象/函数、覆盖率笔记、重测队列等）——报告质量取决于[代理测试流水线](/agents/cyberstrike/proxy-pipeline)落库的数据完整性。

## 与其他项目的报告机制对照

| | AtkBrain | T3MP3ST | CyberStrike |
| --- | --- | --- | --- |
| 事实来源 | 会话库 + 攻击图 | bench/ 提交工件 | 会话库 16 张安全表 |
| 模型角色 | 无工具会话改写 | 只输出槽位 JSON | 填 3 个占位段 |
| 版式控制 | HTML 母版槽位 | HTML 母版 14 槽 | Markdown 固定 9 节 |
| 交付门槛 | 二次验证后出正式漏洞页 | 证据门 + verify-claims | 漏洞需确认状态（candidate 不出正式结论） |
| 输出 | HTML/PDF | HTML/PDF | Markdown（HackerOne 友好） |

## 本章小结

CyberStrike 的完整故事：**拿一个成熟的 coding agent 骨架（opencode），在它上面叠一层安全垂直化**——23 个角色、7,662 个技能文件、一条浏览器到报告的流水线、一个远程执行面。它与 AtkBrain（状态外置的自主循环）、T3MP3ST（证据纪律的编队框架）各占一条路线，加上四个通用 Agent，本站七个项目在同一个循环骨架上给出了七种工程答案。

回到[总览](/agents/)看那张对照表，现在每一格都应该有出处了。想给本站加下一个案例，见[如何新增一个 Agent](/agents/extend)。
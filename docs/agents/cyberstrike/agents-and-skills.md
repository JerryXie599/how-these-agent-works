# 智能体与技能库

CyberStrike 的领域知识放在两个地方：**智能体定义**（每个安全角色一份提示词，写死它遵循的方法论）和**技能库**（7,662 个 SKILL.md 文件，按需加载或启动时注入）。这一页讲这两层的组织方式。

代码位置：智能体定义集中在 `packages/cyberstrike/src/agent/agent.ts`（约 850 行），提示词在 `src/agent/prompt/`，技能库在仓库根的 `.cyberstrike/skill/`。

## 智能体清单

`agent.ts` 共定义 23 个智能体，按可见性分三类：

**可切换的主智能体（1 个）**：

| 智能体 | 职责 |
| --- | --- |
| `cyberstrike` | 全权限主智能体：规划、侦察、调度子智能体、生成报告。提示词前拼接公共方法论文件（`prompt/methodology/common-methodology.txt`） |

**领域智能体（4 个，子代理）**——每个绑定一套行业标准方法论：

| 智能体 | 领域 | 绑定的方法论 | 提示词要求产出 |
| --- | --- | --- | --- |
| `web-application` | Web 应用 | OWASP Top 10 + WSTG；启动时注入 4 个 WSTG 技能 | 每条发现带 `WSTG-ID` |
| `mobile-application` | 移动应用 | MASTG / MASVS，Frida/Objection 工具链 | 每条发现带 `MASVS-ID` |
| `cloud-security` | 云安全 | CIS 基准（启动时注入 13 个 CIS/后渗透技能）；AWS/Azure/GCP | 每条发现带 MITRE ATT&CK ID |
| `internal-network` | 内网 | AD/Kerberos/横向移动（启动时注入 11 个技能） | 每条发现带 MITRE ATT&CK ID |

**代理流水线角色（11 个，多数隐藏）**——见[代理测试流水线](/agents/cyberstrike/proxy-pipeline)：编排器 `proxy-agent`、分析器 `proxy-analyzer`、9 个漏洞测试器（`proxy-tester-*`，按 IDOR / 授权 / 注入 / 认证 / 业务逻辑 / SSRF / 文件攻击 / LLM 分类）。

其余 7 个（`general`、`explore`、`compaction`、`title` 等）继承自 opencode，职责不变。

**"13+"的口径**：README 说 13+ 智能体，指 5 个可见（主智能体 + 4 领域）+ 8 个测试器；代码里实际还有分析器、LLM 测试器等隐藏角色。

## 方法论引擎

`src/methodology/` 是 opencode 没有的新子系统，带 SQL 持久化，跟踪一次测试的进度：

| 文件 | 跟踪内容 |
| --- | --- |
| `phase.ts` | 当前处于方法论的哪个阶段 |
| `chain.ts` | 攻击链：哪些发现可以串成一条完整利用路径 |
| `intel.ts` | 情报：测试过程中积累的目标信息，含覆盖率计算（每个资产测了多少） |
| `validation.ts` | 验证门：结论生效前需要满足的条件 |
| `performance.ts` | 各智能体的执行表现 |

智能体通过专属工具读写它：`add_intel`（补充情报）、`methodology_status`（查进度）、`record_coverage_note`（记录覆盖情况）、`scope_check`（查目标是否在授权范围）。

## 技能库：提示词即数据

`.cyberstrike/skill/` 下共 **7,662 个 SKILL.md**，每个文件既是文档也是提示词材料：

| 分区 | 数量 | 内容 |
| --- | --- | --- |
| `WEB/OWASP_WSTG_4.2/` | 125 | OWASP WSTG 测试用例，每份带 `owasp_id`、`cwe_ids`、`chains_with`（可串联的后续用例）、`severity_boost` 等结构化字段 |
| `CIS_benchmarks/` | 约 5000 | CIS 安全基准检查项（云安全智能体使用） |
| `NIST/` | 约 1600 | NIST 控制项 |
| `mitre_attack*` | 约 690 | MITRE ATT&CK 战术与技法 |
| `attack-*` | 17 个目录 | 具体攻击技法（SSRF、JWT、请求走私、原型污染、竞态条件等） |
| `*-postexploit` | 9 个目录 | 各平台（Linux/Windows/macOS/AWS/Azure/GCP/K8s）后渗透 |
| `ad-security` / `kerberos-attacks` 等 | — | 内网智能体的技能 |

两种进入模型上下文的方式：

1. **静态注入**：智能体定义里的 `skills` 字段（`agent.ts`），启动时把指定技能全文拼进提示词——例如每个测试器注入它负责的 WSTG 用例；
2. **运行时按需加载**：`skill` 工具按名字取用（opencode 继承的机制），7,662 个不可能全部塞进上下文，按需取用控制成本。

**签名与信任分级**：`src/skill/signing.ts` 内置官方公钥，技能文件头三行（sha256 + signature + signed_by）校验通过标记为 `official`；无签名为 `community`；签名不符标记为 `tampered`。作用：用户从社区装技能时能区分官方文件与第三方改动。

## 与其他项目的"领域知识注入"对照

| | Claude Code | AtkBrain | CyberStrike |
| --- | --- | --- | --- |
| 知识形态 | Skills 目录 | 7,662 个技能文件 | 7,662 个技能文件（fork 自身机制同源） |
| 注入方式 | 按需展开 | 静态注入 + 运行时加载 | 静态注入 + 运行时加载 |
| 结构化程度 | 自由文本 | WSTG 用例带 owasp_id / 链接字段 | 同左，另加 Ed25519 签名分级 |
| 规模 | 数量级：十到百 | 千级（CIS/NIST 为主体） | 千级 |

下一页：[代理测试流水线](/agents/cyberstrike/proxy-pipeline)。
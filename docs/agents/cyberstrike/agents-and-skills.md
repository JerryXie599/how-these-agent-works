# 智能体与技能库

CyberStrike 的领域能力来自两套机制的配合：**23 个智能体**（每个是一份提示词 + 一套权限规则 + 可选的技能注入）和 **7,662 个技能文件**（方法论内容的载体）。这一页把它们各自讲清楚，最后说明两者怎么组合。

代码位置：智能体定义在 `packages/cyberstrike/src/agent/agent.ts`（约 850 行，`Agent.Info` 表），提示词文本在 `src/agent/prompt/`，技能库在仓库根的 `.cyberstrike/skill/`，签名校验在 `src/skill/signing.ts`。

## 23 个智能体的完整清单

### 三个可见入口

| 智能体 | 模式 | 职责 | 特殊设定 |
| --- | --- | --- | --- |
| `cyberstrike` | primary（Tab 可切换） | 全权限主智能体：规划、侦察、调度子代理、写图、出报告 | 提示词 = 公共方法论 + 专属提示；额外放行 `question`（可向用户提问） |
| `general` | 子代理 | 通用多步任务（继承 opencode） | 禁 `todoread/todowrite` 与两个漏洞上报工具——通用任务不允许报漏洞 |
| `explore` | 子代理 | 代码库探索（继承 opencode） | `"*": "deny"` 后白名单 grep/glob/list/bash/webfetch/websearch/codesearch/read——纯只读 |

### 四个领域智能体

每个领域智能体 = 公共方法论提示 + 连续执行提示 + 领域专属提示，外加启动时静态注入一批技能（把技能全文直接拼进系统提示词）。

| 智能体 | 领域 | 遵循的方法论 | 启动时注入的技能 | 专属工具放行 |
| --- | --- | --- | --- | --- |
| `web-application`（红标） | Web 应用与 API | OWASP Top 10 + WSTG | 4 个：`wstg-recon-config`、`wstg-auth-session`、`wstg-injection`、`wstg-logic-client-api` | `report_vulnerability`、`hackbrowser`、`attack_script` 等 16 个 |
| `mobile-application`（紫标） | Android/iOS | MASTG / MASVS，Frida/Objection | 无静态注入（运行时按需） | 同上，另无云/钩子类 |
| `cloud-security`（青标） | AWS / Azure / GCP | CIS 基准 + MITRE ATT&CK | 13 个：6 个 CIS 基准（`cis-aws-foundations-2.1.1` 等）+ 4 个云后渗透 + 3 个评估 | 加 9 个云钩子与审计工具（`awshook`、`cloud_audit`、`k8s_audit`…） |
| `internal-network`（黄标） | AD / Kerberos / 横向 | MITRE ATT&CK | 11 个：`ad-security`、`kerberos-attacks`、`ebpf-attacks`、四平台后渗透等 | 加 12 个平台钩子与 `cipipe` |

输出格式是硬性的：Web 智能体的发现必须带 `WSTG-ID`，移动端带 `MASVS-ID`，云与内网带 MITRE ATT&CK ID——提示词里写死，保证发现可回溯到方法论条目。

### 代理流水线角色（11 个）——详见[代理测试流水线](/agents/cyberstrike/proxy-pipeline)

| 角色 | 模式 | 要点 |
| --- | --- | --- |
| `proxy-agent`（编排器） | 子代理，步数 ≤40 | 读结构提取结果、派发测试器；`"*": "deny"` 后只白名单委派与读类——结构上不能自己写结论 |
| `proxy-analyzer` | 隐藏子代理，步数 ≤20，小模型 | 从捕获流量提取应用结构（角色/对象/函数） |
| 9 个 `proxy-tester-*` | 隐藏子代理，步数 ≤50 | 按 IDOR / 授权 / 批量赋值 / 注入 / 认证 / 业务逻辑 / SSRF / 文件攻击 / LLM 分工 |

### 内部角色（7 个，隐藏，继承自 opencode）

`general` 之外还有 7 个隐藏角色服务于平台自身功能：`compaction`（会话压缩）、`title`（会话标题，temperature 0.5）、`normalize-request`（请求规范化，temperature 0）、`summary`（摘要）等——全部 `"*": "deny"`（无工具），做完即弃。

## 公共方法论协议

每个安全智能体的提示词开头都拼接同一段「方法论引擎协议」（`prompt/methodology/common-methodology.txt`），它规定了智能体与[方法论引擎](/agents/cyberstrike/agents-and-skills#方法论引擎)交互的四条纪律：

1. **情报记录**：所有发现必须立即通过 `add_intel` 记录，按类型分八类（端点、子域、技术栈、凭据、参数、漏洞线索、配置、认证流程），每条带严重度与置信度（confirmed / high / medium / low）。
2. **覆盖率跟踪**：测试某个 VRT 类别之前先查 `methodology_status` 看覆盖情况；测完用 `update_vrt_check` 提交完整证据——请求原文、响应摘要（≥50 字符）、推理（≥100 字符，说明为什么这证明或否证了漏洞）。**字数下限写死在提示词里**。
3. **范围纪律**：测新目标前必须 `scope_check`；超出授权范围的目标禁止测试。
4. **攻击链感知**：引擎自动检测发现之间的串联关系；检测到链时优先把链上的组件测完整——单独看是低危的发现，串成链会升级为高危/严重。

另有一条配套提示（`forced-continuation.txt`）防止智能体中途停下。

## 技能库：7,662 个 SKILL.md

`.cyberstrike/skill/` 递归扫描所有 `SKILL.md`（实测 7,662 个），索引在 `index.json`（129 个顶层条目，含名称、描述、信任级别、标签、CWE 编号）。

| 分区 | 数量 | 内容 |
| --- | --- | --- |
| `WEB/OWASP_WSTG_4.2/` | 125 | WSTG 测试用例全集 |
| `CIS_benchmarks/` | 约 5000 | CIS 安全基准（云智能体使用） |
| `NIST/` | 约 1600 | NIST 控制项 |
| `mitre_attack*` | 约 690 | MITRE ATT&CK（企业/ICS/移动） |
| `attack-*` | 17 个目录 | 单项攻击技法（SSRF、JWT、请求走私、原型污染、竞态、GraphQL、WebSocket…） |
| `*-postexploit` / `*-assessment` | 13 个目录 | 各平台（Linux/Windows/macOS/AWS/Azure/GCP/K8s/CI）的后渗透与评估 |
| `ad-security` / `kerberos-attacks` 等 | — | 内网智能体技能 |

### 一份 WSTG 用例文件长什么样

以 `wstg-apit-00` 为例，文件分两部分：

**YAML frontmatter**（机器可读，用于索引与注入决策）：

```yaml
name: wstg-apit-00
description: "API Testing Overview"
category: api-testing
owasp_id: WSTG-APIT-00
cwe_ids: []
chains_with: []        # 可以串联的后续用例
prerequisites: []      # 前置条件
severity_boost: {}     # 命中后严重度提升规则
```

**正文**（给人看也是给模型看的操作说明）：测试 ID、高层描述、具体的测试程序、载荷表。

`chains_with` 字段值得单独说明：引擎检测攻击链时就靠它——一个低危发现如果出现在另一条用例的 `chains_with` 列表里，说明两者串联后危害升级，方法论引擎会把整条链的测试优先级抬上去。

### 两种进入模型上下文的方式

| 方式 | 时机 | 例子 |
| --- | --- | --- |
| 静态注入 | 智能体定义的 `skills` 字段，启动时全文拼进提示词 | 云安全智能体的 13 个 CIS 技能、每个测试器注入的 2–5 份 WSTG 用例 |
| 运行时按需 | `skill` 工具按名字取用 | 7,662 个不可能全塞进上下文，未注入的按需取 |

## 技能的签名与信任分级

技能文件可能来自官方也可能来自社区，`src/skill/signing.ts` 用内置的 Ed25519 官方公钥给每个文件定信任级：

| 状态 | 判定 |
| --- | --- |
| `official` | 有 `cyberstrike-official` 签名且哈希校验通过 |
| `community` | 有签名但签的不是官方（第三方作者） |
| `unverified` | 没有哈希头 |
| `tampered` | 有签名但内容哈希对不上——**被篡改** |

作用：用户从社区安装技能时，能明确知道手上这份和作者发布的是否一致；被篡改的技能会被显著标记。

## 方法论引擎

`src/methodology/` 是 opencode 没有的新子系统（带 SQL 持久化），是公共方法论协议的执行端：

| 文件 | 职责 |
| --- | --- |
| `phase.ts` | 测试阶段推进 |
| `intel.ts` | 情报存取与覆盖率计算（`computeCoverage` / `computePerAssetCoverage`——每个资产测了多少项） |
| `chain.ts` | 攻击链检测（依据技能的 `chains_with` 字段） |
| `validation.ts` | 验证门：结论生效前的条件检查（`runAllGates`） |
| `performance.ts` | 各智能体执行表现统计 |

数据落在会话库新增的多张表里，最终被[报告生成](/agents/cyberstrike/bolt-and-report)消费——覆盖率与验证结果直接进报告的对应章节。

## 与其他项目的知识注入对照

| | Claude Code | AtkBrain | T3MP3ST | CyberStrike |
| --- | --- | --- | --- | --- |
| 知识形态 | Skills 目录 | 7,662 个技能文件（同源机制） | WHITEPAPER + FEATURES 声明 | 7,662 个技能文件 |
| 规模 | 十到百 | 千级（CIS/NIST 为主体） | — | 千级 |
| 注入方式 | 按需展开 | 静态注入 + 运行时加载 | 静态注入 + 按需加载 | 静态注入 + 运行时加载 |
| 结构化字段 | 无强制 | WSTG 用例带 owasp_id / chains_with | 任务模板 | 同 AtkBrain |
| 信任机制 | 无 | 无 | 无 | **Ed25519 签名四级** |

`chains_with`（攻击链关联）和 Ed25519 签名是 CyberStrike 技能库独有的两个设计：前者让"单个低危"能被引擎自动升级为"链路高危"，后者解决了社区技能分发中的信任问题。

下一页：[代理测试流水线](/agents/cyberstrike/proxy-pipeline)。
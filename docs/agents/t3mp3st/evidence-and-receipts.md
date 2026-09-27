# 证据、工作单与复现

这一页讲 T3MP3ST 怎么处理一个所有 Agent 都要面对的问题：**模型给出的结论，凭什么信。** 它的答案是一套互相衔接的机制：证据校验（每个结论必须挂工具输出）、工作单与监视信号（假设、验证、否证都有状态跟踪）、反驳裁决（防止错误的否定结论）、以及基准数字复算（公开数字可从仓库工件重算）。

## 证据门：结论必须挂在工具输出上

`src/evidence/gate.ts` 的规则：一条漏洞发现（finding）要被采信，必须带有**真实工具输出**作为证据。证据有五种合法形态：`output`（工具输出）、`command`（执行过的命令）、`response`（HTTP 响应）、`log`（日志）、`file`（文件）。

每条发现按来源分三档（`provenance`）：

| 档位 | 含义 | 能否通过校验 |
| --- | --- | --- |
| `tool` | 有真实工具输出背书 | 能 |
| `context` | 只有模型的文字描述 | 不能 |
| `none` | 什么都没有 | 不能 |

未通过的发现不会被静默丢弃，而是返回明确的拒绝原因（`gate.ts:39` 原文）："no tool-output evidence — provenance-strict requires a finding be backed by real tool output, not prose"。

在执行循环侧（`src/agent/index.ts`），每条发现从产生那一刻就同时记录 `provenance` 标记与原始工具输出——证据链在源头就建立，而不是事后补。

## 工作单：把"待证明的事"变成有状态的对象

`server.ts`（8276 行的最大单文件）里维护着一套假设管理系统：

![工作单系统 流程图](/diagrams/agents-t3mp3st-evidence-and-receipts-1.png)

- **工作单**：六种明确的"待证明事项"——证明、否证、影响面测绘、资产归属确认、重测设计、工具探针。
- **监视信号（WatchSignal）**：13 种异常状态的检测器，例如 `no_hypothesis`（没有假设在空转）、`unsupported_hypothesis`（假设缺乏支撑）、`receipt_required`（缺回执）、`missing_disproof`（缺否证）。
- **自愈动作（SelfHealAction）**：与信号一一对应的纠偏动作——补种假设、要求回执、`hold_gate`（证据不足时卡住不放行）。

这套设计的直接效果：**"没假设就空转"和"没证据就下结论"都有自动检测与纠偏**，不依赖提示词提醒模型。

## 反驳裁决：错误的"不可能"比夸大更危险

`src/mission/adjudicate.ts` 处理一个具体风险。文件头注释给出的场景：模型可能编造一个"目标代码里存在防护"的理由来否定一个漏洞；而系统的去重逻辑会**永久阻止这个漏洞被重新发现**——一个基于幻觉的否定结论，代价是真漏洞被埋掉。

处理流程：

![反驳裁决 流程图](/diagrams/agents-t3mp3st-evidence-and-receipts-2.png)

两个关键设计：

1. **引用校验是强制的**（注释原话 "MANDATORY, non-optional"）：一条"已否证"的结论必须引用目标源码中真实存在的防护代码（如边界检查、输入规范化、证书绑定），系统会逐一核对这些引用是否真实存在。引用不存在，否证不成立。
2. **同一份裁决实现服务两个入口**：离线披露流程（`scripts/refute-finding.mjs`）与在线审计路径共用同一套纯函数，防止两条路径的逻辑各自演化出差异。

## 基准数字复算：verify-claims

README 的基准数字不是孤立的宣传值，仓库提供了重算脚本：

```bash
npm run verify-claims
```

它从 `bench/` 目录下提交的 JSON 工件重新推导 README 里的每个数字，完整性规则与评测时相同（flag 大小写不敏感比对、捏造识别、金丝雀检查）。`scripts/verify-claims.mjs` 开头的注释明确了它的边界，值得完整引用：

> SCOPE — read this honestly: this is a REPRODUCIBILITY / REGRESSION check of our OWN committed artifacts, NOT a third-party audit. … To audit independently, re-run the harness from scratch on fresh containers and re-grade the solves yourself.

配套的完整性机制：

| 机制 | 说明 |
| --- | --- |
| 捏造识别（`looksFabricated()`） | placeholder / fake / example 类 flag 一律判假，包括常见变形写法 |
| 反拟合 | 最佳成绩必须能从固定提交的运行集重新推导，否则视为拟合 |
| 判分口径 | 每个 flag 对提交的标准答案判分，不由模型自报 |

`bench/` 目录按基准分目录存放工件（xbow、cybench、cve-zero、model-matrix 等），每个基准有对应重跑脚本。

## 与 AtkBrain 的"反夸大"对照

| 话题 | AtkBrain | T3MP3ST |
| --- | --- | --- |
| 防夸大上报 | 入库硬校验（类型只升不降、空壳降级、严重度下限） | 证据门（必须有工具输出） |
| 防错误否定 | `reopen_*` 纠偏函数族 | 反驳裁决 + 强制引用核对 |
| 独立验证 | 专职复核会话 + 评级 | 工作单回执 + 重测设计 |
| 数字可信 | 不对外宣称基准 | verify-claims 全量重算 + 边界声明 |

两个项目用了不同的手段达成同一目标：**不采信模型的自报**。AtkBrain 用规则层在数据入口校验，T3MP3ST 用证据链与复算在流程上校验。加上 pi 的扩展 hook、Claude Code 的权限门、DSH 的 fail-closed 审批，本站六个项目在这一点上的共识是：可信度来自不可绕过的检查点，而不是更好的提示词。

## 本章小结

如果想在自己的 Agent 项目里采用这套思路，最小可行清单：

1. 每条结论必须引用产生它的工具输出，并校验引用真实存在；
2. 空转、缺证据、缺否证都要有检测信号与对应的纠偏动作；
3. 否定结论的把关要比肯定结论更严格；
4. 对外公布的数字全部做成可重算的，同时写明它能证明什么、不能证明什么；
5. 实现状态用三档标注（已验证 / 可用未验证 / 计划），并说明数字的统计口径。

想继续深入这个项目：`WHITEPAPER.md`（架构全景）、`FEATURES.md`（逐功能状态）、`docs/`（SCOPE_AND_AUTHORIZATION、VERIFIED_PROVENANCE）是三个入口。想给本站加下一个案例，见[如何新增一个 Agent](/agents/extend)。
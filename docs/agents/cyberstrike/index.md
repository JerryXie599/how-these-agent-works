# CyberStrike 是什么

CyberStrike（npm 包 `@cyberstrike-io/cyberstrike`，v1.1.16，AGPL-3.0-only）是一个面向攻击性安全测试的开源终端 Agent：给定一个**已授权**的测试目标，它执行侦察、漏洞发现、利用验证，并产出报告。README 的自我定位是"首个专为攻击性安全打造的开源 AI 智能体"。

::: warning 授权使用边界
进攻性安全工具，仅限已获书面授权的目标。本章只拆解软件架构，不包含攻击操作指导。
:::

## 它与 opencode 的关系：一个安全特化分叉

CyberStrike 是 **opencode 的分叉**（fork），这一点对读代码很重要——本站已有 [opencode 章节](/agents/opencode/)，两者的骨架完全同源。我们对两个仓库做了逐文件对比（`packages/cyberstrike/src` 对 `packages/opencode/src`）：

| 对比结果 | 数量 | 说明 |
| --- | --- | --- |
| 逐字节相同的文件 | 约 290 个 | provider 层、会话存储（SQLite）、server、技能加载框架、插件 SDK 等直接继承 |
| 有修改的文件 | 129 个 | CLI 命令、会话细节、代理相关代码等 |
| CyberStrike 新增 | 166 个 | 安全智能体、方法论引擎、Bolt 客户端、hackbrowser 对接等 |
| 相对 opencode 删除 | 129 个 | 云端协作、图床、同步等与本定位无关的模块 |

也就是说：**opencode 的"可嵌入 server + 会话库 + 多供应商"骨架被原样保留，CyberStrike 在其上叠加了一层安全特化**。本页之后的章节重点讲特化部分，继承部分请参照 opencode 章节。

## README 口径与代码事实

README 的宣传数字都能在代码里对上，写在这里供对照：

| README 口径 | 代码事实 |
| --- | --- |
| 13+ 专业智能体 | `agent/agent.ts` 实际定义 23 个（含隐藏的内部角色）：1 个主智能体 + 4 个领域智能体 + 9 个代理测试器 + 内部角色 |
| 120+ OWASP 测试用例 | `.cyberstrike/skill/WEB/OWASP_WSTG_4.2/` 下实测 125 个目录，每份是一个 SKILL.md（带 `owasp_id`、`cwe_ids` 字段） |
| 7,600+ 技能文件 | 实测 7,662 个 SKILL.md：CIS 基准约 5000 + NIST 约 1600 + MITRE 约 690 + WSTG 125 + 攻击技法与后渗透技能 |
| 56+ 内置工具 | `tool/registry.ts` 注册约 60 个工具定义 |
| Ed25519 签名技能 | `skill/signing.ts` 内置官方公钥，签名校验分四级：official / community / unverified / tampered |

注意两个不在本仓库的东西：Bolt 远程工具服务器（本仓库只有客户端与配对逻辑，服务端独立部署）和 4 个配套 MCP 服务器（独立开源仓库）。

## 组成

| 部分 | 位置 | 职责 |
| --- | --- | --- |
| 主程序 | `packages/cyberstrike/` | opencode 主包的改造版：server、会话、工具、智能体、方法论引擎 |
| hackbrowser | `packages/hackbrowser/` | AI 驱动的浏览器爬取器：Playwright + LLM 导航，捕获 HTTP 流量与页面 UI 上下文 |
| Web UI | `packages/app/` | 浏览器界面（继承自 opencode） |
| 技能库 | `.cyberstrike/skill/` | 7,662 个 SKILL.md，覆盖 WSTG/CIS/NIST/MITRE 与各类攻击技法 |
| 运行方式 | 终端 TUI / Web / 桌面 | TUI 用 Tab 键切换智能体 |

## 章节导航

| 顺序 | 页面 | 内容 |
| --- | --- | --- |
| 1 | [总体架构](/agents/cyberstrike/architecture) | 与 opencode 的血缘、模块地图、数据如何流动 |
| 2 | [智能体与技能库](/agents/cyberstrike/agents-and-skills) | 23 个智能体的分工、方法论引擎、技能库组织 |
| 3 | [代理测试流水线](/agents/cyberstrike/proxy-pipeline) | 浏览器捕获到漏洞上报的完整链路、权限纪律 |
| 4 | [Bolt 与报告](/agents/cyberstrike/bolt-and-report) | 远程工具执行、报告生成机制 |

如果只读一页，读[代理测试流水线](/agents/cyberstrike/proxy-pipeline)——它是 CyberStrike 区别于 opencode 的核心。
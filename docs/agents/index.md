# 总览：同一个循环

这个站点现在拆解七个项目：**Pi**、**Claude Code**、**DSH**、**opencode**、**AtkBrain**、**T3MP3ST** 和 **CyberStrike**。前五个是"自己做循环"的 Agent（其中 AtkBrain 把 Pi 当运行时），T3MP3ST 换了个问题：**已有 agent 怎么被组队、发武器、并建立证据链**；CyberStrike 则展示**同一个 opencode 骨架怎么垂直化成安全工具**。在分别进入它们的章节之前，这一页只回答两个问题：它们共同的形状是什么？差异在哪里？

## 共同的形状

抛开界面和营销词，七个项目都在跑（或支配）同一个循环：

![共同的形状 流程图](/diagrams/agents-index-1.png)

- **循环主体只有五步**：组装上下文、请求模型、过闸门、执行工具、回写结果。七个项目的核心差异不在这里。
- **闸门是产品与玩具的分水岭**：模型只能"提出"动作，执行权永远在本地。六者的审批、沙箱、hook、证据门各不相同，但都遵守这条边界。
- **持久化与压缩服务于长会话**：JSONL 记录、SQLite、事件溯源、摘要压缩——这些不属于核心循环，却决定了一个 Agent 能不能被每天使用。AtkBrain 干脆不用长会话（每轮重建、状态外置到图）；T3MP3ST 则把每次调用做成一次性借脑，连会话都没有。

## 差异在哪里

七个项目对照看七个维度。每个维度一行展开——把列式宽表换成短表加链接，正文里讲细节，避免在窄视口里被挤成竖排。

**架构风格**

| 项目 | 做法 |
| --- | --- |
| Pi | 三层分包：`pi-ai` / `pi-agent-core` / `pi-coding-agent` |
| Claude Code | 一个引擎，多端入口（CLI / IDE / Web） |
| DSH | cordis 插件树：Host / Agent / Client 三平面 |
| opencode | 可嵌入 server + 反射生成 SDK |
| AtkBrain | 外部 Pi 运行时 + 攻击图状态中枢 |
| T3MP3ST | 三层接口 + 战略层 + 操作员池 + 武器库 |
| CyberStrike | opencode 骨架 + 23 安全智能体 + 代理流水线 + 方法论引擎 |

**源码与许可证**

| 项目 | 情况 |
| --- | --- |
| Pi | 开源 monorepo，可逐行读 |
| Claude Code | 闭源，按官方文档与可观察行为拆解 |
| DSH | 启动器开源，能力以 npm 子包组合 |
| opencode | 开源，含 specs 设计文档与 V1/V2 双轨 |
| AtkBrain | 开源 AGPL，授权环境限定 |
| T3MP3ST | 开源 AGPL，附白皮书与功能状态表 |
| CyberStrike | 开源 AGPL，与 opencode 逐文件同源可比 |

**配置哲学、工具呈现、权限模型**

| 项目 | 配置 | 工具呈现 | 权限闸门 |
| --- | --- | --- | --- |
| Pi | 文件约定（`.pi/` 目录） | 统一 schema 的内置 + 扩展 | 扩展 `tool_call` hook |
| Claude Code | 设置文件分层 + 约定优先 | 固定内置工具集 + MCP 外挂 | 六种权限模式 + 规则 |
| DSH | 配置即代码：profile 叠 patch 层 | native 与 Code Mode 双模式 | fail-closed 审批 + 系统级沙箱 |
| opencode | Markdown 即配置 + 按域 Schema | 按 模型 × agent × 权限 过滤 | 每 agent 一套 Ruleset |
| AtkBrain | 角色 / 提示词 / 守卫全部代码化 | 后端工具表动态注册，内置工具全禁 | 四道闸 + 代理链验真 |
| T3MP3ST | archetype 配置 + 声明式任务模板 | 36/111 工具库 + 风险分层门控 | 工具批准门 + 执行前 Scope 拦截 |
| CyberStrike | Markdown agent 定义 + 方法论/技能注入 | 60+ 工具 + http_replay 唯一发包口 | Ruleset 当攻击面纪律 |

**会话与上下文**

| 项目 | 会话形态 | 长会话处理 |
| --- | --- | --- |
| Pi | JSONL entry 树（可分支） | 摘要 entry 承接 |
| Claude Code | JSONL 记录 + 文件检查点 | 自动压缩 + /compact |
| DSH | 事件溯源日志（.zstd）+ 投影 | 两层压缩（结果裁剪 + 摘要） |
| opencode | SQLite + 可重放事件流 | 预算触发 + 滚动摘要 |
| AtkBrain | SQLite 攻击图（每轮重开会话） | 不用长会话，状态外置到图 |
| T3MP3ST | 任务/证据/回执台账 | 不适用：借脑式一次性调用 |
| CyberStrike | SQLite 会话（继承）+ 16 张安全新表 | 继承 opencode + 技能按需加载 |

## 每张架构图都能交互

每个项目的「总体架构」章节顶部都嵌了一张 Archify 生成的交互式架构图（缩放、视图探索、明暗主题、导出），也可以在[架构图合集](/architectures)一页看全，或在新窗口单独打开：

- [Pi 总体架构](/archify/pi-architecture.html)
- [Claude Code 总体架构](/archify/claude-code-architecture.html)
- [DSH 总体架构](/archify/dsh-architecture.html)
- [opencode 总体架构](/archify/opencode-architecture.html)
- [AtkBrain 总体架构](/archify/atkbrain-architecture.html)
- [T3MP3ST 总体架构](/archify/t3mp3st-architecture.html)
- [CyberStrike 总体架构](/archify/cyberstrike-architecture.html)
- [AtkBrain 自循环（工作流）](/archify/atkbrain-loop.html)
- [教程站点总体架构](/archify/site-architecture.html)

## 推荐阅读顺序

![推荐阅读顺序 流程图](/diagrams/agents-index-2.png)

如果你时间有限：只读 pi 的概念篇 + Claude Code 的权限篇 + DSH 的配置篇 + opencode 的架构篇 + AtkBrain 的攻击图篇 + T3MP3ST 的借脑与证据篇 + CyberStrike 的流水线篇，就能拿到七种最有价值的设计思想——**核心纯度、产品完整度、配置自由度、服务边界、状态外置、证据纪律、骨架垂直化**。

## 后续还会增加更多 Agent

站点按「一个项目一个章节树」组织，新增讲解不需要动现有内容。具体怎么做，见[如何新增一个 Agent](/agents/extend)。
# 总体架构

<ArchifyEmbed src="/archify/atkbrain-architecture.html" title="AtkBrain 总体架构（Archify 交互图）" />

这一页回答三个问题：后端由哪些模块组成、一次任务从头到尾怎么流转、Pi 进程是怎么被管理的。

## 后端模块地图

`backend/atkbrain/` 按职责分成十几个模块：

| 模块 | 职责 |
| --- | --- |
| `main.py` | FastAPI 应用装配：中间件栈（强制 HTTPS → 随机入口 → API 鉴权 → 国际化 → CORS）+ 路由挂载 |
| `api/` | REST 路由（`routes.py` 约 1300 行）与 WebSocket（`ws.py`），前端所有请求的入口 |
| `engine/` | 循环引擎：主循环 `loop.py`（约 2900 行）、停止判定 `hunt_clock.py`、监督 `supervise.py`（约 2100 行）、方案绑定 `advisor_bind.py`（约 1900 行）、猎钟、断点恢复、内网可达检查 |
| `agents/` | Pi 运行时封装 `pi_runtime.py`（约 1000 行）、工具实现 `tools.py`（约 2000 行）、提示词 `prompts.py`（约 1100 行）、会话编排 `session.py` |
| `graph/` | 攻击图：数据模型 `model.py`、读写业务 `store.py`（约 3700 行，后端最大的文件）、候选派生 `hypothesize.py`（约 1500 行）、验证 `verify.py`、评级量表 `rating_rubric.py` |
| `exec/` | 命令执行：守卫 `guard.py`（约 1000 行）与执行器 `runner.py` |
| `scope.py` / `scope_pivot.py` | 授权范围判定（43 个函数）与受控的范围扩张 |
| `proxy/` | 代理链：本机 Yakit MITM 桥、出口代理池、代理强制 |
| `memory/` | 记忆库：存储、蒸馏（`evolve.py`）、方法论词表、去特化 |
| `review/` | 二次验证与评级作业调度 |
| `report/` | 报告生成：事实聚合、槽位渲染、HTML/PDF |
| `auth/` | 平台自身安全：随机入口、登录加密、锁定、会话 |
| `db.py` | 全部 SQLite 建表语句 + 单连接（WAL） |

一个能说明设计重心的事实：`graph/store.py` 比主循环 `loop.py` 还大。这个项目的代码量不在"把模型跑起来"，而在"把模型输出整理成经过校验的结构化数据"。

## 一次任务的完整流转

以单目标红队任务为例，从创建到收口共六步：

1. **创建项目。** 控制台提交目标与赛道；后端写入 `projects` 表，登记授权范围。
2. **启动循环。** API 调用 `RunManager.start()`（`scheduler.py`），以 `asyncio.create_task` 拉起该项目的唯一主循环协程 `run_project_loop`（`engine/loop.py:1031`）。
3. **排队。** 按赛道抢占并发信号量（红队槽 / CTF 槽），状态置为 queued。
4. **准备环境与初始图。** 评测类任务先重置环境；普通任务复用容器。入口主机写入攻击图，成为第一个 `target` 节点。
5. **进入主循环**（细节见下一页）。每轮：从图重建简报 → 组装指令 → 从者 Pi 会话执行 → 从者派发工人 → 工具调用过守卫 → 结果落图 → 监督评估 → 判定是否继续。
6. **收口。** 目标达成、预算耗尽或人工停止后：写完成原因、把本次手法蒸馏进记忆库（`memory/evolve.py`）、生成报告（`report/generator.py`）。

## 一次工具调用的流转

模型在 Pi 会话里发起工具调用后，请求按以下路径走：

![一次工具调用的流转 流程图](/diagrams/agents-atkbrain-architecture-2.png)

按序号读：

1. 模型发起工具调用，到达扩展桥（`pi/extensions/atkbrain-tools.ts`）。
2. 扩展桥向后端发 `POST /api/projects/{id}/agent-tools/{name}`，请求头带角色（`x-atkbrain-role`）与 API token。
3. 后端按角色与工具名求值：角色越权（如从者调 HTTP 类工具）直接拒绝；放行则进入守卫链，通过后由 `agents/tools.py` 执行。
4. 执行结果以 JSON 返回扩展桥；如果应答正文以特定短语开头（如"本题已满分"），扩展桥立即中止当前 Pi 会话——判据只认后端本次应答的开头，避免从历史文本误触发。
5. 扩展桥把结果以 tool result 写回对话，模型继续。

补充一点：模型可用的工具就是后端注册的清单（`agents/tools.py`）：`run_cmd`（执行命令）、`http_request`（发请求）、`add_node` / `add_edge`（写攻击图）、`report_finding` / `report_shell` / `report_flag`（上报战果）、`propose_intents` / `resolve_intent`（候选管理）、`mark_honeypot`、`note`、`note_scan_coverage` 等。Pi 自带的 bash、文件读写工具在扩展桥里被直接拦截，`read` 仅允许读取工作区 `.agents/skills/` 下的技能文件。

## Pi 进程管理

Pi 子进程由 `agents/pi_runtime.py` 管理：

| 机制 | 行为 |
| --- | --- |
| 启动形态 | `pi --mode rpc --no-session --offline --provider deepseek --model <model>`；追加 `--no-builtin-tools --no-extensions` 关闭全部内置能力，用 `-e` 只挂扩展桥；技能用 `--skill <绝对路径>` 注入 |
| 系统提示词 | 不走命令行参数（避免超长），写到工作目录文件里，用 `--append-system-prompt` 指向它 |
| 进程池 | 全局默认 32 个进程（上限 96），单项目默认 4 个（上限 8）；超额请求排队 180 秒，不会静默多开 |
| 复用 | 带工具的会话超时后不杀进程，留给下一轮复用，只换指令；一次性会话（御主、蒸馏、报告）用完即弃 |
| 清理 | 扫描 `/proc` 里进程环境变量中的项目 ID 与角色来认领子进程，`killpg` 杀整组；带保护名单防止误杀平台自身进程 |
| 网络 | 子进程环境剥掉所有 proxy 环境变量——出网必须走平台代理链，不允许 Pi 自行选择出口 |

## 平台外壳

| 机制 | 实现 |
| --- | --- |
| 随机入口 | 8 位随机路径（剔除易混淆字符），ASGI 中间件实现，HTTP 与 WebSocket 都经过；不命中入口只返回伪装介绍页，其余路径一律 404 |
| 登录 | 浏览器 RSA-OAEP 加密口令 + 一次性 ticket（120 秒）+ Argon2id 哈希；按用户名（5 次失败/15 分钟）与 IP（20 次/60 分钟）双维度锁定，计数存库、重启不清 |
| 实时推送 | WebSocket。事件分级：紧急事件立即推送，日志/工具类噪音 120 毫秒批量合并；断线指数退避重连 |
| 存储 | 单库 SQLite（WAL）：projects、nodes、edges、findings、intents、memory、steering、auth 相关表都在一个库里 |
| 部署 | 两种镜像：托管评测版（启动即拉题）与完整控制台版（含前端与 Yakit）；compose 用 host 网络，Caddy 终结 2334 端口 TLS，API 在 2333 |

这个"外部运行时 + 全关内置能力 + 单一扩展桥"的组合，与本站 Pi 章节的[扩展插槽](/source/tools-extensions)是同一套机制：扩展不止能"加功能"，也能"把功能全部锁死只留一条通道"。

下一步：[攻击图](/agents/atkbrain/attack-graph)——所有模块围绕的数据结构。
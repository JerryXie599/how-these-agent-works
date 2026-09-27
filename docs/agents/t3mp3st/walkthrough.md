# 任务实况：跟着一次执行走一遍

[AtkBrain 那篇实况](/agents/atkbrain/walkthrough)演示了"平台内嵌运行时"的跑法。这一页用同样的方式走 T3MP3ST——它把推理外包给本机已登录的 coding agent，所以流程里会出现一个很有辨识度的画面：**框架把一段结构化任务书发给 Claude Code / Codex，收回来一段带 JSON 的文本，再自己执行里面的动作。** 例子是演示性的（授权测试的演示靶场 `demo.lab`），所有提示词、任务对象、拒绝消息都按源码真实格式整理并标注出处。

## 第 0 步：下达目标

你打开 War Room（浏览器访问 `:3333/ui`，`server.ts:169`），或者用 CLI / MCP。输入一句自然语言目标：

> 对 demo.lab 做授权范围内的探测与漏洞评估，输出报告。

战略层 OpGeneral（`src/general/index.ts`）把这句话转成结构化的 OpPlan：行动代号、阶段划分、约束条件、验收要求（`OpPlan` 接口，`general/index.ts:55`）。然后启动编排器 TempestCommand。

## 第 1 步：编排器种任务

`tick()` 每秒跑一次。检测到"当前阶段（RECON）还没有任务"时，调用 `createReconTasks`（`src/mission/index.ts:558`）把阶段展开成具体任务。第一个任务对象长这样（源码原文摘录）：

```json
{
  "name": "DNS Enumeration",
  "description": "Enumerate all DNS record types (A, AAAA, MX, TXT, NS, SOA, CNAME) for demo.lab. Identify hosting providers, mail servers, SPF/DKIM/DMARC configuration, and any related domains.",
  "phase": "RECON",
  "operatorType": "recon",
  "status": "pending",
  "priority": 10,
  "dependencies": []
}
```

注意：任务书不是"去探测一下"，而是一份写明做法与产出要求的工单。任务进入队列，等下一次 tick 派给空闲的 Recon 操作员。

## 第 2 步：Recon 操作员"借脑"执行

派发时，框架把任务书组装成 prompt，发给本机已登录的 coding agent（比如 `claude -p` 或 `codex exec`——命令见[推理后端](/agents/t3mp3st/keyless-backbone)）。prompt 里有一段固定的**Standing Orders**（`src/agent/index.ts:580`，原文）：

```text
### Standing Orders
1. Call tools via function calling — do NOT fabricate results
2. Analyze each result before deciding the next action
3. Report findings immediately as you discover them
4. When finished, END your final message with a single fenced ```json block:
   {"findings":[{"title":"…","severity":"critical|high|medium|low|info",
   "details":"… cite the tool output that evidences it …",...}],"abstained":false}
   This block is the ONLY finding channel the harness records — anything
   described only in prose is dropped.
```

最后一条是关键：**只有在结尾 JSON 块里列出的发现才会被记录，正文里用散文描述的一律丢弃。**

## 第 3 步：执行动作

后端 agent 返回"调用 port_scan"的函数调用请求。框架不自己执行——它查 Arsenal 工具注册表（`src/arsenal/index.ts:664`），工具定义是：

```text
name: 'port_scan'
description: 'Scan ports on a target (real TCP connect scan)'
parameters:
  target (必填): 目标 IP 或主机名
  ports  (选填): 如 "22,80,443"，默认 "22,80,443,8080"
  timeout(选填): 每端口毫秒数，默认 2000
```

执行前过两层检查（顺序固定）：**风险门控 → 范围校验**。假设后端 agent 同时想顺手扫一个不在授权清单里的邻居 IP，会收到（`arsenal/index.ts:398` 原文）：

```text
SCOPE DENIED: target '203.0.113.7' is not in the authorized scope —
port_scan refused before execution. Only authorized / loopback / lab targets are permitted.
```

`refused before execution`——拒绝发生在进程启动之前，没有任何流量出去。授权内的 `demo.lab` 正常执行，扫描结果回给后端 agent 继续分析。

## 第 4 步：发现回库，过证据门

Recon 结束时，后端 agent 按契约交回 findings JSON 块。框架逐条跑证据门（`src/evidence/gate.ts`）：

| 条目 | 内容 | 校验结果 |
| --- | --- | --- |
| 1 | "443 端口运行 nginx 1.24" + port_scan 输出引用 | ✅ provenance=tool，入库 |
| 2 | "该站可能存在弱口令"（没有附任何工具输出） | ❌ provenance=context，丢弃并返回原因 |

拒绝原因是明确的（`gate.ts:39` 原文）："no tool-output evidence — provenance-strict requires a finding be backed by real tool output, not prose"。

确认了服务与漏洞线索后，编排器把 `syncFindingToTarget()` 写入目标模型；RECON 阶段任务全部完成，进入下一阶段（Discovery），Scanner 操作员的任务书自动拿到更丰富的目标数据。

## 你在 War Room 看到什么

同一份数据有三个视图：实时任务与操作员状态（哪些在跑、哪些冷却）、目标模型（发现的服务与漏洞）、证据与回执面板（每条 finding 的 provenance 与工具输出引用）。此外每次受门控工具的批准/拒绝、每条 SCOPE DENIED 都有审计记录。

## 收口：数字可复算

任务结束后产出报告。项目 README 里的基准数字（XBEN、Cybench、CVE-Zero 等）全部可以重算：

```bash
npm run verify-claims
```

脚本从 `bench/` 下提交的 JSON 工件重新推导每个数字，文件头明确边界（原文）："this is a REPRODUCIBILITY / REGRESSION check of our OWN committed artifacts, NOT a third-party audit"。

## 与 AtkBrain 实况的三个对照

| 环节 | AtkBrain | T3MP3ST |
| --- | --- | --- |
| 推理 | Pi 子进程常驻，每轮重建简报 | 每个任务一次性调用本机 coding agent |
| 任务书 | 御主方案 + 图重建的简报 | 声明式任务模板 + Standing Orders |
| 结论的门槛 | 图入库校验（九类节点、候选词清洗） | findings JSON 契约 + 证据门 provenance |
| 拦截格式 | `[已拦截 · destructive] …`（中文） | `SCOPE DENIED: … refused before execution`（英文） |

想理解其中任何一个机制的全貌：[推理后端](/agents/t3mp3st/keyless-backbone)、[操作员与杀伤链](/agents/t3mp3st/operators-and-killchain)、[工具层与范围控制](/agents/t3mp3st/arsenal-and-gate)、[证据与复现](/agents/t3mp3st/evidence-and-receipts)。
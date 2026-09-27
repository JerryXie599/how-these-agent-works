# 任务实况：跟着一次执行走一遍

前面几页讲的是部件。这一页把部件串起来：**从你在控制台点下"开始"，到报告生成，系统里按时间顺序发生了什么。** 例子是演示性的（一个授权测试的演示靶场），但每一步出现的提示词、工具调用、拦截消息，都按源码里的真实格式与措辞整理，标注了出处。

> 演示设定：红队赛道，授权目标是一台演示服务器 `demo.lab`（443 端口有 Web 服务）。目标是拿到它的命令执行权限。

## 第 0 步：你在控制台做了什么

浏览器打开控制台（随机入口地址，由 `python -m atkbrain.panel` 打印），新建任务：填目标 `demo.lab`，选"红队"。点开始后，后端做三件事：

1. 在 `projects` 表建一条记录，登记授权范围（scope：只有 demo.lab）；
2. 在攻击图写入第一个节点：`target:demo.lab`；
3. 用 `asyncio.create_task` 拉起这个项目的主循环协程（`engine/loop.py:1031`），任务状态从 queued 变 running。

此刻攻击图上只有一个黑色目标节点。

## 第 1 轮：扫描

**从者拿到什么。** 主循环从图生成一份简报，发给一个全新拉起的 Pi 会话（它不记得任何历史）。简报是结构化的 Markdown，章节固定（`supervisor_brief.py:1394` 起），这一轮它读到的核心内容大致是：

```markdown
## 题目要点
目标 demo.lab，红队赛道，目标 getshell。

## 局面摘要
入口 1 个；服务 0 个；漏洞 0 个；开放 Intent 0 个。

## 已覆盖（螺旋账本）
（尚无扫描记录）

## 攻击图（与控制台图例相同）
target:demo.lab

## 开放 Intent
（空）
```

**从者做了什么。** 它派出 recon 工人。工人调用的第一个工具是 `run_cmd`，真实调用长这样（参数 schema 见 `agents/tools.py:905`）：

```json
{
  "tool": "run_cmd",
  "args": {
    "command": "nmap -sV --top-ports 100 demo.lab",
    "rationale": "首轮端口与服务探测"
  }
}
```

注意 `rationale` 字段——工具定义要求模型附上"为什么执行此命令"，这条会进时间线，你在控制台能看到每个动作的理由。

**结果怎么回来。** `run_cmd` 的返回是一个固定结构的 JSON（`tools.py:923`）：

```json
{
  "tool": "run_cmd", "command": "nmap -sV --top-ports 100 demo.lab",
  "exit_code": 0, "blocked": false,
  "stdout_preview": "PORT   STATE SERVICE\n22/tcp open  ssh\n443/tcp open https ...",
  "stderr_preview": "", "duration": 12.4
}
```

**图怎么变。** 从者把发现写上攻击图——调用 `add_node` 两次、`add_edge` 一次。`add_node` 的参数定义里直接写着规范（`tools.py:1109`）：

```text
"向攻击图新增/更新一个节点……
形成 target→service→info/danger→vuln 链：漏洞/危险点务必再 add_edge
从对应 service 或 info 连过来（LEADS_TO），不要只留 target 直连。"
```

于是图上多了 `service:22/ssh` 和 `service:443/https` 两个绿色节点，都连在目标下面。控制台上你实时看到这两个节点出现。

**一轮怎么结束。** 从者在输出里写出收工短语（`turn_close.py` 定义的 11 个短语之一，如"本轮完成"），扩展桥看到后立即中止这个会话。主循环进入第 2 轮。

## 第 2 轮：发现漏洞

**从者拿到什么。** 又是一个全新会话，简报更新了——"已覆盖（螺旋账本）"里记录了第 1 轮扫过的命令（避免重复扫），"开放 Intent"里出现了派生出的候选（`graph/hypothesize.py` 根据新 service 节点自动生成，比如"对 443 做 Web 指纹与目录枚举"）。

**发生两件值得注意的事。**

其一，web 工人探测 443 后发现一个可疑的登录接口参数。它调 `add_node` 想直接报 RCE——标题里写了"候选 RCE"。**入库校验把"候选"两个字删掉了**（`graph/model.py` 的 `scrub_candidate_rce_label`）：没拿到的 RCE 不允许出现在标题里。这个节点因为还没有证据，落成 `danger`（疑点）而不是 `vuln`。

其二，它接着调 `run_cmd` 想清空一个测试表单，触发守卫：返回给模型的文本是（格式来自 `guard.py:951` 与 `tools.py`）：

```text
[已拦截 · destructive] 拦截破坏性操作：SQL 写操作（DROP/DELETE）在全部赛道被禁止。
```

被拦的请求不会执行，模型收到原因后换打法。你在控制台时间线上看到这条红色拦截记录。

**漏洞确认。** 工人换用受控的验证路径，确认了注入点存在。从者调用 `add_node` 写入 `vuln:443-sqli`（这次有证据，是真 `vuln` 节点），并调 `report_finding` 生成一条漏洞记录。**注意此时它还只是"已发现的漏洞"，不是战果**——`secondary_verified` 还是空，不出正式报告页。

## 第 3 轮：拿到 shell

简报里现在有"开放 Intent：利用 443 注入点"。本轮的 web-exploit 工人利用成功，返回了命令执行输出。从者调用专属工具 `report_shell`（`tools.py:1463`）：

```json
{
  "tool": "report_shell",
  "args": {
    "access": "www-data",
    "host": "demo.lab",
    "channel": "webshell",
    "evidence": "id → uid=33(www-data); whoami → www-data"
  }
}
```

这是**唯一**能宣告"拿到 shell"的通道——直接调 `add_node` 写 goal 节点会被拒绝（错误信息：goal 只能由报捷工具写入）。图上出现橙色 foothold 节点和 goal 节点，最优路径计算把 443 注入 → shell 这条链标成高亮。

**同时**，后台自动做了两件事：这个里程碑被即时写进记忆库（`persist_milestone`，`tools.py:75`——"满分收工前必须 await"）；红队复核作业被排入队列，稍后会有一个专职复核会话独立验证这个漏洞（见第 6 页）。

## 中途插一条人工指令

假设第 3 轮执行中，你在对话框输入："先别动内网，把 443 的证书信息记录一下。" 发生的事（`routes.py` → `scheduler.py` → `loop.py`）：

1. 主循环 2 秒轮询发现打断标记 → **当前轮立即作废**，在跑的工人被中止；
2. 你的指令文本进入下一轮简报的 steering 区块；
3. **接下来 3 轮**，御主方案被压制——引擎不会用自动方案覆盖你刚说的话。

## 收口

红队赛道下 `report_shell` 成功即达成目标。主循环检测到 goal_reached，退出循环，然后：

1. 写完成原因，任务状态变 finished；
2. **记忆蒸馏**：本次手法（栈 → 战术链）经两步处理写入全局记忆库，且因为这是赢局才有资格入库（失败局不蒸）；
3. **报告**：等复核会话完成二次验证后，443 注入这条发现才有正式漏洞页；全部事实聚合进 HTML/PDF 交付报告（封面、执行摘要、攻击路径、资产表、按严重度分组的漏洞）。

## 这条时间线上的每一环，对应哪一页

| 实况里出现的 | 机制详解 |
| --- | --- |
| 简报的固定章节、"已覆盖（螺旋账本）" | [自循环与御主-从者](/agents/atkbrain/loop-and-supervision) |
| `add_node` 的校验（候选 RCE 删除、goal 不可占用、placeholder 降级） | [攻击图](/agents/atkbrain/attack-graph) |
| `[已拦截 · destructive]` 消息、目标判定链 | [执行安全](/agents/atkbrain/safety-gates) |
| 每轮全新会话、收工短语、15 分钟墙钟 | [自循环与御主-从者](/agents/atkbrain/loop-and-supervision) |
| `report_shell` 专属通道、复核作业、报告门槛 | [反夸大、记忆与报告](/agents/atkbrain/memory-and-report) |

想看同样的格式在 T3MP3ST（另一个攻防项目）里怎么表现：[T3MP3ST 任务实况](/agents/t3mp3st/walkthrough)。
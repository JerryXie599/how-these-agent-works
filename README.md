# Pi Agent 原理与实现：从零到一实现一个 AI Agent

> **本仓库是「通用 Agent 与渗透 Agent 解析」教程。**
>
> 七个 Agent 的对照研究，分两类用途：
>
> - **通用 coding agent**——pi / Claude Code / DSH / opencode：在终端里帮人写代码、调用工具、维护会话状态。
> - **渗透 agent**——AtkBrain / T3MP3ST / CyberStrike：用于在已授权环境下做攻击面侦察、漏洞发现、利用验证。
>
> 每篇拆解都回答三个问题：**它的循环骨架长什么样？它把状态放在哪里？它的执行边界怎么守？**

这是一个完整可运行的中文 VitePress 教程站点，原型参考 [earendil-works/pi](https://github.com/earendil-works/pi) 与 [pi.dev 官方文档](https://pi.dev/docs/latest)，从工程视角拆解 Pi Agent 的核心原理，并带你实现一个教学版 Agent。

> **多 Agent 剖析扩展（2026-09）**：站点已从"只讲 Pi"扩展为多 Agent 对照讲解，七个章节（pi + Claude Code + DSH + opencode + AtkBrain + T3MP3ST + CyberStrike），配有 [Archify](https://github.com/tt-a1i/archify) 生成的交互式架构图（`docs/public/archify/`，规格在 `archify-specs/`，可在[架构图合集](docs/architectures.md)一页看全）。新增 Agent 的步骤见站点内[《如何新增一个 Agent》](docs/agents/extend.md)——注册表 `docs/.vitepress/agents.mjs` 一处驱动侧边栏与首页卡片。

教程不是逐文件源码翻译，而是按学习路径组织：

- **Agent 剖析总览**：七个项目的共同循环与差异对照，交互式架构图。
- **Pi 章节**（通用）：三层分包架构、Agent Loop、消息/事件/状态、工具与会话、压缩与扩展机制（移入 Agent 剖析侧栏）。
- **Claude Code 章节**（通用）：架构、权限模式与 Hooks、上下文工程、子代理与 MCP（基于官方文档）。
- **DSH 章节**（通用）：cordis 三平面架构、工具管线、事件溯源会话与两层压缩、配置即代码。
- **opencode 章节**（通用）：可嵌入 server 架构、V1/V2 双轨循环、每 agent 权限 Ruleset、SQLite 会话与 Context Epoch。
- **AtkBrain 章节**（渗透）：把 Pi 当运行时的攻防平台——攻击图状态载体、自循环与御主-从者、执行四道闸、反夸大与记忆蒸馏（机制层拆解，仅限授权环境话题）。
- **T3MP3ST 章节**（渗透）：三层接口 + 战略层 + 每秒调度、8 类角色状态机、Arsenal 门控与 Scope 拦截、证据门与 verify-claims 复算（机制层拆解，仅限授权环境话题）。
- **CyberStrike 章节**（渗透）：opencode 骨架的安全垂直化——23 个智能体、代理测试流水线（hackbrowser→分析→编排→9 测试器）、Bolt 远程工具、7,662 个 SKILL.md 技能库（机制层拆解，仅限授权环境话题）。
- **渐进式 Demo**：四个核心 TypeScript 小 Demo 从最小循环逐步加工具、会话和压缩，另有一个可选真模型烟测 Demo。
- **教学版目标项目**：React + Node.js + TypeScript 实现一个可运行的教学版 Agent。

## 运行教程站点

```bash
npm install
npm run docs:dev
```

构建验证：

```bash
npm run docs:build
```

## 流程图（PNG）

教程里的流程图全部是预渲染的 PNG，存放在 `docs/public/diagrams/`，页面里以 `/diagrams/<name>.png` 引用（点击可打开原图）。

- `npm run docs:diagrams`：扫描 `docs/**/*.md`，把其中的 mermaid 代码块渲染成 PNG 并替换为图片引用（幂等，可重复执行）。
- `npm run docs:diagrams:render`：只按 `specs/mermaid-sources/*.mmd` 里的源码重新渲染 PNG，适合改图后重出图。
- 修改流程图的方式：编辑 `specs/mermaid-sources/<name>.mmd`（原始 mermaid 源码），然后跑 `docs:diagrams:render`。
- 渲染脚本 `scripts/mermaid-to-png.mjs` 会用本机 Chrome（可用 `CHROME_PATH` 覆盖）离线渲染，并做三件事保证可读性：把 SVG viewBox 扩到内容外接框（防裁剪）、给多行标签设置宽松行距、给消息文字加白色描边（连线穿过文字时仍然清晰）。

## 部署教程站点到 Vercel

本仓库默认部署 VitePress 教程站点，配置见 `vercel.json`：

- Install Command：`npm install`
- Build Command：`npm run docs:build`
- Output Directory：`docs/.vitepress/dist`

本地已登录 Vercel CLI 时，可以执行：

```bash
npx vercel deploy --prod
```

教学版 Agent 的 Express API 仍是本地教学运行时，不随这个静态站点配置一起部署。

## 运行渐进式 Demo

```bash
npm run demo:01
npm run demo:02
npm run demo:03
npm run demo:04
```

可选真实模型烟测：

```bash
OPENAI_COMPATIBLE_BASE_URL="https://example.com/v1" \
OPENAI_COMPATIBLE_API_KEY="你的 key" \
OPENAI_COMPATIBLE_MODEL="mimo-v2.5-pro" \
npm run demo:05
```

请只通过环境变量传入 API Key，不要把密钥写进仓库。

## 运行教学版 Agent

```bash
npm run teaching-agent:dev
```

默认地址：

- 前端：`http://localhost:5174/`
- API：`http://localhost:4317/`

也可以单独检查：

```bash
npm run teaching-agent:test
npm run teaching-agent:typecheck
npm run teaching-agent:build
```

## 项目结构

```text
docs/                         # VitePress 教程站点
examples/demos/                # 四个核心渐进式 Demo + 可选真模型烟测
examples/teaching-agent/       # React + Node 教学版目标项目
specs/                         # 项目计划与工作日志
```

## 联系我

Hi，我是 Cell 细胞。可以扫码加我微信，备注 **Github** 就行。

我正在做订阅制真人秀 **造物矩阵·BIP**：👉 [zwjz.flowus.cn](https://zwjz.flowus.cn)，欢迎订阅。

社媒更新：👉 [X / Twitter @cellinlab](https://x.com/cellinlab)

更多信息：👉 [Cell 的个人说明书](https://chaojizhizao.feishu.cn/wiki/Gbm8wMdS1itpk7kIVRlcN2WCnw)

<table align="center">
  <tr>
    <td align="center" width="33%">
      <img src="./public/wetouch/wechat.webp" alt="Cell 细胞微信二维码" width="200"><br>
      <p align="center">扫码加微信</p>
    </td>
    <td align="center" width="33%">
      <img src="./public/wetouch/wechat-channels.webp" alt="Cell 细胞微信视频号二维码" width="200"><br>
      <p align="center">视频号</p>
    </td>
    <td align="center" width="33%">
      <img src="./public/wetouch/wechat-official.webp" alt="Cell 细胞微信公众号二维码" width="200"><br>
      <p align="center">公众号</p>
    </td>
  </tr>
</table>

## 赞助

<table align="center">
  <tr>
    <td align="center" width="50%">
      <img src="./public/sponsor/zfb.webp" alt="支付宝二维码" width="200"><br>
      <p align="center">支付宝</p>
    </td>
    <td align="center" width="50%">
      <img src="./public/sponsor/wx.webp" alt="微信赞赏二维码" width="200"><br>
      <p align="center">微信赞赏</p>
    </td>
  </tr>
</table>

## License

MIT

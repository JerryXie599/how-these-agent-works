# DSH 是什么

dsh 是 DeepSeek 官方发布的编码 Agent 命令行工具（npm 包 `@deepseek-ai/dsh`，仓库 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 `apps/cli`）。它与自己拆解的 pi、Claude Code 最不一样的地方用一句话就能说清：

> **dsh 本身不含 Agent 逻辑。它是一个"产品启动器"：按 profile 叠加 cordis 插件配置层，然后启动你选的运行面。**

::: tip 版本与资料来源
本章按 **dsh 0.1.1-rc.2**（2026-08 安装版）核对。dsh 尚在快速迭代（rc 阶段），具体行为以你本机 `--dump-config` 的输出为准。资料来源：包内 README、各子包 README、`~/.dsh/` 可观察行为。
:::

## 三个关键词

### 1. cordis：一切皆插件

dsh 建立在 cordis 之上——一个"现代 JavaScript 元框架"：插件、fiber 生命周期、依赖注入 Context。dsh 的每个能力（模型适配、工具、沙箱、审批、持久化、UI 组件）都是一条**插件行**，由组合文件声明、由 Loader 实例化。连浏览器端 UI 也是一套插件系统。

### 2. 配置即代码

运行 `dsh web` 时真正发生的不是"打开一个程序"，而是：读取 profile → 按 bundle 顺序叠 patch 层 → 合成一颗配置树 → 挂载。改一个 patch 文件，运行中的 dsh 会**热重载**（HMR）。`--dump-config` 能把合成结果完整倒出来看。

### 3. 双运行面

| 运行面 | 命令 | 形态 |
| --- | --- | --- |
| web | `dsh web` | HTTP 服务器 + 浏览器 React UI，自动打开浏览器 |
| headless | `dsh --profile headless "任务"` | 一次性运行：跑完把最终答案写到 stdout 退出 |

当前发行版没有内置 TUI——浏览器 UI 才是它的一等公民。这与 pi（终端优先）和 Claude Code（CLI 优先）形成有趣的对照。

## 心智模型：三平面

理解 dsh 只需要一张图——**Host 平面、Agent 平面、Client 平面**：

- **Host 平面**（`dsh-base` bundle）：注册表、模型路由、沙箱、审批、持久化——与 UI 无关的服务器侧能力。
- **Agent 平面**（preset 组合）：每个会话按 preset 挂载一套工具与提示词，跑在唯一的循环实现 `ReactLoopAgent` 上。
- **Client 平面**（浏览器）：React 插槽系统，50+ 个 `dsh-client-ui-*` 插件行拼出整个界面。

## 心智模型之外：四个内置 Preset

`standard` · `code`（PTC 模式）· `cordis`（创造模式）· `minimal`。同一个引擎，四种工具与提示词组合。细节见[配置即代码与 Presets](/agents/dsh/config-and-presets)。

## 与 Pi、Claude Code 第一眼对照

| | Pi | Claude Code | DSH |
| --- | --- | --- | --- |
| 定位 | 小核心 + 扩展 | 产品化全家桶 | 配置即代码的 Harness 启动器 |
| 核心抽象 | 包分层 | 引擎 + 闸门 | cordis 插件行 |
| UI | 终端 TUI / RPC / print | CLI / IDE / Desktop / Web | 浏览器 UI / headless |
| 源码 | 全开源 | 闭源 | 启动器开源（MIT），子包组合 |
| 独门绝技 | 教学友好、结构清晰 | 权限与上下文工程 | patch 热重载、模型自己写插件 |

## 本章节怎么读

| 顺序 | 页面 | 读完你会知道 |
| --- | --- | --- |
| 1 | [总体架构与启动链路](/agents/dsh/architecture) | 一条命令怎么变成一颗插件树 |
| 2 | [Agent 循环与工具管线](/agents/dsh/loop-and-tools) | ReactLoopAgent、收件箱、工具六步管线、Code Mode |
| 3 | [事件溯源会话与两层压缩](/agents/dsh/session-and-compaction) | 日志即真相、投影派生历史、压力驱动的压缩 |
| 4 | [配置即代码与 Presets](/agents/dsh/config-and-presets) | patch 叠层顺序、settings、审批与沙箱 |

读 dsh 的最佳状态是：你已经读过 pi 的[核心概念](/concepts/what-is-agent)，带着"pi 会怎么做"的对照去惊异于 dsh 的选择。

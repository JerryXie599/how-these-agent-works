# DSH 总体架构与启动链路

dsh 的架构图先放在这里，然后我们沿着**一条命令的生命周期**把它走一遍。

<ArchifyEmbed src="/archify/dsh-architecture.html" title="DSH 总体架构（Archify 交互图）" />

## 启动链路：一条命令怎么变成一颗插件树

![启动链路：一条命令怎么变成一颗插件树 流程图](/diagrams/agents-dsh-architecture-1.png)

每一步都值得展开：

### 1. bin.js：极薄的启动器

`dsh` 命令对应的 `bin.js` 只解析属于自己的 flag（`--profile`、`--patch`、`--dump-config`、`--dump-default-config`），第一个不认识的参数之后的所有内容原样交给要启动的 app。启动器不包含任何 Agent 逻辑。

### 2. 分层环境与 profile

`loadLayeredEnv("dsh")` 合成一张"继承环境 > 项目 .env > 用户 .env"的冻结环境快照，并记录每个值来自哪一层。随后 `loadProfile()` 读 `$DSH_HOME/profiles/<name>/`——本机初始化后有 `web/` 与 `headless/` 两个 profile，各自是一个 pnpm 工作区，`package.json` 里声明它要叠哪些 bundle（如 `dsh-base` + `dsh-web-app`）。

### 3. patch 叠层：配置即代码的核心

| 顺序 | 层 | 谁写的 |
| --- | --- | --- |
| 1 | 各 bundle 自带的 `cordis.patch.yml`（按 `dsh.profile.bundles` 声明顺序） | 包作者 |
| 2 | profile 自己的 `cordis.patch.yml` | profile 维护者 |
| 3 | home 级 `$DSH_HOME/cordis.patch.yml` | 你 |
| 4 | `--patch` 命令行覆盖层 | 当次调用 |
| 5 | 遥测开关 patch（环境变量触发） | 启动器 |

`dsh-base` 一层就插入约 78 条插件行（模型适配、工具、沙箱、审批、持久化……）。叠层结果是**声明式**的：你想改行为，不写代码，写一行配置。这与 Claude Code 的"分层设置文件"目标一致，但 dsh 走得更远——连 UI 布局都是配置行。

### 4. 挂载与热重载

`boot()`（来自 `dsh-app-boot`）挂载 cordis 树，Loader 逐行实例化插件；`cordis-plugin-timer` + `cordis-plugin-hmr` 让运行中的 dsh 监听 patch 文件变化——**改配置不重启**。信号处理给出 5 秒宽限的有界停机。

## 三平面

### Host 平面（dsh-base）

与 UI 无关的服务器侧底座：模型适配器（`dsh-llm-deepseek`、`dsh-llm-pi-ai`——是的，它能复用 pi 的模型层）、工具注册表、沙箱、审批、持久化、token 度量、spill 策略。Host 平面的组合由 `dsh-base` + 运行面 bundle 决定，**不随 preset 变化**。

### Agent 平面（presets）

每个 preset（`agent.cordis.yml` 目录）是一套 Agent 组合：工具集、系统提示词、压缩策略。preset 进程内只挂载一次（standing scope），每个会话通过 `dsh-scope` 父链"加入"某个 preset。四个内置 preset：

| preset | 定位 |
| --- | --- |
| `standard` | 标准模式：native 工具调用 |
| `code` | PTC 模式：模型写 TypeScript 用 `run_code` 组合工具 |
| `cordis` | 创造模式：模型可以自己编写并挂载 cordis 插件 |
| `minimal` | 极简模式 |

### Client 平面（浏览器）

`dsh-web-frontend` 是 vite 构建的 React 应用，但它只是"插槽集合"：50+ 个 `dsh-client-ui-*` 插件行各自往布局里注册组件（侧栏、对话流、GoalBar、轨迹时间线……）。浏览器通过"HTTP 上行 / WebSocket 下行"的连接（`dsh-client-connection`）订阅会话事件流。**连客户端都是插件系统**——这是 dsh 最激进的设计。

## 与 Pi、Claude Code 对照

| 话题 | Pi | Claude Code | DSH |
| --- | --- | --- | --- |
| 启动产物 | 一个进程内的会话对象 | 一个引擎实例 | 一颗插件配置树 |
| 配置变更 | 重启或扩展热加载 | 设置文件被监听自动生效 | patch 热重载（HMR） |
| UI 复用核心 | 同一核心多种模式 | 同一引擎多端入口 | Host 平面完全 UI 无关 |
| 模型层 | `pi-ai` 多供应商抹平 | 仅 Anthropic | `dsh-llm` + 适配器（含 pi-ai 桥） |

一个有意思的细节：dsh 的模型适配层里有 `dsh-llm-pi-ai`——**它直接复用了 pi-ai 作为模型后端**。生态之间没有围墙。

下一步：[Agent 循环与工具管线](/agents/dsh/loop-and-tools)，看插件树上的 Agent 怎么跑起来。

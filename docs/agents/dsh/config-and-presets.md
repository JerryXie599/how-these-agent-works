# DSH 配置即代码与 Presets

dsh 的一切行为都由配置声明。本章把配置体系串起来：settings、profile、patch、preset，以及守在副作用门口的审批与沙箱。

## 配置的四个层级

```text
~/.dsh/
├── settings.yaml          # 用户设置：模型供应商、审批策略、各插件的用户层覆盖
├── .credentials.yaml      # 凭据引用（0600，只存引用不存明文 key）
├── profiles/
│   ├── web/               # profile = package.json(bundles) + cordis.yml + cordis.patch.yml
│   └── headless/
├── sessions/              # 事件溯源会话（上一章）
└── storages/              # KV 存储
```

四者的分工：

| 层 | 回答的问题 | 变更生效方式 |
| --- | --- | --- |
| `settings.yaml` | "我有哪些模型、偏好什么" | 部分键热生效（插件 schema 的用户覆盖） |
| profile | "这次启动要哪些 bundle" | 重启（或换 profile） |
| `cordis.patch.yml` 叠层 | "每个 bundle 的行为怎么微调" | **HMR 热重载** |
| preset | "会话用哪套工具与提示词" | 每会话选择 |

## patch 叠层：配置即代码的心脏

![patch 叠层：配置即代码的心脏 流程图](/diagrams/agents-dsh-config-and-presets-1.png)

工程上最实用的两个命令：

```bash
dsh --dump-config           # 倒出合成后的完整配置树
dsh --dump-default-config   # 倒出默认值
```

调试配置问题时，**永远以 `--dump-config` 的输出为准**——它是最终事实，中间每一层的猜测都不算数。

### 凭据只存引用

`settings.yaml` 里配置供应商时，`apiKeyEnv` 写的是**环境变量的名字**，不是 key 本身；真实值由 provider 持有（`.credentials.yaml` 也只存引用，权限 0600）。这个"settings 携带引用、provider 持有值"的分离让配置文件可以进版本库。Claude Code 的对应物是 `apiKeyHelper` 脚本与环境变量——同样的思想，更深的执行。

## 四个内置 Preset

preset 是 **Agent 平面**的组合（工具 + 提示词 + 压缩策略），Host 平面（注册表、沙箱、审批、持久化）不随 preset 变。发行版内置四个：

| preset | 定位 | 特色 |
| --- | --- | --- |
| `standard` | 标准模式 | native 工具调用；裁剪 8192/4096/1024 与压缩共享一个 isolate realm |
| `code` | PTC 模式 | 工具以 `tools:sdk` 呈现，模型只调用 `run_code`，worker 线程执行 |
| `cordis` | 创造模式 | 模型可用 `cordis_define` / `cordis_run` 自己写插件挂载 |
| `minimal` | 极简模式 | 最小工具集 |

三个工程细节：

1. **preset 目录即配置**：每个 preset 是一个 `agent.cordis.yml` 目录，人可以复制、修改、创建自己的 preset（user-trust 根）。
2. **standing scope 挂载一次**：每个 preset 进程内只实例化一次，会话通过 `dsh-scope` 父链加入——多会话共享同一 preset 实例，成本可控。
3. **preset 随会话持久化**：会话头记录 `agentPreset`，恢复会话时原样恢复工具与提示词。

## 审批与沙箱：fail-closed 的闸门

dsh 把"权限"拆成两个互补的系统：

### 审批（ctx.approval）

- **一次性决策**：`allowed-once / rejected / cancelled / unavailable`，缺答（unavailable）按拒绝处理——**fail-closed**。
- 策略 `'ask' | 'never'` 控制哪些操作要问人。
- 每次问答都产生 `approval/asked` + `approval/decided` 事件，天然审计。
- 产品层把它和沙箱模式打包成"Permissions 选择器"（`dsh-permission-presets`），对应 Claude Code 的权限模式。

### 沙箱（ctx.sandbox）

按平台落地为真实隔离机制，不是"君子协定"：

| 平台 | 机制 |
| --- | --- |
| macOS | Seatbelt（sandbox-exec） |
| Linux | bubblewrap / Landlock（node-addon） |
| Windows | 受限令牌 ACL |

两种模式：`read-only` 与 `workspace-write`。配合 `dsh-fs-observation-policy` 的"读后才可写、版本守卫写"，工具的文件副作用被双重约束。

三者对照：

| | Pi | Claude Code | DSH |
| --- | --- | --- | --- |
| 审批模型 | 扩展 hook 自行实现 | 权限模式 + 规则 + 确认框 | fail-closed 审批 seam + 事件审计 |
| 隔离 | 依赖宿主（可扩展加） | 少部分保护路径 + 沙箱建议 | 系统级沙箱 per-OS 落地 |
| 默认哲学 | 信任扩展作者 | 规则声明式、模式分档 | **缺答即拒**，先拒后给 |

## 计划模式与 goal：推进的两种约束

- `dsh-plan-mode`：per-agent 的计划模式，`exit_plan_mode` 需要用户审批后才能进入实现——与 Claude Code 的 plan 模式几乎同构。
- `dsh-goal`：显式目标状态机，**授权不持久化**（重启后要显式 resume），256 轮上限防失控。见[上一章](/agents/dsh/session-and-compaction)。

## 收尾：三个 Agent 的配置哲学

| | Pi | Claude Code | DSH |
| --- | --- | --- | --- |
| 配置形态 | 文件约定（`.pi/` 目录结构即配置） | 分层 JSON 设置 + 命令行 | YAML 组合树 + patch 叠层 |
| 可观测 | 看目录与日志 | `/status`、分层设置文档 | `--dump-config` 全量倒出 |
| 热更新 | 扩展可热加载 | 设置文件监听生效 | patch HMR |
| 组合单位 | 扩展 | 设置键 | 插件行 |

到这里，三个 Agent 的剖析就完整了。回到[总览](/agents/)再看一眼那张对比表，很多格子现在应该有了温度。

想动手扩展这个站点？→ [如何新增一个 Agent](/agents/extend)

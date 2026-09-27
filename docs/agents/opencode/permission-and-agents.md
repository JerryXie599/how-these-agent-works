# opencode 权限与 Agents

opencode 把「agent」和「权限」绑在一起：**每个 agent 就是一套提示词 + 一套模型 + 一套 Ruleset**。这是它和另外三个 Agent 差异最大的设计，也是本章的主角。

## 内置 Agents

| agent | 定位 | 权限基线 |
| --- | --- | --- |
| `build`（主） | 默认工作模式，负责改代码 | 全权限；额外放行 `question`、`plan_enter` |
| `plan`（主） | 只读规划模式 | 编辑全禁，只允许写 `.opencode/plans/*.md`；禁用 `task.general`；可 `plan_exit` |
| `general`（子代理） | 通用委派 | 禁 `todowrite` |
| `explore`（子代理） | 只读探索 | `"*": "deny"`，只放行 grep/glob/list/bash/webfetch/websearch/read |
| `compaction` / `title` / `summary`（隐藏） | 压缩、标题、摘要 | `"*": "deny"`（它们只调用模型，不该碰工具） |

两个工程判断值得注意：

1. **隐藏 agent 也有权限**。做摘要的 agent 被显式禁掉所有工具——防的不是模型犯错，而是避免压缩流程意外产生副作用。
2. **`explore` 是白名单哲学**：默认全拒，逐个放行。找出一个 Agent 里"探索类子代理"该给它多少权限，白名单比黑名单可靠，这是一个现成答案。

## 规则形态：per-tool × per-pattern × per-agent

权限配置写起来是这样的：

```jsonc
{
  "permission": {
    "bash": { "git push *": "ask", "*": "allow" },
    "edit": "allow",
    "read": { "*.env": "ask" },
    "external_directory": { "*": "ask" }
  }
}
```

| 概念 | 说明 |
| --- | --- |
| 三态 | `ask` / `allow` / `deny` |
| 键（permission） | `read / edit / glob / grep / list / bash / task / external_directory / todowrite / question / webfetch / websearch / lsp / doom_loop / skill`，且允许自定义键 |
| 模式（pattern） | 通配符，规则可以整串简写（`"edit": "allow"` 等价 `{"*": "allow"}`） |
| 求值 | **最后一条匹配的规则生效**，完全没匹配时默认 `ask` |
| 越权维度 | `external_directory` 单独管「工作区之外的路径」 |

### 求值顺序：最后匹配优先

```ts
// packages/opencode/src/permission/index.ts
rulesets.flat().findLast(rule =>
  Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern)
) ?? { action: "ask", permission, pattern: "*" }
```

注意这里和 Claude Code 正好**相反**：Claude Code 是 deny → ask → allow、先匹配先赢（安全优先）；opencode 是最后匹配生效（便于用「通用规则 + 末尾例外」的写法覆盖）。配置文件从上到下读，后写的赢——对配置作者更直觉，但写严格策略时要小心顺序。

### bash 的可读性处理

`bash` 规则的 pattern 是命令字符串，怎么匹配 `npm run build --watch` 这种命令？opencode 用一张**命令 arity 表**（`git` 取 2 段、`npm run` 取 3 段、`aws` 取 3 段……）把 shell 命令裁剪成「人类可理解的命令」再做通配匹配。这张表本身是用 LLM 生成、以注释说明规则的——一个很诚实的小工程技巧。

## Ruleset 合并：三层

每个 agent 的最终权限是三层合并的结果：

![Ruleset 合并：三层 流程图](/diagrams/agents-opencode-permission-and-agents-1.png)

默认基线刻意宽松（`"*": "allow"`），靠 `plan`/`explore` 这类 agent 用 deny 收紧——**安全模型建立在"选对 agent"而不是"默认最严"**。这和 DSH 的 fail-closed 哲学恰好相反，使用时要知道自己在哪个世界里。

## 一次权限询问的生命周期

![一次权限询问的生命周期 流程图](/diagrams/agents-opencode-permission-and-agents-2.png)

三个细节：

- **拒绝可以带反馈**：`CorrectedError(feedback)` 会把用户的话作为工具错误回给模型——比单纯的"被拒绝"信息量高得多。
- **"总是允许"按项目持久化**：批准记录写进 SQLite 的 `permission` 表（`projectID + action + resources`），重启后仍生效。
- **deny 直接抛错**：错误消息里带上触发它的规则 JSON，用户排查"为什么被拒"不用猜。

## 与另外三个 Agent 对照

| 话题 | Pi | Claude Code | DSH | opencode |
| --- | --- | --- | --- | --- |
| 权限绑定 | 扩展 hook | 会话模式 + 规则 | 审批 seam + 沙箱 | **每个 agent 一套 Ruleset** |
| 规则求值 | 代码逻辑 | deny → ask → allow，先匹配先赢 | fail-closed | 最后匹配生效，默认 ask |
| 默认姿态 | 信任扩展 | 分档（manual 起步） | 缺答即拒 | 宽松基线 + agent 收紧 |
| 询问粒度 | 自定义 | 每工具首次 | 一次性决策 | per-tool × per-pattern |
| 持久批准 | 无 | 规则文件 | 审计事件 | SQLite 按项目存 |
| 沙箱 | 宿主 | 建议容器 | 系统级（Seatbelt/bwrap/ACL） | **无**（bash 即宿主权限） |

最后一格要划重点：opencode 的 `specs` 明确写了 bash **没有沙箱**，spawn 出来的 shell 拥有当前用户的完整权限。它的安全边界完全建立在 agent 选择 + 权限规则 + 用户批准上。

下一步：[会话、上下文与快照](/agents/opencode/context-and-sessions)。
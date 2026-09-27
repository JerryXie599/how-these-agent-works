# 上下文、记忆与压缩

Claude Code 处理上下文的方式，是它作为产品最成熟的部分。核心矛盾只有一句话：**上下文窗口有限，而工程任务需要的信息无限**。它给出的答案是四件事：精选注入、自动记忆、主动压缩、检查点兜底。

## 一次请求的上下文里有什么

![一次请求的上下文里有什么 流程图](/diagrams/agents-claude-code-context-and-memory-1.png)

| 成分 | 来源 | 特点 |
| --- | --- | --- |
| 系统提示 | 内置 | 工具使用说明、安全约束，用户不可见 |
| CLAUDE.md / AGENTS.md | 项目根、`~/.claude/`、子目录 | 团队约定；启动时注入，`#` 快捷追加 |
| auto memory | `~/.claude/projects/<slug>/memory/` | Claude 自己写的跨会话记忆：`MEMORY.md` 索引 + 主题文件 |
| 会话历史 | `<session>.jsonl` | 每条消息与工具结果；大输出已提前落盘 |
| 技能 | 插件与技能目录 | SKILL.md 按需展开，不占常驻上下文 |

**CLAUDE.md 与 auto memory 的分工**值得停下来想清楚：前者是人写给模型的（团队规范、架构决定），后者是模型自己写给自己的（"这个项目测试要用 pnpm"、"用户偏好简洁回复"）。pi 的技能与提示模板解决的是前一半，auto memory 这种"模型自主维护的知识库"是 Claude Code 的特色设计。

## 压缩：窗口满了怎么办

![压缩：窗口满了怎么办 流程图](/diagrams/agents-claude-code-context-and-memory-2.png)

要点：

- **自动压缩在接近上限时触发**，无需用户干预；`/compact` 可以手动触发，还能带指示词（如 `/compact 保留所有 API 设计讨论`）。
- **压缩是摘要不是删除**——与 pi 的"摘要 entry 承接历史"同一思想。pi 的实现在[会话格式与压缩链路](/source/session-compaction)有逐行拆解。
- **工具结果另有细粒度处理**：超大输出在写入会话时就落盘到 `tool-results/`，上下文里只留预览；较早的工具结果也可能被截断。这是"压缩"的微观层，官方称之为 microcompaction 行为。
- **PreCompact / PostCompact hook** 让你在压缩前后插入自己的逻辑（比如把关键状态先写进 CLAUDE.md）。

## 检查点：压缩之外的兜底

压缩解决"窗口装不下"，检查点解决"改坏了想回头"：

- 每次 Edit/Write 前把文件快照存进 `~/.claude/file-history/<session>/`，保留最近 100 个检查点。
- 用户随时回退到某个检查点，会话状态与文件内容一起回滚。
- 这与 DSH 的"语义检查点"（模型请求与副作用前打点）思路不同：Claude Code 的检查点围绕**文件状态**，DSH 围绕**会话事件**。两者可以共存。

## 会话存储结构

```
~/.claude/
├── projects/
│   └── -Users-jerry-CTFmac-培训-第五周/     # 项目路径转义的 slug
│       ├── <session-uuid>.jsonl            # 完整会话记录
│       ├── <session-uuid>/
│       │   ├── subagents/                  # 子代理 transcript
│       │   └── tool-results/               # 超大工具输出
│       └── memory/                         # auto memory
│           ├── MEMORY.md                   # 索引
│           └── debugging.md                # 主题文件
├── file-history/<session>/                 # 检查点快照
├── history.jsonl                           # 全局输入历史
└── settings.json 等                        # 分层设置
```

三个观察：

1. **JSONL 是三个 Agent 的共同选择**。pi 的会话树、Claude Code 的 transcript、DSH 的 `.jsonl.zstd` 事件日志——append-only 的行式记录赢了这场标准化战争。
2. **slug 化的项目目录**让会话天然按项目隔离，`claude --resume` 与 `--continue` 直接读这个目录。
3. **一切明文**。官方文档明确说这些文件未加密。换来的好处是可导出、可 grep、可用脚本后处理——这也是本教程能"行为驱动拆解"的前提。

## 与 Pi 对照

| 话题 | Pi | Claude Code |
| --- | --- | --- |
| 启动注入 | ResourceLoader 装配 `.pi/`：规则、技能、模板 | CLAUDE.md + auto memory + 技能按需展开 |
| 跨会话记忆 | 会话树本身可恢复 | 会话 JSONL + 模型自维护的 auto memory |
| 压缩策略 | `session_before_compact` 摘要 entry | 自动/手动压缩 + Pre/PostCompact hooks |
| 大结果处理 | 工具结果截断 | tool-results 落盘 + microcompaction |
| 回退 | 会话树分支回到任意节点 | 文件检查点回退（线性会话） |

一个有趣的分歧：**分支 vs 检查点**。pi 的会话是树，可以从任意节点分叉重走；Claude Code 的会话是线性的，但配上文件快照后能"连文件一起回滚"。树适合探索，检查点适合交付——取决于你把 Agent 当实验台还是当同事。

下一步：[子代理、MCP 与扩展](/agents/claude-code/subagents-and-mcp)，看上下文不够时怎么"开分身"。

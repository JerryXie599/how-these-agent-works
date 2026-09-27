# 如何新增一个 Agent

这个站点为「多 Agent 剖析」做了结构化准备：新增一个 Agent 的讲解，不需要改动任何现有页面。整个流程是数据驱动的。

先看站点自己是怎么组装的——两条资产管线（Archify 交互图、mermaid 流程图）加一个注册表，全部汇入 VitePress 站点：

<ArchifyEmbed src="/archify/site-architecture.html" title="教程站点总体架构" />

## 目录约定

每个 Agent 的讲解放在 `docs/agents/<id>/` 下，推荐固定槽位：

```text
docs/agents/<id>/
├── index.md                 # 它是什么：定位、心智模型、章节导航
├── architecture.md          # 总体架构：嵌 Archify 交互图 + 逐组件讲解
├── loop-and-tools.md        # Agent 循环与工具系统
├── permission-and-hooks.md  # 权限 / 审批 / hooks（视 Agent 而定可合并）
├── context-and-memory.md    # 上下文、记忆、压缩、会话存储
└── ...                      # 该 Agent 独有的话题
```

槽位不是硬性要求，但保持一致能让读者在不同 Agent 之间快速对照。

## 三步接入

### 1. 在注册表里加一条记录

编辑 `docs/.vitepress/agents.mjs`，向 `agents` 数组追加：

```js
{
  id: "codex",                      // 与目录名一致
  name: "Codex CLI",
  tagline: "一句话定位，会显示在首页卡片里",
  entry: "/agents/codex/",          // 章节入口
  archify: "/archify/codex-architecture.html",
  overview: true,                   // 是否在侧边栏生成章节树
  pages: [
    { text: "Codex CLI 是什么", link: "/agents/codex/" },
    // ...其余页面
  ],
}
```

侧边栏分组、首页 feature 卡片会自动生成。首页的「三个 Agent 怎么选」对比表是手写的，记得同步加一列。

### 2. 生成 Archify 交互架构图

仓库根目录的 `archify-specs/` 存放每张图的 JSON 规格，`docs/public/archify/` 存放交付的 HTML：

```bash
# 用 Archify 校验（9 项全过才算合格）
node ../archify/archify/bin/archify.mjs validate architecture \
  archify-specs/codex.architecture.json --quality showcase --json

# 交付为自包含 HTML
node ../archify/archify/bin/archify.mjs deliver architecture \
  archify-specs/codex.architecture.json \
  docs/public/archify/codex-architecture.html --quality showcase --json
```

规格文件的写法参考现有 `pi.architecture.json`：中文内容配 `"locale": "zh-CN"`，节点不超过 12 个，一条清晰主路径。 Archify 源码克隆在同级的 `archify/` 目录（来自 [tt-a1i/archify](https://github.com/tt-a1i/archify)）。

### 3. 在页面里嵌入

正文里用主题注册的全局组件嵌入交互图：

```md
<ArchifyEmbed
  src="/archify/codex-architecture.html"
  title="Codex CLI 总体架构"
/>
```

页内流程图继续用 ```` ```mermaid ```` 代码块书写，然后运行：

```bash
npm run docs:diagrams
```

脚本会把代码块渲染成 PNG（存到 `docs/public/diagrams/`），源码留档在 `specs/mermaid-sources/`。

## 内容写作约定

参照 pi 与 Claude Code 章节的既有风格：

| 约定 | 原因 |
| --- | --- |
| 每节先回答「这一层为什么存在」 | 读者要的是设计动机，不是 API 罗列 |
| 源码/文档结论都给出来源 | Claude Code 等闭源 Agent 尤其要注明是官方文档还是行为推断 |
| 与已有 Agent 做对照表 | 读者最关心「跟我已知的那个比有什么不同」 |
| 版本敏感的事实标注版本号 | Agent 迭代很快，过期结论比没有结论更糟 |

## 检查清单

- [ ] `docs/agents/<id>/` 页面齐全，入口是 `index.md`
- [ ] `agents.mjs` 已注册，侧边栏出现章节树
- [ ] 首页对比表加了新列
- [ ] Archify 架构图通过 showcase 校验并交付
- [ ] `npm run docs:build` 通过

import { Buffer } from "node:buffer";
import { defineConfig } from "vitepress";
import { agentSidebar } from "./agents.mjs";

// GitHub Pages 项目站部署在 /how-these-agent-works/ 子路径下；
// 部署 workflow 里设 GITHUB_PAGES=1 时自动加 base，本地构建不受影响。
const isPages = process.env.GITHUB_PAGES === "1";

export default defineConfig({
  title: "AI Agent 原理与实现",
  description: "拆解 pi、Claude Code、DSH 的中文渐进式 Agent 教程",
  lang: "zh-CN",
  cleanUrls: true,
  base: isPages ? "/how-these-agent-works/" : "/",
  lastUpdated: true,
  head: [["link", { rel: "icon", href: isPages ? "/how-these-agent-works/logo.svg" : "/logo.svg", type: "image/svg+xml" }]],
  markdown: {
    lineNumbers: true,
    config(md) {
      const defaultFence = md.renderer.rules.fence;
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const info = token.info.trim();
        if (info === "mermaid") {
          const diagram = Buffer.from(token.content, "utf8").toString("base64");
          return `<Mermaid diagram="${diagram}" />`;
        }
        return defaultFence
          ? defaultFence(tokens, idx, options, env, self)
          : self.renderToken(tokens, idx, options);
      };
    }
  },
  themeConfig: {
    logo: "/logo.svg",
    search: {
      provider: "local"
    },
    nav: [
      { text: "Agent 剖析", link: "/agents/" },
      { text: "架构图", link: "/architectures" },
      { text: "学习路线", link: "/quick-start" },
      { text: "核心原理", link: "/concepts/what-is-agent" },
      { text: "最终项目", link: "/project/overview" },
      { text: "来源", link: "/reference/sources" }
    ],
    sidebar: [
      {
        text: "开始",
        items: [
          { text: "课程首页", link: "/" },
          { text: "运行与学习路线", link: "/quick-start" },
          { text: "联系与赞助", link: "/contact" }
        ]
},
      ...agentSidebar(),
      {
        text: "Pi 教学代码与演示",
        collapsed: true,
        items: [
          { text: "渐进式 Demo", link: "/demos/01-loop" },
          { text: "教学版项目总览", link: "/project/overview" },
          { text: "代码到项目的映射", link: "/project/code-map" },
          { text: "从零实现路线", link: "/project/build-00-roadmap" },
          { text: "运行与调试", link: "/project/run" }
        ]
      },
      {
        text: "参考",
        items: [
          { text: "常见错误", link: "/reference/pitfalls" },
          { text: "资料来源", link: "/reference/sources" }
        ]
      }
    ],
    outline: {
      level: [2, 3],
      label: "本页目录"
    },
    docFooter: {
      prev: "上一节",
      next: "下一节"
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/cellinlab/how-pi-agent-works" },
      { icon: "x", link: "https://x.com/cellinlab" }
    ],
    editLink: {
      pattern: "https://github.com/cellinlab/how-pi-agent-works/edit/main/docs/:path",
      text: "编辑此页"
    }
  }
});

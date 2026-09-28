/**
 * Agent 讲解注册表。
 *
 * 新增一个 Agent 的讲解只需要三步：
 *  1. 在 docs/agents/<id>/ 下按下面 pages 的固定槽位写页面；
 *  2. 在这个数组里加一条记录（顺序即展示顺序）；
 *  3. 需要交互架构图时，在 archify-specs/ 下加一份 Archify 规格并
 *     deliver 到 docs/public/archify/<id>-architecture.html。
 *
 * 首页 features、总览页卡片、侧边栏分组都会从这里生成，不需要再改别处。
 */
export const agents = [
	{
		id: "pi",
		name: "Pi",
		tagline: "小核心、靠扩展成长的 terminal coding harness",
		entry: "/agents/pi/",
		archify: "/archify/pi-architecture.html",
		overview: true,
		pages: [
			{ text: "Pi 是什么", link: "/agents/pi/" },
			{ text: "任务实况：跟着一次执行走", link: "/agents/pi/walkthrough" },
			{ text: "总体架构", link: "/agents/pi/architecture" },
			{ text: "Agent 循环与工具系统", link: "/agents/pi/loop-and-tools" },
			{ text: "会话、压缩与扩展机制", link: "/agents/pi/sessions-and-context" },
			{ text: "源码拆解", link: "/agents/pi/source-map" },
		],
	},
	{
		id: "claude-code",
		name: "Claude Code",
		tagline: "一个引擎、多端入口，权限闸门与上下文工程的标杆",
		entry: "/agents/claude-code/",
		archify: "/archify/claude-code-architecture.html",
		overview: true,
		pages: [
			{ text: "Claude Code 是什么", link: "/agents/claude-code/" },
			{ text: "总体架构", link: "/agents/claude-code/architecture" },
			{ text: "Agent Loop 与工具系统", link: "/agents/claude-code/loop-and-tools" },
			{ text: "权限模式与 Hooks", link: "/agents/claude-code/permission-and-hooks" },
			{ text: "上下文、记忆与压缩", link: "/agents/claude-code/context-and-memory" },
			{ text: "子代理、MCP 与扩展", link: "/agents/claude-code/subagents-and-mcp" },
		],
	},
	{
		id: "dsh",
		name: "DSH",
		tagline: "DeepSeek 的配置即代码 Agent Harness，一切皆插件",
		entry: "/agents/dsh/",
		archify: "/archify/dsh-architecture.html",
		overview: true,
		pages: [
			{ text: "DSH 是什么", link: "/agents/dsh/" },
			{ text: "总体架构与启动链路", link: "/agents/dsh/architecture" },
			{ text: "Agent 循环与工具管线", link: "/agents/dsh/loop-and-tools" },
			{ text: "事件溯源会话与两层压缩", link: "/agents/dsh/session-and-compaction" },
			{ text: "配置即代码与 Presets", link: "/agents/dsh/config-and-presets" },
		],
	},
	{
		id: "opencode",
		name: "opencode",
		tagline: "以可嵌入 server 为中心的 Bun + Effect 架构，每 agent 一套权限",
		entry: "/agents/opencode/",
		archify: "/archify/opencode-architecture.html",
		overview: true,
		pages: [
			{ text: "opencode 是什么", link: "/agents/opencode/" },
			{ text: "总体架构", link: "/agents/opencode/architecture" },
			{ text: "Agent 循环与工具系统", link: "/agents/opencode/loop-and-tools" },
			{ text: "权限与 Agents", link: "/agents/opencode/permission-and-agents" },
			{ text: "会话、上下文与快照", link: "/agents/opencode/context-and-sessions" },
			{ text: "扩展机制", link: "/agents/opencode/extendability" },
		],
	},
	{
		id: "atkbrain",
		name: "AtkBrain",
		tagline: "把 Pi 当运行时的攻防平台：攻击图驱动自循环，四道闸管住每次执行",
		entry: "/agents/atkbrain/",
		archify: "/archify/atkbrain-architecture.html",
		overview: true,
		pages: [
			{ text: "AtkBrain 是什么", link: "/agents/atkbrain/" },
			{ text: "任务实况：跟着一次执行走", link: "/agents/atkbrain/walkthrough" },
			{ text: "总体架构", link: "/agents/atkbrain/architecture" },
			{ text: "攻击图", link: "/agents/atkbrain/attack-graph" },
			{ text: "自循环与御主-从者", link: "/agents/atkbrain/loop-and-supervision" },
			{ text: "执行安全：四道闸", link: "/agents/atkbrain/safety-gates" },
			{ text: "反夸大、记忆与报告", link: "/agents/atkbrain/memory-and-report" },
		],
	},
	{
		id: "t3mp3st",
		name: "T3MP3ST",
		tagline: "借本机 agent 当大脑的多 Agent 攻防框架，证据链与复现文化是特色",
		entry: "/agents/t3mp3st/",
		archify: "/archify/t3mp3st-architecture.html",
		overview: true,
		pages: [
			{ text: "T3MP3ST 是什么", link: "/agents/t3mp3st/" },
			{ text: "任务实况：跟着一次执行走", link: "/agents/t3mp3st/walkthrough" },
			{ text: "总体架构", link: "/agents/t3mp3st/architecture" },
			{ text: "推理后端：keyless 模式", link: "/agents/t3mp3st/keyless-backbone" },
			{ text: "操作员与杀伤链", link: "/agents/t3mp3st/operators-and-killchain" },
			{ text: "工具层：Arsenal、审批与范围控制", link: "/agents/t3mp3st/arsenal-and-gate" },
			{ text: "证据、工作单与复现", link: "/agents/t3mp3st/evidence-and-receipts" },
		],
	},
	{
		id: "cyberstrike",
		name: "CyberStrike",
		tagline: "opencode 的攻击性安全分叉：23 个智能体、代理测试流水线、Bolt 远程工具",
		entry: "/agents/cyberstrike/",
		archify: "/archify/cyberstrike-architecture.html",
		overview: true,
		pages: [
			{ text: "CyberStrike 是什么", link: "/agents/cyberstrike/" },
			{ text: "总体架构", link: "/agents/cyberstrike/architecture" },
			{ text: "智能体与技能库", link: "/agents/cyberstrike/agents-and-skills" },
			{ text: "知识库深读：三家对比", link: "/agents/cyberstrike/knowledge-deep-dive" },
			{ text: "代理测试流水线", link: "/agents/cyberstrike/proxy-pipeline" },
			{ text: "Bolt 与报告", link: "/agents/cyberstrike/bolt-and-report" },
		],
	},
];

/** 首页 feature 卡片：从注册表生成 */
export function agentFeatures() {
	return agents.map((a) => ({
		title: a.name,
		details: a.tagline + "。点击进入对应讲解。",
		link: a.entry,
	}));
}

/** 侧边栏「Agent 剖析」分组：总览页 + 每个 Agent 的章节树 */
export function agentSidebar() {
	const groups = [
		{
			text: "Agent 剖析",
			collapsed: false,
			items: [
				{ text: "总览：同一个循环", link: "/agents/" },
				{ text: "架构图合集", link: "/architectures" },
				{ text: "如何新增一个 Agent", link: "/agents/extend" },
			],
		},
	];
	for (const a of agents) {
		if (!a.overview) continue;
		groups.push({
			text: a.name,
			collapsed: true,
			items: a.pages,
		});
	}
	return groups;
}

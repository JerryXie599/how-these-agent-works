#!/usr/bin/env node
/**
 * 把 docs 下的 mermaid 代码块渲染成 PNG，并把代码块替换成图片引用。
 *
 * 用法：
 *   node scripts/mermaid-to-png.mjs            # 抽取 + 渲染 + 回填 + 保存源码
 *   node scripts/mermaid-to-png.mjs --render   # 只按 specs/mermaid-sources 里的源码重新渲染
 *
 * 输出：
 *   docs/public/diagrams/<slug>.png   VitePress 静态资源（站点根路径 /diagrams/）
 *   specs/mermaid-sources/<slug>.mmd  原始 mermaid 源码，便于以后修改和重渲染
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = join(repoRoot, "docs");
const pngDir = join(docsDir, "public", "diagrams");
const sourceDir = join(repoRoot, "specs", "mermaid-sources");

const MERMAID_BUNDLE = join(repoRoot, "node_modules", "mermaid", "dist", "mermaid.min.js");
const FONT_STACK =
	'"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif';

const MERMAID_CONFIG = {
	startOnLoad: false,
	securityLevel: "loose",
	theme: "default",
	fontFamily: FONT_STACK,
	flowchart: { htmlLabels: true, useMaxWidth: false, wrappingWidth: 460, padding: 15 },
	sequence: { useMaxWidth: false, wrap: false, actorMargin: 60, messageMargin: 45 },
	state: { useMaxWidth: false },
	class: { useMaxWidth: false },
	er: { useMaxWidth: false },
	journey: { useMaxWidth: false },
	gantt: { useMaxWidth: false },
	pie: { useMaxWidth: false },
	themeVariables: { fontFamily: FONT_STACK, fontSize: "16px" },
};

// 多行标签行距保护：mermaid 默认行距偏紧，中文容易上下贴住。
// 消息文字白色描边（halo）：时序图生命线、连线穿过标签时，文字仍然清晰可读。
// 注意要加 !important —— mermaid 会在 svg 内部注入自己的样式表，普通规则会被它盖过。
const RENDER_CSS = `
	.nodeLabel, .edgeLabel, .label, .cluster-label, .statediagram-cluster text,
	foreignObject > div, foreignObject span, .messageText, .loopText, .noteText,
	.actor, .taskText, .sectionTitle, .titleText, .pieTitleText, .legend {
		line-height: 1.5 !important;
	}
	.messageText, .messageText tspan,
	.loopText, .loopText tspan,
	.noteText, .noteText tspan,
	.statediagram-cluster text,
	.state-title, .classTitle, .er.entityLabel {
		paint-order: stroke fill !important;
		stroke: #ffffff !important;
		stroke-width: 4px !important;
		stroke-linejoin: round !important;
	}
`;

function slugifyPage(mdPath) {
	return relative(docsDir, mdPath)
		.replace(/\\/g, "/")
		.replace(/\.md$/, "")
		.split("/")
		.join("-");
}

function findChromeExecutable() {
	const candidates = [
		process.env.CHROME_PATH,
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
	];
	for (const candidate of candidates) {
		if (candidate && existsSync(candidate)) return candidate;
	}
	try {
		const found = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
		if (found) return found;
	} catch {
		// ignore
	}
	throw new Error("找不到可用的 Chrome/Chromium，可设置 CHROME_PATH 环境变量");
}

async function listMarkdownFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "public" || entry.name === ".vitepress") continue;
			files.push(...(await listMarkdownFiles(full)));
		} else if (entry.name.endsWith(".md")) {
			files.push(full);
		}
	}
	return files.sort();
}

/** 抽出 md 中所有 mermaid 代码块，返回 { code, start, end, fenceBlock } */
function extractMermaidBlocks(text) {
	const blocks = [];
	const pattern = /```mermaid\n([\s\S]*?)```\n?/g;
	let match;
	while ((match = pattern.exec(text)) !== null) {
		blocks.push({
			code: match[1].replace(/\s+$/, ""),
			start: match.index,
			end: match.index + match[0].length,
			fenceBlock: match[0],
		});
	}
	return blocks;
}

/** 捕捉 /diagrams/<page>-<n>.png 引用，用于在部分已转换的文件里保持编号稳定 */
function findDiagramRefs(text, pageSlugBase) {
	const pattern = new RegExp(`!\\[[^\\]]*\\]\\(/diagrams/${escapeRegExp(pageSlugBase)}-(\\d+)\\.png\\)`, "g");
	return [...text.matchAll(pattern)].map((m) => ({ index: m.index, n: Number(m[1]) }));
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 取某位置之前最近的标题，用作图片 alt 文本 */
function nearestHeading(text, position) {
	const matches = [...text.slice(0, position).matchAll(/^#{1,6}\s+(.+)$/gm)];
	if (matches.length === 0) return "";
	return matches[matches.length - 1][1]
		.replace(/`/g, "")
		.replace(/#+\s*$/, "")
		.trim();
}

/** 统一修正已插入图片的 alt 文本：用所在小节的标题命名 */
async function improveAltTexts() {
	let touched = 0;
	for (const mdFile of await listMarkdownFiles(docsDir)) {
		const text = await readFile(mdFile, "utf8");
		if (!text.includes("/diagrams/")) continue;
		const lines = text.split("\n");
		const headingCounts = new Map();
		let currentHeading = "";
		let changed = false;
		for (let i = 0; i < lines.length; i++) {
			const heading = lines[i].match(/^#{1,6}\s+(.+)$/);
			if (heading) {
				currentHeading = heading[1]
					.replace(/`/g, "")
					.replace(/#+\s*$/, "")
					.trim();
				continue;
			}
			const image = lines[i].match(/^!\[([^\]]*)\]\((\/diagrams\/[^)]+)\)$/);
			if (!image) continue;
			const seen = (headingCounts.get(currentHeading) ?? 0) + 1;
			headingCounts.set(currentHeading, seen);
			const desired = currentHeading ? `${currentHeading} 流程图${seen > 1 ? ` ${seen}` : ""}` : image[1];
			if (image[1] !== desired) {
				lines[i] = `![${desired}](${image[2]})`;
				changed = true;
			}
		}
		if (changed) {
			await writeFile(mdFile, lines.join("\n"), "utf8");
			touched += 1;
		}
	}
	return touched;
}

/** 把 `![alt](/diagrams/x.png)` 变成可点击打开原图的链接写法 */
async function linkifyDiagramImages() {
	let touched = 0;
	for (const mdFile of await listMarkdownFiles(docsDir)) {
		const text = await readFile(mdFile, "utf8");
		if (!text.includes("/diagrams/")) continue;
		const next = text.replace(
			/^(?!\[)!\[([^\]]*)\]\((\/diagrams\/[^)]+\.png)\)$/gm,
			(_match, alt, src) => `[![${alt}](${src})](${src})`,
		);
		if (next !== text) {
			await writeFile(mdFile, next, "utf8");
			touched += 1;
		}
	}
	return touched;
}

async function openPage() {
	const browser = await puppeteer.launch({
		executablePath: findChromeExecutable(),
		headless: true,
		args: ["--no-sandbox", "--font-render-hinting=none", "--disable-lcd-text"],
	});
	const page = await browser.newPage();
	await page.setViewport({ width: 2600, height: 1800, deviceScaleFactor: 2 });
	await page.addScriptTag({ path: MERMAID_BUNDLE });
	await page.evaluate(
		(config, css) => {
			// biome-ignore lint/suspicious/noExplicitAny: 浏览器上下文
			const mermaid = globalThis.mermaid;
			mermaid.initialize(config);
			const style = document.createElement("style");
			style.textContent = css;
			document.head.appendChild(style);
			const holder = document.createElement("div");
			holder.id = "diagram-holder";
			holder.style.cssText =
				"position:absolute;left:0;top:0;display:inline-block;padding:24px;background:#ffffff;";
			document.body.style.margin = "0";
			document.body.style.background = "#ffffff";
			document.body.appendChild(holder);
		},
		MERMAID_CONFIG,
		RENDER_CSS,
	);
	return { browser, page };
}

/**
 * 渲染单个图并截图。返回日志信息。
 * 关键点：把 svg 的 viewBox 扩到内容外接框，避免内容被 SVG 边界裁掉。
 */
async function renderDiagram(page, slug, code) {
	const result = await page.evaluate(
		async (id, source) => {
			// biome-ignore lint/suspicious/noExplicitAny: 浏览器上下文
			const mermaid = globalThis.mermaid;
			const holder = document.getElementById("diagram-holder");
			holder.replaceChildren();
			try {
				const { svg } = await mermaid.render(`mermaid-${id}`, source);
				holder.innerHTML = svg;
			} catch (error) {
				return { ok: false, error: error?.message ?? String(error) };
			}
			const svgEl = holder.querySelector("svg");
			if (!svgEl) return { ok: false, error: "render 未产出 svg" };

			// 去掉 mermaid 写入的 max-width / useMaxWidth 限制，按自然尺寸输出
			svgEl.removeAttribute("style");
			svgEl.style.overflow = "visible";
			svgEl.style.background = "#ffffff";

			// 内容外接框可能超出 viewBox（长标签、边标签），扩到并集，防止裁剪
			let bbox = null;
			try {
				bbox = svgEl.getBBox();
			} catch {
				bbox = null;
			}
			const vb = svgEl.viewBox.baseVal;
			let minX = vb.x;
			let minY = vb.y;
			let maxX = vb.x + vb.width;
			let maxY = vb.y + vb.height;
			if (bbox && (bbox.width > 0 || bbox.height > 0)) {
				minX = Math.min(minX, bbox.x);
				minY = Math.min(minY, bbox.y);
				maxX = Math.max(maxX, bbox.x + bbox.width);
				maxY = Math.max(maxY, bbox.y + bbox.height);
			}
			const pad = 4;
			const width = Math.ceil(maxX - minX + pad * 2);
			const height = Math.ceil(maxY - minY + pad * 2);
			svgEl.setAttribute("viewBox", `${minX - pad} ${minY - pad} ${width} ${height}`);
			svgEl.setAttribute("width", String(width));
			svgEl.setAttribute("height", String(height));
			svgEl.style.width = `${width}px`;
			svgEl.style.height = `${height}px`;

			// 溢出检测：内容是否曾超出原始 viewBox（用于日志）
			const overflowed =
				minX < vb.x - 0.5 || minY < vb.y - 0.5 || maxX > vb.x + vb.width + 0.5 || maxY > vb.y + vb.height + 0.5;

			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			return { ok: true, width, height, overflowed };
		},
		slug,
		code,
	);

	if (!result.ok) throw new Error(`渲染失败 ${slug}: ${result.error}`);

	const holder = await page.$("#diagram-holder");
	const png = await holder.screenshot({ type: "png" });
	await writeFile(join(pngDir, `${slug}.png`), png);
	return result;
}

async function main() {
	const renderOnly = process.argv.includes("--render");
	await mkdir(pngDir, { recursive: true });
	await mkdir(sourceDir, { recursive: true });

	const jobs = [];
	const onlyFilter = process.argv
		.find((arg) => arg.startsWith("--only="))
		?.slice("--only=".length)
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (renderOnly) {
		for (const file of (await readdir(sourceDir)).filter((f) => f.endsWith(".mmd")).sort()) {
			const slug = file.replace(/\.mmd$/, "");
			if (onlyFilter && !onlyFilter.includes(slug)) continue;
			jobs.push({
				slug,
				code: await readFile(join(sourceDir, file), "utf8"),
				mdFile: null,
				blockIndex: -1,
			});
		}
	} else {
		for (const mdFile of await listMarkdownFiles(docsDir)) {
			const text = await readFile(mdFile, "utf8");
			const blocks = extractMermaidBlocks(text);
			if (blocks.length === 0) continue;
			const pageSlugBase = slugifyPage(mdFile);
			const refs = findDiagramRefs(text, pageSlugBase);
			for (const [i, block] of blocks.entries()) {
				// 编号 = 前面已转换的图片数 + 前面剩余的 mermaid 块数 + 1，
				// 这样在“部分已转换”的文件上重复运行也不会覆盖已有 PNG
				const precedingRefs = refs.filter((ref) => ref.index < block.start).length;
				jobs.push({
					slug: `${pageSlugBase}-${precedingRefs + i + 1}`,
					code: block.code,
					mdFile,
					blockIndex: i,
					text,
					blocks,
				});
			}
		}
	}

	if (jobs.length === 0) {
		console.log("没有找到需要渲染的 mermaid 代码块，仅执行图片后处理。");
		const altFixed = await improveAltTexts();
		const linked = await linkifyDiagramImages();
		console.log(`修正 ${altFixed} 个文件的 alt 文本；为 ${linked} 个文件的图片加上原图链接。`);
		return;
	}

	const { browser, page } = await openPage();
	const rendered = new Map();
	const failed = [];
	try {
		for (const job of jobs) {
			try {
				const info = await renderDiagram(page, job.slug, job.code);
				rendered.set(job.slug, info);
				await writeFile(join(sourceDir, `${job.slug}.mmd`), `${job.code}\n`, "utf8");
				console.log(
					`✓ ${job.slug}  ${info.width}x${info.height}@2x${info.overflowed ? "  (viewBox 已扩展)" : ""}`,
				);
			} catch (error) {
				failed.push({ slug: job.slug, message: error?.message ?? String(error) });
				console.error(`✗ ${job.slug}  ${error?.message ?? error}`);
			}
		}
	} finally {
		await browser.close();
	}
	if (failed.length > 0) {
		console.error(`\n有 ${failed.length} 张图渲染失败（对应代码块保持原样）：`);
		for (const item of failed) console.error(`  - ${item.slug}: ${item.message}`);
	}

	if (renderOnly) {
		console.log(`\n已重新渲染 ${jobs.length} 张图到 docs/public/diagrams/`);
		return;
	}

	// 回填：按文件分组，从后往前替换，避免偏移问题
	const byFile = new Map();
	for (const job of jobs) {
		if (!job.mdFile) continue;
		if (!byFile.has(job.mdFile)) byFile.set(job.mdFile, []);
		byFile.get(job.mdFile).push(job);
	}

	let replacedFiles = 0;
	let replacedBlocks = 0;
	for (const [mdFile, fileJobs] of byFile) {
		const text = fileJobs[0].text;
		const ordered = [...fileJobs]
			.filter((job) => rendered.has(job.slug))
			.sort((a, b) => b.blocks[b.blockIndex].start - a.blocks[a.blockIndex].start);
		if (ordered.length === 0) continue;
		let next = text;
		for (const job of ordered) {
			const block = job.blocks[job.blockIndex];
			const heading = nearestHeading(text, block.start);
			const alt = heading ? `${heading} 流程图` : `${slugifyPage(mdFile)} 流程图 ${job.blockIndex + 1}`;
			const imageRef = `![${alt}](/diagrams/${job.slug}.png)\n`;
			next = next.slice(0, block.start) + imageRef + next.slice(block.end);
			replacedBlocks += 1;
		}
		if (next !== text) {
			await writeFile(mdFile, next, "utf8");
			replacedFiles += 1;
		}
	}

	const altFixed = await improveAltTexts();
	console.log(
		`\n渲染 ${rendered.size}/${jobs.length} 张图；替换 ${replacedFiles} 个文件中的 ${replacedBlocks} 个 mermaid 代码块；修正 ${altFixed} 个文件的图片 alt 文本。`,
	);
}

await main();
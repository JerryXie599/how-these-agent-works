<template>
  <div ref="box" class="archify-embed">
    <div class="archify-toolbar">
      <span class="archify-dot"></span>
      <span class="archify-title">{{ title }}</span>
      <span class="archify-hint">Archify 交互图 · 缩放预览</span>
      <button class="archify-zoom" type="button" @click="open = true">放大体验 ⛶</button>
      <a class="archify-open" :href="url" target="_blank" rel="noreferrer">新窗口打开 ↗</a>
    </div>
    <div class="archify-viewport" :style="{ height: viewportHeight + 'px' }" title="点击放大" @click="open = true">
      <iframe
        :src="url"
        :title="title"
        loading="lazy"
        :style="{ width: DESIGN_W + 'px', height: DESIGN_H + 'px', transform: `scale(${scale})` }"
      ></iframe>
    </div>
    <Teleport to="body">
      <div v-if="open" class="archify-lightbox" @click.self="open = false">
        <div class="archify-lightbox-bar">
          <span>{{ title }}</span>
          <button class="archify-close" type="button" @click="open = false">✕ 关闭 (Esc)</button>
        </div>
        <iframe :src="url" :title="title"></iframe>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch, computed } from "vue";
import { withBase } from "vitepress";

const props = defineProps({
  /** 站点根路径下的 archify HTML，如 /archify/pi-architecture.html */
  src: { type: String, required: true },
  title: { type: String, default: "架构图" }
});

// GitHub Pages 项目站部署在子路径下：withBase 把 /archify/x.html 变成 /<repo>/archify/x.html
const url = computed(() => withBase(props.src));

// Archify 工件按 ≥1440×900 的桌面视口自校验，内嵌时按该设计尺寸等比缩放，
// 保证画布完整呈现；需要原生交互时点「放大体验」进入全屏。
const DESIGN_W = 1440;
const DESIGN_H = 900;

const box = ref(null);
const scale = ref(1);
const viewportHeight = computed(() => Math.round((box.value?.clientWidth ?? 0) * (DESIGN_H / DESIGN_W)) || 200);
const open = ref(false);

let ro;
function update() {
  if (box.value) scale.value = box.value.clientWidth / DESIGN_W;
}
onMounted(() => {
  update();
  ro = new ResizeObserver(update);
  ro.observe(box.value);
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  ro?.disconnect();
  window.removeEventListener("keydown", onKey);
});
function onKey(e) {
  if (e.key === "Escape") open.value = false;
}
watch(open, (v) => {
  document.body.style.overflow = v ? "hidden" : "";
});
</script>

<style scoped>
.archify-embed {
  margin: 1rem 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vp-c-bg);
}
.archify-toolbar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.9rem;
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 0.82rem;
  flex-wrap: wrap;
}
.archify-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  flex: none;
}
.archify-title {
  font-weight: 600;
}
.archify-hint {
  color: var(--vp-c-text-3);
  font-size: 0.75rem;
}
.archify-zoom,
.archify-open {
  font-size: 0.78rem;
  white-space: nowrap;
  color: var(--vp-c-brand-1);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.archify-open {
  margin-left: auto;
}
.archify-viewport {
  overflow: hidden;
  cursor: zoom-in;
}
.archify-viewport iframe {
  display: block;
  border: none;
  transform-origin: 0 0;
  pointer-events: none; /* 让点击落在 viewport 上触发放大，而非画布内部交互 */
  background: var(--vp-c-bg);
}
.archify-lightbox {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: var(--vp-c-bg);
  display: flex;
  flex-direction: column;
}
.archify-lightbox-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 1rem;
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 0.85rem;
  font-weight: 600;
}
.archify-close {
  font-size: 0.8rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: none;
  color: var(--vp-c-text-1);
  padding: 0.25rem 0.7rem;
  cursor: pointer;
}
.archify-lightbox iframe {
  flex: 1;
  width: 100%;
  border: none;
  background: var(--vp-c-bg);
}
</style>

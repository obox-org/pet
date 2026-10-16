<script setup lang="ts">
/**
 * 气泡（design D-7：2.6s 自动消失；D-8：单行截断，最大宽 min(200px, 窗体宽-20px)）。
 * 自动消失的计时器在 App.vue 里（那里才知道"互动反馈优先于状态气泡"该保留哪一条），
 * 本组件只负责画：进来/离开各一次淡入淡出，减少动效偏好下不淡。
 */
defineProps<{
  text: string
  tone: 'good' | 'bad'
}>()
</script>

<template>
  <!-- role=status + aria-live=polite：读屏软件会念出反馈；不用 alert 语义是因为它不该打断用户 -->
  <div class="bubble" :class="tone === 'bad' ? 'is-bad' : 'is-good'" role="status" aria-live="polite">
    {{ text }}
  </div>
</template>

<style scoped>
.bubble {
  box-sizing: border-box;
  /* design D-8：气泡最大宽 min(200px, 窗体宽-20px)；窗体宽即视口宽 */
  max-width: min(200px, calc(100vw - 20px));
  padding: 4px 10px;
  border-radius: 999px;
  color: #0f172a;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 气泡是纯提示，不吃指针：吃了会让"指针在气泡上"变成命中，凭空扩大不穿透区域 */
  pointer-events: none;
}

/* 好：色值表的 rgba(244,114,182,0.92)；文字用按钮文字色 #0f172a 保证对比度 */
.bubble.is-good {
  background: rgba(244, 114, 182, 0.92);
  color: #0f172a;
}

/* 坏：色值表的 rgba(15,23,42,0.9) + 描边 rgba(125,211,252,0.5)；文字用主文字色 */
.bubble.is-bad {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(125, 211, 252, 0.5);
  color: #e2e8f0;
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { TEXT } from '../lib/state'
import type { PetStateView } from '../lib/state'

/**
 * 悬停面板（specs/pet-interaction R1/R2；design D-8 定内容与视觉）。
 *
 * 面板 = **一行只读等级名 + 两枚图标按钮**：
 * - 顶部一行「当前好感等级名」（如「心有灵犀」），`var(--font-size-sm)` + `var(--fg-dim)` +
 *   **单行省略**。它是**只读**文字，不可点击、不参与 Tab 序；等级名直接透传入口视图的
 *   `values.levelName`（等级表单一来源在入口 `lib/growth.js` 的 `levelOf`，页面不重算）。
 * - **面板不渲染任何数字**（D-8 的部分推翻只针对"等级名"这一个词；成长值与好感的精确值
 *   只在设置页由宿主渲染）。所以 v1 的"等级行 · 成长 128"与"🐟 3｜🫧 3"两行**整段删除**：
 *   面板上没有一个数字，也没有道具数量。
 * - 互动区**恰好两枚**图标按钮：喂食 / 洗澡（v2 的合法互动只有这两种 + 点击精灵摸头；
 *   v1 的「玩耍」按钮与它的 `play` kind 一并删除，specs/pet-interaction R1）。
 *
 * 图标规格沿用 v1 的 Q17/R53 裁定：
 * - 内联 SVG（`width/height: 22px`、`stroke: #ffffff`【白色线条】、`fill: none`、
 *   `stroke-width: 1.6`、round cap/join），不用 emoji（跨平台渲染不一致）、不用文字标签
 *   （用户要求图标替代）、不用图标字体（本扩展运行时零依赖，缺字体就变成豆腐块）；
 * - 按钮**底色透明**，悬浮时给一层 `var(--hover-bg)` + 描边高亮 `var(--border)`；
 * - 每枚按钮的可访问名 = 中文动作名，写在 `aria-label` 上（**逐字「喂食」「洗澡」**）。
 *   不用原生 `title`：它要等约 1 秒才出现，与"悬浮即时显示动作名"冲突，且与自绘浮层 `.tip`
 *   同时存在会出现双提示 ⇒ 只保留 `.tip`（`aria-hidden`，读屏仍读 `aria-label`）；
 * - 道具不足 ⇒ `aria-disabled="true"` + `opacity: .45` + `cursor: not-allowed`，**图标形状不变**，
 *   `.tip` 照常显示动作名（"这个动作现在不可用"由禁用视觉表达）。
 *   用 `aria-disabled` 而不是 `disabled` 属性：`disabled` 会把按钮移出 Tab 序列（键盘用户再也
 *   够不到、也读不到"这个动作现在不可用"），而 `aria-disabled` 保留聚焦与读屏可达性，
 *   代价是点击仍会派发 ⇒ 拦截写在 `onAct()` 里（见下）。
 * - 焦点环白色 2px（R53 基线）：`.act:focus-visible`、`.close:focus-visible` 逐字一致，
 *   鼠标点按不画环。
 *
 * 配色**只用宿主 token**（design `## UI 视觉规范` 的 token 表）：`--bg-panel`/`--fg`/`--fg-dim`/
 * `--fg-bright`/`--border`/`--hover-bg`/`--font-size`/`--font-size-sm`。白色**只出现两处**：
 * 图标描边（用户明确的"透明底 + 白色线条"）与焦点环（Q17/R53 的明确要求）——其余一律 token，
 * 零自造色值。面板是**窗体内的浮层**，不是新窗体，也不是模态框（design 硬约束 6）：
 * 无遮罩、Esc 可关、关闭窗体只有设置页 toggle 一条路。
 */
const props = defineProps<{
  state: PetStateView
  /** 首帧状态还没回来（首帧拉取未成功）时为 true，面板多显示一行连接提示 */
  syncing: boolean
}>()

const emit = defineEmits<{
  (e: 'interact', kind: 'feed' | 'bathe'): void
  (e: 'close'): void
}>()

const rootEl = ref<HTMLElement | null>(null)
const closeBtn = ref<HTMLButtonElement | null>(null)

/**
 * 两枚动作的可用性（specs/pet-economy）：喂食要有小鱼干、洗澡要有沐浴泡泡。
 * 抽成 computed 供**模板与点击拦截共用**同一个判据，避免"看起来禁用、点下去却发出去了"。
 * 注意这里只看库存：**冷却中不置灰**——冷却的真相只有入口知道（页面不复制 600 秒判据），
 * 且规格要求冷却期内点击也要给一句"再等等"的反馈（点得动才看得到）。
 */
const blocked = computed(() => ({
  feed: props.state.items.fish < 1,
  bathe: props.state.items.bubble < 1
}))

/**
 * 互动入口：`aria-disabled` 的按钮**仍会派发 click**（这是它相对 `disabled` 属性的全部代价），
 * 所以"道具不足就别发"必须在这里拦，否则键盘用户按回车照样把请求送出去。
 */
function onAct(kind: 'feed' | 'bathe'): void {
  if (blocked.value[kind]) return
  emit('interact', kind)
}

/**
 * design UX 节：面板展开时焦点落"喂食"。
 * 两枚按钮都用 `aria-disabled`（不是 `disabled` 属性）⇒ 每一枚都**可聚焦**，
 * 焦点必然落进面板；关闭按钮仍是 DOM 末位（Tab 顺序 = 精灵 → 喂食 → 洗澡 → 关闭面板）。
 * 焦点环只在 :focus-visible 下画，所以鼠标悬停导致的这次聚焦不会出现环。
 */
onMounted(() => {
  const buttons = Array.from(rootEl.value?.querySelectorAll<HTMLButtonElement>('button.act') ?? [])
  const target = buttons[0] ?? closeBtn.value
  target?.focus({ preventScroll: true })
})
</script>

<template>
  <section ref="rootEl" class="panel" role="group" :aria-label="TEXT.panelAria">
    <!--
      顶部一行**只读等级名**（design D-8）：`var(--font-size-sm)` + `var(--fg-dim)` + 单行省略。
      只透传入口的 `values.levelName`；名字超长时省略号截断，**不撑破面板、不换行**。
      面板不渲染任何数字 ⇒ 这里没有成长值、没有好感值、也没有道具数量。
    -->
    <div class="level-row">
      <span class="level">{{ state.values.levelName }}</span>
    </div>

    <!--
      两枚图标按钮**横向一行**，间距 8px（design 布局段：22px×2 + 8px ≈ 52px，远窄于 200px 面板）。
      DOM 顺序 = Tab 顺序 = 喂食 → 洗澡（关闭按钮仍在 DOM 末位）；
      按钮内**没有常驻文字**（可访问名走 aria-label），动作名只在悬浮/键盘聚焦时由 `.tip`
      浮层即时显示（不用原生 title —— 它要等约 1 秒且会与浮层双提示）。
      图标语义：喂食 = 一条小鱼、洗澡 = 泡泡。
    -->
    <div class="actions">
      <button
        type="button"
        class="act"
        :aria-label="TEXT.feed"
        :aria-disabled="blocked.feed ? 'true' : undefined"
        @click="onAct('feed')"
      >
        <!-- 小鱼：椭圆身体 + 分叉尾鳍 + 鳃线 + 眼睛 -->
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <ellipse cx="11" cy="12" rx="7" ry="4.6" />
          <path d="M18 12 21.6 8.4v7.2L18 12Z" />
          <path d="M10.4 9.2c1.4 1.8 1.4 3.8 0 5.6" />
          <circle cx="7.6" cy="10.7" r="0.75" />
        </svg>
        <span class="tip" aria-hidden="true">{{ TEXT.feed }}</span>
      </button>

      <button
        type="button"
        class="act"
        :aria-label="TEXT.bathe"
        :aria-disabled="blocked.bathe ? 'true' : undefined"
        @click="onAct('bathe')"
      >
        <!-- 泡泡：一大两小三颗圆 + 大泡上的高光弧（沐浴泡泡的道具语义） -->
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10" cy="14" r="5" />
          <circle cx="18" cy="7.5" r="3" />
          <circle cx="19" cy="17" r="1.8" />
          <path d="M7.2 11.6c.6-1.2 1.6-2.1 2.9-2.5" />
        </svg>
        <span class="tip" aria-hidden="true">{{ TEXT.bathe }}</span>
      </button>
    </div>

    <p v-if="syncing" class="sync-hint">{{ TEXT.syncing }}</p>

    <!--
      关闭按钮排在 DOM 最后 ⇒ Tab 顺序 = 精灵 → 喂食 → 洗澡 → 关闭面板（design UX 节）；
      视觉上它绝对定位在面板右上角，不占等级行的文本宽度。
    -->
    <button ref="closeBtn" type="button" class="close" :aria-label="TEXT.closePanel" @click="emit('close')">
      ✕
    </button>
  </section>
</template>

<style scoped>
/*
 * 配色**只用宿主 token**（design `## UI 视觉规范` 的 token 表）。
 * 面板底只用 `var(--bg-panel)` + `var(--border)` 描边做玻璃感：**不得**加任何背景模糊滤镜——
 * 官方文档明确 CSS 模糊无法作用于透明窗口下方的桌面内容，加了只白耗 GPU（D-11 复核第 3 条）。
 */
.panel {
  position: relative;
  box-sizing: border-box;
  width: 200px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-panel);
  color: var(--fg);
  font-size: var(--font-size-sm);
  line-height: 1.4;
  /* 面板自身要吃指针（按钮可点、悬停在面板上时不消失）；空白处由父容器的 none 放行 */
  pointer-events: auto;
}

/*
 * 等级行：给右上角的关闭按钮让位（padding-right），并**强制单行**——
 * 等级名再长也只是省略号，绝不换行把面板撑高（design 布局硬约束 4）。
 */
.level-row {
  display: flex;
  align-items: baseline;
  padding-right: 20px;
  overflow: hidden;
  white-space: nowrap;
}

.level {
  display: block;
  min-width: 0;
  max-width: 100%;
  color: var(--fg-dim);
  font-size: var(--font-size-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/*
 * 两枚图标按钮横向一行（design 布局段）。
 * 按钮尺寸 28×28（图标 22px 居中，点击目标够大），间距 8px；`box-sizing: border-box`
 * 保证悬浮时那 1px 描边不会把尺寸撑到 30px（边框槽位恒占 1px，只是颜色在变）。
 */
.actions {
  display: flex;
  flex-direction: row;
  gap: 8px;
}

.act {
  position: relative; /* `.tip` 浮层的定位基准 */
  box-sizing: border-box;
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--fg-dim);
  font-family: inherit;
  font-size: var(--font-size-sm);
  line-height: 1;
  cursor: pointer;
}

/*
 * 悬浮：宿主 token 的悬停背景 + 边框高亮（Q17）。排除禁用态——置灰的那一枚不该因为悬浮而
 * "看起来可用"，但它的 `.tip` 浮层照常显示动作名（"为什么不能点"由禁用视觉表达）。
 */
.act:not([aria-disabled='true']):hover {
  background: var(--hover-bg);
  border-color: var(--border);
}

/*
 * 道具不足：色值表给定的禁用态（`opacity: .45` + `cursor: not-allowed`），**图标形状不变**。
 * 判据取 `aria-disabled` 属性选择器（模板里只有不足时才输出该属性）⇒ 视觉与语义同源，
 * 不会出现"看着能点、其实不可用"的分叉。
 */
.act[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 键盘焦点环：白色 2px（Q17）。保留 `:focus-visible` 语义 ⇒ 鼠标点按不会画环 */
.act:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #ffffff;
}

/*
 * 悬浮/键盘聚焦时**即时**显示的动作名浮层（Q17）。
 *
 * 为什么自绘而不是用原生 `title`：系统提示要等约 1 秒才出现，悬浮"即时显示"做不到；
 * 而且两者同时挂会出双提示 ⇒ 模板里已经去掉 `title`，可访问名只留 `aria-label`
 * （读屏读的是它，浮层挂 `aria-hidden` 避免重复播报）。
 * 零过渡、零延迟：`visibility/opacity` 直接切换。
 */
.tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--fg-bright);
  font-size: var(--font-size-sm);
  font-weight: 400;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none; /* 浮层不吃指针：不干扰按钮自身的命中 */
  visibility: hidden;
  opacity: 0;
  z-index: 1;
}

.act:hover .tip,
.act:focus-visible .tip {
  visibility: visible;
  opacity: 1;
}

/*
 * 图标规格（Q15 + 卡 18 / Q17）：22px 见方、`fill: none` + `stroke: #ffffff`（白色线条，
 * 禁用态只调按钮透明度，形状与配色都不变）、`stroke-width: 1.6`、圆头圆角连接。
 * 写在 CSS 而不是逐个 SVG 属性上：两枚图标共用同一份规格，改一处即可，也不会漏掉某一枚
 * （作用域样式对静态 SVG 同样生效：Vue 把作用域 id 一并写进静态 HTML，无需 :deep）。
 *
 * **改图标时注意**：每枚 `<svg>` 至少保留 4 个"带属性"的子元素（当前：小鱼 4 个、泡泡 4 个）。
 * 这是 Vue 编译器静态提升（`transformHoist` → `stringifyStatic` 的 `ec >= 5`）的触发条件
 * （子树的"带属性节点数" ≥5，含 `<svg>` 自己）——达到后整枚图标会被编译成 `createStaticVNode`
 * 的**静态 HTML 字符串**，构建产物里因此看得到 `<svg` 字面量（产物门禁：`<svg` ≥3，
 * 用来证明"图标确实是内联 SVG、不是图标字体"）。简化掉一个图形会让该门禁无声失效。
 */
.icon {
  display: block;
  width: 22px;
  height: 22px;
  fill: none;
  stroke: #ffffff;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.close {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: var(--hover-bg);
  color: var(--fg-dim);
  font-family: inherit;
  font-size: var(--font-size-sm);
  line-height: 1;
  cursor: pointer;
}

/*
 * 键盘焦点环：白色 2px（卡 19 / 裁定 **R53**，复验报告 O-2）。
 * 与 `.act:focus-visible` 逐字一致（同为白色 2px、同样只在 `:focus-visible` 下画，
 * 鼠标点按不画环）；`aria-label` 等可访问属性一律不动（本次只改颜色环）。
 */
.close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #ffffff;
}

.sync-hint {
  margin: 0;
  color: var(--fg-dim);
  font-size: var(--font-size-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

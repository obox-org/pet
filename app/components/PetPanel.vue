<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { TEXT, displayGrowth } from '../lib/state'
import type { PetStateView } from '../lib/state'

/**
 * 悬停面板（specs/pet-interaction：成长值 + 等级名 + 库存 + **三枚图标按钮同一行**；
 * design D-1/D-6 定视觉与布局、design 布局段定 Q15 的图标行规格）。
 *
 * 卡 15（增补 Q13）：面板 **MUST NOT 显示三属性**——原"饥饿/清洁/心情"三行小条已整段删除
 * （连同那个 `v-for` 的行数据 computed、`.vitals` 一族样式类、属性行专用的显示取整函数，
 * 以及 `@media (prefers-reduced-motion)` 里那条填充色过渡）。属性数值只在
 * **设置页**以进度条呈现（宿主渲染、用宿主 token，显示口径见 specs/pet-settings）。
 *
 * 卡 17（增补 Q15=B）：第四枚按钮（"把宠物收起来/放回来"的那个入口）与其 emit **删除**——
 * 面板 MUST NOT 提供该入口（这个语义只由设置页 toggle 承担 = 关闭即销毁窗体、省 CPU）；
 * 三枚按钮改为**横向一行**的图标按钮：
 * - 图标是**内联 SVG**（`width/height: 22px`、`stroke: #ffffff`【卡 18 / Q17：白色线条】、
 *   `fill: none`、`stroke-width: 1.6`、round cap/join），
 *   不用 emoji（跨平台渲染不一致）、不用文字标签（用户要求图标替代）、不用图标字体
 *   （本扩展运行时零依赖，缺字体就变成豆腐块）；
 * - 按钮**底色透明**（卡 18 / Q17：去掉原来那层青色渐变），悬浮时给一层极淡白叠加
 *   （`rgba(255,255,255,.08)`）+ 描边高亮；
 * - 每枚按钮的可访问名 = 中文动作名，写在 `aria-label` 上（D-16 末段）。卡 18 起**不再用原生
 *   `title`**：它的提示要等约 1 秒才出现，与"悬浮即时显示动作名"的要求冲突，而且与自绘浮层
 *   `.tip` 同时存在会出现双提示 ⇒ 只保留 `.tip`（`aria-hidden`，读屏仍读 `aria-label`）；
 * - 道具不足 ⇒ `aria-disabled="true"` + `opacity: .45` + `cursor: not-allowed`，**图标形状不变**，
 *   浮层照常显示动作名（"这个动作现在不可用"由禁用视觉表达）。
 *   用 `aria-disabled` 而不是 `disabled` 属性：`disabled` 会把按钮移出 Tab 序列（键盘用户再也
 *   够不到、也读不到"这个动作现在不可用"），而 `aria-disabled` 保留聚焦与读屏可达性，
 *   代价是点击仍会派发 ⇒ 拦截写在 `onAct()` 里（见下）。
 *
 * 面板是**窗体内的浮层**，不是新窗体，也不是模态框（design 硬约束 6）：无遮罩、Esc 可关、
 * 关闭窗体只有设置页 toggle 一条路。
 */
const props = defineProps<{
  state: PetStateView
  /** 首帧状态还没回来（首帧拉取未成功）时为 true，面板多显示一行连接提示 */
  syncing: boolean
}>()

const emit = defineEmits<{
  (e: 'interact', kind: 'feed' | 'bathe' | 'play'): void
  (e: 'close'): void
}>()

const rootEl = ref<HTMLElement | null>(null)
const closeBtn = ref<HTMLButtonElement | null>(null)

/**
 * 三枚动作的可用性（specs/pet-economy）：喂食要有小鱼干、洗澡要有沐浴泡泡、玩耍不耗道具 ⇒ 永不禁用。
 * 抽成 computed 供**模板与点击拦截共用**同一个判据，避免"看起来禁用、点下去却发出去了"。
 */
const blocked = computed(() => ({
  feed: props.state.items.fish < 1,
  bathe: props.state.items.bubble < 1,
  play: false
}))

/**
 * 互动入口：`aria-disabled` 的按钮**仍会派发 click**（这是它相对 `disabled` 属性的全部代价），
 * 所以"道具不足就别发"必须在这里拦，否则键盘用户按回车照样把请求送出去。
 */
function onAct(kind: 'feed' | 'bathe' | 'play'): void {
  if (blocked.value[kind]) return
  emit('interact', kind)
}

/**
 * design UX 节：面板展开时焦点落"喂食"。
 * 卡 17 起三枚按钮都用 `aria-disabled`（不是 `disabled` 属性）⇒ 每一枚都**可聚焦**，
 * 焦点必然落进面板（不再需要"顺延到第一个可用按钮"那套兜底）；关闭按钮仍是 DOM 末位。
 * 焦点环只在 :focus-visible 下画，所以鼠标悬停导致的这次聚焦不会出现环。
 */
onMounted(() => {
  const buttons = Array.from(rootEl.value?.querySelectorAll<HTMLButtonElement>('button.act') ?? [])
  const target = buttons[0] ?? closeBtn.value
  target?.focus({ preventScroll: true })
})

const growthValue = computed(() => displayGrowth(props.state.growth.value))
</script>

<template>
  <section ref="rootEl" class="panel" role="group" :aria-label="TEXT.panelAria">
    <!-- 等级行：`深海羁绊 · 成长 128`（design 布局节） -->
    <div class="row-rank">
      <span class="rank-name">{{ state.growth.rankName }}</span>
      <span class="dim">· {{ TEXT.growthLabel }} {{ growthValue }}</span>
    </div>

    <!-- 库存行：小鱼干 / 沐浴泡泡（数字前是 design 布局节给的表意符号） -->
    <div class="row-items">
      <span :aria-label="TEXT.fishLabel + ' ' + state.items.fish">🐟 {{ state.items.fish }}</span>
      <span class="dim">｜</span>
      <span :aria-label="TEXT.bubbleLabel + ' ' + state.items.bubble">🫧 {{ state.items.bubble }}</span>
    </div>

    <!--
      三枚图标按钮**横向一行、等宽**（Q15；design 布局段），间距 8px。
      DOM 顺序 = Tab 顺序 = 喂食 → 洗澡 → 玩耍（关闭按钮仍在 DOM 末位）；
      按钮内**没有常驻文字**（可访问名走 aria-label），动作名只在悬浮/键盘聚焦时由 `.tip`
      浮层即时显示（卡 18 / Q17；不用原生 title —— 它要等约 1 秒且会与浮层双提示）。
      图标语义：喂食 = 一条小鱼、洗澡 = 泡泡、玩耍 = 球。
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
          <ellipse cx="11.5" cy="12" rx="7" ry="4.6" />
          <path d="M18.4 12 22 8.4v7.2L18.4 12Z" />
          <path d="M10.4 9.2c1.4 1.8 1.4 3.8 0 5.6" />
          <circle cx="8.2" cy="10.7" r="0.75" />
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

      <!-- 玩耍不耗道具（specs/pet-interaction），所以永不禁用 -->
      <button
        type="button"
        class="act"
        :aria-label="TEXT.play"
        :aria-disabled="blocked.play ? 'true' : undefined"
        @click="onAct('play')"
      >
        <!-- 球：外圆 + 三条球缝（左弯缝 / 中间直缝 / 右弯缝）= 一眼能认出的沙滩球 -->
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5C9.2 5.9 7.6 8.8 7.6 12s1.6 6.1 4.4 8.5" />
          <path d="M12 3.5v17" />
          <path d="M12 3.5c2.8 2.4 4.4 5.3 4.4 8.5s-1.6 6.1-4.4 8.5" />
        </svg>
        <span class="tip" aria-hidden="true">{{ TEXT.play }}</span>
      </button>
    </div>

    <p v-if="syncing" class="sync-hint">{{ TEXT.syncing }}</p>

    <!--
      关闭按钮排在 DOM 最后 ⇒ Tab 顺序 = 精灵 → 喂食 → 洗澡 → 玩耍 → 关闭面板（design UX 节）；
      视觉上它绝对定位在面板右上角，不占等级行的文本宽度。
    -->
    <button ref="closeBtn" type="button" class="close" :aria-label="TEXT.closePanel" @click="emit('close')">
      ✕
    </button>
  </section>
</template>

<style scoped>
/*
 * 配色逐字取自 design `## UI 视觉规范` 的色值表（本扩展不接主题桥，全部为固定值）。
 * 面板底只用半透明底色 + 描边做玻璃感：**不得**加任何背景模糊滤镜——官方文档明确 CSS 模糊
 * 无法作用于透明窗口下方的桌面内容，加了只白耗 GPU（design D-11 复核第 3 条）。
 * 卡 15：属性小条的三条填充色随属性行一并删除（Q13；色值表已把"属性小条"标为**已移除**）。
 */
.panel {
  position: relative;
  box-sizing: border-box;
  width: 200px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.92);
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.4;
  /* 面板自身要吃指针（按钮可点、悬停在面板上时不消失）；空白处由父容器的 none 放行 */
  pointer-events: auto;
}

.dim {
  color: rgba(226, 232, 240, 0.72);
}

.row-rank {
  display: flex;
  align-items: baseline;
  gap: 4px;
  /* 给右上角的关闭按钮让位，避免"成长 128"被压住 */
  padding-right: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rank-name {
  font-weight: 600;
  color: #e2e8f0;
}

.row-items {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: rgba(226, 232, 240, 0.72);
  white-space: nowrap;
  overflow: hidden;
}

/*
 * 三枚图标按钮**横向一行、等宽**（Q15 / design 布局段）：`flex: 1 1 0` 让三枚在 200px 面板内
 * 均分宽度（含 8px 间距），图标本身居中；不再有文字标签，所以高度按"22px 图标 + 上下留白"给 28px。
 *
 * 卡 18（Q17）：底色**透明**（原来那层青色渐变已删）⇒ 图标用白色线条直接浮在深色玻璃面板上。
 * 边框槽位恒占 1px（透明）——悬浮时的"描边高亮"改它的颜色，不会引起尺寸跳动；
 * `box-sizing: border-box` 保证加了边框仍然是 28px 高（否则会撑到 30px）。
 */
.actions {
  display: flex;
  flex-direction: row;
  gap: 8px;
}

.act {
  position: relative; /* `.tip` 浮层的定位基准 */
  flex: 1 1 0;
  min-width: 0;
  box-sizing: border-box;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #ffffff;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}

/*
 * 悬浮：极淡白叠加 + 描边高亮（Q17）。排除禁用态——置灰的那一枚不该因为悬浮而"看起来可用"，
 * 但它的 `.tip` 浮层照常显示动作名（"为什么不能点"由禁用视觉表达）。
 */
.act:not([aria-disabled='true']):hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.28);
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
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.92);
  color: #ffffff;
  font-size: 11px;
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
 * 写在 CSS 而不是逐个 SVG 属性上：三枚图标共用同一份规格，改一处即可，也不会漏掉某一枚
 * （作用域样式对静态 SVG 同样生效：Vue 把作用域 id 一并写进静态 HTML，无需 :deep）。
 *
 * **改图标时注意**：每枚 `<svg>` 至少保留 4 个"带属性"的子元素（当前：小鱼 4 个、泡泡 4 个、
 * 球 3 条缝）。这是 Vue 编译器静态提升（`transformHoist` → `stringifyStatic`）的触发条件之一
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
  background: rgba(148, 163, 184, 0.25);
  color: #e2e8f0;
  font-family: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

/*
 * 键盘焦点环：白色 2px（卡 19 / 裁定 **R53**，复验报告 O-2）。
 * 原先这里是**青色**半透明焦点环——卡 18 / Q17 把三枚图标按钮的焦点环统一成白色时漏掉了它，
 * 只剩关闭按钮还是青色 ⇒ 同一个面板里两种焦点色看着像两套控件。现在与 `.act:focus-visible`
 * 逐字一致（同为白色 2px、同样只在 `:focus-visible` 下画，鼠标点按不画环）。
 * `aria-label` 等可访问属性一律不动（本次只改颜色环）。
 */
.close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #ffffff;
}

.sync-hint {
  margin: 0;
  color: rgba(226, 232, 240, 0.72);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

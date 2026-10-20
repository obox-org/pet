<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import PetBubble from './components/PetBubble.vue'
import PetPanel from './components/PetPanel.vue'
import {
  REQUEST_TIMEOUT_MS,
  SUBSCRIBE_TIMEOUT_MS,
  createBridge,
  isRecord,
  readAppId,
  unwrap
} from './lib/bridge'
import type { Bridge } from './lib/bridge'
import { DEFAULT_CELL_H, DEFAULT_CELL_W, fetchMetaJson, loadImageElement, normalizeMeta } from './lib/sprites'
import type { SpriteMeta } from './lib/sprites'
import { KIND_TO_STATUS, RANDOM_PERF_PERIOD_MS, decideAnimation, isTransient, knownStatus } from './lib/anim'
import type { PetStatus } from './lib/anim'
import { burstFallbackMs, entryTrackOf } from './lib/burst'
import { panelShouldOpen } from './lib/panel'
import { BUBBLE_MS, DEFAULT_STATE, TEXT, interactDispatch, normalizeState, num } from './lib/state'
import type { PetStateView } from './lib/state'
import { FrameClock } from './lib/frameClock'

/**
 * 图集与元数据一律用**相对路径**：产物落在 `app://extensions/<安装目录>/dist/index.html`，
 * 而安装目录名是 `<name>_<清洗后 author>`（本机为 `pet_chenzhi`，docs/extension-api/guides-user.md:79-88），
 * 写死 `app://extensions/pet/` 会在带 author 的安装态直接 404。
 */
const SHEET_URL = '../assets/whale/spritesheet.webp'
const META_URL = '../assets/whale/pet.json'

/** design 布局节：面板底边 = 精灵高 + 6px */
const PANEL_GAP = 6
/** 命中矩形缓存有效期：布局是固定的（窗体不可 resize），没必要每次 move 都强制回流 */
const HIT_RECT_TTL_MS = 200
/** 订阅失败后的退避：入口未激活时会立刻回"未注册消息处理器"，不退避会把桥刷爆 */
const RETRY_BACKOFF_MS = 2000
/** 状态气泡的展示上限：入口可能给一个很远的 until，页面不许因此把气泡挂死 */
const STATE_BUBBLE_MAX_MS = BUBBLE_MS * 4

/**
 * v2 的合法互动只有三种（入口 `lib/interact.js` 的 `KINDS`）：喂食 / 洗澡 / 点击摸头。
 * v1 的 `play` 已随"面板只剩两枚图标"删除（specs/pet-interaction R1），
 * 面板也只可能发出 `feed`/`bathe`（`onPanelInteract` 的入参类型就是这两项）。
 */
type InteractKind = 'feed' | 'bathe' | 'pet'

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

interface BubbleView {
  text: string
  tone: 'good' | 'bad'
  until: number
  /** 互动反馈气泡：优先于状态气泡（design D-7） */
  interaction: boolean
}

// ---- 响应式状态 ----
const rootEl = ref<HTMLElement | null>(null)
const spriteEl = ref<HTMLElement | null>(null)
const panelSlotEl = ref<HTMLElement | null>(null)

const meta = shallowRef<SpriteMeta | null>(null)
/** 图集本体是否加载成功；false ⇒ 显示 design D-9 的占位而不是白屏 */
const sheetOk = ref(false)
/** 图集尝试是否已落定（未落定前既不画精灵也不画占位，避免闪一下灰圆） */
const assetSettled = ref(false)

const state = shallowRef<PetStateView | null>(null)
/** 首帧状态未到位时用 design D-8 的空态默认值渲染，避免面板闪出一屏 0/100 */
const display = computed<PetStateView>(() => state.value ?? DEFAULT_STATE)
const syncing = ref(true)

const frameIndex = ref(0)
const reducedMotion = ref(false)
const transient = shallowRef<PetStatus | null>(null)
/**
 * 本地这一轮瞬时动画的**来源**（卡 19 · 热修 D-1）：`true` = 入口自发的随机表演（视图的 `anim.self`），
 * `false` = 用户点出来的真实互动（`interact()` 或页面兜底起的轮次）。与 `transient` 同生命周期：
 * 起一轮时与它一起写、播完/被抢占时与它一起清。
 *
 * **为什么需要它**：入口的随机集里有 `eating`/`bathing`/`petted`/`playing` 四项与真实互动
 * 同名同轨，`transient.value` 这个字符串压根分不出"这一轮是谁写的"；而"播完要不要折回呼吸 idle"
 * 恰恰取决于它（自发表演要折——入口的 `transient` 到期不推送，不折就一直渲染；互动不能折）。
 * 非响应式：它只参与"播完时的收尾判定"，不参与渲染（渲染看 `transient` 与 `burstLatched`）。
 */
let transientIsSelf = false
/**
 * 入口自发"表演型"动画的**本地锁存**（design D-2 / specs/pet-sprites R1：每 60 秒随机一轮，播完回落）。
 *
 * 入口报一轮自发表演时会一直报到下一次状态推送（最长一个长轮询周期），而一轮只有 1.4–1.8s；
 * 不锁存的话，本地播完一轮后 `decideAnimation` 又读到同一条 ⇒ 原地跑个不停。
 * 播完置 true（此后按 idle 渲染），入口推来新状态时由 `syncBurst` 复位并重播（见其注释）。
 * 判据是入口给的 `anim.self`（**不是**状态字符串——见 app/lib/burst.ts 的 `entryTrackOf`）。
 */
const burstLatched = ref(false)
/**
 * 锁存的是**哪一条**（判"同一轮里的重复推送"用）。不是响应式：它只参与 syncBurst 的判重，
 * 不参与渲染。
 */
let burstLatchedStatus: PetStatus | null = null
/** 锁存看门狗句柄（见 armBurstWatchdog） */
let burstWatchdog = 0
const bubble = ref<BubbleView | null>(null)
const rev = ref(0)

/** 指针是否命中精灵/面板（几何判定，不依赖浏览器派发的 enter/leave） */
const hovered = ref(false)
/** 面板是否由键盘焦点打开（design UX：键盘路径不依赖鼠标穿透） */
const focusOpened = ref(false)
/**
 * 拖动会话进行中（按下 → 抬起；design D-13 的会话边界）。
 * 与 `hovered` / `focusOpened` 同处响应式状态：它参与 `panelOpen` 的计算（卡 17 / D-2），
 * 必须是 ref 才能让面板在拖动开始/结束时即时开合，而不是等下一次指针事件。
 */
const dragging = ref(false)
/**
 * 面板是否展开 = "指针命中或无鼠标时的键盘展开"，且**排除拖动中**（卡 17 修实机缺陷 D-2）。
 *
 * 卡 16 实机观察到"拖动中途面板弹出来了"（窗体 bounds 到 (280,283) 时 `hasPanel=true`），
 * 根因就是这个 computed 当时只看 `hovered || focusOpened`——而拖动中指针必然落在精灵上，
 * 于是每帧都把面板判成"该开"。判定放进纯函数 `panelShouldOpen`（app/lib/panel.ts）：
 * `hovered` 继续如实反映几何，拖动结束（`dragging` 翻回 false）后面板自动按当前几何恢复，
 * 不需要任何"拖动前是否开着"的补偿逻辑。
 */
const panelOpen = computed(() => panelShouldOpen(hovered.value, focusOpened.value, dragging.value))

// ---- 非响应式的运行时对象（不需要触发渲染） ----
let bridge: Bridge | null = null
let clock: FrameClock | null = null
let motionQuery: MediaQueryList | null = null
let stopped = false
let tornDown = false
const timers = new Set<number>()
let bubbleTimer = 0
let transientTimer = 0
/** design D-2：窗体创建后默认穿透 ⇒ 页面的初始假设就是"没命中"，只在变化时上报 */
let lastInside = false
let lastPointerX = -1
let lastPointerY = -1
let hasPointer = false
/** 最近一次输入是键盘还是指针：决定"精灵获得焦点"该不该展开面板 */
let lastInputWasKey = false
/** Esc / 关闭按钮之后，指针要先离开一次才允许悬停重新展开（否则面板关了又立刻弹回来） */
let needLeaveBeforeReopen = false
/** 程序化移动焦点时抑制 focus 展开，避免"归还焦点 → 触发 focus → 又开面板"的回环 */
let suppressFocusOpen = false
let boxesCache: { boxes: Box[]; at: number; open: boolean } | null = null

// ---- 拖动运行时（design D-13：页面只发**屏幕像素增量**，绝对坐标与钳位归入口/宿主） ----
// `dragging` 本体的 ref 声明在响应式状态区（它参与 panelOpen 计算，卡 17 / D-2）
let dragPointerId = -1
/** 上一次 move 的屏幕坐标：增量 = 本次 - 上次（选 screenX/Y 而不是 movementX/Y 的理由见 onSpritePointerMove） */
let dragLastScreenX = 0
let dragLastScreenY = 0
/** 还没发出去的增量（rAF 合并：一帧内的多次 pointermove 只发一条 pet.drag） */
let dragPendingX = 0
let dragPendingY = 0
let dragRafId = 0
/** 本次按压是否真的拖动过：用于抑制松手瞬间浏览器补发的那次 click（拖动不该算"摸头"） */
let dragMoved = false

/** design D-13：只响应鼠标左键（右键留给桌面上下文菜单，中键无拖动语义） */
const DRAG_BUTTON = 0
/** 超过这个位移才算"真的在拖"：手抖的 1–2px 不该吃掉用户的摸头点击 */
const DRAG_MOVE_THRESHOLD_PX = 3

// ---- 派生：当前该播哪一轨 ----
/**
 * 送进 `decideAnimation` 的入口状态/行号：入口**自发**的随机表演播完一轮（本地锁存）后
 * 双双降级成 idle。
 *
 * 判据是入口给的**来源标记 `anim.self`**（卡 19 · 热修 D-1），不是状态字符串：
 * 随机集的 `eating`/`bathing`/`petted`/`playing` 与真实互动同名同轨，字符串无从区分
 * （卡 18 的 `isSelfBurst` 只认三条同构轨，所以那四项播完永远不回落——D-1 实机停留
 * 5.0/10.0/15.0s、连成一片 24.98s）。真实互动 `self === false` 一律不折，照旧渲染完整一轮。
 * row 也必须一起降级——否则 `decideAnimation` 的"入口没给 status 就按 row 渲染"兜底分支
 * 会拿着 row 2/1/7 继续播侧跑/原地跑轨（app/lib/anim.ts 的 planForRow 路径）。
 * 判定本身是纯函数（app/lib/burst.ts 的 `entryTrackOf`），可被 `node --test` 直接跑。
 */
const entryTrack = computed(() => entryTrackOf(display.value.anim, burstLatched.value))
const entryStatus = computed(() => entryTrack.value.status)
const entryRow = computed(() => entryTrack.value.row)

const plan = computed(() => {
  const m = meta.value
  if (!m) return null
  return decideAnimation(m, {
    // 卡 12（裁定 R14）：优先喂机器可读的 anim.status，label（中文）仅作老数据反查兜底；
    // v2 起状态只剩 idle 与七条表演轨（没有属性轨、没有打盹），页面不再拿三属性做本地判定
    animStatus: entryStatus.value,
    animLabel: display.value.anim.label,
    animRow: entryRow.value,
    transient: transient.value,
    reducedMotion: reducedMotion.value
  })
})

/**
 * 换轨的判据用"序列化后的键"而不是 plan 对象本身：
 * plan 是 computed，每次状态回包都会产生新对象，直接 watch 会让 idle 动画每 60s 被打回第 0 帧。
 */
const planKey = computed(() => {
  const p = plan.value
  return p ? [p.status, p.row, p.count, p.durations.join(',')].join('|') : ''
})

watch(
  planKey,
  () => {
    const p = plan.value
    if (p && clock) clock.setFrames(p.count, p.durations)
  },
  // 同步 flush：换轨要立刻生效，等下一帧会让互动动画晚一帧起跳
  { flush: 'sync' }
)

const spriteStyle = computed(() => {
  const m = meta.value
  const cellW = m?.cellW ?? DEFAULT_CELL_W
  const cellH = m?.cellH ?? DEFAULT_CELL_H
  const p = plan.value
  const row = p?.row ?? 0
  const count = Math.max(1, p?.count ?? 1)
  // 缺帧取模：列号只在**本行声明的帧数**内循环，绝不越界采样相邻行的像素（specs/pet-sprites）
  const col = ((frameIndex.value % count) + count) % count
  const style: Record<string, string> = {
    width: cellW + 'px',
    height: cellH + 'px',
    backgroundPosition: -col * cellW + 'px ' + -row * cellH + 'px'
  }
  if (sheetOk.value) style.backgroundImage = 'url("' + SHEET_URL + '")'
  return style
})

const upperBottom = computed(() => (meta.value?.cellH ?? DEFAULT_CELL_H) + PANEL_GAP)

// ---- 定时器（全部登记，卸载时一次清干净） ----
function setTimer(fn: () => void, ms: number): number {
  const id = window.setTimeout(() => {
    timers.delete(id)
    fn()
  }, Math.max(0, ms))
  timers.add(id)
  return id
}

function clearTimer(id: number): void {
  if (!id) return
  window.clearTimeout(id)
  timers.delete(id)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimer(resolve, ms)
  })
}

// ---- 帧循环 ----
function onFrame(index: number): void {
  frameIndex.value = index
}

function onCycleEnd(): void {
  // 瞬时互动播完一轮就回落到属性判定（specs/pet-sprites 的"播完回落"scenario）
  if (!transient.value) return
  // 先记下这一轮的来源再清：自发表演播完 ⇒ 锁存（此后忽略入口仍在报的同一条）；
  // 真实互动播完 ⇒ 什么都不做，交回状态驱动（app/lib/burst.ts 的 entryTrackOf 按 anim.self 判定）
  const wasSelf = transientIsSelf
  transient.value = null
  transientIsSelf = false
  clearTimer(transientTimer)
  transientTimer = 0
  if (wasSelf) latchBurst()
}

/** 锁住"这一轮入口自发的表演已经播完"，并挂上看门狗（见 armBurstWatchdog） */
function latchBurst(): void {
  burstLatched.value = true
  armBurstWatchdog()
}

/**
 * 起一轮本地瞬时动画。
 * `self`（卡 19）= 这一轮是不是入口**自发**的随机表演：只有 `syncBurst` 会传 true，
 * 用户互动（`interact()` 的两处调用）走默认 false。播完时靠它决定要不要锁存折 idle。
 */
function startTransient(status: PetStatus, self = false): void {
  // 页面侧的 isTransient 含 trot / run-left / run-right（与入口的权威集合**有意不同**，理由见 app/lib/anim.ts 注释）
  if (!isTransient(status)) return
  transient.value = status
  transientIsSelf = self
  clearTimer(transientTimer)
  const p = plan.value
  // 轮长取该轨的真实总时长；计划还没算出来 / 算的是别的轨 ⇒ 交给 burstFallbackMs 用兜底值
  const round = p && p.status === status ? p.total : null
  // 兜底：页面不可见时帧时钟停摆、onCycleEnd 不会来，靠这个定时器保证动画不会永久卡住。
  // 时刻固定为"该轨一轮 + 既有 slack"，**不依赖入口的下一次推送**——入口的 transient 到期
  // 既不 rev++ 也不推送，等下一次 60s 结算 tick 就是 D-1 实机看到的 5/10/15s 停留。
  transientTimer = setTimer(() => {
    if (transientIsSelf) latchBurst()
    transient.value = null
    transientIsSelf = false
    transientTimer = 0
  }, burstFallbackMs(round))
}

/**
 * 收到一份**新的**入口状态（首帧 / rev 变化 / 看门狗补拉）时同步"入口自发表演"的本地一轮。
 *
 * 为什么挂在状态收包（applyState）上、而不是 `watch(display.value.anim.status)`：
 * 入口每 60 秒随机抽一条，**连着两轮抽到同一条**时状态字符串没有变化，watch 根本不会触发
 * ⇒ 那一轮会被吞掉。收包是"入口又报了一次"的唯一可靠信号（rev 变了才会走到这里）。
 *
 * 判据是入口给的 `anim.self`（**不是**状态字符串：随机集里 eating/bathing/petted/playing 四项
 * 与真实互动同名同轨，字符串无从区分——卡 18 的 `isSelfBurst` 只能认三条同构轨，这就是 D-1 的根因）：
 * - `self !== true`（真实互动 / 普通待机 / 拖动中折出来的 idle）⇒ 清锁存，交回状态驱动
 *   （真实互动那一轮由 `interact()` 自己起，`anim.self=false` 保证它不会被折成 idle）；
 * - `self === true` 且 status 是表内合法状态轨（`knownStatus` 守门，畸形回包不许起一轮）：
 *   全新的一条、或上一轮已经播完（锁存中）⇒ 起一轮（`self=true`）；
 *   同一轮里的重复推送（结算 tick 恰好落在这一轮内）⇒ 不重起，否则动画会被打回第 0 帧；
 * - `force`：看门狗补拉到权威状态时用——入口此刻还在报这条自发表演，就当作新一轮重播。
 */
function syncBurst(anim: { status: string; self: boolean }, force = false): void {
  const burst = anim.self === true ? knownStatus(anim.status) : undefined
  if (!burst) {
    burstLatched.value = false
    burstLatchedStatus = null
    return
  }
  if (!force && burstLatchedStatus === burst && !burstLatched.value) return
  burstLatchedStatus = burst
  burstLatched.value = false
  startTransient(burst, true)
}

/**
 * 锁存看门狗（周期 = 入口的随机表演周期 `RANDOM_PERF_PERIOD_MS` = 60 秒）。
 *
 * 锁存的本意是"入口还在报这条 burst、但这一轮已经播完 ⇒ 先按 idle 渲染"，而入口每 60 秒
 * 必然推一次新 rev（随机表演的排程在入口）。所以"锁存后整整一个周期都没等到任何新状态"
 * 只可能是推送断了（窗体停用 / 桥断 / 页面被切走）——此时主动补拉一次权威状态再解锁，
 * 免得画面钉在锁存后的 idle 上（入口可能已经进入别的状态）。
 */
function armBurstWatchdog(): void {
  clearTimer(burstWatchdog)
  burstWatchdog = setTimer(() => {
    burstWatchdog = 0
    if (!burstLatched.value) return // 期间来过新状态 ⇒ 看门狗无事可做
    void resyncBurst()
  }, RANDOM_PERF_PERIOD_MS)
}

/** 补拉一次权威状态（看门狗用）；拉不到就**保持锁存**——宁可停在 idle，也不要退化成"永远跑" */
async function resyncBurst(): Promise<void> {
  if (!bridge || stopped) return
  const res = await bridge.request('pet.state', undefined, REQUEST_TIMEOUT_MS)
  if (stopped) return
  const { ok, data } = unwrap(res)
  if (!ok || !data || data.state === undefined) return
  applyState(data.state, true)
}

// ---- 气泡 ----
/**
 * 气泡时长一律 `BUBBLE_MS`（**4000ms**，specs/pet-interaction R5）。页面与入口是两套构建，
 * 常量镜像在 `app/lib/state.ts`（入口单一来源是 `lib/constants.js` 的 `BUBBLE_MS`，
 * 两侧逐值相等由 `test/view-v2.test.js` 钉住）：入口负责权威到期（清 `speech` 并推送），
 * 页面这条本地定时器负责"到点一定消失"，界面不留残余。
 */
function activeInteractionBubble(): boolean {
  const current = bubble.value
  return !!current && current.interaction && current.until > Date.now()
}

function showBubble(text: unknown, tone: 'good' | 'bad', ms: number, interaction: boolean): void {
  const clean = typeof text === 'string' ? text.trim() : ''
  if (!clean) return
  clearTimer(bubbleTimer)
  const until = Date.now() + Math.max(0, ms)
  bubble.value = { text: clean, tone, until, interaction }
  bubbleTimer = setTimer(
    () => {
      bubble.value = null
      bubbleTimer = 0
    },
    Math.max(0, until - Date.now())
  )
}

function applyState(raw: unknown, forceBurst = false): void {
  const next = normalizeState(raw)
  state.value = next
  syncing.value = false
  // 卡 18（Q16）：入口自发的随机表演是"播一轮就回落"的 burst，逐份状态收包时同步它
  // （顺序要紧：先落定 state.value，startTransient 里的 plan 才能算到这一条）。
  // 卡 19（热修 D-1）：判据取整份 anim（含来源标记 self），不再只看状态字符串。
  syncBurst(next.anim, forceBurst)
  const b = next.bubble
  if (!b) return
  const remaining = b.until - Date.now()
  if (remaining <= 0) return
  // design D-7：互动反馈优先于状态气泡 ⇒ 互动气泡还在展示时不被状态气泡顶掉
  if (activeInteractionBubble()) return
  showBubble(b.text, b.tone, Math.min(remaining, STATE_BUBBLE_MAX_MS), false)
}

/**
 * v1 的打盹提示（睡眠状态下补一句"Zzz"气泡、及其占位欠账）随 design D-10 整段删除：
 * v2 没有睡眠状态、没有"连续多久无交互"的计时、也没有任何长时间无交互的表现
 * （specs/pet-sprites R2：宠物 MUST NOT 进入睡眠状态，也 MUST NOT 有睡眠相关的任何表现）。
 * 气泡只剩三种来源：互动反馈（页面本地）、入口给的定时文本、入口给的拒绝提示。
 */

// ---- 状态同步：首帧拉一次 + 长轮询订阅 ----
async function fetchInitial(): Promise<void> {
  if (!bridge) return
  const res = await bridge.request('pet.ready', undefined, REQUEST_TIMEOUT_MS)
  if (stopped) return
  const { ok, data, error } = unwrap(res)
  if (ok && data) {
    const readyRev = num(data.rev, Number.NaN)
    if (Number.isFinite(readyRev)) rev.value = readyRev
    if (data.state !== undefined) {
      applyState(data.state)
      return
    }
  }
  // 首帧拿不到状态不致命：面板显示空态默认值 + 一行连接提示，长轮询会继续补
  console.warn('[pet] 首帧状态未取到，等长轮询补：' + (error ?? '回包里没有 state'))
}

/**
 * 长轮询订阅循环（design D-3 的 S1 解法）。
 *
 * 入口把 `pet.subscribe` **hold 到状态变化或 25s 超时**才回包，页面收到后**立即重订阅**，
 * 效果等价于推送且零固定轮询开销。25s < 宿主的 60s 请求超时（guides-user.md:143）是这套方案的
 * 前提：超时窗必须由入口先触发，页面才不会把"正常 hold"读成"扩展未响应（超时）"。
 * 超时且 rev 未变 ⇒ 不重绘，只重订阅。
 */
async function subscribeLoop(): Promise<void> {
  while (!stopped) {
    if (!bridge) return
    const res = await bridge.request('pet.subscribe', { rev: rev.value }, SUBSCRIBE_TIMEOUT_MS)
    if (stopped) return
    const { ok, data, error } = unwrap(res)
    if (!ok) {
      console.warn('[pet] 订阅失败，' + RETRY_BACKOFF_MS + 'ms 后重试：' + error)
      await delay(RETRY_BACKOFF_MS)
      continue
    }
    const nextRev = num(data?.rev, rev.value)
    const changed = nextRev !== rev.value
    rev.value = nextRev
    const hasState = isRecord(data) && data.state !== undefined
    // changed=false 且首帧已渲染过 ⇒ 什么都不做（只重订阅）；首帧失败过时仍要接住这一份状态
    if (hasState && (changed || state.value === null)) applyState(data?.state)
  }
}

// ---- 交互 ----
/**
 * 一次互动（喂食 / 洗澡 / 点击摸头）。
 *
 * **卡 4 明确移交的坑（本卡的核心接线）**：入口对三种"拒绝"返回的是 `{ ok:false, reason, ... }`
 * ——共享冷却 `cooling`、道具不足 `no-item`、点击冷却 `pet-cooling`。它们 `ok:false`
 * 但**不是错误**：都带一句用户可见的 `feedback.text`（tone='bad'）、状态一个字节都没改，
 * 而且点击冷却还要照播摸头动画（specs/pet-interaction R5）。
 * **只有 `unknown-kind` 才是错误路径**（D-9：不弹气泡、只记诊断）。
 *
 * 所以这里**不能**沿用 v1 的 `unwrap()`——它把所有 `data.ok === false` 一律当错误抛掉，
 * 会让"冷却中/没有道具"退化成一句通用报错。分流交给纯函数 `interactDispatch`
 * （app/lib/state.ts，`node --test` 真跑覆盖四种 reason 与本文件的接线）。
 */
async function interact(kind: InteractKind): Promise<void> {
  if (!bridge || stopped) return
  // 摸头：冷却内的点击也 MUST 播反馈动画（specs/pet-interaction R5）⇒ 不等回包就先播。
  // 卡 19：真实互动起的都是 `self=false` 的轮次（默认值）——它们**不会**被锁存折成 idle，
  // 因此"随机表演期间点互动"必然是"气泡与动画同为互动"，不会出现"气泡还在、动画已切"。
  if (kind === 'pet') startTransient('petted')
  const res = await bridge.request('pet.interact', { kind }, REQUEST_TIMEOUT_MS)
  if (stopped) return
  // 桥层失败（页面侧超时 / 窗体已关 / 回包为空）才是"请求没送到"：这时候说一句通用报错
  if (!res.ok) {
    showBubble(res.error || TEXT.genericError, 'bad', BUBBLE_MS, true)
    return
  }
  const data = isRecord(res.data) ? res.data : {}
  const reply = interactDispatch(data, kind)
  // 回包里带视图就落定（拒绝分支同样带：`rev++` 之后入口已经把新视图推来了，先吃掉这一份更跟手）
  if (reply.accepted && kind !== 'pet') startTransient(KIND_TO_STATUS[kind])
  if (data.state !== undefined) applyState(data.state)
  // `unknown-kind`（含旧载荷的 play/summon/hide）：错误路径 —— 不弹气泡，只留一条诊断日志
  // （入口自己已把"未知互动: xxx"写进设置页的诊断位，D-9）。
  if (reply.path === 'error') {
    console.warn('[pet] 互动未被受理：' + reply.text)
    return
  }
  showBubble(reply.text, reply.tone, BUBBLE_MS, true)
}

function onPanelInteract(kind: 'feed' | 'bathe'): void {
  void interact(kind)
}

function onSpriteClick(): void {
  // 拖动松手时浏览器仍会补发一次 click：真拖过了就不当"摸头"
  // （design D-13"拖动期间不弹气泡"；否则每次换位都会冒一句摸头反馈）
  if (dragMoved) {
    dragMoved = false
    return
  }
  void interact('pet')
}

function onSpriteKeydown(event: KeyboardEvent): void {
  // design UX：精灵上 空格/回车 = 摸头（等价于点击）
  if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter') {
    event.preventDefault()
    void interact('pet')
    return
  }
  if (event.key === 'Tab' && !event.shiftKey && !panelOpen.value) {
    // Esc 关掉面板后焦点仍在精灵上；此时 Tab 必须能重新进面板，
    // 否则 design 承诺的 Tab 顺序（精灵 → 喂食 → 洗澡 → 关闭面板）在键盘路径上断在这里
    event.preventDefault()
    openPanelByFocus()
  }
}

function onSpriteFocus(): void {
  if (suppressFocusOpen) return
  // 只有键盘导致的聚焦才展开面板：鼠标点精灵时已经有悬停这条路径，再抢焦点会打乱鼠标操作
  if (!lastInputWasKey) return
  openPanelByFocus()
}

// ---- 面板开合与焦点归还 ----
function openPanelByFocus(): void {
  focusOpened.value = true
  needLeaveBeforeReopen = false
}

/**
 * 关面板（所有关闭路径的公共出口）。
 * `dismiss` = 用户明确关掉（Esc / 关闭按钮）：此时若指针还停在命中区，就要求它先离开一次
 * 再允许悬停重新展开，否则面板会在关掉的下一个 mousemove 立刻弹回来，Esc 等于没按。
 * 窗体失焦走的是同一条路但不带 dismiss——那不是用户的意思，不该留下"要先离开"的门槛。
 */
function closePanel(dismiss = false): void {
  const wasOpen = panelOpen.value
  if (dismiss && wasOpen && hasPointer && pointerInside(lastPointerX, lastPointerY)) {
    needLeaveBeforeReopen = true
  }
  focusOpened.value = false
  hovered.value = false
  boxesCache = null
}

function onPanelClose(): void {
  closePanel(true)
}

function onEscapeClose(): void {
  closePanel(true)
}

/**
 * 焦点归还精灵（design UX 节："面板关闭时焦点归还精灵"）。
 * 只在焦点确实属于本页时归还，别去抢别的窗口的焦点；`suppressFocusOpen` 挡住
 * "归还焦点 → 触发 focus → 又开面板"的回环。
 * 卡 17（Q15=B）：精灵是页面里**唯一**的可交互主体（没有"只画小按钮"的中间态）⇒ 归还目标恒为精灵。
 */
function restoreFocusToSprite(): void {
  const active = document.activeElement
  const focusWasOurs = !!active && (active === document.body || !!rootEl.value?.contains(active))
  if (!focusWasOurs) return
  suppressFocusOpen = true
  spriteEl.value?.focus({ preventScroll: true })
  setTimer(() => {
    suppressFocusOpen = false
  }, 0)
}

// ---- 命中测试与穿透上报 ----
function boxOf(el: Element, extraBottom = 0): Box {
  const r = el.getBoundingClientRect()
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom + extraBottom }
}

/**
 * 命中矩形集合（design D-2 的命中测试输入）：精灵（+ 面板展开时的面板矩形）。
 * 卡 17（Q15=B）：卡 15 的"只剩一个小按钮"分支已随该功能移除，这里回到唯一的一条路径。
 */
function hitBoxes(): Box[] {
  const now = Date.now()
  if (boxesCache && boxesCache.open === panelOpen.value && now - boxesCache.at < HIT_RECT_TTL_MS) {
    return boxesCache.boxes
  }
  const boxes: Box[] = []
  if (spriteEl.value) boxes.push(boxOf(spriteEl.value))
  if (panelOpen.value && panelSlotEl.value) {
    const slot = panelSlotEl.value
    const box = boxOf(slot, PANEL_GAP + 2)
    // 把面板矩形向下补掉与精灵之间的 6px 缝：否则指针穿过缝隙的瞬间会判定为"离开"，
    // 面板闪一下又关掉、穿透也跟着抖
    if (box.right > box.left && box.bottom > box.top) boxes.push(box)
  }
  boxesCache = { boxes, at: now, open: panelOpen.value }
  return boxes
}

function pointerInside(x: number, y: number): boolean {
  for (const box of hitBoxes()) {
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return true
  }
  return false
}

/**
 * 上报命中（design D-2）。去抖：**只在结果变化时发** `pet.hit`，不是每个 mousemove 都发——
 * 每次上报都要走 iframe → 主进程 → 主窗口 → 入口一整圈，跟着鼠标刷屏会把桥占满。
 * 上报值取"指针命中"与"面板可见"的**并集**（design UX 节）：键盘把面板打开时也要关掉穿透，
 * 否则键盘用户按下"喂食"的那一刻窗体还在穿透，点击会落到桌面上。
 */
function syncInside(): void {
  // 拖动期间**恒为命中**：窗体跟着指针移动时 clientX/Y 会有几像素抖动，若因此上报 inside:false，
  // 入口会恢复鼠标穿透 ⇒ 后续 pointermove 全部丢给桌面，拖动"脱手"。
  // design D-13 已明确"拖动中指针必然在窗体内 ⇒ 穿透已关"，这里把这条不变量写死。
  const inside =
    dragging.value || panelOpen.value || (hasPointer ? pointerInside(lastPointerX, lastPointerY) : false)
  if (inside === lastInside) return
  lastInside = inside
  void bridge?.request('pet.hit', { inside }, REQUEST_TIMEOUT_MS)
}

watch(panelOpen, (open) => {
  // 面板是 v-if 挂载的：先清一次缓存，DOM 更新后再清一次，否则量到的还是空槽位
  boxesCache = null
  void nextTick(() => {
    boxesCache = null
  })
  // 面板因键盘焦点展开时也要关掉穿透（design UX：取"命中或面板可见"的并集）
  syncInside()
  // 任何一条关闭路径（Esc / 关闭按钮 / 指针移出 / 窗体失焦）都要把焦点归还精灵
  if (!open) restoreFocusToSprite()
})

function onPointerMove(event: PointerEvent): void {
  lastInputWasKey = false
  lastPointerX = event.clientX
  lastPointerY = event.clientY
  hasPointer = true
  const hit = pointerInside(lastPointerX, lastPointerY)
  if (!hit) needLeaveBeforeReopen = false
  if (hit) {
    // 指针接管：键盘展开的面板交回给悬停逻辑，避免鼠标移开后面板还赖着不穿透
    focusOpened.value = false
  }
  const next = hit && !needLeaveBeforeReopen
  if (next !== hovered.value) {
    hovered.value = next
    boxesCache = null
  }
  syncInside()
}

function onPointerDown(): void {
  lastInputWasKey = false
}

// ---- 拖动换位（design D-13：页面只发**屏幕像素增量**，绝对坐标累加与钳位归入口/宿主） ----
/**
 * 增量取 `screenX/Y` 的差，**不用** `movementX/Y`（任务卡要求二选一并写明理由）：
 * 1. 窗体自己就在跟着指针移动，`clientX/Y` 会被窗体位移污染（窗体挪了 10px、指针没动，clientX 也变），
 *    只有**屏幕坐标**的差才等于窗体该移动的量；
 * 2. `movementX/Y` 只在鼠标指针上有可靠语义：触摸/笔的 PointerEvent 上普遍是 0
 *    （本窗体是透明覆盖层 + `acceptFirstMouse`，触屏一样会去拖），而 `screenX/Y` 对任何指针类型都有值；
 * 3. `movementX/Y` 在指针捕获重定向与合成事件下可能缺失，`screenX/Y` 是 PointerEvent 的基础字段。
 */
function onSpritePointerDown(event: PointerEvent): void {
  if (event.button !== DRAG_BUTTON) return // 只响应左键（右键留给桌面菜单，中键无拖动语义）
  lastInputWasKey = false
  dragging.value = true
  dragMoved = false
  dragPointerId = event.pointerId
  dragLastScreenX = event.screenX
  dragLastScreenY = event.screenY
  dragPendingX = 0
  dragPendingY = 0
  // 捕获指针：窗体跟着指针跑时，浏览器仍把 move/up 派发给精灵；指针甩出 220×460 的窗体也不丢事件
  try {
    spriteEl.value?.setPointerCapture(event.pointerId)
  } catch {
    // 捕获失败（指针已被别处捕获等）不影响拖动本身，只是快速甩动时可能少收几帧增量
  }
  // 入口据此记 dragging=true：抑制随机表演触发、不弹气泡（D-13 互斥）
  void bridge?.request('pet.drag', { phase: 'start' }, REQUEST_TIMEOUT_MS)
  syncInside() // 拖动一开始就锁"命中"，别让抖动出的 inside:false 把穿透打开（见 syncInside 注释）
}

function onSpritePointerMove(event: PointerEvent): void {
  if (!dragging.value || event.pointerId !== dragPointerId) return
  const dx = event.screenX - dragLastScreenX
  const dy = event.screenY - dragLastScreenY
  dragLastScreenX = event.screenX
  dragLastScreenY = event.screenY
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return
  dragPendingX += dx
  dragPendingY += dy
  if (
    Math.abs(dragPendingX) >= DRAG_MOVE_THRESHOLD_PX ||
    Math.abs(dragPendingY) >= DRAG_MOVE_THRESHOLD_PX
  ) {
    dragMoved = true // 真的在拖 ⇒ 松手时那次 click 不算"摸头"
  }
  // rAF 合并（design D-13"按帧合并"）：高刷鼠标一帧能派发好几次 pointermove，
  // 逐条发会把消息桥刷满、入口的 setPosition 队列堆积；一帧只发一条累计增量
  if (!dragRafId) dragRafId = requestAnimationFrame(flushDragMove)
}

/** 把累计的增量发出去（rAF 回调与松手前的收尾共用） */
function flushDragMove(): void {
  dragRafId = 0
  const dx = dragPendingX
  const dy = dragPendingY
  if (dx === 0 && dy === 0) return
  dragPendingX = 0
  dragPendingY = 0
  void bridge?.request('pet.drag', { phase: 'move', dx, dy }, REQUEST_TIMEOUT_MS)
}

/**
 * 收拖动会话（pointerup / pointercancel / lostpointercapture / 窗体失焦 / 页面卸载共用，幂等）。
 * 顺序要紧：先把没发出去的最后一段增量补发，再发 `end`——两条请求经同一座桥按 FIFO 到达入口，
 * 入口侧又有串行队列，所以"最后一段位移"不会被 `end` 的强制落盘漏掉。
 */
function endDrag(): void {
  if (!dragging.value) return
  if (dragRafId) {
    cancelAnimationFrame(dragRafId)
    dragRafId = 0
  }
  flushDragMove()
  dragging.value = false
  dragPointerId = -1
  // 入口在 end 时：dragging=false + **强制落盘** position（绕过写盘节流）+ 重排 trot（D-13/D-14）
  void bridge?.request('pet.drag', { phase: 'end' }, REQUEST_TIMEOUT_MS)
  // `dragging` 翻回 false ⇒ panelOpen 重新按"指针是否仍在精灵上"计算（卡 17 / D-2）：
  // 拖完指针还停着就照常弹面板，指针已离开就不弹——不需要任何补偿逻辑。
  syncInside() // 拖动期间锁的"命中"要按真实几何重算一次
}

function onSpritePointerUp(event: PointerEvent): void {
  if (event.pointerId !== dragPointerId) return
  endDrag()
}

function onPointerGone(): void {
  hasPointer = false
  hovered.value = false
  needLeaveBeforeReopen = false
  boxesCache = null
  syncInside()
}

function onPointerOut(event: PointerEvent): void {
  // relatedTarget 为空 = 指针离开了整个文档（pointerleave 在穿透转发下不一定派发，这里兜一层）
  if (!event.relatedTarget) onPointerGone()
}

function onDocumentKeydown(event: KeyboardEvent): void {
  lastInputWasKey = true
  if (event.key === 'Escape' && panelOpen.value) {
    // design UX：Esc 只关面板，**不关窗体**（关窗体只有设置页 toggle 一条路）
    event.preventDefault()
    onEscapeClose()
  }
}

function onWindowBlur(): void {
  // 窗体失焦（用户去别的窗口了）：收掉面板与命中态，把穿透还给桌面
  endDrag() // 拖动中失焦（Alt-Tab 等）⇒ 收会话，否则 syncInside 会被永久钉在"命中"上、穿透回不来
  hasPointer = false
  hovered.value = false
  closePanel()
}

function invalidateRects(): void {
  boxesCache = null
}

/**
 * 帧时钟该不该跑：**页面不可见**（既有优化）成立就停，否则恢复。
 * 用 pause/resume 而不是 stop：`stop()` 会把 FrameClock 置为 `active=false`，此后 resume 不再生效，
 * 而"页面被切走再切回来"必须能把动画跑回来。
 * 卡 17（Q15=B）：原来还有一条"只画一个小按钮的中间态 ⇒ 停帧"的条件，随该功能一并移除。
 */
function syncClock(): void {
  if (!clock) return
  if (document.visibilityState === 'hidden') clock.pause()
  else clock.resume()
}

function onVisibilityChange(): void {
  // 页面不可见就停帧循环省 CPU，可见时从当前帧继续（不补放"欠"的帧）
  syncClock()
}

function onMotionChange(event: MediaQueryListEvent): void {
  reducedMotion.value = event.matches
}

// ---- 生命周期 ----
function installListeners(): void {
  document.addEventListener('pointermove', onPointerMove, { passive: true })
  document.addEventListener('pointerdown', onPointerDown, { passive: true })
  document.addEventListener('pointerleave', onPointerGone)
  document.addEventListener('pointerout', onPointerOut)
  document.addEventListener('keydown', onDocumentKeydown)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('resize', invalidateRects)
  // 窗体被销毁走的是文档卸载路径（子窗口没有 api 对象，生命周期由窗体本身决定，
  // docs/extension-api/api-reference.md:27）⇒ 这里必须自己把帧循环与定时器停掉
  window.addEventListener('pagehide', teardown)
  window.addEventListener('beforeunload', teardown)
}

function removeListeners(): void {
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('pointerleave', onPointerGone)
  document.removeEventListener('pointerout', onPointerOut)
  document.removeEventListener('keydown', onDocumentKeydown)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('resize', invalidateRects)
  window.removeEventListener('pagehide', teardown)
  window.removeEventListener('beforeunload', teardown)
}

/** 销毁即停帧循环（specs/pet-sprites）：cancelAnimationFrame + 清全部定时器 + 拆桥，幂等 */
function teardown(): void {
  if (tornDown) return
  tornDown = true
  stopped = true
  // 拖动的 rAF 合并帧也要取消（它是 requestAnimationFrame，不在 timers 集合里）
  if (dragRafId) {
    cancelAnimationFrame(dragRafId)
    dragRafId = 0
  }
  dragging.value = false // 页面卸载 ⇒ 拖动会话作废（入口侧由 cleanup 复位，不会再收到 end）
  clock?.stop()
  clock = null
  removeListeners()
  for (const id of timers) window.clearTimeout(id)
  timers.clear()
  bubbleTimer = 0
  transientTimer = 0
  transientIsSelf = false
  burstWatchdog = 0
  burstLatched.value = false
  if (motionQuery) motionQuery.removeEventListener('change', onMotionChange)
  motionQuery = null
  bridge?.dispose()
  bridge = null
}

onBeforeUnmount(teardown)

onMounted(async () => {
  bridge = createBridge(readAppId())
  installListeners()
  if (typeof window.matchMedia === 'function') {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = motionQuery.matches
    motionQuery.addEventListener('change', onMotionChange)
  }

  clock = new FrameClock({ onFrame, onCycleEnd })
  clock.start()
  // 页面不可见就立刻停（可见性变化由 onVisibilityChange → syncClock 统一处理）
  syncClock()

  // 元数据的格子尺寸可能要用图集实际像素推导，所以并行取、等两者都落定再归一化
  const metaPromise = fetchMetaJson(META_URL)
  const img = await loadImageElement(SHEET_URL)
  if (stopped) return
  if (img) {
    sheetOk.value = true
  } else {
    sheetOk.value = false
    console.warn('[pet] 图集加载失败，改显示占位（design D-9）：' + SHEET_URL)
  }
  meta.value = normalizeMeta(await metaPromise, img)
  assetSettled.value = true
  if (stopped) return
  console.log(
    '[pet] 图集就绪：' +
      meta.value.cellW +
      '×' +
      meta.value.cellH +
      '，' +
      meta.value.frames.length +
      ' 行，帧数 [' +
      meta.value.frames.join(',') +
      ']'
  )

  await fetchInitial()
  if (stopped) return
  void subscribeLoop()
  // 启动即上报一次"未命中"：页面可能是重载进来的，而入口的穿透开关还停在上一次的状态；
  // 之后只在结果变化时才发（见 syncInside 的去抖）
  void bridge.request('pet.hit', { inside: false }, REQUEST_TIMEOUT_MS)
})
</script>

<template>
  <div ref="rootEl" class="stage">
    <!--
      精灵排在 DOM 最前 ⇒ Tab 第一站（design UX 节的 Tab 顺序）。
      role=button + tabindex=0 + aria-label：div 本身不可聚焦、读屏也读不出"能点"。
      卡 15：另挂四个指针事件做拖动换位（design D-13）——按下（左键）起会话、移动发增量、
      抬起/取消/丢失捕获收会话。指针捕获后这四个事件都落在精灵上，甩出窗体也不丢。
      卡 17（Q15=B）：包在外面的 `v-if/v-else`（"只画一个小按钮"的中间态）已整条移除——
      宠物窗体要么正常渲染精灵与面板，要么被设置页 toggle 销毁，不存在第三种形态。
    -->
    <div
      ref="spriteEl"
      class="sprite"
      :style="spriteStyle"
      tabindex="0"
      role="button"
      :aria-label="TEXT.spriteAria"
      @click="onSpriteClick"
      @keydown="onSpriteKeydown"
      @focus="onSpriteFocus"
      @pointerdown="onSpritePointerDown"
      @pointermove="onSpritePointerMove"
      @pointerup="onSpritePointerUp"
      @pointercancel="onSpritePointerUp"
      @lostpointercapture="endDrag"
    >
      <!-- design D-9：图集缺文件/解码失败 ⇒ 灰色圆 + 文案，交互按钮仍可用，绝不白屏 -->
      <div v-if="assetSettled && !sheetOk" class="fallback">
        <span class="fallback-dot"></span>
        <span class="fallback-text">{{ TEXT.spriteFailed }}</span>
      </div>
    </div>

    <!-- 精灵上方 240px 预留区（design D-1）：气泡在上、面板在下，未悬停时整块不绘制像素 -->
    <div class="upper" :style="{ bottom: upperBottom + 'px' }">
      <Transition name="bubble-fade">
        <PetBubble v-if="bubble" :text="bubble.text" :tone="bubble.tone" />
      </Transition>
      <div ref="panelSlotEl" class="panel-slot">
        <Transition name="panel-fade">
          <PetPanel
            v-if="panelOpen"
            :state="display"
            :syncing="syncing"
            @interact="onPanelInteract"
            @close="onPanelClose"
          />
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

/* 精灵区贴窗体底部居中（design D-1）；宽高由 pet.json 的几何内联给出，这里只定位 */
.sprite {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  background-repeat: no-repeat;
  cursor: pointer;
  /*
   * 拖动换位（design D-13）：关掉浏览器默认的触摸手势，否则触屏上第一下移动就被解释成
   * 平移/滚动并触发 pointercancel，pointermove 断流、窗体拖不动。
   * 窗体本身 `overflow:hidden` 无处可滚，关掉没有任何副作用。
   */
  touch-action: none;
}

/*
 * 精灵的键盘焦点环：**白色 2px**（design `## UI 视觉规范` 的"焦点环 = 白色 2px"，与面板两枚图标、
 * 关闭按钮逐字同一份口径）。v1 这里是一圈青色（`rgba(56,189,248,.85)`）——那是**自造色值**，
 * 与本 change 的硬约束 1（CSS 里只有 `var(--…)`；白色只出现在图标描边与焦点环）冲突，已改白。
 * `outline` 被替代而不是被抹掉（design UX 节：焦点必须可见）。
 */
.sprite:focus-visible {
  outline: none;
  border-radius: 16px;
  box-shadow: 0 0 0 2px #ffffff;
}

/*
 * 卡 17（Q15=B）：原先占位在窗体右下角的那颗 96×36 按钮（点它把宠物放回来的中间形态）
 * 连同样式已整条删除——窗体要么正常渲染精灵与面板，要么被设置页 toggle 销毁。
 */

.upper {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  /* 预留区本身不吃指针：空白处必须让点击穿透到桌面（specs/pet-window 的像素判据同源要求），
     面板自己在组件里把 pointer-events 打开 */
  pointer-events: none;
}

.panel-slot {
  display: flex;
  justify-content: center;
}

.fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/*
 * 图集加载失败的占位（design D-9）：只画一个灰圆 + 一行次要色文字，**绝不白屏**。
 * 两者都用宿主 token（`--hover-bg` / `--fg-dim` / `--font-size-sm`）——v1 这里是两组 rgba
 * 自造色值 + 一层深色 text-shadow，违反"零自造色值"（design 硬约束 1），已换成 token。
 */
.fallback-dot {
  width: 96px;
  height: 96px;
  border-radius: 999px;
  background: var(--hover-bg);
}

.fallback-text {
  color: var(--fg-dim);
  font-size: var(--font-size-sm);
}

/* design 动效节：面板淡入 120ms、气泡淡出；减少动效偏好下不做过渡 */
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 120ms ease;
}

/*
 * 卡 18（Q17）核对后的加固：过渡只作用在**视觉属性**上，且淡出的这 120ms 里面板**不吃指针**——
 * 开合判定与命中矩形本来就已经同步翻转（`panelOpen` 是纯 computed、`hitBoxes()` 只看它），
 * 这一条防的是"点到正在消失的面板"：DOM 节点在 leave 期间仍在文档里，若不关指针，
 * 那 120ms 内的点击还会打到幽灵按钮上。
 */
.panel-fade-leave-active {
  pointer-events: none;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
}

.bubble-fade-enter-active,
.bubble-fade-leave-active {
  transition: opacity 200ms ease;
}

.bubble-fade-enter-from,
.bubble-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .panel-fade-enter-active,
  .panel-fade-leave-active,
  .bubble-fade-enter-active,
  .bubble-fade-leave-active {
    transition: none;
  }
}
</style>

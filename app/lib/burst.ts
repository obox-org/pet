/**
 * 页面侧"入口自发表演（burst）播完即回落呼吸 idle"的**纯判定与时限**（卡 19 · 热修 D-1）。
 *
 * 为什么把这两件事从 `App.vue` 里搬出来：D-1 的根因是"随机表演与真实互动**共用入口的
 * `transient` 字段**、状态字符串完全相同"，唯一的解法是入口在视图里新增**来源标记**
 * `anim.self`；而"什么时候把入口报的状态折成 idle""多久之内必须折"正是这条修复的**核心决策**。
 * 本模块零 import、零 DOM、零定时器 ⇒ 能被 `node --test` 直接跑。页面（app/**）没有
 * jsdom / 组件测试环境（见 test/actions-ui.test.js 的文件头说明），D-1 的核心断言
 * （七项随机抽到**逐项**都在"一轮 + slack"内回落、四项真实互动一律不被折掉）
 * 只有落在这里才是**真跑**而不是源码正则。
 *
 * `App.vue` 只负责三件事：记下这一轮的来源（`transientIsSelf`）、按本模块给的时限挂兜底定时器、
 * 用本模块给的判定算 `entryStatus`/`entryRow`。
 */

/** 瞬时互动的兜底回落余量（ms）：页面不可见时 rAF 停摆、`onCycleEnd` 不会来（既有口径，勿改） */
export const TRANSIENT_SLACK_MS = 500

/**
 * "计划还没算出来"时给入口自发表演用的**兜底轮长**（ms）。
 * 取 2000 = 全部表演轨里最长的一轮（`run-left`/`run-right` 8 帧 × 225ms = 1800ms）+ 余量：
 * 兜底值**必须不小于**真实轮长，否则定时器会提前把动画掐掉（宁可晚一点回落）。
 */
export const BURST_FALLBACK_MS = 2000

/** 入口视图 `anim` 里与"折 idle"判定有关的三项（其余字段只参与渲染） */
export interface EntryAnim {
  /** 图集行号 */
  row: number
  /** 机器可读英文状态 key */
  status: string
  /** 当前 transient 是否来自入口**自发**的随机表演（入口 `buildView` 给；无 transient / 拖动中为 false） */
  self: boolean
}

/** 送进 `decideAnimation` 的入口状态与行号 */
export interface EntryTrack {
  status: string
  row: number
}

/**
 * 自发表演一轮的**页面侧兜底回落时限** = 该轨一轮真实时长 + `TRANSIENT_SLACK_MS`。
 *
 * **为什么不能等入口的下一次推送**（D-1 的停留就是这么来的）：入口的 `transient` 到期
 * **不产生** rev++、也不触发任何推送——随机表演只在自己开始那一轮时写一次状态，
 * 页面最长要等到下一个 15s 结算 tick 才会收到"已经回 idle"的视图。实机复验的
 * `eating` 停留 5.0 / 10.0 / 15.0s、连续多轮同轨连成一片 24.98s 就是这个现象。
 * 收敛要求因此写死在页面侧：该轨一轮时长 + 既有 slack 之内必须回落。
 *
 * `roundMs` 为 null / 非法（计划还没算出来、或算的是别的轨）时用 `BURST_FALLBACK_MS` 兜底。
 */
export function burstFallbackMs(roundMs: number | null | undefined): number {
  const total =
    typeof roundMs === 'number' && Number.isFinite(roundMs) && roundMs > 0 ? roundMs : BURST_FALLBACK_MS
  return total + TRANSIENT_SLACK_MS
}

/**
 * 入口视图的 `anim` + 本地锁存位 ⇒ 送进 `decideAnimation` 的 `(status, row)`。
 *
 * 折 idle 的判据是 **`anim.self === true` 且本地已锁存**（= 这一轮自发表演在页面侧已经播完），
 * 而**不是任何状态字符串的集合**：随机表演的随机集里有 `eating`/`bathing`/`petted`/`playing`
 * 四项与真实互动**同名同轨**——随机抽到的 `eating` 与用户点喂食在入口都是
 * `transient = { status: 'eating' }`，页面只拿到这个字符串 ⇒ 任何"状态 ∈ 某集合"的判据都必然
 * 把"该回呼吸"和"用户刚点的动作"混为一谈（卡 18 的 `isSelfBurst` 只能认出
 * `trot`/`run-left`/`run-right` 三条同构轨，对同名四项无能为力，这正是 D-1 的根因；
 * 该判据与 `SELF_BURST_SET` 已随本次热修整条删除）。
 *
 * 真实互动（`self === false`）**一律不折**：那是用户刚下的指令，必须播满完整一轮；
 * 即使本地锁存位因为上一轮自发表演还是脏的 `true`，也不许动它（负向自检：
 * "真实互动期间 anim.self = false ⇒ 页面不得折 idle"）。
 *
 * `row` 与 `status` **必须一起**降级：只降 status 的话，`decideAnimation` 里
 * "入口没给 status 就按 row 渲染"的兜底分支会拿着 row 2/1/7 继续播侧跑/原地跑轨
 * （app/lib/anim.ts 的 `planForRow` 路径）。
 */
export function entryTrackOf(anim: EntryAnim, latched: boolean): EntryTrack {
  if (anim.self === true && latched) return { status: 'idle', row: -1 }
  return { status: anim.status, row: anim.row }
}

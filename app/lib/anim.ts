/**
 * 状态 → 动画轨的映射、优先级与帧时长（design D-4 + specs/pet-sprites）。
 *
 * 这一层只负责"决定播哪一轨、每帧多久"，不碰 DOM：换轨/换速度的判定都在这里算完，
 * 帧循环（frameClock.ts）拿到的就是一张定长的 durations 表。
 */

import { FALLBACK_FRAME_MS, clampRow, frameCountOf, frameDuration } from './sprites'
import type { SpriteMeta } from './sprites'

/**
 * 扩展侧的十二个状态（卡 15 增补 `trot`；卡 18 / Q16 增补 `run-left` / `run-right`：
 * 上游那两条侧跑轨终于被引用，但**只原地播帧、不位移**——design Non-Goals 不变）
 */
export type PetStatus =
  | 'idle'
  | 'eating'
  | 'bathing'
  | 'playing'
  | 'petted'
  | 'hungry'
  | 'dirty'
  | 'sad'
  | 'sleep'
  | 'trot'
  | 'run-left'
  | 'run-right'

/** design D-7：三属性低于 30 就进入对应的"该照顾了"状态 */
export const VITAL_LOW = 30

/** design `## UI 视觉规范`·动效：`prefers-reduced-motion: reduce` 时帧动画统一降到 400ms/帧 */
export const REDUCED_FRAME_MS = 400

/**
 * 入口随机表演的周期（design D-14 / Q16：**每 10 秒**一轮）。
 *
 * 单一来源在入口 `lib/constants.js` 的 `RANDOM_PERF_EVERY_SEC`（排程也在入口）；页面这份是**镜像**，
 * 只服务一件事：给"入口自发表演的本地锁存"加一个**看门狗上限**（见 App.vue 的 armBurstWatchdog）。
 * 入口每 10 秒必推一次新 rev（随机表演的排程在入口），所以"锁存后整整一个周期都没等到新状态"
 * 只可能是推送断了（打盹不再表演 / 窗体停用 / 桥断）——那时继续锁存只会把画面钉住。
 */
export const RANDOM_PERF_EVERY_SEC = 10

/** 周期换算成毫秒（看门狗用；`10 × 1000 = 10000ms`） */
export const RANDOM_PERF_PERIOD_MS = RANDOM_PERF_EVERY_SEC * 1000

/**
 * D-4 状态表：状态 → 上游轨（行号 / 轨名 / 速度倍率）。
 * 行号与轨名都写出来是为了互为兜底：`pet.json` 的 `tracks` 键序若与规范不一致，
 * 仍能按轨名取到 durations；轨名缺失时又能按行号回推。
 * `trot`（卡 15 / D-14）与 `playing` 同为 `running`(7) 轨、`run-left`/`run-right`（卡 18 / Q16）
 * 分别对应上游 `running-left`(2) / `running-right`(1) 轨：前者靠"有没有气泡""是不是用户点的"区分，
 * 后两条就是侧向跑，画面与 design 的语义就近映射一致（行号/轨名与入口 `lib/mapping.js` 同值）。
 */
export const STATUS_TRACK: Record<PetStatus, { row: number; track: string; speed: number }> = {
  idle: { row: 0, track: 'idle', speed: 1 },
  eating: { row: 4, track: 'jumping', speed: 1 },
  bathing: { row: 3, track: 'waving', speed: 1 },
  playing: { row: 7, track: 'running', speed: 1 },
  petted: { row: 3, track: 'waving', speed: 1 },
  hungry: { row: 6, track: 'waiting', speed: 1 },
  dirty: { row: 8, track: 'review', speed: 1 },
  sad: { row: 5, track: 'failed', speed: 1 },
  // D-4：`sleep` = `idle` 行、逐帧时长 ×1.5（上游没有 sleep 轨，"Zzz" 由气泡/面板文字表达）
  sleep: { row: 0, track: 'idle', speed: 1.5 },
  trot: { row: 7, track: 'running', speed: 1 },
  'run-left': { row: 2, track: 'running-left', speed: 1 },
  'run-right': { row: 1, track: 'running-right', speed: 1 }
}

/**
 * D-4 优先级：瞬时互动 > hungry > dirty > sad > sleep > 表演轨（trot / run-left / run-right）> idle。
 * 与入口 `lib/mapping.js` 的 STATUS_PRIORITY 逐字同值（卡 18 把两条侧跑轨与 trot 并列在 2）。
 */
export const STATUS_PRIORITY: Record<PetStatus, number> = {
  eating: 9,
  bathing: 9,
  playing: 9,
  petted: 9,
  hungry: 6,
  dirty: 5,
  sad: 4,
  sleep: 3,
  trot: 2,
  'run-left': 2,
  'run-right': 2,
  idle: 1
}

/**
 * "播完一轮才回落"的集合（specs/pet-sprites）。
 *
 * 与入口 `lib/mapping.js` 的 `TRANSIENT_STATUSES` **有意不同**：入口那份决定"谁是当前权威状态"
 * （真实互动与入口自发的表演都写进同一个 transient 字段）；页面这份只决定
 * "本地播一轮后自行回落"。
 *
 * 卡 19（热修 D-1）之前，这里还靠一个 `SELF_BURST_SET`（`trot`/`run-left`/`run-right`）
 * 来区分"入口自发的 burst"与"用户刚点的动作"——那条判据**认不出**同名同轨的四项
 * （随机抽到的 `eating` 与用户点喂食是完全相同的字符串），是 D-1 的根因，已整条删除。
 * 现在"这一轮是谁写的"由入口的视图标记 `anim.self` 承担（页面侧判定见 app/lib/burst.ts），
 * 本集合只回答"哪些状态需要页面自己收尾"。
 */
const TRANSIENT_SET: ReadonlySet<PetStatus> = new Set<PetStatus>([
  'eating',
  'bathing',
  'playing',
  'petted',
  'trot',
  'run-left',
  'run-right'
])

export function isTransient(status: PetStatus): boolean {
  return TRANSIENT_SET.has(status)
}

/** `pet.interact` 的 kind → 瞬时互动状态（卡 17 起 kind 只有这四种，每一种都对应一条动画轨） */
export const KIND_TO_STATUS: Record<'feed' | 'bathe' | 'play' | 'pet', PetStatus> = {
  feed: 'eating',
  bathe: 'bathing',
  play: 'playing',
  pet: 'petted'
}

const ALL_STATUSES: readonly PetStatus[] = [
  'idle',
  'eating',
  'bathing',
  'playing',
  'petted',
  'hungry',
  'dirty',
  'sad',
  'sleep',
  'trot',
  'run-left',
  'run-right'
]

/**
 * 机器可读状态 key 的守门员：只认表内十二个英文值，其它（含空串/数字/undefined）视为"没给"。
 * 卡 12（裁定 R14）后它的**主输入是 `anim.status`**（入口 `resolveStatus` 的英文 key，
 * 与 `STATUS_TRACK` 键单一来源一致）——sleep 与 idle 同 row 0，页面全靠它区分慢放与 Zzz 气泡；
 * 卡 15 起 `trot`、卡 18 起 `run-left`/`run-right` 也走这里；
 * 卡 19 起还是 `syncBurst` 的守门员：入口只有报 `anim.self === true` **且** status 是表内合法值时，
 * 页面才认这是一轮自发表演（畸形回包不许起一轮，更不许折 idle）。
 */
export function knownStatus(value: unknown): PetStatus | undefined {
  return typeof value === 'string' && (ALL_STATUSES as readonly string[]).includes(value)
    ? (value as PetStatus)
    : undefined
}

/**
 * 中文 label → 状态 key 的反查表（卡 12 兜底：**仅**当 `anim.status` 缺失/未知——老数据或
 * 畸形数据——时才用，正常路径一律走 `knownStatus(anim.status)`）。
 * 表项与入口 `lib/mapping.js` 的 `STATUS_LABEL` 十二项逐字一致；页面与入口是两套构建，
 * 无法共享模块，此表是任务卡明确许可的小型兜底，不是第二份权威映射。
 */
const LABEL_TO_STATUS: Readonly<Record<string, PetStatus>> = {
  待机: 'idle',
  打盹: 'sleep',
  喂食: 'eating',
  洗澡: 'bathing',
  玩耍: 'playing',
  摸头: 'petted',
  饥饿: 'hungry',
  脏: 'dirty',
  心情低: 'sad',
  原地小跑: 'trot',
  向左小跑: 'run-left',
  向右小跑: 'run-right'
}

/** 按 `anim.label`（中文状态名）反查状态 key；表外值（含空串/非字符串）视为"没给" */
export function statusFromLabel(value: unknown): PetStatus | undefined {
  return typeof value === 'string' && Object.hasOwn(LABEL_TO_STATUS, value)
    ? LABEL_TO_STATUS[value]
    : undefined
}

/** 按属性阈值自判：hungry > dirty > sad > idle（D-4 触发列） */
export function deriveFromVitals(vitals: { hunger: number; clean: number; mood: number }): PetStatus {
  if (vitals.hunger < VITAL_LOW) return 'hungry'
  if (vitals.clean < VITAL_LOW) return 'dirty'
  if (vitals.mood < VITAL_LOW) return 'sad'
  return 'idle'
}

export interface AnimPlan {
  status: PetStatus
  /** 图集行号（已钳制在声明的行数内） */
  row: number
  /** 取 durations 用的轨名（可能为空串 ⇒ 全部回退 250ms） */
  track: string
  /** 速度倍率（sleep = 1.5，其余 1） */
  speed: number
  /** 该行帧数（取模的模数，缺帧容错的关键） */
  count: number
  /** 逐帧时长，长度 === count（**不等间隔**，来自 `tracks[轨].durations`） */
  durations: number[]
  /** 一轮总时长（ms），用于瞬时互动的兜底回落 */
  total: number
}

/** 选轨名：优先 D-4 映射表里的名字（语义明确），其次 `pet.json` 的行序键名；两者都取不到就空串（回退 250ms） */
function pickTrack(meta: SpriteMeta, row: number, preferred?: string): string {
  const candidates = preferred ? [preferred, meta.rowTrackNames[row]] : [meta.rowTrackNames[row]]
  for (const name of candidates) {
    if (name && (meta.durations[name]?.length ?? 0) > 0) return name
  }
  for (const name of candidates) {
    if (name) return name
  }
  return ''
}

function buildPlan(
  meta: SpriteMeta,
  status: PetStatus,
  row: number,
  track: string,
  speed: number,
  reducedMotion: boolean
): AnimPlan {
  const count = frameCountOf(meta, row)
  const durations: number[] = []
  for (let i = 0; i < count; i++) {
    // 减少动效偏好下统一 400ms/帧（design 动效节），倍率仍然生效（sleep 会慢于 idle）
    const base = reducedMotion ? REDUCED_FRAME_MS : frameDuration(meta, track, i)
    const scaled = Math.round(base * speed)
    durations.push(Number.isFinite(scaled) && scaled > 0 ? scaled : FALLBACK_FRAME_MS)
  }
  return { status, row, track, speed, count, durations, total: durations.reduce((a, b) => a + b, 0) }
}

/**
 * 按状态出一张播放计划（行号越界会被钳到第 0 行）。
 * `rowOverride`（卡 12）：入口给定的行号——**status 只驱动语义（轨名/慢放速度/气泡），不驱动行号**。
 * 它是合法非负整数时以它渲染（正常数据与 D-4 映射表的 row 逐字一致，行为不变；
 * status 与 row 冲突的畸形数据以 row 为准、慢放等语义仍生效）；非法/缺省时回退映射表的 row。
 */
export function planForStatus(
  meta: SpriteMeta,
  status: PetStatus,
  reducedMotion: boolean,
  rowOverride?: unknown
): AnimPlan {
  const spec = STATUS_TRACK[status] ?? STATUS_TRACK.idle
  const override =
    typeof rowOverride === 'number' && Number.isInteger(rowOverride) && rowOverride >= 0
      ? rowOverride
      : undefined
  const row = clampRow(meta, override ?? spec.row)
  return buildPlan(meta, status, row, pickTrack(meta, row, spec.track), spec.speed, reducedMotion)
}

/**
 * 按入口直接给的**行号**出计划（`anim.label` 不是已知状态、但 `anim.row` 是合法行号时用）。
 * 速度倍率取 1：页面不知道入口为什么选这一行，不该再叠一层慢放。
 */
export function planForRow(meta: SpriteMeta, row: number, reducedMotion: boolean): AnimPlan {
  const safeRow = clampRow(meta, row)
  return buildPlan(meta, 'idle', safeRow, pickTrack(meta, safeRow), 1, reducedMotion)
}

export interface DecideInput {
  vitals: { hunger: number; clean: number; mood: number }
  /** 入口 `PetStateView.anim.status`（机器可读英文 key，卡 12/裁定 R14 契约；可能是任意值） */
  animStatus?: unknown
  /** 入口 `PetStateView.anim.label`（中文显示名；仅在 status 缺失/未知时反查兜底） */
  animLabel?: unknown
  /** 入口 `PetStateView.anim.row`（可能是任意值） */
  animRow?: unknown
  /** 页面本地的瞬时互动（点击/按钮触发，播完一轮才清空） */
  transient: PetStatus | null
  reducedMotion: boolean
}

/**
 * 定轨：优先级"瞬时互动 > hungry > dirty > sad > sleep > 表演轨（trot/run-left/run-right）> idle"
 * （D-4；卡 15 插入 trot，卡 18 把两条侧跑轨并列到同档）。
 *
 * 为什么页面还要再判一次属性阈值（入口已经给了 `anim`）：
 * 入口是权威，但界面不能因为一次异常回包就显示"吃饱了的待机"——属性已经 <30 时必须显示"该照顾了"的轨，
 * 这是 specs/pet-sprites 的优先级 requirement。所以取"入口判定"与"页面按阈值判定"里**优先级更高**的那个。
 * `sleep` 只能来自入口（页面不知道"连续 10 分钟无交互"这条权威计时）。
 *
 * 卡 12（裁定 R14）后"入口判定"的识别顺序：**优先读机器可读的 `anim.status`**
 * （十二个英文 key 之一才采用）；读不到再按中文 `anim.label` 反查兜底（老数据/畸形数据）；
 * 两者都不可用才落到 row 兜底。这样 `plan.status === 'sleep'` 才能真正到达
 * "帧时长 ×1.5 慢放 + 「打盹中（Zzz）」气泡"（App.vue maybeShowSleepHint）。
 *
 * 例外：`input.transient`（页面本地的瞬时动画）不参与这张优先级表——它由用户动作或入口自发的
 * 随机表演直接写入，优先级最高（卡 18：随机表演与真实互动共用入口的 transient 字段；
 * 页面这边则保证"播满一轮再回落"）。
 */
export function decideAnimation(meta: SpriteMeta, input: DecideInput): AnimPlan {
  if (input.transient) return planForStatus(meta, input.transient, input.reducedMotion)

  const fromState = knownStatus(input.animStatus) ?? statusFromLabel(input.animLabel)
  if (fromState) {
    const fromVitals = deriveFromVitals(input.vitals)
    const winner =
      STATUS_PRIORITY[fromState] >= STATUS_PRIORITY[fromVitals] ? fromState : fromVitals
    // 胜者是入口给的状态时，行号以入口 `anim.row` 为准（status 只驱动语义不驱动行号；
    // 正常数据两侧映射一致、行为不变，status 与 row 冲突的畸形数据以 row 渲染且慢放不丢）。
    // 胜者来自页面属性判定（入口回包自相矛盾）时，入口 row 与它不对应，回退页面映射表的行。
    return winner === fromState
      ? planForStatus(meta, winner, input.reducedMotion, input.animRow)
      : planForStatus(meta, winner, input.reducedMotion)
  }

  // `row` 为负（state.ts 用 -1 表示"入口没给行号"）时不走这一支，否则会把"没给"误当成第 0 行
  const row = typeof input.animRow === 'number' ? input.animRow : Number.NaN
  if (Number.isInteger(row) && row >= 0) return planForRow(meta, row, input.reducedMotion)

  return planForStatus(meta, deriveFromVitals(input.vitals), input.reducedMotion)
}

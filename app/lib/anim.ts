/**
 * 状态 → 动画轨的映射、优先级与帧时长（design D-2 + specs/pet-sprites）。
 *
 * 这一层只负责"决定播哪一轨、每帧多久"，不碰 DOM：换轨/换速度的判定都在这里算完，
 * 帧循环（frameClock.ts）拿到的就是一张定长的 durations 表。
 *
 * **v2（pet-v2-growth-favor）删掉了四条状态与唯一的一处慢放**（design D-10）：
 * `hungry`/`dirty`/`sad`（依赖三属性阈值）与 `sleep`（连续无交互的打盹）连同它们的
 * 状态映射、属性阈值判定（那套阈值常量与判定函数已整体删除）、`idle` 轨的 1.5 倍慢放一并撤销 ——
 * 三属性体系整体退役（specs/pet-vitals 的 4 条 REMOVED），宠物长时间无交互时保持正常待机与
 * 正常节拍（specs/pet-sprites R2）。于是 `STATUS_TRACK` 只剩 `idle` 与七条瞬时表演轨。
 */

import { FALLBACK_FRAME_MS, clampRow, frameCountOf, frameDuration } from './sprites'
import type { SpriteMeta } from './sprites'

/**
 * 扩展侧的八个状态（v1 的 `hungry`/`dirty`/`sad`/`sleep` 已删）：
 * `idle` + 七条瞬时轨。其中 `playing` / `trot` 同取 row7（Q8 已接受抽中率翻倍），
 * `run-left` / `run-right` 引用上游的两条侧跑轨但**只原地播帧、不位移**（design Non-Goals 不变）。
 */
export type PetStatus =
  | 'idle'
  | 'eating'
  | 'bathing'
  | 'playing'
  | 'petted'
  | 'trot'
  | 'run-left'
  | 'run-right'

/** design `## UI 视觉规范`·动效：`prefers-reduced-motion: reduce` 时帧动画统一降到 400ms/帧 */
export const REDUCED_FRAME_MS = 400

/**
 * 入口随机表演的周期（specs/pet-sprites R1：每 60 秒一轮；**v1.0.2 用户裁定**）。
 *
 * 单一来源在入口 `lib/constants.js` 的 `RANDOM_PERF_EVERY_SEC`（排程也在入口）；页面这份是**镜像**，
 * 只服务一件事：给"入口自发表演的本地锁存"加一个**看门狗上限**（见 App.vue 的 armBurstWatchdog）。
 * 入口每 60 秒必推一次新 rev（随机表演的排程在入口），所以"锁存后整整一个周期都没等到新状态"
 * 只可能是推送断了（窗体停用 / 桥断 / 页面不可见）——那时继续锁存只会把画面钉住。
 *
 * 两侧必须**逐值相等**（只改一侧就会让看门狗与排程脱节）：
 * `test/actions-ui.test.js` 有一条"两侧常量相等"的断言把入口值与本文件的镜像值钉在一起。
 */
export const RANDOM_PERF_EVERY_SEC = 60

/** 周期换算成毫秒（看门狗用；`60 × 1000 = 60000ms`） */
export const RANDOM_PERF_PERIOD_MS = RANDOM_PERF_EVERY_SEC * 1000

/**
 * D-2 状态表：状态 → 上游轨（行号 / 轨名 / 速度倍率）。
 * 行号与轨名都写出来是为了互为兜底：`pet.json` 的 `tracks` 键序若与规范不一致，
 * 仍能按轨名取到 durations；轨名缺失时又能按行号回推。
 *
 * **速度倍率 v2 起全部是 1**：v1 唯一的倍率是打盹的 1.5 倍慢放，随 design D-10 删除。
 * 保留乘法这一层是为了不破坏帧契约（`AnimPlan.total` 仍按乘完的逐帧时长求和），
 * 而不是留一个可用的"变慢"开关——**不要再加任何非 1 的倍率**：specs/pet-sprites R2 明令
 * "待机动画按原速"，变慢会让"长时间无交互仍在正常节奏地呼吸"这条判据失效。
 */
export const STATUS_TRACK: Record<PetStatus, { row: number; track: string; speed: number }> = {
  idle: { row: 0, track: 'idle', speed: 1 },
  eating: { row: 4, track: 'jumping', speed: 1 },
  bathing: { row: 3, track: 'waving', speed: 1 },
  playing: { row: 7, track: 'running', speed: 1 },
  petted: { row: 3, track: 'waving', speed: 1 },
  trot: { row: 7, track: 'running', speed: 1 },
  'run-left': { row: 2, track: 'running-left', speed: 1 },
  'run-right': { row: 1, track: 'running-right', speed: 1 }
}

/**
 * D-2 优先级：瞬时互动 > 表演轨（trot / run-left / run-right）> idle。
 *
 * v2 起表里**没有属性轨了**（hungry/dirty/sad/sleep 随三属性与打盹一并删除）。
 * 与入口 `lib/mapping.js` 的 STATUS_PRIORITY 逐字同值：页面拿它做"入口回包与本地判定谁赢"的仲裁。
 */
export const STATUS_PRIORITY: Record<PetStatus, number> = {
  eating: 9,
  bathing: 9,
  playing: 9,
  petted: 9,
  trot: 2,
  'run-left': 2,
  'run-right': 2,
  idle: 1
}

/**
 * "播完一轮才回落"的集合（specs/pet-sprites R3）。
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
 *
 * v2 起集合与入口的七条表演轨**完全相同**（属性轨没有了）：这七项都需要页面在
 * "一轮 + slack"内自行折回待机，不依赖入口的下一次推送。
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

/**
 * `pet.interact` 的 kind → 瞬时互动状态。
 * v2 的合法 kind 只有三种（入口 `lib/interact.js` 的 `KINDS`）：喂食 / 洗澡 / 点击摸头；
 * 旧载荷的 `play`/`summon`/`hide` 按未知互动拒绝，页面根本不会发出（面板只有两枚图标）。
 */
export const KIND_TO_STATUS: Record<'feed' | 'bathe' | 'pet', PetStatus> = {
  feed: 'eating',
  bathe: 'bathing',
  pet: 'petted'
}

const ALL_STATUSES: readonly PetStatus[] = [
  'idle',
  'eating',
  'bathing',
  'playing',
  'petted',
  'trot',
  'run-left',
  'run-right'
]

/**
 * 机器可读状态 key 的守门员：只认表内八个英文值，其它（含空串/数字/undefined）视为"没给"。
 * 它的**主输入是 `anim.status`**（入口 `resolveStatus` 的英文 key，与 `STATUS_TRACK` 键单一来源）；
 * 还是 `syncBurst` 的守门员：入口只有报 `anim.self === true` **且** status 是表内合法值时，
 * 页面才认这是一轮自发表演（畸形回包不许起一轮，更不许折 idle）。
 */
export function knownStatus(value: unknown): PetStatus | undefined {
  return typeof value === 'string' && (ALL_STATUSES as readonly string[]).includes(value)
    ? (value as PetStatus)
    : undefined
}

/**
 * 中文 label → 状态 key 的反查表（**仅**当 `anim.status` 缺失/未知——老数据或畸形数据——时才用，
 * 正常路径一律走 `knownStatus(anim.status)`）。
 * 表项与入口 `lib/mapping.js` 的 `STATUS_LABEL` 八项逐字一致；页面与入口是两套构建，
 * 无法共享模块，此表是任务卡明确许可的小型兜底，不是第二份权威映射。
 */
const LABEL_TO_STATUS: Readonly<Record<string, PetStatus>> = {
  待机: 'idle',
  喂食: 'eating',
  洗澡: 'bathing',
  玩耍: 'playing',
  摸头: 'petted',
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

export interface AnimPlan {
  status: PetStatus
  /** 图集行号（已钳制在声明的行数内） */
  row: number
  /** 取 durations 用的轨名（可能为空串 ⇒ 全部回退 250ms） */
  track: string
  /** 速度倍率（v2 起恒为 1；保留只为不破坏帧契约） */
  speed: number
  /** 该行帧数（取模的模数，缺帧容错的关键） */
  count: number
  /** 逐帧时长，长度 === count（**不等间隔**，来自 `tracks[轨].durations`） */
  durations: number[]
  /** 一轮总时长（ms），用于瞬时互动的兜底回落 */
  total: number
}

/** 选轨名：优先 D-2 映射表里的名字（语义明确），其次 `pet.json` 的行序键名；两者都取不到就空串（回退 250ms） */
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
    // 减少动效偏好下统一 400ms/帧（design 动效节）
    const base = reducedMotion ? REDUCED_FRAME_MS : frameDuration(meta, track, i)
    const scaled = Math.round(base * speed)
    durations.push(Number.isFinite(scaled) && scaled > 0 ? scaled : FALLBACK_FRAME_MS)
  }
  return { status, row, track, speed, count, durations, total: durations.reduce((a, b) => a + b, 0) }
}

/**
 * 按状态出一张播放计划（行号越界会被钳到第 0 行）。
 * `rowOverride`（卡 12）：入口给定的行号——**status 只驱动语义（轨名），不驱动行号**。
 * 它是合法非负整数时以它渲染（正常数据与 D-2 映射表的 row 逐字一致，行为不变；
 * status 与 row 冲突的畸形数据以 row 为准）；非法/缺省时回退映射表的 row。
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
 * 速度倍率取 1：页面不知道入口为什么选这一行，不该再叠一层倍率。
 */
export function planForRow(meta: SpriteMeta, row: number, reducedMotion: boolean): AnimPlan {
  const safeRow = clampRow(meta, row)
  return buildPlan(meta, 'idle', safeRow, pickTrack(meta, safeRow), 1, reducedMotion)
}

export interface DecideInput {
  /** 入口 `PetStateView.anim.status`（机器可读英文 key；可能是任意值） */
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
 * 定轨：优先级"瞬时互动 > 表演轨（trot/run-left/run-right）> idle"（D-2）。
 *
 * v2 起**没有**"属性过低"的本地兜底判定了（三属性已删，design D-10）：入口给什么状态就演什么，
 * 只有"入口没给/给了表外值"时才有兜底顺序——
 * 1. `anim.status`（八个英文 key 之一才采用）；
 * 2. 读不到 ⇒ 按中文 `anim.label` 反查；
 * 3. 两者都不可用 ⇒ 落到 `anim.row`（入口自记的行号）；
 * 4. 连行号都没给（`row` 为负 = state.ts 的"没给"哨兵）⇒ `idle`。
 *
 * 例外：`input.transient`（页面本地的瞬时动画）不参与这套判定——它由用户动作或入口自发的
 * 随机表演直接写入，优先级最高（随机表演与真实互动共用入口的 transient 字段；
 * 页面这边则保证"播满一轮再回落"）。
 */
export function decideAnimation(meta: SpriteMeta, input: DecideInput): AnimPlan {
  if (input.transient) return planForStatus(meta, input.transient, input.reducedMotion)

  const fromState = knownStatus(input.animStatus) ?? statusFromLabel(input.animLabel)
  // 行号以入口 `anim.row` 为准（status 只驱动语义不驱动行号；正常数据两侧映射一致、
  // 行为不变，status 与 row 冲突的畸形数据以 row 渲染）
  if (fromState) return planForStatus(meta, fromState, input.reducedMotion, input.animRow)

  // `row` 为负（state.ts 用 -1 表示"入口没给行号"）时不走这一支，否则会把"没给"误当成第 0 行
  const row = typeof input.animRow === 'number' ? input.animRow : Number.NaN
  if (Number.isInteger(row) && row >= 0) return planForRow(meta, row, input.reducedMotion)

  return planForStatus(meta, 'idle', input.reducedMotion)
}

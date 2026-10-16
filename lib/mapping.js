/**
 * 状态 → 动画轨映射、优先级判定与帧几何契约（design D-4；specs/pet-sprites）。
 *
 * 入口侧只用 `resolveStatus` + `animOf` 产出 PetStateView.anim = { row, label, status }
 * （row = 图集行号，label = 中文状态名（显示用），status = 机器可读英文 key（页面语义判定用，
 * 卡 12/裁定 R14 增补；值恒为 STATUS_TRACK 的键之一，sleep 与 idle 同 row 0 靠它区分））。
 * `wrapFrame` / `frameDurations` 是 D-4 帧契约（缺帧取模、sleep ×1.5、缺 durations 回退 250ms）
 * 的**纯函数参考实现**：页面渲染有自己的同款实现（app/lib/sprites.ts + anim.ts，卡 08 所有权），
 * 这里存在的意义是让本卡的 node --test 能拿真实 assets/whale/pet.json 把契约钉死
 * （任务卡 pet-sprites 的"缺帧取模 / sleep=idle 行且帧时长×1.5"两条 scenario）。
 */
import { LOW_THRESHOLD, SLEEP_AFTER_MS, TRANSIENT_MS } from './constants.js'
import { finiteOr } from './vitals.js'

/**
 * D-4 状态表（语义就近映射到上游鲸鱼娘图集的行）：
 * idle→0、eating→4(jumping)、bathing→3(waving)、playing→7(running)、petted→3(waving)、
 * hungry→6(waiting)、dirty→8(review)、sad→5(failed)、sleep→0(idle，帧时长 ×1.5)、
 * **trot→7(running)**（自发"原地跑一轮"）、**run-left→2(running-left)**、**run-right→1(running-right)**
 * （卡 18 / Q16：上游那两条侧跑轨终于被引用，但**只原地播帧**——宠物不位移，design Non-Goals 不变）。
 * 三条表演轨靠"无气泡 + 一轮即回落 + 不推进交互时刻"与真实互动区分。
 */
export const STATUS_TRACK = {
  idle: { row: 0, track: 'idle', speed: 1 },
  eating: { row: 4, track: 'jumping', speed: 1 },
  bathing: { row: 3, track: 'waving', speed: 1 },
  playing: { row: 7, track: 'running', speed: 1 },
  petted: { row: 3, track: 'waving', speed: 1 },
  hungry: { row: 6, track: 'waiting', speed: 1 },
  dirty: { row: 8, track: 'review', speed: 1 },
  sad: { row: 5, track: 'failed', speed: 1 },
  sleep: { row: 0, track: 'idle', speed: 1.5 },
  trot: { row: 7, track: 'running', speed: 1 },
  'run-left': { row: 2, track: 'running-left', speed: 1 },
  'run-right': { row: 1, track: 'running-right', speed: 1 }
}

/** 中文状态名（跨卡契约：PetStateView.anim.label；取自 D-4 状态表首列的中文名） */
export const STATUS_LABEL = {
  idle: '待机',
  eating: '喂食',
  bathing: '洗澡',
  playing: '玩耍',
  petted: '摸头',
  hungry: '饥饿',
  dirty: '脏',
  sad: '心情低',
  sleep: '打盹',
  trot: '原地小跑',
  'run-left': '向左小跑',
  'run-right': '向右小跑'
}

/**
 * D-4 优先级：瞬时互动 > hungry > dirty > sad > sleep > 表演轨 > idle（数值大者胜）。
 * 卡 15 为插入 `trot`（在 sleep 之后、idle 之前）把整表重编为连续整数——只改数值不改相对次序，
 * 既有断言（eating>hungry>dirty>sad>sleep>idle）全部继续成立。
 * 卡 18（Q16）把 `run-left`/`run-right` 一并放在**状态指示轨之后、idle 之前**（与 `trot` 同值 2）：
 * 它们只改姿态不改数值，绝不该压过 hungry/dirty/sad/sleep。
 *
 * 注意"谁在真正压过谁"由 `resolveStatus` 的**判定顺序**决定，不靠这张表：随机表演写在
 * `state.transient` 里（见下），而 transient 分支排在最前——所以表演进行中的 1.4–1.8s 会短暂覆盖
 * 状态指示轨（Q16：表演高于状态指示），而真实互动直接改写同一个 transient 字段 ⇒ 随时抢占它。
 * 这张表留给页面侧（app/lib/anim.ts 的同名表）做"入口回包与本地阈值判定谁赢"的仲裁。
 */
export const STATUS_PRIORITY = {
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
 * `state.transient` 里认得的"瞬时状态"集合（播放中不可被属性判定打断，到点回落）。
 *
 * 卡 18（Q16）起含三条**入口自发**的表演轨（`trot`/`run-left`/`run-right`）：
 * 随机表演与真实互动**共用同一个 transient 字段**（design D-14"复用既有 transient 机制"），
 * 所以 `resolveStatus` 必须认它们，否则表演会当场被属性判定顶掉。
 * "真实互动可随时抢占表演"不需要额外分支：`interact()` 直接改写同一个字段。
 */
const TRANSIENT_STATUSES = new Set([
  'eating',
  'bathing',
  'playing',
  'petted',
  'trot',
  'run-left',
  'run-right'
])

/**
 * 只能由入口**自发**触发的表演轨（trot / run-left / run-right）——与真实互动（eating/bathing/
 * playing/petted）区分开：拖动中要把这三条折成 idle（"被拎起来的东西不该自己跑"，D-13 互斥），
 * 而用户点出来的互动动画照常播（用户刚点的动作不该被拖动吞掉）。
 */
const SELF_BURST_STATUSES = new Set(['trot', 'run-left', 'run-right'])

export function isTransient(status) {
  return TRANSIENT_STATUSES.has(status)
}

/** 是否为入口自发的表演轨（bridge 的"拖动中折成 idle"与测试用同一判据，避免两处各写一份集合） */
export function isSelfBurst(status) {
  return SELF_BURST_STATUSES.has(status)
}

/**
 * 权威状态判定（入口每次构建 PetStateView 时调用）：
 * 1. transient 未到期 ⇒ 直接返回（真实互动与入口自发的随机表演都写在这里，播放中不可打断；
 *    表演进行中因此短暂覆盖状态指示轨 —— Q16"表演高于状态指示"，而真实互动随时改写同一字段抢占它）；
 * 2. 属性阈值：hunger<30 ⇒ hungry；clean<30 ⇒ dirty；mood<30 ⇒ sad（D-4 触发列，按优先级顺序）；
 * 3. 连续 10 分钟无交互 ⇒ sleep（lastInteractAt 由入口在点击/喂食/洗澡/玩耍/悬停时刷新）；
 * 4. 其余 ⇒ idle。
 *
 * 卡 18（Q16）：Q10/Q14 的 `trotUntil` 独立字段随"2–5 分钟小跑定时器"一并退役——
 * 随机表演（含 `trot`）现在只走第 1 步的 transient，入口不再为它维护第二个到期时刻。
 */
export function resolveStatus(state, now) {
  const t = state && state.transient
  if (t && typeof t === 'object' && isTransient(t.status) && finiteOr(t.until, 0) > now) {
    return t.status
  }
  if (finiteOr(state && state.hunger, 100) < LOW_THRESHOLD) return 'hungry'
  if (finiteOr(state && state.clean, 100) < LOW_THRESHOLD) return 'dirty'
  if (finiteOr(state && state.mood, 100) < LOW_THRESHOLD) return 'sad'
  const lastInteract = finiteOr(state && state.lastInteractAt, now)
  if (now - lastInteract >= SLEEP_AFTER_MS) return 'sleep'
  return 'idle'
}

/**
 * PetStateView.anim：{ row: 图集行号, label: 中文状态名, status: 机器可读英文 key }。
 * status 是卡 12（裁定 R14）增补的跨卡契约字段：值恒为 STATUS_TRACK 的键之一（**单一来源**，
 * 不另造映射表），页面靠它辨识语义——sleep 与 idle 同为 row 0，只有 status 能区分出
 * "打盹慢放 ×1.5 + Zzz 气泡"；label 仍为中文，仅供显示。未知状态回退 idle（与 row/label 同口径）。
 */
export function animOf(status) {
  const key = Object.hasOwn(STATUS_TRACK, status) ? status : 'idle'
  const spec = STATUS_TRACK[key]
  return { row: spec.row, label: STATUS_LABEL[key], status: key }
}

/**
 * 缺帧容错（specs/pet-sprites）：按 frames[row] 声明的该行帧数**取模**循环，
 * MUST NOT 越界采样相邻行（例：waving 只有 4 帧而列数是 8）。
 * frames 缺失/该行帧数非法 ⇒ 按 1 帧处理（不越界、不除零）；负索引也取模回正（防御 rAF 计数异常）。
 */
export function wrapFrame(frames, row, index) {
  const declared = Array.isArray(frames) ? frames[row] : undefined
  const count = Number.isInteger(declared) && declared > 0 ? declared : 1
  const i = Math.floor(finiteOr(index, 0))
  return ((i % count) + count) % count
}

/** 某轨未声明 durations 时的回退帧时长（specs/pet-sprites：250ms/帧） */
export const FALLBACK_FRAME_MS = 250

/**
 * 按状态出一张逐帧时长表（长度 = frames[row]，逐帧乘 speed 后四舍五入）：
 * - 帧时长取 meta.tracks[轨名].durations 的逐帧值（不等间隔）；
 * - 缺该轨/缺该帧/非法值 ⇒ 回退 250ms；
 * - sleep = idle 的 durations ×1.5（D-4，speed 来自 STATUS_TRACK）。
 * meta 即随图集分发的 pet.json 解析结果（声明驱动，不硬编码行列数）。
 */
export function frameDurations(meta, status) {
  const spec = STATUS_TRACK[status] || STATUS_TRACK.idle
  const frames = meta && Array.isArray(meta.frames) ? meta.frames : []
  const declared = frames[spec.row]
  const count = Number.isInteger(declared) && declared > 0 ? declared : 1
  const raw = meta && meta.tracks && meta.tracks[spec.track] && meta.tracks[spec.track].durations
  const out = []
  for (let i = 0; i < count; i++) {
    const d = Array.isArray(raw) ? raw[i] : undefined
    const base = typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : FALLBACK_FRAME_MS
    out.push(Math.round(base * spec.speed))
  }
  return out
}

/** 一轮总时长（TRANSIENT_MS 的推导依据；测试用它核对常量与 pet.json 未漂移） */
export function trackTotalMs(meta, status) {
  return frameDurations(meta, status).reduce((a, b) => a + b, 0)
}

export { TRANSIENT_MS }

/**
 * 状态 → 动画轨映射、优先级判定与帧几何契约（design D-2；specs/pet-sprites）。
 *
 * 入口侧只用 `resolveStatus` + `animOf` 产出 PetStateView.anim = { row, label, status }
 * （row = 图集行号，label = 中文状态名（显示用），status = 机器可读英文 key（页面语义判定用，
 * 卡 12/裁定 R14 增补；值恒为 STATUS_TRACK 的键之一）。
 * `wrapFrame` / `frameDurations` 是 D-4 帧契约（缺帧取模、缺 durations 回退 250ms）
 * 的**纯函数参考实现**：页面渲染有自己的同款实现（app/lib/sprites.ts + anim.ts，卡 08 所有权），
 * 这里存在的意义是让本卡的 node --test 能拿真实 assets/whale/pet.json 把契约钉死
 * （任务卡 pet-sprites 的"缺帧取模"scenario）。
 *
 * **v2（pet-v2-growth-favor）删掉了四条状态指示轨**：`hungry`/`dirty`/`sad`（依赖三属性阈值）
 * 与 `sleep`（连续 10 分钟无交互的打盹）——三属性体系整体移除（specs/pet-vitals 的 4 条 REMOVED）、
 * 打盹连同它的 1.5× 慢放一并撤销（design D-10）。于是 `resolveStatus` 只剩两个来源：
 * **未到期的 transient**（真实互动或入口自发的随机表演）与 **idle**。
 */
import { TIMER_MAX_SEC, TIMER_MIN_SEC, TRANSIENT_MS } from './constants.js'
import { finiteOr } from './growth.js'

/**
 * D-2 状态表（语义就近映射到上游鲸鱼娘图集的行）：
 * idle→0、eating→4(jumping)、bathing→3(waving)、playing→7(running)、petted→3(waving)、
 * **trot→7(running)**（自发"原地跑一轮"）、**run-left→2(running-left)**、**run-right→1(running-right)**
 * （卡 18 / Q16：上游那两条侧跑轨终于被引用，但**只原地播帧**——宠物不位移，design Non-Goals 不变）。
 * 三条表演轨靠"无气泡 + 一轮即回落 + 不推进交互时刻"与真实互动区分；但随机集里另外四项
 * （eating/bathing/petted/playing）与真实互动**同名同轨**，"谁写的这一轮"只能由
 * `state.transientSelf` 记录（卡 19 · 热修 D-1，见 `isSelfTransient`）。
 *
 * 保留的键**只有这七个**（v1 的 `hungry`/`dirty`/`sad`/`sleep` 已删；`test/values.test.js` 钉住）。
 */
export const STATUS_TRACK = {
  idle: { row: 0, track: 'idle', speed: 1 },
  eating: { row: 4, track: 'jumping', speed: 1 },
  bathing: { row: 3, track: 'waving', speed: 1 },
  playing: { row: 7, track: 'running', speed: 1 },
  petted: { row: 3, track: 'waving', speed: 1 },
  trot: { row: 7, track: 'running', speed: 1 },
  'run-left': { row: 2, track: 'running-left', speed: 1 },
  'run-right': { row: 1, track: 'running-right', speed: 1 }
}

/** 中文状态名（跨卡契约：PetStateView.anim.label；取自 D-2 状态表首列的中文名） */
export const STATUS_LABEL = {
  idle: '待机',
  eating: '喂食',
  bathing: '洗澡',
  playing: '玩耍',
  petted: '摸头',
  trot: '原地小跑',
  'run-left': '向左小跑',
  'run-right': '向右小跑'
}

/**
 * D-2 优先级：瞬时互动 > 表演轨 > idle（数值大者胜）。
 *
 * v2 起表里**没有属性轨**了（hungry/dirty/sad/sleep 随三属性与打盹一并删除），`playing` 与 `trot`
 * 同取 row7 但仍是两条独立状态（Q8 已接受"抽中率翻倍"的取舍）。
 * 注意"谁在真正压过谁"由 `resolveStatus` 的**判定顺序**决定，不靠这张表：随机表演写在
 * `state.transient` 里而 transient 分支排在最前，所以表演进行中的 1.4–1.8s 会短暂覆盖 idle，
 * 而真实互动直接改写同一个 transient 字段 ⇒ 随时抢占它。
 * 这张表留给页面侧（app/lib/anim.ts 的同名表）做"入口回包与本地判定谁赢"的仲裁。
 */
export const STATUS_PRIORITY = {
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
 * `state.transient` 里认得的"瞬时状态"集合（播放中不可被 idle 顶掉，到点回落）。
 *
 * 卡 18（Q16）起含三条**入口自发**的表演轨（`trot`/`run-left`/`run-right`）：
 * 随机表演与真实互动**共用同一个 transient 字段**（design D-14"复用既有 transient 机制"），
 * 所以 `resolveStatus` 必须认它们，否则表演会当场被基础态顶掉。
 * "真实互动可随时抢占表演"不需要额外分支：`interact()` 直接改写同一个字段。
 *
 * 卡 19（热修 D-1）：这个集合**只回答"谁是 transient"**，不回答"是谁写的"——
 * 随机集的七项里有四项与真实互动同名同轨，光看状态字符串分不出来；
 * 来源判据是 `isSelfTransient`（读 `state.transientSelf`）。
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

export function isTransient(status) {
  return TRANSIENT_STATUSES.has(status)
}

/**
 * 当前 transient 是否来自入口**自发**的随机表演（卡 19 · 热修 D-1 的入口侧判据）。
 *
 * **为什么必须新增来源标记、而不能靠状态字符串区分**：随机表演抽到的
 * `eating`/`bathing`/`petted`/`playing` 与用户点喂食/洗澡/摸头/玩耍写进 `transient` 的
 * 状态字符串**完全相同**（两边都是 `'eating'` 这样的一条），入口与页面都是两套构建、
 * 页面拿到的只有这个字符串 ⇒ 任何"状态 ∈ 某集合"的判据都必然把随机表演与真实互动混为一谈。
 * 卡 18 的 `isSelfBurst(status)` 只能认出 `trot`/`run-left`/`run-right` 三条**同构轨**，
 * 对同名四项无能为力，于是页面在本地一轮播完后仍按入口的 `animStatus='eating'`（优先级 9）
 * 一直渲染下去——实机复验就是这个现象（停留 5/10/15s、连成一片 24.98s，D-1）。
 * 来源只能由**写入方**如实记录：`onRandomPerf` 写 `transientSelf: true`、
 * `interact` 写 `transientSelf: false`，两者与 `transient` 同生命周期。
 *
 * 口径与 `resolveStatus` 的 transient 分支逐字一致（认得的 transient + 未到期），
 * 且 `transientSelf` 必须是**真布尔 `true`**：畸形值（字符串 `'true'`、数字 1、null、对象）
 * 一律按 false 处理（任务卡负向自检"畸形 transientSelf 归一 false"），
 * 宁可当成"不是自发表演"（多渲染一轮真实状态），也不误折用户刚点的动作。
 */
export function isSelfTransient(state, now) {
  const t = state && state.transient
  if (!t || typeof t !== 'object') return false
  if (!isTransient(t.status)) return false
  if (!(finiteOr(t.until, 0) > now)) return false
  return state.transientSelf === true
}

/**
 * 到期推送定时器所需的**整数秒**（卡 19 · 父代理裁定 R54）。
 *
 * **为什么需要它**：`api.timer` 只收 **1–86400 的整数秒**（api-reference.md:405-414,552-572），
 * 没有毫秒级入口（宿主级定时器的意义是主窗口最小化时不被节流到 1s 粒度，见 constants.js），
 * 所以"还剩多少毫秒"必须取整成秒：
 * - **向上取整**（不是四舍五入、更不是向下取整）：宁可**晚** ≤1 秒触发，也绝不早到——
 *   早到会被 `transientExpired` 挡掉并按剩余时间重排，白跑一次回调（虽然无害）；
 * - 钳在 API 合法区间 `[TIMER_MIN_SEC, TIMER_MAX_SEC]`：畸形/已过期的 until（NaN、字符串、
 *   负数、缺失）取 1 秒，回调里的到期校验会立刻放行（清 transient + 推送），不空转；
 * - 取整代价是**可算的**（回执里给逐轨表）：`TRANSIENT_MS` 的 1400–1800ms 全部落到 2 秒
 *   （eating 1600→2s、bathing/petted 1400→2s、playing/trot 1500→2s、run-left/right 1800→2s），
 *   即真实互动最迟在该轮时长 + ≤1 秒内收到到期推送（页面随即回落基础态）。
 */
export function transientDelaySeconds(until, now) {
  const remain = finiteOr(until, 0) - finiteOr(now, 0)
  if (!(remain > 0)) return TIMER_MIN_SEC
  return Math.min(TIMER_MAX_SEC, Math.max(TIMER_MIN_SEC, Math.ceil(remain / 1000)))
}

/**
 * `state.transient` 是否**已经到期**（卡 19 · R54 的到期定时器回调判据）。
 *
 * 与 `resolveStatus` 的 transient 分支严格互补：那边要 `until > now` 才算"在播"，
 * 这边要 `until <= now` 才算"该清"。**先校验再清**是本次的硬要求：宿主定时器可能早到
 * （时钟回拨 / 定时器漂移），早到时绝不能清掉用户正在看的那一轮。
 * 畸形 `until`（NaN/字符串/负数）按 0 处理 ⇒ 视为已到期（清掉一个本就渲染不出来的字段无害）；
 * 但**没有 transient 对象时一律 false**——否则"没有 transient"会被误判成"该清"，
 * 让重排逻辑变成 1 秒空转的死循环。
 */
export function transientExpired(state, now) {
  const t = state && state.transient
  if (!t || typeof t !== 'object') return false
  return finiteOr(t.until, 0) <= finiteOr(now, 0)
}

/**
 * 权威状态判定（入口每次构建 PetStateView 时调用）：
 * 1. transient 未到期 ⇒ 直接返回（真实互动与入口自发的随机表演都写在这里，播放中不可打断）；
 * 2. 其余 ⇒ idle。
 *
 * **v2 只剩这两步**：v1 的第 2/3 步（属性阈值 ⇒ hungry/dirty/sad、连续 10 分钟无交互 ⇒ sleep）
 * 随 `pet-vitals` 的 4 条 REMOVED 与 design D-10 整体删除 —— 没有任何"数值过低"或"太久没动"
 * 导致的负面姿态，宠物在无人互动时就一直是 `idle`（specs/pet-values：成长值/好感值都只涨不跌）。
 *
 * 卡 18（Q16）：Q10/Q14 的 `trotUntil` 独立字段随"2–5 分钟小跑定时器"一并退役——
 * 随机表演（含 `trot`）现在只走第 1 步的 transient，入口不再为它维护第二个到期时刻。
 */
export function resolveStatus(state, now) {
  const t = state && state.transient
  if (t && typeof t === 'object' && isTransient(t.status) && finiteOr(t.until, 0) > now) {
    return t.status
  }
  return 'idle'
}

/**
 * PetStateView.anim：{ row: 图集行号, label: 中文状态名, status: 机器可读英文 key }。
 * status 是卡 12（裁定 R14）增补的跨卡契约字段：值恒为 STATUS_TRACK 的键之一（**单一来源**，
 * 不另造映射表）；label 仍为中文，仅供显示。未知状态回退 idle（与 row/label 同口径）。
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
 * - `speed` 一律取 STATUS_TRACK 的值（v2 起保留下来的八条状态**全是 1**：v1 唯一的 1.5×
 *   是打盹的慢放，已随 design D-10 删除；保留乘法是为了不破坏帧契约与页面侧的同名实现）。
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

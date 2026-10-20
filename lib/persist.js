/**
 * 存档的序列化 / 反序列化与字段清洗（specs/pet-values R4"载入 v1 存档"；design D-1 字段表 / D-7 迁移表）。
 *
 * 纯函数：只做 文本 ⇄ 状态 的转换与合法性判定，**不碰 api.fs**——
 * 读写、备份（state.json.bad）、原子写等价与日志都在入口 index.js（需要 api 的地方）做。
 * 时间基准 `now` 由调用方传入（默认 `Date.now()` 只为兼容既有调用点），测试里可完全脱离真实时钟。
 *
 * 判定口径（deserialize 的 reason）：
 * - `parse`   ：JSON 解析失败 / 顶层不是对象 ⇒ D-9"state.json 损坏，已按初始值重建"；
 * - `version` ：schemaVersion 缺失、非整数、<1 或 >SCHEMA_VERSION ⇒ D-9"存档版本不受支持，已备份并重建"。
 *   spec 只写了"高于当前支持的版本"，缺失/畸形版本号同样不可信（无法判定来源版本），
 *   归入同一备份重建路径（口径已记录在回执）。
 *
 * ## v1 → v2 迁移（R4 / D-7）
 *
 * `sanitizeState` 是**白名单构造**（只挑认识的字段），所以 v1 存档里的
 * `hunger` / `clean` / `mood`（三属性）以及 v1 的联动/挂机流水账
 * （`hungerDropAcc`/`cleanDropAcc`/`recoverAcc`/`afkAcc`）与 `lastSettledAt`
 * **既不读、也不报错、更不会触发 `state.json.bad` 备份重建**：
 * "废弃字段"是正常的版本演进（用户什么都没做错），只有 JSON 坏 / schemaVersion 不受支持才走备份重建。
 * 迁移的净效果与 spec R4 逐条对应：
 *
 * | 存档内容 | 迁移结果 |
 * | --- | --- |
 * | `growth` / `fish` / `bubble` / `lastInteractAt` / `lastPetAt` / `position` | 保留（各自过清洗） |
 * | `favor` 缺失或非法 | 0（三属性**不**折算成好感，用户已裁定丢弃） |
 * | `lastGrowthAt` 缺失 | `now`（**不补算历史**：从这一刻开始计时，重开后逐步累计） |
 * | `lastAfkAt` / `lastTextAt` 缺失 | `now`（挂机奖励与定时文本同样从这一刻重新计时） |
 * | `hunger` / `clean` / `mood` | 丢弃，且 `serialize` 不再写回 ⇒ `JSON.stringify(state)` 里查不到这三个键 |
 *
 * `deserialize` 额外回一个 `migratedFromV1`（旧存档里真的出现过三属性键 ⇒ true），
 * 供入口（卡 4）按 design R6 记录一条"已丢弃 v1 三属性"的诊断——本模块没有 settings 访问权，
 * 只提供信号，不写 `pet.diagnostic`。
 *
 * 时间戳归一策略（两种语义，分别对应 design D-7 的两句话）：
 * - **冷却基准**（`lastInteractAt`/`lastPetAt`）：缺失/非法/负数/未来 ⇒ **0 = 视为已到期**
 *   （D-4："宁可给用户互动，也不要永久卡死"；未来时间同理，否则时钟被拨快就再也不能互动）；
 * - **累积基准**（`lastGrowthAt`/`lastAfkAt`/`lastTextAt`）：缺失 ⇒ `now`（不补历史）；
 *   非法 ⇒ `lastGrowthAt` 取 **0**（D-7"视为已到期"，本次结算最多补到 24 小时上限，
 *   与任务卡负向自检"`lastGrowthAt:'x'` ⇒ 归一为 0 / 视为已到期"一致），
 *   而 `lastAfkAt` 取 **now**——挂机奖励没有"到期"语义，基准 0 会一次性补满历史库存，
 *   属于"宁可少发不可多发"的取舍（已在回执里写明）。
 */
import { INITIAL_BUBBLE, INITIAL_FISH, SCHEMA_VERSION } from './constants.js'
import { finiteOr, toNonNegInt } from './growth.js'
import { sanitizeBubble, sanitizeFish } from './items.js'

/**
 * v1 的三属性键（**只用于迁移识别**，读档时丢弃、不再写回）。
 * 单独抽成常量而不是散在代码里：grep `hunger|clean|mood` 时这套键名是唯一合法命中点之一。
 */
const LEGACY_VITAL_KEYS = ['hunger', 'clean', 'mood']

/**
 * 窗体位置清洗（design D-13 的"位置失效回退"）。
 *
 * 返回 `{ position, dropped }`：
 * - `position`：`{x,y}`（两个**有限数字**）或 `null`（= 用 `anchor` 默认位，绝对坐标由宿主定）；
 * - `dropped`：存档里**写了** position 但不可用（`{x:NaN}` / 缺字段 / 非对象 / 字符串坐标）⇒ true，
 *   入口据此 `console.warn`（任务卡负向自检："存档 position 为 {x:NaN}/缺字段 ⇒ 回退 anchor + warn"）。
 *
 * **不做几何钳位**：入口拿不到主显示器 workArea，"超界"在这里判不出来也不该判——
 * 越界坐标原样交给 `api.overlay.setPosition`，由宿主按工作区钳位并**回传钳后坐标**（卡 14 / R31），
 * 入口再用回传值校正自记位置。`null` 是合法存档值（表示"从未拖动过，仍在锚点默认位"），不算 dropped。
 */
export function sanitizePosition(value) {
  if (value === undefined || value === null) return { position: null, dropped: false }
  if (typeof value !== 'object' || Array.isArray(value)) return { position: null, dropped: true }
  const x = value.x
  const y = value.y
  if (typeof x !== 'number' || !Number.isFinite(x)) return { position: null, dropped: true }
  if (typeof y !== 'number' || !Number.isFinite(y)) return { position: null, dropped: true }
  return { position: { x, y }, dropped: false }
}

/**
 * 冷却基准清洗：非法/负数/0/未来 ⇒ **0**（= 已到期）。
 * 未来时间为 0 而不是原样保留：否则用户把系统时钟往前拨一次，互动会被"未来的上次互动时间"永久锁死
 * （D-4 回拨条：`now - last < 0` 同样视为已到期）。
 */
function sanitizeCooldownAt(value, now) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  if (value > now) return 0
  return value
}

/**
 * 累积基准清洗：缺失 ⇒ `now`（不补历史）；非法/负数 ⇒ `invalidFallback`；
 * 未来（时钟被拨快/夏令时）⇒ `now`（从现在重新计时，绝不产生负数小时）。
 * 用 `Object.hasOwn` 区分"缺失"与"显式写了坏值"——两者的口径**故意不同**（见文件头）。
 */
function sanitizeAccrualAt(src, key, now, invalidFallback) {
  if (!Object.hasOwn(src, key) || src[key] === undefined) return now
  const v = src[key]
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return invalidFallback
  if (v > now) return now
  return v
}

/**
 * 任意对象 → 完整运行时状态（缺字段给初始值，坏字段清洗）。
 *
 * 持久化字段（design D-1）：`growth` / `favor` / `fish` / `bubble` / `lastInteractAt` / `lastPetAt` /
 * `lastGrowthAt` / `lastAfkAt` / `lastTextAt` / `diagnostic` / `position`。
 * 运行时字段（读档一律清空，不落盘）：`transient` / `transientSelf` / `speech`。
 * - `transientSelf` 是 transient 那一轮的**来源标记**（自发表演 true / 真实互动 false，design D-2），
 *   必须与 `transient` 同生共死且**不落盘**——重启后 transient 本来就是 null，来源标记自然无意义；
 *   畸形值（字符串 `'true'`、数字 1、对象）一律归一为 `false`（宁可多渲染一轮真实状态）。
 * - `diagnostic`：v1/v2 的**实际**诊断位仍是设置键 `pet.diagnostic`（入口是唯一写入方，设置页展示）；
 *   state 里保留同名字段只为满足 design D-1 的字段表与视图形状稳定，入口**不**依赖它做判定，
 *   它的值只是原样往返（卡 4 可视需要改为同步设置键）。
 */
export function sanitizeState(raw, now = Date.now()) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const t = finiteOr(now, Date.now())
  return {
    growth: toNonNegInt(src.growth),
    favor: toNonNegInt(src.favor),
    fish: sanitizeFish(src.fish),
    bubble: sanitizeBubble(src.bubble),
    // 冷却基准：0 = 已到期（首次安装即可喂食/点击，见 settle.initialState 的同款口径）
    lastInteractAt: sanitizeCooldownAt(src.lastInteractAt, t),
    lastPetAt: sanitizeCooldownAt(src.lastPetAt, t),
    // 累积基准：缺失 ⇒ now（不补历史）；lastGrowthAt 坏值 ⇒ 0（视为已到期，最多少补到上限）
    lastGrowthAt: sanitizeAccrualAt(src, 'lastGrowthAt', t, 0),
    lastAfkAt: sanitizeAccrualAt(src, 'lastAfkAt', t, t),
    lastTextAt: sanitizeAccrualAt(src, 'lastTextAt', t, 0),
    diagnostic: typeof src.diagnostic === 'string' ? src.diagnostic : '',
    position: sanitizePosition(src.position).position,
    transient: null,
    transientSelf: false,
    speech: null
  }
}

/**
 * 状态 → 存档文本。**显式挑字段**（白名单）而不是 `JSON.stringify` 整个状态：
 * 运行时字段（transient/transientSelf/speech）带毫秒时间戳或只在一轮动画内有意义，落盘没有意义
 * 且会把文件撑出噪音。
 * 顶层含 `schemaVersion: 1`（沿用 v1 的版本号：字段集变了但读旧档是**迁移**而不是拒绝，
 * 所以不抬版本 ⇒ 也就不会让 v1.0.2 与 v2 的存档互斥到要走 state.json.bad）。
 * **三属性字段不在白名单里**——这是"迁移后再也查不到 hunger/clean/mood"的最终保证。
 */
export function serialize(state) {
  const s = state && typeof state === 'object' ? state : {}
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    growth: s.growth,
    favor: s.favor,
    fish: s.fish,
    bubble: s.bubble,
    lastInteractAt: s.lastInteractAt,
    lastPetAt: s.lastPetAt,
    lastGrowthAt: s.lastGrowthAt,
    lastAfkAt: s.lastAfkAt,
    lastTextAt: s.lastTextAt,
    diagnostic: typeof s.diagnostic === 'string' ? s.diagnostic : '',
    position: s.position && typeof s.position === 'object' ? s.position : null
  })
}

/**
 * 存档文本 → `{ ok:true, state, positionDropped, migratedFromV1 }` | `{ ok:false, reason:'parse'|'version' }`。
 * 失败时**不回传半成品状态**：入口据 reason 走"备份 state.json.bad + 初始值重建 + console.warn"。
 * `positionDropped`（卡 15）：存档写了 position 但非法 ⇒ true，入口据此 warn 一条。
 * `migratedFromV1`（卡 1）：旧存档里出现过三属性键 ⇒ true，供入口记录 R6 的迁移诊断。
 * 旧存档里的**已废字段**（v1 的三属性与流水账）走白名单丢弃，不进入失败分支（见文件头注释）。
 */
export function deserialize(text, now = Date.now()) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'parse' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'parse' }
  }
  const version = parsed.schemaVersion
  if (!Number.isInteger(version) || version < 1 || version > SCHEMA_VERSION) {
    return { ok: false, reason: 'version' }
  }
  return {
    ok: true,
    state: sanitizeState(parsed, now),
    positionDropped: sanitizePosition(parsed.position).dropped,
    // v1 存档的判据：真的带了三属性键（不是"版本号是 1"——v2 自己也还用 schemaVersion 1）
    migratedFromV1: LEGACY_VITAL_KEYS.some((key) => Object.hasOwn(parsed, key))
  }
}

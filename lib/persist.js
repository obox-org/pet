/**
 * 存档的序列化 / 反序列化与字段清洗（specs/pet-vitals"状态存档"requirement；design D-5/D-8/D-9）。
 *
 * 纯函数：只做 文本 ⇄ 状态 的转换与合法性判定，**不碰 api.fs**——
 * 读写、备份（state.json.bad）、原子写等价与日志都在入口 index.js（需要 api 的地方）做。
 *
 * 判定口径（deserialize 的 reason）：
 * - `parse`   ：JSON 解析失败 / 顶层不是对象 ⇒ D-9"state.json 损坏，已按初始值重建"；
 * - `version` ：schemaVersion 缺失、非整数、<1 或 >SCHEMA_VERSION ⇒ D-9"存档版本不受支持，已备份并重建"。
 *   spec 只写了"高于当前支持的版本"，缺失/畸形版本号同样不可信（无法判定来源版本），
 *   归入同一备份重建路径（口径已记录在回执）。
 *
 * 字段清洗（sanitizeState）：schemaVersion 正确不代表字段没被改坏——
 * NaN/字符串/null ⇒ 回退该字段初始值；负数/超界 ⇒ 钳制（任务卡负向自检"不污染状态"）。
 * 卡 15 起还清洗 `position`（非法 ⇒ 回退 anchor 默认，D-13）。
 *
 * **已废字段的向后兼容（卡 17 · Q15=B）**：卡 15 曾把隐藏态持久化为存档字段 `hidden`，
 * 卡 17 把隐藏功能整条撤销。`sanitizeState` 是**白名单构造**（只挑认识的字段），因此旧存档里的
 * `hidden` 既不读、也不报错、更**不会**触发 `state.json.bad` 备份重建——"废弃字段"与"损坏存档"
 * 必须区别对待：前者是正常的版本演进（用户什么都没做错，不该被备份重建、不该看到 warn），
 * 后者（JSON 坏 / schemaVersion 不受支持）才走备份重建（D-9）。`position` 等其余字段照常读入。
 */
import {
  INITIAL_BUBBLE,
  INITIAL_FISH,
  INITIAL_VITALS,
  SCHEMA_VERSION
} from './constants.js'
import { sanitizeBubble, sanitizeFish } from './items.js'
import { clamp, finiteOr, sanitizeVital } from './vitals.js'

/** 账本类字段清洗：非负；损坏的大值钳回一个周期内，避免读档瞬间爆发式触发联动 */
function sanitizeAcc(value, max) {
  return clamp(finiteOr(value, 0) < 0 ? 0 : finiteOr(value, 0), 0, max)
}

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
 * 入口再用回传值校正自记位置。分工写在 index.js 的 `applyPosition` 注释与卡 15 回执里。
 * `null` 是合法存档值（表示"从未拖动过，仍在锚点默认位"），不算 dropped。
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
 * 任意对象 → 完整运行时状态（缺字段给初始值，坏字段清洗）。
 * lastInteractAt 不落盘（启动时 startupReset 会重置为 now），这里给 0 只是形状完整。
 * 持久化字段（卡 15 起，卡 17 起只剩 position）：
 * - `position`（**落盘**，D-13）：见 `sanitizePosition`；
 * - 卡 15 的 `trotUntil`（D-14 的自发小跑到期时刻）已随卡 18 的随机表演改造退役：
 *   表演现在写进**本来就不落盘**的 `transient`（与真实互动同一字段），不再有第二个运行时到期时刻。
 * 卡 15 的 `hidden` 已于卡 17 撤销：不在这里读取（旧存档里的该字段被静默忽略，见文件头注释）。
 */
export function sanitizeState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    hunger: sanitizeVital(src.hunger, INITIAL_VITALS.hunger),
    clean: sanitizeVital(src.clean, INITIAL_VITALS.clean),
    mood: sanitizeVital(src.mood, INITIAL_VITALS.mood),
    fish: sanitizeFish(src.fish),
    bubble: sanitizeBubble(src.bubble),
    growth: Math.max(0, finiteOr(src.growth, 0)),
    hungerDropAcc: sanitizeAcc(src.hungerDropAcc, 10),
    cleanDropAcc: sanitizeAcc(src.cleanDropAcc, 10),
    recoverAcc: sanitizeAcc(src.recoverAcc, 10),
    afkAcc: sanitizeAcc(src.afkAcc, 1200),
    lastSettledAt: finiteOr(src.lastSettledAt, 0),
    lastPetAt: finiteOr(src.lastPetAt, 0),
    lastInteractAt: 0,
    position: sanitizePosition(src.position).position,
    transient: null,
    speech: null
  }
}

/**
 * 状态 → 存档文本。**显式挑字段**（白名单）而不是 JSON.stringify 整个状态：
 * 运行时字段（transient/speech）带毫秒时间戳，落盘没有意义且会把文件撑出噪音。
 * 顶层含 schemaVersion: 1（specs/pet-vitals MUST）。
 * 卡 17 起白名单只剩 `position`（D-13）：卡 15 的 `hidden` 随隐藏功能一并撤销，不再落盘。
 */
export function serialize(state) {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    hunger: state.hunger,
    clean: state.clean,
    mood: state.mood,
    fish: state.fish,
    bubble: state.bubble,
    growth: state.growth,
    hungerDropAcc: state.hungerDropAcc,
    cleanDropAcc: state.cleanDropAcc,
    recoverAcc: state.recoverAcc,
    afkAcc: state.afkAcc,
    lastSettledAt: state.lastSettledAt,
    lastPetAt: state.lastPetAt,
    position: state.position && typeof state.position === 'object' ? state.position : null
  })
}

/**
 * 存档文本 → `{ ok:true, state, positionDropped }` | `{ ok:false, reason:'parse'|'version' }`。
 * 失败时**不回传半成品状态**：入口据 reason 走"备份 state.json.bad + 初始值重建 + console.warn"。
 * `positionDropped`（卡 15）：存档写了 position 但非法 ⇒ true，入口据此 warn 一条
 * （D-13 的"非法值回退默认值并 warn"）；失败分支不带该字段（既有断言用 deepEqual 逐字比对）。
 * 旧存档里的**已废字段**（卡 15 的 `hidden`）走白名单丢弃，不进入失败分支（见文件头注释）。
 */
export function deserialize(text) {
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
  return { ok: true, state: sanitizeState(parsed), positionDropped: sanitizePosition(parsed.position).dropped }
}

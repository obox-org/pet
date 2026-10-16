/**
 * 三属性的数值口径与联动记账（specs/pet-vitals；design D-5 第 2/3/6 步）。
 *
 * 数值口径（任务卡固定）：
 * - 内部保留浮点（避免长期漂移），显示时向下取整（显示归页面/宿主，入口只保证真值）；
 * - 属性钳 [0, 100]；心情经"恢复"途径上限 95（互动途径可到 100）；
 * - 非法输入（NaN/字符串/null/undefined）一律回退到给定初值，**不污染状态**（任务卡负向自检）。
 *   注意口径：数字字符串（如 '50'）**按拒绝处理**回退初值，不做隐式转换 —— 存档里出现字符串
 *   说明文件已损坏，猜测其数值比回退更危险。
 */
import { LEDGER_STEP, RECOVER_MOOD_CAP } from './constants.js'

/** 有限数字判定 + 回退：只有 typeof number 且 isFinite 才接受，其余（含 NaN/字符串/null）回退 fallback */
export function finiteOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 钳到 [lo, hi]（调用方保证 value 有限；对 NaN 无意义） */
export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value))
}

/** 属性清洗：非法 ⇒ fallback；合法 ⇒ 钳 [0,100]（负数 → 0、超 100 → 100） */
export function sanitizeVital(value, fallback) {
  return clamp(finiteOr(value, fallback), 0, 100)
}

/**
 * 单个属性按速率衰减一轮。
 * 返回 `next`（钳 [0,100] 后的新值）与 `dropped`（**实际净下降** = current - next，≥0）。
 * 为什么用"实际净下降"记账：属性已到 0 时继续结算，衰减量被钳掉，联动不能按理论衰减量
 * 给心情扣分（specs/pet-vitals 下限钳制 scenario 的连带语义）。
 */
export function decayVital(current, perSec, dtSec) {
  const safeCurrent = sanitizeVital(current, 0)
  const next = clamp(safeCurrent - perSec * dtSec, 0, 100)
  return { next, dropped: safeCurrent - next }
}

/**
 * "净下降"联动记账：饥饿/清洁每累计下降 10 点 ⇒ 心情 -1，触发后扣掉 10（零头保留）。
 * 零头跨结算周期连续（specs/pet-vitals："累计"指自上次触发以来的净变化量）。
 * 返回新账本值与心情（心情此处不钳 0，由结算末尾统一钳）。
 */
export function ledgerDrop(acc, dropped, mood) {
  let a = Math.max(0, finiteOr(acc, 0)) + Math.max(0, finiteOr(dropped, 0))
  let m = mood
  while (a >= LEDGER_STEP) {
    a -= LEDGER_STEP
    m -= 1
  }
  return { acc: a, mood: m }
}

/**
 * "净恢复"联动记账：饥饿/清洁每累计恢复 10 点 ⇒ 心情 +1，触发后扣掉 10（零头保留）。
 * **恢复途径的心情上限 95**：心情已 ≥95 时该次触发**不加也不倒扣**（点数照常消耗）——
 * spec 只禁止"推到 96 及以上"，若把 98 钳回 95 等于恢复反而降心情，违背直觉（口径已记录在回执）。
 */
export function ledgerRecover(acc, recovered, mood) {
  let a = Math.max(0, finiteOr(acc, 0)) + Math.max(0, finiteOr(recovered, 0))
  let m = mood
  while (a >= LEDGER_STEP) {
    a -= LEDGER_STEP
    if (m < RECOVER_MOOD_CAP) m = Math.min(m + 1, RECOVER_MOOD_CAP)
  }
  return { acc: a, mood: m }
}

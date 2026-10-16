/**
 * 成长值：速率公式与等级映射（specs/pet-growth；design D-5 第 5 步、D-7 等级表）。
 *
 * rate = max(0, 2 - 0.1 * floor((100 - mood) / 5)) /小时，下限 0（不为负）。
 * 成长值本身无上限、非负；显示向下取整归页面（app/lib/state.ts displayGrowth）。
 */
import {
  GROWTH_BASE_PER_HOUR,
  GROWTH_MOOD_STEP,
  GROWTH_PENALTY_PER_STEP,
  RANK_NAMES,
  RANK_THRESHOLDS
} from './constants.js'
import { finiteOr, sanitizeVital } from './vitals.js'

/** 每小时成长速率：心情每缺 5 点（向下取整档）⇒ -0.1，钳到 ≥0 */
export function growthRatePerHour(mood) {
  const m = sanitizeVital(mood, 100)
  const steps = Math.floor((100 - m) / GROWTH_MOOD_STEP)
  return Math.max(0, GROWTH_BASE_PER_HOUR - GROWTH_PENALTY_PER_STEP * steps)
}

/** dt 秒内的成长增量（惰性结算与衰减同用时间差，不依赖 tick 次数累加） */
export function growthDelta(mood, dtSec) {
  const dt = Math.max(0, finiteOr(dtSec, 0))
  return growthRatePerHour(mood) * dt / 3600
}

/** 成长值 → { rank, rankName }（D-7：0–49 幼鲸 / 50–199 伙伴 / 200–499 挚友 / ≥500 深海羁绊） */
export function rankOf(value) {
  const v = Math.max(0, finiteOr(value, 0))
  let rank = 0
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
    if (v >= RANK_THRESHOLDS[i]) rank = i
  }
  return { rank, rankName: RANK_NAMES[rank] }
}

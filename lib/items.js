/**
 * 道具库存：清洗与挂机发放（specs/pet-economy；design D-5 第 4 步、D-7 初始库存）。
 *
 * 库存是**整数**（0..20）：发放 +1、消耗 -1，不存在半个鱼干；
 * 存档清洗时向下取整再钳 [0, ITEM_CAP]，防损坏文件塞进 2.7 或 -3。
 */
import { INITIAL_BUBBLE, INITIAL_FISH, ITEM_CAP } from './constants.js'
import { clamp, finiteOr } from './vitals.js'

/** 库存清洗：非法 ⇒ 对应初值（3）；合法 ⇒ floor 后钳 [0,20]（负数 → 0，超顶 → 20） */
export function sanitizeItemCount(value, fallback) {
  const n = finiteOr(value, fallback)
  return clamp(Math.floor(n), 0, ITEM_CAP)
}

export function sanitizeFish(value) {
  return sanitizeItemCount(value, INITIAL_FISH)
}

export function sanitizeBubble(value) {
  return sanitizeItemCount(value, INITIAL_BUBBLE)
}

/**
 * 挂机满一个周期（1200s）的发放：两种道具各 +1，**各自独立钳顶**——
 * "库存到顶"scenario：鱼干已 20 则保持 20，泡泡未满照常 +1。
 * 计时器（afkAcc）照常扣减 1200，不因到顶停摆（到顶期间的周期被消耗，不囤积）。
 */
export function grantAfkOnce(fish, bubble) {
  return {
    fish: Math.min(sanitizeFish(fish) + 1, ITEM_CAP),
    bubble: Math.min(sanitizeBubble(bubble) + 1, ITEM_CAP)
  }
}

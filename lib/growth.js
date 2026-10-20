/**
 * 成长值与好感值的**数值模型**（specs/pet-values 的 R1/R2/R3；design D-1 / D-5）。
 *
 * 三条不变的语义（读任何函数前先看这三条）：
 * 1. **只增不减**：成长值与好感值都是**非负整数**，没有任何衰减/清零逻辑（R1/R2）；
 * 2. **成长值不驱动任何功能**：不参与等级判定、不解锁动作与文案（R1 scenario「成长值不驱动任何功能」），
 *    它只是一个纯累计数字 ⇒ 本文件里**没有** `growth → 等级` 的映射（v1 的 `rankOf` 已随本 change 删除）；
 * 3. **等级只看好感值**（R3）：`levelOf(favor)` 是唯一的等级函数，阈值表在 `constants.js`。
 *
 * 本文件同时是 lib 层**数值原语的唯一来源**（`finiteOr` / `clamp` / `toNonNegInt`）。
 * 为什么在这里：v1 的 `lib/vitals.js`（三属性口径 + 联动记账）随 `pet-vitals` 的 4 条 REMOVED
 * 整体删除，但它顺带承载了这两个与属性无关的通用原语，被 `items.js` / `persist.js` / `settle.js` /
 * `mapping.js` 共用。把它们放到**只依赖 `constants.js`** 的本文件（lib 依赖图最底层）不会成环
 * （若放 `persist.js`，则 `persist → items → persist` 成环）；这也是卡 1 回执里声明的口径选择。
 *
 * 顶层零副作用：可被 `node --test` 直接 import。
 */
import {
  FAVOR_LEVEL_NAMES,
  FAVOR_THRESHOLDS,
  GROWTH_BACKFILL_CAP_HOURS,
  GROWTH_PER_HOUR
} from './constants.js'

/** 一小时的毫秒数（成长值的结算单位；不引新常量，局部闭环） */
const HOUR_MS = 3_600_000

/**
 * 有限数字判定 + 回退：只有 `typeof number` 且 `Number.isFinite` 才接受，
 * 其余（NaN/±Infinity/字符串/null/undefined/布尔/对象）一律回退 `fallback`。
 *
 * **数字字符串按拒绝处理**（不做隐式转换）：存档里出现 `"50"` 说明文件已被改坏，
 * 猜它的数值比回退到安全值更危险（口径与 v1 的 `vitals.js`、宿主 `setPosition`
 * "不钳不猜"一致，卡 1 保留该口径）。
 */
export function finiteOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 钳到 `[lo, hi]`（调用方负责保证 `value` 是有限数；对 NaN 无意义） */
export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value))
}

/**
 * 非负整数归一（成长值/好感值的**唯一**合法形状）：非法 ⇒ 0，负数 ⇒ 0，小数 ⇒ 向下取整。
 * spec 只说"非负整数"，取整方向选**向下**（与道具/显示的取整口径一致，且绝不会多送 1 点）。
 */
export function toNonNegInt(value) {
  return Math.max(0, Math.floor(finiteOr(value, 0)))
}

/**
 * 好感值 → `{ level, name }`（**第 1 级起、第 10 级止**；design D-5 的阈值表）。
 *
 * `level` = "满足阈值的最大级" +1 的下标（`FAVOR_THRESHOLDS` 是累计好感的闭区间下界）：
 * 0→1「初次见面」、19→1、20→2「点头之交」、649→9、650→10「命定相伴」。
 * **非法输入一律第 1 级**（负数 / NaN / 字符串 / null / undefined / ±Infinity）——
 * 这是 spec 的负向要求，也保证"读到一个坏存档也不会让宠物变成奇怪等级"。
 * **无上限**：>650 仍是第 10 级（好感继续累加，等级不回落也不越界）。
 *
 * 放在 `growth.js`（而非 `mapping.js`）的理由：`mapping.js` 的职责是"状态 → 动画轨/优先级"，
 * 而这里回答的是"好感值 → 等级"这种**纯数值**问题；且 v1 的等级函数 `rankOf` 就在本文件，
 * 卡 3/卡 4 消费 `levelOf` 时不必跨到动画映射模块去取（已在回执里声明二选一的结果）。
 */
export function levelOf(favor) {
  const v = finiteOr(favor, 0)
  let level = 1
  for (let i = 0; i < FAVOR_THRESHOLDS.length; i++) {
    if (v >= FAVOR_THRESHOLDS[i]) level = i + 1
  }
  return { level, name: FAVOR_LEVEL_NAMES[level - 1] }
}

/**
 * 成长值结算（specs/pet-values R1 的"连续运行满一小时 +1"与"重开按离线时长补算"）。
 *
 * 纯函数：不读时钟（`now` 由调用方给）、不改入参、不碰 api；返回 `{ state, hours }`。
 *
 * 口径（逐条对应验收）：
 * - **按整小时发放**：`hours = floor((now - lastGrowthAt) / 3_600_000)`，每整小时 +`GROWTH_PER_HOUR`；
 *   不足一小时时 `lastGrowthAt` **保持原值**（零头接着攒，下一次结算继续算）。
 * - **发放后基准推进"整小时"而不是直接跳到 now**：`lastGrowthAt += hours * 3_600_000`，
 *   这样 1.9 小时的结算不会把剩余 0.9 小时丢掉（进程内 tick 结算时精度最好）。
 * - **单次补算上限 `GROWTH_BACKFILL_CAP_HOURS`（24 小时）**：超出时**只发 24 点并把基准直接推到 now**
 *   （spec R1「本次启动后的计时从当前时刻重新开始」）——这是防"改系统时钟刷值"的口子，
 *   剩下的零头**故意丢弃**（宁可少发，不可被刷）。
 * - **时间回拨**（`now < lastGrowthAt`，系统改时间/夏令时）：本次**不发放**，把基准重置为 now
 *   （否则负数小时会算出负成长，或让成长永久停摆）；入口据 `hours===0` 之外的变化自行决定是否 warn
 *   ——回拨的告警文本在 `settle()` 里统一发（`WARN.clockRewind`）。
 * - **非法 `lastGrowthAt`**（非有限数/负数）：按 0 处理 ⇒ 视为"很久以前" ⇒ 本次最多补 24 点
 *   （与任务卡负向自检"`lastGrowthAt:'x'` ⇒ 归一为 0 / 视为已到期"一致，且**不阻止启动**）；
 *   **字段缺失**（`undefined`）则相反：按 now 处理（从这一刻开始计时，绝不凭空补 24 点）——
 *   `persist.sanitizeState` 对缺失也是置 now，两边口径一致。
 *
 * 调用方（`settle.js`）负责"关窗不计成长"的门控：只有 `overlayExists === true` 时才调本函数，
 * 隐藏期间它把基准推到 now（见 `settle` 的注释），所以这里不需要知道窗体在不在。
 */
export function accrueGrowth(state, now) {
  const src = state && typeof state === 'object' ? state : {}
  const t = finiteOr(now, 0)
  // 缺失 ⇒ 从现在开始（不补历史）；非法/负数 ⇒ 0（视为已到期，最多补到上限）
  const last = src.lastGrowthAt === undefined ? t : Math.max(0, finiteOr(src.lastGrowthAt, 0))
  const growth = toNonNegInt(src.growth)

  // 回拨：不发放，基准重置到 now（不产生负成长，也不让后续结算永远算 0 小时）
  if (t < last) {
    return { state: { ...src, growth, lastGrowthAt: t }, hours: 0 }
  }

  const fullHours = Math.floor((t - last) / HOUR_MS)
  const hours = Math.min(fullHours, GROWTH_BACKFILL_CAP_HOURS)
  if (hours <= 0) {
    // 未满整小时：基准**不动**（零头跨 tick 继续攒），只保证 growth 形状合法
    return { state: { ...src, growth, lastGrowthAt: last }, hours: 0 }
  }

  return {
    state: {
      ...src,
      growth: growth + hours * GROWTH_PER_HOUR,
      // 被上限截断 ⇒ 基准直接推到 now（丢掉零头，防刷）；否则只推进已发放的整小时
      lastGrowthAt: fullHours > GROWTH_BACKFILL_CAP_HOURS ? t : last + hours * HOUR_MS
    },
    hours
  }
}

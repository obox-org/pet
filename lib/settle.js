/**
 * 惰性结算（design D-5 的七步；specs/pet-vitals + pet-economy + pet-growth 的公共时钟）。
 *
 * 纯函数：settle(state, now, opts) 不修改入参、不读时钟（now 由调用方给）、不碰 api，
 * 返回 { state, warnings, changed }。tick 只负责"到点触发一次结算 + 唤醒订阅"（D-5），
 * 系统休眠/主线程卡顿期间的时间差在下次 tick 一次性补算且**只补一次**
 * （幂等：补算后立即推进 lastSettledAt，再对同一 now 结算 changed=false）。
 */
import {
  AFK_PERIOD_SEC,
  DECAY_PER_SEC,
  INITIAL_BUBBLE,
  INITIAL_FISH,
  INITIAL_VITALS,
  WARN
} from './constants.js'
import { growthDelta } from './growth.js'
import { grantAfkOnce } from './items.js'
import { clamp, decayVital, finiteOr, ledgerDrop, sanitizeVital } from './vitals.js'

/**
 * 初始状态（specs/pet-vitals 空态：三属性 100、成长 0、库存 3/3；D-8）。
 * transient/speech 是运行时字段（瞬时动画、气泡），不落盘、重启即清。
 * `transientSelf`（卡 19 · 热修 D-1）同样只是运行时字段：`transient` 里那一轮**来源**是
 * 入口自发的随机表演（true）还是真实互动（false）。它必须与 `transient` 同生共死，
 * 且**不落盘**——重启后 transient 本来就是 null，来源标记自然也无意义（见 persist.js 白名单）。
 * 卡 18（Q16）：卡 15 的 `trotUntil` 随"2–5 分钟小跑定时器"一并退役——随机表演写进 `transient`。
 * lastPetAt=0 ⇒ 首次点击必然计分（now - 0 ≥ 冷却）。
 * position=null（卡 15）：首次安装没有自记位置 ⇒ 窗体停在 `anchor:'bottom-right'` 的默认位
 * （绝对坐标由宿主定，D-13）。卡 17（Q15=B）：状态里**不再有** `hidden`——隐藏功能整条撤销，
 * "隐藏"只由设置页 toggle 承担（= 销毁窗体省 CPU）。
 */
export function initialState(now) {
  const t = finiteOr(now, 0)
  return {
    hunger: INITIAL_VITALS.hunger,
    clean: INITIAL_VITALS.clean,
    mood: INITIAL_VITALS.mood,
    fish: INITIAL_FISH,
    bubble: INITIAL_BUBBLE,
    growth: 0,
    hungerDropAcc: 0,
    cleanDropAcc: 0,
    recoverAcc: 0,
    afkAcc: 0,
    lastSettledAt: t,
    lastPetAt: 0,
    lastInteractAt: t,
    position: null,
    transient: null,
    transientSelf: false,
    speech: null
  }
}

/**
 * 启动重置（design D-5"启动"：读档后把 lastSettledAt 重置为 now，**不追算离线**，grill Q4）。
 * lastInteractAt 一并重置：离线期间"无交互"不计入入睡判定（与"仅计运行期间"同一口径，已记录在回执）。
 */
export function startupReset(state, now) {
  return { ...state, lastSettledAt: now, lastInteractAt: now }
}

/**
 * 结算一次。opts.overlayExists 必须**显式为 true** 才累计挂机（默认 false）：
 * 挂机产出"仅当 overlay 存在时累计"（任务卡口径 + specs/pet-economy 关窗暂停挂机），
 * 默认 false 让"忘了传"退化为不发道具（少发可恢复，多发不可回收）。
 *
 * 步骤严格照 D-5 的顺序：① dt（回拨钳 0 + warn + 重置）→ ② 三属性衰减 →
 * ③ 联动记账（净下降 ⇒ 心情 -1/10 点）→ ④ 挂机发放 → ⑤ 成长（用②③落定后的心情）→
 * ⑥ 钳 [0,100] → ⑦（写盘/rev/唤醒/设置同步在入口做，不属于纯函数）。
 */
export function settle(state, now, opts = {}) {
  const overlayExists = opts.overlayExists === true
  const warnings = []

  const last = finiteOr(state.lastSettledAt, now)
  let dtMs = finiteOr(now, last) - last
  if (dtMs < 0) {
    // 时间回拨/夏令时 ⇒ dt 钳 0、重置基准、warn（D-5 第 1 步；R4 风险的正解）
    warnings.push(WARN.clockRewind)
    dtMs = 0
  }
  const dt = dtMs / 1000

  const next = { ...state, lastSettledAt: finiteOr(now, last) }
  if (dt > 0) {
    // ② 三属性衰减（浮点累计；显示取整归页面/宿主）
    const h = decayVital(state.hunger, DECAY_PER_SEC.hunger, dt)
    const c = decayVital(state.clean, DECAY_PER_SEC.clean, dt)
    const moodDecayed = clamp(sanitizeVital(state.mood, INITIAL_VITALS.mood) - DECAY_PER_SEC.mood * dt, 0, 100)

    // ③ 联动记账：饥饿/清洁的净下降各自记账，每满 10 点 ⇒ 心情 -1（零头保留、跨周期连续）
    const hungerLedger = ledgerDrop(state.hungerDropAcc, h.dropped, moodDecayed)
    const cleanLedger = ledgerDrop(state.cleanDropAcc, c.dropped, hungerLedger.mood)

    next.hunger = h.next
    next.clean = c.next
    next.mood = cleanLedger.mood
    next.hungerDropAcc = hungerLedger.acc
    next.cleanDropAcc = cleanLedger.acc

    // ④ 挂机：仅当 overlay 存在时累计；每满 1200s 发 1 鱼干 + 1 泡泡（各钳 20）
    if (overlayExists) {
      let acc = Math.max(0, finiteOr(state.afkAcc, 0)) + dt
      let fish = next.fish
      let bubble = next.bubble
      while (acc >= AFK_PERIOD_SEC) {
        acc -= AFK_PERIOD_SEC
        const granted = grantAfkOnce(fish, bubble)
        fish = granted.fish
        bubble = granted.bubble
      }
      next.afkAcc = acc
      next.fish = fish
      next.bubble = bubble
    }

    // ⑤ 成长：max(0, 2 - 0.1*floor((100-mood)/5))/小时 × dt（mood 取②③落定后的值，D-5 步骤顺序）
    next.growth = Math.max(0, finiteOr(state.growth, 0) + growthDelta(next.mood, dt))
  }

  // ⑥ 终钳（防御：联动扣分可能把心情压到 0 以下）
  next.mood = clamp(next.mood, 0, 100)

  const changed =
    dt > 0 &&
    (next.hunger !== state.hunger ||
      next.clean !== state.clean ||
      next.mood !== state.mood ||
      next.fish !== state.fish ||
      next.bubble !== state.bubble ||
      next.growth !== state.growth)

  return { state: next, warnings, changed }
}

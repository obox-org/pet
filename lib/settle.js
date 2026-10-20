/**
 * 结算（specs/pet-values R1"成长值"；specs/pet-economy"挂机奖励"；design D-1 / D-3）。
 *
 * 纯函数：不读时钟（`now` 由调用方给）、不改入参、不碰 api；返回 `{ state, warnings, changed }`。
 * v1 的"dt 累加式衰减 + 少量联动记账 + 心情上限/终钳"整体退役（三属性被删除，
 * specs/pet-vitals 的 4 条 REMOVED），现在只剩两件事按**时间戳差**结算，
 * 用差值而不是累加 ⇒ 天然幂等：漏 tick 不丢、同一 now 重复调用不多发。
 *
 * 1. **成长值**：每满 1 小时 +1（`lib/growth.js` 的 `accrueGrowth`，单次补算 ≤ 24 小时）；
 * 2. **挂机奖励**：每满 1200 秒鱼干 +1、泡泡 +1（各钳 20），基准是 `lastAfkAt`。
 *
 * ## 🚩 两个门控（本卡的硬口径，卡 4 接线时必须照做）
 *
 * **成长与挂机都只在浮层窗体存在时累计**（`opts.overlayExists === true`）：
 * - specs/pet-values R1：「关闭「显示宠物」期间 MUST NOT 计入成长」；
 * - specs/pet-economy：「关窗暂停挂机」。
 *
 * 窗体不在时这两个基准都被**推到 now**（不是"什么都不做"）——否则关三小时再开会一次补算三小时，
 * 正好违反 R1 的 scenario「关闭显示期间不涨」。因此入口的 `pet-tick` 必须继续传
 * `{ overlayExists: overlayAlive }`（v1 的 `onTick` 已经这么写）：**漏传的默认值是 false**，
 * 语义是"宁可今天不涨，也不误发"。
 *
 * 隐藏期间 tick 仍在跑（v1 的 `api.timer` 是进程级定时器，销毁窗体时**只清 transient 到期定时器**），
 * 所以每 60 秒都会把基准推到当时 ⇒ 重开时最多只可能补算"最后一次 tick 到现在"的零头；
 * 若入口在销毁窗体时把定时器一起停掉，则必须调 `onWindowDestroyed` 并**立刻写盘**兜底。
 */
import { AFK_PERIOD_SEC, INITIAL_BUBBLE, INITIAL_FISH, ITEM_CAP, WARN } from './constants.js'
import { accrueGrowth, finiteOr, toNonNegInt } from './growth.js'
import { grantAfkOnce } from './items.js'

/** 一个挂机周期的毫秒数（`AFK_PERIOD_SEC` 是秒，api.timer 口径；这里换算成时间戳差） */
const AFK_PERIOD_MS = AFK_PERIOD_SEC * 1000

/**
 * 初始状态（specs/pet-values R3"D-9 空态"；design D-1 字段表）。
 *
 * `favor = 0`（第 1 级「初次见面」）、`growth = 0`、道具 3/3（首玩不必等满一个挂机周期）。
 * 时间戳分两类，**故意不一样**：
 * - **累积基准**（`lastGrowthAt` / `lastAfkAt` / `lastTextAt`）= `now`：首装从这一刻开始计时，
 *   不会凭空补算"宇宙诞生以来"的小时数；
 * - **冷却基准**（`lastInteractAt` / `lastPetAt`）= `0`：0 是"已到期"的哨兵值（design D-4
 *   "时间戳缺失/非法 ⇒ 一律视为已到期，宁可给用户互动，也不要永久卡死"）。
 *   若这里也取 now，首次安装要等满 10 分钟才能喂食、等满 1 小时才能摸头——与本卡的
 *   空态（D-9：「无存档 = 首次安装，favor 0、growth 0、道具 3/3」）直接矛盾（卡 1 回执已声明该口径）。
 *
 * 运行时字段 `transient` / `transientSelf` / `speech` 不落盘、重启即清（见 `persist.js` 白名单）。
 * `position = null`：首次安装没有自记位置 ⇒ 窗体停在 `anchor:'bottom-right'` 的默认位（D-13）。
 */
export function initialState(now) {
  const t = finiteOr(now, 0)
  return {
    growth: 0,
    favor: 0,
    fish: INITIAL_FISH,
    bubble: INITIAL_BUBBLE,
    lastInteractAt: 0,
    lastPetAt: 0,
    lastGrowthAt: t,
    lastAfkAt: t,
    lastTextAt: t,
    diagnostic: '',
    position: null,
    transient: null,
    transientSelf: false,
    speech: null
  }
}

/**
 * 启动归一（**不是**"重置结算基准"，这一点与 v1 相反）。
 *
 * v1 的 `startupReset` 把 `lastSettledAt` 重置为 now（"关闭三天不追算"）；v2 里
 * specs/pet-values R1 **要求**重开时按存档里的 `lastGrowthAt` 补算（N ≤ 24 小时），
 * 所以这里**绝不能**碰它，否则"重开补算"这条 scenario 永远不会发生。
 *
 * 它只做三件"让运行时干净"的事：
 * 1. 清掉运行时字段（`transient` / `transientSelf` / `speech`）——读档后它们本来就该是空的；
 * 2. 把**非法或落在未来**的累积基准拉回 now（时钟被拨快/夏令时 ⇒ 不让结算永久算 0 小时）；
 * 3. 把 `growth` / `favor` 归一为非负整数（防御手工改坏的存档）。
 *
 * 时间戳的完整清洗在 `persist.sanitizeState`（含"缺失 ⇒ now"的迁移口径）；本函数只做入口兜底。
 */
export function startupReset(state, now) {
  const src = state && typeof state === 'object' ? state : {}
  const t = finiteOr(now, 0)
  /** 累积基准兜底：非有限数/负数/未来 ⇒ now；0 视为"很久以前"（合法的补算基准，保留） */
  const baseline = (value) => {
    const n = finiteOr(value, t)
    return n < 0 || n > t ? t : n
  }
  return {
    ...src,
    growth: toNonNegInt(src.growth),
    favor: toNonNegInt(src.favor),
    lastGrowthAt: baseline(src.lastGrowthAt),
    lastAfkAt: baseline(src.lastAfkAt),
    lastTextAt: baseline(src.lastTextAt),
    transient: null,
    transientSelf: false,
    speech: null
  }
}

/**
 * 销毁浮层窗口时调用（specs/pet-values R1「关闭显示期间不涨」+ design D-3 的两条硬细节）。
 *
 * 把两个**累积基准**都推到 now，等于宣布"关窗这段时间不计成长、也不发挂机奖励"：
 * - `lastGrowthAt`：任务卡口径 4 的强制要求（销毁路径必须推进，否则重开就会补算关窗时长）；
 * - `lastAfkAt`：同款理由（specs/pet-economy 关窗暂停挂机；不推的话重开会一次性补发关窗期间的
 *   鱼干/泡泡，等于"关着窗也在挂机"）。
 *
 * 入口在 destroy 之后**必须立刻写盘**（`persistState`），否则进程退出后基准还停在关窗前，
 * 下次启动仍会把关窗时长算进补算里。
 */
export function onWindowDestroyed(state, now) {
  const src = state && typeof state === 'object' ? state : {}
  const t = finiteOr(now, 0)
  return { ...src, lastGrowthAt: t, lastAfkAt: t }
}

/**
 * 结算一次（`pet-tick` 每 60 秒调一次，design D-3）。
 *
 * 顺序：回拨兜底 → ① 成长 → ② 挂机奖励。「回拨」判据是**任一累积基准落在未来**：
 * 本次不发放、把基准重置为 now、发一条 `WARN.clockRewind` 让入口打日志（D-4 回拨条）。
 * `changed` 只反映**用户可见数值**（growth/favor/fish/bubble）的变化，
 * 时间戳推进不算"变了"——否则隐藏期间每个 tick 都会 rev++ 并触发一次写盘。
 */
export function settle(state, now, opts = {}) {
  const src = state && typeof state === 'object' ? state : {}
  const t = finiteOr(now, 0)
  const overlayExists = opts.overlayExists === true
  const warnings = []

  let next = { ...src }

  // ⓪ 回拨兜底：基准在"未来" ⇒ 本次不结算，两个基准都重置到 now
  const rewound = finiteOr(next.lastGrowthAt, 0) > t || finiteOr(next.lastAfkAt, 0) > t
  if (rewound) {
    warnings.push(WARN.clockRewind)
    next.lastGrowthAt = t
    next.lastAfkAt = t
  }

  // ① 成长值：每满 1 小时 +1（单次补算上限 24 小时）；窗体不在 ⇒ 基准跟走，不累积也不补算
  if (overlayExists) {
    next = accrueGrowth(next, t).state
  } else {
    next.lastGrowthAt = t
  }

  // ② 挂机奖励：每满 1200 秒各 +1（各自独立钳 20）；窗体不在 ⇒ 基准跟走（关窗暂停挂机）
  if (overlayExists) {
    const lastAfk = Math.max(0, finiteOr(next.lastAfkAt, t))
    const periods = Math.floor(Math.max(0, t - lastAfk) / AFK_PERIOD_MS)
    if (periods > 0) {
      let fish = toNonNegInt(next.fish)
      let bubble = toNonNegInt(next.bubble)
      for (let i = 0; i < periods; i++) {
        const granted = grantAfkOnce(fish, bubble)
        fish = granted.fish
        bubble = granted.bubble
        // 双顶后继续发也不会变（且周期照常被消耗、不囤积）⇒ 直接跳出，避免长时间挂机后的空转大循环
        if (fish >= ITEM_CAP && bubble >= ITEM_CAP) break
      }
      next.fish = fish
      next.bubble = bubble
      // 只推进"已发放的整周期"，零头留在基准里（与成长值的整小时口径一致）
      next.lastAfkAt = lastAfk + periods * AFK_PERIOD_MS
    }
  } else {
    next.lastAfkAt = t
  }

  const changed =
    next.growth !== src.growth ||
    next.favor !== src.favor ||
    next.fish !== src.fish ||
    next.bubble !== src.bubble

  return { state: next, warnings, changed }
}

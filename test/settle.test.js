/**
 * settle · **v2** 结算语义（specs/pet-values R1「成长值」、specs/pet-economy「挂机奖励」；
 * design D-1 字段表 / D-3 定时器表 / D-4 回拨条）。
 *
 * ⚠️ 本文件是 v1 `pet-vitals` 用例（三属性速率/下限钳制/联动记账/`ledgerRecover`/
 * `lastSettledAt` 启动重置）的**改写**，不是简单删断言：那些断言所指向的能力已随
 * `specs/pet-vitals` 的 4 条 REMOVED 整体删除（衰减、联动、属性上限），而 v2 的 `settle()`
 * 仍有它自己的语义需要钉住——用**时间戳差**结算的成长值与挂机奖励。
 *
 * 覆盖（逐条对应 v2 的 spec 与 design）：
 * - 成长值：不足一小时不动、满一小时 +1、基准推进整小时（零头不丢）、单次补算上限 24 小时；
 * - 挂机奖励：每满 1200 秒鱼干/泡泡各 +1、各自独立钳 20、跨结算周期连续；
 * - 窗体门控：`overlayExists !== true` ⇒ 不涨且基准跟走到 now（关窗不计成长、不发挂机）；
 * - `changed` 只反映用户可见数值（时间戳推进不算"变了"，否则每个 tick 都会 rev++ 并写盘）；
 * - 时间回拨：任一累积基准落在未来 ⇒ 本次不结算、发一条 `WARN.clockRewind`、基准重置为 now；
 * - 幂等（同一 now 重复结算不多发）与脏输入（非对象状态/NaN now/畸形基准不抛错、无 NaN）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AFK_PERIOD_SEC,
  GROWTH_BACKFILL_CAP_HOURS,
  GROWTH_PER_HOUR,
  INITIAL_BUBBLE,
  INITIAL_FISH,
  ITEM_CAP,
  WARN
} from '../lib/constants.js'
import { initialState, onWindowDestroyed, settle, startupReset } from '../lib/settle.js'

/** 固定基准时刻：纯函数不读时钟，全部用可控的绝对毫秒 */
const T0 = 1_700_000_000_000
const HOUR = 3_600_000
/** 一个挂机周期的毫秒数 */
const AFK = AFK_PERIOD_SEC * 1000

function st(overrides = {}) {
  return { ...initialState(T0), ...overrides }
}

// ————— 成长值：整小时发放 —————

test('settle · 成长值：不足一小时不动，满一小时 +1，且基准只推进已发放的整小时', () => {
  // 取 10 分钟（< 1 小时，也 < 挂机周期 1200s）⇒ 两个来源都不发放，changed 为 false
  const half = settle(st(), T0 + 600_000, { overlayExists: true })
  assert.equal(half.state.growth, 0, '未满一小时不涨')
  assert.equal(half.state.lastGrowthAt, T0, '基准不动（零头跨 tick 继续攒）')
  assert.equal(half.changed, false, '没有可见变化 ⇒ changed=false（不触发 rev++/写盘）')

  const one = settle(st(), T0 + HOUR, { overlayExists: true })
  assert.equal(one.state.growth, GROWTH_PER_HOUR, '满一小时恰好 +1')
  assert.equal(one.state.lastGrowthAt, T0 + HOUR, '基准推进到整小时')
  assert.equal(one.changed, true, '成长值变了 ⇒ changed=true')

  // 1.9 小时：只发 1 点，基准停在 T0+1h（剩余 0.9 小时留给下一次结算）
  const late = settle(st(), T0 + HOUR * 1.9, { overlayExists: true })
  assert.equal(late.state.growth, 1, '只发已满的整小时')
  assert.equal(late.state.lastGrowthAt, T0 + HOUR, '零头不丢')
  assert.equal(settle(late.state, T0 + HOUR * 2, { overlayExists: true }).state.growth, 2)
})

test('settle · 成长值：连续运行三小时 +3（每小时一个来源，不叠加互动点）', () => {
  const r = settle(st(), T0 + HOUR * 3, { overlayExists: true })
  assert.equal(r.state.growth, 3 * GROWTH_PER_HOUR)
  assert.equal(r.state.favor, 0, '时间流逝不涨好感（好感只来自互动）')
})

test('settle · 成长值：单次补算上限 24 小时，且基准直接推到当前时刻（防改时钟刷值）', () => {
  const r = settle(st({ lastGrowthAt: T0 - HOUR * 48 }), T0, { overlayExists: true })
  assert.equal(r.state.growth, GROWTH_BACKFILL_CAP_HOURS, `补算上限 ${GROWTH_BACKFILL_CAP_HOURS} 小时`)
  assert.equal(r.state.lastGrowthAt, T0, '被上限截断 ⇒ 基准推到 now（丢掉零头）')
})

// ————— 窗体门控：关窗不计成长、不发挂机 —————

test('settle · 窗体不在：成长与挂机都不发放，基准跟走到 now（关窗三小时再开不补算）', () => {
  const off = settle(st(), T0 + HOUR * 3, { overlayExists: false })
  assert.equal(off.state.growth, 0, '关窗期间 MUST NOT 计入成长')
  assert.equal(off.state.fish, INITIAL_FISH, '关窗期间不挂机')
  assert.equal(off.state.bubble, INITIAL_BUBBLE)
  assert.equal(off.state.lastGrowthAt, T0 + HOUR * 3, '基准跟走到 now')
  assert.equal(off.state.lastAfkAt, T0 + HOUR * 3, '挂机基准同样跟走')

  // 默认值（不显式声明 overlayExists）语义 = 窗体不在：宁可今天不涨，也不误发
  const dflt = settle(st(), T0 + HOUR)
  assert.equal(dflt.state.growth, 0)
  assert.equal(dflt.state.fish, INITIAL_FISH)

  // 重新开窗后从那一刻重新计时：再满一小时才 +1
  const reopened = settle(off.state, T0 + HOUR * 4, { overlayExists: true })
  assert.equal(reopened.state.growth, 1, '重开后满一小时 +1（不是 +4）')
})

test('settle · 销毁窗体时把两个累积基准推到当时（onWindowDestroyed 的唯一职责）', () => {
  const closed = onWindowDestroyed(st({ growth: 5 }), T0 + 12_345)
  assert.equal(closed.lastGrowthAt, T0 + 12_345)
  assert.equal(closed.lastAfkAt, T0 + 12_345)
  assert.equal(closed.growth, 5, '数值本身不动（只是宣布"关窗期间不计时"）')
  // startupReset **不**重置累积基准（v2 要求重开按存档补算，与 v1 相反）
  assert.equal(startupReset({ ...closed, lastGrowthAt: T0 }, T0 + 999).lastGrowthAt, T0)
})

// ————— 挂机奖励：1200 秒周期 —————

test('settle · 挂机奖励：满一个周期各 +1；未满周期不发；跨结算周期连续累计', () => {
  const first = settle(st(), T0 + AFK - 1, { overlayExists: true })
  assert.equal(first.state.fish, INITIAL_FISH, '差 1ms 不发')
  assert.equal(first.state.lastAfkAt, T0, '基准不动（零头保留）')

  const second = settle(first.state, T0 + AFK, { overlayExists: true })
  assert.equal(second.state.fish, INITIAL_FISH + 1)
  assert.equal(second.state.bubble, INITIAL_BUBBLE + 1)
  assert.equal(second.state.lastAfkAt, T0 + AFK, '只推进已发放的整周期')

  const twoPeriods = settle(st(), T0 + AFK * 2, { overlayExists: true })
  assert.equal(twoPeriods.state.fish, INITIAL_FISH + 2, '两个整周期发两次')
})

test('settle · 挂机奖励：各自独立钳 20（鱼干到顶泡泡照常），周期照常被消耗不囤积', () => {
  const r = settle(st({ fish: ITEM_CAP, bubble: 19 }), T0 + AFK, { overlayExists: true })
  assert.equal(r.state.fish, ITEM_CAP, '到顶不再加')
  assert.equal(r.state.bubble, 20, '未满的照常 +1')

  // 两个整周期（2400s < 3600s，避开成长值的那一小时）⇒ 双满后没有可见变化
  const both = settle(st({ fish: ITEM_CAP, bubble: ITEM_CAP }), T0 + AFK * 2, { overlayExists: true })
  assert.equal(both.state.fish, ITEM_CAP)
  assert.equal(both.state.bubble, ITEM_CAP)
  assert.equal(both.state.lastAfkAt, T0 + AFK * 2, '双满后周期照常被消耗（不囤积）')
  assert.equal(both.changed, false, '双满后没有可见变化')
})

// ————— changed 口径 / 幂等 / 回拨 / 脏输入 —————

test('settle · changed 只反映可见数值：只有时间戳推进时为 false（否则每个 tick 都会写盘）', () => {
  const s = st({ lastAfkAt: T0 + 1 }) // 基准已推进，但没有任何发放
  const r = settle(s, T0 + AFK / 2, { overlayExists: true })
  assert.equal(r.state.lastAfkAt, s.lastAfkAt, '未满周期 ⇒ 基准不动')
  assert.equal(r.changed, false)
  assert.equal(r.warnings.length, 0)
})

test('settle · 幂等：同一个 now 重复结算不多发（用时间戳差而不是累加，天然幂等）', () => {
  const at = T0 + HOUR * 2 + AFK
  const once = settle(st(), at, { overlayExists: true })
  const twice = settle(once.state, at, { overlayExists: true })
  assert.equal(twice.state.growth, once.state.growth)
  assert.equal(twice.state.fish, once.state.fish)
  assert.equal(twice.state.bubble, once.state.bubble)
  assert.equal(twice.changed, false, '第二次无可见变化')
})

test('settle · 时间回拨：累积基准落在未来 ⇒ 本次不结算、发一条告警、基准重置为 now', () => {
  // 两个基准都被人为放到"未来"（改系统时钟 / 夏令时回拨的等价输入）
  const s = st({ lastGrowthAt: T0 + HOUR, lastAfkAt: T0 + HOUR, growth: 7, fish: 5 })
  const r = settle(s, T0, { overlayExists: true })
  assert.deepEqual(r.warnings, [WARN.clockRewind], '恰好一条回拨告警（入口打 [pet] warn）')
  assert.match(r.warnings[0], /时间回拨/)
  assert.equal(r.state.growth, 7, '回拨不发放、也不产生负成长')
  assert.equal(r.state.fish, 5, '不发放挂机奖励')
  assert.equal(r.state.lastGrowthAt, T0, '基准重置为 now')
  assert.equal(r.state.lastAfkAt, T0)
  assert.equal(r.changed, false, '没有任何可见数值被改动')

  // 反向自检：回拨修复后，下一次正常结算照常发放（不是"永久停摆"）
  const next = settle(r.state, T0 + HOUR, { overlayExists: true })
  assert.equal(next.state.growth, 8)
})

test('settle · 脏输入：非对象状态 / NaN now / 畸形基准都不抛错，且结果里没有 NaN', () => {
  for (const bad of [null, undefined, 42, 'state', []]) {
    const r = settle(bad, T0, { overlayExists: true })
    assert.equal(typeof r.state, 'object')
    assert.ok(Number.isFinite(r.state.growth), `state=${String(bad)} ⇒ growth 有限`)
    assert.ok(Number.isFinite(r.state.lastGrowthAt), `state=${String(bad)} ⇒ 基准有限（不产生 NaN）`)
  }
  const nanNow = settle(st(), Number.NaN, { overlayExists: true })
  assert.ok(Number.isFinite(nanNow.state.lastGrowthAt), 'now 非法 ⇒ 基准归一为 0，不出 NaN')
  assert.ok(Number.isFinite(nanNow.state.growth))

  // 畸形基准：负数的 lastGrowthAt 视为"很久以前" ⇒ 最多补到上限（与 lib/growth.js 注释同口径）
  const dirty = settle(st({ lastGrowthAt: 'x' }), T0, { overlayExists: true })
  assert.equal(dirty.state.growth, GROWTH_BACKFILL_CAP_HOURS, "lastGrowthAt:'x' ⇒ 归一 0 ⇒ 视为已到期")
  assert.ok(Number.isFinite(dirty.state.lastGrowthAt))
})

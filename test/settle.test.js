/**
 * pet-vitals · 惰性结算纯函数测试（specs/pet-vitals 的衰减/钳制/联动/补算/回拨 scenario）。
 *
 * 对应任务卡验收清单：运行满一分钟饥饿 -1；下限钳 0；饥饿自 80→70 心情 -1 且不重复计分；
 * 心情已 95 时恢复途径不再加；休眠 10 分钟恢复后只补算一次；关闭 3 天重启不追算；时间回拨钳 0。
 * （存档 schemaVersion / 备份重建的 scenario 在 persist.test.js；"正常恢复且不追算离线"两档都有。）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { initialState, settle, startupReset } from '../lib/settle.js'
import { ledgerRecover } from '../lib/vitals.js'

/** 固定基准时刻：纯函数不读时钟，全部用可控的绝对毫秒 */
const T0 = 1_700_000_000_000

function st(overrides = {}) {
  return { ...initialState(T0), ...overrides }
}

/** 浮点断言：衰减速率是 1/60、10/3600 这类二进制不精确值，比较用容差而不是全等 */
function close(actual, expected, what = '') {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what} 期望 ≈${expected}，实际 ${actual}`)
}

test('pet-vitals · 运行满一分钟：饥饿 -1，清洁/心情按各自速率同比变化（清洁 ≈ -0.1667/分钟）', () => {
  const r = settle(st(), T0 + 60_000, { overlayExists: true })
  close(r.state.hunger, 99, 'hunger') // -1/分钟 × 1 分钟
  close(r.state.clean, 100 - 10 / 60, 'clean') // -10/小时 ≈ -0.1667/分钟
  close(r.state.mood, 100 - (5 / 3600) * 60, 'mood') // -5/小时 ≈ -0.0833/分钟
  assert.equal(r.changed, true)
})

test('pet-vitals · 下限钳制：属性已为 0 继续结算保持 0，不出现负数', () => {
  const r = settle(st({ hunger: 0, clean: 0, mood: 0 }), T0 + 3600_000, { overlayExists: false })
  assert.equal(r.state.hunger, 0)
  assert.equal(r.state.clean, 0)
  assert.equal(r.state.mood, 0)
  // 全饱和且无产出 ⇒ 无可见变化（入口据此跳过唤醒/写盘）
  assert.equal(r.changed, false)
})

test('pet-vitals · 饥饿联动扣分：饥饿自 80 累计降到 70 ⇒ 心情 -1，且该 10 点不重复计分', () => {
  // 第一段：601s ⇒ 饥饿净降 10.0167 ⇒ 触发一次 -1，零头 0.0167 留账
  const r1 = settle(st({ hunger: 80, mood: 100, clean: 100 }), T0 + 601_000, { overlayExists: false })
  close(r1.state.hunger, 80 - 601 / 60, 'hunger')
  close(r1.state.mood, 100 - (5 / 3600) * 601 - 1, 'mood（自然衰减 -5/h 再联动 -1）')
  assert.ok(r1.state.hungerDropAcc > 0 && r1.state.hungerDropAcc < 10, '零头保留在账上')

  // 第二段：再 590s（累计净降 19.85 < 20）⇒ 不再触发第二次扣分（"不重复计分"）
  const r2 = settle(r1.state, T0 + 601_000 + 590_000, { overlayExists: false })
  const natural = (5 / 3600) * 590 // 这一段只应扣自然衰减
  close(r2.state.mood, r1.state.mood - natural, 'mood（第二段无联动扣分）')
  close(r2.state.hungerDropAcc, r1.state.hungerDropAcc + 590 / 60, '账本零头跨周期连续')
})

test('pet-vitals · 联动零头跨结算周期连续：5 点 + 5 点 = 满 10 才触发一次心情 -1', () => {
  const r1 = settle(st({ hunger: 100 }), T0 + 300_000, { overlayExists: false }) // 降 5 点
  close(r1.state.hungerDropAcc, 5, '第一段账本')
  close(r1.state.mood, 100 - (5 / 3600) * 300, '第一段心情（只有自然衰减）')

  const r2 = settle(r1.state, T0 + 600_000, { overlayExists: false }) // 再降 5 点 ⇒ 满 10
  close(r2.state.hungerDropAcc, 0, '触发后扣掉 10')
  close(r2.state.mood, r1.state.mood - (5 / 3600) * 300 - 1, '第二段心情（自然衰减 + 联动 -1）')
})

test('pet-vitals · 清洁联动同样记账：清洁每累计下降 10 点 ⇒ 心情 -1', () => {
  // 预置账上 9 点，再让清洁净降 1 点（360s × 10/小时）⇒ 恰好满 10 触发一次；
  // 时长选 360s 是为了把饥饿的净降压在 10 点以下（6 点），隔离出清洁联动这一条路径
  const r = settle(st({ clean: 50, cleanDropAcc: 9 }), T0 + 360_000, { overlayExists: false })
  close(r.state.clean, 50 - 1, 'clean 净降 1')
  close(r.state.cleanDropAcc, 0, '触发后扣掉 10')
  close(r.state.mood, 100 - (5 / 3600) * 360 - 1, 'mood（自然衰减 -0.5 再联动 -1）')
  close(r.state.hungerDropAcc, 6, '饥饿账本只有 6 点，未触发（联动互不串账）')
})

test('pet-vitals · 恢复联动不超 95：心情已 95 且恢复满 10 点 ⇒ 保持 95（不推到 96 及以上）', () => {
  const r = ledgerRecover(0, 10, 95)
  assert.equal(r.mood, 95)
  assert.equal(r.acc, 0, '点数照常消耗（触发过就不留账）')

  // 心情高于 95（玩耍途径可达 100）：恢复联动**不加也不倒扣**（口径见 lib/vitals.js 注释）
  const r2 = ledgerRecover(0, 10, 98)
  assert.equal(r2.mood, 98)

  // 95 以下正常 +1，且被 95 封顶：94.5 → min(95.5, 95) = 95
  const r3 = ledgerRecover(0, 10, 94.5)
  assert.equal(r3.mood, 95)
})

test('pet-vitals · 休眠后补算一次：10 分钟（含挂机收益）恰好补算一次，重复结算幂等', () => {
  // spec 场景是"休眠 10 分钟"；为同时覆盖"挂机收益只发一次"，用 20 分钟（1200s）档：
  const r1 = settle(st(), T0 + 1200_000, { overlayExists: true })
  close(r1.state.hunger, 100 - 20, 'hunger -20（-1/分钟 × 20 分钟）')
  assert.equal(r1.state.fish, 4, '挂机 20 分钟恰好发 1 条鱼干')
  assert.equal(r1.state.bubble, 4, '挂机 20 分钟恰好发 1 个泡泡')
  close(r1.state.afkAcc, 0, '挂机账扣掉一个周期')

  // 对同一 now 再结算 ⇒ 补算不重复（幂等：lastSettledAt 已推进）
  const r2 = settle(r1.state, T0 + 1200_000, { overlayExists: true })
  assert.equal(r2.changed, false)
  assert.equal(r2.state.fish, 4)
  assert.equal(r2.state.hunger, r1.state.hunger)
  assert.equal(r2.state.mood, r1.state.mood)
})

test('pet-vitals · 关闭三天不追算：startupReset 把 lastSettledAt 重置为当前时刻', () => {
  const threeDays = 3 * 86_400_000
  const saved = st({ hunger: 42, clean: 55, mood: 66, lastSettledAt: T0 - threeDays })
  const restarted = startupReset(saved, T0) // 启动：读档 ⇒ 重置（不追算离线，grill Q4）
  assert.equal(restarted.lastSettledAt, T0)

  const r = settle(restarted, T0 + 15_000, { overlayExists: true }) // 第一个 tick（15s）
  close(r.state.hunger, 42 - 0.25, 'hunger 只扣 15 秒，而不是 3 天')
  assert.ok(r.state.hunger > 40, '若追算离线 3 天，hunger 早就钳到 0 了')
  close(r.state.afkAcc, 15, '挂机也只从启动时刻累计')
})

test('pet-vitals · 时间回拨：settle(now=-1000) ⇒ dt 钳 0、无负衰减、warn 并重置基准', () => {
  const s = st({ hunger: 80, lastSettledAt: 5000 })
  const r = settle(s, -1000, { overlayExists: true }) // 任务卡负向自检的逐字输入
  assert.equal(r.state.hunger, 80, '无负衰减（属性不会因回拨反向增长）')
  assert.equal(r.state.mood, s.mood)
  assert.equal(r.state.fish, 3, '无负产出')
  assert.equal(r.state.afkAcc, 0, 'dt 钳 0 ⇒ 挂机不累计')
  assert.equal(r.state.lastSettledAt, -1000, '基准重置为 now')
  assert.equal(r.warnings.length, 1, '产生一条回拨告警（入口打 [pet] warn）')
  assert.match(r.warnings[0], /时间回拨/)
  assert.equal(r.changed, false)
})

test('pet-vitals · 脏输入不污染：mood 为 NaN/字符串/负数/超 100 ⇒ 钳制或回退，结果无 NaN', () => {
  const nan = settle(st({ mood: NaN }), T0 + 60_000, { overlayExists: false })
  assert.ok(Number.isFinite(nan.state.mood), 'NaN 回退初值后正常衰减')
  close(nan.state.mood, 100 - 5 / 60, 'NaN ⇒ 回退 100')

  const str = settle(st({ mood: '50' }), T0 + 60_000, { overlayExists: false })
  close(str.state.mood, 100 - 5 / 60, '数字字符串按拒绝处理 ⇒ 回退初值（口径见 lib/persist.js 头注释）')

  const neg = settle(st({ mood: -50 }), T0 + 60_000, { overlayExists: false })
  assert.equal(neg.state.mood, 0, '负数钳到 0')

  const over = settle(st({ mood: 150 }), T0 + 60_000, { overlayExists: false })
  close(over.state.mood, 100 - 5 / 60, '超 100 钳到 100')
})

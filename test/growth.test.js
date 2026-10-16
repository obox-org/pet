/**
 * pet-growth · 成长速率与等级（specs/pet-growth 全部 scenario + design D-5 第 5 步、D-7 等级表）。
 *
 * 对应任务卡验收清单：心情 100 一小时 +2；心情 80 一小时 +1.6；心情 0 一小时 +0（不为负）；
 * 悬停面板可见成长信息（入口侧 = PetStateView.growth 带数值 + rank + rankName）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { growthDelta, growthRatePerHour, rankOf } from '../lib/growth.js'
import { buildView } from '../lib/bridge.js'
import { initialState, settle } from '../lib/settle.js'

const T0 = 1_700_000_000_000
const HOUR = 3600

function close(actual, expected, what = '') {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what} 期望 ≈${expected}，实际 ${actual}`)
}

test('pet-growth · 满心情一小时：心情恒为 100 运行满 1 小时 ⇒ 成长 +2', () => {
  assert.equal(growthRatePerHour(100), 2)
  assert.equal(growthDelta(100, HOUR), 2)
})

test('pet-growth · 心情 80 一小时：缺 20 ⇒ 4 档 ⇒ 速率 1.6，成长 +1.6', () => {
  close(growthRatePerHour(80), 1.6, 'rate')
  close(growthDelta(80, HOUR), 1.6, 'delta')
})

test('pet-growth · 心情 0 不扣成负：速率被钳到 0，成长值不变', () => {
  assert.equal(growthRatePerHour(0), 0)
  assert.equal(growthDelta(0, HOUR), 0)
  // 负心情（脏输入）同样钳 0，不产生负成长
  assert.equal(growthDelta(-30, HOUR), 0)
})

test('pet-growth · 档位边界：每缺 5 点一档，向下取整（缺 4 点不扣、缺 5 点扣 0.1）', () => {
  assert.equal(growthRatePerHour(96), 2) // 缺 4 ⇒ floor(0.8)=0 档
  close(growthRatePerHour(95), 1.9, '缺 5 ⇒ 1 档')
  close(growthRatePerHour(91), 1.9, '缺 9 ⇒ 仍 1 档')
  close(growthRatePerHour(50), 1, '缺 50 ⇒ 10 档')
})

test('pet-growth · 等级阈值：0–49 幼鲸 / 50–199 伙伴 / 200–499 挚友 / ≥500 深海羁绊（design D-7）', () => {
  assert.deepEqual(rankOf(0), { rank: 0, rankName: '幼鲸' })
  assert.deepEqual(rankOf(49.9), { rank: 0, rankName: '幼鲸' })
  assert.deepEqual(rankOf(50), { rank: 1, rankName: '伙伴' })
  assert.deepEqual(rankOf(199), { rank: 1, rankName: '伙伴' })
  assert.deepEqual(rankOf(200), { rank: 2, rankName: '挚友' })
  assert.deepEqual(rankOf(499.5), { rank: 2, rankName: '挚友' })
  assert.deepEqual(rankOf(500), { rank: 3, rankName: '深海羁绊' })
  assert.deepEqual(rankOf(99999), { rank: 3, rankName: '深海羁绊' })
})

test('pet-growth · 悬停可见成长信息：PetStateView.growth 带数值 + 等级 + 等级名（面板数据源）', () => {
  const state = { ...initialState(T0), growth: 123.4 }
  const view = buildView(state, T0)
  // 数值传未取整真值（显示取整归页面 displayGrowth），rank/rankName 入口算好随发
  assert.equal(view.growth.value, 123.4)
  assert.equal(view.growth.rank, 1, '123.4 ∈ [50,200) ⇒ 等级 1')
  assert.equal(view.growth.rankName, '伙伴')
  // 阈值上下沿再各验一档（面板呈现的等级名必须跟手）
  assert.equal(buildView({ ...state, growth: 49.9 }, T0).growth.rankName, '幼鲸')
  assert.equal(buildView({ ...state, growth: 200 }, T0).growth.rankName, '挚友')
  assert.equal(buildView({ ...state, growth: 500 }, T0).growth.rankName, '深海羁绊')
})

test('pet-growth · 结算内按 D-5 步骤序积分：成长用②衰减③联动落定后的心情计速率', () => {
  // 1 小时、窗体存在：心情自 100 自然 -5、饥饿降 60 ⇒ 联动 -6、清洁降 10 ⇒ 联动 -1 ⇒ 落定 88
  const r = settle(initialState(T0), T0 + 3600_000, { overlayExists: true })
  close(r.state.mood, 100 - 5 - 6 - 1, 'mood 落定值')
  // 成长 = rate(88) × 1h = (2 - 0.1×floor(12/5)) = 1.8
  close(r.state.growth, growthRatePerHour(r.state.mood), 'growth（速率取落定后心情）')
  assert.ok(r.state.growth > 0)
})

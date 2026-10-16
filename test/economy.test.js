/**
 * pet-economy · 挂机产出与道具消耗（specs/pet-economy 全部 scenario）。
 *
 * 对应任务卡验收清单：挂机满 20 分钟两种道具各 +1；库存到顶不再加；窗体销毁 30 分钟不产出；
 * 无鱼干喂食 ⇒ 属性不变 + 返回错误文案；有泡泡洗澡 ⇒ 泡泡 -1 且清洁 +15。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { initialState, settle } from '../lib/settle.js'
import { interact } from '../lib/interact.js'
import { ITEM_CAP, TEXT } from '../lib/constants.js'

const T0 = 1_700_000_000_000
const MIN20 = 1200_000
const MIN30 = 1800_000

function st(overrides = {}) {
  return { ...initialState(T0), ...overrides }
}

test('pet-economy · 挂机满 20 分钟：小鱼干 +1 且沐浴泡泡 +1（仅当 overlay 存在时累计）', () => {
  const r = settle(st(), T0 + MIN20, { overlayExists: true })
  assert.equal(r.state.fish, 4)
  assert.equal(r.state.bubble, 4)
  assert.equal(r.state.afkAcc, 0, '满一个周期扣掉 1200s')

  // 对照：默认不传 overlayExists ⇒ 不累计（发放必须显式声明窗体存在，少发可恢复、多发不可回收）
  const off = settle(st(), T0 + MIN20)
  assert.equal(off.state.fish, 3)
  assert.equal(off.state.bubble, 3)
  assert.equal(off.state.afkAcc, 0)
})

test('pet-economy · 库存到顶：鱼干已 20 再挂机满 20 分钟保持 20，泡泡未满照常 +1', () => {
  const r = settle(st({ fish: ITEM_CAP, bubble: 19 }), T0 + MIN20, { overlayExists: true })
  assert.equal(r.state.fish, 20, '到顶不再加')
  assert.equal(r.state.bubble, 20)

  // 双满后继续挂机：库存不动，但挂机账照常扣周期（不囤积）
  const r2 = settle(st({ fish: 20, bubble: 20 }), T0 + 2 * MIN20, { overlayExists: true })
  assert.equal(r2.state.fish, 20)
  assert.equal(r2.state.bubble, 20)
  assert.equal(r2.state.afkAcc, 0)
})

test('pet-economy · 关窗暂停挂机：窗体销毁 30 分钟不产出任何道具，但属性继续衰减', () => {
  // design D-5：窗体销毁期间挂机计时暂停；pet-vitals 只要求"仅计运行期间"⇒ 属性照常衰减
  const r = settle(st(), T0 + MIN30, { overlayExists: false })
  assert.equal(r.state.fish, 3, '30 分钟无窗体 ⇒ 无鱼干')
  assert.equal(r.state.bubble, 3, '30 分钟无窗体 ⇒ 无泡泡')
  assert.equal(r.state.afkAcc, 0, '挂机账不累计')
  assert.ok(r.state.hunger < 100, '属性衰减继续（关窗期间宠物仍会饿）')

  // 重新开窗后：挂机从 0 重新累计，此前关窗的 30 分钟不被追补
  const r2 = settle(r.state, T0 + MIN30 + MIN20, { overlayExists: true })
  assert.equal(r2.state.fish, 4, '开窗后满 20 分钟才发第 1 条')
})

test('pet-economy · 无小鱼干时喂食：饥饿度不变、小鱼干不变，返回"没有小鱼干了"文案', () => {
  const s = st({ fish: 0, hunger: 50 })
  const r = interact(s, 'feed', T0 + 1000)
  assert.equal(r.ok, false)
  assert.equal(r.error, TEXT.noFish) // 逐字：没有小鱼干了，多陪我工作一会儿吧～（上游 ledger.ts，D-16）
  // 卡 15 换文案：原「没有小鱼干了（挂机 20 分钟可得 1 条）」含"数字 + 时间单位"，被 Q12 硬规则废止
  assert.equal(r.error, '没有小鱼干了，多陪我工作一会儿吧～')
  // 状态一个字段都不动（任务卡负向自检："属性不变"，deepEqual 全量核对）
  assert.deepEqual(r.state, undefined, 'ok:false 不携带状态')
  assert.deepEqual(s, st({ fish: 0, hunger: 50 }), '入参状态未被就地修改')
})

test('pet-economy · 无沐浴泡泡时洗澡：清洁度不变、泡泡不变，返回"没有沐浴泡泡了"文案', () => {
  const s = st({ bubble: 0, clean: 50 })
  const r = interact(s, 'bathe', T0 + 1000)
  assert.equal(r.ok, false)
  // 卡 15 换文案：仿上游 ledger.ts 句式，去掉「挂机 20 分钟可得 1 个」（D-16 / Q12）
  assert.equal(r.error, '没有沐浴泡泡了，多陪我工作一会儿吧～')
  assert.deepEqual(s, st({ bubble: 0, clean: 50 }))
})

test('pet-economy · 有道具时洗澡：沐浴泡泡 -1 且清洁度 +15', () => {
  const r = interact(st({ bubble: 3, clean: 70 }), 'bathe', T0 + 1000)
  assert.equal(r.ok, true)
  assert.equal(r.state.bubble, 2)
  assert.equal(r.state.clean, 85)
})

test('pet-economy · 洗澡受上限约束：清洁 90 时 +15 钳到 100，实际恢复量 10 入联动账 ⇒ 心情 +1', () => {
  const r = interact(st({ bubble: 1, clean: 90, mood: 80 }), 'bathe', T0 + 1000)
  assert.equal(r.state.clean, 100, '钳 [0,100]（specs/pet-vitals 上限约束）')
  assert.equal(r.state.recoverAcc, 0, '净恢复 10 点 ⇒ 触发一次后扣掉')
  assert.equal(r.state.mood, 81, '恢复联动 +1（80 < 95 未触顶）')
})

test('pet-economy · 喂食消耗与增量：小鱼干 -1、饥饿 +5（玩耍不耗道具归 interact.test.js）', () => {
  const r = interact(st({ fish: 3, hunger: 50 }), 'feed', T0 + 1000)
  assert.equal(r.ok, true)
  assert.equal(r.state.fish, 2)
  assert.equal(r.state.hunger, 55)
})

test('pet-economy · 挂机账跨结算连续：19 分钟 + 1 分钟 = 满 20 分钟才发放', () => {
  const r1 = settle(st(), T0 + 1140_000, { overlayExists: true }) // 19 分钟
  assert.equal(r1.state.fish, 3, '未满周期不发')
  assert.equal(r1.state.afkAcc, 1140)
  const r2 = settle(r1.state, T0 + 1200_000, { overlayExists: true }) // 再 1 分钟
  assert.equal(r2.state.fish, 4)
  assert.equal(r2.state.bubble, 4)
  assert.equal(r2.state.afkAcc, 0)
})

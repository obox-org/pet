/**
 * pet-economy · 道具库存与挂机奖励（specs/pet-economy 的全部 scenario；**v2 口径**）。
 *
 * ⚠️ 本文件是 v1 用例的改写：v1 的"喂食 +5 饥饿 / 洗澡 +15 清洁 / 上限钳 100 / 恢复联动"
 * 所指向的能力（三属性及其上限、联动记账）已随 `specs/pet-vitals` 的 4 条 REMOVED 整体删除，
 * 那些断言没有可移植的目标；因此这里改为钉住 **v2 仍然存在**的经济语义：
 *
 * - 库存 0–20 整数、首次安装各 3（`specs/pet-economy` R1）；
 * - 连续 1200 秒无操作 ⇒ 两样各 +1、各自独立钳 20（R2）；
 * - **任意成功互动都重新开始挂机计时**（R2 的"互动重置计时"scenario，入口侧由
 *   `lib/interact.js` 推进 `lastAfkAt`）；
 * - 喂食/洗澡各消耗 1 个对应道具，**拒绝分支不消耗、不改值**（R3）；
 * - 喂食/洗澡成功同时使成长值 +1、好感值 +1（`specs/pet-interaction` R3）。
 *
 * 互动本身的判定顺序（冷却 → 库存 → 结算）、文案与零副作用由 `test/interaction-v2.test.js`
 * 覆盖；结算内部的成长/挂机细节由 `test/settle.test.js` 覆盖，本文件只做"经济账"这一层。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { AFK_PERIOD_SEC, ITEM_CAP } from '../lib/constants.js'
import { interact } from '../lib/interact.js'
import { sanitizeState } from '../lib/persist.js'
import { initialState, settle } from '../lib/settle.js'

const T0 = 1_700_000_000_000
/** 一个挂机周期（1200 秒）的毫秒数 */
const AFK = AFK_PERIOD_SEC * 1000

function st(overrides = {}) {
  return { ...initialState(T0), ...overrides }
}

// ————— 库存：初始值与越界归一 —————

test('pet-economy · 首次安装（无存档）小鱼干 3、沐浴泡泡 3', () => {
  const s = initialState(T0)
  assert.equal(s.fish, 3)
  assert.equal(s.bubble, 3)
})

test('pet-economy · 越界归一：fish 25 / bubble -2 ⇒ 载入后 20 / 0（不阻止启动）', () => {
  const s = sanitizeState({ schemaVersion: 1, fish: 25, bubble: -2 }, T0)
  assert.equal(s.fish, ITEM_CAP, '超上限 ⇒ 钳 20')
  assert.equal(s.bubble, 0, '负数 ⇒ 0')
  // 小数向下取整（库存是整数，不存在半个鱼干）
  assert.equal(sanitizeState({ schemaVersion: 1, fish: 2.9 }, T0).fish, 2)
})

// ————— 挂机奖励 —————

test('pet-economy · 挂机满 20 分钟：小鱼干 +1 且沐浴泡泡 +1（仅当 overlay 存在时累计）', () => {
  const r = settle(st(), T0 + AFK, { overlayExists: true })
  assert.equal(r.state.fish, 4)
  assert.equal(r.state.bubble, 4)
  assert.equal(r.state.lastAfkAt, T0 + AFK, '只推进已发放的整周期')

  // 对照：不显式声明窗体存在 ⇒ 不发放（少发可恢复、多发不可回收）
  const off = settle(st(), T0 + AFK)
  assert.equal(off.state.fish, 3)
  assert.equal(off.state.bubble, 3)
})

test('pet-economy · 上限封顶：鱼干已 20 时保持 20，泡泡未满照常 +1', () => {
  const r = settle(st({ fish: ITEM_CAP, bubble: 19 }), T0 + AFK, { overlayExists: true })
  assert.equal(r.state.fish, 20, '到顶不越界')
  assert.equal(r.state.bubble, 20)
})

test('pet-economy · 互动重置挂机计时：差 1 秒该发奖励时成功喂食 ⇒ 下一次奖励在之后 1200 秒', () => {
  // 差 1 秒满周期：还没发（鱼干仍 3）
  const justBefore = settle(st(), T0 + AFK - 1000, { overlayExists: true })
  assert.equal(justBefore.state.fish, 3, '未满周期不发')

  const fedAt = T0 + AFK - 1000
  const fed = interact(justBefore.state, 'feed', fedAt)
  assert.equal(fed.ok, true)
  assert.equal(fed.state.lastAfkAt, fedAt, '成功互动把挂机计时基准推到当时')
  assert.equal(fed.state.fish, 2, '这次喂食消耗了 1 个鱼干')

  // 原本再过 1 秒就该发的那一次被重置掉了：到 T0+1200s 时仍然不发
  const atOldDeadline = settle(fed.state, T0 + AFK, { overlayExists: true })
  assert.equal(atOldDeadline.state.fish, 2, '旧周期被重置 ⇒ 不发')

  // 距新基准满 1200 秒 ⇒ 才发下一次
  const newDeadline = fedAt + AFK
  assert.equal(
    settle(fed.state, newDeadline - 1, { overlayExists: true }).state.fish,
    2,
    '差 1ms 仍然不发'
  )
  assert.equal(settle(fed.state, newDeadline, { overlayExists: true }).state.fish, 3, '满周期恰好发 1 条')
})

// ————— 消耗：成功才扣，拒绝不扣 —————

test('pet-economy · 成功消耗：鱼干 5 / 泡泡 4 且不在冷却期 ⇒ 喂食后 4/4，成长与好感各 +1', () => {
  const r = interact(st({ fish: 5, bubble: 4 }), 'feed', T0)
  assert.equal(r.ok, true)
  assert.equal(r.state.fish, 4, '鱼干 -1')
  assert.equal(r.state.bubble, 4, '泡泡不动（只扣对应那一样）')
  assert.equal(r.state.growth, 1, '成长值 +1（specs/pet-interaction R3）')
  assert.equal(r.state.favor, 1, '好感值 +1')
})

test('pet-economy · 拒绝不消耗：冷却期内点喂食 ⇒ 鱼干、成长值、好感值全部不变', () => {
  const s = st({ fish: 5, lastInteractAt: T0 - 1000 }) // 1 秒前刚成功互动过 ⇒ 共享冷却中
  const r = interact(s, 'feed', T0)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'cooling')
  assert.equal(r.state.fish, 5, '冷却拒绝不消耗（specs/pet-economy R3 的"拒绝不消耗"）')
  assert.equal(r.state.growth, s.growth)
  assert.equal(r.state.favor, s.favor)
  // 库存不足同样不消耗
  const noFish = interact(st({ fish: 0 }), 'feed', T0)
  assert.equal(noFish.ok, false)
  assert.equal(noFish.reason, 'no-item')
  assert.equal(noFish.state.fish, 0)
})

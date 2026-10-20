/**
 * pet-interaction · 互动结果 → 视图动画的**整链路**（specs/pet-interaction R1/R3/R5/R6；
 * design D-2 状态表 / D-4 判定顺序）。
 *
 * ⚠️ 本文件是 v1 用例的改写：v1 里的"玩耍（`play`）不耗道具""心情 +1 / 上限钳 100"
 * "气泡 2600ms""任何成功互动刷新最近交互时刻（打盹退出条件）"分别指向
 * **已删除的能力**（`play` kind、三属性数值与上限、2600ms 气泡、打盹机制），
 * 因此按 v2 重写为下面四条——它们钉的是**仍然存在**的契约：
 *
 * - 三种合法互动（喂食/洗澡/点击）→ `interact()` 的 `anim` → `buildView().anim`
 *   = `{ row, label, status, self:false }`，且一轮播完回落 `idle`；
 * - 成功互动推进对应的冷却基准与挂机基准（v2 的 `lastInteractAt` **只**表示共享冷却，
 *   不再兼职"最近交互时刻"）；
 * - 点击冷却期仍给 `anim:'petted'` 与一条**冷却文本**（数值不变、动画照播）；
 * - 未知 kind（含已删除的 `play`）不再产生任何动画或文本。
 *
 * 纯函数层的判定顺序、零副作用与文案来自 `lib/texts.js` 的取样细节由
 * `test/interaction-v2.test.js` 覆盖；本文件只补"接到视图上"的那一段。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildView } from '../lib/bridge.js'
import { INTERACT_COOLDOWN_MS, PET_COOLDOWN_MS, TRANSIENT_MS } from '../lib/constants.js'
import { interact } from '../lib/interact.js'
import { resolveStatus } from '../lib/mapping.js'
import { initialState } from '../lib/settle.js'
import { COOLING_TEXTS } from '../lib/texts.js'

const T0 = 1_700_000_000_000

function st(overrides = {}) {
  return { ...initialState(T0), ...overrides }
}

/** 把 `interact()` 返回的状态写进 transient（入口 index.js 的那一步），再出权威视图 */
function viewOf(result, now) {
  const state = { ...result.state, transient: { status: result.anim, until: now + TRANSIENT_MS[result.anim] } }
  return { state, view: buildView(state, now) }
}

test('pet-interaction · 喂食成功：鱼干 -1、anim 切 eating（jumping 行 4）+ 视图 self=false，一轮后回落 idle', () => {
  const now = T0 + 5000
  const r = interact(st({ fish: 2 }), 'feed', now)
  assert.equal(r.ok, true)
  assert.equal(r.state.fish, 1)
  assert.equal(r.anim, 'eating')
  assert.equal(r.text, '呜哇！小鱼干好好吃！')

  const { state, view } = viewOf(r, now)
  assert.deepEqual(view.anim, { row: 4, label: '喂食', status: 'eating', self: false })
  assert.equal(resolveStatus(state, now), 'eating')
  // 真实互动写下的 transient 不折、但一轮播完必须回落待机（v2 没有任何"数值过低"的负面姿态）
  assert.equal(resolveStatus({ ...state, transientSelf: false }, now + TRANSIENT_MS.eating - 1), 'eating')
  assert.equal(resolveStatus({ ...state, transientSelf: false }, now + TRANSIENT_MS.eating), 'idle')
})

test('pet-interaction · 洗澡成功：泡泡 -1、anim 切 bathing（waving 行 3）+ 视图 self=false', () => {
  const now = T0 + 5000
  const r = interact(st({ bubble: 2 }), 'bathe', now)
  assert.equal(r.ok, true)
  assert.equal(r.state.bubble, 1)
  assert.equal(r.state.fish, 3, '洗澡不动鱼干')
  assert.equal(r.anim, 'bathing')
  assert.equal(r.text, '泡泡好舒服～洗干净啦！')
  assert.deepEqual(viewOf(r, now).view.anim, { row: 3, label: '洗澡', status: 'bathing', self: false })
})

test('pet-interaction · 成功互动推进各自基准：喂食/洗澡推共享冷却与挂机；点击推点击冷却与挂机', () => {
  const now = T0 + 5000
  for (const kind of ['feed', 'bathe']) {
    const r = interact(st(), kind, now)
    assert.equal(r.ok, true, kind)
    assert.equal(r.state.lastInteractAt, now, `${kind}：共享冷却基准推进`)
    assert.equal(r.state.lastAfkAt, now, `${kind}：挂机计时重新开始（design D-3 硬细节）`)
    assert.equal(r.state.lastPetAt, 0, `${kind}：不碰点击冷却基准`)
  }
  const pet = interact(st(), 'pet', now)
  assert.equal(pet.ok, true)
  assert.equal(pet.state.lastPetAt, now, '点击推进点击冷却基准')
  assert.equal(pet.state.lastAfkAt, now)
  assert.equal(pet.state.lastInteractAt, 0, '点击不碰喂食/洗澡的共享冷却')
})

test('pet-interaction · 共享冷却期内点击图标：数值不变、仍返回 anim 与「再等等」类文本', () => {
  const now = T0 + 5000
  const cooling = st({ lastInteractAt: now - INTERACT_COOLDOWN_MS + 1 })
  for (const kind of ['feed', 'bathe']) {
    const r = interact(cooling, kind, now)
    assert.equal(r.ok, false)
    assert.equal(r.reason, 'cooling')
    assert.equal(typeof r.text, 'string', '冷却拒绝也带一句可读文案（不结算 ≠ 没有反馈）')
    assert.equal(r.anim, undefined, '共享冷却不写任何动画轨（v1 的"失败也播反馈"已随三属性删除）')
  }
})

test('pet-interaction · 点击冷却期内：favor 不变，但 anim 仍是 petted 且文本取自冷却集合', () => {
  const now = T0 + 5000
  const s = st({ favor: 3, lastPetAt: now - 1000 }) // 1 秒前刚计过分（冷却 1 小时）
  const r = interact(s, 'pet', now)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'pet-cooling')
  assert.equal(r.state.favor, 3, '冷却期内好感不变')
  assert.equal(r.state.lastPetAt, s.lastPetAt, '也不推进冷却基准')
  assert.equal(r.anim, 'petted', '摸头动画照播（specs/pet-interaction R5）')
  assert.ok(COOLING_TEXTS.includes(r.text), `冷却文本取自冷却集合：${r.text}`)
  // 帧契约：petted 用 waving 轨（row 3），与洗澡同轨但不是同一状态
  const { view } = viewOf(r, now)
  assert.deepEqual(view.anim, { row: 3, label: '摸头', status: 'petted', self: false })
  // 冷却结束（恰好满 3600 秒）⇒ 恢复计分
  const later = interact(s, 'pet', s.lastPetAt + PET_COOLDOWN_MS)
  assert.equal(later.ok, true)
  assert.equal(later.state.favor, 4)
})

test('pet-interaction · 已删除的 kind（含 v1 的第三条互动）不再产生动画或文本：按未知互动拒绝', () => {
  for (const kind of ['summon', 'hide', 'dance']) {
    const r = interact(st(), kind, T0)
    assert.equal(r.ok, false, `${kind} 不是 v2 的合法互动`)
    assert.equal(r.reason, 'unknown-kind')
    assert.equal(r.anim, undefined, `${kind} 不产生动画（面板只剩喂食/洗澡两枚图标）`)
    assert.equal(r.text, undefined, `${kind} 不产生气泡文案（未知互动只记诊断）`)
  }
})

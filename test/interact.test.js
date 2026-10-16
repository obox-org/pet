/**
 * pet-interaction · 点击冷却与三互动（specs/pet-interaction 全部入口侧 scenario）。
 *
 * 对应任务卡验收清单：冷却内点击 ⇒ 心情不变但有反馈；冷却到期点击 ⇒ 心情 +1；
 * 喂食 ⇒ 鱼干 -1、饥饿 +5、anim 切 eating；玩耍 ⇒ 心情 +5、道具不变。
 * （"悬停面板出现/消失"的页面呈现归卡 08；入口侧的对应契约 = pet.hit ⇒ setMouseThrough + 唤醒，
 *  在 window.test.js / extension.test.js 覆盖。）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { interact } from '../lib/interact.js'
import { resolveStatus } from '../lib/mapping.js'
import { buildView } from '../lib/bridge.js'
import { initialState } from '../lib/settle.js'
import { PET_COOLDOWN_MS, TEXT, TRANSIENT_MS } from '../lib/constants.js'

const T0 = 1_700_000_000_000

function st(overrides = {}) {
  return { ...initialState(T0), ...overrides }
}

test('pet-interaction · 冷却内重复点击：心情不变、不推进冷却基准，但仍有 petted 反馈', () => {
  const s = st({ mood: 80, lastPetAt: T0 - 60_000 }) // 1 分钟前刚计过分
  const r = interact(s, 'pet', T0)
  assert.equal(r.ok, true, '冷却内点击仍成功返回（有反馈）')
  assert.equal(r.state.mood, 80, '心情不变（不加分）')
  assert.equal(r.state.lastPetAt, T0 - 60_000, '冷却以"上次计分点击"为基准，未被刷新')
  assert.equal(r.feedback.kind, 'pet')
  assert.equal(r.feedback.tone, 'bad', '未计分 ⇒ 坏语气（页面渲染深色气泡）')
  // 卡 15 换文案（D-16 / 增补 Q12）：原「再摸也不会更开心啦（还需 4 分钟）」含"数字 + 时间单位"⇒ 废止；
  // 新句与上游 dsh-pet 逐字一致，且**不再依赖剩余时间**（冷却 1 分钟前与 4 分 59 秒前同一句）
  assert.equal(r.feedback.text, '摸过头啦，让鲸鱼娘歇口气～')
  assert.equal(r.feedback.text, TEXT.petCooling)
  assert.equal(interact(st({ mood: 80, lastPetAt: T0 - 299_000 }), 'pet', T0).feedback.text, TEXT.petCooling)
  assert.equal(r.state.transient.status, 'petted', '仍播放 petted 反馈动画')
})

test('pet-interaction · 冷却到期后点击：心情 +1 并刷新计分时刻', () => {
  const s = st({ mood: 80, lastPetAt: T0 - PET_COOLDOWN_MS }) // 恰好满 5 分钟
  const r = interact(s, 'pet', T0)
  assert.equal(r.ok, true)
  assert.equal(r.state.mood, 81, '心情 +1')
  assert.equal(r.state.lastPetAt, T0)
  assert.equal(r.feedback.text, TEXT.petOk) // 卡 15：'咕噜咕噜～被摸摸好舒服！'（上游 affinity.ts 逐字，原为'心情 +1'）
  assert.equal(r.feedback.tone, 'good')
  // 首次点击（无计分历史 lastPetAt=0）同样计分
  const first = interact(st({ mood: 50 }), 'pet', T0)
  assert.equal(first.state.mood, 51)
})

test('pet-interaction · 点击心情受上限约束：99.5 + 1 钳到 100（互动途径可超 95）', () => {
  const r = interact(st({ mood: 99.5 }), 'pet', T0)
  assert.equal(r.state.mood, 100)
})

test('pet-interaction · 喂食生效：小鱼干 -1、饥饿度 +5、anim 切 eating（jumping 行 4）', () => {
  const now = T0 + 5000
  const r = interact(st({ fish: 2, hunger: 40 }), 'feed', now)
  assert.equal(r.ok, true)
  assert.equal(r.state.fish, 1)
  assert.equal(r.state.hunger, 45)
  assert.equal(r.feedback.text, TEXT.feedOk) // 卡 15：'呜哇！小鱼干好好吃！'（上游逐字，原为'吃饱啦（饥饿度 +5）'）
  // anim 契约：eating → 图集第 4 行（jumping），label 中文'喂食'
  const view = buildView(r.state, now)
  assert.deepEqual(view.anim, { row: 4, label: '喂食', status: 'eating' })
  assert.equal(resolveStatus(r.state, now), 'eating')
  // 瞬时互动播完一轮（1600ms）后回落到属性判定
  assert.equal(resolveStatus(r.state, now + TRANSIENT_MS.eating), 'idle')
})

test('pet-interaction · 玩耍不耗道具：心情 +5、播放 playing 行动画、两种道具数量不变', () => {
  const now = T0 + 5000
  const r = interact(st({ fish: 0, bubble: 0, mood: 60 }), 'play', now)
  assert.equal(r.ok, true, '库存为 0 也可玩耍（MUST NOT 消耗道具）')
  assert.equal(r.state.mood, 65)
  assert.equal(r.state.fish, 0, '鱼干不变')
  assert.equal(r.state.bubble, 0, '泡泡不变')
  assert.deepEqual(buildView(r.state, now).anim, { row: 7, label: '玩耍', status: 'playing' })
})

test('pet-interaction · 瞬时互动优先且播完回落：饥饿 <30 时喂食 ⇒ 先 eating，一轮后回落 hungry', () => {
  const now = T0 + 5000
  const r = interact(st({ hunger: 20, fish: 1 }), 'feed', now) // hungry 阈值下喂食
  assert.equal(resolveStatus(r.state, now), 'eating', '瞬时互动优先（播放中不可被打断）')
  assert.equal(resolveStatus(r.state, now + TRANSIENT_MS.eating - 1), 'eating')
  assert.equal(resolveStatus(r.state, now + TRANSIENT_MS.eating), 'hungry', '播完回落到按属性判定')
})

test('pet-interaction · 未知 kind：返回 { ok:false, error:"未知互动: …" } 且状态不变', () => {
  const s = st()
  for (const bad of ['dance', '', 'FEED', undefined, null, 42, {}]) {
    const r = interact(s, bad, T0)
    assert.equal(r.ok, false)
    assert.equal(r.error, TEXT.unknownKind(String(bad)))
    assert.equal(r.state, undefined)
  }
  assert.deepEqual(s, st(), '入参未被就地修改')
})

test('pet-interaction · 气泡契约：成功互动带 2600ms 气泡（feedback 与 view.bubble 同文）', () => {
  const now = T0 + 5000
  const r = interact(st(), 'play', now)
  // 卡 15 换文案（D-16 / 增补 Q13）：原「好开心（心情 +5）」含属性增量数字 ⇒ 废止，改为无数字自拟句
  assert.equal(r.state.speech.text, '玩得好开心！')
  assert.equal(r.state.speech.tone, 'good')
  assert.equal(r.state.speech.until, now + 2600)
  assert.deepEqual(buildView(r.state, now).bubble, { text: '玩得好开心！', tone: 'good', until: now + 2600 })
  // 过期气泡 ⇒ view.bubble 为 null（入口不续尸，页面按 until 淡出）
  assert.equal(buildView(r.state, now + 2601).bubble, null)
})

test('pet-interaction · 任何成功互动都刷新最近交互时刻（sleep 的退出条件：任一交互发生）', () => {
  const now = T0 + 5000
  for (const kind of ['feed', 'bathe', 'play', 'pet']) {
    const r = interact(st(), kind, now)
    assert.equal(r.ok, true)
    assert.equal(r.state.lastInteractAt, now, kind)
  }
  // 失败互动（道具不足）不碰状态 ⇒ 不刷新（用户悬停面板时 pet.hit 已负责唤醒，口径见 index.js）
  const failed = interact(st({ fish: 0 }), 'feed', now)
  assert.equal(failed.ok, false)
  assert.equal(failed.state, undefined)
})

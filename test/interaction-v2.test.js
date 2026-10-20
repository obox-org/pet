/**
 * 卡 03 · interaction-v2 的验收测试（specs/pet-interaction 的 6 条 requirement；
 * specs/pet-economy 的消耗与拒绝规则；design D-4 判定顺序、D-9 错误码）。
 *
 * 覆盖任务卡 `03-interaction-v2.md` 的验收清单：
 * ① 判定顺序（冷却 → 库存 → 结算）与"冷却优先于库存"；
 * ② **拒绝零副作用**：逐字段断言前后一致（冷却 / 无道具 / 点击冷却 / 未知 kind 四种 reason 全覆盖）；
 * ③ 共享冷却：喂食后立刻洗澡被拒，边界 599_999 拒 / 600_000 放行；
 * ④ 冷却跨重启：`serialize` → `deserialize` 的存档往返（`lastInteractAt` 是持久化字段）；
 * ⑤ 点击冷却期：数值不变、仍返回 `anim:'petted'`、文本取自 8 条冷却集合且相邻去重；
 * ⑥ `play` / `summon` / `hide` / 未知 kind 一律 `unknown-kind` 且状态零变化；
 * ⑦ 时钟回拨与非法时间戳（NaN / 负数 / 字符串 / Infinity / 未来 / null）；
 * ⑧ 三条成功路径的数值变化（growth / favor / 道具 / `lastInteractAt` / `lastAfkAt` / `lastPetAt`）；
 * ⑨ 本模块不碰视图与定时器字段（`transient` / `transientSelf` / `speech` / `rev` 交给卡 4）。
 *
 * 只依赖卡 1/2 已落地的模块，**不依赖任何旧测试文件**（那些属于卡 6 的清理范围），可单独跑：
 *   npm test -- test/interaction-v2.test.js
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { INTERACT_COOLDOWN_MS, PET_COOLDOWN_MS, TEXT } from '../lib/constants.js'
import { KINDS, SHARED_COOLING_TEXT, interact } from '../lib/interact.js'
import { deserialize, serialize } from '../lib/persist.js'
import { initialState } from '../lib/settle.js'
import { COOLING_TEXTS } from '../lib/texts.js'

/** 固定测试时钟（用例与真实时间无关、可重复） */
const T0 = 1_700_000_000_000
const MIN = 60_000
const HOUR = 3_600_000

/** 首装状态（`lastInteractAt` / `lastPetAt` = 0 = 已到期，可直接互动） */
function st(overrides = {}) {
  return { ...initialState(T0), ...overrides }
}

/**
 * 深快照：拒绝分支"前后逐字段相等"的对照物。
 * 用 `structuredClone` 而不是 JSON 往返：后者会把 `NaN` 变成 `null`，
 * 让"非法库存字段原样保留"这条断言假绿/假红（测试自己先失真就谈不上门禁）。
 */
function snapshotOf(state) {
  return structuredClone(state)
}

/** 逐字段断言"零改动"：先按对照物的每个键比，再整体比一次（防丢键/多键） */
function assertUnchanged(actual, expected, label = '') {
  for (const key of Object.keys(expected)) {
    assert.deepEqual(actual[key], expected[key], `${label}${key} 必须不变`)
  }
  assert.deepEqual(actual, expected, `${label}整对象必须逐字段一致`)
}

/** 拒绝断言（ok=false + 对应 D-9 错误码） */
function assertReject(result, reason) {
  assert.equal(result.ok, false)
  assert.equal(result.reason, reason)
}

// ————————————————————————————————————————————————————————————————
// ① 合法互动集合与未知 kind（spec R1 的"旧载荷被拒绝"；design D-10）
// ————————————————————————————————————————————————————————————————

test('卡03 · 合法互动只有 feed/bathe/pet：play/summon/hide/未知一律 unknown-kind', () => {
  assert.deepEqual([...KINDS], ['feed', 'bathe', 'pet'])
  for (const removed of ['play', 'summon', 'hide']) {
    assert.ok(!KINDS.includes(removed), `${removed} 不再属于合法互动`)
  }

  const s = st({ fish: 5, bubble: 5, growth: 3, favor: 4 })
  const before = snapshotOf(s)
  const bad = [
    'play',
    'summon',
    'hide',
    'dance',
    '',
    'FEED',
    'Feed',
    undefined,
    null,
    42,
    {},
    ['feed'],
    true
  ]
  for (const kind of bad) {
    const r = interact(s, kind, T0 + MIN)
    assertReject(r, 'unknown-kind')
    assert.equal(r.anim, undefined, '未知互动不播任何动画')
    // design D-9：「未知通道/未知互动 ⇒ 不弹气泡；诊断位记录」⇒ 拒绝结果不带 text
    assert.equal(r.text, undefined, '未知互动不弹气泡（入口据 TEXT.unknownKind(kind) 记诊断）')
    assertUnchanged(r.state, before, `${String(kind)} 拒绝后 `)
    assert.notEqual(r.state, s, '拒绝也返回新对象，不把入参递给调用方就地改')
  }
  assertUnchanged(s, before, '入参 ')
})

// ————————————————————————————————————————————————————————————————
// ② 判定顺序：冷却 → 库存 → 结算（design D-4，顺序不可交换）
// ————————————————————————————————————————————————————————————————

test('卡03 · 判定顺序：冷却优先于库存（冷却中且没鱼干 ⇒ cooling，不是 no-item）', () => {
  const s = st({ fish: 0, bubble: 0, lastInteractAt: T0 - MIN })
  const before = snapshotOf(s)
  for (const kind of ['feed', 'bathe']) {
    const r = interact(s, kind, T0)
    assertReject(r, 'cooling')
    assert.equal(r.text, SHARED_COOLING_TEXT, '共享冷却文案（design D-9「刚互动过啦…」）')
    assert.equal(r.anim, undefined, '共享冷却不播动画（动画只在成功时给）')
    assertUnchanged(r.state, before)
  }

  // 冷却到期之后，同一个状态才暴露"其实没道具"⇒ 证明两个门是分开判的
  const afterCooldown = T0 - MIN + INTERACT_COOLDOWN_MS
  const noItem = interact(s, 'feed', afterCooldown)
  assertReject(noItem, 'no-item')
  assert.equal(noItem.text, TEXT.noFish)
  assertUnchanged(noItem.state, before)
})

test('卡03 · 判定顺序：库存不足 ⇒ no-item（文案按道具分开），冷却已过也不再消耗', () => {
  const noFish = st({ fish: 0, bubble: 4 })
  const feed = interact(noFish, 'feed', T0 + MIN)
  assertReject(feed, 'no-item')
  assert.equal(feed.text, TEXT.noFish)
  assertUnchanged(feed.state, snapshotOf(noFish))

  const noBubble = st({ fish: 4, bubble: 0 })
  const bathe = interact(noBubble, 'bathe', T0 + MIN)
  assertReject(bathe, 'no-item')
  assert.equal(bathe.text, TEXT.noBubble)
  assertUnchanged(bathe.state, snapshotOf(noBubble))

  // 负数/非法库存同样按"没有道具"处理（防御手工改坏的存档：不抛错、不出负数库存）
  for (const bad of [-1, NaN, 'x', undefined]) {
    const r = interact(st({ fish: bad, bubble: bad }), 'feed', T0 + MIN)
    assertReject(r, 'no-item')
    assertUnchanged(r.state, snapshotOf(st({ fish: bad, bubble: bad })), `fish=${String(bad)} `)
  }
})

// ————————————————————————————————————————————————————————————————
// ③ 拒绝零副作用（逐字段；四种 reason 全覆盖）
// ————————————————————————————————————————————————————————————————

test('卡03 · 拒绝零副作用：逐字段前后相等（cooling / no-item / pet-cooling / unknown-kind）', () => {
  const s = st({
    growth: 7,
    favor: 19,
    fish: 0,
    bubble: 0,
    lastInteractAt: T0 - MIN,
    lastPetAt: T0 - MIN,
    lastAfkAt: T0 - 2 * MIN,
    speech: { text: '上一句话', tone: 'good', until: T0 }
  })
  const before = snapshotOf(s)
  const cases = [
    ['feed', T0, 'cooling'],
    ['bathe', T0, 'cooling'],
    ['play', T0, 'unknown-kind'],
    ['pet', T0, 'pet-cooling'],
    ['feed', T0 + INTERACT_COOLDOWN_MS, 'no-item'],
    ['bathe', T0 + INTERACT_COOLDOWN_MS, 'no-item']
  ]
  for (const [kind, now, reason] of cases) {
    const r = interact(s, kind, now)
    assertReject(r, reason)
    assertUnchanged(r.state, before, `${kind}@+${now - T0}ms `)
  }
  assertUnchanged(s, before, '入参 ')
})

// ————————————————————————————————————————————————————————————————
// ④ 成功路径的数值变化（三者的 growth / favor / 道具 / 时间戳）
// ————————————————————————————————————————————————————————————————

test('卡03 · 喂食成功：鱼干 -1、growth +1、favor +1、两时间戳推进，其余不动', () => {
  const now = T0 + 30 * MIN
  const s = st({ fish: 3, bubble: 5, growth: 7, favor: 19, lastPetAt: T0 - 5 * MIN })
  const before = snapshotOf(s)
  const r = interact(s, 'feed', now)

  assert.equal(r.ok, true)
  assert.equal(r.reason, undefined, '成功分支没有 reason')
  assert.equal(r.anim, 'eating', '喂食播 eating 轨')
  assert.equal(r.text, TEXT.feedOk)
  assert.equal(r.state.fish, 2, '小鱼干 -1')
  assert.equal(r.state.bubble, 5, '喂食不消耗沐浴泡泡')
  assert.equal(r.state.growth, 7 + 1, '成长值 +1')
  assert.equal(r.state.favor, 19 + 1, '好感值 +1')
  assert.equal(r.state.lastInteractAt, now, '共享冷却基准推进')
  assert.equal(r.state.lastAfkAt, now, '成功互动重置挂机计时（design D-3 硬细节）')
  assert.equal(r.state.lastPetAt, s.lastPetAt, '点击冷却基准不受喂食影响')
  assert.equal(r.state.lastGrowthAt, s.lastGrowthAt, '成长结算基准不受互动影响')
  assert.notEqual(r.state, s, '返回新 state 对象')
  assertUnchanged(s, before, '入参 ')
})

test('卡03 · 洗澡成功：沐浴泡泡 -1、growth +1、favor +1、两时间戳推进，鱼干不动', () => {
  const now = T0 + 30 * MIN
  const s = st({ fish: 3, bubble: 4, growth: 0, favor: 0, lastPetAt: T0 - 5 * MIN })
  const r = interact(s, 'bathe', now)

  assert.equal(r.ok, true)
  assert.equal(r.anim, 'bathing', '洗澡播 bathing 轨')
  assert.equal(r.text, TEXT.batheOk)
  assert.equal(r.state.bubble, 3, '沐浴泡泡 -1')
  assert.equal(r.state.fish, 3, '洗澡不消耗小鱼干')
  assert.equal(r.state.growth, 1)
  assert.equal(r.state.favor, 1)
  assert.equal(r.state.lastInteractAt, now)
  assert.equal(r.state.lastAfkAt, now)
  assert.equal(r.state.lastPetAt, s.lastPetAt)
})

test('卡03 · 点击成功：favor +1、lastPetAt/lastAfkAt 推进，不耗道具、不加成长、不动共享冷却', () => {
  const now = T0 + 5 * HOUR
  const s = st({
    favor: 19,
    growth: 6,
    fish: 3,
    bubble: 3,
    lastInteractAt: T0 - 30 * MIN,
    lastPetAt: 0
  })
  const r = interact(s, 'pet', now)

  assert.equal(r.ok, true)
  assert.equal(r.reason, undefined)
  assert.equal(r.anim, 'petted', '点击播 petted 轨')
  assert.equal(r.text, TEXT.petOk)
  assert.equal(r.state.favor, 20, '好感值 +1')
  assert.equal(r.state.growth, 6, '点击不加成长值（specs/pet-values R1）')
  assert.equal(r.state.fish, 3, '点击不消耗道具')
  assert.equal(r.state.bubble, 3)
  assert.equal(r.state.lastPetAt, now, '点击冷却基准推进')
  assert.equal(r.state.lastAfkAt, now)
  assert.equal(r.state.lastInteractAt, s.lastInteractAt, '点击不推共享冷却基准')
})

// ————————————————————————————————————————————————————————————————
// ⑤ 共享冷却 + 跨重启（spec R4）
// ————————————————————————————————————————————————————————————————

test('卡03 · 共享冷却：喂食后立刻洗澡被拒（两个图标共用 lastInteractAt），到期即恢复', () => {
  const fedAt = T0 + 30 * MIN
  const fed = interact(st({ fish: 3, bubble: 3 }), 'feed', fedAt)
  assert.equal(fed.ok, true)
  const after = fed.state
  const before = snapshotOf(after)

  const immediately = interact(after, 'bathe', fedAt + 1000)
  assertReject(immediately, 'cooling')
  assert.equal(immediately.text, SHARED_COOLING_TEXT)
  assertUnchanged(immediately.state, before, '喂食后立刻洗澡 ')
  assert.equal(immediately.state.bubble, 3, '冷却拒绝不消耗沐浴泡泡（specs/pet-economy）')

  // 边界：差 1 毫秒仍然冷却
  assertReject(interact(after, 'bathe', fedAt + INTERACT_COOLDOWN_MS - 1), 'cooling')

  // 恰好满 600_000 ⇒ 放行（design D-4 的 `>=` 口径，逐字钉住）
  const exactly = interact(after, 'bathe', fedAt + INTERACT_COOLDOWN_MS)
  assert.equal(exactly.ok, true, '>= 600_000 即恢复，无需额外操作')
  assert.equal(exactly.anim, 'bathing')
  assert.equal(exactly.state.bubble, 2)
  assert.equal(exactly.state.lastInteractAt, fedAt + INTERACT_COOLDOWN_MS)
})

test('卡03 · 冷却跨重启：存档里的 lastInteractAt 让重启后仍判冷却，到期后恢复', () => {
  const fedAt = T0 + 30 * MIN
  const fed = interact(st(), 'feed', fedAt)
  assert.equal(fed.ok, true)

  // 「存盘 → 进程重启 → 读档」：冷却基准是持久化字段，重启不清零（spec R4 scenario 3）
  const restarted = deserialize(serialize(fed.state), fedAt + 1000)
  assert.equal(restarted.ok, true)
  assert.equal(restarted.state.lastInteractAt, fedAt, '冷却基准随存档往返')
  assert.equal(restarted.state.fish, fed.state.fish, '道具随存档往返')

  const soon = interact(restarted.state, 'feed', fedAt + MIN)
  assertReject(soon, 'cooling')
  assertUnchanged(soon.state, restarted.state, '重启后的冷却期 ')
  assert.equal(soon.state.fish, fed.state.fish, '冷却拒绝不消耗道具')

  const later = interact(restarted.state, 'bathe', fedAt + INTERACT_COOLDOWN_MS)
  assert.equal(later.ok, true, '冷却以存档里的绝对时刻为基准，重启不影响到期时间')
})

// ————————————————————————————————————————————————————————————————
// ⑥ 点击冷却期（spec R5：数值不变，但动画与冷却文本照给）
// ————————————————————————————————————————————————————————————————

test('卡03 · 点击冷却期：数值不变但仍返回 anim:petted 与一条冷却文本（相邻去重）', () => {
  const now = T0 + 30 * MIN
  const s = st({ favor: 33, lastPetAt: now - HOUR + 1 }) // 差 1 毫秒满一小时
  const before = snapshotOf(s)

  const r = interact(s, 'pet', now)
  assertReject(r, 'pet-cooling')
  assert.equal(r.anim, 'petted', '冷却期内的点击 MUST 仍播摸头动画')
  assert.ok(COOLING_TEXTS.includes(r.text), `冷却文本必须取自 8 条集合，实际：${r.text}`)
  assertUnchanged(r.state, before, '点击冷却 ')
  assert.equal(r.state.favor, 33, '好感值不变')
  assert.equal(r.state.lastPetAt, s.lastPetAt, '不推进冷却基准（基准是"上次计分点击"）')

  // 相邻去重：上一次显示的就是这条冷却文本 ⇒ 本次必换一句（取样先把 last 剔除）
  const withLast = { ...s, speech: { text: r.text, tone: 'bad', until: now + 4000 } }
  const again = interact(withLast, 'pet', now)
  assertReject(again, 'pet-cooling')
  assert.equal(again.anim, 'petted')
  assert.notEqual(again.text, r.text, '连续两次冷却文本不相邻重复')
  assert.ok(COOLING_TEXTS.includes(again.text))

  // 恰好满 3_600_000 ⇒ 计分（边界与共享冷却同款 `>=` 口径）
  const exactly = interact(s, 'pet', s.lastPetAt + PET_COOLDOWN_MS)
  assert.equal(exactly.ok, true)
  assert.equal(exactly.state.favor, 34)
})

// ————————————————————————————————————————————————————————————————
// ⑦ 时钟回拨与非法时间戳（design D-4 边界条）
// ————————————————————————————————————————————————————————————————

test('卡03 · 时钟回拨：now 早于 lastInteractAt/lastPetAt ⇒ 视为已到期（仍可互动）', () => {
  const s = st({ fish: 3, bubble: 3, lastInteractAt: T0, lastPetAt: T0 })

  const fed = interact(s, 'feed', T0 - 1)
  assert.equal(fed.ok, true, '回拨 1 毫秒不锁死喂食')
  assert.equal(fed.state.lastInteractAt, T0 - 1, '基准改成回拨后的 now，下一次从这算')
  assert.equal(fed.state.growth, 1)

  const petted = interact(s, 'pet', T0 - HOUR)
  assert.equal(petted.ok, true, '回拨一小时同样视为已到期')
  assert.equal(petted.state.favor, 1)
  assert.equal(petted.state.lastPetAt, T0 - HOUR)
})

test('卡03 · 非法/未来时间戳一律视为已到期（NaN/负数/字符串/Infinity/未来/null）', () => {
  const bads = [
    NaN,
    -1,
    -T0,
    'x',
    '1700000000000',
    Infinity,
    -Infinity,
    null,
    undefined,
    {},
    T0 + HOUR
  ]
  for (const bad of bads) {
    const label = `lastAt=${String(bad)}`
    const s = st({ fish: 3, bubble: 3, lastInteractAt: bad, lastPetAt: bad })
    const fed = interact(s, 'feed', T0)
    assert.equal(fed.ok, true, `${label}：喂食视为已到期`)
    assert.equal(fed.state.growth, 1)
    const petted = interact(s, 'pet', T0)
    assert.equal(petted.ok, true, `${label}：点击视为已到期`)
    assert.equal(petted.state.favor, 1)
  }

  // now 本身非法 ⇒ 按 0 归一（等价"很久以前"），不抛错、不把 NaN 写进时间戳
  const r = interact(st({ fish: 3 }), 'feed', NaN)
  assert.equal(r.ok, true)
  assert.ok(Number.isFinite(r.state.lastInteractAt), '绝不写入 NaN 时间戳')
  assert.ok(Number.isFinite(r.state.lastAfkAt))
})

// ————————————————————————————————————————————————————————————————
// ⑧ 纯函数边界：不改入参、不碰视图/定时器字段、畸形 state 不抛错
// ————————————————————————————————————————————————————————————————

test('卡03 · 不碰视图与定时器字段：interact 只返回 anim/text/state（transient/speech/rev 归卡 4）', () => {
  const now = T0 + 30 * MIN
  for (const kind of ['feed', 'bathe', 'pet']) {
    const r = interact(st(), kind, now)
    assert.equal(r.ok, true)
    assert.equal(r.state.transient, null, `${kind}：interact 不写 transient`)
    assert.equal(r.state.transientSelf, false)
    assert.equal(r.state.speech, null, `${kind}：interact 不写气泡（只把 text 交给入口）`)
    assert.ok(!Object.hasOwn(r.state, 'rev'), `${kind}：interact 不动 rev`)
    assert.equal(typeof r.anim, 'string', `${kind}：anim 供卡 4 直接消费`)
    assert.equal(typeof r.text, 'string')
  }

  // 入参里已有的气泡不被成功路径顺手替换（替换是入口的职责，见 design D-6 优先级）
  const withSpeech = st({ speech: { text: '旧气泡', tone: 'good', until: T0 } })
  const r = interact(withSpeech, 'feed', now)
  assert.equal(r.ok, true)
  assert.deepEqual(r.state.speech, withSpeech.speech, 'interact 不改写 speech')
})

test('卡03 · 死亡赋值防御：入参被冻结也不抛错（证明没有就地写字段）', () => {
  const frozen = Object.freeze(st({ fish: 3, bubble: 3, favor: 0, growth: 0 }))
  for (const kind of ['feed', 'bathe', 'pet']) {
    const r = interact(frozen, kind, T0 + 30 * MIN)
    assert.equal(r.ok, true, kind)
  }
  assert.equal(frozen.fish, 3)
  assert.equal(frozen.growth, 0)
  assert.equal(frozen.favor, 0)
})

test('卡03 · 畸形 state 不抛错：缺字段/非对象按"没有道具 / 从 0 起算"处理', () => {
  for (const badState of [undefined, null, [], 'x', 42, {}]) {
    const r = interact(badState, 'feed', T0)
    assertReject(r, 'no-item')

    const petted = interact(badState, 'pet', T0)
    assert.equal(petted.ok, true, `${String(badState)}：点击仍可结算`)
    assert.equal(petted.state.favor, 1, '缺 favor ⇒ 按 0 归一后 +1')
    assert.equal(petted.state.lastPetAt, T0)
  }
})

// ————————————————————————————————————————————————————————————————
// ⑨ 文案硬约束（specs/pet-favor R4：无数字、无时长单位、无增量数字）
// ————————————————————————————————————————————————————————————————

test('卡03 · 文案：共享冷却句逐字采用 design D-9，且全部互动文案无数字/时长单位', () => {
  assert.equal(SHARED_COOLING_TEXT, '刚互动过啦，让我歇一会儿～', '逐字采用 design D-9')
  const used = [SHARED_COOLING_TEXT, TEXT.noFish, TEXT.noBubble, TEXT.feedOk, TEXT.batheOk, TEXT.petOk]
  for (const text of used) {
    assert.ok(!/\d/.test(text), `MUST NOT 含阿拉伯数字：${text}`)
    assert.ok(!/分钟|小时|秒/.test(text), `MUST NOT 含时长单位：${text}`)
    assert.ok(!/[+-]\d+/.test(text), `MUST NOT 含属性增量数字：${text}`)
  }
  // 同一个 reason 在不同道具下给出不同的话（"没有小鱼干" ≠ "没有沐浴泡泡"）
  assert.notEqual(TEXT.noFish, TEXT.noBubble)
})

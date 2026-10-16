/**
 * 存档读写（specs/pet-vitals"状态存档"requirement 的全部 scenario + 任务卡负向自检）。
 *
 * 覆盖：schemaVersion:2 / 99 / JSON 截断 ⇒ 备份 state.json.bad + 初始值重建 + console.warn 固定文案；
 * 正常恢复且不追算离线（lastSettledAt 启动重置）；原子写等价（tmp → 读回校验 → 覆盖正式）；
 * 字段清洗（NaN/字符串/负数/超界不污染状态）。
 * 纯函数层（deserialize/serialize/sanitizeState）+ 入口层（mock api.fs）双层覆盖。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import pet from '../index.js'
import { deserialize, sanitizeState, serialize } from '../lib/persist.js'
import { initialState } from '../lib/settle.js'
import { makeApi, flush } from './helpers/mock-api.js'

const T0 = 1_700_000_000_000
const DAY3 = 3 * 86_400_000

/** 捕获 console.warn（替换实现，测试结束自动恢复；不让日志噪音进测试输出） */
function captureWarn(t) {
  const calls = []
  t.mock.method(console, 'warn', (...args) => {
    calls.push(args.map(String).join(' '))
  })
  return calls
}

/** 完整合法的 v1 存档文本（字段齐全、含浮点） */
function validSave(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    hunger: 42.5,
    clean: 55.25,
    mood: 66.75,
    fish: 7,
    bubble: 2,
    growth: 123.4,
    hungerDropAcc: 3.5,
    cleanDropAcc: 1.25,
    recoverAcc: 2,
    afkAcc: 600,
    lastSettledAt: T0 - DAY3, // 关闭 3 天前写的
    lastPetAt: T0 - DAY3 - 1000,
    ...overrides
  })
}

// ————— 纯函数层 —————

test('存档 · 正常恢复：schemaVersion 1 且字段完整 ⇒ 浮点真值原样恢复（不取整）', () => {
  const r = deserialize(validSave())
  assert.equal(r.ok, true)
  assert.equal(r.state.hunger, 42.5)
  assert.equal(r.state.clean, 55.25)
  assert.equal(r.state.mood, 66.75)
  assert.equal(r.state.fish, 7)
  assert.equal(r.state.bubble, 2)
  assert.equal(r.state.growth, 123.4)
  assert.equal(r.state.hungerDropAcc, 3.5, '联动账本零头跨重启保留')
  assert.equal(r.state.afkAcc, 600, '挂机账跨重启保留（离线时长不追加进来）')
  assert.equal(r.state.lastPetAt, T0 - DAY3 - 1000, '冷却基准持久化（重启不重置冷却）')
})

test('存档 · 版本不受支持：schemaVersion 2 / 99 ⇒ { ok:false, reason:"version" }', () => {
  assert.deepEqual(deserialize(validSave({ schemaVersion: 2 })), { ok: false, reason: 'version' })
  assert.deepEqual(deserialize(validSave({ schemaVersion: 99 })), { ok: false, reason: 'version' })
})

test('存档 · 版本号缺失/畸形同样按不受支持处理（缺失、0、-1、1.5、字符串 "1"）', () => {
  for (const v of [undefined, 0, -1, 1.5, '1', null]) {
    const r = deserialize(validSave({ schemaVersion: v }))
    assert.equal(r.ok, false, `schemaVersion=${String(v)}`)
    assert.equal(r.reason, 'version')
  }
})

test('存档 · JSON 截断/非对象 ⇒ { ok:false, reason:"parse" }（损坏路径，不回传半成品状态）', () => {
  assert.deepEqual(deserialize('{"schemaVersion":1,"hunger":'), { ok: false, reason: 'parse' })
  assert.deepEqual(deserialize(''), { ok: false, reason: 'parse' })
  assert.deepEqual(deserialize('null'), { ok: false, reason: 'parse' })
  assert.deepEqual(deserialize('"state"'), { ok: false, reason: 'parse' })
  assert.deepEqual(deserialize('[1,2]'), { ok: false, reason: 'parse' })
})

test('存档 · 字段清洗：mood 为 NaN/字符串/负数/超 100 ⇒ 钳制或回退，不污染状态', () => {
  const s = sanitizeState({
    schemaVersion: 1,
    mood: NaN, // ⇒ 回退初值 100
    hunger: '50', // 字符串按拒绝 ⇒ 回退 100（口径见 lib/persist.js 头注释）
    clean: -5, // ⇒ 钳 0
    fish: 2.7, // ⇒ floor 2
    bubble: -3, // ⇒ 钳 0
    growth: -10, // ⇒ 钳 0
    hungerDropAcc: 500, // ⇒ 钳回一个周期内（防读档瞬间爆发式扣分）
    recoverAcc: 'x', // ⇒ 0
    afkAcc: 99999, // ⇒ 钳 1200
    lastPetAt: 'abc' // ⇒ 0
  })
  assert.equal(s.mood, 100)
  assert.equal(s.hunger, 100)
  assert.equal(s.clean, 0)
  assert.equal(s.fish, 2)
  assert.equal(s.bubble, 0)
  assert.equal(s.growth, 0)
  assert.ok(s.hungerDropAcc <= 10)
  assert.equal(s.recoverAcc, 0)
  assert.ok(s.afkAcc <= 1200)
  assert.equal(s.lastPetAt, 0)
  // 全字段缺失 ⇒ 完整初始形状（三属性 100、库存 3/3、成长 0）
  const fresh = sanitizeState({ schemaVersion: 1 })
  assert.deepEqual(
    { h: fresh.hunger, c: fresh.clean, m: fresh.mood, f: fresh.fish, b: fresh.bubble, g: fresh.growth },
    { h: 100, c: 100, m: 100, f: 3, b: 3, g: 0 }
  )
})

test('存档 · serialize 白名单：顶层含 schemaVersion:1，运行时字段（transient/speech/lastInteractAt）不落盘', () => {
  const s = {
    ...initialState(T0),
    // 卡 17（Q15=B）：`hidden` 是卡 15 留下的**废字段**——这里故意把它塞进内存状态，
    // 断言 serialize 不再写它、deserialize 读回来也不认它（旧存档兼容见 actions-hidden.test.js）
    hidden: true,
    position: { x: 120, y: 340 }, // 卡 15（D-13）：拖动位置**要**落盘
    transient: { status: 'run-left', until: T0 + 1800 }, // 卡 18（Q16）：随机表演也走这个运行时字段
    // 卡 15 换文案（D-16）：原'吃饱啦（饥饿度 +5）'含属性增量数字 ⇒ 废止
    speech: { text: '呜哇！小鱼干好好吃！', tone: 'good', until: T0 + 2600 }
  }
  const text = serialize(s)
  const parsed = JSON.parse(text)
  assert.equal(parsed.schemaVersion, 1)
  assert.ok(!('transient' in parsed), '瞬时动画不落盘（重启即清；卡 18 的随机表演也走它）')
  assert.ok(!('speech' in parsed), '气泡不落盘')
  assert.ok(!('lastInteractAt' in parsed), '交互时刻不落盘（启动重置）')
  assert.ok(!('hidden' in parsed), '卡 17：废字段 hidden 不再落盘')
  assert.ok(!('trotUntil' in parsed), '卡 18：Q10/Q14 的 trotUntil 已随小跑定时器退役，更不该落盘')
  // 往返一致：deserialize(serialize(s)) 的持久化字段逐一还原（卡 15 增 position，卡 17 删 hidden）
  const back = deserialize(text)
  assert.equal(back.ok, true)
  for (const k of ['hunger', 'clean', 'mood', 'fish', 'bubble', 'growth', 'hungerDropAcc', 'cleanDropAcc', 'recoverAcc', 'afkAcc', 'lastSettledAt', 'lastPetAt', 'position']) {
    assert.deepEqual(back.state[k], s[k], k)
  }
  assert.equal('hidden' in back.state, false, '读回来的状态里没有 hidden')
  assert.equal('trotUntil' in back.state, false, '读回来的状态里也没有 trotUntil（卡 18 起该字段不存在）')
  assert.equal(back.state.transient, null)
  assert.equal(back.state.speech, null)
})

// ————— 入口层（mock api.fs） —————

test('pet-vitals · 存档版本不受支持：schemaVersion 2 ⇒ 备份 state.json.bad + 按初始值重建 + warn', async (t) => {
  const warns = captureWarn(t)
  const bad = validSave({ schemaVersion: 2 })
  const { api, rec } = makeApi({ files: { 'state.json': bad } })
  const cleanup = pet(api)
  await flush()

  assert.equal(rec.fs.get('state.json.bad'), bad, '原文件被逐字备份为 state.json.bad（MUST NOT 静默丢弃）')
  assert.ok(warns.includes('[pet] 存档版本不受支持，已备份并重建'), `warn 文案逐字；实际: ${JSON.stringify(warns)}`)

  const reply = await rec.send('pet.ready')
  assert.equal(reply.ok, true)
  assert.deepEqual(reply.state.vitals, { hunger: 100, clean: 100, mood: 100 }, '按初始值重新开始')
  assert.deepEqual(reply.state.items, { fish: 3, bubble: 3 })
  assert.equal(reply.state.growth.value, 0)
  cleanup()
})

test('pet-vitals · schemaVersion 99（负向自检）与 JSON 截断 ⇒ 同样备份重建，日志文案分别为版本/损坏', async (t) => {
  const warns = captureWarn(t) // 一个捕获器覆盖两段（console.warn 只 mock 一次，避免重复 mock 的状态问题）

  const truncated = '{"schemaVersion":1,"hunger":'
  const { api, rec } = makeApi({ files: { 'state.json': truncated } })
  const cleanup = pet(api)
  await flush()
  assert.equal(rec.fs.get('state.json.bad'), truncated)
  assert.ok(warns.includes('[pet] state.json 损坏，已按初始值重建'), `实际: ${JSON.stringify(warns)}`)
  cleanup()

  const v99 = validSave({ schemaVersion: 99 })
  const m2 = makeApi({ files: { 'state.json': v99 } })
  const cleanup2 = pet(m2.api)
  await flush()
  assert.equal(m2.rec.fs.get('state.json.bad'), v99)
  assert.ok(warns.includes('[pet] 存档版本不受支持，已备份并重建'), `实际: ${JSON.stringify(warns)}`)
  cleanup2()
})

test('pet-vitals · 正常恢复且不追算离线：关闭 3 天重启 ⇒ 按存档恢复 + lastSettledAt 重置为当前时刻', async (t) => {
  let now = T0
  t.mock.method(Date, 'now', () => now)
  const { api, rec } = makeApi({ files: { 'state.json': validSave() } })
  const cleanup = pet(api)
  await flush()

  const ready = await rec.send('pet.ready')
  assert.equal(ready.state.vitals.hunger, 42.5, '按存档恢复（浮点真值直发，显示取整归页面）')
  assert.equal(ready.state.items.fish, 7)
  assert.equal(ready.state.growth.value, 123.4)

  // 第一个 tick：Date.now 仍钉在 T0 ⇒ dt=0 ⇒ 完全不动（若追算离线 3 天，hunger 早已钳 0）
  rec.tick()
  const after = await rec.send('pet.ready')
  assert.equal(after.state.vitals.hunger, 42.5, '不追算关闭的 3 天')
  assert.equal(after.state.items.fish, 7, '离线期间不挂机')

  // 再推进 60s：只扣这 60s 的衰减（lastSettledAt 已重置为启动时刻）
  now = T0 + 60_000
  rec.tick()
  const later = await rec.send('pet.ready')
  assert.ok(Math.abs(later.state.vitals.hunger - 41.5) < 1e-9, '60s ⇒ hunger -1（而不是 -4320）')
  cleanup()
})

test('存档 · 原子写等价：写 state.json.tmp → 读回校验 → 覆盖 state.json（api.fs 无 rename 的取舍）', async (t) => {
  let now = T0
  t.mock.method(Date, 'now', () => now)
  const { api, rec } = makeApi()
  const cleanup = pet(api)
  await flush()

  // 推进 60s 触发一次"有变化"的结算 ⇒ 写盘
  now = T0 + 60_000
  rec.tick()
  await flush()

  const writes = rec.fsLog.filter(([op]) => op === 'writeFile' || op === 'readFile')
  const tmpWrite = writes.findIndex(([op, p]) => op === 'writeFile' && p === 'state.json.tmp')
  assert.ok(tmpWrite >= 0, 'fs 调用序列: ' + JSON.stringify(rec.fsLog))
  assert.deepEqual(writes[tmpWrite + 1], ['readFile', 'state.json.tmp'], '写 tmp 后先读回校验')
  assert.deepEqual(writes[tmpWrite + 2], ['writeFile', 'state.json'], '校验通过才覆盖正式文件')

  const persisted = JSON.parse(rec.fs.get('state.json'))
  assert.equal(persisted.schemaVersion, 1, '顶层含 schemaVersion:1')
  assert.equal(rec.fs.get('state.json.tmp'), rec.fs.get('state.json'), 'tmp 与正式文件同文')
  cleanup()
})

test('存档 · 首次安装无 state.json ⇒ 空态按初始值，不产生备份、不打损坏日志', async (t) => {
  const warns = captureWarn(t)
  const { api, rec } = makeApi()
  const cleanup = pet(api)
  await flush()
  const ready = await rec.send('pet.ready')
  assert.deepEqual(ready.state.vitals, { hunger: 100, clean: 100, mood: 100 })
  assert.deepEqual(ready.state.items, { fish: 3, bubble: 3 })
  assert.equal(rec.fs.has('state.json.bad'), false)
  assert.equal(warns.length, 0, '空态是正常路径，不该有 warn')
  cleanup()
})

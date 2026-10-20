/**
 * 存档读写（specs/pet-values R4「载入 v1 存档」；design D-1 字段表 / D-7 迁移表 / D-9 文案）。
 *
 * ⚠️ 本文件是 v1 用例的改写：v1 钉着的 `hunger`/`clean`/`mood` 恢复与清洗、`hungerDropAcc`/
 * `cleanDropAcc`/`recoverAcc`/`afkAcc` 流水账、"`lastInteractAt` 不落盘（启动重置）"全部指向
 * 已删除的能力（三属性与联动记账、启动重置式结算）。v2 的口径相反：
 *
 * - 持久化的只有 `growth`/`favor`/道具/四个时间戳/诊断/位置（design D-1），**运行时字段**
 *   （`transient`/`transientSelf`/`speech`）不落盘；
 * - `lastInteractAt` / `lastPetAt` 是**冷却基准**，必须持久化（否则"冷却跨重启有效"不成立）；
 * - v1 存档走**白名单丢弃**（三属性既不读也不报错，更不触发 `state.json.bad`），好感置 0；
 * - 只有 JSON 坏 / schemaVersion 不受支持才"备份 + 初始值重建"。
 *
 * 纯函数层（deserialize/serialize/sanitizeState）+ 入口层（mock api.fs）双层覆盖。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import pet from '../index.js'
import { SCHEMA_VERSION } from '../lib/constants.js'
import { deserialize, sanitizeState, serialize } from '../lib/persist.js'
import { initialState } from '../lib/settle.js'
import { makeApi, flush } from './helpers/mock-api.js'

const T0 = 1_700_000_000_000

/** 捕获 console.warn（故障注入测试必然产生 [pet] 日志，收进断言而不是喷到测试输出里） */
function captureWarn(t) {
  const calls = []
  t.mock.method(console, 'warn', (...args) => {
    calls.push(args.map(String).join(' '))
  })
  return calls
}

/** 一份 v1 时代的存档（带三属性与联动流水账；v2 必须只挑认识的字段） */
function v1Save(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    hunger: 42.5,
    clean: 55.25,
    mood: 66.75,
    fish: 7,
    bubble: 5,
    growth: 120,
    hungerDropAcc: 3.5,
    cleanDropAcc: 1.25,
    recoverAcc: 2,
    afkAcc: 600,
    lastSettledAt: T0 - 1000,
    lastInteractAt: T0 - 500_000,
    lastPetAt: T0 - 100_000,
    growthRate: 1.8,
    ...overrides
  })
}

// ————— 纯函数层 —————

test('存档 · 正常恢复（v2）：growth/favor/道具/冷却基准与累积基准原样恢复', () => {
  const text = JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    growth: 12,
    favor: 34,
    fish: 7,
    bubble: 2,
    lastInteractAt: T0 - 500_000,
    lastPetAt: T0 - 100_000,
    lastGrowthAt: T0 - 3_600_000,
    lastAfkAt: T0 - 60_000,
    lastTextAt: T0 - 30_000,
    diagnostic: '',
    position: { x: 10, y: 20 }
  })
  const r = deserialize(text, T0)
  assert.equal(r.ok, true)
  assert.equal(r.state.growth, 12)
  assert.equal(r.state.favor, 34)
  assert.equal(r.state.fish, 7)
  assert.equal(r.state.bubble, 2)
  assert.equal(r.state.lastInteractAt, T0 - 500_000, '共享冷却基准持久化（重启仍按上次成功互动算）')
  assert.equal(r.state.lastPetAt, T0 - 100_000, '点击冷却基准持久化')
  assert.equal(r.state.lastGrowthAt, T0 - 3_600_000, '累积基准原样保留（重开后据此补算）')
  assert.deepEqual(r.state.position, { x: 10, y: 20 }, '拖动位置照常读入')
  assert.equal(r.migratedFromV1, false, 'v2 存档不会被误判成 v1')
})

test('存档 · v1 存档迁移：保留 growth/道具/时间戳，favor 置 0，三属性与流水账被彻底丢弃', () => {
  const r = deserialize(v1Save(), T0)
  assert.equal(r.ok, true)
  assert.equal(r.state.growth, 120, '成长值保留')
  assert.equal(r.state.fish, 7)
  assert.equal(r.state.bubble, 5)
  assert.equal(r.state.lastInteractAt, T0 - 500_000)
  assert.equal(r.state.lastPetAt, T0 - 100_000)
  assert.equal(r.state.favor, 0, '好感初始化为 0（三属性不折算成好感）')
  assert.equal(r.migratedFromV1, true, '识别出 v1 存档（供入口写一次迁移诊断）')
  for (const key of ['hunger', 'clean', 'mood', 'hungerDropAcc', 'cleanDropAcc', 'recoverAcc', 'afkAcc', 'lastSettledAt', 'growthRate']) {
    assert.equal(key in r.state, false, `v1 字段 ${key} 必须被白名单丢弃`)
  }
  // 写回文本里也查不到它们（serialize 是白名单 ⇒ 迁移不可逆）
  const back = JSON.parse(serialize(r.state))
  for (const key of ['hunger', 'clean', 'mood', 'growthRate']) {
    assert.equal(key in back, false, `写回文本里不应有 ${key}`)
  }
})

test('存档 · 版本不受支持 / JSON 损坏：分别返回 reason:"version" 与 reason:"parse"（不回传半成品）', () => {
  assert.deepEqual(deserialize(v1Save({ schemaVersion: 2 }), T0), { ok: false, reason: 'version' })
  assert.deepEqual(deserialize(v1Save({ schemaVersion: 99 }), T0), { ok: false, reason: 'version' })
  for (const v of [undefined, 0, -1, 1.5, '1', null]) {
    const r = deserialize(v1Save({ schemaVersion: v }), T0)
    assert.equal(r.ok, false, `schemaVersion=${String(v)}`)
    assert.equal(r.reason, 'version')
  }
  for (const broken of ['{"schemaVersion":1,"growth":', '', 'null', '"state"', '[1,2]']) {
    assert.deepEqual(deserialize(broken, T0), { ok: false, reason: 'parse' }, `损坏输入：${broken}`)
  }
})

test('存档 · 字段清洗：脏字段一律归一，且不污染状态（不阻止启动）', () => {
  const s = sanitizeState(
    {
      growth: -10, // ⇒ 0
      favor: 'abc', // ⇒ 0（数字字符串按拒绝处理）
      fish: 2.7, // ⇒ floor 2
      bubble: -3, // ⇒ 0
      lastInteractAt: T0 + 999, // 未来 ⇒ 0（视为已到期，不把互动永久锁死）
      lastPetAt: 'abc', // ⇒ 0
      lastGrowthAt: 'x', // 非法 ⇒ 0（视为已到期，最多补到 24 小时上限）
      lastTextAt: -5 // 负数 ⇒ 0
    },
    T0
  )
  assert.equal(s.growth, 0)
  assert.equal(s.favor, 0)
  assert.equal(s.fish, 2)
  assert.equal(s.bubble, 0)
  assert.equal(s.lastInteractAt, 0)
  assert.equal(s.lastPetAt, 0)
  assert.equal(s.lastGrowthAt, 0)
  assert.equal(s.lastTextAt, 0)
  // 全字段缺失 ⇒ 完整初始形状（成长/好感 0、道具 3/3、累积基准 = now）
  const fresh = sanitizeState({ schemaVersion: SCHEMA_VERSION }, T0)
  assert.deepEqual(
    { g: fresh.growth, f: fresh.favor, fish: fresh.fish, bubble: fresh.bubble },
    { g: 0, f: 0, fish: 3, bubble: 3 }
  )
  assert.equal(fresh.lastGrowthAt, T0, '缺失 ⇒ now（不补算历史）')
  assert.equal(fresh.lastAfkAt, T0)
})

test('存档 · serialize 白名单：运行时字段不落盘，冷却基准必须落盘，往返一致', () => {
  const s = {
    ...initialState(T0),
    growth: 3,
    favor: 9,
    position: { x: 120, y: 340 },
    transient: { status: 'run-left', until: T0 + 1800 },
    transientSelf: true,
    speech: { text: '咕噜咕噜～被摸摸好舒服！', tone: 'good', until: T0 + 4000 }
  }
  const parsed = JSON.parse(serialize(s))
  assert.equal(parsed.schemaVersion, SCHEMA_VERSION)
  for (const gone of ['transient', 'transientSelf', 'speech', 'hidden', 'trotUntil']) {
    assert.equal(gone in parsed, false, `运行时/废字段 ${gone} 不落盘`)
  }
  for (const kept of ['growth', 'favor', 'fish', 'bubble', 'lastInteractAt', 'lastPetAt', 'lastGrowthAt', 'lastAfkAt', 'lastTextAt', 'position']) {
    assert.ok(kept in parsed, `${kept} 必须落盘（design D-1 字段表）`)
  }
  // 往返一致：持久化字段逐一还原，运行时字段读回来是干净值
  const back = deserialize(serialize(s), T0)
  assert.equal(back.ok, true)
  for (const key of ['growth', 'favor', 'fish', 'bubble', 'lastInteractAt', 'lastPetAt', 'lastGrowthAt', 'lastAfkAt', 'lastTextAt', 'position']) {
    assert.deepEqual(back.state[key], s[key], key)
  }
  assert.equal(back.state.transient, null)
  assert.equal(back.state.transientSelf, false)
  assert.equal(back.state.speech, null)
})

// ————— 入口层（mock api.fs） —————

test('pet-values · 存档版本不受支持：备份 state.json.bad + 按初始值重建 + warn（不静默丢弃）', async (t) => {
  const warns = captureWarn(t)
  const bad = v1Save({ schemaVersion: 2 })
  const { api, rec } = makeApi({ files: { 'state.json': bad } })
  const cleanup = pet(api)
  await flush()

  assert.equal(rec.fs.get('state.json.bad'), bad, '原文件被逐字备份为 state.json.bad')
  assert.ok(warns.includes('[pet] 存档版本不受支持，已备份并重建'), `warn 文案逐字；实际: ${JSON.stringify(warns)}`)

  const reply = await rec.send('pet.ready')
  assert.equal(reply.ok, true)
  assert.deepEqual(reply.state.items, { fish: 3, bubble: 3 }, '按初始值重新开始')
  assert.equal(reply.state.values.growth, 0)
  assert.equal(reply.state.values.favor, 0)
  assert.equal(reply.state.values.levelName, '初次见面')
  cleanup()
})

test('pet-values · 正常恢复且按存档补算：3 天前的 lastGrowthAt 在首次 tick 补到 24 小时上限', async (t) => {
  let now = T0
  t.mock.method(Date, 'now', () => now)
  const save = JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    growth: 5,
    favor: 20,
    fish: 7,
    bubble: 5,
    lastGrowthAt: T0 - 3 * 86_400_000, // 关闭三天前
    lastAfkAt: T0,
    lastInteractAt: 0,
    lastPetAt: 0,
    position: null
  })
  const { api, rec } = makeApi({ files: { 'state.json': save } })
  const cleanup = pet(api)
  await flush()

  const ready = await rec.send('pet.ready')
  assert.equal(ready.state.values.growth, 5, '读档后不立即补算（等 tick）')
  assert.equal(ready.state.values.favor, 20, '好感按存档恢复')
  assert.equal(ready.state.values.level, 2, '20 恰好跨进第 2 级「点头之交」')
  assert.equal(ready.state.items.fish, 7)

  // 第一个 tick：按存档的 lastGrowthAt 一次性补算，单次上限 24 小时（防改时钟刷值）
  now = T0 + 1
  rec.tick()
  const after = await rec.send('pet.ready')
  assert.equal(after.state.values.growth, 5 + 24, '三天 ⇒ 只补 24 点（上限）')
  cleanup()
})

test('存档 · 原子写等价：写 state.json.tmp → 读回校验 → 覆盖 state.json（api.fs 无 rename 的取舍）', async (t) => {
  let now = T0
  t.mock.method(Date, 'now', () => now)
  const { api, rec } = makeApi()
  const cleanup = pet(api)
  await flush()

  // 一次成功互动改变整数签名 ⇒ 立即写盘（不等节流）
  now = T0 + 1000
  const r = await rec.send('pet.interact', { kind: 'feed' })
  assert.equal(r.ok, true)
  await flush()

  const writes = rec.fsLog.filter(([op]) => op === 'writeFile' || op === 'readFile')
  const tmpWrite = writes.findIndex(([op, p]) => op === 'writeFile' && p === 'state.json.tmp')
  assert.ok(tmpWrite >= 0, 'fs 调用序列: ' + JSON.stringify(rec.fsLog))
  assert.deepEqual(writes[tmpWrite + 1], ['readFile', 'state.json.tmp'], '写 tmp 后先读回校验')
  assert.deepEqual(writes[tmpWrite + 2], ['writeFile', 'state.json'], '校验通过才覆盖正式文件')

  const persisted = JSON.parse(rec.fs.get('state.json'))
  assert.equal(persisted.schemaVersion, SCHEMA_VERSION, '顶层含 schemaVersion:1（不抬版本，读旧档走迁移）')
  assert.equal(persisted.fish, 2, '道具消耗已落盘')
  assert.equal(persisted.growth, 1, '成长值已落盘')
  assert.equal(persisted.favor, 1, '好感值已落盘')
  assert.equal(rec.fs.get('state.json.tmp'), rec.fs.get('state.json'), 'tmp 与正式文件同文')
  cleanup()
})

test('存档 · 首次安装无 state.json ⇒ 空态按初始值，不产生备份、不打损坏日志', async (t) => {
  const warns = captureWarn(t)
  const { api, rec } = makeApi()
  const cleanup = pet(api)
  await flush()
  const ready = await rec.send('pet.ready')
  assert.deepEqual(ready.state.items, { fish: 3, bubble: 3 })
  assert.deepEqual(ready.state.values, { growth: 0, favor: 0, level: 1, levelName: '初次见面' })
  assert.equal(rec.fs.has('state.json.bad'), false)
  assert.equal(warns.length, 0, '空态是正常路径，不该有 warn')
  cleanup()
})

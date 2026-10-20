/**
 * 卡 01 · values-and-store 的验收测试（specs/pet-values 的 R1–R4 + specs/pet-vitals 的 4 条 REMOVED）。
 *
 * 只测**卡 1 的所有权范围**：`lib/constants.js`、`lib/growth.js`、`lib/persist.js`、`lib/settle.js`、
 * `lib/mapping.js`（+ `lib/vitals.js` 已删除这件事本身）。互动成功的 +1 落地在卡 3 的
 * `lib/interact.js`、定时器与视图字段落地在卡 4，两者**不在本文件里重测**，
 * 这里只钉住它们要消费的常量口径与"结算不越权改 favor/growth"。
 *
 * 这些用例**不依赖任何旧测试文件**（它们属于卡 6 的清理范围），可以单独跑：
 *   npm test -- test/values.test.js
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import * as C from '../lib/constants.js'
import { accrueGrowth, clamp, finiteOr, levelOf, toNonNegInt } from '../lib/growth.js'
import { animOf, resolveStatus, STATUS_LABEL, STATUS_PRIORITY, STATUS_TRACK } from '../lib/mapping.js'
import { deserialize, sanitizeState, serialize } from '../lib/persist.js'
import { initialState, onWindowDestroyed, settle, startupReset } from '../lib/settle.js'

/** 测试时钟基准（固定值 ⇒ 用例与真实时间无关、可重复） */
const T0 = 1_700_000_000_000
const MIN = 60_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

/** 只允许在迁移识别里出现的 v1 三属性键（本文件里它们是"必须消失"的断言对象） */
const LEGACY_VITAL_KEYS = ['hunger', 'clean', 'mood']

// ————————————————————————————————————————————————————————————————
// ① 常量口径（specs/pet-values R1/R2/R3 + design D-3/D-5）
// ————————————————————————————————————————————————————————————————

test('卡01 · 常量：成长/好感/冷却/节拍与 spec 逐字一致', () => {
  assert.equal(C.GROWTH_PER_INTERACT, 1, '每次成功喂食或洗澡 +1')
  assert.equal(C.GROWTH_PER_HOUR, 1, '连续运行每满 1 小时 +1')
  assert.equal(C.GROWTH_BACKFILL_CAP_HOURS, 24, '单次补算上限 24 小时')
  assert.equal(C.INTERACT_COOLDOWN_MS, 600_000, '喂食/洗澡共享 10 分钟冷却')
  assert.equal(C.PET_COOLDOWN_MS, 3_600_000, '点击 1 小时冷却')
  assert.equal(C.FAVOR_PER_INTERACT, 1, '喂食/洗澡 +1 好感')
  assert.equal(C.FAVOR_PER_PET, 1, '点击 +1 好感')
  assert.equal(C.BUBBLE_MS, 4000, '气泡 4 秒')
  assert.equal(C.TEXT_EVERY_SEC, 300, '定时文本 300 秒')
  assert.equal(C.RANDOM_PERF_EVERY_SEC, 60, '随机表演仍是 60 秒')
  assert.equal(C.AFK_PERIOD_SEC, 1200, '挂机奖励周期不变')
  assert.equal(C.ITEM_CAP, 20)
  assert.equal(C.TICK_SECONDS, 60, 'design D-3：pet-tick 60 秒')
})

test('卡01 · 常量：好感阈值表与 10 个等级名逐字一致', () => {
  assert.deepEqual(C.FAVOR_THRESHOLDS, [0, 20, 50, 90, 140, 200, 280, 380, 500, 650])
  assert.deepEqual(C.FAVOR_LEVEL_NAMES, [
    '初次见面',
    '点头之交',
    '渐渐熟悉',
    '开始依赖',
    '相互惦记',
    '心有灵犀',
    '形影不离',
    '无话不谈',
    '彼此唯一',
    '命定相伴'
  ])
  assert.equal(C.FAVOR_THRESHOLDS.length, 10)
  assert.equal(C.FAVOR_LEVEL_NAMES.length, 10)
  // 阈值必须严格递增（"取满足阈值的最大级"才等价于"单调不减"）
  for (let i = 1; i < C.FAVOR_THRESHOLDS.length; i++) {
    assert.ok(C.FAVOR_THRESHOLDS[i] > C.FAVOR_THRESHOLDS[i - 1], `第 ${i + 1} 级阈值必须大于前一级`)
  }
})

test('卡01 · 随机表演集仍是 7 项且含 playing', () => {
  assert.equal(C.RANDOM_PERF_SET.length, 7)
  assert.deepEqual([...C.RANDOM_PERF_SET].sort(), [
    'bathing',
    'eating',
    'petted',
    'playing',
    'run-left',
    'run-right',
    'trot'
  ])
})

test('卡01 · 三属性常量已整体删除（v1 的 DECAY/联动/成长公式/打盹/旧等级表全部不存在）', () => {
  const removed = [
    'DECAY_PER_SEC',
    'INITIAL_VITALS',
    'FEED_HUNGER',
    'BATHE_CLEAN',
    'PLAY_MOOD',
    'PET_MOOD',
    'GROWTH_BASE_PER_HOUR',
    'GROWTH_PENALTY_PER_STEP',
    'GROWTH_MOOD_STEP',
    'SLEEP_AFTER_MS',
    'LOW_THRESHOLD',
    'LEDGER_STEP',
    'RECOVER_MOOD_CAP',
    'RANK_THRESHOLDS',
    'RANK_NAMES'
  ]
  for (const name of removed) {
    assert.ok(!(name in C), `${name} 必须已从 constants.js 删除`)
  }
})

test('卡01 · lib/vitals.js 已删除（模块解析失败）', async () => {
  await assert.rejects(() => import('../lib/vitals.js'))
})

// ————————————————————————————————————————————————————————————————
// ② 成长值（R1）：三个来源 + 关窗不计
// ————————————————————————————————————————————————————————————————

test('卡01 · 成长值：不足一小时不动、满一小时 +1、基准推进整小时', () => {
  const s0 = initialState(T0)

  const partial = settle(s0, T0 + HOUR - 1, { overlayExists: true })
  assert.equal(partial.state.growth, 0, '差 1 毫秒不满一小时 ⇒ 不发放')
  assert.equal(partial.state.lastGrowthAt, T0, '零头期间基准不动')
  assert.equal(partial.state.fish > 3, true, '（同一次结算里挂机奖励仍按自己的 1200 秒节拍发放，两者互不影响）')

  const oneHour = settle(s0, T0 + HOUR, { overlayExists: true })
  assert.equal(oneHour.state.growth, 1, '满一小时恰好 +1')
  assert.equal(oneHour.state.lastGrowthAt, T0 + HOUR, '基准推进一小时')
  assert.equal(oneHour.changed, true)

  // 1.9 小时：发 1 点、基准只推进 1 小时 ⇒ 剩余 0.9 小时不丢
  const mixed = settle(s0, T0 + HOUR + 54 * MIN, { overlayExists: true })
  assert.equal(mixed.state.growth, 1)
  assert.equal(mixed.state.lastGrowthAt, T0 + HOUR, '基准按整小时推进，零头保留')
  const after = settle(mixed.state, T0 + 2 * HOUR, { overlayExists: true })
  assert.equal(after.state.growth, 2, '零头接着攒满第二个小时')
})

test('卡01 · 成长值：连续运行三小时 +3（每小时一个来源）', () => {
  const r = settle(initialState(T0), T0 + 3 * HOUR, { overlayExists: true })
  assert.equal(r.state.growth, 3)
  assert.equal(r.state.favor, 0, '成长值的结算不碰好感值')
})

test('卡01 · 成长值：补算上限 24 小时，且基准直接推到当前时刻', () => {
  const online = settle(initialState(T0), T0 + 100 * HOUR, { overlayExists: true })
  assert.equal(online.state.growth, C.GROWTH_BACKFILL_CAP_HOURS, '100 小时只补 24 点')
  assert.equal(online.state.lastGrowthAt, T0 + 100 * HOUR, '被截断时基准直接跳到 now（剩下的零头故意丢弃，防改时钟刷值）')

  // 下一次再结算一小时：从 now 重新计时 ⇒ 只 +1（不会继续追旧账）
  const next = settle(online.state, T0 + 101 * HOUR, { overlayExists: true })
  assert.equal(next.state.growth, C.GROWTH_BACKFILL_CAP_HOURS + 1)
})

test('卡01 · 成长值：accrueGrowth 纯函数（不发负数、幂等、同一 now 重复调用不叠加）', () => {
  const s = { ...initialState(T0), lastGrowthAt: T0 }
  const once = accrueGrowth(s, T0 + 2 * HOUR)
  assert.equal(once.hours, 2)
  assert.equal(once.state.growth, 2)
  const twice = accrueGrowth(once.state, T0 + 2 * HOUR)
  assert.equal(twice.hours, 0, '同一 now 再算 ⇒ 0 小时（幂等）')
  assert.equal(twice.state.growth, 2)
  assert.equal(accrueGrowth({ ...s, lastGrowthAt: T0 + 5 * HOUR }, T0).hours, 0, '回拨不产生负数小时')
  // 基准**缺失**与"坏值"口径不同：缺失 ⇒ 从 now 开始（不补历史）；坏值 ⇒ 0 ⇒ 视为已到期（最多补到上限）
  assert.equal(accrueGrowth({ growth: 0 }, T0).state.growth, 0, '缺 lastGrowthAt ⇒ 从现在开始，不凭空补算')
  assert.equal(accrueGrowth({ growth: 0, lastGrowthAt: 'x' }, T0).state.growth, C.GROWTH_BACKFILL_CAP_HOURS)
})

test('卡01 · 成长值来源①（互动 +1）的常量口径；结算本身永不追加互动点', () => {
  assert.equal(C.GROWTH_PER_INTERACT, 1, '喂食/洗澡成功的那一点由卡 3 的 interact() 写，常量在这里钉住')
  assert.equal(C.FAVOR_PER_INTERACT, 1)
  // 结算只按整小时发放：50 分钟的在线（且没有互动）不产生任何成长值
  const r = settle(initialState(T0), T0 + 50 * MIN, { overlayExists: true })
  assert.equal(r.state.growth, 0)
})

test('卡01 · 关窗不计成长：销毁时基准推到 now，隐藏期间每 tick 跟走，重开不补', () => {
  // 先在线跑满一小时，拿到 1 点
  const online = settle(initialState(T0), T0 + HOUR, { overlayExists: true }).state
  assert.equal(online.growth, 1)

  // 销毁浮层窗口（design D-3 硬细节：销毁路径必须把 lastGrowthAt 推到 now）
  const destroyedAt = T0 + HOUR
  const destroyed = onWindowDestroyed(online, destroyedAt)
  assert.equal(destroyed.lastGrowthAt, destroyedAt, '销毁时基准被推进到当时')
  assert.equal(destroyed.lastAfkAt, destroyedAt, '挂机基准同样推进（关窗暂停挂机）')

  // 隐藏三小时：tick 仍在跑，但 overlayExists=false ⇒ 每个 tick 只把基准推到当时，不发放
  let hidden = destroyed
  for (let i = 1; i <= 180; i++) {
    hidden = settle(hidden, destroyedAt + i * MIN, { overlayExists: false }).state
  }
  assert.equal(hidden.growth, 1, '隐藏期间成长值一点没涨')

  // 重新打开：这 3 小时 MUST NOT 因关窗而增加
  const reopened = settle(hidden, destroyedAt + 3 * HOUR, { overlayExists: true })
  assert.equal(reopened.state.growth, 1, 'R1 scenario「关闭显示期间不涨」')
  assert.equal(reopened.changed, false)

  // 重新打开之后才重新计时：从打开那一刻再满一小时 ⇒ 才 +1
  const oneHourAfterShow = settle(hidden, destroyedAt + 3 * HOUR + HOUR, { overlayExists: true })
  assert.equal(oneHourAfterShow.state.growth, 2)
})

test('卡01 · 关窗不计成长：即使隐藏期间没有 tick（定时器被停），销毁时推的基准也不会追算', () => {
  const online = settle(initialState(T0), T0 + HOUR, { overlayExists: true }).state
  // 销毁后再没 tick；两小时后重开（窗体不存在的那段时间不结算）
  const destroyed = onWindowDestroyed(online, T0 + HOUR)
  const reopenedAt = T0 + 3 * HOUR
  const reopened = settle(destroyed, reopenedAt, { overlayExists: false })
  assert.equal(reopened.state.growth, 1, '窗体不在 ⇒ 一次结算也不发放')
  assert.equal(reopened.state.lastGrowthAt, reopenedAt, '基准被推到重开时刻')
  const later = settle(reopened.state, reopenedAt + HOUR, { overlayExists: true })
  assert.equal(later.state.growth, 2, '从重开那一刻起重新计时')
})

// ————————————————————————————————————————————————————————————————
// ③ 好感值与等级（R2/R3）
// ————————————————————————————————————————————————————————————————

test('卡01 · 好感等级：阈值边界 19→20 / 649→650 / 99999', () => {
  assert.deepEqual(levelOf(0), { level: 1, name: '初次见面' })
  assert.deepEqual(levelOf(19), { level: 1, name: '初次见面' })
  assert.deepEqual(levelOf(20), { level: 2, name: '点头之交' }, '19→20 升级')
  assert.deepEqual(levelOf(49), { level: 2, name: '点头之交' })
  assert.deepEqual(levelOf(50), { level: 3, name: '渐渐熟悉' })
  assert.deepEqual(levelOf(90), { level: 4, name: '开始依赖' })
  assert.deepEqual(levelOf(140), { level: 5, name: '相互惦记' })
  assert.deepEqual(levelOf(200), { level: 6, name: '心有灵犀' })
  assert.deepEqual(levelOf(280), { level: 7, name: '形影不离' })
  assert.deepEqual(levelOf(380), { level: 8, name: '无话不谈' })
  assert.deepEqual(levelOf(500), { level: 9, name: '彼此唯一' })
  assert.deepEqual(levelOf(649), { level: 9, name: '彼此唯一' })
  assert.deepEqual(levelOf(650), { level: 10, name: '命定相伴' })
  assert.deepEqual(levelOf(99999), { level: 10, name: '命定相伴' }, '远超上限仍是第 10 级')
})

test('卡01 · 好感等级：非法输入一律第 1 级（不崩、不越界）', () => {
  for (const bad of [-1, -100, NaN, Infinity, -Infinity, 'abc', '650', null, undefined, {}, [], true]) {
    assert.deepEqual(levelOf(bad), { level: 1, name: '初次见面' }, `${String(bad)} ⇒ 第 1 级`)
  }
})

test('卡01 · 好感只增无上限：归一为非负整数、满级后继续累加、任何时长都不减', () => {
  assert.equal(sanitizeState({ favor: 999_999 }, T0).favor, 999_999, '没有上限（不做钳制）')
  assert.equal(sanitizeState({ favor: -5 }, T0).favor, 0, '负数归 0')
  assert.equal(sanitizeState({ favor: 'abc' }, T0).favor, 0, '非数字归 0')
  assert.equal(sanitizeState({ favor: 12.9 }, T0).favor, 12, '非整数向下取整')

  // 满级后继续 +1：数值继续涨，等级保持第 10 级
  const maxed = { ...initialState(T0), favor: 650 }
  const afterOne = { ...maxed, favor: maxed.favor + C.FAVOR_PER_PET }
  assert.equal(afterOne.favor, 651)
  assert.equal(levelOf(afterOne.favor).level, 10, '满级后不回落、不封顶')

  // 结算不管多久都不改好感值（R2：好感只来自互动，不随时间变化）
  const r = settle({ ...initialState(T0), favor: 42 }, T0 + 30 * DAY, { overlayExists: true })
  assert.equal(r.state.favor, 42)

  // 序列化往返不丢精度
  const state = { ...initialState(T0), favor: 999_999, growth: 12_345 }
  const back = deserialize(serialize(state), T0)
  assert.equal(back.ok, true)
  assert.equal(back.state.favor, 999_999)
  assert.equal(back.state.growth, 12_345)
})

// ————————————————————————————————————————————————————————————————
// ④ 存档迁移与归一（R4 / design D-7）
// ————————————————————————————————————————————————————————————————

/** 一份典型的 v1.0.2 存档（三属性 + 联动流水账 + 挂机账 + lastSettledAt） */
function v1Archive() {
  return {
    schemaVersion: 1,
    hunger: 40,
    clean: 20,
    mood: 70,
    hungerDropAcc: 3,
    cleanDropAcc: 2,
    recoverAcc: 1,
    afkAcc: 600,
    lastSettledAt: T0 - 3 * DAY,
    growth: 120,
    fish: 7,
    bubble: 5,
    lastPetAt: T0 - 5 * MIN,
    position: { x: 100, y: 200 }
  }
}

test('卡01 · 迁移：保留 growth/道具/时间戳/位置，favor=0，lastGrowthAt=now（不补历史）', () => {
  const r = deserialize(JSON.stringify(v1Archive()), T0)
  assert.equal(r.ok, true)
  assert.equal(r.migratedFromV1, true, '旧存档带三属性键 ⇒ 迁移信号')
  assert.equal(r.state.growth, 120, '成长值原样保留')
  assert.equal(r.state.fish, 7)
  assert.equal(r.state.bubble, 5)
  assert.equal(r.state.favor, 0, '好感值初始化为 0')
  assert.equal(r.state.lastPetAt, T0 - 5 * MIN, 'lastPetAt 保留')
  assert.equal(r.state.lastGrowthAt, T0, 'lastGrowthAt 缺失 ⇒ now（不补历史）')
  assert.equal(r.state.lastAfkAt, T0, 'lastAfkAt 缺失 ⇒ now')
  assert.equal(r.state.lastTextAt, T0, 'lastTextAt 缺失 ⇒ now')
  assert.deepEqual(r.state.position, { x: 100, y: 200 })
  assert.equal(r.positionDropped, false)
  assert.equal(levelOf(r.state.favor).level, 1, '迁移后是第 1 级「初次见面」')

  // 迁移后立刻按新口径跑：一小时后才 +1（不会把离线三天补成 72 点）
  const afterHour = settle(r.state, T0 + HOUR, { overlayExists: true })
  assert.equal(afterHour.state.growth, 121)
})

test('卡01 · 迁移：三属性键在状态与写回文本里都不存在', () => {
  const r = deserialize(JSON.stringify(v1Archive()), T0)
  for (const key of LEGACY_VITAL_KEYS) {
    assert.ok(!Object.hasOwn(r.state, key), `state 里不该有 ${key}`)
  }
  const stateText = JSON.stringify(r.state)
  for (const key of LEGACY_VITAL_KEYS) {
    assert.ok(!stateText.includes(`"${key}"`), `JSON.stringify(state) 里不该出现 ${key}`)
  }
  const saved = serialize(r.state)
  for (const key of LEGACY_VITAL_KEYS) {
    assert.ok(!saved.includes(`"${key}"`), `写回存档里不该出现 ${key}`)
  }
  // v1 的联动/挂机流水账与 lastSettledAt 也一并丢弃
  for (const key of ['hungerDropAcc', 'cleanDropAcc', 'recoverAcc', 'afkAcc', 'lastSettledAt']) {
    assert.ok(!stateText.includes(`"${key}"`), `${key} 属于 v1 内部账，v2 不再保留`)
    assert.ok(!saved.includes(`"${key}"`))
  }
})

test('卡01 · 迁移：v2 存档（无三属性键）不会被误判成 v1', () => {
  const v2 = deserialize(serialize({ ...initialState(T0), favor: 30, growth: 4 }), T0)
  assert.equal(v2.ok, true)
  assert.equal(v2.migratedFromV1, false)
  assert.equal(v2.state.favor, 30)
  assert.equal(v2.state.growth, 4)
  assert.equal(v2.state.lastGrowthAt, T0)
})

test('卡01 · 归一：损坏字段不阻止启动（非数字/负数/越界/未来时间戳）', () => {
  const broken = {
    schemaVersion: 1,
    favor: 'abc',
    growth: -5,
    fish: -3,
    bubble: 99,
    lastGrowthAt: 'x',
    lastAfkAt: 'x',
    lastPetAt: 'x',
    lastInteractAt: T0 + DAY, // 未来 ⇒ 视为已到期
    lastTextAt: 'NaN',
    position: { x: '1', y: 2 }
  }
  const r = deserialize(JSON.stringify(broken), T0)
  assert.equal(r.ok, true, 'MUST NOT 因存档损坏而阻止启动')
  assert.equal(r.state.favor, 0, 'spec R4 scenario：favor "abc" ⇒ 0')
  assert.equal(r.state.growth, 0)
  assert.equal(r.state.fish, 0, 'fish -3 ⇒ 0')
  assert.equal(r.state.bubble, 20, '道具越界 ⇒ 钳到 [0,20]')
  assert.equal(r.state.lastGrowthAt, 0, "lastGrowthAt 'x' ⇒ 0 / 视为已到期")
  assert.equal(r.state.lastAfkAt, T0, '挂机基准坏值 ⇒ now（宁可少发，不可一次补满历史）')
  assert.equal(r.state.lastPetAt, 0, '点击冷却坏值 ⇒ 已到期')
  assert.equal(r.state.lastInteractAt, 0, '未来时间 ⇒ 已到期（时钟被拨快也不锁死互动）')
  assert.equal(r.state.position, null, '非法位置 ⇒ 回退 anchor 默认位')
  assert.equal(r.positionDropped, true)

  // 坏掉的 lastGrowthAt=0 ⇒ 视为已到期：本次最多补到 24 小时上限，且不抛错
  const settled = settle(r.state, T0, { overlayExists: true })
  assert.equal(settled.state.growth, C.GROWTH_BACKFILL_CAP_HOURS)
})

test('卡01 · 归一：缺失字段取各自默认值（favor 0 / lastGrowthAt now / 道具 3/3）', () => {
  const r = deserialize(JSON.stringify({ schemaVersion: 1 }), T0)
  assert.equal(r.ok, true)
  assert.equal(r.state.favor, 0)
  assert.equal(r.state.growth, 0)
  assert.equal(r.state.fish, C.INITIAL_FISH)
  assert.equal(r.state.bubble, C.INITIAL_BUBBLE)
  assert.equal(r.state.lastGrowthAt, T0)
  assert.equal(r.state.lastInteractAt, 0, '首装即可喂食（0 = 已到期）')
  assert.equal(r.state.lastPetAt, 0, '首装即可摸头（0 = 已到期）')
  assert.equal(r.state.transient, null)
  assert.equal(r.state.transientSelf, false)

  // 缺失被当成 now ⇒ 不会一次性补 24 点（只有真的跑满一小时才 +1）
  const atOnce = settle(r.state, T0, { overlayExists: true })
  assert.equal(atOnce.state.growth, 0)
  const afterHour = settle(r.state, T0 + HOUR, { overlayExists: true })
  assert.equal(afterHour.state.growth, 1)
})

test('卡01 · 存档整体损坏/版本不受支持 ⇒ 走备份重建（不倒半成品状态）', () => {
  assert.deepEqual(deserialize('{ not json', T0), { ok: false, reason: 'parse' })
  assert.deepEqual(deserialize('[]', T0), { ok: false, reason: 'parse' })
  assert.deepEqual(deserialize('null', T0), { ok: false, reason: 'parse' })
  assert.deepEqual(deserialize(JSON.stringify({ schemaVersion: 2 }), T0), { ok: false, reason: 'version' })
  assert.deepEqual(deserialize(JSON.stringify({ schemaVersion: '1' }), T0), { ok: false, reason: 'version' })
  assert.deepEqual(deserialize(JSON.stringify({}), T0), { ok: false, reason: 'version' })
})

test('卡01 · serialize 白名单 = D-1 字段表（运行时字段不落盘）', () => {
  const state = {
    ...initialState(T0),
    transient: { status: 'eating', until: T0 + 1600 },
    transientSelf: true,
    speech: { text: 'hi', until: T0 + 4000 }
  }
  const saved = JSON.parse(serialize(state))
  assert.deepEqual(Object.keys(saved).sort(), [
    'bubble',
    'diagnostic',
    'favor',
    'fish',
    'growth',
    'lastAfkAt',
    'lastGrowthAt',
    'lastInteractAt',
    'lastPetAt',
    'lastTextAt',
    'position',
    'schemaVersion'
  ])
  assert.equal(saved.schemaVersion, 1, '仍用 schemaVersion 1：v1 存档是"迁移"不是"拒绝"')
  assert.ok(!('transient' in saved), 'transient 不落盘')
  assert.ok(!('transientSelf' in saved), 'transientSelf（来源标记）不落盘')
  assert.ok(!('speech' in saved), 'speech 不落盘')
})

// ————————————————————————————————————————————————————————————————
// ⑤ 状态形状与挂机奖励（D-1 字段表 / specs/pet-economy）
// ————————————————————————————————————————————————————————————————

test('卡01 · initialState 形状与 D-1 一致：favor/growth=0、道具 3/3、时间戳分明', () => {
  const s = initialState(T0)
  assert.deepEqual(Object.keys(s).sort(), [
    'bubble',
    'diagnostic',
    'favor',
    'fish',
    'growth',
    'lastAfkAt',
    'lastGrowthAt',
    'lastInteractAt',
    'lastPetAt',
    'lastTextAt',
    'position',
    'speech',
    'transient',
    'transientSelf'
  ])
  assert.equal(s.favor, 0)
  assert.equal(s.growth, 0)
  assert.equal(s.fish, 3)
  assert.equal(s.bubble, 3)
  assert.equal(s.lastGrowthAt, T0, '累积基准 = now（从现在开始计时）')
  assert.equal(s.lastAfkAt, T0)
  assert.equal(s.lastTextAt, T0)
  assert.equal(s.lastInteractAt, 0, '冷却基准 = 0（已到期，首装即可互动）')
  assert.equal(s.lastPetAt, 0)
  assert.equal(s.transient, null)
  assert.equal(s.transientSelf, false)
  for (const key of LEGACY_VITAL_KEYS) assert.ok(!Object.hasOwn(s, key), `首装状态里不该有 ${key}`)
})

test('卡01 · startupReset：清运行时字段但**不重置** lastGrowthAt（重开要补算）', () => {
  const saved = { ...initialState(T0), lastGrowthAt: T0 - 5 * HOUR, lastAfkAt: T0 - 5 * HOUR }
  const restarted = startupReset({ ...saved, transient: { status: 'eating', until: T0 }, transientSelf: true }, T0)
  assert.equal(restarted.transient, null, '运行时字段读档后一律清空')
  assert.equal(restarted.transientSelf, false)
  assert.equal(restarted.lastGrowthAt, T0 - 5 * HOUR, '基准不被重置（否则"重开补算"永远不发生）')
  const backfilled = settle(restarted, T0, { overlayExists: true })
  assert.equal(backfilled.state.growth, 5, 'R1 scenario：重开按离线时长补算 5 点')
})

test('卡01 · 挂机奖励：基准 lastAfkAt、每 1200 秒各 +1、上限 20', () => {
  // 满一个周期 ⇒ 各 +1
  const one = settle(initialState(T0), T0 + 20 * MIN, { overlayExists: true })
  assert.equal(one.state.fish, 4)
  assert.equal(one.state.bubble, 4)
  assert.equal(one.state.lastAfkAt, T0 + 20 * MIN, '基准推进已发放的整周期')

  // 差一点点 ⇒ 不发（零头留在基准里）
  const partial = settle(initialState(T0), T0 + 20 * MIN - 1, { overlayExists: true })
  assert.equal(partial.state.fish, 3)
  assert.equal(partial.state.lastAfkAt, T0)

  // 三个周期 ⇒ 各 +3
  const three = settle(initialState(T0), T0 + 60 * MIN, { overlayExists: true })
  assert.equal(three.state.fish, 6)
  assert.equal(three.state.bubble, 6)

  // 到顶：各自独立钳 20，且不因到顶停摆（周期照常被消耗）
  const capped = settle({ ...initialState(T0), fish: 20, bubble: 19 }, T0 + 60 * MIN, { overlayExists: true })
  assert.equal(capped.state.fish, 20)
  assert.equal(capped.state.bubble, 20)
  assert.equal(capped.state.lastAfkAt, T0 + 60 * MIN)

  // 窗体不存在 ⇒ 关窗暂停挂机，且基准跟走（重开不补发关窗期间的道具）
  const hidden = settle(initialState(T0), T0 + 60 * MIN, { overlayExists: false })
  assert.equal(hidden.state.fish, 3, '关窗期间不发道具')
  assert.equal(hidden.state.bubble, 3)
  assert.equal(hidden.state.lastAfkAt, T0 + 60 * MIN, '基准被推到当时')
  const reopened = settle(hidden.state, T0 + 61 * MIN, { overlayExists: true })
  assert.equal(reopened.state.fish, 3, '重开后只从重开那一刻重新计时')
})

// ————————————————————————————————————————————————————————————————
// ⑥ 状态映射（R1「成长值不驱动任何功能」/ D-10 取消打盹）
// ————————————————————————————————————————————————————————————————

test('卡01 · 状态表只剩八条（idle + 七条表演轨）：hungry/dirty/sad/sleep 已删除', () => {
  const expected = ['bathing', 'eating', 'idle', 'petted', 'playing', 'run-left', 'run-right', 'trot']
  assert.deepEqual(Object.keys(STATUS_TRACK).sort(), expected)
  assert.deepEqual(Object.keys(STATUS_LABEL).sort(), expected)
  assert.deepEqual(Object.keys(STATUS_PRIORITY).sort(), expected)
  for (const gone of ['hungry', 'dirty', 'sad', 'sleep']) {
    assert.ok(!(gone in STATUS_TRACK), `${gone} 必须已删除`)
  }
})

test('卡01 · resolveStatus：没有属性阈值分支、也不会打盹（长时间无交互仍是 idle）', () => {
  const s = initialState(T0)
  assert.equal(resolveStatus(s, T0), 'idle')
  // 三十天没有任何交互：仍然是 idle（v1 这里会变 sleep）
  assert.equal(resolveStatus({ ...s, lastInteractAt: T0 - 30 * DAY }, T0 + 30 * DAY), 'idle')
  // 成长值/好感值取任何值都不影响状态（R1「成长值不驱动任何功能」）
  for (const n of [0, 1, 100, 10_000]) {
    assert.equal(resolveStatus({ ...s, growth: n }, T0), 'idle')
    assert.equal(resolveStatus({ ...s, favor: n }, T0), 'idle')
    assert.equal(animOf(resolveStatus({ ...s, growth: n, favor: n }, T0)).status, 'idle')
  }
  // 未到期的 transient 仍然优先
  const playing = { ...s, transient: { status: 'eating', until: T0 + 1600 } }
  assert.equal(resolveStatus(playing, T0), 'eating')
  assert.equal(resolveStatus(playing, T0 + 1600), 'idle', '到期即回落')
  // 已删除的状态名走"未知 ⇒ idle"回退
  assert.deepEqual(animOf('hungry'), { row: 0, label: '待机', status: 'idle' })
})

test('卡01 · 数值原语（vitals.js 退役后迁到 growth.js）：只接受真数字，不猜字符串', () => {
  assert.equal(finiteOr(3, 0), 3)
  for (const bad of [NaN, Infinity, -Infinity, '3', null, undefined, {}, []]) {
    assert.equal(finiteOr(bad, 7), 7, `${String(bad)} ⇒ 回退`)
  }
  assert.equal(clamp(15, 0, 10), 10)
  assert.equal(clamp(-1, 0, 10), 0)
  assert.equal(toNonNegInt(-3), 0)
  assert.equal(toNonNegInt(4.9), 4)
  assert.equal(toNonNegInt('4'), 0, '数字字符串按拒绝处理')
})

/**
 * 卡 19 · 父代理裁定 **R54**（v1.0.1 追加）：transient 到期，入口**主动推送一次**。
 *
 * 背景：卡 19 主体（D-1）只解决了"自发表演播完即回呼吸"（页面 `anim.self` + 锁存）。
 * 剩下的另一半是——入口的 `state.transient` 到期**不会产生任何推送**（`resolveStatus` 只是不再认它），
 * 页面因此在"用户点出来的那一轮"播完后仍按最近一次视图的 `anim.status`（优先级 9）继续渲染该轨
 * （进食/洗澡姿态挂着，最长 15 秒；复验报告 D-1「影响面 ③」原文记录了这条）。
 *
 * 修法（落点在**入口**，理由见 index.js 的 armTransientExpiry 注释）：
 * 写 transient 时排一只一次性 `api.timer.setTimeout('pet-transient', N 秒)`；到期后
 * **清 transient + rev++ + hub.wake()**；覆盖时先清后设；窗体销毁/停用/cleanup 时清掉；
 * 未到期（时钟早到）不清不推、按剩余时间重排。
 *
 * 覆盖（对应父代理硬要求 4 的六条）：① 四种互动各自排了期望秒数的定时器；② 到期 rev+1 且视图回落
 * 基础态（含属性过低时回落 hungry/dirty/sad）；③ 新一轮覆盖 ⇒ 旧定时器被清、只留一个；④ cleanup /
 * 窗体销毁 ⇒ 定时器被清（重建时补排）；⑤ 未到期触发 ⇒ 不清、不推、重排；⑥ 自发表演路径不受影响。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import pet from '../index.js'
import {
  INTERACT_COOLDOWN_MS,
  RANDOM_PERF_SET,
  RANDOM_PERF_TIMER_ID,
  TICK_ID,
  TIMER_MAX_SEC,
  TIMER_MIN_SEC,
  TRANSIENT_MS,
  TRANSIENT_TIMER_ID
} from '../lib/constants.js'
import { transientDelaySeconds, transientExpired } from '../lib/mapping.js'
import { initialState } from '../lib/settle.js'
import { flush, makeApi } from './helpers/mock-api.js'

const T0 = 1_700_000_000_000

/** 三种真实互动 → 该轮的动画轨（与 lib/interact.js 的 succeed 分支逐字同值） */
const INTERACTIONS = [
  ['feed', 'eating'],
  ['bathe', 'bathing'],
  ['pet', 'petted']
]

/** 合法存档文本（v2 字段集，可按用例覆盖） */
function saveText(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    fish: 3,
    bubble: 3,
    growth: 0,
    favor: 0,
    lastGrowthAt: T0,
    lastAfkAt: T0,
    lastPetAt: 0,
    position: null,
    ...overrides
  })
}

function activate(t, opts = {}) {
  let now = T0
  t.mock.method(Date, 'now', () => now)
  const m = makeApi(opts)
  const cleanup = pet(m.api)
  return {
    ...m,
    cleanup,
    now: () => now,
    advance: (ms) => {
      now += ms
    },
    tick: () => m.rec.timers.get(TICK_ID).cb(),
    perf: () => m.rec.timers.get(RANDOM_PERF_TIMER_ID).cb(),
    /** 当前挂着的到期推送定时器（mock：同 id 覆盖 ⇒ 取到的永远是"最新那一只"） */
    expiry: () => m.rec.timers.get(TRANSIENT_TIMER_ID),
    /** 与 pet-transient 相关的 timer 调用序列（断言"先清后设""只排一个"用） */
    expiryOps: () => m.rec.timerLog.filter((e) => e[1] === TRANSIENT_TIMER_ID).map((e) => e[0]),
    /** 当前 rev：传一个必然落后的 rev 迫使 subscribe **立即**回包（不占 pending 槽） */
    currentRev: async () => (await m.rec.send('pet.subscribe', { rev: -1 })).rev
  }
}

// ————— 纯函数：秒级取整与到期校验 —————

test('卡19 R54 · 秒级取整口径（纯函数）：ceil(N/1000) 秒、钳 1–86400、畸形/已过期取 1 秒（绝不早到）', () => {
  assert.equal(TIMER_MIN_SEC, 1, 'api.timer 下限：整数秒 ≥1（api-reference.md:552,572）')
  assert.equal(TIMER_MAX_SEC, 86400, 'api.timer 上限：86400 秒')
  for (const [round, seconds] of [
    [1, 1],
    [999, 1],
    [1000, 1],
    [1001, 2],
    [1400, 2],
    [1500, 2],
    [1600, 2],
    [1800, 2],
    [2000, 2],
    [2001, 3],
    [86_400_000, 86400],
    [172_800_000, 86400]
  ]) {
    assert.equal(transientDelaySeconds(T0 + round, T0), seconds, `剩 ${round}ms ⇒ ${seconds} 秒`)
  }
  // 畸形/已过期 ⇒ 1 秒（回调里的到期校验会立刻放行或重排，不空转）
  for (const bad of [undefined, null, Number.NaN, '1600', -5, 0]) {
    assert.equal(transientDelaySeconds(T0 + bad, T0), 1, `畸形 until（${String(bad)}）⇒ 1 秒`)
  }
  // 逐轨：TRANSIENT_MS 全表（七项）在秒级口径下都是 2 秒 ⇒ 到期推送最迟"一轮 + ≤1 秒"
  for (const status of RANDOM_PERF_SET) {
    assert.equal(
      transientDelaySeconds(TRANSIENT_MS[status], 0),
      2,
      `${status}（${TRANSIENT_MS[status]}ms）⇒ 2 秒`
    )
  }
})

test('卡19 R54 · 到期校验（纯函数）：与 resolveStatus 互补；无 transient 一律 false；畸形 until 视为已到期', () => {
  const base = initialState(T0)
  const performing = { ...base, transient: { status: 'eating', until: T0 + 1600 }, transientSelf: false }
  assert.equal(transientExpired(performing, T0), false, '未到期 ⇒ 不清')
  assert.equal(transientExpired(performing, T0 + 1599), false, '差 1ms ⇒ 不清')
  assert.equal(transientExpired(performing, T0 + 1600), true, '恰好到期 ⇒ 清（口径 = resolveStatus 的 not(until > now)）')
  assert.equal(transientExpired(performing, T0 + 5000), true, '过期 ⇒ 清')
  // 没有 transient 时**必须** false：否则"没有"会被误判成"该清"，重排逻辑会变成 1 秒空转死循环
  assert.equal(transientExpired(base, T0), false, '无 transient ⇒ false')
  assert.equal(transientExpired({ ...base, transient: null }, T0), false)
  assert.equal(transientExpired({ ...base, transient: 'eating' }, T0), false, '非对象 ⇒ false')
  assert.equal(
    transientExpired({ ...base, transient: { status: 'eating', until: Number.NaN } }, T0),
    true,
    '畸形 until 按 0 ⇒ 视为已到期（清一个渲染不出来的字段无害）'
  )
  assert.equal(transientExpired(null, T0), false, 'state 缺失 ⇒ false')
})

// ————— ① ② 参数化：三种真实互动各自排期望秒数的定时器；到期恰好推一次 + 回落基础态 —————

test('卡19 R54 · 三种真实互动：各自排期望秒数的到期定时器；到期恰好推一次 rev 且视图回落基础态', async (t) => {
  const { rec, cleanup, now, advance, expiry, currentRev } = activate(t)
  await flush()
  for (const [kind, status] of INTERACTIONS) {
    // 喂食/洗澡共享 10 分钟冷却 ⇒ 每次循环先让冷却到期（也顺带避开"上一轮还在播"）
    advance(INTERACT_COOLDOWN_MS)
    const r = await rec.send('pet.interact', { kind })
    assert.equal(r.ok, true, `${kind} 成功`)
    assert.equal(r.state.anim.status, status, `${kind} ⇒ ${status} 轨`)

    // ① 排了期望秒数的到期定时器（until = now + TRANSIENT_MS[status]，取整口径 = ceil / 1000）
    const timer = expiry()
    assert.ok(timer, `${kind}：排了到期推送定时器（pet-transient）`)
    assert.equal(
      timer.seconds,
      transientDelaySeconds(now() + TRANSIENT_MS[status], now()),
      `${kind}：期望秒数 = ceil(${TRANSIENT_MS[status]}ms / 1000)`
    )
    assert.equal(timer.seconds, 2, `${kind}：${TRANSIENT_MS[status]}ms ⇒ 2 秒`)

    // 到期前必须没有任何推送（订阅挂住是判据）
    const revBefore = await currentRev()
    let early
    const hold = rec.send('pet.subscribe', { rev: revBefore }).then((x) => {
      early = x
    })
    await flush(2)
    assert.equal(early, undefined, `${kind}：未到期 ⇒ 不推送（长轮询仍 hold）`)

    // ② 到期（把假时钟推到 until）：触发一次 ⇒ rev+1 + 视图回落基础态（属性全满 ⇒ idle）
    advance(TRANSIENT_MS[status])
    timer.cb()
    await hold
    assert.equal(early.rev, revBefore + 1, `${kind}：到期推送**恰好一次** rev+1`)
    assert.equal(early.state.anim.status, 'idle', `${kind}：到期 ⇒ 视图回落基础态 idle`)
    assert.equal(early.state.anim.self, false, `${kind}：到期视图不是自发表演`)

    // 幂等：重复触发（宿主重复回调 / 迟到回调）不得连推 rev
    const revAfter = early.rev
    let again
    const hold2 = rec.send('pet.subscribe', { rev: revAfter }).then((x) => {
      again = x
    })
    await flush(2)
    timer.cb() // 第二次触发
    await flush(2)
    assert.equal(again, undefined, `${kind}：重复触发不推 rev（幂等，只清一次）`)
    assert.equal(await currentRev(), revAfter, `${kind}：rev 没有被重复触发推高`)
  }
  cleanup()
})

// ⚠️ v1 这里还有一组"属性过低时的到期回落（⇒ hungry/dirty/sad）"的用例。它们钉的是
// 三属性阈值驱动的负面姿态，而三属性体系已随 `specs/pet-vitals` 的 4 条 REMOVED 整体删除
// （design D-10）⇒ v2 的到期回落**只有 idle 一个基础态**，上面那条参数化用例已经逐 kind
// 覆盖了"到期 ⇒ 视图回落基础态"。因此这组用例按已删除的能力删除，而不是改写成"回落饿态"。

// ————— ③ 覆盖：先清后设，只留一个 —————

test('卡19 R54 · 新一轮覆盖：先清后设（任何时刻至多一个），旧回调早到不会误清新一轮', async (t) => {
  const { rec, cleanup, advance, expiry, expiryOps, currentRev } = activate(t)
  await flush()
  await rec.send('pet.interact', { kind: 'feed' }) // eating 1600ms
  const first = expiry()
  assert.ok(first, '第一轮排了定时器')
  assert.deepEqual(expiryOps(), ['clearTimeout', 'setTimeout'], '第一次 arm = 先清（无旧定时器也调用）后设')

  advance(200) // 让两轮的 until 不同，便于验证"旧回调被替换"
  // 用「点击摸头」覆盖：它与喂食**不共享**冷却（点击是独立的 1 小时冷却），所以立刻就能成功
  await rec.send('pet.interact', { kind: 'pet' }) // petted 1400ms ⇒ 覆盖上一轮
  const second = expiry()
  assert.notEqual(second, first, '旧的到期定时器已被替换（只留一个）')
  assert.deepEqual(
    expiryOps(),
    ['clearTimeout', 'setTimeout', 'clearTimeout', 'setTimeout'],
    '第二次 arm 同样是先清后设 ⇒ 至多一个待触发'
  )

  // 旧回调即使被宿主迟到触发：未到期 ⇒ 只重排（不清新一轮的 transient、不推 rev）
  const revBefore = await currentRev()
  first.cb()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'petted', '新一轮仍在播（旧回调没有误清）')
  assert.equal(await currentRev(), revBefore, '旧回调早到 ⇒ 不推 rev')

  // 真正到期 ⇒ 恰好一次推送
  advance(TRANSIENT_MS.petted)
  expiry().cb()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'idle', '到期 ⇒ 回落')
  assert.equal(await currentRev(), revBefore + 1, '到期 ⇒ 恰好 +1')
  cleanup()
})

// ————— ⑤ 早到：不清、不推、重排 —————

test('卡19 R54 · 时钟早到（未到期触发）⇒ 不清 transient、不推 rev，按剩余时间重排', async (t) => {
  const { rec, cleanup, advance, expiry, expiryOps, currentRev } = activate(t)
  await flush()
  await rec.send('pet.interact', { kind: 'bathe' }) // bathing 1400ms
  const revBefore = await currentRev()
  const before = expiry()

  before.cb() // 立刻触发（now 未推进 ⇒ 还没到期）
  await flush(2)
  assert.equal(
    (await rec.send('pet.state')).state.anim.status,
    'bathing',
    '未到期 ⇒ transient 仍在（绝不提前掐掉用户刚点的动作）'
  )
  assert.equal(await currentRev(), revBefore, '未到期 ⇒ 不推 rev')
  assert.equal(expiryOps().filter((op) => op === 'setTimeout').length, 2, '重排了一次（否则这一轮再没人推）')
  assert.notEqual(expiry(), before, '旧回调已被新的一次替换')
  assert.ok(expiry(), '仍有待触发的到期定时器')

  // 反向自检：真到期时必须清 + 推（不是"永远不清"的假绿）
  advance(TRANSIENT_MS.bathing)
  expiry().cb()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'idle', '到期 ⇒ 回落')
  assert.equal(await currentRev(), revBefore + 1, '到期 ⇒ rev+1')
  cleanup()
})

// ————— ④ 清理：窗体销毁 / 重建补排 / cleanup —————

test('卡19 R54 · 清理：窗体销毁清掉五只定时器（含到期推送）、重建全部补挂并按剩余时间补排、cleanup 全清', async (t) => {
  const { api, rec, cleanup, advance, expiry } = activate(t)
  await flush()
  await rec.send('pet.interact', { kind: 'feed' })
  assert.ok(expiry(), '互动后挂着到期定时器')

  // 窗体销毁（toggle 关）
  api.settings.set('pet.visible', false)
  await flush()
  assert.equal(rec.overlays.size, 0, '窗体已销毁')
  assert.equal(rec.timers.has(TRANSIENT_TIMER_ID), false, '窗体销毁 ⇒ 到期定时器被清')
  // v2 的定时器跟着窗体生命周期走（design D-3 的"清理"列）：pet-tick / pet-perf / pet-text
  // 也由 stopClocks 一并清掉，关窗期间不再空转（v1 曾让它们常驻）
  for (const id of [TICK_ID, RANDOM_PERF_TIMER_ID, 'pet-text']) {
    assert.equal(rec.timers.has(id), false, `窗体销毁 ⇒ ${id} 同样被清`)
  }
  assert.equal(rec.timers.size, 0, '销毁后没有任何定时器残留')

  // 重建（这一轮还没到期）⇒ 三只周期定时器补挂 + 到期推送按剩余时间补排
  api.settings.set('pet.visible', true)
  await flush()
  assert.equal(rec.overlays.size, 1, '窗体已重建')
  assert.ok(rec.timers.has(TICK_ID), '重建后 pet-tick 补挂')
  assert.ok(rec.timers.has(RANDOM_PERF_TIMER_ID), '重建后 pet-perf 补挂')
  assert.ok(rec.timers.has(TRANSIENT_TIMER_ID), '重建时 transient 未到期 ⇒ 补排到期推送')
  advance(TRANSIENT_MS.eating)
  expiry().cb()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'idle', '补排的那次同样能正常落到基础态')

  // cleanup：五只定时器（三只周期 + 气泡 + 到期推送）全清
  await rec.send('pet.interact', { kind: 'bathe' })
  assert.ok(expiry(), 'cleanup 前确实挂着一只')
  cleanup()
  assert.equal(rec.timers.size, 0, 'cleanup 把定时器都清了（含 pet-transient）')
  assert.equal(rec.timerLog.at(-1)[0], 'clearTimeout', '最后一次定时器操作是清到期推送')
})

test('卡19 R54 · 无窗体期间不空转：窗体不在时到期推送照常清（不影响后续 perf/tick 判定）', async (t) => {
  const { api, rec, cleanup, advance, expiry, tick, perf } = activate(t)
  await flush()
  await rec.send('pet.interact', { kind: 'feed' })
  api.settings.set('pet.visible', false) // 关窗（清掉定时器）
  await flush()
  // 关窗期间这一轮早已过期：重建后视图必须是基础态（不是挂着的 eating）
  advance(TRANSIENT_MS.eating)
  api.settings.set('pet.visible', true)
  await flush()
  assert.equal((await rec.send('pet.state')).state.anim.status, 'idle', '重建后不残留已过期的 transient')
  // 反查：补排的定时器到点后只是把已经干净的状态再确认一次（不推 rev 也不会崩）
  expiry().cb()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'idle', '仍然基础态')
  // 既有节拍不受影响：tick 照常结算、perf 照常可播
  advance(60_000)
  tick()
  await flush(2)
  assert.ok(rec.timers.has(TICK_ID) && rec.timers.has(RANDOM_PERF_TIMER_ID), '两只周期定时器都在')
  perf()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.self, true, '随机表演照常（R54 不改变自发路径）')
  cleanup()
})

// ————— ⑥ 自发表演路径不受影响 —————

test('卡19 R54 · 自发表演同样排到期推送，且 anim.self 语义不变（到期推送把来源标记一起清掉）', async (t) => {
  const { rec, cleanup, advance, expiry, currentRev, perf } = activate(t)
  await flush()
  // 可变值喂 Math.random：mock 只挂一次（反复 mock 同一方法会被 mock tracker 记账，且 reset 会拆掉 Date.now）
  let randomValue = 0.5 / RANDOM_PERF_SET.length // pickIndex(0) ⇒ eating
  t.mock.method(Math, 'random', () => randomValue)
  perf()
  await flush(2)
  const during = (await rec.send('pet.state')).state
  assert.equal(during.anim.status, RANDOM_PERF_SET[0], '抽中 eating')
  assert.equal(during.anim.self, true, '自发表演 ⇒ anim.self=true（页面据此锁存）')
  const timer = expiry()
  assert.ok(timer, '自发表演也排了到期推送（R54 覆盖两种来源）')
  assert.equal(timer.seconds, transientDelaySeconds(TRANSIENT_MS[RANDOM_PERF_SET[0]], 0), '期望秒数')

  const revBefore = await currentRev()
  let pushed
  const hold = rec.send('pet.subscribe', { rev: revBefore }).then((x) => {
    pushed = x
  })
  await flush(2)
  assert.equal(pushed, undefined, '未到期 ⇒ 不推')
  advance(TRANSIENT_MS[RANDOM_PERF_SET[0]]) // 把假时钟推到 until（宿主定时器到期时真实时钟就是这个样子）
  timer.cb()
  await hold
  assert.equal(pushed.rev, revBefore + 1, '到期 ⇒ 恰好一次 rev+1')
  assert.equal(pushed.state.anim.status, 'idle', '到期 ⇒ 回落基础态')
  assert.equal(pushed.state.anim.self, false, '到期推送把来源标记一起清掉（页面据此清锁存）')

  // 反查：下一个周期照常表演（到期推送没有破坏 pet-perf 的门控）
  advance(10_000)
  randomValue = (RANDOM_PERF_SET.indexOf('playing') + 0.5) / RANDOM_PERF_SET.length
  perf()
  await flush(2)
  const next = (await rec.send('pet.state')).state
  assert.equal(next.anim.status, 'playing', '下一个周期照常表演')
  assert.equal(next.anim.self, true, '仍是自发表演')
  cleanup()
})

// ————— 源码接线门禁（防后人把定时器接回"等下一次 tick"） —————

test('卡19 R54 · 接线门禁：arm 定义 1 + 调用 4（自发/互动/重建/早到重排）、clear 2 处，且到期推送不写盘', () => {
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  assert.equal(
    (src.match(/armTransientExpiry\(/g) ?? []).length,
    5,
    '定义 1 处 + 调用 4 处（onRandomPerf / interact / create 重建 / 到期回调的早到重排）'
  )
  // v2 起 clear 只剩 2 处：`armTransientExpiry` 内部的先清后设 + `stopClocks`（窗体销毁与 cleanup
  // 共用同一个挂摘点，所以不再各写一遍）
  assert.equal(
    (src.match(/api\.timer\.clearTimeout\(TRANSIENT_TIMER_ID\)/g) ?? []).length,
    2,
    'clear 2 处（arm 内部先清 + stopClocks 单一挂摘点）'
  )
  assert.equal(
    (src.match(/api\.timer\.setTimeout\(TRANSIENT_TIMER_ID/g) ?? []).length,
    1,
    '只有一处真正 setTimeout（都走 armTransientExpiry，口径单点）'
  )
  const expire = src.slice(src.indexOf('function onTransientExpire()'), src.indexOf('function bubbleDelaySeconds'))
  // 三件事：清字段 → rev++ → 唤醒；**不得**写盘（到期不改任何数值）
  assert.match(expire, /transientExpired\(state, now\)/, '先校验真的到期（防早触发/时钟回拨）')
  assert.match(expire, /transient: null, transientSelf: false/, '清 transient 与来源标记')
  assert.match(expire, /rev\+\+/, 'rev+1（D-8 次序）')
  assert.match(expire, /hub\.wake\(\)/, '唤醒长轮询推送')
  assert.equal(/persistState/.test(expire), false, '到期推送不写盘（数值没变，写盘签名也不含 transient）')
  assert.match(expire, /if \(disposed \|\| !state\) return/, '停用/未就绪时短路')
})

test('卡19 R54 · 畸形 state.transient（缺 until / 非数字）⇒ 不排定时器（不为不存在的轮次空转）', async (t) => {
  const { rec, cleanup, expiry } = activate(t)
  await flush()
  // 直接改坏运行时状态不是公开路径；这里用纯函数把这条防线钉死（入口 arm 的入参校验走同一条口径）
  assert.equal(transientDelaySeconds(undefined, T0), 1)
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  const arm = src.slice(src.indexOf('function armTransientExpiry('), src.indexOf('function onTransientExpire()'))
  assert.match(arm, /if \(typeof until !== 'number' \|\| !Number\.isFinite\(until\)\) return/, 'arm 的入参守门')
  assert.equal(expiry(), undefined, '未互动 ⇒ 没有到期定时器（不空转）')
  cleanup()
})

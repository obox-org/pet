/**
 * 卡 18 · 随机表演（design D-14 改版 / 用户裁定 **Q16**；specs/pet-sprites 的随机表演 requirement 4 scenario）。
 *
 * 本文件由卡 15 的"自发原地小跑（trot）"用例改写而来：Q16 把"2–5 分钟独立小跑定时器"
 * （`TROT_TIMER_ID`/`TROT_MS`/`TROT_MIN_SEC`/`TROT_MAX_SEC`/`trotUntil`）整条退役，
 * 换成**每 1 分钟（60 秒）从 7 项"表演型"随机集里抽一条播一轮**；trot 作为状态条目保留（= 原地跑一轮），
 * 并且 `run-left`(row2)/`run-right`(row1) 终于被引用——但**只原地播帧，绝不位移**。
 *
 * **卡 22（v1.0.2）**：周期由 10 秒改为 **60 秒**（用户裁定"每次动画只播放一次，间隔 1min 播放一次"），
 * 本文件里所有"10 秒"的期望值随之改为 60；其余语义（一轮、回落、门控、零副作用）一字未动。
 *
 * 覆盖任务卡验收 ①（周期 60s、随机集恰 7 项且不含状态指示轨、播一轮后回落、sleep 期间不触发、
 * 用户互动可随时抢占、不耗道具/不改数值/不弹气泡、侧跑轨零 `setPosition`）与负向自检
 * （随机集被人改动即红；`sleep` 到期不播；喂食抢占；零位移）。
 *
 * 定时器用**宿主级** `api.timer.setInterval('pet-perf', 60, cb)`（整数秒 1–86400，
 * api-reference.md:405-414,552-572）：主窗口最小化时渲染进程 setTimeout 会被节流到 1s 粒度，
 * 周期会漂。mock 只记录、不自动到点，测试手动 `cb()` 触发；抽签用 `t.mock.method(Math,'random')`
 * 钉死（`Math.floor(r * 7)` 落点 ⇒ `(i + 0.5) / 7` 必抽第 i 项）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import pet from '../index.js'
import {
  OVERLAY_ID,
  RANDOM_PERF_EVERY_SEC,
  RANDOM_PERF_SET,
  RANDOM_PERF_TIMER_ID,
  SLEEP_AFTER_MS,
  TEXT,
  TICK_ID,
  TRANSIENT_MS
} from '../lib/constants.js'
import {
  STATUS_LABEL,
  STATUS_PRIORITY,
  STATUS_TRACK,
  animOf,
  frameDurations,
  isSelfTransient,
  isTransient,
  resolveStatus,
  trackTotalMs
} from '../lib/mapping.js'
import { buildView } from '../lib/bridge.js'
import { serialize, deserialize } from '../lib/persist.js'
import { initialState } from '../lib/settle.js'
import { flush, makeApi } from './helpers/mock-api.js'

const T0 = 1_700_000_000_000
/** 真实图集声明（assets 归卡 06，本测试只读） */
const petJson = JSON.parse(readFileSync(new URL('../assets/whale/pet.json', import.meta.url), 'utf8'))

/** 合法 v1 存档文本（字段可覆盖；hunger 调低等场景用得到） */
function saveText(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    hunger: 100,
    clean: 100,
    mood: 100,
    fish: 3,
    bubble: 3,
    growth: 0,
    hungerDropAcc: 0,
    cleanDropAcc: 0,
    recoverAcc: 0,
    afkAcc: 0,
    lastSettledAt: T0,
    lastPetAt: 0,
    position: null,
    ...overrides
  })
}

/** 让下一次抽签必中 `RANDOM_PERF_SET[index]`（Math.floor(r*7) === index 的区间中点） */
function pickIndex(index) {
  return (index + 0.5) / RANDOM_PERF_SET.length
}

function activate(t, opts = {}) {
  let now = T0
  t.mock.method(Date, 'now', () => now)
  const m = makeApi(opts)
  const cleanup = pet(m.api)
  return {
    ...m,
    cleanup,
    advance: (ms) => {
      now += ms
    },
    tick: () => m.rec.timers.get(TICK_ID).cb(),
    /** 触发一次随机表演（mock 不会自己到点） */
    perf: () => {
      const timer = m.rec.timers.get(RANDOM_PERF_TIMER_ID)
      if (!timer) throw new Error('pet-perf 未注册')
      timer.cb()
    },
    perfSeconds: () => m.rec.timers.get(RANDOM_PERF_TIMER_ID)?.seconds,
    perfOps: () => m.rec.timerLog.filter((e) => e[1] === RANDOM_PERF_TIMER_ID).map((e) => e[0]),
    setPositions: () => m.rec.overlayLog.filter((e) => e[0] === 'setPosition'),
    mainWrites: () => m.rec.fsLog.filter(([op, p]) => op === 'writeFile' && p === 'state.json').length
  }
}

// ————— 周期与随机集常量（负向自检的门禁） —————

test('卡18/22 随机表演 · 周期 1 分钟（60 秒）：宿主级 setInterval 注册（整数秒合法），cleanup 与 pet-tick 一起清', async (t) => {
  // 卡 22（v1.0.2）：用户裁定"间隔 1min 播放一次，而不是 10s 播放一次" ⇒ 常量逐字钉住
  assert.equal(RANDOM_PERF_EVERY_SEC, 60, 'v1.0.2：每 1 分钟（60 秒）一轮（逐字钉住，改参数就会红）')
  assert.ok(
    Number.isInteger(RANDOM_PERF_EVERY_SEC) &&
      RANDOM_PERF_EVERY_SEC >= 1 &&
      RANDOM_PERF_EVERY_SEC <= 86400,
    'api.timer 只收 1–86400 的整数秒（api-reference.md:552,572）'
  )
  const { rec, cleanup, perfSeconds, perfOps } = activate(t)
  await flush()
  // mock timer 记录的**实际注册秒数**：注册处只许引用常量，不得留第二份字面量
  assert.equal(perfSeconds(), 60, 'pet-perf 的周期就是 60 秒（mock timer 记录的 seconds）')
  assert.equal(perfSeconds(), RANDOM_PERF_EVERY_SEC, '注册秒数 === 单一来源常量（无第二份字面量）')
  assert.deepEqual(perfOps(), ['setInterval'], '周期触发（不是一次性 setTimeout）')
  assert.ok(rec.timers.has(TICK_ID), '结算时钟照旧')
  cleanup()
  assert.equal(rec.timers.size, 0, 'cleanup 把 pet-tick 与 pet-perf 都清了')
})

test('卡18 随机表演 · 随机集恰 7 项、逐项是合法状态轨，且 MUST NOT 含 hungry/dirty/sad/sleep', () => {
  // 负向自检：集合被人改动（加一条状态指示轨 / 少一条）时这条断言必须红
  assert.deepEqual(
    [...RANDOM_PERF_SET].sort(),
    ['bathing', 'eating', 'petted', 'playing', 'run-left', 'run-right', 'trot'],
    '随机集逐字钉住：表演型 7 项'
  )
  assert.equal(new Set(RANDOM_PERF_SET).size, 7, '无重复项')
  for (const status of RANDOM_PERF_SET) {
    assert.ok(Object.hasOwn(STATUS_TRACK, status), `${status} ∈ STATUS_TRACK`)
    assert.ok(TRANSIENT_MS[status] > 0, `${status} 有一轮时长（回落时刻由它算）`)
    assert.ok(STATUS_LABEL[status], `${status} 有中文状态名`)
  }
  for (const banned of ['hungry', 'dirty', 'sad', 'sleep']) {
    assert.equal(RANDOM_PERF_SET.includes(banned), false, `状态指示轨/打盹 MUST NOT 参与随机：${banned}`)
  }
})

test('卡18/22 · 周期关系（R40 退役后的平凡断言）：60s ≪ 10 分钟入睡阈值，入睡前仍容得下 10 轮', () => {
  const SLEEP_AFTER_SEC = SLEEP_AFTER_MS / 1000
  assert.equal(SLEEP_AFTER_SEC, 600, '入睡阈值 = 10 分钟（design D-7）')
  assert.ok(
    RANDOM_PERF_EVERY_SEC < SLEEP_AFTER_SEC,
    `随机周期（${RANDOM_PERF_EVERY_SEC}s）MUST 小于入睡阈值（${SLEEP_AFTER_SEC}s）`
  )
  // 卡 22：周期 10s → 60s 后这条关系仍成立（600 / 60 = 10 轮；原先按 10s 写的是"至少 60 轮"）
  assert.ok(RANDOM_PERF_EVERY_SEC * 10 <= SLEEP_AFTER_SEC, '入睡前至少容得下 10 轮表演')
})

// ————— 纯函数层：映射、优先级、transient 集合 —————

test('卡18 · 映射契约：run-left→running-left(2)、run-right→running-right(1)，一轮 1800ms（取自真实图集）', () => {
  assert.deepEqual(animOf('run-left'), { row: 2, label: '向左小跑', status: 'run-left' })
  assert.deepEqual(animOf('run-right'), { row: 1, label: '向右小跑', status: 'run-right' })
  assert.equal(STATUS_TRACK['run-left'].track, 'running-left', '上游轨名（互为兜底）')
  assert.equal(STATUS_TRACK['run-right'].track, 'running-right')
  assert.equal(STATUS_TRACK['run-left'].speed, 1, '表演不慢放（慢放只属于 sleep）')
  assert.deepEqual(frameDurations(petJson, 'run-left'), Array(8).fill(225), '8 帧 × 225ms')
  assert.deepEqual(frameDurations(petJson, 'run-right'), Array(8).fill(225))
  assert.equal(trackTotalMs(petJson, 'run-left'), TRANSIENT_MS['run-left'], '轮长 = 真实图集一轮（未漂移）')
  assert.equal(trackTotalMs(petJson, 'run-right'), TRANSIENT_MS['run-right'])
  // TROT_MS 常量随 trot 定时器退役：trot 的轮长同样只能来自图集
  assert.equal(trackTotalMs(petJson, 'trot'), TRANSIENT_MS.trot, 'trot 一轮 = running 轨 6×250ms')
  assert.deepEqual(frameDurations(petJson, 'run-left'), [225, 225, 225, 225, 225, 225, 225, 225])
})

test('卡18 · 优先级：状态指示轨 > 表演轨（与 trot 同档）> idle；三张表逐项同值', () => {
  assert.ok(STATUS_PRIORITY.sleep > STATUS_PRIORITY.trot, 'sleep > 表演（睡着不跑）')
  for (const status of ['trot', 'run-left', 'run-right']) {
    assert.equal(STATUS_PRIORITY[status], 2, `${status} 与 trot 同档（数值 2）`)
    assert.ok(STATUS_PRIORITY.sad > STATUS_PRIORITY[status], `状态指示轨高于 ${status}`)
    assert.ok(STATUS_PRIORITY[status] > STATUS_PRIORITY.idle, `${status} > idle`)
  }
  assert.equal(STATUS_LABEL['run-left'], '向左小跑')
  assert.equal(STATUS_LABEL['run-right'], '向右小跑')
})

test('卡19 · transient 集合：七项表演轨都被认作 transient（否则会被属性判定当场顶掉）；来源靠 transientSelf 而非状态字符串', () => {
  for (const status of RANDOM_PERF_SET) {
    assert.equal(isTransient(status), true, `${status} 写进 transient 后必须被 resolveStatus 认出来`)
  }
  // 卡 19（热修 D-1）：入口侧的 isSelfBurst/SELF_BURST_STATUSES 已整条删除——它只能识别
  // trot/run-left/run-right 三条同构轨，对同名四项（eating/bathing/petted/playing）无能为力，
  // 那正是 D-1 的根因。来源改由 `state.transientSelf` 记录，判据是 isSelfTransient。
  const perIsSelf = (status, transientSelf) => ({
    ...initialState(T0),
    transient: { status, until: T0 + TRANSIENT_MS[status] },
    transientSelf
  })
  for (const status of RANDOM_PERF_SET) {
    assert.equal(
      isSelfTransient(perIsSelf(status, true), T0),
      true,
      `${status}：transientSelf=true ⇒ 认作自发表演（七项逐项）`
    )
    assert.equal(isSelfTransient(perIsSelf(status, false), T0), false, `${status}：互动写的轮次不是自发表演`)
  }
  // 状态字符串本身**不足以**区分来源：同一份 eating，标记不同 ⇒ 判据不同（这正是必须新增标记的理由）
  assert.equal(isSelfTransient(perIsSelf('eating', true), T0), true)
  assert.equal(isSelfTransient(perIsSelf('eating', false), T0), false)
  // 畸形 transientSelf 一律归一 false（任务卡负向自检）；无 transient / 已到期也一律 false
  for (const bad of ['true', 1, 0, null, undefined, {}, []]) {
    assert.equal(
      isSelfTransient(perIsSelf('eating', bad), T0),
      false,
      `畸形 transientSelf（${JSON.stringify(bad) ?? String(bad)}）⇒ false`
    )
  }
  assert.equal(isSelfTransient({ ...initialState(T0), transientSelf: true }, T0), false, '无 transient ⇒ false')
  assert.equal(
    isSelfTransient(perIsSelf('run-left', true), T0 + TRANSIENT_MS['run-left']),
    false,
    'transient 到期 ⇒ false（即便标记还在）'
  )
  // resolveStatus：表演写在 transient 里 ⇒ 短暂覆盖状态指示轨；到期后回落到真实判定
  const hungry = { ...initialState(T0), hunger: 10 }
  const performing = { ...hungry, transient: { status: 'run-left', until: T0 + 1800 }, transientSelf: true }
  assert.equal(resolveStatus(performing, T0), 'run-left', '表演高于 hungry（Q16）')
  assert.equal(resolveStatus(performing, T0 + 1800), 'hungry', '一轮播完 ⇒ 回落真实判定')
  // 拖动中不报入口自发的表演（buildView 的 dragging 折叠，D-13）：status 与 self 一起折
  assert.equal(buildView(performing, T0, { dragging: true }).anim.status, 'idle', '被拎起来时不自己跑')
  assert.equal(buildView(performing, T0, { dragging: true }).anim.self, false, '折 idle 时来源标记也如实报 false')
  assert.equal(buildView(performing, T0).anim.status, 'run-left', '没拖动就照常播')
  assert.equal(buildView(performing, T0).anim.self, true, '没拖动 ⇒ 如实报自发表演')
})

// ————— 入口层：到点抽签、播一轮、回落 —————

test('卡18 随机表演 · 到点抽一条播一轮（row/label/status 齐全、无气泡、不耗道具、不改数值）后回落', async (t) => {
  const { rec, cleanup, advance, perf, mainWrites } = activate(t)
  await flush()
  const before = (await rec.send('pet.ready')).state
  const writes0 = mainWrites()

  t.mock.method(Math, 'random', () => pickIndex(0))
  perf()
  await flush(2)
  const during = (await rec.send('pet.state')).state
  // 卡 19：自发表演的视图必须带 self=true（页面靠它决定"播完折回呼吸 idle"）
  assert.deepEqual(during.anim, { ...animOf(RANDOM_PERF_SET[0]), self: true }, '抽中那一条的 row/label/status + self')
  assert.equal(during.bubble, null, '随机表演 MUST NOT 弹气泡')
  assert.deepEqual(during.vitals, before.vitals, '三属性一个字节不变')
  assert.deepEqual(during.items, before.items, '不消耗道具')
  assert.deepEqual(during.growth, before.growth, '成长值不变')

  advance(TRANSIENT_MS[RANDOM_PERF_SET[0]] - 1)
  const justBefore = (await rec.send('pet.state')).state
  assert.equal(justBefore.anim.status, RANDOM_PERF_SET[0], '一轮还没播完')
  assert.equal(justBefore.anim.self, true, '一轮还没播完 ⇒ 仍是自发表演（页面据此渲染这一轮）')
  advance(1)
  const justAfter = (await rec.send('pet.state')).state
  assert.equal(justAfter.anim.status, 'idle', '一轮播完 ⇒ 回落判定（idle）')
  assert.equal(justAfter.anim.self, false, '一轮播完 ⇒ 来源标记也回落（页面据此停止折 idle）')
  await flush(2)
  assert.equal(mainWrites(), writes0, '表演不改任何持久化数值 ⇒ 一次盘都不写')
  cleanup()
})

test('卡18 随机表演 · 每个周期都能抽到不同的项：7 项逐个触发都能对上（不是固定一条）', async (t) => {
  const { rec, cleanup, advance, perf } = activate(t)
  await flush()
  // 用一个可变值喂 Math.random：mock 只挂一次（反复 t.mock.reset() 会把 Date.now 的 mock 也一起拆掉）
  let randomValue = 0
  t.mock.method(Math, 'random', () => randomValue)
  for (let i = 0; i < RANDOM_PERF_SET.length; i++) {
    randomValue = pickIndex(i)
    perf()
    await flush(2)
    assert.equal((await rec.send('pet.state')).state.anim.status, RANDOM_PERF_SET[i], `第 ${i} 项`)
    advance(TRANSIENT_MS[RANDOM_PERF_SET[i]]) // 播完 ⇒ 回落，下一轮才有位置
  }
  cleanup()
})

test('卡18 随机表演 · 打盹期间周期到期也不播；被交互唤醒后下一个周期照常表演', async (t) => {
  const { rec, cleanup, advance, tick, perf } = activate(t)
  await flush()
  advance(SLEEP_AFTER_MS)
  tick()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'sleep', '连续 10 分钟无交互 ⇒ 打盹')

  t.mock.method(Math, 'random', () => pickIndex(0))
  perf()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'sleep', '打盹期间 MUST NOT 表演')

  // 反向自检：不是"定时器坏了"——任何交互唤醒后，下一个周期照常抽签
  await rec.send('pet.interact', { kind: 'play' })
  advance(TRANSIENT_MS.playing + 1)
  perf()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, RANDOM_PERF_SET[0], '醒来后照常表演')
  cleanup()
})

test('卡18 随机表演 · 属性过低（hungry）不是门控：表演短暂覆盖状态指示轨且数值不动', async (t) => {
  const { rec, cleanup, perf } = activate(t, { files: { 'state.json': saveText({ hunger: 10 }) } })
  await flush()
  assert.equal((await rec.send('pet.state')).state.anim.status, 'hungry', '基线：饿了')
  t.mock.method(Math, 'random', () => pickIndex(RANDOM_PERF_SET.indexOf('playing')))
  perf()
  await flush(2)
  const during = (await rec.send('pet.state')).state
  assert.equal(during.anim.status, 'playing', '表演高于状态指示轨（Q16）')
  assert.equal(during.vitals.hunger, 10, '表演只改姿态，不改数值')
  cleanup()
})

test('卡18 随机表演 · 真实互动随时抢占：表演中 pet.interact{feed} ⇒ 立即切 eating，数值照常生效', async (t) => {
  const { rec, cleanup, perf } = activate(t, { files: { 'state.json': saveText({ hunger: 50 }) } })
  await flush()
  t.mock.method(Math, 'random', () => pickIndex(RANDOM_PERF_SET.indexOf('run-right')))
  perf()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'run-right', '表演正在播')

  const r = await rec.send('pet.interact', { kind: 'feed' })
  assert.equal(r.ok, true)
  assert.equal(r.state.anim.status, 'eating', '互动立刻顶掉表演（共用 transient 字段）')
  assert.equal(r.state.items.fish, 2, '道具照常扣')
  assert.equal(r.state.vitals.hunger, 55, '饥饿照常 +5')
  assert.ok(r.feedback && typeof r.feedback.text === 'string', '互动反馈照常给（表演自己不弹气泡）')
  cleanup()
})

test('卡18 随机表演 · 不打断正在播的瞬时动画（周期恰好落在互动那一轮里 ⇒ 让位）', async (t) => {
  const { rec, cleanup, perf } = activate(t)
  await flush()
  await rec.send('pet.interact', { kind: 'play' }) // playing 轨一轮 1500ms
  t.mock.method(Math, 'random', () => pickIndex(0)) // 想抽 eating
  perf()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'playing', '用户刚点出来的那一轮不被打断')
  cleanup()
})

test('卡18 随机表演 · 门控：拖动中不播（松手恢复）；窗体不在（toggle 关）不播', async (t) => {
  const { api, rec, cleanup, advance, perf } = activate(t)
  await flush()
  await rec.send('pet.drag', { phase: 'start' })
  t.mock.method(Math, 'random', () => pickIndex(0))
  perf()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'idle', 'D-13：拖动中不自己跑')

  await rec.send('pet.drag', { phase: 'end' })
  perf()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, RANDOM_PERF_SET[0], '松手后照常表演')
  advance(TRANSIENT_MS[RANDOM_PERF_SET[0]])

  api.settings.set('pet.visible', false)
  await flush()
  perf()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'idle', '窗体不在 ⇒ 没有观看者，不表演')
  cleanup()
})

test('卡18 随机表演 · 不推进也不重置 lastInteractAt：期间演过一轮，10 分钟照样入睡', async (t) => {
  const { rec, cleanup, advance, perf } = activate(t)
  await flush()
  advance(SLEEP_AFTER_MS - 100_000) // 8 分 20 秒无交互
  t.mock.method(Math, 'random', () => pickIndex(0))
  perf()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, RANDOM_PERF_SET[0], '这一次表演正常触发')
  advance(100_001) // 距启动累计 600_001ms ≥ 10 分钟
  assert.equal(
    (await rec.send('pet.state')).state.anim.status,
    'sleep',
    '表演没有刷新 lastInteractAt（它不是用户交互）：若被刷新，这里会是 idle'
  )
  cleanup()
})

test('卡18 随机表演 · 侧跑轨只原地播帧：run-left / run-right 整轮期间零 setPosition、窗体坐标不变', async (t) => {
  // 两次触发都挂在同一个入口实例上（同一个 mock）：用可变值喂 Math.random，避免反复 reset 拆掉 Date.now
  const { rec, cleanup, advance, perf, setPositions } = activate(t)
  await flush()
  let randomValue = 0
  t.mock.method(Math, 'random', () => randomValue)

  for (const status of ['run-left', 'run-right']) {
    const position0 = { ...rec.positions.get(OVERLAY_ID) }
    const size0 = rec.positions.size
    const calls0 = setPositions().length

    randomValue = pickIndex(RANDOM_PERF_SET.indexOf(status))
    perf()
    await flush(2)
    const during = (await rec.send('pet.state')).state
    assert.equal(during.anim.status, status, status)
    assert.equal(during.anim.row, STATUS_TRACK[status].row, `${status} 用真实行号`)

    advance(TRANSIENT_MS[status]) // 整整一轮
    await rec.send('pet.state')
    await flush(2)
    assert.equal(setPositions().length, calls0, `${status}：整轮期间一次 setPosition 都没有（零位移）`)
    assert.equal(rec.positions.size, size0, `${status}：rec.positions 条目数不增加`)
    assert.deepEqual(rec.positions.get(OVERLAY_ID), position0, `${status}：窗体实际坐标不变`)
  }
  cleanup()
})

// ————— 卡 19 · 热修 D-1（v1.0.1）：来源标记 anim.self（入口侧） —————
//
// D-1：随机抽到 `eating`/`bathing`/`petted`/`playing` 四项时播完不回落到呼吸 idle
// （实机 DOM 停留 5.0/10.0/15.0s，连续多轮同轨连成一片 24.98s）。根因是入口的 `transient`
// 被随机表演与真实互动**共用**、状态字符串完全相同，页面无从区分来源。
// 修法①：入口在写 transient 时同时记录来源（`transientSelf`），并在视图里暴露成 `anim.self`。
// 下面两条逐项钉住"七项随机抽到 ⇒ self=true""四种真实互动 ⇒ self=false"（核心断言，务必参数化）。

test('卡19 · anim.self：七项随机抽到**逐项**为 true（参数化），且一轮播完逐项回落为 false/idle', async (t) => {
  const { rec, cleanup, advance, perf } = activate(t)
  await flush()
  // 初始态（无 transient）⇒ self 必须是明确的 false
  assert.equal((await rec.send('pet.state')).state.anim.self, false, '无 transient ⇒ self=false')

  let randomValue = 0
  t.mock.method(Math, 'random', () => randomValue)
  for (let i = 0; i < RANDOM_PERF_SET.length; i++) {
    const status = RANDOM_PERF_SET[i]
    randomValue = pickIndex(i)
    perf()
    await flush(2)
    const during = (await rec.send('pet.state')).state
    assert.equal(during.anim.status, status, `第 ${i} 项：抽中的状态`)
    assert.equal(during.anim.self, true, `${status}：自发表演 ⇒ anim.self=true`)
    assert.equal(during.anim.row, STATUS_TRACK[status].row, `${status}：行号不变`)

    // 一轮 +/1ms 的边界：still self ⇒ 到期 ⇒ false + 回落 idle（入口权威判定）
    advance(TRANSIENT_MS[status] - 1)
    assert.equal((await rec.send('pet.state')).state.anim.self, true, `${status}：一轮还没播完仍是自发表演`)
    advance(1)
    const after = (await rec.send('pet.state')).state
    assert.equal(after.anim.self, false, `${status}：一轮播完 ⇒ anim.self=false`)
    assert.equal(after.anim.status, 'idle', `${status}：播完必回落呼吸 idle（D-1 核心断言）`)
  }
  cleanup()
})

test('卡19 · anim.self：四种真实互动**逐项**为 false（与随机抽到同名同轨时的唯一区分手段）', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()
  for (const [kind, status] of [
    ['feed', 'eating'],
    ['bathe', 'bathing'],
    ['play', 'playing'],
    ['pet', 'petted']
  ]) {
    const r = await rec.send('pet.interact', { kind })
    assert.equal(r.ok, true, `${kind} 成功`)
    assert.equal(r.state.anim.status, status, `${kind} ⇒ ${status} 轨`)
    assert.equal(r.state.anim.self, false, `${kind}：真实互动 ⇒ anim.self=false（页面不得折掉这一轮）`)
    // 与"随机抽到同一条"的对照：状态字符串一样，self 不同（这正是必须新增来源标记的理由）
    assert.ok(RANDOM_PERF_SET.includes(status), `${status} 也在随机集里（同名同轨）`)
  }
  cleanup()
})

test('卡19 · 随机表演期间触发互动 ⇒ 动画与气泡**同时**为互动（不再"气泡还在、动画已切"）', async (t) => {
  const { rec, cleanup, perf } = activate(t)
  await flush()
  // 先让随机表演抽到 eating（与喂食同名同轨的那一条）
  t.mock.method(Math, 'random', () => pickIndex(RANDOM_PERF_SET.indexOf('eating')))
  perf()
  await flush(2)
  const during = (await rec.send('pet.state')).state
  assert.equal(during.anim.status, 'eating', '表演正在播（eating 轨）')
  assert.equal(during.anim.self, true, '表演期间 self=true')
  assert.equal(during.bubble, null, '随机表演自己不弹气泡')

  const r = await rec.send('pet.interact', { kind: 'play' })
  assert.equal(r.ok, true)
  // 动画：立刻切到互动那一轨，且来源标记翻回 false（页面据此不折这一轮）
  assert.equal(r.state.anim.status, 'playing', '互动动画立刻顶掉表演')
  assert.equal(r.state.anim.self, false, '互动轮次 ⇒ self=false（与表演彻底区分开）')
  // 气泡：同一份回包里就有互动反馈 ⇒ 动画与气泡同时生效
  assert.equal(r.state.bubble.text, TEXT.playOk, '气泡与动画同为互动（"玩得好开心！"）')
  assert.equal(r.state.bubble.tone, 'good')
  cleanup()
})

test('卡19 · transientSelf 是运行时字段：**不落盘**（serialize 白名单断言）、读档归一 false', () => {
  const state = {
    ...initialState(T0),
    transient: { status: 'eating', until: T0 + TRANSIENT_MS.eating },
    transientSelf: true
  }
  const text = serialize(state)
  assert.equal(text.includes('transientSelf'), false, 'serialize 白名单不含 transientSelf（不落盘）')
  assert.equal(text.includes('transient'), false, 'transient 本身同样不落盘（既有口径）')
  assert.equal(
    Object.hasOwn(JSON.parse(text), 'transientSelf'),
    false,
    '落盘 JSON 里连键都没有'
  )
  // 读档：白名单构造 ⇒ 运行时字段一律清空/归一 false（存档里就算被人手写进去也不生效）
  const forged = JSON.stringify({
    schemaVersion: 1,
    hunger: 100,
    clean: 100,
    mood: 100,
    fish: 3,
    bubble: 3,
    growth: 0,
    hungerDropAcc: 0,
    cleanDropAcc: 0,
    recoverAcc: 0,
    afkAcc: 0,
    lastSettledAt: T0,
    lastPetAt: 0,
    position: null,
    transientSelf: true,
    transient: { status: 'eating', until: T0 + 99999 }
  })
  const back = deserialize(forged)
  assert.equal(back.ok, true)
  assert.equal(back.state.transientSelf, false, '读档归一 false')
  assert.equal(back.state.transient, null, '读档清空 transient')
  assert.equal(
    serializedKeys(back.state).includes('transientSelf'),
    false,
    '往返一圈仍不落盘'
  )
})

/** serialize 的顶层键（用真实序列化结果取键，而不是手写一份待核对的白名单） */
function serializedKeys(state) {
  return Object.keys(JSON.parse(serialize(state)))
}

test('卡19 · 畸形 transientSelf（字符串/数字/null/对象）⇒ 视图 anim.self 归一 false，不误折真实互动', () => {
  for (const bad of ['true', 'eating', 1, 0, null, undefined, {}, []]) {
    const view = buildView(
      { ...initialState(T0), transient: { status: 'eating', until: T0 + 1600 }, transientSelf: bad },
      T0
    )
    assert.equal(view.anim.self, false, `畸形 transientSelf=${String(bad)} ⇒ anim.self=false`)
  }
  // 反向自检：真布尔 true 必须如实为 true（不是"一律 false"的假绿）
  const ok = buildView(
    { ...initialState(T0), transient: { status: 'eating', until: T0 + 1600 }, transientSelf: true },
    T0
  )
  assert.equal(ok.anim.self, true, 'transientSelf=true ⇒ anim.self=true')
  assert.equal(Object.hasOwn(ok.anim, 'self'), true, 'anim 恒有 self 键（false 也是明确语义）')
})

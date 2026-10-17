/**
 * 卡 15 · 拖动换位（design D-13；specs/pet-window 的拖拽 requirement 3 个 scenario 的入口侧覆盖）。
 *
 * 覆盖任务卡验收 ④ 的拖动条目：
 * - 增量累加（`pet.drag{phase:'move',dx,dy}` ⇒ 自记位置 + 增量 ⇒ `api.overlay.setPosition`）；
 * - **钳位分工**：入口只拒 NaN/Infinity，几何钳位由宿主兜底并回传实际坐标，入口用回传值校正；
 * - `end` 强制落盘（绕过 60s 写盘节流）；
 * - 拖动中抑制入口自发的随机表演（卡 18 / Q16：trot 定时器已退役，改由触发时判定让位）、
 *   抑制 sleep 推进、不弹气泡；
 * - 绝对基准的两条来路：R31 主路径（`create` 回包带 position）与兼容兜底（标定探测，只发生一次）；
 * - 负向自检：缺 phase / phase 未知 / dx,dy 为 NaN 或字符串 ⇒ 拒绝且不移动；
 *   存档 position 为 `{x:null}`（= JSON 里能写出的 NaN 形态）/缺字段 ⇒ 回退 anchor + warn；超界 ⇒ 交宿主钳位。
 *
 * 页面侧（setPointerCapture / rAF 合并 / screenX 取差）是 DOM 行为，由 `test/actions-ui.test.js` 做源码断言。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import pet from '../index.js'
import { OVERLAY_HEIGHT, OVERLAY_MARGIN, OVERLAY_WIDTH, RANDOM_PERF_SET, RANDOM_PERF_TIMER_ID, TEXT, DRAG_PHASES } from '../lib/constants.js'
import { DEFAULT_WORK_AREA, anchorPosition, clampToWorkArea, flush, makeApi } from './helpers/mock-api.js'

const T0 = 1_700_000_000_000
/** 宿主按 anchor 算出的默认位（= 入口在无存档时应有的绝对基准） */
const ANCHOR = anchorPosition(DEFAULT_WORK_AREA, {
  anchor: 'bottom-right',
  margin: OVERLAY_MARGIN,
  width: OVERLAY_WIDTH,
  height: OVERLAY_HEIGHT
})

function captureWarn(t) {
  const calls = []
  t.mock.method(console, 'warn', (...args) => {
    calls.push(args.map(String).join(' '))
  })
  return calls
}

/**
 * 合法 v1 存档文本（position 可覆盖）。
 * `hidden: false` 是卡 15 留下的**废字段**（卡 17 / Q15=B 已撤销隐藏功能）：这里刻意保留，
 * 让每个拖动用例顺带证明"带废字段的旧存档照常读入、不影响拖动"。
 */
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
    hidden: false,
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
    advance: (ms) => {
      now += ms
    },
    tick: () => m.rec.timers.get('pet-tick').cb(),
    /** 触发一次随机表演（卡 18 / Q16：mock 的周期定时器不会自己到点） */
    perf: () => {
      const timer = m.rec.timers.get(RANDOM_PERF_TIMER_ID)
      if (!timer) throw new Error('pet-perf 未注册')
      timer.cb()
    },
    /** overlayLog 里的 setPosition 调用（按顺序，每项 = [x,y]） */
    setPositions: () =>
      m.rec.overlayLog.filter((e) => e[0] === 'setPosition').map((e) => ({ x: e[2], y: e[3] })),
    mainWrites: () => m.rec.fsLog.filter(([op, p]) => op === 'writeFile' && p === 'state.json').length
  }
}

// ————— 增量累加与钳位分工 —————

test('卡15 拖动 · 增量累加：move 的 dx/dy 累加到自记位置后调 setPosition（存档位置为基准）', async (t) => {
  const { rec, cleanup, setPositions } = activate(t, {
    files: { 'state.json': saveText({ position: { x: 100, y: 200 } }) }
  })
  await flush()
  // 启动即把存档位置应用到窗体（create 只支持 anchor，绝对坐标要再发一次 setPosition）
  assert.deepEqual(setPositions(), [{ x: 100, y: 200 }])

  assert.deepEqual(await rec.send('pet.drag', { phase: 'start' }), { ok: true })
  await rec.send('pet.drag', { phase: 'move', dx: 10, dy: -5 })
  await rec.send('pet.drag', { phase: 'move', dx: 3, dy: 2 })
  assert.deepEqual(setPositions().slice(1), [
    { x: 110, y: 195 },
    { x: 113, y: 197 }
  ])
  assert.deepEqual(rec.positions.get('pet.overlay'), { x: 113, y: 197 }, '窗体落在累加后的坐标')

  const end = await rec.send('pet.drag', { phase: 'end' })
  assert.equal(end.ok, true)
  assert.deepEqual(end.position, { x: 113, y: 197 }, 'end 回传落定位置（诊断用）')
  cleanup()
})

test('卡15 拖动 · 钳位分工：入口不做几何钳位，宿主钳后回传 ⇒ 入口用回传值校正自记位置', async (t) => {
  // 小工作区（800×600）⇒ 窗体左上角上限 (580,140)；入口把 1500/1000 原样发出去（不自己钳）
  const workArea = { x: 0, y: 0, width: 800, height: 600 }
  const { rec, cleanup, setPositions } = activate(t, {
    workArea,
    files: { 'state.json': saveText({ position: { x: 500, y: 100 } }) }
  })
  await flush()
  await rec.send('pet.drag', { phase: 'start' })
  await rec.send('pet.drag', { phase: 'move', dx: 1000, dy: 1000 })

  const calls = setPositions()
  assert.deepEqual(calls.at(-1), { x: 1500, y: 1100 }, '入口把累加值**原样**交给宿主（几何钳位是宿主的活）')
  const clamped = clampToWorkArea(workArea, OVERLAY_WIDTH, OVERLAY_HEIGHT, 1500, 1100)
  assert.deepEqual(rec.positions.get('pet.overlay'), clamped, '宿主钳到工作区内')
  assert.deepEqual(clamped, { x: 580, y: 140 })

  // 校正生效：下一帧从**钳后**坐标继续累加，而不是从被拒的 1500 继续（否则窗体与账本永久脱节）
  await rec.send('pet.drag', { phase: 'move', dx: 10, dy: -10 })
  assert.deepEqual(setPositions().at(-1), { x: 590, y: 130 })
  assert.deepEqual(rec.positions.get('pet.overlay'), { x: 580, y: 130 })
  cleanup()
})

test('卡15 拖动 · 回包不带 position（R31 之前的老实现）⇒ 以自记值为准且**只 warn 一次**', async (t) => {
  const warns = captureWarn(t)
  const { rec, cleanup, setPositions } = activate(t, {
    noPositionResult: true, // setPosition 成功但不回传 position
    files: { 'state.json': saveText({ position: { x: 100, y: 200 } }) }
  })
  await flush()
  await rec.send('pet.drag', { phase: 'start' })
  await rec.send('pet.drag', { phase: 'move', dx: 10, dy: 10 })
  await rec.send('pet.drag', { phase: 'move', dx: 10, dy: 10 })
  // 自记值继续累加（120,220）⇒ 说明"以自记值为准"生效，没有因为拿不到回传坐标就停摆
  assert.deepEqual(setPositions().slice(1), [
    { x: 110, y: 210 },
    { x: 120, y: 220 }
  ])
  const end = await rec.send('pet.drag', { phase: 'end' })
  assert.deepEqual(end.position, { x: 120, y: 220 })
  const hits = warns.filter((w) => w === TEXT.logNoPositionReply)
  assert.equal(hits.length, 1, `只 warn 一次，不刷屏；实际 ${JSON.stringify(warns)}`)
  cleanup()
})

test('卡15 拖动 · setPosition 失败 ⇒ 自记位置不被写坏（下一次 move 仍从上一个好坐标累加）', async (t) => {
  const warns = captureWarn(t)
  const opts = { files: { 'state.json': saveText({ position: { x: 100, y: 200 } }) } }
  opts.failSetPosition = () => (opts.fail ? '窗体正在销毁' : undefined)
  const { rec, cleanup, setPositions } = activate(t, opts)
  await flush()
  await rec.send('pet.drag', { phase: 'start' })

  opts.fail = true
  const bad = await rec.send('pet.drag', { phase: 'move', dx: 50, dy: 50 })
  assert.equal(bad.ok, false, '宿主报错 ⇒ 回 ok:false（不抛错，与其它 overlay 方法同风格）')

  opts.fail = false
  await rec.send('pet.drag', { phase: 'move', dx: 5, dy: 5 })
  assert.deepEqual(setPositions().at(-1), { x: 105, y: 205 }, '失败那次没有污染基准（仍是 100,200 + 5）')
  assert.ok(warns.some((w) => w.startsWith('[pet] 窗体移动失败：')), '失败留痕')
  cleanup()
})

// ————— end 强制落盘 —————

test('卡15 拖动 · end 强制落盘：距上次写盘 <60s 且显示口径签名未变 ⇒ 仍然写 state.json', async (t) => {
  const { rec, cleanup, advance, tick, mainWrites } = activate(t, {
    files: { 'state.json': saveText({ position: { x: 100, y: 200 } }) }
  })
  await flush()
  advance(60_000)
  tick() // 先制造一次"正常"写盘，把节流窗口打开（lastPersistAt = now）
  await flush(2)
  const before = mainWrites()
  assert.ok(before >= 1, '前置写盘已发生')

  advance(10_000) // 距上次写盘仅 10s < 60s
  await rec.send('pet.drag', { phase: 'start' })
  await rec.send('pet.drag', { phase: 'move', dx: 0, dy: 0 }) // 位置没变 ⇒ 签名没变 ⇒ 非强制必被节流跳过
  await rec.send('pet.drag', { phase: 'end' })
  await flush(4)
  assert.equal(mainWrites(), before + 1, 'end 强制落盘（绕过写盘节流，design D-13）')

  // 真正移动过的坐标也落盘（specs/pet-window"拖动后重启回到存档位置"）
  await rec.send('pet.drag', { phase: 'start' })
  await rec.send('pet.drag', { phase: 'move', dx: 30, dy: -40 })
  await rec.send('pet.drag', { phase: 'end' })
  await flush(4)
  assert.deepEqual(JSON.parse(rec.fs.get('state.json')).position, { x: 130, y: 160 })
  cleanup()
})

test('卡15 拖动 · 重启回到存档位置：落盘的 position 在下一次激活时被应用到窗体', async (t) => {
  const first = activate(t, { files: { 'state.json': saveText({ position: { x: 100, y: 200 } }) } })
  await flush()
  await first.rec.send('pet.drag', { phase: 'start' })
  await first.rec.send('pet.drag', { phase: 'move', dx: 30, dy: -40 })
  await first.rec.send('pet.drag', { phase: 'end' })
  await flush(4)
  const saved = first.rec.fs.get('state.json')
  first.cleanup()
  await flush()

  // "重启" = 用同一份存档再激活一次（新 mock、新入口实例）
  const { rec, cleanup, setPositions } = activate(t, { files: { 'state.json': saved } })
  await flush()
  assert.deepEqual(setPositions(), [{ x: 130, y: 160 }], '建窗后立即移到存档位置（不是右下角锚点）')
  assert.deepEqual(rec.positions.get('pet.overlay'), { x: 130, y: 160 })
  cleanup()
})

// ————— 绝对基准的两条来路（R31 主路径 / 标定兜底） —————

test('卡15 拖动 · R31 主路径：create 回包带 position ⇒ 直接作基准，全程不触发标定探测', async (t) => {
  const { rec, cleanup, setPositions } = activate(t) // 无存档 ⇒ position 由 create 回包给出
  await flush()
  assert.deepEqual(setPositions(), [], '建窗后不需要额外移动（窗体已在 anchor 默认位）')

  await rec.send('pet.drag', { phase: 'start' })
  await rec.send('pet.drag', { phase: 'move', dx: 5, dy: 7 })
  assert.deepEqual(setPositions(), [{ x: ANCHOR.x + 5, y: ANCHOR.y + 7 }], '一次 setPosition，没有 1e7 探测')
  assert.ok(
    !setPositions().some((p) => p.x >= 1e7),
    '主路径绝不调用标定探测'
  )
  cleanup()
})

test('卡15 拖动 · 兼容兜底：create 不带 position（老宿主）⇒ 首个 move 标定一次，此后不再标定', async (t) => {
  const { rec, cleanup, setPositions } = activate(t, { createWithoutPosition: true })
  await flush()
  assert.deepEqual(setPositions(), [], '无存档 + create 不回传 ⇒ 建窗阶段无从知道绝对坐标')

  await rec.send('pet.drag', { phase: 'start' })
  await rec.send('pet.drag', { phase: 'move', dx: 5, dy: 7 })
  const max = clampToWorkArea(DEFAULT_WORK_AREA, OVERLAY_WIDTH, OVERLAY_HEIGHT, 1e7, 1e7)
  assert.deepEqual(setPositions()[0], { x: 1e7, y: 1e7 }, '标定探测：发一个必然被钳位的远距离坐标')
  // 反推 bottom-right 锚点默认位 = (maxX - margin, maxY - margin)，再把增量折进同一次调用
  assert.deepEqual(setPositions()[1], { x: max.x - OVERLAY_MARGIN + 5, y: max.y - OVERLAY_MARGIN + 7 })
  assert.deepEqual(setPositions()[1], { x: ANCHOR.x + 5, y: ANCHOR.y + 7 }, '与 R31 主路径落点完全一致')

  // 标定只发生一次：拖动结束落盘后 position 已知
  await rec.send('pet.drag', { phase: 'end' })
  await flush(4)
  assert.deepEqual(JSON.parse(rec.fs.get('state.json')).position, { x: ANCHOR.x + 5, y: ANCHOR.y + 7 })
  await rec.send('pet.drag', { phase: 'start' })
  await rec.send('pet.drag', { phase: 'move', dx: 1, dy: 1 })
  assert.equal(setPositions().filter((p) => p.x >= 1e7).length, 1, '整个生命周期只标定一次')
  assert.deepEqual(setPositions().at(-1), { x: ANCHOR.x + 6, y: ANCHOR.y + 8 })
  cleanup()
})

test('卡15 拖动 · 兜底再兜底：create 与 setPosition 都不回传 position ⇒ 不猜坐标，回 ok:false + warn', async (t) => {
  const warns = captureWarn(t)
  const { rec, cleanup, setPositions, mainWrites } = activate(t, {
    createWithoutPosition: true,
    noPositionResult: true
  })
  await flush()
  await rec.send('pet.drag', { phase: 'start' })
  const r = await rec.send('pet.drag', { phase: 'move', dx: 5, dy: 7 })
  assert.equal(r.ok, false, '拿不到任何绝对坐标 ⇒ 明确失败，不瞎移动')
  assert.equal(r.error, TEXT.dragNoBase)
  assert.ok(warns.some((w) => w === TEXT.logCalibrateFailed), `标定失败留痕；实际 ${JSON.stringify(warns)}`)
  // 探测只发一次（失败后不反复探测刷屏）
  assert.equal(setPositions().filter((p) => p.x >= 1e7).length, 1)
  // **已知代价（记录在回执）**：探测本身会把窗体挪到宿主钳后的位置（工作区右下极限，
  // 比 anchor 默认位偏 margin 像素）。这条路径要求宿主 create 与 setPosition **都**不回传 position
  // ——R31 之后不存在这种宿主（当前卡 14 的实现至少 setPosition 回传，标定就能成功）。
  // 不猜坐标 ⇒ 自记 position 保持 null ⇒ 拖动结束落盘仍是 null ⇒ **重启后窗体回到 anchor 默认位**（自愈）。
  assert.deepEqual(rec.positions.get('pet.overlay'), {
    x: DEFAULT_WORK_AREA.width - OVERLAY_WIDTH,
    y: DEFAULT_WORK_AREA.height - OVERLAY_HEIGHT
  })
  await rec.send('pet.drag', { phase: 'end' })
  await flush(4)
  assert.ok(mainWrites() >= 1)
  assert.equal(JSON.parse(rec.fs.get('state.json')).position, null, '没标定成功就不落一个猜出来的坐标')
  cleanup()
})

// ————— 互斥：拖动期间抑制自发表演 / sleep / 气泡（design D-13） —————

test('卡18 拖动 · 互斥①：拖动中到点不表演（周期定时器不挂摘，由 dragging 判定跳过），松手后照常', async (t) => {
  const { rec, cleanup, perf } = activate(t)
  await flush()
  assert.ok(rec.timers.has('pet-perf'), '启动即注册了 1 分钟（60 秒）周期的随机表演定时器（与窗体状态无关）')

  await rec.send('pet.drag', { phase: 'start' })
  assert.ok(rec.timers.has('pet-perf'), 'D-13：拖动不摘定时器（Q16 起它是周期性的，靠触发时判定让位）')
  t.mock.method(Math, 'random', () => 0) // 想抽 RANDOM_PERF_SET[0]
  perf()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'idle', '拖动中不自己跑')

  await rec.send('pet.drag', { phase: 'end' })
  perf()
  await flush(2)
  assert.equal((await rec.send('pet.state')).state.anim.status, RANDOM_PERF_SET[0], '松手后照常表演')
  cleanup()
})

test('卡15 拖动 · 互斥②：拖动持续超过 10 分钟 ⇒ sleep 判定不推进（视图仍是 idle）', async (t) => {
  const { rec, cleanup, advance } = activate(t)
  await flush()
  advance(600_000)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'sleep', '基线：10 分钟无交互 ⇒ 打盹')

  await rec.send('pet.drag', { phase: 'start' })
  assert.equal((await rec.send('pet.state')).state.anim.status, 'idle', '按下即唤醒（拖动是用户交互）')

  advance(600_000) // 拖着不放又过 10 分钟
  const during = await rec.send('pet.state')
  assert.equal(during.state.anim.status, 'idle', 'D-13：拖动期间 sleep 判定不推进（不报 sleep）')

  await rec.send('pet.drag', { phase: 'end' })
  assert.equal((await rec.send('pet.state')).state.anim.status, 'idle', '松手时刷新交互时刻 ⇒ 仍 idle')
  advance(600_000)
  assert.equal((await rec.send('pet.state')).state.anim.status, 'sleep', '松手后按当前条件重新判定 ⇒ 该睡就睡')
  cleanup()
})

test('卡15 拖动 · 互斥③：拖动期间不弹气泡（view.bubble 恒为 null）', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()
  await rec.send('pet.interact', { kind: 'play' })
  assert.ok((await rec.send('pet.state')).state.bubble, '基线：玩耍成功有气泡')

  await rec.send('pet.drag', { phase: 'start' })
  assert.equal((await rec.send('pet.state')).state.bubble, null, 'D-13：拖动期间不弹气泡')
  await rec.send('pet.drag', { phase: 'end' })
  assert.ok((await rec.send('pet.state')).state.bubble, '松手后气泡照旧（未过期就还在）')
  cleanup()
})

// ————— 负向自检（喂畸形输入，不改坏实现） —————

test('卡15 拖动 · 负向：缺 phase / phase 未知 ⇒ 拒绝且不移动', async (t) => {
  // 三个合法阶段是常量单一来源（design D-13 的增量通道口径）
  assert.deepEqual(DRAG_PHASES, ['start', 'move', 'end'])
  const { rec, cleanup, setPositions } = activate(t)
  await flush()
  const baseline = setPositions().length
  for (const payload of [
    {},
    null,
    undefined,
    'start',
    42,
    { phase: 'middle', dx: 10, dy: 10 },
    { phase: '', dx: 10, dy: 10 },
    { phase: 123, dx: 10, dy: 10 },
    { phas: 'move', dx: 10, dy: 10 }
  ]) {
    const r = await rec.send('pet.drag', payload)
    assert.equal(r.ok, false, JSON.stringify(payload))
    assert.equal(r.error, TEXT.unknownDragPhase(String(payload && typeof payload === 'object' ? payload.phase : undefined)))
  }
  assert.equal(setPositions().length, baseline, '一次都没移动')
  cleanup()
})

test('卡15 拖动 · 负向：dx/dy 为 NaN/Infinity/字符串/缺失 ⇒ 拒绝且不移动（不做隐式转换）', async (t) => {
  const { rec, cleanup, setPositions } = activate(t, {
    files: { 'state.json': saveText({ position: { x: 100, y: 200 } }) }
  })
  await flush()
  await rec.send('pet.drag', { phase: 'start' })
  const baseline = setPositions().length
  for (const payload of [
    { phase: 'move' }, // 缺 dx/dy
    { phase: 'move', dx: NaN, dy: 1 },
    { phase: 'move', dx: 1, dy: NaN },
    { phase: 'move', dx: Infinity, dy: 1 },
    { phase: 'move', dx: -Infinity, dy: -Infinity },
    { phase: 'move', dx: '10', dy: '10' }, // 数字字符串按拒绝处理（与 lib/vitals.js 同口径）
    { phase: 'move', dx: '10', dy: 10 },
    { phase: 'move', dx: null, dy: 10 },
    { phase: 'move', dx: {}, dy: [] }
  ]) {
    const r = await rec.send('pet.drag', payload)
    assert.equal(r.ok, false, JSON.stringify(payload))
    assert.equal(r.error, TEXT.dragBadDelta)
  }
  assert.equal(setPositions().length, baseline, '畸形增量一次都没让窗体动')
  assert.deepEqual(rec.positions.get('pet.overlay'), { x: 100, y: 200 }, '自记位置未被污染')

  // 畸形载荷之后正常增量照旧可用（会话没被打坏）
  const ok = await rec.send('pet.drag', { phase: 'move', dx: 1, dy: 1 })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.position, { x: 101, y: 201 })
  cleanup()
})

test('卡15 拖动 · 负向：窗体已销毁时收到 drag ⇒ { ok:false, error:"宠物窗体已关闭" }', async (t) => {
  const { api, rec, cleanup } = activate(t)
  await flush()
  api.settings.set('pet.visible', false)
  await flush()
  for (const payload of [
    { phase: 'start' },
    { phase: 'move', dx: 1, dy: 1 },
    { phase: 'end' }
  ]) {
    const r = await rec.send('pet.drag', payload)
    assert.deepEqual(r, { ok: false, error: '宠物窗体已关闭' }, JSON.stringify(payload))
  }
  cleanup()
})

// ————— 存档位置的失效回退（D-13"位置失效回退"） —————

test('卡15 拖动 · 存档 position 畸形（{x:null}/缺字段/非对象/字符串坐标）⇒ 回退 anchor + warn', async (t) => {
  const warns = captureWarn(t)
  const bad = [
    '{"x":null,"y":120}', // JSON 里能写出的"NaN"形态（NaN 字面量会让整份存档解析失败，走另一条路）
    '{"y":120}', // 缺字段
    '{}',
    '"120,340"', // 非对象
    '[120,340]', // 数组
    '{"x":"120","y":"340"}' // 字符串坐标
  ]
  for (const raw of bad) {
    const text = saveText().replace('"position":null', `"position":${raw}`)
    const { rec, cleanup, setPositions } = activate(t, { files: { 'state.json': text } })
    await flush()
    assert.deepEqual(
      rec.positions.get('pet.overlay'),
      ANCHOR,
      `${raw} ⇒ 窗体停在 anchor 默认位`
    )
    assert.deepEqual(setPositions(), [], `${raw} ⇒ 不发 setPosition（没有可用坐标）`)
    cleanup()
    await flush()
  }
  assert.equal(
    warns.filter((w) => w === TEXT.logPositionBad).length,
    bad.length,
    `每个畸形存档 warn 一条；实际 ${JSON.stringify(warns)}`
  )
})

test('卡15 拖动 · 存档 position 超工作区 ⇒ 原样交给宿主钳位，入口采用钳后坐标（不丢存档）', async (t) => {
  const { rec, cleanup, setPositions } = activate(t, {
    files: { 'state.json': saveText({ position: { x: 99999, y: -99999 } }) }
  })
  await flush()
  assert.deepEqual(setPositions(), [{ x: 99999, y: -99999 }], '入口不自己钳（拿不到 workArea）')
  const clamped = clampToWorkArea(DEFAULT_WORK_AREA, OVERLAY_WIDTH, OVERLAY_HEIGHT, 99999, -99999)
  assert.deepEqual(clamped, { x: 1700, y: 0 })
  assert.deepEqual(rec.positions.get('pet.overlay'), clamped, '窗体被钳回工作区内')

  // 自记位置已被回传值校正 ⇒ 后续拖动从钳后坐标累加
  await rec.send('pet.drag', { phase: 'start' })
  await rec.send('pet.drag', { phase: 'move', dx: -20, dy: 30 })
  assert.deepEqual(setPositions().at(-1), { x: 1680, y: 30 })
  cleanup()
})

test('卡15 拖动 · 串行化：并发到达的多个 move 按顺序累加，不互相覆盖增量', async (t) => {
  const { rec, cleanup, setPositions } = activate(t, {
    files: { 'state.json': saveText({ position: { x: 0, y: 0 } }) }
  })
  await flush()
  await rec.send('pet.drag', { phase: 'start' })
  // 一次性发出 5 帧增量（不逐个 await）：模拟高刷鼠标一帧内挤进多条请求
  const inflight = [1, 2, 3, 4, 5].map((d) => rec.send('pet.drag', { phase: 'move', dx: d, dy: 0 }))
  await Promise.all(inflight)
  const calls = setPositions().slice(1)
  assert.deepEqual(
    calls.map((p) => p.x),
    [1, 3, 6, 10, 15],
    '每帧都基于上一帧落定的位置累加（读改写不被 await 交错打断）'
  )
  assert.deepEqual(rec.positions.get('pet.overlay'), { x: 15, y: 0 })
  cleanup()
})

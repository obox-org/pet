/**
 * 卡 04 · entry-orchestration（入口编排）测试：五个定时器 / 视图字段 / 设置字段 / 删打盹。
 *
 * 对应任务卡的验收清单，逐条落在下面（每个 test 的标题都标了它钉的是哪一条口径）：
 *
 * 1. **三个周期定时器的注册秒数**：`pet-tick` 60（`TICK_SECONDS`）、`pet-perf` 60
 *    （`RANDOM_PERF_EVERY_SEC`）、`pet-text` 300（`TEXT_EVERY_SEC`）——而且必须是 `setInterval`
 *    （周期），不是"一次性 setTimeout 自我重排"。
 * 2. **两只一次性定时器**：`pet-bubble` = `Math.max(1, Math.ceil(BUBBLE_MS/1000))` = 4 秒；
 *    `pet-transient` 沿用 v1 的 `ceil(轮长/1000)`（`lib/mapping.js` 的 `transientDelaySeconds`）。
 * 3. **清理**：销毁窗体与 `cleanup()` 之后 `rec.timers.size === 0`（五只全清）。
 * 4. **`onTick` 必须传真实的 `{ overlayExists }`**（本卡最容易踩的坑）：true ⇒ 满 1 小时成长 +1；
 *    false ⇒ 不涨**且基准推进**（关窗 3 小时再开不补算）。这条同时用行为与源码双重钉住。
 * 5. **定时文本**：`pickFavorText(levelOf(favor).level, 上次文本)`；气泡被互动反馈占用时
 *    **丢弃**（不 `rev++`、不排 `pet-bubble`、不改气泡）；互动反馈**替换**定时文本并重排 4 秒。
 * 6. **随机表演**：7 项抽一条、`transientSelf = true`、排 `pet-transient`、**无气泡、零数值副作用**。
 * 7. **no sleep**：`index.js` / `lib/bridge.js` 里没有 `SLEEP_AFTER_MS`、没有 `'sleep'` 状态字面量、
 *    没有 `TEXT.sleeping` 用法；所有提到 sleep/打盹的行都是"已删除"说明。
 * 8. **视图字段**：`values:{growth,favor,level,levelName}` 存在、`vitals` 已删、`anim.self` 保留。
 * 9. **设置字段**：每次 `rev++` 后 `pet.growth`/`pet.favor`/`pet.favorExact`/`pet.level` 同步
 *    （类型按 manifest 的字段类型）；v1 迁移写一次诊断并把三个旧键置空串。
 * 10. **R-S1**（`notes/check.md` 的 S-1 修复）：好感无上限而宿主的 `progress` 会钳到 `[0,650]`
 *    ⇒ 精确值必须另有一条 `status` 行（`pet.favorExact`），favor 为 0/650/651/99999 时分别写
 *    `"0"/"650"/"651"/"99999"`；manifest 的 6 个字段全部无 `description`、类型合法。
 *
 * 测试手法与 `test/hotfix-19-transient-expiry.test.js` 一致：mock `Date.now` 控制时钟、
 * mock `Math.random` 钉住抽到哪一项、定时器回调由测试手动触发（宿主 timer 是整数秒、回调无载荷）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import pet from '../index.js'
import {
  BUBBLE_MS,
  RANDOM_PERF_EVERY_SEC,
  RANDOM_PERF_SET,
  RANDOM_PERF_TIMER_ID,
  TEXT,
  TEXT_EVERY_SEC,
  TICK_ID,
  TICK_SECONDS,
  TRANSIENT_MS,
  TRANSIENT_TIMER_ID
} from '../lib/constants.js'
import { levelOf } from '../lib/growth.js'
import { LEVEL_TEXTS } from '../lib/texts.js'
import { flush, makeApi } from './helpers/mock-api.js'

const T0 = 1_700_000_000_000
/**
 * `pet-text` / `pet-bubble` 的 id：`lib/constants.js`（卡 1 / 卡 6 所有权）目前只导出了
 * 三只既有定时器的 id 与两个**时长**常量，没有这两只 id ⇒ 与 `index.js` 一样先以字面量落地，
 * 值逐字来自 design D-3 的定时器表。归并后这里改成 import 即可（不改值）。
 */
const TEXT_TIMER_ID = 'pet-text'
const BUBBLE_TIMER_ID = 'pet-bubble'

/** v2 存档文本（字段可覆盖；累积基准缺失 ⇒ 读取方按 now 处理） */
function v2Save(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    growth: 0,
    favor: 0,
    fish: 3,
    bubble: 3,
    lastInteractAt: 0,
    lastPetAt: 0,
    position: null,
    ...overrides
  })
}

/** v1 存档文本（带三属性 ⇒ `deserialize` 回 `migratedFromV1: true`） */
function v1Save(overrides = {}) {
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

/** 激活入口：mock 时钟 + 共享 mock api；`flush()` 之后再断言（init 是 async 链） */
function activate(t, opts = {}) {
  let now = T0
  t.mock.method(Date, 'now', () => now)
  const m = makeApi(opts)
  const cleanup = pet(m.api)
  const rec = m.rec
  return {
    ...m,
    cleanup,
    now: () => now,
    advance(ms) {
      now += ms
    },
    /** 触发一只周期定时器（回调无载荷，"到点了"语义） */
    fire: (id) => {
      const timer = rec.timers.get(id)
      if (!timer) throw new Error('定时器未注册: ' + id)
      timer.cb()
    },
    tick: () => rec.timers.get(TICK_ID).cb(),
    perf: () => rec.timers.get(RANDOM_PERF_TIMER_ID).cb(),
    text: () => rec.timers.get(TEXT_TIMER_ID).cb(),
    /** 当前视图（`pet.state`，不依赖窗体存活） */
    view: async () => (await rec.send('pet.state')).state,
    /** 当前 rev：传一个必然落后的 rev 迫使 subscribe 立即回包（不占 pending 槽） */
    rev: async () => (await rec.send('pet.subscribe', { rev: -1 })).rev,
    /** 某只定时器被 `setTimeout` 排过几次（断言"有没有排新的气泡/到期推送"） */
    setTimeoutCount: (id) => rec.timerLog.filter((e) => e[0] === 'setTimeout' && e[1] === id).length
  }
}

// ————————————————— ① 三个周期定时器的注册秒数 —————————————————

test('卡04 · 一个都不能少：建窗后恰好三只周期定时器，秒数 60 / 60 / 300 且都是 setInterval', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()

  const tick = rec.timers.get(TICK_ID)
  const perf = rec.timers.get(RANDOM_PERF_TIMER_ID)
  const text = rec.timers.get(TEXT_TIMER_ID)
  assert.ok(tick && perf && text, '三只周期定时器都已注册')

  assert.equal(tick.seconds, TICK_SECONDS, 'pet-tick 用 TICK_SECONDS')
  assert.equal(tick.seconds, 60, 'pet-tick = 60 秒（design D-3）')
  assert.equal(perf.seconds, RANDOM_PERF_EVERY_SEC, 'pet-perf 用 RANDOM_PERF_EVERY_SEC')
  assert.equal(perf.seconds, 60, 'pet-perf = 60 秒')
  assert.equal(text.seconds, TEXT_EVERY_SEC, 'pet-text 用 TEXT_EVERY_SEC')
  assert.equal(text.seconds, 300, 'pet-text = 300 秒（与动作节拍独立）')

  // 必须是**周期**：注册成 setTimeout 就不可能每 60/300 秒再来一次
  for (const id of [TICK_ID, RANDOM_PERF_TIMER_ID, TEXT_TIMER_ID]) {
    const kinds = rec.timerLog.filter((e) => e[1] === id).map((e) => e[0])
    assert.deepEqual(kinds, ['setInterval'], `${id} 只注册为 setInterval`)
  }
  // 一次性那两只此时还没排（没有气泡、没有 transient）⇒ 建窗后恰好三只
  assert.equal(rec.timers.size, 3, '建窗后恰好三只周期定时器')
  cleanup()
})

// ————————————————— ② 气泡一次性 4 秒 —————————————————

test('卡04 · pet-bubble 一次性 4 秒（ceil(4000/1000)）：到点清气泡并恰好推一次 rev；早到只重排', async (t) => {
  const { rec, cleanup, advance, view, rev } = activate(t)
  await flush()

  const r = await rec.send('pet.interact', { kind: 'feed' })
  assert.equal(r.ok, true, '喂食成功')
  assert.equal(r.state.bubble.text, TEXT.feedOk, '互动反馈写进气泡')

  const timer = rec.timers.get(BUBBLE_TIMER_ID)
  assert.ok(timer, '排了 pet-bubble')
  assert.equal(timer.seconds, Math.max(1, Math.ceil(BUBBLE_MS / 1000)), '秒数口径 = max(1, ceil(ms/1000))')
  assert.equal(timer.seconds, 4, 'BUBBLE_MS = 4000 ⇒ 4 秒')

  // 早到（还差 1ms）：不清、不推，按剩余秒数重排
  const revBefore = await rev()
  advance(BUBBLE_MS - 1)
  timer.cb()
  await flush(2)
  assert.equal((await view()).bubble.text, TEXT.feedOk, '未到期 ⇒ 气泡仍在（不提前清掉用户刚看的反馈）')
  assert.equal(await rev(), revBefore, '未到期 ⇒ 不推 rev')
  assert.ok(rec.timers.get(BUBBLE_TIMER_ID), '早到 ⇒ 重排了一次（否则这轮气泡再没人清）')

  // 真到期：清 speech + rev++ + 推送
  advance(1)
  rec.timers.get(BUBBLE_TIMER_ID).cb()
  await flush(2)
  assert.equal((await view()).bubble, null, '到期 ⇒ 视图不再有气泡')
  assert.equal(await rev(), revBefore + 1, '到期 ⇒ 恰好一次 rev+1')
  cleanup()
})

// ————————————————— ③ 清理：销毁窗体 / cleanup 全清 —————————————————

test('卡04 · 清理：销毁窗体五只定时器全清（size 0）；重建全部补挂；cleanup 全清', async (t) => {
  const { api, rec, cleanup, view } = activate(t)
  await flush()

  // 先制造"五只都在"的局面：互动 ⇒ transient 到期推送 + 气泡到期清理
  await rec.send('pet.interact', { kind: 'feed' })
  assert.deepEqual(
    [...rec.timers.keys()].sort(),
    [BUBBLE_TIMER_ID, RANDOM_PERF_TIMER_ID, TEXT_TIMER_ID, TICK_ID, TRANSIENT_TIMER_ID].sort(),
    '互动后五只定时器同时在册'
  )

  // 销毁（设置里关掉「显示宠物」）：五只全清
  api.settings.set('pet.visible', false)
  await flush()
  assert.equal(rec.overlays.size, 0, '窗体已销毁')
  assert.equal(rec.timers.size, 0, '销毁窗体 ⇒ rec.timers.size === 0（五只全清）')

  // 重建：三只周期重新挂上，未到期的 transient / 气泡各补排一次
  api.settings.set('pet.visible', true)
  await flush()
  assert.equal(rec.overlays.size, 1, '窗体已重建')
  assert.deepEqual(
    [...rec.timers.keys()].sort(),
    [BUBBLE_TIMER_ID, RANDOM_PERF_TIMER_ID, TEXT_TIMER_ID, TICK_ID, TRANSIENT_TIMER_ID].sort(),
    '重建 ⇒ 五只全部补挂（周期三只 + 未到期的一次性两只）'
  )
  assert.equal((await view()).values.favor, 1, '重建后数值连续（不是初始值）')

  // cleanup：同样全清
  cleanup()
  assert.equal(rec.timers.size, 0, 'cleanup ⇒ rec.timers.size === 0')
})

// ————————————————— ④ onTick 的 overlayExists（本卡最容易踩的坑） —————————————————

test('卡04 · onTick 传 { overlayExists: true }：连续运行满 1 小时成长 +1（设置键同步、零头不丢）', async (t) => {
  const { rec, cleanup, advance, tick, view } = activate(t)
  await flush()
  assert.equal((await view()).values.growth, 0, '首装成长值 0')

  advance(3_600_000) // 满 1 小时
  tick()
  await flush(2)
  assert.equal((await view()).values.growth, 1, '满 1 小时 ⇒ growth +1（浮层在 ⇒ 计入）')
  assert.equal(rec.settings.get('pet.growth'), '1', '设置键 pet.growth 同步（status 字段写字符串）')

  advance(3_600_000) // 再 1 小时
  tick()
  await flush(2)
  assert.equal((await view()).values.growth, 2, '基准推进到整小时 ⇒ 每满 1 小时各 +1')
  cleanup()
})

test('卡04 · onTick 传 { overlayExists: false }：不涨**且基准推进**（关窗 3 小时再开不补算）', async (t) => {
  const { api, rec, cleanup, advance, view } = activate(t)
  await flush()
  // 先抓住 pet-tick 的回调：销毁窗体时它会从 rec.timers 里被清掉，但"已排队的回调仍可能被宿主触发"
  const tickCb = rec.timers.get(TICK_ID).cb

  advance(3_600_000)
  tickCb() // 浮层在 ⇒ +1
  await flush(2)
  assert.equal((await view()).values.growth, 1, '第 1 小时计入')

  api.settings.set('pet.visible', false) // 关窗
  await flush()
  advance(3 * 3_600_000) // 关窗 3 小时（期间没有 pet-tick：时钟已随窗体清掉）
  tickCb() // 用旧回调模拟"浮层不在时 onTick 被触发"⇒ settle 收到 overlayExists:false
  await flush(2)
  assert.equal((await view()).values.growth, 1, 'floating 不在 ⇒ 不涨（这条就是漏传 overlayExists 的回归点）')

  api.settings.set('pet.visible', true) // 重开
  await flush()
  advance(3_600_000)
  rec.timers.get(TICK_ID).cb()
  await flush(2)
  assert.equal(
    (await view()).values.growth,
    2,
    '关窗期间不补算（基准已被推到当时）⇒ 重开后恰好 +1，而不是 +4'
  )
  cleanup()
})

test('卡04 · 接线门禁：onTick 用真实 overlayAlive 调 settle（既不是常量、也不是漏传）', () => {
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  // 唯一的 settle 调用点必须逐字带上 overlayAlive
  assert.equal((src.match(/settle\(state, now, /g) ?? []).length, 1, 'settle 只有一个调用点（tick）')
  assert.match(
    src,
    /const result = settle\(state, now, \{ overlayExists: overlayAlive \}\)/,
    'onTick 逐字传 { overlayExists: overlayAlive }'
  )
  // 反向：不许写成常量（恒 true 会让关窗也涨、恒 false 会让成长永远不涨且不报错）
  assert.equal(/overlayExists: true/.test(src), false, '不得恒传 true')
  assert.equal(/overlayExists: false/.test(src), false, '不得恒传 false')
  assert.equal(/overlayExists: undefined/.test(src), false, '不得传 undefined（等于默认 false）')
})

// ————————————————— ⑤ 定时文本（取样 / 丢弃 / 被替换） —————————————————

test('卡04 · 定时文本：pet-text 到期按当前等级取样、气泡 4 秒、rev+1', async (t) => {
  const { rec, cleanup, text, view, rev } = activate(t)
  await flush()
  t.mock.method(Math, 'random', () => 0) // 候选池第 1 条（L1 每级 12 条，rand=0 ⇒ 第一条）

  const revBefore = await rev()
  text()
  await flush(2)

  const v = await view()
  assert.equal(v.bubble.text, LEVEL_TEXTS[0][0], '第 1 级恰好取到 L1 的文本（不是更高等级）')
  assert.equal(v.bubble.tone, 'good', '定时文本是普通（非警告）气泡')
  assert.equal(await rev(), revBefore + 1, '写气泡 ⇒ rev+1（状态落定后）')

  const timer = rec.timers.get(BUBBLE_TIMER_ID)
  assert.ok(timer, '排了 pet-bubble')
  assert.equal(timer.seconds, 4, '定时文本的气泡同样 4000ms')
  assert.equal(v.values.favor, 0, '定时文本不改任何数值')
  assert.equal(rec.settings.get('pet.favor'), 0, '也不推设置值')
  cleanup()
})

test('卡04 · 定时文本被互动反馈占用 ⇒ 丢弃：不 rev++、不排 pet-bubble、不排队补发', async (t) => {
  const { rec, cleanup, advance, text, view, rev, setTimeoutCount } = activate(t)
  await flush()

  const r = await rec.send('pet.interact', { kind: 'feed' })
  assert.equal(r.state.bubble.text, TEXT.feedOk, '互动反馈占住气泡')

  const revBefore = await rev()
  const bubblesBefore = setTimeoutCount(BUBBLE_TIMER_ID)
  advance(1000) // 互动气泡还没到期（< 4000ms）
  text() // 定时文本此刻到期
  await flush(2)

  assert.equal(await rev(), revBefore, '丢弃 ⇒ 不 rev++（视图没有任何变化）')
  assert.equal(setTimeoutCount(BUBBLE_TIMER_ID), bubblesBefore, '丢弃 ⇒ 不排新的 pet-bubble')
  assert.equal((await view()).bubble.text, TEXT.feedOk, '互动气泡没有被替换')

  // 不排队：互动气泡过期后，那条被丢弃的定时文本**不会**补发（下一个 300 秒才轮到自己）
  advance(BUBBLE_MS)
  rec.timers.get(BUBBLE_TIMER_ID).cb()
  await flush(2)
  assert.equal((await view()).bubble, null, '互动气泡到期 ⇒ 直接消失，不冒出陈旧文本')
  assert.equal(await rev(), revBefore + 1, '只多了"气泡到期"这一次 rev+1')

  // 下一次节拍到点照常显示（丢弃只影响当下这一条，不破坏节拍）
  t.mock.method(Math, 'random', () => 0)
  text()
  await flush(2)
  assert.equal((await view()).bubble.text, LEVEL_TEXTS[0][0], '下一个周期照常显示')
  cleanup()
})

test('卡04 · 互动反馈替换定时文本（优先级最高）并把 pet-bubble 重排为 4 秒', async (t) => {
  const { rec, cleanup, advance, text, view } = activate(t)
  await flush()
  t.mock.method(Math, 'random', () => 0)

  text()
  await flush(2)
  assert.equal((await view()).bubble.text, LEVEL_TEXTS[0][0], '先显示一条定时文本')

  advance(2000) // 定时文本还在显示（2s < 4s）
  const r = await rec.send('pet.interact', { kind: 'pet' })
  assert.equal(r.ok, true, '点击成功（首次点击，冷却已过）')
  assert.equal(r.state.bubble.text, TEXT.petOk, '互动反馈立刻替换当前气泡')
  assert.equal(r.state.anim.status, 'petted', '摸头动画照播')
  assert.equal(r.state.anim.self, false, '用户点出来的那一轮 ⇒ anim.self=false')

  const timer = rec.timers.get(BUBBLE_TIMER_ID)
  assert.equal(timer.seconds, 4, '替换后重排为 4000ms（从替换那一刻重新计）')
  advance(BUBBLE_MS)
  timer.cb()
  await flush(2)
  assert.equal((await view()).bubble, null, '到期消失，原定时文本不再出现')
  cleanup()
})

// ————————————————— ⑥ 随机表演：无气泡、零副作用 —————————————————

test('卡04 · 随机表演：7 项抽一条、transientSelf=true、排 pet-transient、无气泡、不改数值、不写盘', async (t) => {
  const { rec, cleanup, advance, perf, view, setTimeoutCount } = activate(t)
  await flush()
  const before = await view()
  const writesBefore = rec.fsLog.filter((e) => e[0] === 'writeFile').length
  const bubblesBefore = setTimeoutCount(BUBBLE_TIMER_ID)

  // 抽 eating（RANDOM_PERF_SET[0]）；mock 只挂一次（同一方法重复 mock 会被 tracker 记账）
  t.mock.method(Math, 'random', () => 0.5 / RANDOM_PERF_SET.length)
  perf()
  await flush(2)

  const during = await view()
  assert.equal(during.anim.status, RANDOM_PERF_SET[0], '抽中第 1 项 eating')
  assert.equal(during.anim.self, true, '自发表演 ⇒ anim.self=true（页面据此播完即折回）')
  assert.equal(during.bubble, null, '随机表演**不弹气泡**')
  assert.deepEqual(during.values, before.values, '成长/好感/等级一个字节没动')
  assert.deepEqual(during.items, before.items, '道具没动')
  assert.equal(setTimeoutCount(BUBBLE_TIMER_ID), bubblesBefore, '没有排任何气泡定时器')

  const timer = rec.timers.get(TRANSIENT_TIMER_ID)
  assert.ok(timer, '排了 pet-transient（播完由入口主动回落）')
  assert.equal(timer.seconds, Math.ceil(TRANSIENT_MS.eating / 1000), '秒数 = ceil(轮长/1000)')

  // 播完回落：到期清 transient + transientSelf，视图回 idle
  advance(TRANSIENT_MS.eating)
  timer.cb()
  await flush(2)
  const after = await view()
  assert.equal(after.anim.status, 'idle', '播完回落待机')
  assert.equal(after.anim.self, false, '来源标记一并清掉')

  // "不写盘"是对**这一轮表演**的要求：这里只核 "perform 本身没有 fs 写"（写盘由 tick/交互触发）
  assert.equal(
    rec.fsLog.filter((e) => e[0] === 'writeFile').length,
    writesBefore,
    '随机表演（含到期回落）不产生任何写盘'
  )
  cleanup()
})

// ————————————————— ⑦ no sleep：源码门禁 —————————————————

test('卡04 · no sleep 断言：无 SLEEP_AFTER_MS、无 sleep 分支/门控、无打盹文案（提到它的行只能是"已删除"说明）', () => {
  const files = ['../index.js', '../lib/bridge.js']
  for (const file of files) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.equal(/SLEEP_AFTER_MS/.test(src), false, `${file} 不得出现 SLEEP_AFTER_MS（design D-10）`)
    // 'sleep' 作为**状态字面量**必须消失：`resolveStatus(...) === 'sleep'` 这类分支/门控一个都不许留
    assert.equal(/['"]sleep['"]/.test(src), false, `${file} 不得出现 'sleep' 状态字面量`)
    assert.equal(/TEXT\.sleeping/.test(src), false, `${file} 不得再使用 TEXT.sleeping`)
    assert.equal(/texts\.sleeping/.test(src), false, `${file} 不得引用 texts.sleeping`)

    // 允许保留的只有历史说明：每一处提到 sleep/打盹的行都必须自带"已删除"
    const hits = src
      .split('\n')
      .map((line, index) => [index + 1, line])
      .filter(([, line]) => /sleep|打盹/i.test(line))
    for (const [no, line] of hits) {
      assert.match(line, /已删除/, `${file}:${no} 提到 sleep/打盹但不是"已删除"说明：${line.trim()}`)
    }
  }
  // 反向自检：允许保留的说明之外，入口不得有"睡眠时跳过随机表演"的门控（v1 的那条分支）
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  const perf = src.slice(src.indexOf('function onRandomPerf()'), src.indexOf('function requestOverlay('))
  assert.match(perf, /if \(!overlayAlive \|\| dragging\) return/, '随机表演只剩"无窗体/拖动中"两条门控')
  assert.equal(/打盹|sleep/.test(perf.replace(/\/\/.*$/gm, '')), false, '门控代码里没有任何打盹判定')
})

// ————————————————— ⑧ 视图字段最终形状 —————————————————

test('卡04 · 视图字段：values={growth,favor,level,levelName}、vitals 已删、anim.self 保留', async (t) => {
  const { rec, cleanup } = activate(t, { files: { 'state.json': v2Save({ growth: 7, favor: 20 }) } })
  await flush()

  const v = (await rec.send('pet.state')).state
  assert.deepEqual(Object.keys(v).sort(), ['anim', 'bubble', 'items', 'values'], '顶层只有四个字段')
  assert.deepEqual(v.values, { growth: 7, favor: 20, level: 2, levelName: '点头之交' }, '等级由好感算（levelOf）')
  assert.equal('vitals' in v, false, 'v1 的 vitals:{hunger,clean,mood} 已删除')
  assert.deepEqual(Object.keys(v.anim).sort(), ['label', 'row', 'self', 'status'], 'anim.self 保留')
  assert.equal(v.anim.self, false, '没有 transient ⇒ self 恒为 false（不是 undefined）')
  assert.equal(v.bubble, null, '没有气泡')
  assert.deepEqual(v.items, { fish: 3, bubble: 3 }, '道具沿用 v1')
  cleanup()
})

// ————————————————— ⑨ 设置值推送 + 迁移收尾 —————————————————

test('卡04 · 设置值推送：交互后 pet.growth(字符串) / pet.favor(数字) / pet.level(等级名) 与视图同步', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()
  await rec.send('pet.interact', { kind: 'feed' })

  assert.equal(rec.settings.get('pet.growth'), '1', 'status 字段 ⇒ 字符串')
  assert.equal(rec.settings.get('pet.favor'), 1, 'progress 字段 ⇒ 数字（max 650）')
  assert.equal(typeof rec.settings.get('pet.favor'), 'number')
  assert.equal(rec.settings.get('pet.level'), levelOf(1).name, 'status 字段 ⇒ 等级名')
  assert.equal(rec.settings.get('pet.level'), '初次见面')

  // 满级后继续累加：进度值如实写（宿主自己钳满格），等级名不越界
  cleanup()
})

test('卡04 · 设置值推送：好感超过进度条上限（650）时数字如实写、等级停在最高级', async (t) => {
  const { rec, cleanup } = activate(t, { files: { 'state.json': v2Save({ favor: 650 }) } })
  await flush()
  await rec.send('pet.interact', { kind: 'feed' }) // 650 → 651

  assert.equal(rec.settings.get('pet.favor'), 651, '精确好感值如实写（不被 max 钳掉）')
  assert.equal(rec.settings.get('pet.level'), '命定相伴', '仍是最高级')
  const v = (await rec.send('pet.state')).state
  assert.deepEqual(v.values, { growth: 1, favor: 651, level: 10, levelName: '命定相伴' })
  cleanup()
})

// ————————————————— ⑩ R-S1（S-1 修复）：满级后精确值可见 —————————————————
//
// 缺陷根因（notes/check.md 的 S-1）：宿主把 `progress` 字段的 `cur` 钳到 `[0,max]` 再向下取整
// （SettingsView.vue:685-687），而好感**无上限**（满级 650 后继续累加）⇒ `pet.favor` 这一行在
// 651 时只显示 `650/650`，真实值不可见。design.md:13 要求的"另用 status 行展示精确值"在
// 本轮修复里落成 `pet.favorExact`。下面两条分别钉**行为**（写什么）与**清单契约**（有没有这一行）。

test('R-S1 · 满级后精确值可见：favor 0/650/651/99999 ⇒ pet.favorExact 写 "0"/"650"/"651"/"99999"，pet.favor 写同一个真值（钳制是宿主行为，扩展侧不钳）', async (t) => {
  t.mock.method(Date, 'now', () => T0)
  const points = [
    [0, '0'],
    [650, '650'],
    [651, '651'],
    [99999, '99999']
  ]
  for (const [favor, exact] of points) {
    const m = makeApi({ files: { 'state.json': v2Save({ favor }) } })
    const cleanup = pet(m.api)
    await flush()

    // ① 精确值行：status ⇒ 字符串，且是**真值**（不被 650 钳掉）
    assert.equal(
      m.rec.settings.get('pet.favorExact'),
      exact,
      `favor=${favor} ⇒ pet.favorExact 必须是 "${exact}"（精确值行不被钳）`
    )
    assert.equal(typeof m.rec.settings.get('pet.favorExact'), 'string', 'status 字段 ⇒ 写字符串')

    // ② progress 行：写的是**同一个真值**（宿主渲染时才钳到 650/650；扩展侧先钳就等于丢数据）
    assert.equal(m.rec.settings.get('pet.favor'), favor, `favor=${favor} ⇒ pet.favor 写同一个真值（扩展侧不钳）`)
    assert.equal(typeof m.rec.settings.get('pet.favor'), 'number', 'progress 字段 ⇒ 写数字')

    // ③ 视图与两个设置键同源
    const v = (await m.rec.send('pet.state')).state
    assert.equal(v.values.favor, favor, '视图里的好感也是真值')
    assert.equal(v.values.levelName, favor >= 650 ? '命定相伴' : levelOf(favor).name, '等级名不因超过 650 而越界')

    cleanup()
  }
})

test('R-S1 · manifest 契约：设置字段恰 6 项、全部无 description、类型均合法，且 pet.favorExact 是 favor 与 level 之间的 status 行', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
  const fields = manifest.contributes.settings.fields

  assert.deepEqual(
    fields.map((f) => f.key),
    ['pet.visible', 'pet.growth', 'pet.favor', 'pet.favorExact', 'pet.level', 'pet.diagnostic'],
    '字段集合与顺序（favorExact 在 favor 之后、level 之前）'
  )
  assert.equal(fields.length, 6, '恰 6 个设置字段')

  const validTypes = ['text', 'number', 'boolean', 'select', 'directory', 'status', 'progress']
  for (const field of fields) {
    assert.ok(validTypes.includes(field.type), `${field.key} 的 type=${field.type} 必须落在宿主既有类型里`)
    assert.equal('description' in field, false, `${field.key} 不得声明 description`)
  }

  const exact = fields.find((f) => f.key === 'pet.favorExact')
  assert.equal(exact.type, 'status', '精确值行必须是 status（progress 会被宿主钳到 max）')
  assert.equal(exact.label, '好感（精确值）')
  assert.equal(exact.default, '0')

  const favor = fields.find((f) => f.key === 'pet.favor')
  assert.equal(favor.type, 'progress')
  assert.equal(favor.max, 650, '进度条的 max 仍是 650（满级后保持满格）')

  // v1 的三属性键不再声明（pet-vitals 的 REMOVED）
  for (const key of ['pet.hunger', 'pet.clean', 'pet.mood']) {
    assert.equal(
      fields.some((f) => f.key === key),
      false,
      `不得再声明 ${key}`
    )
  }
})

test('卡04 · v1 迁移收尾：写一次「已从 v1 迁移：三属性已丢弃」诊断，并把三个旧设置键置空串', async (t) => {
  const { rec, cleanup } = activate(t, {
    files: { 'state.json': v1Save({ hunger: 40, clean: 20, mood: 70, growth: 120, fish: 7, bubble: 5 }) },
    settings: { 'pet.hunger': 40, 'pet.clean': 20, 'pet.mood': 70 }
  })
  await flush()

  // 数值按 R4 迁移：growth/道具保留、favor 归 0、三属性字段丢弃
  const v = (await rec.send('pet.state')).state
  assert.equal(v.values.growth, 120, 'growth 保留')
  assert.equal(v.values.favor, 0, 'favor 初始化为 0')
  assert.deepEqual(v.items, { fish: 7, bubble: 5 }, '道具保留')

  // 诊断只写一次（内容逐字来自任务卡）
  assert.equal(rec.settings.get('pet.diagnostic'), '已从 v1 迁移：三属性已丢弃')
  assert.equal(rec.statusTexts.get('pet.status'), '已从 v1 迁移：三属性已丢弃', '状态栏同文案（D-9 口径）')

  // 三个旧键被置空串（宿主无删除 API；manifest 也不再声明）
  for (const key of ['pet.hunger', 'pet.clean', 'pet.mood']) {
    assert.equal(rec.settings.get(key), '', `${key} 已置空串`)
    assert.ok(
      rec.settingsLog.some(([k, value]) => k === key && value === ''),
      `${key} 的写操作真的发生过`
    )
  }

  // "只写一次"的落地：迁移后立刻重写存档 ⇒ 文件里不再有三属性键，下次启动不会再判定为 v1
  await flush()
  const saved = rec.fs.get('state.json')
  assert.ok(typeof saved === 'string' && saved.length > 0, '迁移后强制落盘写过 state.json')
  for (const key of ['hunger', 'clean', 'mood', 'hungerDropAcc', 'cleanDropAcc', 'recoverAcc', 'afkAcc', 'lastSettledAt']) {
    assert.equal(saved.includes(`"${key}"`), false, `state.json 不再含 v1 字段 ${key}`)
  }
  assert.match(saved, /"growth":120/, '迁移后的存档保留 growth')
  cleanup()
})

test('卡04 · 迁移收尾的负向：v2 存档（没有三属性键）不写迁移诊断、也不碰三个旧键', async (t) => {
  const { rec, cleanup } = activate(t, { files: { 'state.json': v2Save({ growth: 3 }) } })
  await flush()

  assert.equal(rec.settings.get('pet.diagnostic'), '', '启动复位后的常态：诊断位为空')
  for (const key of ['pet.hunger', 'pet.clean', 'pet.mood']) {
    assert.equal(rec.settingsLog.some(([k]) => k === key), false, `${key} 一次都没被写`)
  }
  cleanup()
})

// ————————————————— 附加：五个定时器的注册/清理是单点（源码门禁） —————————————————

test('卡04 · 设置值推送是"每个 rev++ 之后"的硬约束：源码逐点门禁 + 表演/到期推送后设置键不变', async (t) => {
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  const lines = src.split('\n')
  const revLines = lines
    .map((line, index) => [index, line])
    .filter(([, line]) => /^\s+rev\+\+/.test(line))
  // 6 个推送点：onTransientExpire / onBubbleExpire / onTimedText / onRandomPerf / onTick / interact。
  // 新增推送点时必须同时同步设置键，并把这里改成新数量（门禁的意义就是逼人做这个决定）。
  assert.equal(revLines.length, 6, '推送点数量（每个都必须跟一次 syncValueSettings）')
  for (const [index, line] of revLines) {
    const after = lines.slice(index, index + 3).join('\n')
    assert.match(
      after,
      /syncValueSettings\(\)/,
      `index.js:${index + 1} 的 rev++ 之后必须紧跟 syncValueSettings()：${line.trim()}`
    )
  }

  // 行为侧：不改数值的推送（随机表演 / 气泡到期）之后，四个设置键仍是同一批数字
  const { rec, cleanup, perf, advance, view } = activate(t)
  await flush()
  t.mock.method(Math, 'random', () => 0)
  const before = await view()
  perf()
  await flush(2)
  assert.equal(rec.settings.get('pet.growth'), String(before.values.growth), '表演后 pet.growth 不变')
  assert.equal(rec.settings.get('pet.favor'), before.values.favor, '表演后 pet.favor 不变')
  assert.equal(rec.settings.get('pet.favorExact'), String(before.values.favor), '表演后 pet.favorExact 不变')
  assert.equal(rec.settings.get('pet.level'), before.values.levelName, '表演后 pet.level 不变')
  advance(TRANSIENT_MS.eating)
  rec.timers.get(TRANSIENT_TIMER_ID).cb()
  await flush(2)
  assert.equal(rec.settings.get('pet.favor'), before.values.favor, '到期回落同样把同一批值写回')
  assert.equal(rec.settings.get('pet.favorExact'), String(before.values.favor), '到期回落同样写回精确值')
  cleanup()
})

test('卡04 · 接线门禁：五个定时器只有一对挂摘点（startClocks / stopClocks），不存在散落的 setInterval', () => {
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  const starts = src.match(/api\.timer\.setInterval\(/g) ?? []
  assert.equal(starts.length, 3, '只有 startClocks 里的三处 setInterval（周期三只）')
  const stops = src.match(/api\.timer\.clearInterval\(/g) ?? []
  assert.equal(stops.length, 3, '只有 stopClocks 里的三处 clearInterval')
  // 一次性两只：setTimeout 的定义点必须是单点（气泡的排程/早到重排/重建补排都走 armBubbleExpiry）
  assert.equal(
    (src.match(/api\.timer\.setTimeout\(BUBBLE_TIMER_ID/g) ?? []).length,
    1,
    'pet-bubble 只有一处真正 setTimeout（都走 armBubbleExpiry：排程 / 早到重排 / 重建补排）'
  )
  assert.equal(
    (src.match(/armBubbleExpiry\(/g) ?? []).length,
    4,
    'armBubbleExpiry 定义 1 处 + 调用 3 处（showBubble / 早到重排 / 重建补排）'
  )
  assert.equal(
    (src.match(/api\.timer\.setTimeout\(TRANSIENT_TIMER_ID/g) ?? []).length,
    1,
    'pet-transient 只有一处真正 setTimeout（都走 armTransientExpiry）'
  )
  // stopClocks 必须清五只
  const stop = src.slice(src.indexOf('function stopClocks()'), src.indexOf('// ————— 随机表演'))
  for (const id of ['TICK_ID', 'RANDOM_PERF_TIMER_ID', 'TEXT_TIMER_ID', 'BUBBLE_TIMER_ID', 'TRANSIENT_TIMER_ID']) {
    assert.match(stop, new RegExp(`clear(Interval|Timeout)\\(${id}\\)`), `stopClocks 清 ${id}`)
  }
})

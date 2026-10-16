/**
 * 入口接线测试（任务卡 07 验收 ①②③ + design D-3 通道表 + D-8 并发 + D-9 文案 + R7 写盘节流）。
 *
 * 本文件替换脚手架的 6 条 demo 测试（greet/命令/树视图/卡片/hello 通道），对应 design D-12
 * "脚手架残留全部清掉"。覆盖：
 * - 顶层零副作用（独立子进程 import：不触 DOM/IPC/定时器，进程自然退出）；
 * - demo 删除（无 greet 导出、不注册命令/卡片/树视图、不依赖 i18n）；
 * - mock api 范式（guides-user.md:272-299 + 任务卡验收 ③ 的成员清单）；
 * - 消息路由（pet.ready/pet.state/pet.subscribe/pet.interact/pet.hit/未知通道）；
 * - 长轮询端到端（hold/唤醒/陈旧 rev 补发/25s 超时/窗体销毁拒绝/cleanup 丢弃）；
 * - 负向自检（overlay 已销毁收 interact、未知 kind）；
 * - 写盘节流（R7 口径：显示口径签名变化 或 距上次写盘 ≥60s）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pet from '../index.js'
import { makeApi, flush } from './helpers/mock-api.js'

const T0 = 1_700_000_000_000
const extRoot = fileURLToPath(new URL('..', import.meta.url))

function captureWarn(t) {
  const calls = []
  t.mock.method(console, 'warn', (...args) => {
    calls.push(args.map(String).join(' '))
  })
  return calls
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
    tick: () => m.rec.timers.get('pet-tick').cb()
  }
}

// ————— 验收 ②：顶层零副作用 —————

test('入口 · 顶层零副作用：node -e import("./index.js") 不触 DOM/IPC/定时器，进程自然退出', () => {
  // 独立子进程是最强断言：若模块顶层起了定时器/IPC/监听，事件循环挂着未决句柄，
  // 进程不会在 timeout 内自然退出（status ≠ 0）；顺带断言导出面只有 default（demo 已删）。
  const r = spawnSync(
    process.execPath,
    [
      '-e',
      "import('./index.js').then(m => { const keys = Object.keys(m); " +
        "if (keys.length !== 1 || keys[0] !== 'default' || typeof m.default !== 'function') { " +
        "console.error('BAD_EXPORTS:' + keys.join(',')); process.exit(3) } " +
        "console.log('CLEAN') }, e => { console.error(String(e && e.message)); process.exit(4) })"
    ],
    { cwd: extRoot, encoding: 'utf8', timeout: 15_000 }
  )
  assert.equal(r.status, 0, `子进程应自然退出（无残留句柄）。stderr: ${r.stderr}`)
  assert.match(r.stdout, /CLEAN/)
})

// ————— D-12：脚手架 demo 删除 —————

test('入口 · demo 已删：无 greet 导出，不注册命令/卡片/树视图，不依赖 i18n（D-12 后台扩展）', async (t) => {
  const mod = await import('../index.js')
  assert.deepEqual(Object.keys(mod), ['default'], 'greet 等具名导出已删除')

  const { rec, cleanup } = activate(t)
  await flush()
  // mock 里的"禁止调用"间谍：入口一旦触碰 demo API 就会被记录
  assert.deepEqual(rec.forbidden, [], 'registerCommand/app.register/views.registerTreeProvider/i18n 都不得被调用')
  cleanup()

  // 静态面：入口源码不含 demo 标识符（防"运行时没调但代码还留着"的残留）
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  for (const banned of ['greet', 'registerCommand', 'registerTreeProvider', 'app.register(', 'api.i18n', 'pet.hello', 'pet.tree', 'pet.main']) {
    assert.ok(!src.includes(banned), `index.js 不应再含 "${banned}"`)
  }
})

// ————— 验收 ③：mock api 范式 —————

test('mock api 范式（guides-user.md:272-299）：overlay{create,destroy,setMouseThrough,setPosition}/timer/fs/settings/statusBar/app{onMessage}', () => {
  const { api } = makeApi()
  // 卡 14/15：overlay 从三方法变四方法（setPosition 供拖动换位），其余成员面不变
  assert.deepEqual(Object.keys(api.overlay).sort(), ['create', 'destroy', 'setMouseThrough', 'setPosition'])
  for (const m of ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']) {
    assert.equal(typeof api.timer[m], 'function', `timer.${m}`)
  }
  for (const m of ['writeFile', 'readFile', 'exists']) {
    assert.equal(typeof api.fs[m], 'function', `fs.${m}`)
  }
  for (const m of ['get', 'set', 'onChanged']) {
    assert.equal(typeof api.settings[m], 'function', `settings.${m}`)
  }
  assert.equal(typeof api.statusBar.setText, 'function')
  assert.equal(typeof api.app.onMessage, 'function')
})

// ————— 激活注册面 —————

test('入口 · 激活注册：pet-tick 15 秒定时器 + 消息处理器 + 状态栏初始文本"宠物"', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()
  const timer = rec.timers.get('pet-tick')
  assert.ok(timer, 'settle 时钟已注册')
  assert.equal(timer.seconds, 15, 'api.timer 单位是秒（api-reference.md:405-414）；design D-5 的 15s tick')
  assert.equal(typeof rec.messageHandler, 'function')
  assert.equal(rec.statusTexts.get('pet.status'), '宠物')
  cleanup()
  assert.equal(rec.timers.size, 0, 'cleanup 后不再产生结算（specs/pet-window"停用即回收"）')
  assert.equal(rec.messageHandler, null)
})

// ————— D-3 通道表 —————

test('消息路由 · pet.ready / pet.state ⇒ { ok:true, state:PetStateView }（D-3 形状逐字段）', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()
  for (const channel of ['pet.ready', 'pet.state']) {
    const r = await rec.send(channel) // pet.ready 无载荷
    assert.equal(r.ok, true, channel)
    assert.deepEqual(Object.keys(r.state).sort(), ['anim', 'bubble', 'growth', 'items', 'vitals'])
    assert.equal('hidden' in r.state, false, '卡 17（Q15=B）：PetStateView 不再有 hidden 键')
    assert.deepEqual(Object.keys(r.state.vitals).sort(), ['clean', 'hunger', 'mood'])
    assert.deepEqual(Object.keys(r.state.items).sort(), ['bubble', 'fish'])
    assert.deepEqual(Object.keys(r.state.growth).sort(), ['rank', 'rankName', 'value'])
    assert.deepEqual(Object.keys(r.state.anim).sort(), ['label', 'row', 'status'])
    assert.deepEqual(r.state.anim, { row: 0, label: '待机', status: 'idle' }, '初始全满 ⇒ idle')
    assert.equal(r.state.bubble, null)
    assert.deepEqual(r.state.vitals, { hunger: 100, clean: 100, mood: 100 })
    assert.deepEqual(r.state.items, { fish: 3, bubble: 3 })
    assert.deepEqual(r.state.growth, { value: 0, rank: 0, rankName: '幼鲸' })
  }
  cleanup()
})

test('消息路由 · 未知通道 ⇒ { ok:false, error:"未知通道: …" }（不静默、不抛错）', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()
  const r = await rec.send('pet.nope', {})
  assert.equal(r.ok, false)
  assert.equal(r.error, '未知消息通道: pet.nope')
  cleanup()
})

test('消息路由 · pet.interact 四种 kind 都走通：feed/bathe/play/pet ⇒ { ok:true, state, feedback }', async (t) => {
  const { rec, cleanup, advance } = activate(t)
  await flush()
  const kinds = ['feed', 'bathe', 'play', 'pet']
  for (const kind of kinds) {
    advance(300_001) // 让 pet 的冷却在多次点击间到期，四种 kind 全部走成功分支
    const r = await rec.send('pet.interact', { kind })
    assert.equal(r.ok, true, kind)
    assert.equal(r.feedback.kind, kind)
    assert.equal(typeof r.feedback.text, 'string')
    assert.ok(['good', 'bad'].includes(r.feedback.tone))
    assert.ok(r.state && r.state.vitals, '成功回包带最新 PetStateView（页面据此重绘）')
  }
  cleanup()
})

// ————— 长轮询（D-3 的 S1 解法） —————

test('长轮询 · 入口端到端：hold 到状态变化 ⇒ rev+1 唤醒；陈旧 rev 立即补发；重订阅再挂起', async (t) => {
  const { rec, cleanup, advance, tick } = activate(t)
  await flush()

  let reply0
  const p0 = rec.send('pet.subscribe', { rev: 0 }).then((r) => {
    reply0 = r
  })
  await flush(2)
  assert.equal(reply0, undefined, 'rev 一致 ⇒ hold 不回包')

  advance(60_000)
  tick() // 结算改变状态 ⇒ rev=1 ⇒ 唤醒（先落定再唤醒，D-8 次序）
  await p0
  assert.equal(reply0.ok, true)
  assert.equal(reply0.rev, 1)
  assert.equal(reply0.state.vitals.hunger, 99, '唤醒回包带最新状态')

  // 页面落后（rev 陈旧）⇒ 立即补发当前状态，不 hold
  const stale = await rec.send('pet.subscribe', { rev: 0 })
  assert.equal(stale.ok, true)
  assert.equal(stale.rev, 1)

  // 页面重订阅（rev 一致）⇒ 再次挂起；cleanup 丢弃 pending ⇒ 以明确错误落定
  let reply1
  const p1 = rec.send('pet.subscribe', { rev: 1 }).then((r) => {
    reply1 = r
  })
  await flush(2)
  assert.equal(reply1, undefined)
  cleanup()
  await p1
  assert.deepEqual(reply1, { ok: false, error: '宠物窗体已关闭' })
})

test('长轮询 · 25s 超时端到端：入口自回相同 rev（页面不重绘只重订阅），不等宿主 60s 超时', async (t) => {
  // node:test 的假定时器只接管 setTimeout（hub 的超时定时器），setImmediate（flush）与 Date.now 不受影响
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let now = T0
  t.mock.method(Date, 'now', () => now)
  const { api, rec } = makeApi()
  const cleanup = pet(api)
  await flush()

  let reply
  const p = rec.send('pet.subscribe', { rev: 0 }).then((r) => {
    reply = r
  })
  await flush(2)
  assert.equal(reply, undefined, '25s 内 hold')

  t.mock.timers.tick(25_000)
  await p
  assert.equal(reply.ok, true, '超时是**正常回包**，不是错误')
  assert.equal(reply.rev, 0, '相同 rev ⇒ 页面不重绘')
  assert.deepEqual(reply.state.vitals, { hunger: 100, clean: 100, mood: 100 })
  cleanup()
})

// ————— 负向自检（任务卡"喂非法输入，不改坏实现"） —————

test('负向 · overlay 已销毁时收到 interact ⇒ { ok:false, error:"宠物窗体已关闭" } + [pet] 忽略日志', async (t) => {
  const warns = captureWarn(t)
  const { api, rec, cleanup } = activate(t)
  await flush()
  api.settings.set('pet.visible', false)
  await flush()

  for (const kind of ['feed', 'bathe', 'play', 'pet']) {
    const r = await rec.send('pet.interact', { kind })
    assert.deepEqual(r, { ok: false, error: '宠物窗体已关闭' }, kind)
  }
  assert.ok(warns.includes('[pet] 忽略交互：窗体已关闭'), `实际日志: ${JSON.stringify(warns)}`)
  // 窗体销毁后新订阅同样被拒（不为死窗体 hold）
  const s = await rec.send('pet.subscribe', { rev: 0 })
  assert.deepEqual(s, { ok: false, error: '宠物窗体已关闭' })
  cleanup()
})

test('负向 · pet.interact 未知 kind ⇒ { ok:false, error:"未知互动: …" } 且状态不变', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()
  const r = await rec.send('pet.interact', { kind: 'dance' })
  assert.equal(r.ok, false)
  assert.equal(r.error, '未知互动: dance')
  assert.equal(r.state, undefined, '失败回包不携带状态')

  const after = await rec.send('pet.ready')
  assert.deepEqual(after.state.vitals, { hunger: 100, clean: 100, mood: 100 }, '状态未被污染')
  assert.deepEqual(after.state.items, { fish: 3, bubble: 3 })
  cleanup()
})

test('负向 · pet.interact 畸形载荷（null/字符串/缺 kind）⇒ 按未知互动拒绝，不抛错', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()
  for (const payload of [null, undefined, 'feed', 42, {}, { kind: 123 }]) {
    const r = await rec.send('pet.interact', payload)
    assert.equal(r.ok, false, JSON.stringify(payload))
    assert.match(r.error, /^未知互动: /)
  }
  cleanup()
})

test('负向 · pet.hit 畸形载荷 ⇒ 一律 { ok:true } 且穿透态不被脏输入翻转', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()
  for (const payload of [null, undefined, {}, { inside: 'yes' }, { inside: 1 }]) {
    const r = await rec.send('pet.hit', payload)
    assert.deepEqual(r, { ok: true })
  }
  // inside 非严格 true ⇒ 视为未命中 ⇒ 与默认穿透态相同 ⇒ 不调 setMouseThrough
  assert.equal(rec.overlayLog.filter((e) => e[0] === 'setMouseThrough').length, 0)
  cleanup()
})

// ————— R7 写盘节流 —————

test('写盘节流（design R7）：显示口径值未变且距上次写盘 <60s ⇒ 跳过；值变化或满 60s ⇒ 写', async (t) => {
  // 种子：hunger 1.2 / clean 0.5 / mood 0（growth 速率 0，无联动触发，签名只剩浮点零头在动）
  const save = JSON.stringify({
    schemaVersion: 1,
    hunger: 1.2,
    clean: 0.5,
    mood: 0,
    fish: 3,
    bubble: 3,
    growth: 0,
    hungerDropAcc: 0,
    cleanDropAcc: 0,
    recoverAcc: 0,
    afkAcc: 0,
    lastSettledAt: T0,
    lastPetAt: 0
  })
  const { rec, cleanup, advance, tick } = activate(t, { files: { 'state.json': save } })
  await flush()
  const mainWrites = () => rec.fsLog.filter(([op, p]) => op === 'writeFile' && p === 'state.json').length

  advance(20_000)
  tick() // hunger floor 1→0 ⇒ 显示口径签名变化 ⇒ 写 #1
  await flush(2)
  assert.equal(mainWrites(), 1, '值变化 ⇒ 写')

  advance(30_000)
  tick() // floor 全不变（hunger 0.367/clean 0.361 → 都是 0）且距上次 30s < 60s ⇒ 跳过
  await flush(2)
  assert.equal(mainWrites(), 1, '签名未变且 <60s ⇒ 不写（节流生效）')

  advance(60_000)
  tick() // 签名仍未变，但距上次写盘 90s ≥ 60s ⇒ 写 #2（时间臂）
  await flush(2)
  assert.equal(mainWrites(), 2, '距上次写盘 ≥60s ⇒ 写')

  advance(30_000)
  tick() // 距上次 30s、签名未变 ⇒ 再跳过
  await flush(2)
  assert.equal(mainWrites(), 2)
  cleanup()
})

test('写盘 · 交互立即落盘：喂食改变整数签名（道具-1）⇒ 不等 60s 直接写 state.json', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()
  const r = await rec.send('pet.interact', { kind: 'feed' })
  assert.equal(r.ok, true)
  await flush(4)
  const persisted = JSON.parse(rec.fs.get('state.json'))
  assert.equal(persisted.schemaVersion, 1)
  assert.equal(persisted.fish, 2, '道具消耗已落盘（崩溃不退还）')
  assert.equal(persisted.hunger, 100, '+5 被上限钳住后落盘')
  cleanup()
})

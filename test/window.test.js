/**
 * pet-window · overlay 生命周期（specs/pet-window 的入口侧 scenario；design D-1/D-8/D-9）。
 *
 * 对应任务卡验收清单：pet.visible 关 ⇒ 调 api.overlay.destroy（不是 setMouseThrough/隐藏）；
 * 开 ⇒ 重新 create 且状态连续；停用/cleanup ⇒ overlay 销毁 + timer 清理 + pending 订阅丢弃。
 * （透明像素判据/多显示器定位/不可拉伸是宿主窗体实现与实机验收，归卡 03/卡 11。）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import pet from '../index.js'
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
    setNow: (ms) => {
      now = ms
    }
  }
}

/** 从 overlayLog 里数某类调用的次数 */
function countLog(rec, op) {
  return rec.overlayLog.filter((e) => e[0] === op).length
}

test('pet-window · 激活即自动创建：D-1 全参数（220×460 右下角透明置顶不占任务栏，URL 由 import.meta.url 推导）', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()
  const creates = rec.overlayLog.filter((e) => e[0] === 'create')
  assert.equal(creates.length, 1, '设置存储为空 ⇒ pet.visible 默认 true ⇒ 自动建窗')
  const opts = creates[0][1]
  assert.equal(opts.id, 'pet.overlay')
  assert.equal(opts.width, 220)
  assert.equal(opts.height, 460)
  assert.equal(opts.anchor, 'bottom-right')
  assert.equal(opts.margin, 24)
  assert.equal(opts.transparent, true)
  assert.equal(opts.alwaysOnTop, true)
  assert.equal(opts.skipTaskbar, true)
  // URL 不硬编码 app://extensions/pet/：与测试进程按同一规则（入口文件位置 + ./dist/index.html）推导的结果全等
  const expected = new URL('../dist/index.html', import.meta.url).href
  assert.equal(opts.url, expected)
  assert.ok(rec.overlays.has('pet.overlay'), '窗体存活')
  cleanup()
})

test('pet-window · visible 关 ⇒ 调 api.overlay.destroy（不是 setMouseThrough、不是隐藏）', async (t) => {
  const { api, rec, cleanup } = activate(t)
  await flush()
  assert.equal(countLog(rec, 'destroy'), 0)

  // 宿主 API 面只有四个方法（卡 14 加了 setPosition）：根本没有 hide/show —— "关 = 销毁"由 API 形状保证
  assert.deepEqual(Object.keys(api.overlay).sort(), ['create', 'destroy', 'setMouseThrough', 'setPosition'])

  api.settings.set('pet.visible', false) // mock 同步通知 onChanged（宿主 setSetting 语义）
  await flush()
  assert.equal(countLog(rec, 'destroy'), 1)
  assert.deepEqual(rec.overlayLog.at(-1), ['destroy', 'pet.overlay'])
  assert.equal(rec.overlays.has('pet.overlay'), false, '窗体已真正销毁')
  assert.equal(countLog(rec, 'setMouseThrough'), 0, '销毁路径不得用 setMouseThrough 冒充隐藏')
  cleanup()
})

test('pet-window · visible 开 ⇒ 重新 create 且状态连续（不重置、不读档回旧值）', async (t) => {
  const { api, rec, cleanup, advance } = activate(t)
  await flush()

  // 关窗前先让状态漂移：60s 结算 ⇒ hunger 99（若重建后回到 100 即"状态不连续"）
  advance(60_000)
  rec.timers.get('pet-tick').cb()
  await flush(2)
  const before = await rec.send('pet.ready')
  assert.equal(before.state.vitals.hunger, 99)

  api.settings.set('pet.visible', false)
  await flush()
  api.settings.set('pet.visible', true)
  await flush()
  assert.equal(countLog(rec, 'create'), 2, '重新 create（而不是复活旧窗体）')
  assert.ok(rec.overlays.has('pet.overlay'))

  const after = await rec.send('pet.ready')
  assert.equal(after.state.vitals.hunger, 99, '状态连续：与关窗前经结算后的值一致')
  cleanup()
})

test('pet-window · 停用 cleanup ⇒ overlay 销毁 + pet-tick 清理 + pending 订阅丢弃 + 处理器/订阅释放', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()

  // 挂一个未决的长轮询
  let subReply
  const sub = rec.send('pet.subscribe', { rev: 0 }).then((r) => {
    subReply = r
  })
  await flush(2)
  assert.equal(subReply, undefined, '订阅仍在 hold')

  cleanup()
  await sub
  assert.deepEqual(rec.overlayLog.at(-1), ['destroy', 'pet.overlay'], 'overlay 已销毁')
  assert.equal(rec.overlays.size, 0)
  assert.equal(rec.timers.has('pet-tick'), false, '结算 timer 已清')
  assert.deepEqual(subReply, { ok: false, error: '宠物窗体已关闭' }, 'pending 订阅被丢弃（明确错误落定，不悬空）')
  assert.ok(rec.disposedLog.includes('app.onMessage'), '消息处理器已注销')
  assert.ok(rec.disposedLog.includes('settings.onChanged'), '设置订阅已注销')
  assert.equal(rec.messageHandler, null)

  // cleanup 后 tick 不再产生结算：定时器已从 mock 里删除，无从触发（宿主侧同理会清掉真定时器）
  assert.equal(rec.timers.size, 0)
})

test('pet-window · 创建失败 ⇒ 状态栏 + 诊断位"宠物窗体创建失败：<原因>"，不抛出，toggle 可重试', async (t) => {
  const warns = captureWarn(t)
  const opts = { failCreate: () => (opts.fail ? 'DWM 合成被组策略关闭' : undefined) }
  opts.fail = true
  const { api, rec, cleanup } = activate(t, opts)
  await flush()
  const want = '宠物窗体创建失败：DWM 合成被组策略关闭'
  assert.equal(rec.statusTexts.get('pet.status'), want, 'D-9 文案逐字（状态栏）')
  assert.equal(rec.settings.get('pet.diagnostic'), want, '设置页诊断位同文案')
  assert.ok(warns.includes('[pet] 窗体创建失败：DWM 合成被组策略关闭'), '日志留痕且带 [pet] 前缀')
  assert.equal(rec.overlays.size, 0)

  // 窗体不存在 ⇒ 交互一律拒绝（不崩、不静默）
  const r = await rec.send('pet.interact', { kind: 'feed' })
  assert.deepEqual(r, { ok: false, error: '宠物窗体已关闭' })

  // 可重试：故障消除后 toggle 关再开 ⇒ 创建成功、诊断清空
  opts.fail = false
  api.settings.set('pet.visible', false)
  await flush()
  api.settings.set('pet.visible', true)
  await flush()
  assert.ok(rec.overlays.has('pet.overlay'), '重试成功')
  assert.equal(rec.settings.get('pet.diagnostic'), '', '诊断位清空（status 字段空值 ⇒ 设置页显示占位）')
  assert.equal(rec.statusTexts.get('pet.status'), '宠物', '状态栏恢复常态')
  cleanup()
})

test('pet-window · 关窗不停结算时钟：销毁后 pet-tick 仍在、属性继续衰减（D-5：仅挂机暂停）', async (t) => {
  const { api, rec, cleanup, advance } = activate(t)
  await flush()
  api.settings.set('pet.visible', false)
  await flush()
  assert.equal(rec.overlays.size, 0)
  assert.ok(rec.timers.has('pet-tick'), '结算时钟不受窗体销毁影响')

  advance(60_000)
  rec.timers.get('pet-tick').cb()
  await flush(2)
  // 窗体已关，页面不存在，但三属性照写设置键（设置页 progress 仍随衰减更新）
  const hungerWrites = rec.settingsLog.filter(([k]) => k === 'pet.hunger')
  assert.equal(hungerWrites.at(-1)[1], 99, '关窗期间属性继续衰减（-1/分钟）')
  const ready = await rec.send('pet.ready')
  assert.equal(ready.state.items.fish, 3, '挂机暂停：无产出（economy 另有专测）')
  cleanup()
})

test('pet-window · 重复激活（停用后再启用）：先 cleanup 再注册，无双份 timer/窗体（D-8）', async (t) => {
  const { api, rec, cleanup } = activate(t)
  await flush()
  cleanup()
  await flush()

  // 宿主重复激活 = 再调一次插件函数（同一 api 面）
  const cleanup2 = pet(api)
  await flush()
  // 卡 15 起入口有两只定时器：结算时钟 pet-tick + 自发动作；卡 18（Q16）起第二只从
  // 一次性 `pet-trot` 换成周期性的 `pet-perf`（每 1 分钟（60 秒）随机表演一轮；卡 22 前是 10 秒）。
  // 断言"只有一份"要按 id 数，不能只看 size —— 同 id 重复 setInterval/setTimeout 会被宿主重置，不叠加。
  assert.equal(rec.timers.size, 2, '一份 pet-tick + 一份 pet-perf（无双份）')
  assert.ok(rec.timers.has('pet-tick'), 'pet-tick 只有一份')
  assert.ok(rec.timers.has('pet-perf'), 'pet-perf 只有一份')
  assert.equal(rec.overlays.size, 1, 'overlay 只有一份（同 id 重复创建会被宿主拒绝，入口未触发该路径）')
  assert.equal(countLog(rec, 'create'), 2)
  cleanup2()
  assert.equal(rec.timers.size, 0, 'cleanup 把两只定时器都清了（含 pet-perf，Q16"周期定时器，cleanup 清"）')
})

test('pet-window · 读档期间停用（init 竞态）：disposed 短路 ⇒ 窗体不建、时钟不起、消息面释放', async (t) => {
  const { rec, cleanup } = activate(t)
  cleanup() // 激活后立即停用：init 的 promise 链还在途中（api-reference.md:30 的 cleanup 与激活并发）
  await flush()
  assert.equal(rec.overlays.size, 0, '窗体不建')
  assert.equal(rec.timers.size, 0, 'pet-tick 不起')
  assert.equal(rec.messageHandler, null)
})

test('pet-window · create 进行中停用：刚建成的窗体被 disposed 护栏回收（destroy 幂等，双保险）', async (t) => {
  let release
  const gate = new Promise((r) => {
    release = r
  })
  const { rec, cleanup } = activate(t, { gateCreate: () => gate })
  await flush() // create 已发出、停在门口（overlayAlive 还是 false）
  assert.equal(countLog(rec, 'create'), 1)

  cleanup() // 停用：cleanup 自己看不到"在途 create"，回收靠 requestOverlay 的 disposed 护栏
  release() // create 此刻才完成 ⇒ 护栏必须把刚建成的窗体立刻销毁
  await flush()
  assert.equal(rec.overlays.size, 0, '刚建成的 overlay 被回收')
  assert.deepEqual(rec.overlayLog.at(-1), ['destroy', 'pet.overlay'])
  assert.equal(rec.timers.size, 0, '时钟不起')
})

test('pet-window · pet.hit ⇒ setMouseThrough(!inside)：命中关穿透、移出恢复、去重不刷 IPC', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()
  // 创建后默认穿透（宿主契约），入口镜像 throughNow=true ⇒ 未命中时不调 API
  const r0 = await rec.send('pet.hit', { inside: false })
  assert.deepEqual(r0, { ok: true })
  assert.equal(countLog(rec, 'setMouseThrough'), 0, '与当前穿透态相同的 hit 不重复调用')

  const r1 = await rec.send('pet.hit', { inside: true })
  assert.deepEqual(r1, { ok: true })
  assert.deepEqual(rec.overlayLog.at(-1), ['setMouseThrough', 'pet.overlay', false], '命中 ⇒ 关闭穿透以接收点击')

  await rec.send('pet.hit', { inside: true })
  assert.equal(countLog(rec, 'setMouseThrough'), 1, '连续命中去重')

  await rec.send('pet.hit', { inside: false })
  assert.deepEqual(rec.overlayLog.at(-1), ['setMouseThrough', 'pet.overlay', true], '移出 ⇒ 恢复穿透')
  cleanup()
})

test('pet-window · 悬停唤醒：睡够 10 分钟后 pet.hit{inside:true} ⇒ sleep→idle 并立即唤醒挂起的订阅', async (t) => {
  const { rec, cleanup, advance } = activate(t)
  await flush()

  advance(600_000) // 连续 10 分钟无交互 ⇒ 入睡（无需 tick：sleep 是构建视图时判定的派生状态）
  const sleeping = await rec.send('pet.state')
  assert.deepEqual(sleeping.state.anim, { row: 0, label: '打盹', status: 'sleep', self: false })

  let subReply
  const sub = rec.send('pet.subscribe', { rev: 0 }).then((r) => {
    subReply = r
  })
  await flush(2)
  assert.equal(subReply, undefined, '状态没变 ⇒ 订阅继续 hold')

  await rec.send('pet.hit', { inside: true }) // 悬停算交互（D-4 触发列含悬停）
  await sub
  assert.equal(subReply.ok, true)
  assert.equal(subReply.rev, 1, '状态可见变化（sleep→idle）⇒ rev+1 并唤醒')
  assert.deepEqual(subReply.state.anim, { row: 0, label: '待机', status: 'idle', self: false })
  cleanup()
})

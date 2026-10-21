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

test('pet-window · 激活即自动创建：D-1 全参数（220×460 右下角透明置顶不占任务栏，URL 显式拼 app://extensions/<安装目录名>/）', async (t) => {
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
  // D7（宿主模式适配）：入口在宿主进程里按 file:// 加载，直接拿 import.meta.url 推导会得到 file://，
  // 而宿主的 overlay URL 校验只认 app: 协议 ⇒ 页面 URL 必须**显式拼** app://extensions/<安装目录名>/。
  // 安装目录名从入口路径反推（= 宿主看到的扩展 id，不硬编码 pet）。
  const dirName = decodeURIComponent(new URL('../', import.meta.url).pathname)
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()
  assert.equal(opts.url, `app://extensions/${dirName}/dist/index.html`)
  assert.equal(new URL(opts.url).protocol, 'app:', 'URL 必须是 app:// 形状（宿主 create 只认 app:）')
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
  const { api, rec, cleanup } = activate(t)
  await flush()

  // 关窗前先让数值漂移：一次成功喂食 ⇒ 成长/好感各 +1、鱼干 -1
  //（若重建后回到 0/0/3 即"状态不连续"；关窗不写盘也不重读档，所以内存状态必须是连续的）
  const fed = await rec.send('pet.interact', { kind: 'feed' })
  assert.equal(fed.ok, true)
  await flush(2)
  const before = await rec.send('pet.ready')
  assert.equal(before.state.values.growth, 1)
  assert.equal(before.state.values.favor, 1)
  assert.equal(before.state.items.fish, 2)

  api.settings.set('pet.visible', false)
  await flush()
  api.settings.set('pet.visible', true)
  await flush()
  assert.equal(countLog(rec, 'create'), 2, '重新 create（而不是复活旧窗体）')
  assert.ok(rec.overlays.has('pet.overlay'))

  const after = await rec.send('pet.ready')
  assert.equal(after.state.values.growth, 1, '状态连续：成长值与关窗前一致')
  assert.equal(after.state.values.favor, 1, '状态连续：好感与关窗前一致')
  assert.equal(after.state.items.fish, 2, '状态连续：道具数量与关窗前一致')
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

test('pet-window · 关窗即停时钟：销毁后五只定时器全清，且两个累积基准被推到关窗时刻（关窗不计成长/挂机）', async (t) => {
  const { api, rec, cleanup, advance } = activate(t)
  await flush()
  api.settings.set('pet.visible', false)
  await flush()
  await flush(2)
  assert.equal(rec.overlays.size, 0)
  // v2 的定时器跟着窗体生命周期走（design D-3 的"清理"列）：tick / perf / text 与两只一次性
  // 定时器全由 stopClocks 清掉，关窗期间不再空转（v1 曾让 pet-tick 常驻、每 15 秒写一次属性）
  assert.equal(rec.timers.size, 0, '销毁窗体后没有任何定时器残留')
  assert.equal(rec.timers.has('pet-tick'), false, '结算时钟随窗体一起清')

  // 关窗期间"不计成长、不发挂机"的唯一实现点：销毁路径把基准推到当时并强制落盘
  const persisted = JSON.parse(rec.fs.get('state.json'))
  assert.equal(persisted.lastGrowthAt, T0, 'lastGrowthAt 已推进到关窗时刻')
  assert.equal(persisted.lastAfkAt, T0, 'lastAfkAt 已推进到关窗时刻')
  assert.equal(persisted.growth, 0)

  // 关窗三小时再开：成长值不补涨（基准在关窗那一刻）；挂机奖励也不补发
  advance(3 * 3_600_000)
  api.settings.set('pet.visible', true)
  await flush()
  const ready = await rec.send('pet.ready')
  assert.equal(ready.state.values.growth, 0, '关窗三小时不涨成长值（specs/pet-values R1）')
  assert.equal(ready.state.items.fish, 3, '关窗期间不挂机（specs/pet-economy）')
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
  // v2 有三只**周期**定时器：结算 pet-tick（60 秒）+ 随机表演 pet-perf（60 秒）+ 定时文本 pet-text（300 秒）。
  // 断言"只有一份"要按 id 数，不能只看 size —— 同 id 重复 setInterval 会被宿主重置，不叠加。
  assert.equal(rec.timers.size, 3, '一份 pet-tick + 一份 pet-perf + 一份 pet-text（无双份）')
  assert.ok(rec.timers.has('pet-tick'), 'pet-tick 只有一份')
  assert.ok(rec.timers.has('pet-perf'), 'pet-perf 只有一份')
  assert.ok(rec.timers.has('pet-text'), 'pet-text 只有一份')
  assert.equal(rec.overlays.size, 1, 'overlay 只有一份（同 id 重复创建会被宿主拒绝，入口未触发该路径）')
  assert.equal(countLog(rec, 'create'), 2)
  cleanup2()
  assert.equal(rec.timers.size, 0, 'cleanup 把三只周期定时器都清了')
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

test('pet-window · 长时间无交互仍活跃：两小时没互动也是 idle（无打盹），pet.hit 不改变状态', async (t) => {
  const { rec, cleanup, advance } = activate(t)
  await flush()

  // specs/pet-sprites R2：v1 的"连续 600 秒无交互 ⇒ 打盹"机制已整体移除，
  // 长时间无交互时宠物保持正常待机与正常节拍（不再有 sleep 状态，也没有 1.5× 慢放）。
  advance(2 * 3_600_000)
  const idle = await rec.send('pet.state')
  assert.deepEqual(idle.state.anim, { row: 0, label: '待机', status: 'idle', self: false })

  let subReply
  const sub = rec.send('pet.subscribe', { rev: 0 }).then((r) => {
    subReply = r
  })
  await flush(2)
  assert.equal(subReply, undefined, '状态没变 ⇒ 订阅继续 hold')

  // 悬停**不再**算一次交互：v2 的 lastInteractAt 只剩"共享冷却基准"一个语义，
  // 悬停若推它就会白送一次 10 分钟冷却（因此 pet.hit 只切穿透态，不产生状态变化）
  const hit = await rec.send('pet.hit', { inside: true })
  assert.deepEqual(hit, { ok: true })
  await flush(2)
  assert.equal(subReply, undefined, '悬停不产生状态变化 ⇒ 长轮询不被唤醒')

  // 反向自检：真正的状态变化（成功喂食）才唤醒订阅
  const fed = await rec.send('pet.interact', { kind: 'feed' })
  assert.equal(fed.ok, true)
  await sub
  assert.equal(subReply.ok, true)
  assert.ok(subReply.rev >= 1, '状态真的变了 ⇒ rev 推进并唤醒')
  assert.equal(subReply.state.anim.status, 'eating', '唤醒回包带最新视图（喂食这一轮）')
  cleanup()
})

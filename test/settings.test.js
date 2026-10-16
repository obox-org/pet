/**
 * pet-settings · 设置键写入（specs/pet-settings 的入口侧 scenario；跨卡契约的键名逐字）。
 *
 * 对应任务卡验收清单：三属性写入 pet.hunger|clean|mood；cur=99.9 时写入**未取整真值**
 * （显示口径 {cur}=Math.floor(cur) 与条宽=真值比例由宿主渲染，specs/pet-settings Requirement 2
 * 的"显示口径（validation N3 修复）"——入口负责写真值，取整是渲染层的事，否则条宽与数字会不一致）。
 * 另覆盖：toggle 驱动窗体、诊断位文案、自写键回声不触发窗体操作。
 * （设置页字段声明/渲染归卡 09 的 manifest 与宿主 SettingsView，不在本文件范围。）
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
    tick: () => m.rec.timers.get('pet-tick').cb()
  }
}

/** 取某设置键的最后一次写入值 */
function lastWrite(rec, key) {
  const writes = rec.settingsLog.filter(([k]) => k === key)
  return writes.length ? writes.at(-1)[1] : undefined
}

test('pet-settings · 三属性写入 pet.hunger|clean|mood：cur=99.9 ⇒ 写入未取整真值 99.9', async (t) => {
  const save = JSON.stringify({
    schemaVersion: 1,
    hunger: 99.9,
    clean: 50.5,
    mood: 100,
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
  const { rec, cleanup } = activate(t, { files: { 'state.json': save } })
  await flush()

  // 口径（写进注释与回执）：设置键 = 未取整真值（钳 [0,100] 后的浮点）。
  // 宿主渲染 {cur}/100 时 Math.floor(99.9) ⇒ 显示 99；进度条宽度用 99.9/100 的真实比例。
  assert.equal(lastWrite(rec, 'pet.hunger'), 99.9)
  assert.equal(lastWrite(rec, 'pet.clean'), 50.5)
  assert.equal(lastWrite(rec, 'pet.mood'), 100)
  assert.equal(rec.settings.get('pet.hunger'), 99.9, '设置存储里的值就是真值（api.settings.get 可读回）')
  assert.equal(Math.floor(rec.settings.get('pet.hunger')), 99, '显示口径 = 向下取整（由宿主渲染层执行）')
  cleanup()
})

test('pet-settings · 结算后立即同步：tick 后三键写入新值（"写后设置页当帧刷新"的入口侧义务）', async (t) => {
  const { rec, cleanup, advance, tick } = activate(t)
  await flush()
  const before = rec.settingsLog.length

  advance(60_000)
  tick() // 同步回调：settle → rev+1 → settings.set 全部在同一帧内完成（api.settings.set 同步通知，
  // 设置页据此当帧重渲染，api-reference.md:312 —— 入口的义务是"结算后立即写"，本断言钉住它）
  assert.ok(rec.settingsLog.length > before, 'tick 同步写设置键，不延迟不节流')
  assert.equal(lastWrite(rec, 'pet.hunger'), 99)
  assert.equal(rec.settings.get('pet.mood'), 100 - 5 / 60)
  cleanup()
})

test('pet-settings · 交互后立即同步：喂食 ⇒ pet.hunger 写入 +5 后的真值', async (t) => {
  const save = JSON.stringify({ schemaVersion: 1, hunger: 40 })
  const { rec, cleanup } = activate(t, { files: { 'state.json': save } })
  await flush()
  assert.equal(lastWrite(rec, 'pet.hunger'), 40, '激活读档后首帧就写设置键（设置页打开即有值）')

  const r = await rec.send('pet.interact', { kind: 'feed' })
  assert.equal(r.ok, true)
  assert.equal(r.state.vitals.hunger, 45)
  assert.equal(lastWrite(rec, 'pet.hunger'), 45, '交互后立即写入（不等待下一次 tick）')
  cleanup()
})

test('pet-settings · 无变化不刷键：dt=0 的 tick（时间未前进）不重复写三属性', async (t) => {
  const { rec, cleanup, tick } = activate(t)
  await flush()
  const after = rec.settingsLog.length
  tick() // Date.now 未推进 ⇒ settle changed=false ⇒ 不写设置、不唤醒、不写盘
  assert.equal(rec.settingsLog.length, after)
  cleanup()
})

test('pet-settings · 自写键回声不触发窗体操作：onChanged 只认 pet.visible（与空 key 广播）', async (t) => {
  const { rec, cleanup, advance, tick } = activate(t)
  await flush()
  const overlayCalls = rec.overlayLog.length

  advance(60_000)
  tick() // 写 pet.hunger/clean/mood ⇒ mock 同步回声 onChanged ⇒ 入口必须滤掉
  await flush(2)
  assert.equal(rec.overlayLog.length, overlayCalls, '三属性键的变更不得触发 create/destroy')
  cleanup()
})

test('pet-settings · 诊断位：写盘失败 ⇒ 状态栏 + pet.diagnostic = "宠物状态未能保存"，重试成功即清空', async (t) => {
  const warns = captureWarn(t)
  const opts = { failWrite: () => (opts.fail ? 'EACCES: data 目录只读' : undefined) }
  opts.fail = true
  const { rec, cleanup, advance, tick } = activate(t, opts)
  await flush()

  advance(60_000)
  tick() // 有变化 ⇒ 写盘 ⇒ tmp 写失败
  await flush(4)
  assert.equal(rec.settings.get('pet.diagnostic'), '宠物状态未能保存', 'D-9 文案逐字（诊断位）')
  assert.equal(rec.statusTexts.get('pet.status'), '宠物状态未能保存', '状态栏同文案')
  assert.ok(warns.some((w) => w.startsWith('[pet] 存档写入失败：')), '日志留痕且带 [pet] 前缀')

  // 故障消除 ⇒ 下一次 tick 重试（D-9"可重试：自动"）⇒ 成功后诊断清空
  opts.fail = false
  advance(60_000)
  tick()
  await flush(4)
  assert.equal(rec.settings.get('pet.diagnostic'), '')
  assert.equal(rec.statusTexts.get('pet.status'), '宠物')
  assert.ok(rec.fs.has('state.json'), '重试后正式文件已落盘')
  cleanup()
})

test('pet-settings · toggle 语义：pet.visible false ⇒ destroy、true ⇒ create（设置驱动窗体的唯一通路）', async (t) => {
  const { api, rec, cleanup } = activate(t)
  await flush()
  assert.ok(rec.overlays.has('pet.overlay'))

  api.settings.set('pet.visible', false)
  await flush()
  assert.equal(rec.overlays.has('pet.overlay'), false, '关 = 销毁（specs/pet-settings Requirement 1）')

  api.settings.set('pet.visible', true)
  await flush()
  assert.ok(rec.overlays.has('pet.overlay'), '开 = 重建')
  cleanup()
})

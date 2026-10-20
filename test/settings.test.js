/**
 * pet-settings · 设置键写入（specs/pet-settings 的入口侧 scenario；跨卡契约的键名逐字）。
 *
 * ⚠️ 本文件是 v1 用例的改写：v1 的三行是 `pet.hunger` / `pet.clean` / `pet.mood`
 * （`progress`，写未取整浮点真值）。那三行与其设置键随 `pet-vitals` 的 4 条 REMOVED
 * 一并删除（`manifest.json` 已不再声明，入口只在迁移时把它们置空串）。v2 的四行是：
 *
 * | 行 | 键 | 类型 | 入口写入的值 |
 * | --- | --- | --- | --- |
 * | 显示宠物 | `pet.visible` | boolean | 用户操作（宿主写） |
 * | 成长值 | `pet.growth` | status | **字符串**形式的精确整数 |
 * | 好感 | `pet.favor` | progress | **数字**真值（`max: 650`；宿主渲染时把 `cur` 钳到 `[0,650]`） |
 * | 好感（精确值） | `pet.favorExact` | status | **字符串**形式的真值（不钳——宿主钳 `progress` 后，精确值只能靠这一行） |
 * | 等级 | `pet.level` | status | 等级中文名（如「初次见面」） |
 * | 诊断 | `pet.diagnostic` | status | 失败文案 / 空串 |
 *
 * 另覆盖：值变化后**当帧**同步（api.settings.set 同步通知，设置页据此立即重渲染）、
 * 自写键的回声不触发窗体操作、诊断位的写入与恢复、toggle 驱动窗体。
 * （设置页字段声明/渲染归 `manifest.json` 与宿主 SettingsView，不在本文件范围。）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import pet from '../index.js'
import { SCHEMA_VERSION } from '../lib/constants.js'
import { makeApi, flush } from './helpers/mock-api.js'

const T0 = 1_700_000_000_000
const HOUR = 3_600_000

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

test('pet-settings · 三键口径：成长值写字符串整数、好感写数字、等级写中文名（首帧即有值）', async (t) => {
  const save = JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    growth: 7,
    favor: 20,
    fish: 3,
    bubble: 3,
    lastGrowthAt: T0,
    lastAfkAt: T0,
    lastInteractAt: 0,
    lastPetAt: 0
  })
  const { rec, cleanup } = activate(t, { files: { 'state.json': save } })
  await flush()

  assert.equal(lastWrite(rec, 'pet.growth'), '7', 'growth 是 status 字段 ⇒ 写字符串')
  assert.equal(lastWrite(rec, 'pet.favor'), 20, 'favor 是 progress 字段 ⇒ 写数字')
  assert.equal(lastWrite(rec, 'pet.level'), '点头之交', 'level 是 status 字段 ⇒ 写等级名（20 ⇒ 第 2 级）')
  assert.equal(rec.settings.get('pet.favor'), 20, '设置存储里就是真值（api.settings.get 可读回）')
  cleanup()
})

test('pet-settings · 结算后立即同步：满一小时的 tick 后三键写入新值（设置页当帧刷新）', async (t) => {
  const { rec, cleanup, advance, tick } = activate(t)
  await flush()
  const before = rec.settingsLog.length
  assert.equal(lastWrite(rec, 'pet.growth'), '0')

  advance(HOUR)
  tick() // 同步回调：settle → rev+1 → settings.set 全部在同一帧内完成（api.settings.set 同步通知）
  assert.ok(rec.settingsLog.length > before, 'tick 同步写设置键，不延迟不节流')
  assert.equal(lastWrite(rec, 'pet.growth'), '1', '成长值 +1 立即反映到设置页')
  assert.equal(lastWrite(rec, 'pet.favor'), 0, '好感不因时间流逝增长')
  cleanup()
})

test('pet-settings · 交互后立即同步：喂食 ⇒ 成长值 / 好感 / 等级名都当帧更新', async (t) => {
  const { rec, cleanup } = activate(t)
  await flush()
  assert.equal(lastWrite(rec, 'pet.growth'), '0')

  const r = await rec.send('pet.interact', { kind: 'feed' })
  assert.equal(r.ok, true)
  assert.equal(r.state.values.growth, 1)
  assert.equal(r.state.values.favor, 1)
  assert.equal(lastWrite(rec, 'pet.growth'), '1', '交互后立即写入（不等待下一次 tick）')
  assert.equal(lastWrite(rec, 'pet.favor'), 1)
  assert.equal(lastWrite(rec, 'pet.level'), '初次见面')
  cleanup()
})

test('pet-settings · 无变化不刷键：时间未前进的 tick 不重复写设置键', async (t) => {
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

  advance(HOUR)
  tick() // 写 pet.growth / pet.favor / pet.level ⇒ mock 同步回声 onChanged ⇒ 入口必须滤掉
  await flush(2)
  assert.equal(rec.overlayLog.length, overlayCalls, '自写键的变更不得触发 create/destroy')
  cleanup()
})

test('pet-settings · 诊断位：写盘失败 ⇒ 状态栏 + pet.diagnostic = "宠物状态未能保存"，重试成功即清空', async (t) => {
  const warns = captureWarn(t)
  const opts = { failWrite: () => (opts.fail ? 'EACCES: data 目录只读' : undefined) }
  opts.fail = true
  const { rec, cleanup } = activate(t, opts)
  await flush()

  // 一次成功互动改变整数签名 ⇒ 强制走一次写盘（失败）
  await rec.send('pet.interact', { kind: 'feed' })
  await flush(4)
  assert.equal(rec.settings.get('pet.diagnostic'), '宠物状态未能保存', 'D-9 文案逐字（诊断位）')
  assert.equal(rec.statusTexts.get('pet.status'), '宠物状态未能保存', '状态栏同文案')
  assert.ok(warns.some((w) => w.startsWith('[pet] 存档写入失败：')), '日志留痕且带 [pet] 前缀')

  // 故障消除 ⇒ 下一次写盘重试（D-9"可重试：自动"）⇒ 成功后诊断清空
  opts.fail = false
  await rec.send('pet.interact', { kind: 'bathe' })
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
  assert.equal(rec.overlays.has('pet.overlay'), false, '关 = 销毁（specs/pet-settings R3）')

  api.settings.set('pet.visible', true)
  await flush()
  assert.ok(rec.overlays.has('pet.overlay'), '开 = 重建')
  cleanup()
})

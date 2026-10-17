/**
 * 长轮询订阅队列（design D-3 的 S1 解法）：hold / 唤醒 / 25s 超时 / 清理（drain）。
 *
 * hub 层用注入的假定时器同步驱动（不等真 25 秒）；入口层的端到端行为在 extension.test.js。
 * 契约断言：25s 必须 < 宿主消息桥 60s 单次请求超时（guides-user.md:143），且理由写进了源码注释。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildView, createSubscribeHub } from '../lib/bridge.js'
import { HOST_REQUEST_TIMEOUT_MS, SUBSCRIBE_HOLD_MS } from '../lib/constants.js'
import { STATUS_TRACK } from '../lib/mapping.js'
import { initialState } from '../lib/settle.js'

/** 假定时器：setTimer/clearTimer 注入 hub，advance 手动推进（确定性测试，不依赖真实时钟） */
function fakeTimers() {
  const timers = new Map()
  let seq = 0
  let nowMs = 0
  return {
    setTimer(fn, ms) {
      const id = ++seq
      timers.set(id, { fn, at: nowMs + ms })
      return id
    },
    clearTimer(id) {
      timers.delete(id)
    },
    advance(ms) {
      nowMs += ms
      for (const [id, t] of [...timers]) {
        if (t.at <= nowMs) {
          timers.delete(id)
          t.fn()
        }
      }
    },
    get size() {
      return timers.size
    }
  }
}

/** 追踪 promise 是否已落定（hold 断言"没有立即回包"用） */
function track(promise) {
  const t = { settled: false, reply: undefined }
  promise.then(
    (r) => {
      t.settled = true
      t.reply = r
    },
    () => {
      t.settled = true
    }
  )
  return t
}

function holdReply(rev) {
  return { ok: true, state: { rev }, rev }
}

test('长轮询 · hold：rev 一致时挂起不回包（进 pending 队列）', async () => {
  const ft = fakeTimers()
  const hub = createSubscribeHub({ setTimer: ft.setTimer, clearTimer: ft.clearTimer })
  const p = track(hub.hold(() => holdReply(0)))
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(p.settled, false, 'hold 中不得立即 resolve')
  assert.equal(hub.size(), 1)
})

test('长轮询 · 唤醒：状态变化（rev+1）后 wake ⇒ 以最新状态回包 { ok:true, state, rev }', async () => {
  const ft = fakeTimers()
  const hub = createSubscribeHub({ setTimer: ft.setTimer, clearTimer: ft.clearTimer })
  let rev = 0
  // makeReply 在 resolve 时刻才调用 ⇒ 拿到的是唤醒时的 rev（入口先 rev+1 再 wake，D-8 次序）
  const p = hub.hold(() => holdReply(rev))
  rev = 1
  hub.wake()
  const reply = await p
  assert.deepEqual(reply, { ok: true, state: { rev: 1 }, rev: 1 })
  assert.equal(hub.size(), 0, 'wake 后队列清空')
  assert.equal(ft.size, 0, '超时定时器已清（不泄漏句柄）')
})

test('长轮询 · 超时：25s 到期回**相同 rev**（页面不重绘只重订阅，design D-3）', async () => {
  const ft = fakeTimers()
  const hub = createSubscribeHub({ setTimer: ft.setTimer, clearTimer: ft.clearTimer })
  const p = hub.hold(() => holdReply(7))
  ft.advance(SUBSCRIBE_HOLD_MS - 1)
  const early = track(p)
  await Promise.resolve()
  assert.equal(early.settled, false, '24.999s 还没到期')
  ft.advance(1)
  const reply = await p
  assert.deepEqual(reply, { ok: true, state: { rev: 7 }, rev: 7 }, '超时回 ok:true + 相同 rev')
  assert.equal(hub.size(), 0)
})

test('长轮询 · 清理：drain 丢弃全部 pending（窗体销毁/扩展停用），promise 不悬空', async () => {
  const ft = fakeTimers()
  const hub = createSubscribeHub({ setTimer: ft.setTimer, clearTimer: ft.clearTimer })
  const p1 = hub.hold(() => holdReply(0))
  const p2 = hub.hold(() => holdReply(0))
  assert.equal(hub.size(), 2)
  hub.drain({ ok: false, error: '宠物窗体已关闭' })
  assert.deepEqual(await p1, { ok: false, error: '宠物窗体已关闭' })
  assert.deepEqual(await p2, { ok: false, error: '宠物窗体已关闭' })
  assert.equal(hub.size(), 0)
  assert.equal(ft.size, 0, 'drain 清掉全部超时定时器')
  // drain 后 wake 不再影响已落定的 promise（幂等）
  hub.wake()
  hub.drain({ ok: false, error: 'x' })
})

test('长轮询 · 超时与唤醒竞态：先到者生效，后到者被 settled 标志吞掉（不双 resolve）', async () => {
  const ft = fakeTimers()
  const hub = createSubscribeHub({ setTimer: ft.setTimer, clearTimer: ft.clearTimer })
  let rev = 0
  const p = hub.hold(() => holdReply(rev))
  ft.advance(SUBSCRIBE_HOLD_MS) // 超时先落定（rev 0）
  const timeoutReply = await p
  assert.equal(timeoutReply.rev, 0)
  rev = 1
  hub.wake() // 再 wake：队列已空，无副作用
  assert.equal(hub.size(), 0)
})

test('长轮询 · 25s < 宿主 60s 请求超时：常量关系成立，且理由写进了源码注释', () => {
  assert.equal(SUBSCRIBE_HOLD_MS, 25_000, 'hold 上限逐字 25s（跨卡契约）')
  assert.equal(HOST_REQUEST_TIMEOUT_MS, 60_000, '宿主桥超时 60s（guides-user.md:143）')
  assert.ok(SUBSCRIBE_HOLD_MS < HOST_REQUEST_TIMEOUT_MS)
  // 任务卡要求"代码注释里写明理由"：constants.js 的 SUBSCRIBE_HOLD_MS 文档必须提到 60s 超时
  const src = readFileSync(new URL('../lib/constants.js', import.meta.url), 'utf8')
  const at = src.indexOf('SUBSCRIBE_HOLD_MS')
  const doc = src.slice(Math.max(0, src.lastIndexOf('/**', at)), at)
  assert.match(doc, /60s/)
  assert.match(doc, /超时/)
})

// ————— 卡 12（裁定 R14）：anim.status 跨卡契约 —————

const T0 = 1_700_000_000_000

test('卡12 · buildView().anim 携带机器可读 status：= resolveStatus 的英文 key，∈ STATUS_TRACK 九键', () => {
  const base = initialState(T0) // 三属性全满、lastInteractAt = T0 ⇒ idle
  const idleView = buildView(base, T0)
  // 卡 19 起 anim 多一项来源标记 self：非 transient 状态一律 false（这里三项都是 false）
  assert.deepEqual(idleView.anim, { row: 0, label: '待机', status: 'idle', self: false })

  // 连续 10 分钟无交互 ⇒ sleep：row 仍是 0（idle 行），label 中文'打盹'，status 'sleep'
  const sleepView = buildView({ ...base, lastInteractAt: T0 - 600_000 }, T0)
  assert.deepEqual(sleepView.anim, { row: 0, label: '打盹', status: 'sleep', self: false })

  // 瞬时互动同样带对应 key（eating → row 4）；没有 transientSelf 标记 ⇒ self 为 false（不是自发表演）
  const eatingView = buildView({ ...base, transient: { status: 'eating', until: T0 + 1600 } }, T0)
  assert.deepEqual(eatingView.anim, { row: 4, label: '喂食', status: 'eating', self: false })

  // status 恒为 STATUS_TRACK 的键之一（单一来源，页面 knownStatus 只认这九个）
  for (const view of [idleView, sleepView, eatingView]) {
    assert.ok(Object.hasOwn(STATUS_TRACK, view.anim.status), `status '${view.anim.status}' ∈ STATUS_TRACK`)
  }
  // 核心区分度：sleep 与 idle 同为 row 0 但 status 不同（页面慢放 ×1.5 与 Zzz 气泡全靠它）
  assert.equal(sleepView.anim.row, idleView.anim.row, 'sleep 与 idle 同为 row 0')
  assert.notEqual(sleepView.anim.status, idleView.anim.status, '但 status 不同：sleep ≠ idle')
  // 除 anim 增加 status 外，PetStateView 其余形状不动（D-3 契约）；
  // 卡 17（Q15=B）：卡 15 增补的顶层 `hidden` 已随隐藏功能移除 ⇒ 这里回到五键
  assert.deepEqual(Object.keys(idleView).sort(), ['anim', 'bubble', 'growth', 'items', 'vitals'])
})

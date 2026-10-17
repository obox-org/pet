/**
 * 卡 19 · 热修 D-1（v1.0.1）：随机表演播完必须回落呼吸 idle —— **页面侧**覆盖。
 *
 * D-1 的现象与根因（实机复验 §1）：随机抽到 `eating`/`bathing`/`petted`/`playing` 四项时
 * 播完不回落到呼吸 idle（DOM 停留 5.0/10.0/15.0s，连续多轮同轨连成一片 24.98s）。
 * 根因是入口的 `state.transient` 被随机表演与真实互动**共用**、状态字符串完全相同
 * （随机抽到的 `eating` 与用户点喂食都是 `'eating'`），页面侧只能按状态字符串猜来源 ——
 * 卡 18 的 `isSelfBurst` 只认 `trot`/`run-left`/`run-right` 三条同构轨，对同名四项无能为力。
 *
 * 修法是入口新增来源标记 `transientSelf` → 视图 `anim.self` → 页面按 `anim.self` 折 idle。
 * **入口侧**（`transientSelf` 的写入、`anim.self` 的取值、七项逐项）在
 * `test/actions-trot.test.js` 的"卡 19"小节用真实 `pet()` 实例覆盖；本文件覆盖**页面侧**：
 *
 * - 折 idle 判定与回落时限是纯函数（`app/lib/burst.ts`，零 import/零 DOM），**真跑**而不是源码正则
 *   —— 页面（app/**）没有 jsdom / @vue/test-utils（装它们会破坏"入口与页面无裸模块依赖"的约束，
 *   见 test/actions-ui.test.js 文件头），而 D-1 的核心决策恰恰在页面这一侧；
 * - `App.vue` 的接线（用 burstFallbackMs 挂兜底定时器、按 anim.self 出入口轨、不依赖入口下一次 tick）
 *   与 `app/lib/state.ts` 的归一化仍按既有惯例做**源码断言**；
 * - ✕ 关闭按钮的焦点环改白色 2px（父代理裁定 R53 / 复验报告 O-2）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RANDOM_PERF_SET, TRANSIENT_MS } from '../lib/constants.js'
import { STATUS_TRACK } from '../lib/mapping.js'
import {
  BURST_FALLBACK_MS,
  TRANSIENT_SLACK_MS,
  burstFallbackMs,
  entryTrackOf
} from '../app/lib/burst.ts'

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8')
const app = read('app/App.vue')
const stateTs = read('app/lib/state.ts')
const animTs = read('app/lib/anim.ts')
const burstTs = read('app/lib/burst.ts')
const panel = read('app/components/PetPanel.vue')
const mappingJs = read('lib/mapping.js')

/** 随机集里与真实互动**同名同轨**的四项（D-1 的直接受害者） */
const SAME_NAME_AS_INTERACTION = ['eating', 'bathing', 'petted', 'playing']

// ————— 页面侧折 idle 判定（真跑纯函数） —————

test('卡19 · 折 idle 判定：七项随机抽到**逐项**在"本地一轮播完"后折回呼吸 idle（D-1 核心断言）', () => {
  for (const status of RANDOM_PERF_SET) {
    const anim = { row: STATUS_TRACK[status].row, status, self: true }
    // 一轮进行中：照常渲染入口报的那一轨（不能提前折，否则动画根本看不见）
    assert.deepEqual(
      entryTrackOf(anim, false),
      { status, row: STATUS_TRACK[status].row },
      `${status}：一轮进行中照常渲染`
    )
    // 播完（锁存）：status 与 row **一起**降级成 idle/-1
    // （只降 status 的话 decideAnimation 会按 row 2/1/7 继续播侧跑/原地跑轨）
    assert.deepEqual(
      entryTrackOf(anim, true),
      { status: 'idle', row: -1 },
      `${status}：播完 ⇒ 折回呼吸 idle 且 row 同步 -1`
    )
  }
})

test('卡19 · 与真实互动同名的四项 ⇒ 播完**必回落**（D-1 原始现象逐项复现为断言）', () => {
  for (const status of SAME_NAME_AS_INTERACTION) {
    assert.ok(RANDOM_PERF_SET.includes(status), `${status} 在随机集里（同名同轨）`)
    const anim = { row: STATUS_TRACK[status].row, status, self: true }
    assert.deepEqual(entryTrackOf(anim, true), { status: 'idle', row: -1 }, `${status}：播完必回落`)
  }
  // 状态字符串完全相同、只有来源标记不同 ⇒ 判定必须相反（这正是"必须新增来源标记"的理由）
  for (const status of SAME_NAME_AS_INTERACTION) {
    const self = { row: STATUS_TRACK[status].row, status, self: true }
    const interaction = { row: STATUS_TRACK[status].row, status, self: false }
    assert.notDeepEqual(entryTrackOf(self, true), entryTrackOf(interaction, true), `${status}：来源不同 ⇒ 判定不同`)
  }
})

test('卡19 · 真实互动一律不被折掉：self=false 时**即便锁存位是脏的 true**也照旧渲染完整一轮', () => {
  for (const [kind, status] of [
    ['feed', 'eating'],
    ['bathe', 'bathing'],
    ['play', 'playing'],
    ['pet', 'petted']
  ]) {
    const anim = { row: STATUS_TRACK[status].row, status, self: false }
    assert.deepEqual(entryTrackOf(anim, false), { status, row: anim.row }, `${kind}：正常渲染`)
    assert.deepEqual(
      entryTrackOf(anim, true),
      { status, row: anim.row },
      `${kind}：锁存位脏了也不折（用户刚点的动作必须播满一轮）`
    )
  }
  // 普通状态（无 transient）同样不受锁存影响：self=false ⇒ 原样交给 decideAnimation
  for (const status of ['idle', 'hungry', 'dirty', 'sad', 'sleep']) {
    const anim = { row: STATUS_TRACK[status].row, status, self: false }
    assert.deepEqual(entryTrackOf(anim, true), { status, row: anim.row }, `${status}：非自发表演不折`)
  }
})

// ————— 停留收敛：一轮 + 既有 slack —————

test('卡19 · 停留收敛：兜底回落时限 = **该轨一轮真实时长 + 既有 slack（500ms）**，七项逐项', () => {
  assert.equal(TRANSIENT_SLACK_MS, 500, '既有 slack 逐字 500ms（跨卡契约，勿改）')
  for (const status of RANDOM_PERF_SET) {
    const round = TRANSIENT_MS[status]
    assert.equal(burstFallbackMs(round), round + TRANSIENT_SLACK_MS, `${status}：${round}ms + 500ms`)
    assert.ok(
      burstFallbackMs(round) <= round + TRANSIENT_SLACK_MS,
      `${status}：必须在"一轮 + slack"之内回落（不依赖入口的下一次 tick/推送）`
    )
  }
  // 计划还没算出来（null/非法）⇒ 用不小于最长一轮的兜底轮长，绝不提前掐掉动画
  const longest = Math.max(...Object.values(TRANSIENT_MS))
  assert.ok(BURST_FALLBACK_MS >= longest, `兜底轮长 ${BURST_FALLBACK_MS} 不小于最长一轮 ${longest}`)
  assert.equal(burstFallbackMs(null), BURST_FALLBACK_MS + TRANSIENT_SLACK_MS, '缺计划 ⇒ 兜底轮长 + slack')
  for (const bad of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, '1600']) {
    assert.equal(
      burstFallbackMs(bad),
      BURST_FALLBACK_MS + TRANSIENT_SLACK_MS,
      `畸形轮长（${String(bad)}）⇒ 兜底`
    )
  }
})

// ————— App.vue 接线（源码断言，沿用页面侧的既有惯例） —————

test('卡19 · App.vue 接线：入口轨按 anim.self 判定、兜底定时器用 burstFallbackMs、互动轮次 self=false', () => {
  // ① 入口轨：把整份 anim（含来源标记）交给纯函数，而不是拿状态字符串去查集合
  assert.match(
    app,
    /const entryTrack = computed\(\(\) => entryTrackOf\(display\.value\.anim, burstLatched\.value\)\)/,
    '折 idle 判定吃入口来源标记 anim.self'
  )
  assert.match(app, /const entryStatus = computed\(\(\) => entryTrack\.value\.status\)/, 'entryStatus 取自判定结果')
  assert.match(app, /const entryRow = computed\(\(\) => entryTrack\.value\.row\)/, 'entryRow 取自判定结果')
  // 断言"调用已删"而不是"整个文件不含该字样"：历史注疏里保留旧名是为了让后人看懂为什么删
  assert.equal(/isSelfBurst\s*\(/.test(app), false, '状态字符串来源判据已无任何调用（防 D-1 回归）')
  assert.match(app, /import \{ burstFallbackMs, entryTrackOf \} from '\.\/lib\/burst'/, '引用纯函数模块')

  // ② 来源标记：本地记下这一轮是谁写的；自发表演播完才锁存
  assert.match(app, /let transientIsSelf = false/, '本地来源标记与 transient 同生命周期')
  const cycle = app.slice(app.indexOf('function onCycleEnd()'), app.indexOf('function latchBurst()'))
  assert.match(cycle, /const wasSelf = transientIsSelf/, '帧时钟走完一轮时先取来源')
  assert.match(cycle, /if \(wasSelf\) latchBurst\(\)/, '自发表演播完 ⇒ 锁存 ⇒ 入口轨折 idle')
  assert.match(cycle, /transientIsSelf = false/, '清 transient 时同生命周期清来源')
  const start = app.slice(app.indexOf('function startTransient('), app.indexOf('function syncBurst('))
  assert.match(start, /transientIsSelf = self/, '起一轮时记下来源（默认 false = 真实互动）')
  assert.match(start, /if \(transientIsSelf\) latchBurst\(\)/, '兜底定时器到点同样锁存（页面不可见时 rAF 停摆）')
  assert.match(start, /burstFallbackMs\(round\)/, '倒计时时限 = 一轮 + slack（本次收敛的落点）')
  const teardown = app.slice(app.indexOf('function teardown()'), app.indexOf('\n}', app.indexOf('function teardown()')))
  assert.match(teardown, /transientIsSelf = false/, '卸载时一并复位')

  // ③ 互动：三处调用都走默认 self=false ⇒ 气泡与动画同为互动（不会被 self 标记折掉）
  assert.match(app, /if \(kind === 'pet'\) startTransient\('petted'\)/, '摸头不等回包先播（self 默认 false）')
  assert.match(app, /startTransient\(KIND_TO_STATUS\[kind\]\)/, '喂食/洗澡/玩耍同样起非自发的一轮')
  const sync = app.slice(app.indexOf('function syncBurst('), app.indexOf('function armBurstWatchdog()'))
  assert.match(sync, /anim\.self === true \? knownStatus\(anim\.status\) : undefined/, '只有 anim.self=true 且状态合法才当自发表演')
  assert.match(sync, /startTransient\(burst, true\)/, '自发表演起一轮并标记来源')
  assert.match(app, /syncBurst\(next\.anim, forceBurst\)/, 'applyState 同步整份 anim')

  // ④ 收敛不依赖入口的下一次推送：入口的 transient 到期既不 rev++ 也不推送（D-1 停留 5/10/15s 的来源）
  assert.equal(/watch\(\s*\(\) => display\.value\.anim\.status/.test(app), false, '没有"盯入口状态字符串"的旧 watch')
  assert.match(
    burstTs,
    /入口的 `transient` 到期[\s\S]{0,80}不产生[\s\S]{0,40}rev\+\+/,
    '注释写明"为什么不能等入口下一次推送"'
  )
})

test('卡19 · 契约与归一化：state.ts 的 anim.self 只认真布尔 true，DEFAULT_STATE 也有它', () => {
  assert.match(stateTs, /anim: \{ row: number; label: string; status: string; self: boolean \}/, 'PetStateView 声明 self')
  assert.match(stateTs, /self: animRaw\.self === true/, '畸形 self（字符串/数字/null/对象）一律归一 false')
  assert.match(stateTs, /anim: \{ row: -1, label: '', status: '', self: false \}/, '首帧占位态也有 self:false')
})

test('卡19 · 删除项防回归：入口与页面都不再有任何"按状态字符串认自发表演"的判据', () => {
  // "声明已删"而不是"整个文件不含该字样"：历史注疏里保留旧名是为了让后人看懂为什么删
  assert.equal(/export function isSelfBurst\s*\(/.test(mappingJs), false, '入口 isSelfBurst 声明已删')
  assert.equal(/SELF_BURST_STATUSES\s*=/.test(mappingJs), false, '入口同名集合声明已删')
  assert.equal(/export function isSelfBurst\s*\(/.test(animTs), false, '页面 isSelfBurst 声明已删')
  assert.equal(/SELF_BURST_SET\s*[:=]/.test(animTs), false, '页面同名集合声明已删')
  assert.equal(/isSelfBurst\s*\(/.test(app), false, 'App.vue 里没有该判据的任何调用')
  // 入口侧新增的唯一判据：来源标记（真布尔 true）
  assert.match(mappingJs, /export function isSelfTransient\(state, now\)/, '入口有 isSelfTransient')
  assert.match(mappingJs, /state\.transientSelf === true/, '只认真布尔 true')
  // 页面侧按 anim.self 判定，且判定是纯函数（可被 node --test 直接跑）
  assert.match(burstTs, /export function entryTrackOf\(anim: EntryAnim, latched: boolean\): EntryTrack/, '页面判定是纯函数')
  assert.match(burstTs, /anim\.self === true && latched/, '页面判定只看 anim.self')
})

// ————— 顺带：✕ 关闭按钮焦点环改白色（父代理裁定 R53 / 复验报告 O-2） —————

test('卡19 · R53：✕ 关闭按钮的 :focus-visible 环为白色 2px（与三枚图标按钮统一），可访问属性不动', () => {
  const style = panel.slice(panel.indexOf('<style scoped>'))
  const close = style.slice(style.indexOf('.close:focus-visible'), style.indexOf('.sync-hint'))
  assert.ok(close.length > 0, '定位到关闭按钮的焦点环规则')
  assert.match(close, /outline: none/, '沿用既有口径：不留系统轮廓')
  assert.match(close, /box-shadow: 0 0 0 2px #ffffff/, '白色 2px（与 .act:focus-visible 逐字一致）')
  assert.equal(/rgba\(/.test(close.slice(0, close.indexOf('}'))), false, '焦点环规则内不再有任何半透明色（旧青色是 rgba 形式）')
  assert.equal(/rgba\(56, 189, 248/.test(panel), false, '旧的青色焦点环色值已整条消失')
  assert.equal(/#38bdf8/.test(panel), false, '短写形式同样不再出现')
  // 与三枚图标按钮的焦点环逐字一致（"统一"是可断言的，不是观感描述）
  const act = style.slice(style.indexOf('.act:focus-visible'), style.indexOf('.tip {'))
  assert.match(act, /box-shadow: 0 0 0 2px #ffffff/, '图标按钮是白色 2px')
  assert.equal(
    close.slice(close.indexOf('box-shadow'), close.indexOf('}', close.indexOf('box-shadow'))),
    act.slice(act.indexOf('box-shadow'), act.indexOf('}', act.indexOf('box-shadow'))),
    '两处焦点环属性逐字相同'
  )
  // 只改颜色环：aria-label / 关闭行为 / 三枚图标不受影响
  assert.match(panel, /:aria-label="TEXT\.closePanel"/, '关闭按钮的 aria-label 未动')
  assert.match(panel, /@click="emit\('close'\)"/, '关闭行为未动')
  assert.equal((panel.slice(panel.indexOf('<template>'), panel.indexOf('</template>')).match(/<svg/g) ?? []).length, 3, '三枚图标仍在')
})

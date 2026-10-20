/**
 * 卡 17 · 隐藏 / 召唤的**负向断言** + 两个实机缺陷的回归（D-1 / D-2）。
 *
 * 卡 15 的这个文件有 11 条用例在测"隐藏态"这个功能本身；卡 17 按用户裁定 Q15=B 把该功能
 * **整条撤销**（design D-15 已改为撤销说明）⇒ 11 条全部转成"断言这些东西**不再存在**"：
 * - `KINDS` 不含 `summon`/`hide`（集合内容断言，不是源码字符串断言）；
 * - `interact()` 对 `summon`/`hide` 按**未知互动**拒绝，且状态一个字节都不动；
 * - 入口 `pet.interact{summon|hide}` 同样拒绝，且不写盘、不改数值；
 * - `sanitizeState` / `serialize` 的白名单不含 `hidden`（废字段静默丢弃）；
 * - `buildView` 返回**不含** `hidden` 键（PetStateView 回到五键）；
 * - **向后兼容**：旧存档里带 `hidden:true`（+ 合法 `position`）⇒ 正常读入、不报错、不备份
 *   `state.json.bad`、`position` 照常生效（"废弃字段"≠"损坏存档"）；
 * - 页面与全仓源码里不再有召唤胶囊 / 隐藏按钮 / `isHidden` 的任何痕迹；
 * - **D-1**：预置上一会话残留的 `pet.diagnostic` ⇒ 新会话启动成功后该键被写回 `''`、状态栏回「宠物」；
 *   反向：本次启动创建失败时**不**复位（失败线索要留给用户）；
 * - **D-2**：拖动中面板为关、拖动结束指针仍在命中区则面板恢复（判定的纯函数 + 页面接线）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pet from '../index.js'
import { TEXT } from '../lib/constants.js'
import { KINDS, interact } from '../lib/interact.js'
import { buildView } from '../lib/bridge.js'
import { sanitizeState, serialize } from '../lib/persist.js'
import { initialState } from '../lib/settle.js'
import { panelShouldOpen } from '../app/lib/panel.ts'
import { flush, makeApi } from './helpers/mock-api.js'

const T0 = 1_700_000_000_000
const extRoot = fileURLToPath(new URL('..', import.meta.url))

/** 上一会话残留在设置存储里的诊断文案（卡 16 实机缺陷 D-1 的原文） */
const STALE_DIAGNOSTIC = '宠物窗体创建失败：overlay id 已存在（重复创建）'

function saveText(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    fish: 7,
    bubble: 2,
    growth: 123.4,
    favor: 0,
    lastGrowthAt: T0,
    lastAfkAt: T0,
    lastPetAt: T0 - 1000,
    position: null,
    ...overrides
  })
}

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
    tick: () => m.rec.timers.get('pet-tick').cb(),
    mainWrites: () => m.rec.fsLog.filter(([op, p]) => op === 'writeFile' && p === 'state.json').length,
    setPositions: () =>
      m.rec.overlayLog.filter((e) => e[0] === 'setPosition').map((e) => ({ x: e[2], y: e[3] }))
  }
}

/** 递归列出目录下这些后缀的源码文件（跳过构建产物与素材/规格目录） */
function sourceFiles(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'out', '.git', 'assets', 'openspec', 'docs'].includes(name)) continue
    const path = dir + '/' + name
    if (statSync(path).isDirectory()) sourceFiles(path, exts, out)
    else if (exts.some((e) => name.endsWith(e))) out.push(path)
  }
  return out
}

// ————— 纯函数层：kind 集合与视图/存档形状 —————

test('卡17 移除 · KINDS 只剩三种互动（负向：不含 v1 的 summon / hide / 玩耍 kind）', () => {
  // v2 的合法互动恰好三种（specs/pet-interaction R1）；v1 的 `summon` / `hide` / 玩耍
  // 三条 kind 都不在里面。数组而非 Set（可直接 deepEqual 钉住集合内容，不是只断言长度）。
  assert.deepEqual([...KINDS], ['feed', 'bathe', 'pet'], '合法互动只有 feed/bathe/pet')
  for (const gone of ['summon', 'hide', 'dance']) {
    assert.equal(KINDS.includes(gone), false, `KINDS 不含 ${gone}`)
  }
})

test('卡17 移除 · interact() 对 summon/hide 按"未知互动"拒绝、零副作用（不携带 text/anim、不改进度）', () => {
  const before = initialState(T0)
  for (const kind of ['summon', 'hide']) {
    const r = interact(before, kind, T0)
    assert.equal(r.ok, false, `${kind} ⇒ 拒绝`)
    assert.equal(r.reason, 'unknown-kind', `${kind} ⇒ 未知互动（design D-9 的错误码）`)
    assert.equal(r.text, undefined, '未知互动不弹气泡（只由入口写一条诊断）')
    assert.equal(r.anim, undefined, '未知互动不产生动画')
    assert.deepEqual(r.state, before, '状态一个字节都不动（拒绝分支返回原样快照）')
  }
  // 反向自检：合法 kind 照常工作（拒绝不是因为函数坏了）
  assert.equal(interact(initialState(T0), 'feed', T0).ok, true)
  // 旧存档字段"hidden"即使被人塞进内存状态，也**不再**拦任何互动（隐藏态拒绝分支已删）
  const legacy = { ...initialState(T0), hidden: true }
  assert.equal(interact(legacy, 'feed', T0).ok, true, 'hidden 不再是能拦住互动的状态')
  assert.equal(interact(legacy, 'pet', T0).ok, true)
})

test('卡17 移除 · buildView 返回不含 hidden 键（PetStateView 是 v2 四键契约）', () => {
  const view = buildView(initialState(T0), T0)
  assert.deepEqual(Object.keys(view).sort(), ['anim', 'bubble', 'items', 'values'])
  assert.equal('hidden' in view, false, '视图里没有 hidden 这个键（不是 undefined，是压根不存在）')
})

test('卡17 移除 · sanitizeState / serialize 的白名单不含 hidden（废字段被静默丢弃）', () => {
  // sanitizeState 是白名单构造：旧存档里的 hidden 读进来即丢，不会留在状态对象上
  const cleaned = sanitizeState({ schemaVersion: 1, hidden: true, position: { x: 1, y: 2 } })
  assert.equal('hidden' in cleaned, false, 'sanitizeState 不产出 hidden')
  assert.deepEqual(cleaned.position, { x: 1, y: 2 }, '其余字段照常读入（position 不受影响）')
  for (const bad of [true, false, 'true', 1, null, undefined, {}]) {
    assert.equal('hidden' in sanitizeState({ hidden: bad }), false, `hidden=${String(bad)} 一律丢弃`)
  }
  // serialize 白名单同样不含它（落盘文件里写不进 hidden）
  const parsed = JSON.parse(serialize({ ...initialState(T0), hidden: true }))
  assert.equal('hidden' in parsed, false, 'serialize 不再写 hidden')
  assert.equal(parsed.schemaVersion, 1, 'schemaVersion 口径不变（加/删字段不动版本号）')
})

// ————— 入口层：拒绝与向后兼容 —————

test('卡17 移除 · 入口 pet.interact{summon|hide} ⇒ 未知互动拒绝，状态与磁盘一个字节都不动', async (t) => {
  const { rec, cleanup, mainWrites } = activate(t)
  await flush()
  const before = await rec.send('pet.ready')
  assert.equal(before.ok, true)
  assert.equal('hidden' in before.state, false, '视图里没有 hidden')

  for (const kind of ['summon', 'hide']) {
    const r = await rec.send('pet.interact', { kind })
    assert.equal(r.ok, false, `${kind} ⇒ 拒绝`)
    assert.equal(r.error, `未知互动: ${kind}`, '逐字走"未知互动"文案')
    assert.equal(r.state, undefined)
  }
  const after = await rec.send('pet.ready')
  assert.deepEqual(after.state.values, before.state.values, '成长值/好感/等级一个字节都没动')
  assert.deepEqual(after.state.items, before.state.items, '库存没动')
  assert.equal(mainWrites(), 0, '被拒的请求不触发任何写盘')

  // 合法互动照常可用（对照组）
  const feed = await rec.send('pet.interact', { kind: 'feed' })
  assert.equal(feed.ok, true)
  assert.equal(feed.state.items.fish, before.state.items.fish - 1, '喂食照常扣鱼干')
  cleanup()
})

test('卡17 移除 · 旧存档带 hidden:true + position ⇒ 正常读入：不报错、不备份 .bad、position 保留', async (t) => {
  const warns = captureWarn(t)
  const { rec, cleanup, setPositions } = activate(t, {
    files: { 'state.json': saveText({ hidden: true, position: { x: 1, y: 2 } }) }
  })
  await flush()

  // 硬性向后兼容：废字段既不报错、也不触发 D-9 的"备份 + 初始值重建"
  assert.equal(rec.fs.has('state.json.bad'), false, '废字段不触发备份重建（不是损坏存档）')
  assert.deepEqual(
    warns.filter((w) => w.includes('state.json') || w.includes('存档')),
    [],
    `不产生存档相关 warn；实际: ${JSON.stringify(warns)}`
  )
  assert.ok(rec.overlays.has('pet.overlay'), '窗体照常创建')
  const r = await rec.send('pet.ready')
  assert.equal(r.ok, true)
  assert.equal('hidden' in r.state, false, '读进来的状态里没有 hidden')
  assert.deepEqual(r.state.values, { growth: 123, favor: 0, level: 1, levelName: '初次见面' }, '其余字段照常读入')
  assert.equal(r.state.items.fish, 7)
  assert.deepEqual(setPositions(), [{ x: 1, y: 2 }], '存档 position 照常应用到窗体')
  cleanup()
})

// ————— 页面与全仓源码：召唤胶囊 / 隐藏按钮 / hidden 痕迹清场 —————

test('卡17 移除 · 页面无召唤胶囊与隐藏按钮：App.vue 无 .summon/isHidden/onSummon，PetPanel 无 hide emit', () => {
  const app = readFileSync(new URL('../app/App.vue', import.meta.url), 'utf8')
  const panel = readFileSync(new URL('../app/components/PetPanel.vue', import.meta.url), 'utf8')

  for (const banned of ['class="summon"', 'isHidden', 'onSummon', 'TEXT.summon', 'summonEl', '.summon {']) {
    assert.equal(app.includes(banned), false, `App.vue 不应再含 "${banned}"`)
  }
  assert.equal(/TEXT\.summonAria/.test(app), false, '召唤胶囊的 aria 文案已删')
  // 精灵不再被 v-if/v-else 包着（取消中间形态）：模板里没有 v-if="isHidden" 一类分支
  assert.equal(app.includes('v-if="isHidden"'), false)
  assert.equal(panel.includes("emit('hide')"), false, '面板不再有 hide 事件')
  assert.equal(/\(e: 'hide'\)/.test(panel), false, '面板的 emits 声明里没有 hide')
  assert.equal(panel.includes('TEXT.hide'), false, '面板不再引用"隐藏"按钮文案')
  assert.equal(app.includes('@hide='), false, 'App.vue 不再监听面板的 hide 事件')
})

test('卡17 移除 · 入口源码清场：lib/** 与 index.js 里没有 hidden/summon/hide 的代码残留', () => {
  const files = [...sourceFiles(`${extRoot}lib`, ['.js'], []), `${extRoot}index.js`]
  assert.ok(files.length >= 10, `应扫到全部入口侧源码，实际 ${files.length} 个`)
  // 只禁"代码形态"（带引号/属性访问/函数名），不禁解释"为什么删掉"的中文与反引号注释
  const banned = [
    "'summon'",
    '"summon"',
    "'hide'",
    '"hide"',
    'state.hidden',
    's.hidden',
    'hidden:',
    'TEXT.summon',
    'TEXT.hiddenBlocked',
    'TEXT.hide',
    'hiddenBlocked',
    'toggleHidden',
    'isHidden'
  ]
  const offenders = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const bad of banned) {
      if (text.includes(bad)) offenders.push(`${file.replace(extRoot, '')} ⇒ ${bad}`)
    }
  }
  assert.deepEqual(offenders, [], '隐藏/召唤的代码痕迹必须清干净')
})

test('卡17 移除 · app/** 源码清场：不出现 summon / 召唤 / 隐藏 / isHidden（产物 grep 的源码级保证）', () => {
  const files = sourceFiles(`${extRoot}app`, ['.ts', '.vue', '.css', '.html'], [])
  assert.ok(files.length >= 12, `应扫到全部页面源码，实际 ${files.length} 个`)
  // 注意：`overflow: hidden` / `visibilityState === 'hidden'` 是合法用法，所以这里只禁这些词形；
  // `'summon'` / `"summon"` 只禁**代码形态**——解释"旧载荷为什么被拒绝"的中文注疏允许保留
  // （`lib/interact.js` 的 KINDS 注释同理，见下一条）。
  const banned = ["'summon'", '"summon"', '召唤', '隐藏', 'isHidden', 'TEXT.hide', "emit('hide')", '.summon', 'summonEl']
  const offenders = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const bad of banned) {
      if (text.includes(bad)) offenders.push(`${file.replace(extRoot, '')} ⇒ ${bad}`)
    }
  }
  assert.deepEqual(offenders, [], '页面源码（会被构建进产物）里必须一处不剩')
  // README 不属于产物，但同样不该再介绍被撤销的功能
  const readme = readFileSync(`${extRoot}README.md`, 'utf8')
  for (const bad of ['召唤', 'summon', '鲸鱼娘藏起来了']) {
    assert.equal(readme.includes(bad), false, `README 不应再介绍被撤销的功能：${bad}`)
  }
  assert.ok(
    readme.includes('隐藏（把宠物收起来）只由本 toggle 承担'),
    'README 必须写明"隐藏只由设置页 toggle 承担（销毁窗体省 CPU）"'
  )
})

// ————— D-1：pet.diagnostic 跨会话残留 —————

test('卡17 D-1 · 预置上一会话的失败文案 ⇒ 启动成功后该键为空串、状态栏写回「宠物」', async (t) => {
  const { rec, cleanup } = activate(t, {
    settings: { 'pet.diagnostic': STALE_DIAGNOSTIC }
  })
  await flush()
  assert.ok(rec.overlays.has('pet.overlay'), '本次启动窗体建好了')
  assert.equal(rec.settings.get('pet.diagnostic'), '', '残留的失败文案被写回空串（跨会话残留修复）')
  assert.equal(rec.statusTexts.get('pet.status'), '宠物', '状态栏回到常态文本')
  // 必须**真的写了一次设置**（去重短路曾被内存初值 null 吃掉，这才是缺陷根因）
  assert.deepEqual(
    rec.settingsLog.filter(([k]) => k === 'pet.diagnostic'),
    [['pet.diagnostic', '']],
    '启动复位是一次真实的设置写入'
  )
  cleanup()
})

test('卡17 D-1 · 本次启动窗体创建失败 ⇒ 诊断位保留失败文案（复位不吃掉排查线索）', async (t) => {
  const { rec, cleanup } = activate(t, {
    settings: { 'pet.diagnostic': STALE_DIAGNOSTIC },
    failCreate: 'overlay 已存在：pet.overlay'
  })
  await flush()
  assert.equal(rec.overlays.size, 0, '窗体没建成')
  assert.equal(
    rec.settings.get('pet.diagnostic'),
    '宠物窗体创建失败：overlay 已存在：pet.overlay',
    '失败文案覆盖残留值并保留'
  )
  assert.equal(rec.statusTexts.get('pet.status'), '宠物窗体创建失败：overlay 已存在：pet.overlay')
  cleanup()
})

test('卡17 D-1 · 设置里关掉了宠物（根本不建窗）也算启动成功 ⇒ 残留诊断照样清掉', async (t) => {
  const { rec, cleanup } = activate(t, {
    settings: { 'pet.diagnostic': STALE_DIAGNOSTIC, 'pet.visible': false }
  })
  await flush()
  assert.equal(rec.overlays.size, 0, '按设置不建窗')
  assert.equal(rec.settings.get('pet.diagnostic'), '', '没有失败发生 ⇒ 残留文案同样是脏数据')
  assert.equal(rec.statusTexts.get('pet.status'), '宠物')
  cleanup()
})

// ————— D-2：拖动中面板不该弹出 —————

test('卡17 D-2 · 面板开合判定：拖动中为关；拖动结束指针仍在命中区 ⇒ 面板恢复', () => {
  // 纯函数层（真实的布尔组合，不是源码字符串断言）
  assert.equal(panelShouldOpen(true, false, true), false, '拖动中：即使指针命中也不开面板')
  assert.equal(panelShouldOpen(false, true, true), false, '拖动中：键盘展开的也关掉')
  assert.equal(panelShouldOpen(true, false, false), true, '松手后指针仍在命中区 ⇒ 面板恢复')
  assert.equal(panelShouldOpen(false, true, false), true, '松手后键盘展开照常生效')
  assert.equal(panelShouldOpen(false, false, false), false, '既没命中也没键盘 ⇒ 不开')
  // 真实场景序列：命中 → 按下（拖动开始）→ 松手（指针仍停在精灵上）
  let hovered = true
  let dragging = true
  assert.equal(panelShouldOpen(hovered, false, dragging), false, '拖动中 true ⇒ 关')
  dragging = false // drag end（endDrag 里把 dragging 置回 false）
  assert.equal(panelShouldOpen(hovered, false, dragging), true, '拖完面板照常出来（不会"再也不出"）')
})

test('卡17 D-2 · 页面接线：panelOpen 由 panelShouldOpen 计算，拖动开始/结束即时生效', () => {
  const app = readFileSync(new URL('../app/App.vue', import.meta.url), 'utf8')
  assert.match(
    app,
    /const panelOpen = computed\(\(\) => panelShouldOpen\(hovered\.value, focusOpened\.value, dragging\.value\)\)/,
    '面板开合的唯一判据是纯函数（hovered ∪ focusOpened，且排除 dragging）'
  )
  assert.match(app, /const dragging = ref\(false\)/, 'dragging 是响应式：翻转时 panelOpen 立刻重算')
  const down = app.slice(
    app.indexOf('function onSpritePointerDown'),
    app.indexOf('function onSpritePointerMove')
  )
  assert.match(down, /dragging\.value = true/, '按下即进入拖动会话（面板随之收起）')
  const end = app.slice(app.indexOf('function endDrag()'), app.indexOf('\n}', app.indexOf('function endDrag()')))
  assert.match(end, /dragging\.value = false/, '松手退出拖动会话（面板按当时几何恢复）')
  // hovered 必须继续如实反映几何（拖动期间也更新）⇒ 松手后无需任何补偿代码
  const move = app.slice(app.indexOf('function onPointerMove'), app.indexOf('\n}', app.indexOf('function onPointerMove')))
  assert.ok(!/if \(dragging\.value\) return/.test(move), '指针移动处理不因拖动而提前返回')
  assert.match(move, /hovered\.value = next/, 'hovered 照常按几何更新')
})

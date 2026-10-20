/**
 * 卡 05 · page-and-panel 的验收测试（页面消费 v2 视图 / 气泡 4 秒 / 两枚图标 + 只读等级名）。
 *
 * 两类断言，界限写清楚：
 *
 * 1. **真跑**（`import ... from '../app/lib/state.ts'`）：视图归一化与"互动回包分流"是纯数据逻辑，
 *    Node 24 的类型擦除能直接跑 `.ts`，所以"缺 values / 缺 levelName / bubble 畸形不崩"、
 *    "三种拒绝走气泡、unknown-kind 走错误"以及 `BUBBLE_MS` 都是**执行出来的结论**，
 *    不是源码正则。`app/lib/burst.ts` 同样零 import，`anim.self` 折回（D-1 的修复）在这里真跑。
 * 2. **源码断言**：`app/**` 没有 jsdom / @vue/test-utils（装它们会破坏"入口与页面无裸模块依赖"
 *    的既有约束，见 `test/actions-ui.test.js` 文件头），所以面板 DOM 结构、样式常量、App.vue 的
 *    事件接线按本仓库既有惯例做源码断言——每一条都对应一个能被肉眼/产物 grep 复核的事实。
 *
 * 覆盖任务卡验收 ①–④ 与负向自检：
 * - 视图归一化（缺 `values`/缺 `levelName`/`bubble` 畸形 ⇒ 不崩且降级、等级名回退空串）；
 * - `BUBBLE_MS = 4000` 且与入口 `lib/constants.js` 的 `BUBBLE_MS` 逐值相等；
 * - 面板源码：恰两枚 `.act`、**无数字渲染**、含 `levelName`、`stroke:#fff`、`.tip` 仍在；
 * - `reason` 分流：`cooling` / `no-item` / `pet-cooling` 走气泡（**不是**错误），
 *   `unknown-kind` 才是错误路径；
 * - 无 `sleep` / 无 1.5 倍慢放 / 无属性轨；`anim.self` 折回仍生效。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BUBBLE_MS as ENTRY_BUBBLE_MS } from '../lib/constants.js'
import { RANDOM_PERF_SET } from '../lib/constants.js'
import { STATUS_TRACK as ENTRY_STATUS_TRACK } from '../lib/mapping.js'
import {
  BUBBLE_MS,
  DEFAULT_STATE,
  REASON_COOLING,
  REASON_NO_ITEM,
  REASON_PET_COOLING,
  REASON_UNKNOWN_KIND,
  TEXT,
  interactDispatch,
  normalizeState
} from '../app/lib/state.ts'
import { entryTrackOf } from '../app/lib/burst.ts'

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8')

const app = read('app/App.vue')
const panel = read('app/components/PetPanel.vue')
const stateTs = read('app/lib/state.ts')
const animTs = read('app/lib/anim.ts')
const burstTs = read('app/lib/burst.ts')
const pageCss = read('app/style.css')

/** 取 SFC 的 <template> 段（结构断言只看模板，避免被注释里的说明文字误伤） */
function templateOf(sfc) {
  const start = sfc.indexOf('<template>')
  const end = sfc.lastIndexOf('</template>')
  assert.ok(start >= 0 && end > start, 'SFC 应有 <template> 段')
  return sfc.slice(start, end)
}

/** 取 SFC 的 <style> 段 */
function styleOf(sfc) {
  const start = sfc.indexOf('<style scoped>')
  assert.ok(start >= 0, 'SFC 应有 <style scoped> 段')
  return sfc.slice(start)
}

/** 取 SFC 的 <script setup> 段 */
function scriptOf(sfc) {
  const end = sfc.indexOf('</script>')
  assert.ok(end > 0, 'SFC 应有 <script> 段')
  return sfc.slice(0, end)
}

/** 模板里"人眼看得到的文本"：去掉 HTML 注释与内联 SVG（路径坐标里的数字不是渲染文本） */
function visibleTextOf(tpl) {
  return tpl.replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '')
}

// ————— ① 视图契约与归一化（真跑） —————

test('卡05 视图 · PetStateView 是 v2 四字段：items / values / anim / bubble（没有 vitals、没有旧 growth）', () => {
  // DEFAULT_STATE 就是契约的"空态"快照：入口首帧没回来之前页面拿它渲染
  assert.deepEqual(DEFAULT_STATE, {
    items: { fish: 3, bubble: 3 },
    values: { growth: 0, favor: 0, level: 1, levelName: '初次见面' },
    anim: { row: -1, label: '', status: '', self: false },
    bubble: null
  })
  const normalized = normalizeState(DEFAULT_STATE)
  assert.deepEqual(Object.keys(normalized).sort(), ['anim', 'bubble', 'items', 'values'], '顶层只有四个字段')
  assert.deepEqual(Object.keys(normalized.values).sort(), ['favor', 'growth', 'level', 'levelName'], 'values 四个只读字段')
  assert.equal('vitals' in normalized, false, 'vitals 已从契约里物理删除（specs/pet-vitals 的 4 条 REMOVED）')
  assert.equal('growth' in normalized, false, '顶层没有 v1 的 growth:{value,rank,rankName}')
  // v1 的 v1 形状即使出现也不被读取（老页面/老回包不会把等级算错）
  const legacy = normalizeState({
    vitals: { hunger: 40, clean: 20, mood: 70 },
    growth: { value: 128, rank: 2, rankName: '挚友' },
    items: { fish: 7, bubble: 5 }
  })
  assert.deepEqual(legacy.values, { growth: 0, favor: 0, level: 1, levelName: '' }, '旧三属性/旧成长结构不被读取')
  assert.deepEqual(legacy.items, { fish: 7, bubble: 5 }, '道具照常归一（v1 存档迁移后的字段名未变）')
  assert.equal('vitals' in legacy, false, '连一个 vitals 键都不留')
})

test('卡05 归一化 · 缺 values / 缺 levelName 降级为空串且不崩（页面不白屏）', () => {
  const noValues = normalizeState({ items: { fish: 2, bubble: 1 }, anim: { row: 0, label: '待机', status: 'idle' } })
  assert.deepEqual(
    noValues.values,
    { growth: 0, favor: 0, level: 1, levelName: '' },
    '缺 values ⇒ 数值 0、等级 1、**等级名空串**（页面不自己编名字：等级表单一来源在入口）'
  )
  assert.equal(noValues.anim.status, 'idle', '其它字段不受影响')

  // levelName 畸形：非字符串 / 纯空白 / null / 数组 —— 一律空串，绝不把 [object Object] 画到面板上
  for (const raw of [42, null, undefined, {}, ['心有灵犀'], '   ', '\n\t']) {
    const got = normalizeState({ values: { levelName: raw } })
    assert.equal(got.values.levelName, '', `levelName=${JSON.stringify(raw)} ⇒ 空串`)
  }
  // 正常值原样透传（含超长名字：单行省略由样式负责，归一化只裁掉首尾空白）
  assert.equal(normalizeState({ values: { levelName: '心有灵犀' } }).values.levelName, '心有灵犀')
  assert.equal(normalizeState({ values: { levelName: '  命定相伴  ' } }).values.levelName, '命定相伴')
})

test('卡05 归一化 · 数值越界/畸形一律钳到合法区间（growth/favor 非负、level 1..10）', () => {
  const values = normalizeState({
    values: { growth: 12.9, favor: 651, level: 9, levelName: '彼此唯一' }
  }).values
  assert.deepEqual(values, { growth: 12, favor: 651, level: 9, levelName: '彼此唯一' }, '成长/好感取整、满级后好感继续累加')

  for (const [raw, want] of [
    [99, 10],
    [0, 1],
    [-3, 1],
    ['abc', 1],
    [null, 1],
    [undefined, 1],
    [NaN, 1],
    [3.7, 3]
  ]) {
    assert.equal(normalizeState({ values: { level: raw } }).values.level, want, `level=${String(raw)} ⇒ ${want}`)
  }
  for (const raw of [-5, -0.4, 'abc', null, undefined, Infinity]) {
    const v = normalizeState({ values: { growth: raw, favor: raw } })
    assert.deepEqual([v.values.growth, v.values.favor], [0, 0], `growth/favor=${String(raw)} ⇒ 0`)
  }
})

test('卡05 归一化 · bubble 畸形 ⇒ null（不显示一条空气泡），正常值原样保留', () => {
  for (const raw of [null, undefined, 'bubble', 42, [], {}, { text: '' }, { text: '   ' }, { text: 123 }]) {
    assert.equal(normalizeState({ bubble: raw }).bubble, null, `bubble=${JSON.stringify(raw)} ⇒ null`)
  }
  assert.deepEqual(
    normalizeState({ bubble: { text: '呜哇！小鱼干好好吃！', tone: 'bad', until: 1700000004000 } }).bubble,
    { text: '呜哇！小鱼干好好吃！', tone: 'bad', until: 1700000004000 }
  )
  const weird = normalizeState({ bubble: { text: '好', tone: 'zzz', until: 'abc' } }).bubble
  assert.deepEqual(weird, { text: '好', tone: 'good', until: 0 }, 'tone 只认 bad，其余归一 good；until 非数字归一 0')
})

test('卡05 归一化 · 整份回包畸形（null/字符串/数字/数组）也不抛错，给出安全空态', () => {
  for (const raw of [null, undefined, 'oops', 42, [], true]) {
    const got = normalizeState(raw)
    assert.deepEqual(got.items, { fish: 0, bubble: 0 }, `raw=${JSON.stringify(raw)} ⇒ 道具 0`)
    assert.deepEqual(got.values, { growth: 0, favor: 0, level: 1, levelName: '' }, '数值安全')
    assert.deepEqual(got.anim, { row: -1, label: '', status: '', self: false }, 'row=-1 是"入口没给行号"的哨兵')
    assert.equal(got.bubble, null)
  }
  // anim.self 只认真布尔 true（畸形的 'true' / 1 / 'yes' 一律 false：宁可少折一轮，也不吞用户刚点的互动）
  for (const raw of ['true', 1, 'yes', null, undefined, {}]) {
    assert.equal(normalizeState({ anim: { self: raw } }).anim.self, false, `self=${JSON.stringify(raw)} ⇒ false`)
  }
  assert.equal(normalizeState({ anim: { self: true } }).anim.self, true, '真布尔 true 才透传')
})

// ————— ② 气泡 4 秒 —————

test('卡05 气泡 · 页面 BUBBLE_MS = 4000，且与入口 lib/constants.js 的 BUBBLE_MS 逐值相等', () => {
  assert.equal(BUBBLE_MS, 4000, 'specs/pet-interaction R5：任何气泡 4 秒')
  assert.equal(ENTRY_BUBBLE_MS, 4000, '入口单一来源同为 4 秒（两套构建无法共享模块，靠这条断言钉住）')
  assert.equal(BUBBLE_MS, ENTRY_BUBBLE_MS, '两侧逐值相等：只改一侧就会出现"界面先消失/留残余"')
  // 页面里不许再出现 v1 的 2600（那是 2.6 秒的口径）
  assert.equal(app.includes('2600'), false, 'App.vue 不再有 2600ms 的旧气泡时长')
  assert.equal(stateTs.includes('2600'), false, 'state.ts 不再有 2600ms 的旧气泡时长')
  // 互动气泡与错误气泡都从同一个常量取；状态气泡另有"最多 BUBBLE_MS×4"的挂死保护
  assert.match(app, /const STATE_BUBBLE_MAX_MS = BUBBLE_MS \* 4/, '状态气泡的展示上限仍由同一常量派生')
  const showBubbleCalls = app.match(/showBubble\([^)]*BUBBLE_MS[^)]*\)/g) ?? []
  assert.equal(showBubbleCalls.length, 2, `互动成功/失败两条气泡都用 BUBBLE_MS（实际 ${showBubbleCalls.length} 处）`)
  assert.match(app, /showBubble\(b\.text, b\.tone, Math\.min\(remaining, STATE_BUBBLE_MAX_MS\), false\)/, '状态气泡走派生上限')
})

// ————— ③ reason 分流（卡 4 移交的坑，真跑） —————

test('卡05 reason 分流 · cooling / no-item / pet-cooling 三种拒绝 MUST 走气泡（不是错误）', () => {
  const cases = [
    { reason: REASON_COOLING, text: '刚互动过啦，让我歇一会儿～', kind: 'feed' },
    { reason: REASON_NO_ITEM, text: '没有小鱼干了，多陪我工作一会儿吧～', kind: 'feed' },
    { reason: REASON_PET_COOLING, text: '摸过头啦，让鲸鱼娘歇口气～', kind: 'pet' }
  ]
  for (const { reason, text, kind } of cases) {
    const reply = interactDispatch({ ok: false, reason, state: {}, feedback: { text, tone: 'bad' } }, kind)
    assert.equal(reply.path, 'bubble', `${reason}：走气泡，**不是**错误路径（v1 的 unwrap 一票 throw 就是这里的坑）`)
    assert.equal(reply.tone, 'bad', `${reason}：tone=bad（用户看得到的提示）`)
    assert.equal(reply.text, text, `${reason}：用入口带回的那一句，不退化成通用报错`)
    assert.equal(reply.accepted, false, `${reason}：没有受理（页面不起瞬时动画）`)
    assert.equal(reply.reason, reason)
  }
})

test('卡05 reason 分流 · unknown-kind 才是错误路径（不弹气泡、只记诊断）', () => {
  const reply = interactDispatch({ ok: false, reason: REASON_UNKNOWN_KIND, error: '未知互动: play' }, 'play')
  assert.equal(reply.path, 'error', 'unknown-kind 走错误路径（D-9：不弹气泡、诊断位记录）')
  assert.equal(reply.text, '未知互动: play', '诊断句取自回包的 error')
  assert.equal(reply.tone, 'bad')
  assert.equal(reply.accepted, false)
})

test('卡05 reason 分流 · 受理（ok:true）走气泡；缺 text 时按 reason 兜底到正确的那一句', () => {
  const ok = interactDispatch({ ok: true, state: {}, feedback: { text: '呜哇！小鱼干好好吃！', tone: 'good' } }, 'feed')
  assert.deepEqual(
    { path: ok.path, tone: ok.tone, text: ok.text, accepted: ok.accepted },
    { path: 'bubble', tone: 'good', text: '呜哇！小鱼干好好吃！', accepted: true }
  )

  // 回包缺 text（畸形/老入口）：兜底句必须与 reason 对齐，不能把"冷却"说成"没有道具"
  const fallbacks = [
    [REASON_COOLING, 'feed', TEXT.petCooling],
    [REASON_PET_COOLING, 'pet', TEXT.petCooling],
    [REASON_NO_ITEM, 'feed', TEXT.missing.feed],
    [REASON_NO_ITEM, 'bathe', TEXT.missing.bathe],
    ['', 'feed', TEXT.feedback.feed],
    ['', 'bathe', TEXT.feedback.bathe],
    ['', 'pet', TEXT.feedback.pet]
  ]
  for (const [reason, kind, want] of fallbacks) {
    const reply = interactDispatch({ ok: reason === '', reason: reason || undefined, feedback: {} }, kind)
    assert.equal(reply.text, want, `reason=${reason || '(成功)'} kind=${kind} 的兜底句`)
  }
})

test('卡05 reason 分流 · 任何畸形回包都有结论且不抛错（未来新增的未知拒绝也不当气泡）', () => {
  for (const raw of [null, undefined, 'oops', 42, [], {}, { ok: false }, { ok: false, reason: '' }]) {
    const reply = interactDispatch(raw, 'feed')
    assert.equal(reply.path, 'error', `raw=${JSON.stringify(raw)} ⇒ 无 ok 也无已知 reason，按错误处理`)
    assert.equal(reply.text, TEXT.genericError, '兜底一句通用报错（绝不空串）')
  }
  const future = interactDispatch({ ok: false, reason: 'not-implemented' }, 'feed')
  assert.equal(future.path, 'error', '未来新增的未知拒绝默认按错误处理，不会被误当气泡')
})

// ————— ④ 面板源码断言 —————

test('卡05 面板 · 互动区**恰好两枚** .act（喂食/洗澡），可访问名逐字且 DOM 顺序 = Tab 顺序', () => {
  const tpl = templateOf(panel)
  assert.equal(tpl.split('class="act"').length - 1, 2, '恰好两枚 class="act" 按钮（v1 的「玩耍」已删）')
  assert.equal(tpl.split('<svg').length - 1, 2, '两枚图标 = 两枚内联 SVG（不用 <img>/emoji/图标字体）')
  assert.equal(tpl.split('class="tip"').length - 1, 2, '每枚按钮一个 .tip 浮层')
  assert.equal(tpl.includes('TEXT.play'), false, '页面不再有「玩耍」动作（specs/pet-interaction R1）')
  assert.equal(tpl.includes('TEXT.hide'), false, 'v1 的「隐藏」按钮未复活')

  // 可访问名逐字「喂食」「洗澡」：模板走 TEXT，值由本文件真跑断言（不是同义反复）
  assert.equal(TEXT.feed, '喂食', 'aria-label 逐字「喂食」')
  assert.equal(TEXT.bathe, '洗澡', 'aria-label 逐字「洗澡」')
  assert.ok(tpl.includes(':aria-label="TEXT.feed"'), '喂食按钮的 aria-label')
  assert.ok(tpl.includes(':aria-label="TEXT.bathe"'), '洗澡按钮的 aria-label')

  const feedAt = tpl.indexOf(':aria-label="TEXT.feed"')
  const batheAt = tpl.indexOf(':aria-label="TEXT.bathe"')
  const closeAt = tpl.indexOf('class="close"')
  assert.ok(feedAt >= 0 && batheAt > feedAt, 'DOM 顺序 = 喂食 → 洗澡')
  assert.ok(closeAt > batheAt, '关闭按钮排在最后（Tab 顺序：精灵 → 喂食 → 洗澡 → 关闭面板）')

  // 不可用态用 aria-disabled（键盘可达），不用原生 disabled（会被移出 Tab 序列）
  assert.equal(tpl.split(':aria-disabled=').length - 1, 2, '两枚都按可用性输出 aria-disabled')
  assert.equal(tpl.includes(':disabled='), false, '不使用 disabled 属性')
  assert.equal(tpl.includes(':title='), false, '不用原生 title（自绘 .tip 才是"即时显示"）')
})

test('卡05 面板 · **不渲染任何数字**：只透传 values.levelName，没有成长/好感/道具数量', () => {
  const tpl = templateOf(panel)
  // ① 模板里唯一的 state 取值就是等级名
  const stateRefs = tpl.match(/state\.[A-Za-z.]+/g) ?? []
  assert.deepEqual(stateRefs, ['state.values.levelName'], '面板只读等级名（等级行是唯一的数据出口）')
  // ② 明确的禁止项：v1 的"· 成长 128"与"🐟 3｜🫧 3"两行，以及任何数值渲染函数
  for (const banned of ['state.values.growth', 'state.values.favor', 'state.items', 'displayGrowth', 'growthLabel', 'fishLabel', 'bubbleLabel', '🐟', '🫧']) {
    assert.equal(tpl.includes(banned), false, `面板模板不应出现 "${banned}"（D-8：面板不显示数字）`)
  }
  // 脚本里只剩"库存够不够"这一种对 items 的用法（可用性判定），没有任何数值展示
  const script = scriptOf(panel)
  for (const banned of ['state.values.growth', 'state.values.favor', 'displayGrowth', 'growthLabel', 'fishLabel', 'bubbleLabel', 'toFixed', 'String(']) {
    assert.equal(script.includes(banned), false, `面板脚本不应出现 "${banned}"`)
  }
  assert.equal(script.includes('state.items'), true, '脚本只用 items 判可用性（不禁用没有道具的那一枚）')
  assert.equal(/paint|renderNumber|fmtNumber/.test(script), false, '没有数值格式化函数')
  // ③ 人眼能看到的文本里一个阿拉伯数字都没有（去掉注释与 SVG 路径坐标后再判）
  assert.equal(/\d/.test(visibleTextOf(tpl)), false, '渲染出来的文本里没有数字')
  // ④ 等级名也确实渲染了（不是"删干净了但没接上"）
  assert.match(tpl, /<span class="level">\{\{ state\.values\.levelName \}\}<\/span>/, '等级名在 .level 里插值')
})

test('卡05 面板 · 等级行：var(--font-size-sm) + var(--fg-dim) + 单行省略', () => {
  const style = styleOf(panel)
  const level = style.slice(style.indexOf('.level {'), style.indexOf('.actions {'))
  assert.match(level, /font-size: var\(--font-size-sm\)/, '等级名用小字号 token')
  assert.match(level, /color: var\(--fg-dim\)/, '等级名用次要文字色 token')
  assert.match(level, /white-space: nowrap/, '单行')
  assert.match(level, /text-overflow: ellipsis/, '超长省略（不撑破 200px 面板、不换行）')
  assert.match(style.slice(style.indexOf('.level-row {'), style.indexOf('.level {')), /overflow: hidden/, '行容器裁切')
})

test('卡05 面板 · 图标白色描边 + 白色 2px 焦点环 + .tip 即时显名（Q17/R53 基线）', () => {
  const style = styleOf(panel)
  const icon = style.slice(style.indexOf('.icon {'), style.indexOf('.close {'))
  assert.match(icon, /width: 22px/, '22px 图标（v1 尺寸）')
  assert.match(icon, /height: 22px/)
  assert.match(icon, /fill: none/)
  assert.match(icon, /stroke: #ffffff/, '白色线条（Q17）')
  assert.match(icon, /stroke-width: 1\.6/)
  // 验收口径里的 `stroke:#fff`：压缩空白后逐字命中（源码写的是 #ffffff，CSS 压缩后是 #fff）
  assert.ok(style.replace(/\s+/g, '').includes('stroke:#fff'), '面板源码（去空白）含 stroke:#fff')

  const actFocus = style.slice(style.indexOf('.act:focus-visible'), style.indexOf('.tip {'))
  assert.match(actFocus, /box-shadow: 0 0 0 2px #ffffff/, '图标按钮焦点环白色 2px')
  const closeFocus = style.slice(style.indexOf('.close:focus-visible'))
  assert.match(closeFocus.slice(0, 200), /box-shadow: 0 0 0 2px #ffffff/, '关闭按钮焦点环同样白色 2px（R53）')

  const tip = style.slice(style.indexOf('.tip {'), style.indexOf('.icon {'))
  assert.match(tip, /position: absolute/, '.tip 是自绘浮层')
  assert.match(tip, /bottom: calc\(100% \+ 6px\)/, '浮层在图标上方')
  assert.equal(/transition/.test(tip), false, '悬浮即时显名（不得有过渡/延迟）')
  assert.equal(/transition-delay|animation-delay/.test(style), false, '面板内没有任何延迟动画')
  assert.match(style, /\.act:hover \.tip[\s\S]{0,120}visibility: visible/, 'hover 即时可见')
  assert.match(style, /\.act:focus-visible \.tip/, '键盘聚焦同样即时可见')
  assert.match(templateOf(panel), /<span class="tip" aria-hidden="true">/, '浮层 aria-hidden（可访问名只由 aria-label 承担）')
})

test('卡05 面板 · 只用宿主 token：除图标描边/焦点环的白色外一个自造色值都没有', () => {
  const style = styleOf(panel)
  for (const token of [
    'var(--bg-panel)',
    'var(--fg)',
    'var(--fg-dim)',
    'var(--fg-bright)',
    'var(--border)',
    'var(--hover-bg)',
    'var(--font-size-sm)'
  ]) {
    assert.ok(style.includes(token), `面板用到宿主 token ${token}`)
  }
  // 白色只允许出现在"图标描边"与"焦点环"两处用户明确要求的位置
  for (const hex of style.match(/#[0-9a-fA-F]{3,8}/g) ?? []) {
    assert.equal(hex.toLowerCase(), '#ffffff', `只允许白色（白色线条/焦点环），发现自造色值 ${hex}`)
  }
  assert.equal(/rgba?\(/.test(style), false, '不得有写死的 rgba/rgb 色值（v1 的玻璃底与青色渐变都已换成 token）')
  assert.equal(style.includes('--'), true)
  // 图标按钮底色透明（Q17），悬浮用 token 的悬停背景
  const act = style.slice(style.indexOf('.act {'), style.indexOf(".act[aria-disabled="))
  assert.match(act, /background: transparent/, '图标按钮底色透明')
  assert.match(style, /:hover[\s\S]{0,80}background: var\(--hover-bg\)/, '悬浮背景取 --hover-bg')
  const off = style.slice(style.indexOf(".act[aria-disabled='true']"))
  assert.match(off.slice(0, 160), /opacity: 0\.45/, '禁用态 opacity .45')
  assert.match(off.slice(0, 160), /cursor: not-allowed/, '禁用态 cursor: not-allowed')
})

// ————— ⑤ App.vue 接线（reason 分流的真实消费点） —————

test('卡05 接线 · interact() 用 interactDispatch 分流，**不再**用 unwrap 把 ok:false 一律 throw', () => {
  assert.match(app, /import \{[^}]*interactDispatch[^}]*\} from '\.\/lib\/state'/, 'App.vue 引用纯函数 interactDispatch')
  const at = app.indexOf('async function interact(')
  assert.ok(at > 0, '有 interact()')
  const body = app.slice(at, app.indexOf('function onPanelInteract('))
  assert.equal(body.includes('unwrap(res)'), false, '互动不再走 unwrap（它会把三种拒绝当错误）')
  assert.match(body, /if \(!res\.ok\)/, '桥层失败（超时/窗体已关）仍单独处理')
  assert.match(body, /const reply = interactDispatch\(data, kind\)/, '业务回包交给纯函数分流')
  assert.match(body, /if \(reply\.path === 'error'\)/, '只有错误路径才跳过气泡')
  assert.match(body, /console\.warn\('\[pet\] 互动未被受理：' \+ reply\.text\)/, '错误路径只记日志（D-9：不弹气泡）')
  assert.match(body, /if \(reply\.accepted && kind !== 'pet'\) startTransient\(KIND_TO_STATUS\[kind\]\)/, '只有被受理才起瞬时动画')
  assert.match(body, /showBubble\(reply\.text, reply\.tone, BUBBLE_MS, true\)/, '气泡用分流后的文案与 tone，时长 4 秒')
  assert.equal(body.includes('TEXT.missing[kind]'), false, '旧的"回包失败就猜没有道具"兜底已删（会误报原因）')
  assert.match(app, /function onPanelInteract\(kind: 'feed' \| 'bathe'\): void/, '面板只会发出喂食/洗澡两种互动')
  assert.equal(app.includes("interact('play')"), false, '页面不再发 play（旧载荷会被入口按未知互动拒绝）')
})

test('卡05 接线 · 删掉睡眠分支与 1.5× 慢放：App.vue / state.ts / anim.ts 里不存在睡眠实现', () => {
  // 声明/实现级断言（历史注疏里保留旧名是为了让后人看懂为什么删，那不算实现）
  for (const [name, src] of [
    ['App.vue', app],
    ['state.ts', stateTs],
    ['anim.ts', animTs]
  ]) {
    assert.equal(/SLEEP_AFTER|sleepHint|maybeShowSleepHint|TEXT\.sleeping|sleeping:/.test(src), false, `${name} 不含睡眠实现`)
    assert.equal(/^\s*sleep\s*:/m.test(src), false, `${name} 不含 sleep 状态映射/键`)
    assert.equal(/speed:\s*1\.5/.test(src), false, `${name} 不含 1.5× 慢放`)
    assert.equal(/VITAL_LOW|deriveFromVitals|vitals\s*:/.test(src), false, `${name} 不含三属性判定`)
  }
  // 页面状态契约里也没有 sleep/属性字段（真跑：畸形回包的 self/status 归一不产生它们）
  assert.equal('sleep' in normalizeState({ anim: { status: 'sleep', self: true } }).anim, false, 'sleep 不是 anim 的字段')
  assert.equal(normalizeState({ anim: { status: 'sleep' } }).anim.status, 'sleep', '归一化不美化入口给的值（判定在 knownStatus）')
})

// ————— ⑥ anim.ts 的 v2 收敛（纯表断言） —————

test('卡05 动画 · PetStatus 只剩 8 个（无 hungry/dirty/sad/sleep）、七条表演轨与入口同值', () => {
  const union = animTs.slice(animTs.indexOf('export type PetStatus'), animTs.indexOf('export const REDUCED_FRAME_MS'))
  const statuses = [...union.matchAll(/\|\s*'([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(
    statuses.sort(),
    ['bathing', 'eating', 'idle', 'petted', 'playing', 'run-left', 'run-right', 'trot'],
    '八个状态：idle + 七条表演轨'
  )
  for (const gone of ['hungry', 'dirty', 'sad', 'sleep']) {
    assert.equal(statuses.includes(gone), false, `${gone} 已随三属性/打盹删除（design D-10）`)
  }
  // 页面映射表与入口 lib/mapping.js 的 STATUS_TRACK 逐项同值（两套构建无法共享模块）
  const trackBody = animTs.slice(animTs.indexOf('export const STATUS_TRACK'), animTs.indexOf('export const STATUS_PRIORITY'))
  const rows = [...trackBody.matchAll(/(?:'(?<quoted>[^']+)'|(?<bare>\w+)): \{ row: (\d+), track: '([^']+)', speed: (\d+) \}/g)]
  assert.equal(rows.length, 8, '映射表恰 8 项')
  for (const m of rows) {
    const status = m.groups.quoted ?? m.groups.bare
    assert.deepEqual(
      { row: Number(m[3]), track: m[4], speed: Number(m[5]) },
      ENTRY_STATUS_TRACK[status],
      `${status} 的行号/轨名/速度与入口一致（速度全为 1，没有慢放）`
    )
  }
})

test('卡05 动画 · 集合按 v2 收敛：TRANSIENT_SET 七项、KIND_TO_STATUS 三种、label 反查无睡眠/属性态', () => {
  const transient = animTs.slice(animTs.indexOf('const TRANSIENT_SET'), animTs.indexOf('export function isTransient'))
  const transientItems = [...transient.matchAll(/'([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(transientItems.sort(), [...RANDOM_PERF_SET].sort(), '页面"播一轮即回落"的集合 = 入口的随机表演集')
  assert.equal(transientItems.includes('idle'), false, 'idle 不需要回落')

  const kinds = animTs.slice(animTs.indexOf('export const KIND_TO_STATUS'), animTs.indexOf('const ALL_STATUSES'))
  const kindKeys = [...kinds.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1])
  assert.deepEqual(kindKeys, ['feed', 'bathe', 'pet'], '合法互动只剩三种（play/summon/hide 已删）')

  const labels = animTs.slice(animTs.indexOf('const LABEL_TO_STATUS'), animTs.indexOf('export function statusFromLabel'))
  for (const gone of ['打盹', '饥饿', '脏', '心情低']) {
    assert.equal(labels.includes(gone), false, `label 反查表不含 ${gone}`)
  }
  for (const kept of ['待机', '喂食', '洗澡', '摸头', '原地小跑']) {
    assert.ok(labels.includes(kept), `label 反查表仍含 ${kept}（老数据兜底）`)
  }
})

// ————— ⑦ anim.self 折回仍生效（真跑 + 接线） —————

test('卡05 播完回落 · anim.self 的本轮标记仍把"自发一轮"折回 idle（不看状态字符串）', () => {
  for (const status of RANDOM_PERF_SET) {
    const anim = { row: ENTRY_STATUS_TRACK[status].row, status, self: true }
    assert.deepEqual(entryTrackOf(anim, false), { status, row: anim.row }, `${status}：一轮进行中照常渲染`)
    assert.deepEqual(entryTrackOf(anim, true), { status: 'idle', row: -1 }, `${status}：播完 ⇒ 折回待机且 row 一起降级`)
  }
  // 真实互动（self=false）一律不折——即使本地锁存位因为上一轮自发表演还是脏的 true
  for (const status of ['eating', 'bathing', 'petted']) {
    const anim = { row: ENTRY_STATUS_TRACK[status].row, status, self: false }
    assert.deepEqual(entryTrackOf(anim, true), { status, row: anim.row }, `${status}：真实互动不被折掉`)
  }
  // 畸形的 self（字符串 'true' / 数字 1）同样不折：宁可多播一轮，也不吞用户刚点的动作
  for (const raw of ['true', 1, null, undefined]) {
    const anim = { row: 4, status: 'eating', self: raw }
    assert.deepEqual(entryTrackOf(anim, true), { status: 'eating', row: 4 }, `self=${JSON.stringify(raw)} ⇒ 不折`)
  }
})

test('卡05 播完回落 · App.vue 仍按 anim.self 折回并用 burstFallbackMs 挂兜底定时器', () => {
  assert.match(app, /const entryTrack = computed\(\(\) => entryTrackOf\(display\.value\.anim, burstLatched\.value\)\)/)
  assert.match(app, /const entryStatus = computed\(\(\) => entryTrack\.value\.status\)/)
  assert.match(app, /const entryRow = computed\(\(\) => entryTrack\.value\.row\)/)
  assert.match(app, /animStatus: entryStatus\.value/, 'decideAnimation 吃降级后的 status')
  assert.match(app, /animRow: entryRow\.value/, 'decideAnimation 吃降级后的 row')
  assert.match(app, /const burst = anim\.self === true \? knownStatus\(anim\.status\) : undefined/, '判据是 anim.self + 合法状态轨')
  assert.match(app, /transientTimer = setTimer\([\s\S]{0,200}burstFallbackMs\(round\)/, '兜底定时器用"一轮 + slack"')
  assert.match(app, /if \(wasSelf\) latchBurst\(\)/, '自发表演播完 ⇒ 锁存（真实互动不锁）')
  assert.match(burstTs, /export function entryTrackOf/, '折回判定仍是可单测的纯函数')
})

// ————— ⑧ 页面级样式（style.css）只用 token —————

test('卡05 style.css · 透明底保留、只用宿主 token、白色不在这里出现', () => {
  assert.match(pageCss, /html,\s*\nbody,\s*\n#app \{\s*\n  background:transparent;/, '透明底那一条逐字保留（产物 grep 的像素判据）')
  assert.ok(pageCss.includes('var(--fg)'), '正文色取 --fg')
  assert.ok(pageCss.includes('var(--font-size)'), '基准字号取 --font-size')
  assert.equal(/#[0-9a-fA-F]{3,8}/.test(pageCss), false, 'style.css 里没有任何写死的色值（白色只属于图标描边与焦点环）')
  assert.equal(/rgba?\(/.test(pageCss), false, '没有写死的 rgb/rgba')
  assert.equal(pageCss.includes('backdrop-filter'), false, '不得用背景模糊（透明窗体上无效，只白耗 GPU）')
  assert.equal(pageCss.includes('installThemeBridge'), false, '不接主题桥（只用宿主 token）')
})

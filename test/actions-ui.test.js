/**
 * 卡 15 / 卡 17 · 页面侧（app/**）的**源码断言**。
 *
 * 为什么是源码断言而不是组件测试：本扩展运行时零依赖、测试跑在 `node --test` 上，
 * 没有 jsdom / @vue/test-utils（装它们会破坏"入口与页面无裸模块依赖"的既有约束），
 * 任务卡也明确许可"组件级断言**或源码断言**"。所以这里逐条钉住 DOM 结构、样式常量与
 * 事件接线；**行为**（拖动、面板开合判定、D-1/D-2 回归）在 `test/actions-hidden.test.js`
 * 与 `test/actions-drag.test.js` 里用真跑的纯函数/入口断言覆盖。
 *
 * 覆盖：
 * - 面板**无三属性渲染**（Q13）+ **三枚图标按钮横向一行**、Tab 顺序与可访问名（Q15）；
 * - 不接主题桥、不用背景模糊滤镜（D-6 / D-11）；
 * - 拖动接线：左键 + setPointerCapture + rAF 合并 + `screenX/Y` 取差（**不用** movementX/Y）+ 三相位；
 * - `trot` 在页面侧的映射与"播一轮即回落"的锁存（D-14）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// 卡 22（v1.0.2）：入口的单一来源常量，用来把"页面镜像"与它钉成逐值相等
import { RANDOM_PERF_EVERY_SEC as ENTRY_RANDOM_PERF_EVERY_SEC } from '../lib/constants.js'

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8')

const panel = read('app/components/PetPanel.vue')
const app = read('app/App.vue')
const stateTs = read('app/lib/state.ts')
const animTs = read('app/lib/anim.ts')

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

// ————— 面板：去属性 + 四按钮（Q13 / design 布局节） —————

test('卡15 面板 · MUST NOT 渲染三属性：模板与脚本里没有任何属性行/属性条/属性标签', () => {
  const tpl = templateOf(panel)
  for (const banned of ['vital-row', 'vital-bar', 'vital-fill', 'vital-label', 'vital-num', 'vitalRows', 'class="vitals"']) {
    assert.ok(!tpl.includes(banned), `面板模板不应再含 "${banned}"（Q13：面板不显示三属性）`)
  }
  // 脚本里也不该再读 state.vitals / 用显示取整函数（属性数值只在设置页由宿主渲染）
  const script = panel.slice(0, panel.indexOf('</script>'))
  assert.ok(!script.includes('state.vitals'), '面板脚本不再读取 state.vitals')
  assert.ok(!script.includes('displayInt'), 'displayInt（属性小条的显示取整）已随属性行删除')
  assert.ok(!script.includes('TEXT.hunger'), '属性标签文案已删')
  assert.ok(!panel.includes('/100'), '面板不再出现 `{cur}/100` 一类的属性数值')
  // 样式里的三条属性填充色也一并清掉（design 色值表把"属性小条"标为已移除）
  const style = styleOf(panel)
  for (const banned of ['.vital-fill', '#fbbf24', '.vital-bar']) {
    assert.ok(!style.includes(banned), `面板样式不应再含 "${banned}"`)
  }
  // 等级行与库存行**保留**（design 布局节：面板内顺序 = 等级行 → 库存行 → 四按钮）
  assert.ok(tpl.includes('row-rank') && tpl.includes('rank-name'), '等级行保留')
  assert.ok(tpl.includes('row-items') && tpl.includes('🐟') && tpl.includes('🫧'), '库存行保留')
})

test('卡17 面板 · 三枚图标按钮横向一行、等宽：喂食 / 洗澡 / 玩耍，关闭按钮仍在 DOM 最后（Tab 顺序）', () => {
  const tpl = templateOf(panel)
  assert.equal(tpl.split('class="act"').length - 1, 3, '恰好三枚 class="act" 按钮（第四枚"隐藏"已删）')
  assert.equal(tpl.includes('TEXT.hide'), false, '面板不再有"隐藏"按钮')
  assert.equal(tpl.includes("emit('hide')"), false)
  // DOM 顺序 = Tab 顺序：喂食 → 洗澡 → 玩耍 → 关闭面板（关闭按钮必须最后）
  const order = [':aria-label="TEXT.feed"', ':aria-label="TEXT.bathe"', ':aria-label="TEXT.play"']
  let last = -1
  for (const wiring of order) {
    const at = tpl.indexOf(wiring)
    assert.ok(at > last, `${wiring} 的顺序应在前一枚之后（DOM 顺序 = Tab 顺序）`)
    last = at
  }
  assert.ok(tpl.indexOf('class="close"') > last, '关闭按钮排在玩耍之后（Tab 最后一站）')
  // 每枚按钮：aria-label 是中文动作名（可访问名）；**没有常驻文字标签**，动作名只在 `.tip` 浮层里
  // （卡 18 / Q17：原生 title 已去掉——它要等约 1 秒才出现，还会与浮层形成双提示）
  for (const [kind, name] of [
    ['feed', '喂食'],
    ['bathe', '洗澡'],
    ['play', '玩耍']
  ]) {
    assert.ok(tpl.includes(`:aria-label="TEXT.${kind}"`), `${name}：aria-label`)
    assert.equal(tpl.includes(`:title="TEXT.${kind}"`), false, `${name}：不再用原生 title（Q17 自绘浮层）`)
    assert.ok(tpl.includes(`<span class="tip" aria-hidden="true">{{ TEXT.${kind} }}</span>`), `${name}：浮层里有动作名`)
  }
  assert.equal(tpl.includes(':title='), false, '三枚按钮都不挂原生 title（双提示）')
  assert.equal((tpl.match(/class="tip"/g) ?? []).length, 3, '三枚按钮各有一个 .tip 浮层')
  // 内联 SVG：三枚图标 + 不用 <img> / emoji / 图标字体
  assert.equal((tpl.match(/<svg/g) ?? []).length, 3, '三枚内联 SVG（一枚一个按钮）')
  assert.equal((tpl.match(/class="icon"/g) ?? []).length, 3, '三枚共用 .icon 规格')
  assert.equal(tpl.includes('<img'), false, '不用 <img> 引外部图标')
  const actions = tpl.slice(tpl.indexOf('<div class="actions">'), tpl.indexOf('<p v-if="syncing"'))
  assert.ok(actions.length > 0, '定位到互动图标行')
  assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(actions), false, '按钮里不得有 emoji')
  const style = styleOf(panel)
  assert.equal(style.includes('@font-face'), false, '不得用图标字体')
  assert.equal(/font-family:\s*['"]?(icon|icomoon|FontAwesome)/i.test(style), false, '不得用图标字体族')
  // 横向一行、等宽、间距 8px（Q15 / design 布局段）
  const css = style.slice(style.indexOf('.actions {'), style.indexOf('.close {'))
  assert.match(css, /flex-direction: row/, '三枚按钮横向一行（不再是纵排）')
  assert.match(css, /gap: 8px/, '按钮间距 8px')
  assert.match(css, /flex: 1 1 0/, '三枚等宽（均分面板宽度）')
  // 图标规格逐字：22px、fill none、stroke 白色（卡 18 / Q17）、线宽 1.6、圆头圆角
  const iconBlock = style.slice(style.indexOf('.icon {'))
  assert.match(iconBlock, /width: 22px/)
  assert.match(iconBlock, /height: 22px/)
  assert.match(iconBlock, /fill: none/)
  assert.match(iconBlock, /stroke: #ffffff/, 'Q17：图标白色线条')
  assert.match(iconBlock, /stroke-width: 1\.6/)
  assert.match(iconBlock, /stroke-linecap: round/)
  assert.match(iconBlock, /stroke-linejoin: round/)
})

test('卡18 面板 · 图标按钮：底色透明（无渐变）、悬浮极淡白叠加 + 描边高亮、白色 2px 焦点环（Q17）', () => {
  const style = styleOf(panel)
  const act = style.slice(style.indexOf('.act {'), style.indexOf(".act[aria-disabled='true']"))
  assert.match(act, /background: transparent/, 'Q17：按钮底色透明')
  assert.equal(style.includes('linear-gradient'), false, 'Q17：那层青色渐变底已删（产物 grep 同步为 0）')
  assert.equal(style.includes('#7dd3fc'), false, '渐变用的两个色值一并清掉')
  assert.equal(style.includes('#38bdf8'), false, '（保留的只有白色线条与白色焦点环）')
  // 悬浮：极淡白叠加 + 描边高亮；禁用态排除在外（置灰的那一枚不该"看起来可用"）
  const hover = style.slice(style.indexOf(":hover"), style.indexOf('.act[aria-disabled'))
  assert.match(hover, /rgba\(255, 255, 255, 0\.08\)/, '极淡白叠加 rgba(255,255,255,.08)')
  assert.match(hover, /border-color: rgba\(255, 255, 255, 0\.28\)/, '描边高亮（恒占 1px 边框槽位，不跳尺寸）')
  assert.match(style, /\.act:not\(\[aria-disabled='true'\]\):hover/, '悬停高亮排除禁用态')
  // 焦点环改成白色 2px（Q17）
  const focusBlock = style.slice(style.indexOf('.act:focus-visible'), style.indexOf('.tip {'))
  assert.match(focusBlock, /box-shadow: 0 0 0 2px #ffffff/, '白色 2px 焦点环')
  assert.equal(/\.act:focus-visible[^}]*rgba\(56, 189, 248/.test(style), false, '旧的青色焦点环已换掉')
  // 禁用态不变（卡 17 口径）
  const off = style.slice(style.indexOf(".act[aria-disabled='true']"))
  assert.match(off.slice(0, 200), /opacity: 0\.45/)
  assert.match(off.slice(0, 200), /cursor: not-allowed/)
})

test('卡18 面板 · 悬浮浮层 .tip：定位在图标上方、玻璃底 + 白字 + 6px 圆角，hover/focus-visible 即时可见（无延迟）', () => {
  const style = styleOf(panel)
  const tip = style.slice(style.indexOf('.tip {'), style.indexOf('.icon {'))
  assert.ok(tip.length > 0, '.tip 浮层样式存在')
  assert.match(tip, /position: absolute/, '自绘浮层（不是原生 title）')
  assert.match(tip, /bottom: calc\(100% \+ 6px\)/, '定位在图标上方')
  assert.match(tip, /background: rgba\(15, 23, 42, 0\.92\)/, '玻璃底（与面板同族色值）')
  assert.match(tip, /color: #ffffff/, '白字')
  assert.match(tip, /border-radius: 6px/, '6px 圆角')
  assert.match(tip, /pointer-events: none/, '浮层不吃指针')
  // 即时显示：`visibility` 从 hidden 直接切到 visible，且**没有任何 transition / delay**
  assert.match(tip, /visibility: hidden/)
  assert.equal(/transition/.test(tip), false, '浮层不得有过渡（"即时显示"）')
  assert.equal(/transition-delay|animation-delay/.test(style), false, '面板内不得有任何延迟动画')
  assert.match(
    style,
    /\.act:hover \.tip[\s\S]{0,120}visibility: visible/,
    'hover 即时显示（含 aria-disabled 的按钮：动作名照常显示）'
  )
  assert.match(style, /\.act:focus-visible \.tip/, '键盘聚焦同样即时显示')
  // 浮层对读屏隐藏（可访问名只由 aria-label 承担，避免重复播报）
  assert.match(templateOf(panel), /<span class="tip" aria-hidden="true">/, '浮层 aria-hidden')
})

test('卡17 面板 · 禁用态：道具不足用 aria-disabled（不是 disabled 属性）⇒ 仍可聚焦，且点击被拦在事件里', () => {
  const tpl = templateOf(panel)
  const script = panel.slice(0, panel.indexOf('</script>'))
  // 喂食/洗澡按库存禁用；玩耍不耗道具 ⇒ 永不置灰
  assert.match(script, /feed: props\.state\.items\.fish < 1/, '喂食：无小鱼干即不可用')
  assert.match(script, /bathe: props\.state\.items\.bubble < 1/, '洗澡：无沐浴泡泡即不可用')
  assert.match(script, /play: false/, '玩耍不耗道具 ⇒ 永不禁用')
  // 用 aria-disabled（键盘可达）而不是 disabled 属性（会被移出 Tab 序列）
  assert.equal((tpl.match(/:aria-disabled=/g) ?? []).length, 3, '三枚都按可用性输出 aria-disabled')
  assert.equal(tpl.includes(':disabled='), false, '不使用 disabled 属性（否则禁用时键盘够不到、读屏也不念）')
  // aria-disabled 只是语义：点击仍会派发 ⇒ 拦截必须写在事件处理里
  assert.match(script, /function onAct\(kind: 'feed' \| 'bathe' \| 'play'\): void \{/, '有统一的点击出口')
  assert.match(script, /if \(blocked\.value\[kind\]\) return/, '道具不足时点击被就地拦下（不发请求）')
  assert.ok(
    script.includes('aria-disabled') && script.includes('仍会派发 click'),
    '注释写明 aria-disabled 的代价与拦截位置'
  )
  // 样式按 aria-disabled 属性选择器给出（视觉与语义同源，图标形状不变）
  const style = styleOf(panel)
  const off = style.slice(style.indexOf(".act[aria-disabled='true']"))
  assert.match(off.slice(0, 200), /opacity: 0\.45/, '禁用态 opacity .45（色值表）')
  assert.match(off.slice(0, 200), /cursor: not-allowed/, '禁用态 cursor: not-allowed')
  assert.equal(/\.icon\s*\{[^}]*opacity/.test(style), false, '禁用只调按钮透明度，不改图标形状/配色')
  // 焦点必然落进面板：三枚都可用 aria-disabled ⇒ 第一枚恒可聚焦（不再需要"顺延到第一个可用按钮"）
  assert.match(script, /buttons\[0\] \?\? closeBtn\.value/, '焦点落第一枚（喂食）')
})

test('卡15 面板 · 不接主题桥、不用背景模糊滤镜（design D-6 / D-11 复核第 3 条）', () => {
  for (const [name, src] of [
    ['PetPanel.vue', panel],
    ['App.vue', app],
    ['PetBubble.vue', read('app/components/PetBubble.vue')],
    ['style.css', read('app/style.css')]
  ]) {
    assert.ok(!src.includes('backdrop-filter'), `${name} 不得出现 backdrop-filter`)
    assert.ok(!src.includes('installThemeBridge'), `${name} 不得接主题桥`)
    assert.ok(!src.includes('var(--'), `${name} 不得引用宿主主题 token`)
  }
})

// ————— 卡 17（Q15=B）：页面不再有"只画一个小按钮"的中间形态 —————

test('卡17 移除 · 页面模板里没有召唤胶囊、没有 v-if/v-else 的隐藏分支（精灵与面板直接渲染）', () => {
  const tpl = templateOf(app)
  assert.equal(tpl.includes('class="summon"'), false, '模板里没有召唤胶囊')
  assert.equal(tpl.includes('summonEl'), false, '没有胶囊的 ref')
  assert.equal(tpl.includes('isHidden'), false, '模板不引用隐藏态')
  assert.equal(tpl.includes('<template v-else>'), false, '没有 v-else 分支（不渲染才没有像素的判据已不需要）')
  assert.ok(tpl.includes('ref="spriteEl"'), '精灵直接渲染（Tab 第一站）')
  assert.ok(tpl.includes('class="upper"'), '气泡与面板预留区直接渲染')
  assert.equal(stateTs.includes('summon'), false, '页面文案表不含胶囊文案')
  assert.equal(stateTs.includes('summonAria'), false, '页面文案表不含胶囊 aria 文案')
})

test('卡17 移除 · hit-test 回到单一路径：精灵（+ 展开时的面板），缓存键不再含隐藏态', () => {
  const at = app.indexOf('function hitBoxes()')
  assert.ok(at > 0)
  const body = app.slice(at, app.indexOf('\n}', at))
  assert.equal(body.includes('isHidden'), false, '命中测试里没有隐藏态分支')
  assert.match(body, /spriteEl\.value/, '精灵矩形照常入列')
  assert.match(body, /panelOpen\.value && panelSlotEl\.value/, '面板展开时面板矩形入列')
  assert.match(body, /boxesCache = \{ boxes, at: now, open: panelOpen\.value \}/, '缓存键只剩"面板是否展开"')
  // pet.hit 的上报口径不变：命中 ∪ 面板可见（键盘展开也要关穿透）
  const sync = app.slice(app.indexOf('function syncInside()'), app.indexOf('\n}', app.indexOf('function syncInside()')))
  assert.match(sync, /panelOpen\.value/, '上报取"命中 ∪ 面板可见"的并集')
  assert.match(sync, /pointerInside\(/)
  assert.match(sync, /bridge\?\.request\('pet\.hit'/, '通道与载荷口径未变')
})

test('卡17 移除 · 帧时钟只受"页面是否可见"控制（不再有隐藏态那一条），且用 pause/resume', () => {
  const at = app.indexOf('function syncClock()')
  assert.ok(at > 0, '有一个统一的帧时钟开关')
  const body = app.slice(at, app.indexOf('\n}', at))
  assert.equal(body.includes('isHidden'), false, '隐藏态不再是停帧条件')
  assert.match(body, /document\.visibilityState === 'hidden'/, '页面不可见就停（既有优化保留）')
  assert.match(body, /clock\.pause\(\)/)
  assert.match(body, /clock\.resume\(\)/)
  assert.ok(!body.includes('clock.stop()'), 'stop() 之后 resume 不再生效，必须用 pause')
  const onVis = app.slice(app.indexOf('function onVisibilityChange()'), app.indexOf('\n}', app.indexOf('function onVisibilityChange()')))
  assert.match(onVis, /syncClock\(\)/)
  assert.equal(app.includes('watch(isHidden'), false, '隐藏态切换的收尾 watch 已整段删除')
})

test('卡17 移除 · 页面状态契约去掉 hidden：PetStateView / normalizeState / DEFAULT_STATE 三处都不再有它', () => {
  assert.equal(stateTs.includes('hidden: boolean'), false, 'PetStateView 不再声明 hidden')
  assert.equal(stateTs.includes('obj.hidden'), false, 'normalizeState 不再归一 hidden')
  assert.equal(stateTs.includes('hidden: false'), false, 'DEFAULT_STATE 不再有 hidden 缺省值')
  // 归一化后的键集合就是契约（入口侧同款断言在 test/actions-hidden.test.js）
  const keys = stateTs
    .slice(stateTs.indexOf('export interface PetStateView'), stateTs.indexOf('export const RANK_NAMES'))
    .match(/^\s{2}\w+:/gm)
    ?.map((line) => line.trim().replace(':', ''))
  assert.deepEqual(keys, ['vitals', 'items', 'growth', 'anim', 'bubble'], '契约只剩五键')
})

// ————— 拖动接线（D-13） —————

test('卡15 拖动 · 精灵接线：左键 pointerdown + setPointerCapture + move/up/cancel/lostcapture 四路收尾', () => {
  const tpl = templateOf(app)
  for (const wiring of [
    '@pointerdown="onSpritePointerDown"',
    '@pointermove="onSpritePointerMove"',
    '@pointerup="onSpritePointerUp"',
    '@pointercancel="onSpritePointerUp"',
    '@lostpointercapture="endDrag"'
  ]) {
    assert.ok(tpl.includes(wiring), `精灵应挂 ${wiring}`)
  }
  const down = app.slice(app.indexOf('function onSpritePointerDown'), app.indexOf('\n}', app.indexOf('function onSpritePointerDown')))
  assert.match(down, /event\.button !== DRAG_BUTTON/, '只响应左键（design D-13）')
  assert.match(down, /DRAG_BUTTON = 0|DRAG_BUTTON/, 'DRAG_BUTTON 常量')
  assert.match(app, /const DRAG_BUTTON = 0/, '左键 = button 0')
  assert.match(down, /setPointerCapture\(event\.pointerId\)/, '按下即捕获指针（甩出窗体也不丢事件）')
  assert.match(down, /phase: 'start'/, "按下发 pet.drag{phase:'start'}")
  const up = app.slice(app.indexOf('function endDrag()'), app.indexOf('\n}', app.indexOf('function endDrag()')))
  assert.match(up, /phase: 'end'/, "抬起/取消发 pet.drag{phase:'end'}")
  assert.match(up, /flushDragMove\(\)/, '松手前把最后一段增量补发（否则末位移会丢）')
  assert.match(up, /if \(!dragging\.value\) return/, 'endDrag 幂等（三条路径共用）')
  // 触屏：不关默认手势的话第一下移动就被解释成平移并触发 pointercancel，拖动断流
  assert.match(styleOf(app), /touch-action: none/, '精灵关掉浏览器默认触摸手势')
})

test('卡15 拖动 · 增量取 screenX/Y 的差、按 rAF 合并；不用 movementX/Y（理由写在注释里）', () => {
  const move = app.slice(app.indexOf('function onSpritePointerMove'), app.indexOf('\n}', app.indexOf('function onSpritePointerMove')))
  assert.match(move, /event\.screenX - dragLastScreenX/, 'dx = 两次 screenX 之差')
  assert.match(move, /event\.screenY - dragLastScreenY/, 'dy = 两次 screenY 之差')
  assert.match(move, /Number\.isFinite\(dx\)/, '非有限增量就地丢弃（不发脏数据给入口）')
  assert.match(move, /requestAnimationFrame\(flushDragMove\)/, 'rAF 合并（design D-13"按帧合并"）')
  assert.match(move, /if \(!dragRafId\)/, '一帧只排一次')
  const flush = app.slice(app.indexOf('function flushDragMove()'), app.indexOf('\n}', app.indexOf('function flushDragMove()')))
  assert.match(flush, /phase: 'move', dx, dy/, "合并发 pet.drag{phase:'move',dx,dy}")
  // 选 screenX/Y 而不是 movementX/Y 的理由必须写在源码注释里（任务卡要求"二选一并注释理由"）
  assert.ok(!/\.movement[XY]/.test(app), '页面代码不读 movementX/Y（触摸/笔上不可靠，且指针捕获下可能缺失）')
  const why = app.slice(app.lastIndexOf('/**', app.indexOf('function onSpritePointerDown')), app.indexOf('function onSpritePointerDown'))
  assert.match(why, /screenX/, '注释说明选用 screenX/Y')
  assert.match(why, /movementX/, '注释说明为什么不用 movementX/Y')
  // 卸载时取消 rAF（否则窗体销毁后还留着回调）
  const teardown = app.slice(app.indexOf('function teardown()'), app.indexOf('\n}', app.indexOf('function teardown()')))
  assert.match(teardown, /cancelAnimationFrame\(dragRafId\)/)
  assert.match(teardown, /dragging\.value = false/)
})

test('卡15 拖动 · 拖动期间恒报"命中"，不让抖动出的 inside:false 把穿透打开（否则拖动脱手）', () => {
  const sync = app.slice(app.indexOf('function syncInside()'), app.indexOf('\n}', app.indexOf('function syncInside()')))
  assert.match(sync, /dragging\.value \|\|/, 'inside = dragging ∪ 面板可见 ∪ 几何命中')
  const down = app.slice(app.indexOf('function onSpritePointerDown'), app.indexOf('function onSpritePointerMove'))
  assert.match(down, /syncInside\(\)/, '按下即锁命中')
  const up = app.slice(app.indexOf('function endDrag()'), app.indexOf('\n}', app.indexOf('function endDrag()')))
  assert.match(up, /syncInside\(\)/, '松手按真实几何重算')
  // 失焦也要收拖动会话，否则 inside 会被永久钉在 true、穿透回不来
  const blur = app.slice(app.indexOf('function onWindowBlur()'), app.indexOf('\n}', app.indexOf('function onWindowBlur()')))
  assert.match(blur, /endDrag\(\)/)
})

test('卡15 拖动 · 拖过就不算摸头：松手时浏览器补发的 click 被 dragMoved 抑制（D-13 不弹气泡）', () => {
  const click = app.slice(app.indexOf('function onSpriteClick()'), app.indexOf('\n}', app.indexOf('function onSpriteClick()')))
  assert.match(click, /if \(dragMoved\)/, '拖动过 ⇒ 跳过摸头')
  assert.match(click, /interact\('pet'\)/, '没拖动 ⇒ 照旧摸头')
  assert.match(app, /const DRAG_MOVE_THRESHOLD_PX = 3/, '有位移阈值（手抖的 1–2px 不该吃掉点击）')
  assert.match(app, /dragMoved = true/, '超过阈值才置真')
})

// ————— 随机表演的页面侧（卡 18 / Q16 取代 D-14 的 trot 定时器） —————

test('卡18 · 页面映射：trot→running(7)、run-left→running-left(2)、run-right→running-right(1)，含中文 label 反查', () => {
  assert.match(animTs, /trot: \{ row: 7, track: 'running', speed: 1 \}/, '与入口 lib/mapping.js 同值')
  assert.match(animTs, /'run-left': \{ row: 2, track: 'running-left', speed: 1 \}/, 'run-left → 上游 running-left 轨')
  assert.match(animTs, /'run-right': \{ row: 1, track: 'running-right', speed: 1 \}/, 'run-right → 上游 running-right 轨')
  assert.match(animTs, /原地小跑: 'trot'/, '中文 label 反查表（与入口 STATUS_LABEL 逐字一致）')
  assert.match(animTs, /向左小跑: 'run-left'/, 'run-left 的中文 label')
  assert.match(animTs, /向右小跑: 'run-right'/, 'run-right 的中文 label')
  assert.match(animTs, /sleep: 3,\s*\n\s*trot: 2,\s*\n\s*'run-left': 2,\s*\n\s*'run-right': 2,\s*\n\s*idle: 1/, '优先级：状态指示轨 > 三条表演轨（同档 2）> idle')
  for (const status of ['trot', 'run-left', 'run-right']) {
    assert.ok(animTs.includes(`| '${status}'`), `PetStatus 含 ${status}`)
  }
  // 页面侧的"播一轮即回落"集合含三条表演轨（与入口的权威集合**有意不同**，理由写在注释里）
  const setAt = animTs.indexOf('const TRANSIENT_SET')
  const setBody = animTs.slice(setAt, animTs.indexOf(']', setAt))
  for (const status of ['trot', 'run-left', 'run-right']) {
    assert.match(setBody, new RegExp(`'${status}'`), `页面把 ${status} 当"播一轮就回落"处理`)
  }
  assert.match(animTs.slice(0, setAt), /有意不同/, '注释说明与入口集合的差异（防后人"对齐"错）')
  // 卡 19（热修 D-1）：页面侧的"状态字符串来源判据"（isSelfBurst / SELF_BURST_SET）已整条删除——
  // 它认不出与真实互动同名同轨的四项（随机抽到的 eating 与用户点喂食是同一个字符串），
  // 那正是 D-1 的根因。来源改由入口视图的 anim.self 承担（判定在 app/lib/burst.ts，
  // 由 test/hotfix-19-self-fallback.test.js 真跑覆盖）。
  // 断言"声明已删"而不是"整个文件不含该字样"：历史注疏里保留旧名是为了让后人看懂为什么删。
  assert.equal(/export function isSelfBurst\s*\(/.test(animTs), false, 'isSelfBurst 声明已删（防回归）')
  assert.equal(/SELF_BURST_SET\s*[:=]/.test(animTs), false, '同名集合声明已删（防回归）')
})

test('卡18/22 · 页面周期镜像 = 1 分钟（60 秒）；且它有真实消费者（锁存看门狗），不是装饰常量', () => {
  assert.match(animTs, /export const RANDOM_PERF_EVERY_SEC = 60/, '镜像入口 RANDOM_PERF_EVERY_SEC = 60')
  assert.match(animTs, /export const RANDOM_PERF_PERIOD_MS = RANDOM_PERF_EVERY_SEC \* 1000/, '换算成毫秒')
  assert.match(app, /import \{[^}]*RANDOM_PERF_PERIOD_MS[^}]*\} from '\.\/lib\/anim'/, 'App.vue 真的引用它')
  const watchdog = app.slice(app.indexOf('function armBurstWatchdog()'), app.indexOf('async function resyncBurst()'))
  assert.match(watchdog, /RANDOM_PERF_PERIOD_MS/, '看门狗的周期就是入口的推送周期')
  assert.match(watchdog, /if \(!burstLatched\.value\) return/, '期间来过新状态 ⇒ 看门狗什么都不做')
  // 补拉用的通道是既有 pet.state（不新增通道）
  const resync = app.slice(app.indexOf('async function resyncBurst()'), app.indexOf('// ---- 交互 ----'))
  assert.match(resync, /bridge\.request\('pet\.state'/, '补拉一次权威状态')
  assert.match(resync, /applyState\(data\.state, true\)/, '拿到权威状态 ⇒ force 重播/解锁')
  assert.match(resync, /if \(!ok \|\| !data \|\| data\.state === undefined\) return/, '拉不到就保持锁存（不退化成"一直跑"）')
})

test('卡22 · 两侧常量相等：入口 lib/constants.js 与页面镜像 app/lib/anim.ts 的周期逐值一致（只改一侧即红）', () => {
  // 为什么必须钉住：入口按这个周期排 `pet-perf`，页面用**同一个**周期当锁存看门狗的上限
  //（"整整一个周期收不到新状态 ⇒ 补拉一次 pet.state"）。两侧是两套构建、无法共享模块，
  // 只改一侧就会让"看门狗认为的周期"与"入口真实的推送周期"脱节（改小 ⇒ 无谓补拉；改大 ⇒ 画面钉住）。
  const mirror = /export const RANDOM_PERF_EVERY_SEC = (\d+)/.exec(animTs)
  assert.ok(mirror, '页面镜像常量存在（app/lib/anim.ts）')
  assert.equal(
    Number(mirror[1]),
    ENTRY_RANDOM_PERF_EVERY_SEC,
    `页面镜像周期（${mirror[1]}s）MUST 与入口单一来源 lib/constants.js 的 RANDOM_PERF_EVERY_SEC（${ENTRY_RANDOM_PERF_EVERY_SEC}s）逐值相等`
  )
  // 反向自检：镜像确实是**从源码里读出来的数**，不是"恰好等于 60"的假绿
  assert.equal(ENTRY_RANDOM_PERF_EVERY_SEC, 60, 'v1.0.2：入口值为 1 分钟（60 秒）')
  assert.equal(Number(mirror[1]), 60, 'v1.0.2：页面镜像值同为 1 分钟（60 秒）')
})

test('卡18/19 · 入口自发表演的本地锁存：播完一轮置锁存、收包驱动重播、锁存期间 status/row 双双降级', () => {
  assert.match(app, /const burstLatched = ref\(false\)/, '有锁存位')
  // 卡 19（热修 D-1）：判据是"这一轮是不是入口自发的"（本地记录 + 入口 anim.self），
  // **不是**状态字符串——同名同轨的四项（eating/bathing/petted/playing）靠字符串分不出来。
  assert.match(app, /let transientIsSelf = false/, '本地记下这一轮的来源')
  const cycle = app.slice(app.indexOf('function onCycleEnd()'), app.indexOf('function latchBurst()'))
  assert.match(cycle, /const wasSelf = transientIsSelf/, '播完先取这一轮的来源')
  assert.match(cycle, /if \(wasSelf\) latchBurst\(\)/, '自发表演播完一轮 ⇒ 置锁存')
  assert.match(app, /function latchBurst\(\)[\s\S]{0,160}burstLatched\.value = true[\s\S]{0,80}armBurstWatchdog\(\)/, '置锁存并挂看门狗')
  // 兜底定时器（页面不可见时 rAF 停摆）走同一条锁存路径，时限 = 该轨一轮 + 既有 slack
  const start = app.slice(app.indexOf('function startTransient('), app.indexOf('function syncBurst('))
  assert.match(start, /transientIsSelf = self/, '起一轮时记下来源（互动走默认 false）')
  assert.match(start, /if \(transientIsSelf\) latchBurst\(\)/, '兜底回落同样置锁存')
  assert.match(start, /burstFallbackMs\(round\)/, '时限来自纯函数 burstFallbackMs（= 一轮 + slack）')
  assert.match(start, /p\.status === status \? p\.total : null/, '轮长取该轨真实总时长，缺计划时交给兜底值')
  // 收包驱动（不是 watch 状态字符串：连着两轮抽到同一条时 watch 看不到变化，那一轮会被吞掉）
  const apply = app.slice(app.indexOf('function applyState('), app.indexOf('function maybeShowSleepHint'))
  assert.match(apply, /syncBurst\(next\.anim, forceBurst\)/, 'applyState 里同步 burst（整份 anim，含 self）')
  assert.equal(app.includes('() => display.value.anim.status'), false, '旧的"盯状态字符串"的 watch 已删')
  const sync = app.slice(app.indexOf('function syncBurst('), app.indexOf('function armBurstWatchdog()'))
  assert.match(sync, /anim\.self === true \? knownStatus\(anim\.status\) : undefined/, '判据是 anim.self + 合法状态轨')
  assert.match(sync, /startTransient\(burst, true\)/, '新一轮 ⇒ 本地起一轮（self=true）')
  assert.match(sync, /if \(!force && burstLatchedStatus === burst && !burstLatched\.value\) return/, '同一轮里的重复推送不重起（否则动画被打回第 0 帧）')
  // 锁存期间送进 decideAnimation 的 status 与 row 双双降级（由纯函数按 anim.self 判定）
  assert.match(app, /const entryStatus = computed/, '有降级后的 status')
  assert.match(app, /const entryRow = computed/, '有降级后的 row')
  assert.match(app, /animStatus: entryStatus\.value/, 'decideAnimation 吃降级后的 status')
  assert.match(app, /animRow: entryRow\.value/, 'decideAnimation 吃降级后的 row')
})

// ————— 面板即时关闭（卡 18 / Q17 的核对结论：已经是同步判定，这里把它钉成门禁） —————

test('卡18 面板开合 · 开合判定是纯同步的：不依赖过渡、不依赖任何延时定时器，命中矩形随 panelOpen 即时变化', () => {
  // ① 判定源头：panelShouldOpen 是纯函数，panelOpen 是只依赖三个 ref 的 computed（无定时器/过渡事件）
  assert.match(app, /const panelOpen = computed\(\(\) => panelShouldOpen\(hovered\.value, focusOpened\.value, dragging\.value\)\)/)
  const close = app.slice(app.indexOf('function closePanel('), app.indexOf('function onPanelClose()'))
  assert.match(close, /focusOpened\.value = false/, '关面板同步翻转焦点展开位')
  assert.match(close, /hovered\.value = false/, '关面板同步翻转命中位')
  assert.match(close, /boxesCache = null/, '关面板同步作废命中矩形缓存')
  assert.equal(/setTimer|setTimeout|delay\(/.test(close), false, 'closePanel 里没有任何延时定时器（立刻关闭）')
  // ② 命中矩形：面板矩形只在 panelOpen 为真时入列 ⇒ 指针停在面板上算"在里面"（面板不消失）
  const hit = app.slice(app.indexOf('function hitBoxes()'), app.indexOf('function pointerInside('))
  assert.match(hit, /if \(panelOpen\.value && panelSlotEl\.value\)/, '面板开启时面板矩形必须入列')
  assert.match(hit, /boxesCache = \{ boxes, at: now, open: panelOpen\.value \}/, '缓存键含开合态 ⇒ 关面板后不可能复用带面板的旧矩形')
  assert.equal(/transitionend|setTimer|setTimeout/.test(hit), false, '命中矩形不依赖过渡结束或延时')
  // ③ 过渡只作用在视觉属性（opacity）上，且不参与开合判定
  const fade = styleOf(app).slice(styleOf(app).indexOf('.panel-fade-enter-active'))
  assert.match(fade, /transition: opacity 120ms ease/, 'panel 过渡只有 opacity')
  assert.equal(/display|visibility|transform/.test(fade.slice(0, 400)), false, '过渡不碰 display/visibility/transform')
  assert.match(fade, /\.panel-fade-leave-active \{\s*pointer-events: none;/, '淡出期间不吃指针（防"点到正在消失的面板"）')
  assert.equal(app.includes('@after-leave'), false, '不用过渡钩子推迟任何逻辑')
  assert.equal(app.includes('@leave'), false, '没有 Transition 的 JS 钩子参与开合')
})


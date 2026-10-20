/**
 * 卡15 · 文案口径（design D-16 / D-9；specs/pet-favor R4「文本 MUST NOT 含数字或时长单位」）。
 *
 * ⚠️ 本文件是 v1 用例的改写：v1 的文案表里有 `playOk`（玩耍成功）、`sleeping`（打盹提示）、
 * `feedCooling`（喂食冷却）三条——它们分别指向**已删除的能力**（`play` kind、打盹机制、
 * 喂食不设冷却），已随本卡（R58）从 `lib/constants.js` 的 `TEXT` 中物理删除。
 * 同时 v1 的 2600ms 气泡与"三枚图标"也已被 4 秒气泡与两枚图标取代。
 *
 * 覆盖：
 * - **两条正则硬规则**对文案表全量扫描 0 命中：`/\d+\s*(分钟|秒|小时)/`（禁数字时间）与
 *   `/[+-]\d+/`（禁属性增量数字）；
 * - 与上游 dsh-pet **逐字一致**的四句（`petOk` / `feedOk` / `noFish`，以及页面兜底里的
 *   冷却句）；自拟两句（`batheOk` / `noBubble`）同样逐字钉住；
 * - **字数口径**：v2 的 120 条等级文本 + 8 条冷却文本由 `test/texts.test.js` 逐条扫描，
 *   本文件只钉"表里的运行时文案"；
 * - `interact()` 的返回值真的用这些文案（表与逻辑不脱节），且未知 kind 不带气泡文案；
 * - 页面侧 `app/lib/state.ts` 的兜底文案与入口同文（两套构建无法共享模块 ⇒ 源码级对齐）；
 * - 被废止的旧文案在 `lib/**`、`app/**`、`index.js`、`README.md` 里**一处都不剩**。
 *
 * R12（上游文案漂移）：这些断言就是"钉住逐字值"的门禁——上游改了文案不会自动跟随，
 * 跟随属新 change（必须回 design D-16 改表再来改这里）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { STATUSBAR_IDLE, TEXT } from '../lib/constants.js'
import { interact } from '../lib/interact.js'
import { initialState } from '../lib/settle.js'
import { COOLING_TEXTS } from '../lib/texts.js'

const extRoot = fileURLToPath(new URL('..', import.meta.url))
const T0 = 1_700_000_000_000

/** D-16 硬规则①：禁「数字 + 时间单位」 */
const TIME_RE = /\d+\s*(分钟|秒|小时)/
/** D-16 硬规则②：禁「属性增量数字」（+5 / +15 / -1 等） */
const DELTA_RE = /[+-]\d+/

/**
 * 与上游 dsh-pet **逐字一致**的文案（design D-16 表里标 ★ 的那几条）。
 * 字符串硬编码在测试里是任务卡的明确要求：只有硬编码才能证明"表被改错时测试会红"，
 * 若从 TEXT 反向取值就变成同义反复。
 */
const UPSTREAM_VERBATIM = {
  petOk: '咕噜咕噜～被摸摸好舒服！', // 上游 affinity.ts
  feedOk: '呜哇！小鱼干好好吃！', // 上游 affinity.ts
  noFish: '没有小鱼干了，多陪我工作一会儿吧～' // 上游 ledger.ts
}

/** 自拟/仿写的两句（同样逐字钉住，防"顺手改文案"） */
const OWN_VERBATIM = {
  noBubble: '没有沐浴泡泡了，多陪我工作一会儿吧～', // 仿上游 ledger.ts 句式（上游无洗澡玩法）
  batheOk: '泡泡好舒服～洗干净啦！'
}

/** 页面兜底用的冷却句（上游 affinity.ts 逐字；入口只在"点击冷却"时从 8 条冷却文本里取样） */
const PET_COOLING_VERBATIM = '摸过头啦，让鲸鱼娘歇口气～'

/** 被废止/已删除的旧文案 ⇒ 源码里一处都不该剩（连注释也不留） */
const RETIRED = [
  '没有小鱼干了（挂机 20 分钟可得 1 条）',
  '没有沐浴泡泡了（挂机 20 分钟可得 1 个）',
  '吃饱啦（饥饿度 +5）',
  '洗干净啦（清洁度 +15）',
  '好开心（心情 +5）',
  '再摸也不会更开心啦',
  '还需',
  '挂机 20 分钟', // 旧文案的片段（数值只以 AFK_PERIOD_SEC 常量与机制说明的形式存在）
  '打盹中', // v2 不再有打盹提示（design D-10）
  '玩得好开心', // v1 的 playOk（`play` kind 已删除）
  '吃饱啦，晚点再喂' // v1 的 feedCooling（喂食不设冷却）
]

/** 递归收集文案表里的全部字符串；函数项用中性样例调用一次，扫它的**输出**（模板字面量部分） */
function collect(node, path, out) {
  for (const [key, value] of Object.entries(node)) {
    const at = path + '.' + key
    if (typeof value === 'string') out.push([at, value])
    else if (typeof value === 'function') out.push([at + '()', String(value('示例'))])
    else if (value && typeof value === 'object') collect(value, at, out)
  }
  return out
}

// ————— 硬规则：两条正则全表 0 命中 —————

test('卡15 文案 · D-16 硬规则：/\\d+\\s*(分钟|秒|小时)/ 与 /[+-]\\d+/ 对 TEXT 全表 0 命中', () => {
  const entries = collect(TEXT, 'TEXT', [])
  // 状态栏常态文本也是用户可见文案（宿主渲染，但字符串由扩展给）⇒ 一并扫
  entries.push(['STATUSBAR_IDLE', STATUSBAR_IDLE])
  assert.ok(entries.length >= 18, `文案表应被完整遍历，实际收到 ${entries.length} 项`)

  const timeHits = entries.filter(([, text]) => TIME_RE.test(text))
  const deltaHits = entries.filter(([, text]) => DELTA_RE.test(text))
  assert.deepEqual(timeHits, [], '禁「数字 + 时间单位」：0 命中')
  assert.deepEqual(deltaHits, [], '禁「属性增量数字」：0 命中')

  // 反向自检：这两条正则本身是有区分力的（喂旧文案必须命中，否则断言是空的）
  assert.ok(TIME_RE.test('再摸也不会更开心啦（还需 4 分钟）'), '正则①对旧文案有区分力')
  assert.ok(TIME_RE.test('没有小鱼干了（挂机 20 分钟可得 1 条）'), '正则①对旧文案有区分力')
  assert.ok(DELTA_RE.test('吃饱啦（饥饿度 +5）'), '正则②对旧文案有区分力')
  assert.ok(DELTA_RE.test('心情 -1'), '正则②对负增量同样有区分力')
})

test('卡15 文案 · 页面侧文案表（app/lib/state.ts）同样满足两条硬规则', () => {
  const src = readFileSync(new URL('../app/lib/state.ts', import.meta.url), 'utf8')
  // 只取 TEXT 常量体（从 `export const TEXT = {` 到与之配对的 `} as const`），避免扫到注释里的数值说明
  const start = src.indexOf('export const TEXT = {')
  assert.ok(start >= 0, '页面侧 TEXT 表存在')
  const end = src.indexOf('} as const', start)
  assert.ok(end > start)
  const body = src.slice(start, end)
  // 逐行取出所有单引号字符串字面量（页面文案全是中文字符串，没有模板串）
  const literals = [...body.matchAll(/'([^']*)'/g)].map((m) => m[1])
  assert.ok(literals.length >= 10, `应扫到全部页面文案，实际 ${literals.length} 条`)
  assert.deepEqual(literals.filter((s) => TIME_RE.test(s)), [], '页面文案禁数字时间')
  assert.deepEqual(literals.filter((s) => DELTA_RE.test(s)), [], '页面文案禁属性增量数字')
})

// ————— 逐字文案 —————

test('卡15 文案 · 与上游 dsh-pet 逐字一致（affinity.ts 两句 + ledger.ts 一句），码点级核对', () => {
  for (const [key, want] of Object.entries(UPSTREAM_VERBATIM)) {
    assert.equal(TEXT[key], want, `TEXT.${key} 必须与上游逐字一致（R12：漂移不自动跟随）`)
    assert.deepEqual([...TEXT[key]], [...want], `TEXT.${key} 码点级一致`)
  }
  // 逐字意味着连标点/波浪号/叹号都不能差
  for (const [key, want] of Object.entries(OWN_VERBATIM)) {
    assert.equal(TEXT[key], want, `TEXT.${key}`)
    assert.deepEqual([...TEXT[key]], [...want], `TEXT.${key} 码点级一致`)
  }
})

test('卡15 文案 · v2 已删除的三条旧文案必须从 TEXT 消失（R58），冷却句改由 texts.js 的集合承担', () => {
  // 这三条各自指向已删除的能力：`play` kind、喂食冷却、打盹机制
  for (const gone of ['playOk', 'feedCooling', 'sleeping']) {
    assert.equal(gone in TEXT, false, `TEXT.${gone} 已随对应能力删除（R58），不得复活`)
  }
  // 点击冷却的第五句不再是 constants 里的单条文案：v2 从 `COOLING_TEXTS`（8 条）取样，
  // 页面仍保留一份**兜底**同文（回包缺 text 时用），所以这里只断言集合与页面兜底都还在
  assert.equal(COOLING_TEXTS.length, 8, '冷却文本集合 8 条（specs/pet-favor R3）')
  const pageSrc = readFileSync(new URL('../app/lib/state.ts', import.meta.url), 'utf8')
  assert.ok(pageSrc.includes(PET_COOLING_VERBATIM), '页面兜底仍保留摸头冷却同文')
  // summon/hiddenBlocked 两个 v1 文案键随隐藏功能删除（卡 17 / Q15=B）
  for (const gone of ['summon', 'hiddenBlocked']) {
    assert.equal(gone in TEXT, false, `TEXT.${gone} 已随隐藏功能移除，不得复活`)
  }
})

test('卡15 文案 · interact() 真的用这些文案（表与逻辑不脱节）', () => {
  const s = (o = {}) => ({ ...initialState(T0), ...o })
  // 摸头成功 / 摸头冷却
  assert.equal(interact(s(), 'pet', T0).text, UPSTREAM_VERBATIM.petOk)
  const cooling = interact(s({ lastPetAt: T0 - 60_000 }), 'pet', T0)
  assert.ok(COOLING_TEXTS.includes(cooling.text), '摸头冷却句来自冷却集合')
  // 喂食 / 洗澡成功
  assert.equal(interact(s(), 'feed', T0).text, UPSTREAM_VERBATIM.feedOk)
  assert.equal(interact(s(), 'bathe', T0).text, OWN_VERBATIM.batheOk)
  // 道具不足
  assert.equal(interact(s({ fish: 0 }), 'feed', T0).text, UPSTREAM_VERBATIM.noFish)
  assert.equal(interact(s({ bubble: 0 }), 'bathe', T0).text, OWN_VERBATIM.noBubble)
  // 冷却内的文案**不随剩余时间变化**（旧实现会把剩余分钟数拼进去，Q12 明令禁止）
  const cool1 = interact(s({ lastInteractAt: T0 - 10_000 }), 'feed', T0).text
  const cool2 = interact(s({ lastInteractAt: T0 - 290_000 }), 'feed', T0).text
  assert.equal(cool1, cool2, '冷却内早晚期同一句（不含数字时间）')
  // 已知被删的 kind：**没有**文案（未知互动只记诊断，不弹气泡——design D-9）
  for (const gone of ['summon', 'hide', 'dance']) {
    const r = interact(s(), gone, T0)
    assert.equal(r.ok, false, `${gone} 不再是被受理的互动`)
    assert.equal(r.text, undefined, `${gone} 不产生气泡文案`)
    assert.equal(r.reason, 'unknown-kind')
  }
})

test('卡15 文案 · 页面侧与入口同文（两套构建无法共享模块 ⇒ 源码级对齐）', () => {
  const src = readFileSync(new URL('../app/lib/state.ts', import.meta.url), 'utf8')
  // 页面必须有：三种成功反馈兜底 + 摸头冷却兜底 + 两句道具不足兜底
  for (const want of [
    UPSTREAM_VERBATIM.petOk,
    UPSTREAM_VERBATIM.feedOk,
    OWN_VERBATIM.batheOk,
    PET_COOLING_VERBATIM,
    UPSTREAM_VERBATIM.noFish,
    OWN_VERBATIM.noBubble
  ]) {
    assert.ok(src.includes(want), `app/lib/state.ts 应含逐字文案：${want}`)
  }
  // 两枚图标按钮的可访问名（design 布局节：文字只作为 aria-label 存在）
  for (const label of ['喂食', '洗澡']) {
    assert.ok(src.includes(label), `页面文案表应含图标可访问名：${label}`)
  }
  // v1 的三枚图标里的「玩耍」与打盹提示必须已从页面**文案表**消失
  // （只看 TEXT 常量体：文件里解释"为什么删掉 play"的注疏仍允许保留）
  const tableBody = src.slice(src.indexOf('export const TEXT = {'), src.indexOf('} as const'))
  assert.equal(tableBody.includes('玩耍'), false, '页面文案表不再有「玩耍」（面板只剩两枚图标）')
  assert.equal(tableBody.includes('打盹'), false, '页面文案表不再有打盹提示')
  assert.equal(tableBody.includes('隐藏'), false, '页面文案表不再有"隐藏"（Q15=B：面板没有该入口）')
  assert.equal(tableBody.includes('summon'), false, '页面文案表不再有召唤胶囊文案')
})

// ————— 旧文案清场 —————

/** 递归列出目录下这些后缀的文件（跳过构建产物与规格/素材目录） */
function sourceFiles(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'out', '.git', 'assets', 'openspec', 'docs', 'test'].includes(name)) continue
    const path = dir + '/' + name
    if (statSync(path).isDirectory()) sourceFiles(path, exts, out)
    else if (exts.some((e) => name.endsWith(e))) out.push(path)
  }
  return out
}

test('卡15 文案 · 旧文案清场：lib/**、app/**、index.js、README.md 里一处都不剩', () => {
  const files = [
    ...sourceFiles(`${extRoot}lib`, ['.js'], []),
    ...sourceFiles(`${extRoot}app`, ['.ts', '.vue', '.css', '.html'], []),
    `${extRoot}index.js`,
    `${extRoot}README.md`
  ]
  assert.ok(files.length >= 15, `应扫到全部源码文件，实际 ${files.length} 个`)
  const offenders = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const bad of RETIRED) {
      if (text.includes(bad)) offenders.push(`${file.replace(extRoot, '')} ⇒ ${bad}`)
    }
  }
  assert.deepEqual(offenders, [], '被废止的旧文案必须全部清掉')
})

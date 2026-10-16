/**
 * 卡 15 · 文案口径（design **D-16 文案总表** + 增补 Q12/Q13；specs/pet-interaction 的文案 requirement）。
 *
 * 覆盖任务卡验收 ④ 的文案条目：
 * - **两条正则硬规则**对文案表全量扫描 0 命中：`/\d+\s*(分钟|秒|小时)/`（禁数字时间）与
 *   `/[+-]\d+/`（禁属性增量数字）——specs/pet-interaction 的"文案表全量扫描"scenario 逐字；
 * - **五句上游逐字**断言（字符串硬编码在本文件里，出处注明上游 `affinity.ts` / `ledger.ts`）；
 * - D-16 总表其余四条（无泡泡 / 洗澡 / 玩耍 / 打盹）同样逐字钉住；卡 17（Q15=B）起召唤胶囊那句
 *   已从文案表删除 ⇒ 这里改为**负向断言**（`TEXT` 不含 `summon`/`hiddenBlocked`）；
 * - `interact()` 的返回值真的用的就是这些文案（表与逻辑不脱节）；
 * - 页面侧 `app/lib/state.ts` 的同名文案与入口一致（两套构建无法共享模块 ⇒ 源码级对齐）；
 * - 被 Q12 废止的旧文案在 `lib/**`、`app/**`、`index.js`、`README.md` 里**一处都不剩**。
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

const extRoot = fileURLToPath(new URL('..', import.meta.url))
const T0 = 1_700_000_000_000

/** D-16 硬规则①：禁「数字 + 时间单位」 */
const TIME_RE = /\d+\s*(分钟|秒|小时)/
/** D-16 硬规则②：禁「属性增量数字」（+5 / +15 / -1 等） */
const DELTA_RE = /[+-]\d+/

/**
 * 五句**与上游 dsh-pet 逐字一致**的文案（design D-16 表的"来源/约束"列标 ★ 的那五条）。
 * 字符串硬编码在测试里是任务卡的明确要求：只有硬编码才能证明"表被改错时测试会红"，
 * 若从 TEXT 反向取值就变成同义反复。
 */
const UPSTREAM_VERBATIM = {
  // 上游 `affinity.ts`（摸头/喂食的反应文案；design D-16 第 1–4 行）
  petOk: '咕噜咕噜～被摸摸好舒服！',
  petCooling: '摸过头啦，让鲸鱼娘歇口气～',
  feedOk: '呜哇！小鱼干好好吃！',
  feedCooling: '吃饱啦，晚点再喂～',
  // 上游 `ledger.ts`（道具不足；design D-16 第 5 行）
  noFish: '没有小鱼干了，多陪我工作一会儿吧～'
}

/** D-16 总表里非上游逐字的自拟/仿写句（同样逐字钉住，防"顺手改文案"） */
const OWN_VERBATIM = {
  noBubble: '没有沐浴泡泡了，多陪我工作一会儿吧～', // 仿上游 ledger.ts 句式（上游无洗澡玩法）
  batheOk: '泡泡好舒服～洗干净啦！', // 本轮自拟（Q13：去掉属性增量数字）
  playOk: '玩得好开心！', // 本轮自拟（Q13）
  sleeping: '打盹中（Zzz）' // 保留（D-4：上游图集无 sleep 轨，Zzz 由文字表达）
}

/** 被 Q12/Q13 连带废止的旧文案（含数字时间或属性增量数字）⇒ 源码里一处都不该剩（连注释也不留，
 *  这样"产物不含 `还需`"这条验收就不只是"构建恰好没打进去"，而是源码级为零） */
const RETIRED = [
  '没有小鱼干了（挂机 20 分钟可得 1 条）',
  '没有沐浴泡泡了（挂机 20 分钟可得 1 个）',
  '吃饱啦（饥饿度 +5）',
  '洗干净啦（清洁度 +15）',
  '好开心（心情 +5）',
  '再摸也不会更开心啦',
  '还需',
  '挂机 20 分钟' // 旧文案的片段；连注释都不留（"20 分钟"这个数值只以 AFK_PERIOD_SEC 常量与机制说明的形式存在）
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
  assert.ok(entries.length >= 20, `文案表应被完整遍历，实际收到 ${entries.length} 项`)

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
  assert.ok(literals.length >= 12, `应扫到全部页面文案，实际 ${literals.length} 条`)
  assert.deepEqual(literals.filter((s) => TIME_RE.test(s)), [], '页面文案禁数字时间')
  assert.deepEqual(literals.filter((s) => DELTA_RE.test(s)), [], '页面文案禁属性增量数字')
})

// ————— 五句上游逐字 + D-16 总表其余五条 —————

test('卡15 文案 · 五句与上游 dsh-pet 逐字一致（affinity.ts 四句 + ledger.ts 一句）', () => {
  for (const [key, want] of Object.entries(UPSTREAM_VERBATIM)) {
    assert.equal(TEXT[key], want, `TEXT.${key} 必须与上游逐字一致（R12：漂移不自动跟随）`)
  }
  // 逐字意味着连标点/波浪号/叹号都不能差：长度与码点一并核对（防"看起来一样"的全半角替换）
  for (const [key, want] of Object.entries(UPSTREAM_VERBATIM)) {
    assert.deepEqual([...TEXT[key]], [...want], `TEXT.${key} 码点级一致`)
  }
})

test('卡17 文案 · D-16 总表其余四条逐字（无泡泡/洗澡/玩耍/打盹）；召唤胶囊句已随 Q15=B 删除', () => {
  for (const [key, want] of Object.entries(OWN_VERBATIM)) {
    assert.equal(TEXT[key], want, `TEXT.${key}`)
  }
  for (const gone of ['summon', 'hiddenBlocked']) {
    assert.equal(gone in TEXT, false, `TEXT.${gone} 已随隐藏功能移除（卡 17 / Q15=B），不得复活`)
  }
})

test('卡15 文案 · interact() 真的用这些文案（表与逻辑不脱节）', () => {
  const s = (o = {}) => ({ ...initialState(T0), ...o })
  // 摸头计分 / 摸头冷却
  assert.equal(interact(s(), 'pet', T0).feedback.text, UPSTREAM_VERBATIM.petOk)
  assert.equal(interact(s({ lastPetAt: T0 - 60_000 }), 'pet', T0).feedback.text, UPSTREAM_VERBATIM.petCooling)
  // 喂食成功
  assert.equal(interact(s({ hunger: 50 }), 'feed', T0).feedback.text, UPSTREAM_VERBATIM.feedOk)
  // 道具不足
  assert.equal(interact(s({ fish: 0 }), 'feed', T0).error, UPSTREAM_VERBATIM.noFish)
  assert.equal(interact(s({ bubble: 0 }), 'bathe', T0).error, OWN_VERBATIM.noBubble)
  // 洗澡 / 玩耍成功
  assert.equal(interact(s({ clean: 50 }), 'bathe', T0).feedback.text, OWN_VERBATIM.batheOk)
  assert.equal(interact(s(), 'play', T0).feedback.text, OWN_VERBATIM.playOk)
  // 冷却内的文案**不随剩余时间变化**（旧实现会把剩余分钟数拼进去，Q12 明令禁止）
  const cool1 = interact(s({ lastPetAt: T0 - 10_000 }), 'pet', T0).feedback.text
  const cool2 = interact(s({ lastPetAt: T0 - 290_000 }), 'pet', T0).feedback.text
  assert.equal(cool1, cool2, '冷却内早晚期同一句（不含数字时间 ⇒ 不需要变量）')
  assert.equal(typeof TEXT.petCooling, 'string', 'petCooling 已从"模板函数"退化为常量字符串')
  // 卡 17：summon/hide 两个 kind **已不是互动** ⇒ 既没有 feedback（不是 null，而是压根没有这次互动）
  assert.equal(interact(s(), 'summon', T0).ok, false, 'summon 不再是被受理的互动')
  assert.equal(interact(s(), 'hide', T0).ok, false, 'hide 不再是被受理的互动')
  assert.equal(interact(s(), 'summon', T0).error, TEXT.unknownKind('summon'), '走"未知互动"文案')
})

test('卡17 文案 · 页面侧与入口同文（两套构建无法共享模块 ⇒ 源码级对齐）', () => {
  const src = readFileSync(new URL('../app/lib/state.ts', import.meta.url), 'utf8')
  // 页面必须有：四句反馈兜底 + 摸头冷却兜底 + 两句道具不足兜底 + 打盹提示
  for (const want of [
    UPSTREAM_VERBATIM.petCooling,
    UPSTREAM_VERBATIM.feedOk,
    UPSTREAM_VERBATIM.petOk,
    OWN_VERBATIM.batheOk,
    OWN_VERBATIM.playOk,
    UPSTREAM_VERBATIM.noFish,
    OWN_VERBATIM.noBubble,
    OWN_VERBATIM.sleeping
  ]) {
    assert.ok(src.includes(want), `app/lib/state.ts 应含逐字文案：${want}`)
  }
  // 三枚图标按钮的可访问名（design 布局节 + Q15：文字只作为 aria-label/title 存在）
  for (const label of ['喂食', '洗澡', '玩耍']) {
    assert.ok(src.includes(label), `页面文案表应含图标可访问名：${label}`)
  }
  assert.equal(src.includes('隐藏'), false, '页面文案表不再有"隐藏"（Q15=B：面板没有该入口）')
  assert.equal(src.includes('summon'), false, '页面文案表不再有召唤胶囊文案')
})

// ————— 旧文案清场 —————

/** 递归列出目录下这些后缀的文件（跳过构建产物与规格/素材目录） */
function sourceFiles(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'out', '.git'].includes(name)) continue
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
  assert.deepEqual(offenders, [], '被 Q12/Q13 废止的旧文案必须全部清掉')
})

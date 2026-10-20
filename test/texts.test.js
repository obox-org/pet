/**
 * 卡 02 · favor-texts：128 条文本语料 + 取样规则（specs/pet-favor 的 4 条 requirement；design D-5）。
 *
 * 覆盖任务卡 `02-favor-texts.md` 的验收清单：
 * - 条数：10 组 × 12 + 冷却 8 = 128（`TEXT_TOTAL` 与两张表同时钉住）；
 * - **逐条**正则：全部 128 条对 5 条规则（`\d`、`分钟|小时|秒`、`饥饿|清洁|心情`、
 *   功能承诺词表、长度 ≤24）0 命中，且每条规则先自证"有区分力"（否则断言是空的）；
 * - 等级揭示：第 1 级 200 次取样必属 L1；第 5 级 500 次必属 L1..L5 且至少命中 L5；
 *   第 10 级能命中 L10；并逐级（1..10）扫"第 N 级不出现 L(N+1) 及更高"；
 * - 相邻去重：注入确定性随机（LCG）+ 连续两次（第一次结果作 last）必不相等；覆盖
 *   "每个条目都当一次 last"与 `rand()` 的两个极端值（0 / ≈1），并断言**每次取样只调用
 *   一次 `rand()`**（证明去重靠"先剔除再取"，而不是"抽到 last 就重抽"的死循环）；
 * - 钳制：`0` / `11` / `undefined` / `NaN` 分别按 1 / 10 / 1 / 1 处理（非整数截断）。
 *
 * **文本与 `notes/texts.md` 的逐字一致性不在这里校验**：测试只依赖模块本身（任务卡明确要求
 * 不读文件）；一致性靠一次性的外部脚本（放 `%TEMP%`，不入库）解析 md 与 `LEVEL_TEXTS`/
 * `COOLING_TEXTS` 逐条比对，比对结果写进回执。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COOLING_TEXTS,
  LEVEL_TEXTS,
  TEXT_TOTAL,
  pickCoolingText,
  pickFavorText,
  pickFromList
} from '../lib/texts.js'

/** 120 条等级文本拉平（取样结果都从这里查归属） */
const ALL_LEVEL_TEXTS = LEVEL_TEXTS.flat()

/** 文本 → 所属等级（1..10）；`undefined` 表示不属于任何等级组（例如冷却文本） */
const GROUP_OF = new Map()
LEVEL_TEXTS.forEach((group, i) => {
  for (const text of group) GROUP_OF.set(text, i + 1)
})

/** spec Requirement 4 的四类禁用口径 + 任务卡要求的长度上限 */
const DIGIT_RE = /\d/
const DURATION_RE = /分钟|小时|秒/
const V1_ATTR_RE = /饥饿|清洁|心情/
/**
 * 功能承诺词表（spec R4"不承诺任何功能，如『提醒你』『帮你记着要做的事』"）：
 * 只要出现"提醒 / 闹钟 / 代办 / 待办 / 帮你记 / 帮你做 / 叫我做 / 定时 / 计时 / 倒数"
 * 就说明这句话在替用户记事或计时间 ⇒ 命中即失败。
 * 注意**不**纳入"记着"这个宽词：L5「我偷偷替你记着：该歇一会儿了」与 L9「我记着我们的每一次相遇」
 * 是情感表达、不含"替你做某件事"的承诺，收进词表会把合规文案误判成违规（口径见 spec R4 的例子）。
 */
const PROMISE_WORDS = [
  '提醒',
  '闹钟',
  '代办',
  '待办',
  '帮你记',
  '帮你做',
  '叫我做',
  '定时',
  '计时',
  '倒数'
]
const PROMISE_RE = new RegExp(PROMISE_WORDS.join('|'))
/** 单条长度上限（4 秒气泡读得完；按**码点**数，不用 UTF-16 长度） */
const MAX_CHARS = 24

/** 确定性伪随机（LCG）：注入取样函数的 `rand`，让"相邻去重"可复现 */
function lcg(seed = 20240101) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** `rand` 的两个极端：最小下标 / 最大下标（≈1 且不会越界） */
const AT_ZERO = () => 0
const AT_LAST = () => 0.9999999999999999

/** 逐条产出 [序号, 文本]（报文里能一眼定位是第几条出错） */
function* corpus() {
  for (const [i, group] of LEVEL_TEXTS.entries()) {
    for (const [j, text] of group.entries()) yield [`L${i + 1}[${j + 1}]`, text]
  }
  for (const [j, text] of COOLING_TEXTS.entries()) yield [`COOL[${j + 1}]`, text]
}

// ————— 条数 —————

test('卡02 texts · 条数：10 组 × 12 条 + 冷却 8 条 = 128', () => {
  assert.equal(LEVEL_TEXTS.length, 10, '等级文本必须是 10 组（L1..L10）')
  assert.deepEqual(
    LEVEL_TEXTS.map((g) => g.length),
    [12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
    '每组必须 12 条'
  )
  assert.equal(ALL_LEVEL_TEXTS.length, 120, '等级文本共 120 条')
  assert.equal(COOLING_TEXTS.length, 8, '冷却文本 8 条')
  assert.equal(TEXT_TOTAL, 128, 'TEXT_TOTAL 为 128')
  assert.equal(
    TEXT_TOTAL,
    ALL_LEVEL_TEXTS.length + COOLING_TEXTS.length,
    '128 = 120 + 8（推导一致）'
  )
})

test('卡02 texts · 文本唯一且冷却集合与等级集合不相交（spec R3：MUST NOT 混入）', () => {
  assert.equal(new Set(ALL_LEVEL_TEXTS).size, ALL_LEVEL_TEXTS.length, '120 条等级文本互不重复')
  assert.equal(new Set(COOLING_TEXTS).size, COOLING_TEXTS.length, '8 条冷却文本互不重复')
  const cooling = new Set(COOLING_TEXTS)
  const mixed = ALL_LEVEL_TEXTS.filter((text) => cooling.has(text))
  assert.deepEqual(mixed, [], '冷却文本不得同时出现在等级文本里（否则"混入"无法检测）')
})

test('卡02 texts · 每条都是非空字符串、无首尾空白（气泡渲染前提）', () => {
  for (const [where, text] of corpus()) {
    assert.equal(typeof text, 'string', `${where} 必须是字符串`)
    assert.notEqual(text.trim(), '', `${where} 不得为空`)
    assert.equal(text, text.trim(), `${where} 不得有首尾空白`)
  }
})

// ————— 逐条正则（全部 128 条） —————

test('卡02 texts · 正则自证有区分力（否则下面的 0 命中是空断言）', () => {
  assert.ok(DIGIT_RE.test('挂机 20 分钟'), '数字规则能命中旧文案')
  assert.ok(DURATION_RE.test('还需 4 分钟'), '时长单位规则能命中旧文案')
  assert.ok(DURATION_RE.test('倒计时 3 秒'), '时长单位规则能命中"秒"')
  assert.ok(V1_ATTR_RE.test('饥饿度 +5'), '旧属性名规则能命中饥饿')
  assert.ok(V1_ATTR_RE.test('清洁度'), '旧属性名规则能命中清洁')
  assert.ok(PROMISE_RE.test('我会提醒你喝水的'), '功能承诺词表能命中"提醒"')
  assert.ok(PROMISE_RE.test('帮你记着要做的事'), '功能承诺词表能命中"帮你记"')
})

test('卡02 texts · 全部 128 条逐条扫描：无数字/无时长单位/无旧属性名/无功能承诺/长度 ≤24', () => {
  const hits = { digit: [], duration: [], v1: [], promise: [], long: [] }
  for (const [where, text] of corpus()) {
    if (DIGIT_RE.test(text)) hits.digit.push(`${where} ⇒ ${text}`)
    if (DURATION_RE.test(text)) hits.duration.push(`${where} ⇒ ${text}`)
    if (V1_ATTR_RE.test(text)) hits.v1.push(`${where} ⇒ ${text}`)
    if (PROMISE_RE.test(text)) hits.promise.push(`${where} ⇒ ${text}`)
    if ([...text].length > MAX_CHARS) hits.long.push(`${where} ⇒ ${text}（${[...text].length} 字）`)
  }
  assert.equal(ALL_LEVEL_TEXTS.length + COOLING_TEXTS.length, 128, '扫描覆盖面 = 全 128 条')
  assert.deepEqual(hits.digit, [], '不得含阿拉伯数字')
  assert.deepEqual(hits.duration, [], '不得含时长单位（分钟/小时/秒）')
  assert.deepEqual(hits.v1, [], '不得含 v1 旧属性名（饥饿/清洁/心情）')
  assert.deepEqual(hits.promise, [], '不得承诺任何功能')
  assert.deepEqual(hits.long, [], `单条长度 ≤ ${MAX_CHARS} 字`)
})

// ————— 等级揭示（spec R1） —————

test('卡02 texts · 第 1 级 200 次取样全部属于 L1（MUST NOT 出现 L2–L10）', () => {
  const L1 = new Set(LEVEL_TEXTS[0])
  const rand = lcg(1)
  for (let i = 0; i < 200; i++) {
    const text = pickFavorText(1, undefined, rand)
    assert.ok(L1.has(text), `第 ${i + 1} 次取样越级：${text}`)
    assert.equal(GROUP_OF.get(text), 1, '归属必须是 L1')
  }
})

test('卡02 texts · 第 5 级 500 次取样属于 L1..L5，且至少命中过一次 L5', () => {
  const pool = new Set(LEVEL_TEXTS.slice(0, 5).flat())
  const rand = lcg(5)
  const seen = new Set()
  for (let i = 0; i < 500; i++) {
    const text = pickFavorText(5, undefined, rand)
    assert.ok(pool.has(text), `第 ${i + 1} 次取样越级：${text}`)
    assert.ok(GROUP_OF.get(text) <= 5, '不得出现 L6 及更高')
    seen.add(GROUP_OF.get(text))
  }
  assert.ok(seen.has(5), '500 次取样至少命中过一次 L5（否则"升到 5 级"看不到新文本）')
})

test('卡02 texts · 第 10 级能命中 L10（且取样仍覆盖低等级）', () => {
  const rand = lcg(10)
  const seen = new Set()
  for (let i = 0; i < 1000; i++) seen.add(GROUP_OF.get(pickFavorText(10, undefined, rand)))
  assert.ok(seen.has(10), '第 10 级必须能显示 L10 文本')
  assert.ok(seen.has(1), '第 10 级仍会显示 L1（design D-5：均匀随机，不按等级加权）')
  assert.deepEqual(
    [...seen].sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    '10 组全部可达'
  )
})

test('卡02 texts · 逐级揭示：第 N 级（1..10）任何取样都不超过 N，且取样池恰为 N×12 条', () => {
  for (let level = 1; level <= 10; level++) {
    const rand = lcg(100 + level)
    for (let i = 0; i < 100; i++) {
      const text = pickFavorText(level, undefined, rand)
      assert.ok(GROUP_OF.has(text), `第 ${level} 级取到了池外文本：${text}`)
      assert.ok(
        GROUP_OF.get(text) <= level,
        `第 ${level} 级出现了第 ${GROUP_OF.get(text)} 级文本（MUST NOT 出现 L${level + 1} 及更高）`
      )
    }
    // 池大小 = N×12：把 rand 顶到最大下标，第 N 级必须落在 LN 的最后一条上（不是第 N+1 组）
    assert.equal(
      pickFavorText(level, undefined, AT_LAST),
      LEVEL_TEXTS[level - 1][11],
      `第 ${level} 级候选池应为前 ${level} 组（${level * 12} 条），最大下标对应 L${level} 最后一条`
    )
  }
})

test('卡02 texts · 冷却文本与等级无关：第 1 级与第 10 级取到的都是那 8 条', () => {
  const cooling = new Set(COOLING_TEXTS)
  const rand = lcg(7)
  for (let i = 0; i < 200; i++) {
    const text = pickCoolingText(undefined, rand)
    assert.ok(cooling.has(text), `冷却取样越界：${text}`)
    assert.equal(GROUP_OF.has(text), false, '冷却文本不属于任何等级组（R3：MUST NOT 混入等级文本）')
  }
})

// ————— 相邻去重 —————

test('卡02 texts · 相邻去重（等级文本）：注入 LCG + 第一次结果作 last，连续两次必不相等', () => {
  const rand = lcg(42)
  let last = pickFavorText(10, undefined, rand)
  for (let i = 0; i < 500; i++) {
    const next = pickFavorText(10, last, rand)
    assert.notEqual(next, last, `第 ${i + 1} 次相邻重复：${last}`)
    last = next
  }
})

test('卡02 texts · 相邻去重（冷却文本）：同样连续两次必不相等', () => {
  const rand = lcg(24)
  let last = pickCoolingText(undefined, rand)
  for (let i = 0; i < 300; i++) {
    const next = pickCoolingText(last, rand)
    assert.notEqual(next, last, `第 ${i + 1} 次相邻重复：${last}`)
    last = next
  }
})

test('卡02 texts · 相邻去重（极端 rand）：每个条目当一次 last，rand=0 与 rand≈1 都不返回 last', () => {
  for (const last of ALL_LEVEL_TEXTS) {
    assert.notEqual(pickFavorText(10, last, AT_ZERO), last, `rand=0 时返回了 last：${last}`)
    assert.notEqual(pickFavorText(10, last, AT_LAST), last, `rand≈1 时返回了 last：${last}`)
  }
  for (const last of COOLING_TEXTS) {
    assert.notEqual(pickCoolingText(last, AT_ZERO), last, `冷却 rand=0 时返回了 last：${last}`)
    assert.notEqual(pickCoolingText(last, AT_LAST), last, `冷却 rand≈1 时返回了 last：${last}`)
  }
})

test('卡02 texts · 去重不是"抽到就重抽"：每次取样只调用一次 rand()（无死循环风险）', () => {
  let calls = 0
  const rand = () => {
    calls++
    return 0
  }
  // 让"最小下标"正好撞上 last：若实现是"抽到 last 就重抽"，这里会连抽多次（甚至死循环）
  assert.equal(pickFavorText(1, LEVEL_TEXTS[0][0], rand), LEVEL_TEXTS[0][1], '剔除 last 后取下一条')
  assert.equal(calls, 1, '一次取样 = 一次 rand()')
  calls = 0
  assert.equal(pickCoolingText(COOLING_TEXTS[0], rand), COOLING_TEXTS[1], '冷却同口径')
  assert.equal(calls, 1, '一次取样 = 一次 rand()')
})

test('卡02 texts · last 为 undefined / 不在候选池里时正常取（不因去重而少一个候选）', () => {
  // rand 顶到最大下标：第 1 级 12 条候选，最大下标 = L1 最后一条
  assert.equal(pickFavorText(1, undefined, AT_LAST), LEVEL_TEXTS[0][11])
  // last 来自更高等级（不在第 1 级候选里）⇒ 候选仍是完整 12 条，最大下标不变
  assert.equal(pickFavorText(1, '这句话根本不在候选池里', AT_LAST), LEVEL_TEXTS[0][11])
  // last 不属于冷却集合 ⇒ 8 条全在候选里
  assert.equal(pickCoolingText('不在冷却集合里的一句', AT_LAST), COOLING_TEXTS[7])
})

// ————— 等级钳制 —————

test('卡02 texts · 钳制：0/undefined/NaN ⇒ 按第 1 级（池 = L1 的 12 条）', () => {
  for (const bad of [0, -3, undefined, null, NaN, '3', {}]) {
    assert.equal(
      pickFavorText(bad, undefined, AT_ZERO),
      LEVEL_TEXTS[0][0],
      `${String(bad)} 的下界应为 L1 第一条`
    )
    assert.equal(
      pickFavorText(bad, undefined, AT_LAST),
      LEVEL_TEXTS[0][11],
      `${String(bad)} 的池必须恰为 L1 的 12 条（最大下标 = 第 12 条，不是 L2）`
    )
  }
})

test('卡02 texts · 钳制：11 及以上 ⇒ 按第 10 级（池 = 全部 120 条）', () => {
  for (const big of [11, 99, Infinity]) {
    assert.equal(
      pickFavorText(big, undefined, AT_ZERO),
      LEVEL_TEXTS[0][0],
      `${String(big)} 下界仍从 L1 起`
    )
    assert.equal(
      pickFavorText(big, undefined, AT_LAST),
      LEVEL_TEXTS[9][11],
      `${String(big)} 的池必须恰为 10 组 120 条（最大下标 = L10 最后一条）`
    )
  }
})

test('卡02 texts · 钳制：非整数截断（3.7 ⇒ 第 3 级；1.9 ⇒ 第 1 级）', () => {
  assert.equal(pickFavorText(3.7, undefined, AT_LAST), LEVEL_TEXTS[2][11], '3.7 按 3 级处理')
  assert.equal(pickFavorText(1.9, undefined, AT_LAST), LEVEL_TEXTS[0][11], '1.9 按 1 级处理')
})

// ————— 取样池内部守卫（pickFromList：两个具名取样函数的共同底座） —————

test('卡02 texts · 通用取样：候选只剩 1 条时返回该条（不死循环）', () => {
  assert.equal(pickFromList(['就这一条'], undefined, AT_ZERO), '就这一条')
  assert.equal(pickFromList(['就这一条'], '别的什么', AT_LAST), '就这一条')
  // 唯一候选恰好是 last：没有别的可选 ⇒ 仍返回它（宁可重复，也不能死循环或返回 undefined）
  assert.equal(pickFromList(['就这一条'], '就这一条', AT_ZERO), '就这一条')
  // 两条里 last 命中一条 ⇒ 候选剩一条
  assert.equal(pickFromList(['甲', '乙'], '甲', AT_ZERO), '乙')
  // 空表/非数组是纯防御分支（正常不会走到）
  assert.equal(pickFromList([], '甲', AT_ZERO), '')
  assert.equal(pickFromList(undefined, '甲', AT_ZERO), '')
})

test('卡02 texts · 均匀随机（无偏）：第 1 级 12000 次取样，12 条各自出现次数落在均值附近', () => {
  const rand = lcg(999)
  const count = new Map(LEVEL_TEXTS[0].map((text) => [text, 0]))
  const N = 12000
  for (let i = 0; i < N; i++) {
    const text = pickFavorText(1, undefined, rand)
    count.set(text, count.get(text) + 1)
  }
  assert.equal(count.size, 12, '12 条全部可达')
  const expected = N / 12 // 1000
  for (const [text, n] of count) {
    // 均匀随机的标准差 ≈ 30，留 ±400（>13σ）的余量：只有"明显偏斜/漏条"才会红
    assert.ok(
      n > expected - 400 && n < expected + 400,
      `「${text}」出现 ${n} 次，偏离均匀期望 ${expected} 过多（疑似加权或漏条）`
    )
  }
})

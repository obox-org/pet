/**
 * `PetStateView`（**v2 形状**）的归一化、气泡时长与互动回包的分流（卡 5）。
 *
 * **本模块零 import**：页面侧最要紧的两条逻辑（"畸形回包不许白屏"与"哪种拒绝不是错误"）
 * 必须能被 `node --test` **真跑**，而不是只能写源码正则（本扩展没有 jsdom / @vue/test-utils，
 * 见 `test/actions-ui.test.js` 的文件头）。`isRecord` 因此就地定义了一份，不再从
 * `./bridge` 借——那份要连 `window`，会把纯数据模块拖成不可单测的模块。
 *
 * 入口是权威，但页面**不能假设回包是好的**：字段缺失、为 `null`、为字符串、为 `NaN`
 * 都必须渲染成安全值而不是抛错（任务卡的状态同步要求）。所有取值都过 `num()`。
 *
 * v2 契约（卡 4 已落地，**不得改**）：
 * ```js
 * {
 *   items:  { fish, bubble },
 *   values: { growth, favor, level, levelName },
 *   anim:   { row, label, status, self },
 *   bubble: { text, tone:'good'|'bad', until } | null
 * }
 * ```
 * - 顶层**没有** `vitals`（三属性体系已随 `pet-vitals` 的 4 条 REMOVED 退役），
 *   也没有 v1 的 `growth:{value,rank,rankName}`——等级改为由**好感**决定（`values.level/levelName`）。
 * - `values.levelName` 是面板那一行**只读文字**（specs/pet-interaction R2），
 *   页面**不渲染任何数字**（成长值/好感的精确值只在设置页由宿主展示）。
 *   等级名由入口按 10 级阈值表给出（单一来源在 `lib/growth.js` 的 `levelOf`），
 *   页面**不复制**那张表：缺失就降级为空串（面板留一行空白，绝不自己编一个名字）。
 * - `anim.self`（卡 19 · 热修 D-1）= 当前 transient 是不是入口**自发**写的随机表演，
 *   是"本地一轮播完要不要折回呼吸 idle"的**唯一**判据（判定在 `app/lib/burst.ts`）。
 *   归一化时只认真布尔 `true`：`'true'`/`1`/`null`/缺失一律 false（畸形的入口回包宁可
 *   少折一轮，也不能把用户刚点的互动吞掉）。
 * - `anim.status` = 机器可读英文 key（入口 `resolveStatus` 的返回值），归一化后必有（**必填**）：
 *   入口没给时为空串 `''`，页面 `knownStatus` 视为"没给"并走 label 反查/row 兜底。
 *
 * 气泡时长：`BUBBLE_MS = 4000`（specs/pet-interaction R5：任何气泡 4 秒）。权威的"有没有气泡"
 * 仍由入口的 `bubble.until > now` 判定（`lib/bridge.js` 的 `buildView`），页面这份是**镜像**：
 * 页面用它在本地排一次性定时器并在 `until` 之前保持显示，两侧口径逐字一致；
 * 入口常量在 `lib/constants.js` 的 `BUBBLE_MS`（两套构建无法共享模块，由 `test/view-v2.test.js`
 * 的"两侧常量相等"断言钉住）。
 */

export interface Items {
  fish: number
  bubble: number
}

/** v2 的成长值/好感值/等级（specs/pet-values R1/R2/R3；全部只读字段） */
export interface Values {
  /** 成长值：非负整数、只增不减、不驱动任何功能 */
  growth: number
  /** 好感值：非负整数、**无上限**（满级后继续累加） */
  favor: number
  /** 好感等级 1..10（入口按阈值表算出；页面只透传，不重算） */
  level: number
  /** 等级中文名（面板那一行只读文字；缺失 ⇒ 空串，页面不自己造名字） */
  levelName: string
}

export interface StateBubble {
  text: string
  tone: 'good' | 'bad'
  /** 绝对时刻（ms）；过了这个时刻就不再显示 */
  until: number
}

export interface AnimView {
  row: number
  label: string
  status: string
  self: boolean
}

export interface PetStateView {
  items: Items
  values: Values
  anim: AnimView
  bubble: StateBubble | null
}

/**
 * 气泡自动消失时长（specs/pet-interaction R5：**4000 毫秒**）。
 *
 * 与入口 `lib/constants.js` 的 `BUBBLE_MS = 4000` **逐值相等**（两套构建、无法共享模块）：
 * 入口负责"权威到期"（写气泡时排一次性 4 秒定时器，到期清 `speech` 并 `rev++` 推送），
 * 页面负责"本地这一条 4 秒后必须消失"。只改一侧就会出现"气泡挂了 4 秒但界面留残余"
 * 或"界面先消失、入口还在报"——`test/view-v2.test.js` 有一条"两侧常量相等"的断言钉住它。
 */
export const BUBBLE_MS = 4000

/** 页面兜底的"图集加载失败"占位文案与其它 aria 文案（全中文，design 硬约束 7） */
export const TEXT = {
  /** 两枚互动图标按钮的可访问名（specs/pet-interaction R1：可访问名逐字「喂食」「洗澡」） */
  feed: '喂食',
  bathe: '洗澡',
  closePanel: '关闭面板',
  spriteAria: '宠物（回车摸头）',
  panelAria: '宠物状态与互动',
  /** design D-9：图集缺文件/解码失败时的窗体内占位 */
  spriteFailed: '图集加载失败',
  /** 首帧状态还没回来（pet.ready 未成功）时的提示 */
  syncing: '正在连接宠物状态…',
  /**
   * ★ 摸头冷却（上游 `affinity.ts` 逐字，与入口 `lib/constants.js` 的 `TEXT.petCooling` 同文）。
   * 正常路径下这句话由入口随 `feedback.text` 带回；这里留一份**页面兜底**，使回包缺 text 时
   * 也能说出正确的那句（而不是误报"摸头成功"）。共享冷却与点击冷却也用它兜底。
   */
  petCooling: '摸过头啦，让鲸鱼娘歇口气～',
  /** 成功反馈的兜底（逐字取自入口 `lib/constants.js` 的 TEXT；正常路径由回包带回） */
  feedback: {
    feed: '呜哇！小鱼干好好吃！', // ★ 上游逐字
    bathe: '泡泡好舒服～洗干净啦！',
    pet: '咕噜咕噜～被摸摸好舒服！' // ★ 上游 affinity.ts 逐字
  } as Record<'feed' | 'bathe' | 'pet', string>,
  /** 道具不足的兜底（入口 reject 的 `reason='no-item'` 正常会带 text） */
  missing: {
    feed: '没有小鱼干了，多陪我工作一会儿吧～', // ★ 上游 ledger.ts 逐字
    bathe: '没有沐浴泡泡了，多陪我工作一会儿吧～'
  } as Record<'feed' | 'bathe', string>,
  genericError: '这次没能完成，稍后再试一次'
} as const

/** 数字兜底：`NaN` / `undefined` / `null` / 非数字字符串 → fallback（默认 0） */
export function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) ? n : fallback
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 非负整数（成长值/好感值/道具数量：只涨不跌、无上限，负数与小数都归一） */
function nonNegInt(value: unknown): number {
  const n = num(value, 0)
  return n > 0 ? Math.floor(n) : 0
}

/** 等级只在 1..10 内（缺失 ⇒ 1 = 第 1 级；越界钳到边界，不让面板拿到 0 或 99） */
function levelOf(value: unknown): number {
  const n = Math.floor(num(value, 1))
  return Math.min(10, Math.max(1, n))
}

function normalizeBubble(raw: unknown): StateBubble | null {
  if (!isRecord(raw)) return null
  const text = typeof raw.text === 'string' ? raw.text : ''
  if (text.trim() === '') return null
  return {
    text,
    tone: raw.tone === 'bad' ? 'bad' : 'good',
    until: num(raw.until, 0)
  }
}

/**
 * 把任意回包整形成 `PetStateView`（v2）；`raw` 不是对象时返回安全值（**不抛错**）。
 *
 * 降级口径（卡 5 的负向自检逐条）：
 * - 缺 `values` ⇒ 全 0 + 等级 1 + 等级名空串（面板留一行空白，不白屏）；
 * - 缺 `levelName` / 非字符串 / 纯空白 ⇒ 空串（**不**按 favor 自己造名字：等级表单一来源在入口）；
 * - `bubble` 畸形（不是对象 / 没有 text / text 空）⇒ `null`（不显示一条空气泡）；
 * - v1 的 `vitals` 与 `growth:{value,rank,rankName}` 即使出现也**不被读取**（结构上已删）。
 */
export function normalizeState(raw: unknown): PetStateView {
  const obj = isRecord(raw) ? raw : {}
  const valuesRaw = isRecord(obj.values) ? obj.values : {}
  const itemsRaw = isRecord(obj.items) ? obj.items : {}
  const animRaw = isRecord(obj.anim) ? obj.anim : {}
  const levelName = typeof valuesRaw.levelName === 'string' ? valuesRaw.levelName.trim() : ''

  return {
    items: {
      fish: nonNegInt(itemsRaw.fish),
      bubble: nonNegInt(itemsRaw.bubble)
    },
    values: {
      growth: nonNegInt(valuesRaw.growth),
      favor: nonNegInt(valuesRaw.favor),
      level: levelOf(valuesRaw.level),
      levelName
    },
    // row = -1 表示"入口没给行号"，decideAnimation 据此改走 idle，而不是当成第 0 行
    // status = '' 表示"入口没给机器可读 key"（老数据），decideAnimation 回退中文 label 反查/row 兜底
    // self：只认真布尔 true（卡 19 负向自检：畸形的 self 归一 false ⇒ 页面不会误折用户刚点的互动）
    anim: {
      row: Math.floor(num(animRaw.row, -1)),
      label: typeof animRaw.label === 'string' ? animRaw.label : '',
      status: typeof animRaw.status === 'string' ? animRaw.status : '',
      self: animRaw.self === true
    },
    bubble: normalizeBubble(obj.bubble)
  }
}

/**
 * 首帧占位状态：`pet.ready` 回来之前用它渲染，避免面板闪出一屏"没有等级名"。
 * 数值取 design D-9 的空态默认（成长 0 / 好感 0 / 第 1 级「初次见面」/ 库存 3/3）——
 * 这正是"首次安装、无 state.json"时入口会回的值；拿到权威状态后立刻被覆盖。
 */
export const DEFAULT_STATE: PetStateView = {
  items: { fish: 3, bubble: 3 },
  values: { growth: 0, favor: 0, level: 1, levelName: '初次见面' },
  anim: { row: -1, label: '', status: '', self: false },
  bubble: null
}

// ————— 互动回包的分流（卡 4 明确移交的坑） —————

/**
 * `pet.interact` 回包里的四种 `reason`（与入口 `lib/interact.js` 的返回结构逐字对应）。
 *
 * **这里踩过的坑**：入口对"共享冷却 / 道具不足 / 点击冷却"三种情况返回的是
 * `{ ok:false, reason, text, state }`——`ok:false` 但**不是错误**，它带一句用户可见的反馈、
 * 状态一个字节都没改。v1 的页面用 `unwrap()` 把"`data.ok === false`"一律当错误抛掉，
 * 结果是 `reason='cooling'` 走了错误路径：气泡拿不到入口给的句子（退化成通用报错），
 * 也不会应用回包里的视图。四种 reason 里**只有 `unknown-kind` 是错误路径**
 * （specs/pet-interaction R1 的"旧载荷的玩耍请求被拒绝"：不弹气泡、只记诊断）。
 */
export const REASON_COOLING = 'cooling'
export const REASON_NO_ITEM = 'no-item'
export const REASON_PET_COOLING = 'pet-cooling'
export const REASON_UNKNOWN_KIND = 'unknown-kind'

/** 三种"被拒绝但要走气泡"的 reason：它们都要给用户一句话，且都不是错误 */
export const BUBBLE_REASONS: readonly string[] = [REASON_COOLING, REASON_NO_ITEM, REASON_PET_COOLING]

export interface InteractDispatch {
  /** `bubble` = 用户可见反馈（成功与三种"拒绝但不报错"）；`error` = 仅诊断，不弹气泡 */
  path: 'bubble' | 'error'
  tone: 'good' | 'bad'
  /** 给气泡/诊断用的句子（回包缺 text 时用页面兜底，绝不出现空串） */
  text: string
  /** 入口是否真的受理了这次互动（决定页面要不要起一轮瞬时动画） */
  accepted: boolean
  reason: string
}

/** 回包缺 text 时的兜底：按 kind + reason 说对那一句（不把冷却误报成"没有道具"） */
function fallbackFeedbackText(kind: string, reason: string): string {
  if (reason === REASON_NO_ITEM) return kind === 'bathe' ? TEXT.missing.bathe : TEXT.missing.feed
  if (reason === REASON_COOLING || reason === REASON_PET_COOLING) return TEXT.petCooling
  if (kind === 'bathe') return TEXT.feedback.bathe
  if (kind === 'pet') return TEXT.feedback.pet
  return TEXT.feedback.feed
}

/**
 * 把 `pet.interact` 的业务回包分流成"弹气泡"或"错误路径"（**不抛错**，任何畸形输入都有结果）。
 *
 * - `ok:true`（受理）⇒ 气泡，tone 取回包的 `feedback.tone`（缺省 good）；
 * - `reason ∈ {cooling, no-item, pet-cooling}` ⇒ **气泡**，tone=bad（这三句都是给玩家看的提示）；
 * - 其余 `ok:false`（`unknown-kind` 与任何未来新增的未知拒绝）⇒ **错误路径**（console.warn，
 *   不弹气泡：D-9「未知互动：不弹气泡；诊断位记录」）。
 *
 * 桥层失败（请求超时 / 窗体已关闭 / 回包为空）**不走这里**：那是"请求没送到"，
 * 由 `App.vue` 直接弹一句 `TEXT.genericError`。
 */
export function interactDispatch(raw: unknown, kind: string): InteractDispatch {
  const reply = isRecord(raw) ? raw : {}
  const reason = typeof reply.reason === 'string' ? reply.reason : ''
  const accepted = reply.ok === true
  const feedback = isRecord(reply.feedback) ? reply.feedback : {}
  const provided = typeof feedback.text === 'string' ? feedback.text.trim() : ''
  const tone: 'good' | 'bad' = feedback.tone === 'bad' ? 'bad' : 'good'
  const text = provided !== '' ? provided : fallbackFeedbackText(kind, reason)

  if (accepted || BUBBLE_REASONS.includes(reason)) {
    return { path: 'bubble', tone, text, accepted, reason }
  }
  const error = typeof reply.error === 'string' ? reply.error.trim() : ''
  return { path: 'error', tone: 'bad', text: error !== '' ? error : TEXT.genericError, accepted, reason }
}

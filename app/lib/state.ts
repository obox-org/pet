/**
 * `PetStateView` 的归一化与页面文案（design D-3 的形状、D-7 的等级阈值、D-9 的错误文案）。
 *
 * 入口是权威，但页面**不能假设回包是好的**：字段缺失、为 `null`、为字符串、为 `NaN`
 * 都必须渲染成 0 而不是抛错（任务卡的状态同步要求）。所有取值都过 `num()`。
 */

import { isRecord } from './bridge'

export interface Vitals {
  hunger: number
  clean: number
  mood: number
}

export interface Items {
  fish: number
  bubble: number
}

export interface Growth {
  value: number
  rank: number
  rankName: string
}

export interface StateBubble {
  text: string
  tone: 'good' | 'bad'
  /** 绝对时刻（ms）；过了这个时刻就不再显示 */
  until: number
}

/**
 * design D-3 定义的 `PetStateView`（anim 经卡 12/裁定 R14 增补 `status`、卡 19 增补 `self`）。
 * `anim.status` = 机器可读英文 key（十二个状态之一，入口 `resolveStatus` 的返回值；
 * 卡 18 / Q16 起含入口自发表演的 `trot`/`run-left`/`run-right`）；
 * `anim.label` = 中文状态名，仅供显示。归一化后 `status` 必有（**必填**）：
 * 入口没给（老数据/畸形数据）时为空串 `''`，页面 `knownStatus` 视为"没给"并走 label 反查/row 兜底。
 *
 * `anim.self`（卡 19 · 热修 D-1）= **当前 transient 是不是入口自发写的随机表演**。
 * 它是"本地一轮播完要不要折回呼吸 idle"的**唯一**判据：随机集的
 * `eating`/`bathing`/`petted`/`playing` 四项与真实互动同名同轨（随机抽到的 `eating` 与用户点喂食
 * 在两边都是 `'eating'`），靠状态字符串区分不出来——这正是 D-1 的根因。
 * 归一化时**只认真布尔 `true`**：`'true'`/`1`/`null`/缺失一律 false（畸形的入口回包宁可
 * 少折一轮，也不能把用户刚点的互动吞掉）。本字段必填且有明确语义（false = "不是自发表演"）。
 *
 * 卡 17（Q15=B）：卡 15 增补的顶层 `hidden` 字段已随该功能整条移除——宠物要么显示（窗体在），
 * 要么关闭（设置页 toggle 关 = 销毁窗体，真省 CPU）；页面**不再**有任何"只画一个小按钮"的中间态。
 * `vitals` 仍在契约里，但**面板不再渲染它**（Q13）：页面的 `decideAnimation` 要用三属性做
 * "属性过低"的本地兜底判定（入口回包自相矛盾时界面不能显示"吃饱了的待机"），故归一化照旧保留。
 */
export interface PetStateView {
  vitals: Vitals
  items: Items
  growth: Growth
  anim: { row: number; label: string; status: string; self: boolean }
  bubble: StateBubble | null
}

/** D-7：0–49 幼鲸 / 50–199 伙伴 / 200–499 挚友 / ≥500 深海羁绊 */
export const RANK_NAMES = ['幼鲸', '伙伴', '挚友', '深海羁绊'] as const
export const RANK_THRESHOLDS = [0, 50, 200, 500] as const

/** design D-7：气泡 2600ms 自动消失 */
export const BUBBLE_MS = 2600

/**
 * 页面文案：全中文，错误文案要"可执行"（design 硬约束 7）。
 *
 * **口径（design D-16 + 增补 Q12/Q13）**：全部用户可见文案 MUST NOT 含「数字 + 时间单位」
 * （分钟/秒/小时）与「属性增量数字」（`+5`/`+15`/`-1`）。标 ★ 的五句与上游 dsh-pet **逐字一致**，
 * 与入口 `lib/constants.js` 的 TEXT 同文（页面与入口是两套构建、无法共享模块；
 * 两侧一致性由 `test/actions-text.test.js` 的源码断言钉住）。
 * 卡 15 起**不再有属性小条相关文案**（Q13：面板不显示三属性 ⇒ `饥饿/清洁/心情` 三个标签已删）。
 */
export const TEXT = {
  /**
   * 三枚互动图标按钮的**可访问名**（design D-16 末段 + specs/pet-interaction：
   * 图标化之后文字只以 `aria-label`/`title` 存在，不再有文字标签——Q15）。
   */
  feed: '喂食',
  bathe: '洗澡',
  play: '玩耍',
  closePanel: '关闭面板',
  spriteAria: '宠物（回车摸头）',
  panelAria: '宠物状态与互动',
  growthLabel: '成长',
  fishLabel: '小鱼干',
  bubbleLabel: '沐浴泡泡',
  /** design D-9：图集缺文件/解码失败时的窗体内占位 */
  spriteFailed: '图集加载失败',
  /** 首帧状态还没回来（pet.ready 未成功）时的提示 */
  syncing: '正在连接宠物状态…',
  /** D-4：打盹的表现由气泡/面板文字承担（上游图集没有 sleep 轨） */
  sleeping: '打盹中（Zzz）',
  /**
   * ★ 摸头冷却（上游 `affinity.ts` 逐字，与入口 `lib/constants.js` 的 `TEXT.petCooling` 同文）。
   * 正常路径下这句话由入口随 `feedback.text` 带回；这里留一份**页面兜底**，
   * 使页面在回包缺 text 时也能按 `tone='bad'` 说出正确的那句（而不是误报"摸头成功"）。
   */
  petCooling: '摸过头啦，让鲸鱼娘歇口气～',
  /** 入口没给 feedback.text 时的兜底（逐字取自 design D-16 文案总表） */
  feedback: {
    feed: '呜哇！小鱼干好好吃！', // ★ 上游逐字
    bathe: '泡泡好舒服～洗干净啦！',
    play: '玩得好开心！',
    pet: '咕噜咕噜～被摸摸好舒服！' // ★ 上游 affinity.ts 逐字
  } as Record<'feed' | 'bathe' | 'play' | 'pet', string>,
  /** design D-9/D-16 的道具不足文案（入口正常时会自己带回来，这里是兜底） */
  missing: {
    feed: '没有小鱼干了，多陪我工作一会儿吧～', // ★ 上游 ledger.ts 逐字
    bathe: '没有沐浴泡泡了，多陪我工作一会儿吧～'
  } as Record<string, string>,
  genericError: '这次没能完成，稍后再试一次'
} as const

/** 数字兜底：`NaN` / `undefined` / `null` / 非数字字符串 → fallback（默认 0） */
export function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) ? n : fallback
}

/**
 * 属性钳到 [0,100]（specs/pet-vitals 的上下限；页面侧再钳一次做防御）。
 * 卡 15 起页面**不再显示三属性**（Q13：面板删掉属性小条 ⇒ 原 `displayInt` 显示取整函数一并删除），
 * 本函数只服务于 `normalizeState` 的归一化与 `decideAnimation` 的"属性过低"本地兜底判定。
 */
export function clamp100(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

/** 成长值不设上限，只做"非负 + 向下取整"后显示 */
export function displayGrowth(value: number): number {
  const n = num(value, 0)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** 等级名：入口给了非空字符串就用它，否则按 D-7 阈值自算（页面不能因为入口漏字段就显示空白） */
export function rankNameOf(value: number, provided?: unknown): string {
  if (typeof provided === 'string' && provided.trim() !== '') return provided
  const v = num(value, 0)
  let index = 0
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
    if (v >= RANK_THRESHOLDS[i]) index = i
  }
  return RANK_NAMES[index]
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

/** 把任意回包整形成 `PetStateView`；`raw` 不是对象时返回全 0 的安全值（不抛错） */
export function normalizeState(raw: unknown): PetStateView {
  const obj = isRecord(raw) ? raw : {}
  const vitalsRaw = isRecord(obj.vitals) ? obj.vitals : {}
  const itemsRaw = isRecord(obj.items) ? obj.items : {}
  const growthRaw = isRecord(obj.growth) ? obj.growth : {}
  const animRaw = isRecord(obj.anim) ? obj.anim : {}

  const value = Math.max(0, num(growthRaw.value, 0))
  return {
    vitals: {
      hunger: clamp100(num(vitalsRaw.hunger, 0)),
      clean: clamp100(num(vitalsRaw.clean, 0)),
      mood: clamp100(num(vitalsRaw.mood, 0))
    },
    items: {
      fish: Math.max(0, Math.floor(num(itemsRaw.fish, 0))),
      bubble: Math.max(0, Math.floor(num(itemsRaw.bubble, 0)))
    },
    growth: {
      value,
      rank: Math.max(0, Math.floor(num(growthRaw.rank, 0))),
      rankName: rankNameOf(value, growthRaw.rankName)
    },
    // row = -1 表示"入口没给行号"，decideAnimation 据此改走属性判定，而不是当成第 0 行
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
 * 首帧占位状态：`pet.ready` 回来之前用它渲染，避免面板闪出一屏 0/100。
 * 数值取 design D-8 的空态默认（三属性 100、成长 0、库存 3/3）——这正是"首次安装、无 state.json"
 * 时入口会回的值；拿到权威状态后立刻被覆盖。
 */
export const DEFAULT_STATE: PetStateView = {
  vitals: { hunger: 100, clean: 100, mood: 100 },
  items: { fish: 3, bubble: 3 },
  growth: { value: 0, rank: 0, rankName: RANK_NAMES[0] },
  anim: { row: -1, label: '', status: '', self: false },
  bubble: null
}

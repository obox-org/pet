/**
 * 互动纯函数（specs/pet-interaction 的 6 条 requirement；specs/pet-economy 的消耗与拒绝规则；
 * design D-4 判定顺序、D-9 错误码与文案）。
 *
 * v2 的合法互动只有三种：`feed`（喂食）/ `bathe`（洗澡）/ `pet`（点击摸头）。
 * `play` / `summon` / `hide` 与任何未知值一律按**未知互动**拒绝——它们不是"暂时停用的分支"，
 * 而是在新模型里**不存在**（specs/pet-interaction R1 的"旧载荷的玩耍请求被拒绝"、
 * design D-10 的连带清理），所以连 `lastInteractAt` 都不推，状态一个字节都不动。
 *
 * ## 判定顺序（固定：冷却 → 库存 → 结算）
 *
 * 喂食与洗澡共用**同一个** `lastInteractAt` 基准（design D-4 被否决的备选②：不按 kind 分开）：
 *
 * ```text
 * now - lastInteractAt >= INTERACT_COOLDOWN_MS ?
 *   ├─ 否 ⇒ { ok:false, reason:'cooling', text }        （不消耗、不改值）
 *   └─ 是 ⇒ 对应道具 >= 1 ?
 *         ├─ 否 ⇒ { ok:false, reason:'no-item', text }  （不消耗、不改值）
 *         └─ 是 ⇒ 道具 -1、growth +1、favor +1、lastInteractAt = now、lastAfkAt = now
 * ```
 *
 * 顺序**不能交换**：先判库存会在"冷却中且恰好没道具"时误报"没有小鱼干"，与真实原因不符
 * （design D-4 被否决的备选①）。两个门都过了才结算，所以不存在"扣了道具却没加值"的部分副作用。
 *
 * 点击独立于共享冷却：`now - lastPetAt >= PET_COOLDOWN_MS` 才 +1 好感；
 * 冷却期内**仍返回 `anim:'petted'` 与一句冷却文本**（specs/pet-interaction R5：摸头动画照播），
 * 但数值、`lastPetAt`、`lastAfkAt` 全部不动——"不结算"不等于"没有反馈"。
 *
 * ## 边界口径（design D-4 的边界条，逐字落地）
 *
 * - 时间戳缺失 / 非法（`NaN`、非数字、`±Infinity`）/ 负数 / 落在未来 ⇒ 冷却基准视为**已到期**：
 *   宁可给用户一次互动，也不要因为一条坏存档把互动永久卡死；
 * - 时钟回拨（`now < last`）⇒ 同样视为已到期（时间差取 `Infinity`，不会算出负数再被当成"未到期"）；
 * - 恰好等于冷却时长 ⇒ **放行**（`>=`，与 D-4 的 `>= 600_000` 逐字一致）；
 * - `now` 本身非法 ⇒ 按 0 归一（等价于"很久以前"），不抛错、不算出 NaN 时间戳；
 * - 入参状态按**只读**对待：每个分支都返回新的 `state` 对象，绝不就地改字段。
 *
 * ## 返回结构（卡 4 的视图与气泡直接消费）
 *
 * | 情况 | 返回 |
 * | --- | --- |
 * | 成功 | `{ ok:true, anim:'eating'|'bathing'|'petted', text, state }` |
 * | 共享冷却中 | `{ ok:false, reason:'cooling', text, state }` |
 * | 道具不足 | `{ ok:false, reason:'no-item', text, state }` |
 * | 点击冷却中 | `{ ok:false, reason:'pet-cooling', anim:'petted', text, state }` |
 * | 未知 kind | `{ ok:false, reason:'unknown-kind', state }` |
 *
 * `reason` 与 design D-9 的错误码**一一对应**（`cooling` / `no-item` / `pet-cooling` /
 * `unknown-kind`）。未知互动按 D-9「不弹气泡；诊断位记录」**不带 `text`**：入口据 `TEXT.unknownKind(kind)`
 * 写诊断，而不是把它当气泡弹给用户。拒绝分支返回的 `state` 与入参**逐字段相等**（零副作用的证明）。
 *
 * 本函数**不**写 `transient` / `transientSelf` / `speech`、不动 `rev`、不排任何定时器——
 * 那些是卡 4 的入口编排（design D-2/D-3/D-6）。这里只回答四件事：
 * 这次互动成不成、数值怎么变、该播哪个动作、该说哪句话。
 */
import {
  FAVOR_PER_INTERACT,
  FAVOR_PER_PET,
  GROWTH_PER_INTERACT,
  INTERACT_COOLDOWN_MS,
  PET_COOLDOWN_MS,
  TEXT
} from './constants.js'
import { finiteOr, toNonNegInt } from './growth.js'
import { pickCoolingText } from './texts.js'

/**
 * 合法互动 kind（**导出**给负向门禁断言：`play`/`summon`/`hide` 都不在里面）。
 *
 * 用数组而不是 Set：任务卡的口径就是 `['feed', 'bathe', 'pet']`，且数组能被 `deepEqual` 直接钉住
 * （`Set` 的相等断言要 `[...KINDS]` 转换，容易写成"只断言长度"的假门禁）。
 * 冻结它，防止入口或测试把合法集合改脏。
 */
export const KINDS = Object.freeze(['feed', 'bathe', 'pet'])

/**
 * 喂食/洗澡共享冷却期内的提示（design D-9「共享冷却中」的逐字文案）。
 *
 * 不并进 `constants.js` 的 `TEXT`：那是既有文案总表，**本卡无所有权**（文件所有权只有
 * `lib/interact.js` 与新建的测试）；而这句是 v2 新增的"共享冷却"文案，先在互动模块内闭环，
 * 由卡 6 决定是否并回总表。硬约束（specs/pet-favor R4）：无阿拉伯数字、无时间单位，4 秒气泡读得完。
 */
export const SHARED_COOLING_TEXT = '刚互动过啦，让我歇一会儿～'

/**
 * 距上次成功互动的毫秒数；**任何不可信情况都返回 `Infinity`（= 已到期）**。
 *
 * - `prev <= 0`：字段缺失、0（首装的哨兵值）、负数 ⇒ 从未成功过；
 * - `prev > now`：落在未来（时钟被拨快）或 `now` 回拨 ⇒ 视为已到期（D-4 回拨条）。
 *
 * `Infinity` 与两个冷却常量比较恒为 `>=`，调用点因此只需要一句 `< COOLDOWN` 就能表达"冷却中"，
 * 不会出现 `NaN < x === false` 这种"坏值被静默当成已到期"的巧合式正确（那是可读性陷阱）。
 */
function msSince(last, now) {
  const prev = finiteOr(last, 0)
  if (prev <= 0 || prev > now) return Infinity
  return now - prev
}

/** 拒绝分支的统一形状：状态**原样**（新对象）返回，零副作用 */
function reject(state, reason, extra) {
  return { ok: false, reason, ...extra, state }
}

/**
 * 点击冷却文本的"相邻去重"基准：上一次显示的**气泡文本**（运行时字段 `speech`，不落盘）。
 * 该字段由入口（卡 4）在显示气泡时写入；缺失或畸形 ⇒ `undefined` ⇒ 取样不做去重（正常取一条）。
 */
function lastBubbleText(state) {
  const speech = state.speech
  return speech && typeof speech === 'object' && typeof speech.text === 'string'
    ? speech.text
    : undefined
}

/**
 * 一次互动（纯函数，不改入参）。
 *
 * @param {object} state 运行时状态（design D-1 字段表；只读）
 * @param {string} kind  `'feed'` | `'bathe'` | `'pet'`（其余一律 `unknown-kind`）
 * @param {number} now   调用方给的毫秒时间戳（不读时钟，保证可测）
 */
export function interact(state, kind, now) {
  const src = state && typeof state === 'object' && !Array.isArray(state) ? state : {}
  const t = finiteOr(now, 0)
  /** 拒绝时回传的"原样状态"（新对象）：所有拒绝分支共用同一份快照，避免互相污染 */
  const unchanged = { ...src }

  // ① 未知互动：在算任何时间差、看任何库存**之前**就返回（连 lastInteractAt 都不推）
  if (typeof kind !== 'string' || !KINDS.includes(kind)) {
    return reject(unchanged, 'unknown-kind')
  }

  // ② 点击：独立冷却（不与喂食/洗澡共享）
  if (kind === 'pet') {
    if (msSince(src.lastPetAt, t) < PET_COOLDOWN_MS) {
      // 冷却内：不结算，但**必须**返回摸头动画与一句冷却文本（specs/pet-interaction R5）
      return reject(unchanged, 'pet-cooling', {
        anim: 'petted',
        text: pickCoolingText(lastBubbleText(src))
      })
    }
    return {
      ok: true,
      anim: 'petted',
      text: TEXT.petOk,
      state: {
        ...src,
        favor: toNonNegInt(src.favor) + FAVOR_PER_PET,
        lastPetAt: t,
        // design D-3 硬细节：任何成功互动都重新开始挂机计时（下一次奖励在 1200 秒后）
        lastAfkAt: t
      }
    }
  }

  // ③ 喂食/洗澡：共享冷却 → 库存 → 结算（顺序固定，不得交换）
  if (msSince(src.lastInteractAt, t) < INTERACT_COOLDOWN_MS) {
    return reject(unchanged, 'cooling', { text: SHARED_COOLING_TEXT })
  }

  const isFeed = kind === 'feed'
  const stock = toNonNegInt(isFeed ? src.fish : src.bubble)
  if (stock < 1) {
    return reject(unchanged, 'no-item', { text: isFeed ? TEXT.noFish : TEXT.noBubble })
  }

  return {
    ok: true,
    anim: isFeed ? 'eating' : 'bathing',
    text: isFeed ? TEXT.feedOk : TEXT.batheOk,
    state: {
      ...src,
      [isFeed ? 'fish' : 'bubble']: stock - 1,
      growth: toNonNegInt(src.growth) + GROWTH_PER_INTERACT,
      favor: toNonNegInt(src.favor) + FAVOR_PER_INTERACT,
      // 共享冷却与挂机奖励的基准都推进到本次成功时刻
      lastInteractAt: t,
      lastAfkAt: t
    }
  }
}

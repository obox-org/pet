/**
 * 互动纯函数（specs/pet-interaction + pet-economy；design D-4 瞬时互动、D-7 冷却、D-16 文案）。
 *
 * interact(state, kind, now) 不修改入参：
 * - 成功 ⇒ { ok:true, state:新状态, feedback:{ kind, text, tone } }；
 * - 道具不足 / 未知 kind ⇒ { ok:false, error } 且**状态一个字节都不动**
 *   （specs/pet-economy"无小鱼干时喂食：饥饿度不变、小鱼干不变"；任务卡负向自检"不污染状态"）。
 *
 * 卡 17（Q15=B）：`summon` / `hide` 两个 kind 与它们的开关分支、以及"隐藏态下拒绝其它互动"的兜底分支
 * **整条移除**——隐藏不再是一个状态，它只由设置页 toggle 承担（= 销毁窗体省 CPU，design D-15 撤销说明）。
 * 旧页面/畸形载荷发来的 kind 取 `summon` / `hide` 的请求一律走**未知互动**拒绝（`KINDS` 里没有它们），
 * 拒绝时连 `lastInteractAt` 都不动：它们已经不构成任何合法互动。
 *
 * 心情上限口径：互动途径（玩耍 +5 / 点击 +1）钳 [0,100]；
 * "恢复联动"（饥饿/清洁每恢复 10 点 ⇒ 心情 +1）才有 95 上限（specs/pet-vitals Requirement 3）。
 */
import {
  BATHE_CLEAN,
  BUBBLE_MS,
  FEED_HUNGER,
  PET_COOLDOWN_MS,
  PET_MOOD,
  PLAY_MOOD,
  TEXT,
  TRANSIENT_MS
} from './constants.js'
import { clamp, finiteOr, ledgerRecover } from './vitals.js'

/**
 * 合法的互动 kind（**导出**：卡 17 的负向自检要求断言"`KINDS` 不含 `summon`/`hide`"，
 * 用源码字符串断言会被注释与历史遗留误导，直接断言集合内容才是真门禁）。
 */
export const KINDS = new Set(['feed', 'bathe', 'play', 'pet'])

/** 恢复一个属性并走"净恢复"联动记账（实际生效量入账：被 100 钳掉的虚增不计） */
function withRecovery(state, vitalKey, amount) {
  const before = state[vitalKey]
  const after = clamp(before + amount, 0, 100)
  const ledger = ledgerRecover(state.recoverAcc, after - before, state.mood)
  return { ...state, [vitalKey]: after, recoverAcc: ledger.acc, mood: ledger.mood }
}

/** 成功返回的统一形状：瞬时动画（播完一轮回落）+ 气泡（2600ms 自动消失）+ feedback */
function succeed(state, now, kind, status, text, tone) {
  return {
    ok: true,
    state: {
      ...state,
      transient: { status, until: now + TRANSIENT_MS[status] },
      // 卡 19（热修 D-1）：**真实互动写下的 transient 一律不是自发表演**。
      // 随机表演（index.js 的 onRandomPerf）与真实互动共用同一个 transient 字段、
      // 状态字符串也完全相同（随机抽到的 eating 与用户点喂食都是 'eating'），
      // 所以"这一轮是谁写的"只能由写入方记录；页面据此决定"播完是折回呼吸 idle（自发）
      // 还是照常交给状态驱动（互动）"。畸形/老状态里的该字段即使是真值也必须被这里覆盖成 false。
      transientSelf: false,
      // 内部字段叫 speech（气泡对象），与道具 bubble（沐浴泡泡库存）区分，避免同名歧义
      speech: { text, tone, until: now + BUBBLE_MS }
    },
    feedback: { kind, text, tone }
  }
}

export function interact(state, kind, now) {
  if (typeof kind !== 'string' || !KINDS.has(kind)) {
    // 卡 17 负向自检：未知 kind（含已移除的 summon/hide）⇒ { ok:false, error:'未知互动: …' }
    // （String() 防对象注入日志），且**在算 lastInteractAt 之前就返回** ⇒ 状态一个字节都不动
    return { ok: false, error: TEXT.unknownKind(String(kind)) }
  }

  // 任何成功互动都刷新"最近交互时刻"（D-4 sleep 的退出条件：任一交互发生）
  const base = { ...state, lastInteractAt: now }

  switch (kind) {
    case 'feed': {
      if (state.fish < 1) return { ok: false, error: TEXT.noFish }
      const next = withRecovery({ ...base, fish: state.fish - 1 }, 'hunger', FEED_HUNGER)
      return succeed(next, now, 'feed', 'eating', TEXT.feedOk, 'good')
    }
    case 'bathe': {
      if (state.bubble < 1) return { ok: false, error: TEXT.noBubble }
      const next = withRecovery({ ...base, bubble: state.bubble - 1 }, 'clean', BATHE_CLEAN)
      return succeed(next, now, 'bathe', 'bathing', TEXT.batheOk, 'good')
    }
    case 'play': {
      // 玩耍不消耗道具（specs/pet-economy：玩耍 MUST NOT 消耗道具），库存任意值都可用
      const next = { ...base, mood: clamp(state.mood + PLAY_MOOD, 0, 100) }
      return succeed(next, now, 'play', 'playing', TEXT.playOk, 'good')
    }
    case 'pet': {
      const lastPetAt = finiteOr(state.lastPetAt, 0)
      const elapsed = now - lastPetAt
      if (elapsed < PET_COOLDOWN_MS) {
        // 冷却内：仍播 petted + 气泡（D-16 的「摸过头啦，让鲸鱼娘歇口气～」，上游逐字），
        // 但**不加分、不推进冷却基准**（specs/pet-interaction：冷却以"上次计分点击"为基准）。
        // 增补 Q12 连带废止了原来那句带"剩余分钟数"的文案：用户可见文案 MUST NOT 含数字时间，
        // 所以这里不再计算剩余分钟（冷却早期与晚期同一句）。
        return succeed(base, now, 'pet', 'petted', TEXT.petCooling, 'bad')
      }
      const next = { ...base, lastPetAt: now, mood: clamp(state.mood + PET_MOOD, 0, 100) }
      return succeed(next, now, 'pet', 'petted', TEXT.petOk, 'good')
    }
    default:
      // 防御：KINDS 与 switch 分支脱节时也不能静默成功（宁可拒绝也不改数值）
      return { ok: false, error: TEXT.unknownKind(String(kind)) }
  }
}

/**
 * 消息桥的入口侧纯逻辑（design D-3：PetStateView 形状 + 长轮询订阅语义）。
 *
 * `createSubscribeHub` 是长轮询的 pending 队列：hold（挂起）/ wake（状态变化唤醒）/
 * timeout（25s 到期回相同 rev）/ drain（窗体销毁或扩展停用时丢弃）。
 * 定时器函数可注入（setTimer/clearTimer）——测试用假定时器同步驱动，不用等真 25 秒；
 * 入口用默认的全局 setTimeout/clearTimeout（渲染进程可用；宿主 timer API 只适合业务节拍，
 * 订阅超时是毫秒级精度需求，且 cleanup 时 hub.drain 会清掉全部未决定时器，不泄漏句柄）。
 */
import { SUBSCRIBE_HOLD_MS } from './constants.js'
import { levelOf } from './growth.js'
import { animOf, isSelfTransient, resolveStatus } from './mapping.js'

/**
 * 长轮询订阅队列。
 * - hold(makeReply)：挂起一个订阅，resolve 时机 = wake() / 超时 / drain()；
 *   makeReply 在 resolve 时刻才调用 ⇒ 拿到的是**当时**的 state 与 rev（wake 前先 rev+1，D-8）；
 * - 超时回相同 rev：页面不重绘、只重订阅（design D-3）；
 * - drain(reply)：窗体销毁/停用 ⇒ 丢弃全部 pending（D-8"销毁优先"），以给定 reply 落定，
 *   promise 不悬空（宿主侧 60s 超时兜底也就不会触发）。
 */
export function createSubscribeHub(options = {}) {
  const holdMs = options.holdMs ?? SUBSCRIBE_HOLD_MS
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((t) => clearTimeout(t))

  const pending = new Set()

  function finish(entry, reply) {
    if (entry.settled) return
    entry.settled = true
    clearTimer(entry.timer)
    pending.delete(entry)
    entry.resolve(reply)
  }

  return {
    /** 当前挂起的订阅数（测试与诊断用） */
    size() {
      return pending.size
    },
    hold(makeReply) {
      return new Promise((resolve) => {
        const entry = { resolve, makeReply, settled: false, timer: null }
        entry.timer = setTimer(() => finish(entry, makeReply()), holdMs)
        pending.add(entry)
      })
    },
    /** 状态已落定且 rev 已 +1 后调用：全部 pending 以最新状态返回 */
    wake() {
      for (const entry of [...pending]) finish(entry, entry.makeReply())
    },
    /** 丢弃全部 pending（窗体销毁 / cleanup），以给定 reply 落定 */
    drain(reply) {
      for (const entry of [...pending]) finish(entry, reply)
    }
  }
}

/**
 * 构建 PetStateView（design D-3 的跨卡契约形状，**v2** 起：
 * `{ items:{fish,bubble}, values:{growth,favor,level,levelName},
 *    anim:{row,label,status,self}, bubble:{text,tone,until}|null }`）。
 *
 * 口径：
 * - **`values` 是 v2 新增的四个字段**（specs/pet-values R1/R2/R3）：
 *   - `growth`：成长值（非负整数，只增不减，不驱动任何功能）；
 *   - `favor`：好感值（非负整数、**无上限**，满级后继续累加）；
 *   - `level`：好感等级 1..10（`levelOf(favor).level`，**唯一**的等级来源）；
 *   - `levelName`：等级中文名（面板那一行只读文字，specs/pet-interaction R2）。
 *   等级**由好感决定**，与成长值无关（v1 的 `rankOf(growth)` 已随本 change 删除，见 lib/growth.js）。
 * - **v1 的 `vitals:{hunger,clean,mood}` 已删除**（specs/pet-vitals 的 4 条 REMOVED / design D-10）：
 *   三属性体系整体退役，页面不再拿它做"属性过低"的本地兜底判定，随机表演也没有需要让位的负面状态。
 * - `items` 沿用 v1（道具数量，非负整数、各钳 20）。
 * - `anim.row` = 图集行号、`anim.label` = 中文状态名、`anim.status` = 机器可读英文 key
 *   （`resolveStatus` 的返回值，恒为 `STATUS_TRACK` 的键之一；v2 只剩 `idle` 与七条瞬时轨——
 *   v1 的 `sleep`/`hungry`/`dirty`/`sad` 与打盹的 1.5× 慢放一并已删除，design D-10）。
 * - **`anim.self`（卡 19 · 热修 D-1）= 当前 transient 是不是入口自发写的随机表演**
 *   （`state.transientSelf`，无 transient / 已到期 / 拖动中折成 idle 时一律 false）。
 *   页面靠它决定"本地一轮播完是否折回呼吸 idle"：自发表演要折，真实互动不折。
 *   **为什么必须保留这个来源标记而不能靠状态字符串**：随机集的
 *   `eating`/`bathing`/`petted`/`playing` 与用户点喂食/洗澡/摸头/玩耍写进 transient 的
 *   状态字符串完全相同，页面只拿到字符串 ⇒ 任何"状态 ∈ 某集合"的判据都无法区分两者。
 *   与 anim 的其它字段一样，本字段**永不为 undefined**（false 是明确语义）。
 * - `bubble` 只带**未过期**的（`until > now`），过期即 null——**时长语义由入口负责**：
 *   写气泡时排一次性 `pet-bubble`（4000ms，`BUBBLE_MS`），到期由入口清 `state.speech` 并 `rev++`
 *   推送（specs/pet-interaction 的"气泡 4 秒后消失"；页面按 `until` 自行淡出只是视觉过渡，
 *   权威的"有没有气泡"仍由入口的 `until > now` 判定，两处口径逐字一致）。
 * - `opts.dragging`（design D-13 的互斥）：拖动期间把**入口自发**的表演轨（`transientSelf === true`）
 *   折成 `idle`、并且不发气泡——被拎起来的东西不该"自己跑"或"冒气泡"，松手后按当时条件重新判定
 *   （specs/pet-window 的"拖动中不踱步"scenario）。用户**点出来**的互动动画不折：
 *   那是他刚下的指令，吞掉它等于"点了没反应"（`transientSelf === false`，逐字区分）。
 */
export function buildView(state, now, opts = {}) {
  const dragging = !!(opts && opts.dragging === true)
  // 这一轮是不是入口自发写的（判据只看 state，两处用途共用它）
  const selfTransient = isSelfTransient(state, now)
  let status = resolveStatus(state, now)
  // 拖动中把自发表演折掉（"被拎起来的东西不该自己跑"）；用户点出来的互动不折（selfTransient=false）
  if (dragging && selfTransient) status = 'idle'
  // 折成 idle 之后 `self` 如实报 false：视图此刻显示的就是 idle，页面据此收掉本地那一轮
  // （报 true 会让页面拿 idle 去起一轮自发表演，锁存位留下脏状态）
  const self = !dragging && selfTransient
  const favor = state.favor
  const { level, name } = levelOf(favor)
  const speech = state.speech
  const bubble =
    !dragging &&
    speech &&
    typeof speech === 'object' &&
    typeof speech.text === 'string' &&
    finiteUntil(speech, now)
      ? { text: speech.text, tone: speech.tone === 'bad' ? 'bad' : 'good', until: speech.until }
      : null
  return {
    items: { fish: state.fish, bubble: state.bubble },
    values: { growth: state.growth, favor, level, levelName: name },
    anim: { ...animOf(status), self },
    bubble
  }
}

function finiteUntil(speech, now) {
  return typeof speech.until === 'number' && Number.isFinite(speech.until) && speech.until > now
}

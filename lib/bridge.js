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
import { rankOf } from './growth.js'
import { animOf, isSelfTransient, resolveStatus } from './mapping.js'

/**
 * 长轮询订阅队列。
 * - hold(makeReply)：挂起一个订阅，resolve 时机 = wake() / 超时 / drain()；
 *   makeReply 在 resolve 时刻才调用 ⇒ 拿到的是**当时**的 state 与 rev（wake 前先 rev+1，D-8）；
 * - 超时回相同 rev：页面不重绘、只重订阅（design D-3）；
 * - drain(reply)：窗体销毁/停用 ⇒ 丢弃全部 pending（D-8"销毁优先"），以给定 reply 落定，
 *    promise 不悬空（宿主侧 60s 超时兜底也就不会触发）。
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
 * 构建 PetStateView（design D-3 的跨卡契约形状；anim 经卡 12/裁定 R14 增补 status、
 * 卡 19 增补 self）：
 * { vitals:{hunger,clean,mood}, items:{fish,bubble}, growth:{value,rank,rankName},
 *   anim:{row,label,status,self}, bubble:{text,tone,until}|null }
 *
 * 口径：
 * - vitals 传**未取整真值**（浮点）：页面显示向下取整、条宽用真值比例（specs/pet-settings 显示口径）。
 *   注意 Q13 之后**面板不再渲染三属性**，但本字段仍是契约的一部分——页面的 `decideAnimation`
 *   要用它做"属性过低"的本地兜底判定（app/lib/anim.ts），宿主设置页进度条也靠同一批真值；
 * - growth.value 同为浮点真值，rank/rankName 按 D-7 阈值算好随发（页面有兜底但入口是权威）；
 * - anim.row = 图集行号、anim.label = 中文状态名（卡 07/08 契约）、
 *   anim.status = 机器可读英文 key（resolveStatus 的返回值，恒为 STATUS_TRACK 键之一；
 *   页面靠它辨识 sleep——与 idle 同 row 0，慢放 ×1.5 与 Zzz 气泡全凭它，卡 12 契约；
 *   卡 15 起也可能是 `trot`、卡 18 起还有 `run-left`/`run-right`）；
 * - **anim.self（卡 19 · 热修 D-1）= 当前 transient 是不是入口自发写的随机表演**
 *   （`state.transientSelf`，无 transient / 已到期 / 拖动中折成 idle 时一律 false）。
 *   页面靠它决定"本地一轮播完是否折回呼吸 idle"：自发表演要折（否则入口的
 *   `animStatus='eating'` 会一直渲染下去——实机停留 5/10/15s、连成一片 24.98s），
 *   真实互动不折（那是用户刚下的指令，必须播满一轮）。
 *   **为什么必须新增这个来源标记而不能靠状态字符串**：随机集的
 *   `eating`/`bathing`/`petted`/`playing` 与用户点喂食/洗澡/摸头/玩耍写进 transient 的
 *   状态字符串完全相同（两边都是 `'eating'` 这样一条），页面只拿到字符串 ⇒ 任何
 *   "状态 ∈ 某集合"的判据都无法区分两者（卡 18 的 isSelfBurst 只认三条同构轨，正是 D-1 的根因）。
 *   与 anim 的其它字段一样，本字段**永不为 undefined**（false 是明确语义："这一轮不是自发表演"）；
 * - bubble 只带未过期的（until > now），过期即 null（页面按 until 自行淡出，入口不续尸）。
 *
 * 卡 17（Q15=B）：卡 15 增补的顶层 `hidden` 已随隐藏功能整条移除，视图**不再有**该键。
 *
 * `opts.dragging`（design D-13 的互斥）：拖动期间把 `sleep` 与**入口自发**的表演轨
 * （`transientSelf === true` 的那一轮）一律折成 `idle`、并且不发气泡——被拎起来的东西不该
 * "睡着"或"自己跑"，松手后按当时的 lastInteractAt 与条件重新判定
 * （specs/pet-window 的"拖动中不踱步不入睡"scenario）。用户**点出来**的互动动画不折：
 * 那是他刚下的指令，吞掉它等于"点了没反应"（`transientSelf === false`，逐字区分）。入口只在拖动窗口期传 true。
 */
export function buildView(state, now, opts = {}) {
  const dragging = !!(opts && opts.dragging === true)
  // 这一轮是不是入口自发写的（判据只看 state，两处用途共用它）
  const selfTransient = isSelfTransient(state, now)
  let status = resolveStatus(state, now)
  // 拖动中把自发表演折掉（"被拎起来的东西不该自己跑"）；用户点出来的互动不折（selfTransient=false）
  if (dragging && (status === 'sleep' || selfTransient)) status = 'idle'
  // 折成 idle 之后 `self` 如实报 false：视图此刻显示的就是 idle，页面据此收掉本地那一轮
  // （报 true 会让页面拿 idle 去起一轮自发表演，锁存位留下脏状态）
  const self = !dragging && selfTransient
  const { rank, rankName } = rankOf(state.growth)
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
    vitals: { hunger: state.hunger, clean: state.clean, mood: state.mood },
    items: { fish: state.fish, bubble: state.bubble },
    growth: { value: state.growth, rank, rankName },
    anim: { ...animOf(status), self },
    bubble
  }
}

function finiteUntil(speech, now) {
  return typeof speech.until === 'number' && Number.isFinite(speech.until) && speech.until > now
}

/**
 * 帧时钟：用 `requestAnimationFrame` 驱动，但**按当前帧声明的时长**推进（逐帧不等间隔）。
 *
 * 为什么不用 CSS `steps()` 动画或 `setInterval`：`tracks` 的 durations 是逐帧不同的
 * （`idle` = 400/400/500/400/400/500ms，specs/pet-sprites 的"帧时长取自 tracks"scenario），
 * 等间隔的步进函数和定时器都表达不了；rAF 累加时间戳才能一帧一个时长地走。
 *
 * 为什么必须能被 `stop()`：specs/pet-sprites 要求"帧动画在窗体销毁时停止（rAF / 帧定时器 MUST 被清理）"，
 * `pet-window` 又把"关窗即停动画循环、CPU 回落"写成 scenario ⇒ 停止路径必须显式 `cancelAnimationFrame`，
 * 不能指望文档销毁时浏览器顺手回收。
 */

/** 一次 tick 内最多推进多少帧：durations 被脏数据打成极小值时不至于把主线程占满 */
const MAX_FRAMES_PER_TICK = 8
/** 时间回补上限：卡顿/切回前台时不要把积压的时间一次性放完（否则精灵会瞬间快进好几帧） */
const MAX_CATCHUP_MS = 250

export interface FrameClockHandlers {
  /** 每帧回调，参数是**本行内**的列号（0 起） */
  onFrame: (index: number) => void
  /** 一轮播完（回到第 0 帧之前）回调：瞬时互动据此回落（D-4"播完一轮"） */
  onCycleEnd?: () => void
}

export class FrameClock {
  private readonly handlers: FrameClockHandlers
  private rafId = 0
  /** 是否已 start（stop 之后为 false，resume 不会再起来） */
  private active = false
  /** 页面不可见时为 true：rAF 已取消，恢复时不补放积压的帧 */
  private paused = false
  private lastTs = 0
  private acc = 0
  private index = 0
  private count = 1
  private durations: number[] = [250]

  constructor(handlers: FrameClockHandlers) {
    this.handlers = handlers
  }

  /** 当前帧的时长；durations 比帧数短时按声明长度取模（防御，上游是一一对应的） */
  private durationAt(index: number): number {
    const list = this.durations
    if (list.length === 0) return 250
    const i = ((index % list.length) + list.length) % list.length
    const value = list[i]
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 250
  }

  /**
   * 换轨：帧数与逐帧时长一起换，并从第 0 帧重开。
   * 立刻回调一次 `onFrame(0)`——否则换轨后要等一个旧时长才刷新，看起来像"卡了一帧"。
   */
  setFrames(count: number, durations: number[]): void {
    this.count = Number.isFinite(count) && count >= 1 ? Math.floor(count) : 1
    this.durations = Array.isArray(durations) && durations.length > 0 ? durations.slice() : [250]
    this.index = 0
    this.acc = 0
    this.handlers.onFrame(0)
  }

  start(): void {
    this.active = true
    this.paused = false
    this.lastTs = 0
    this.ensureRaf()
  }

  /** 销毁即停帧循环：取消 rAF 并归零状态（幂等，可重复调用） */
  stop(): void {
    this.active = false
    this.paused = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.lastTs = 0
    this.acc = 0
  }

  /** 页面不可见（visibilitychange → hidden）：停 rAF 省 CPU，但保持"已启动"语义 */
  pause(): void {
    if (!this.active) return
    this.paused = true
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    // 归零时间戳：恢复时不会把页面不可见期间的时长算成一大笔 dt
    this.lastTs = 0
  }

  /** 页面重新可见：从当前帧继续（不补放页面不可见期间"欠"的帧） */
  resume(): void {
    if (!this.active || !this.paused) return
    this.paused = false
    this.lastTs = 0
    this.ensureRaf()
  }

  private ensureRaf(): void {
    if (this.rafId) return
    if (typeof requestAnimationFrame !== 'function') return
    this.rafId = requestAnimationFrame(this.tick)
  }

  private tick = (ts: number): void => {
    this.rafId = 0
    if (!this.active || this.paused) return
    if (this.lastTs === 0) this.lastTs = ts
    let dt = ts - this.lastTs
    this.lastTs = ts
    if (!Number.isFinite(dt) || dt < 0) dt = 0
    if (dt > MAX_CATCHUP_MS) dt = MAX_CATCHUP_MS
    this.acc += dt

    let guard = 0
    while (this.acc >= this.durationAt(this.index) && guard < MAX_FRAMES_PER_TICK) {
      guard++
      this.acc -= this.durationAt(this.index)
      this.index++
      if (this.index >= this.count) {
        this.index = 0
        // 回调里可能换轨（瞬时互动播完回落），所以先通知再取新轨的第 0 帧
        this.handlers.onCycleEnd?.()
      }
      this.handlers.onFrame(this.index)
    }
    this.ensureRaf()
  }
}

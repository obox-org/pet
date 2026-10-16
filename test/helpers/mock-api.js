/**
 * 共享 mock api（范式照 docs/extension-api/guides-user.md:272-299：只实现入口用到的成员，
 * 并捕获注册结果供断言）。任务卡验收 ③ 要求 mock 里含：
 * overlay:{create,destroy,setMouseThrough,setPosition}、timer、fs、settings、statusBar、app:{onMessage}。
 *
 * 与宿主真实行为的刻意对齐（防止测试假绿）：
 * - settings.set **同步通知** onChanged 订阅者（api-reference.md:312 setSetting 同步通知）；
 * - fs 失败**抛 Error**（api-reference.md:573），不是返回 {ok:false}；
 * - overlay 四方法失败**不抛错**、返回 {ok:false,error}（src/api/types.ts:206-247）；
 *   destroy 幂等（不存在的 id 静默成功）；同 id 重复 create 拒绝；
 * - **setPosition 逐字复刻宿主实现**（src/main/appWindow.ts:579-657，卡 14）：
 *   非法坐标（NaN/Infinity/非数字）**直接拒绝、不钳不猜**；合法数字按主显示器工作区
 *   `clampOverlayPosition` 钳位；成功回包带 **`position`（钳制后的实际坐标）**；
 * - **create 的成功回包也带 `position`**（父代理裁定 R31：= 宿主 `overlayPosition(...)` 算出的
 *   实际绝对坐标，`src/main/appWindow.ts:346-362`）。`opts.createWithoutPosition = true`
 *   可切回"R31 之前的老宿主形态"（只回 `{ok:true}`），用来覆盖入口的标定兜底路径；
 *   `opts.noPositionResult = true` 则让 **setPosition** 也不回传 position（畸形/老实现）；
 * - timer.setInterval/setTimeout(name, 秒, cb) 按秒收（api-reference.md:405-414,552-572），
 *   回调由测试手动触发（`rec.timers.get(name).cb()`）；
 * - 另带一组"禁止调用"间谍（registerCommand/app.register/views/i18n）：入口是后台扩展
 *   （design D-12），这些成员一旦被调用，测试能指认是哪条 demo 残留没删干净。
 *
 * 本文件在 test/ 下会被 node --test 当作空测试文件加载（Node 24 的发现规则），无测试即通过，无害。
 */

/** 推进微任务/宏任务队列：入口的 init 是 async 链（读档→设置→建窗→起 tick），flush 后断言 */
export async function flush(times = 16) {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

/** 假的主显示器工作区（不含任务栏）；测试可用 opts.workArea 换成小工作区来验钳位 */
export const DEFAULT_WORK_AREA = { x: 0, y: 0, width: 1920, height: 1040 }

/** 宿主 `clampOverlayPosition` 的同款公式（src/main/appWindow.ts:579-594）：钳窗体**左上角** */
export function clampToWorkArea(wa, width, height, x, y) {
  const minX = wa.x
  const maxX = Math.max(wa.x + wa.width - width, minX)
  const minY = wa.y
  const maxY = Math.max(wa.y + wa.height - height, minY)
  return { x: Math.min(Math.max(x, minX), maxX), y: Math.min(Math.max(y, minY), maxY) }
}

/** 宿主 `overlayPosition` 的同款公式（src/main/appWindow.ts:346-362）：anchor → 窗体左上角 */
export function anchorPosition(wa, options) {
  const margin = typeof options.margin === 'number' ? options.margin : 0
  const right = options.anchor === 'bottom-right' || options.anchor === 'top-right'
  const bottom = options.anchor === 'bottom-right' || options.anchor === 'bottom-left'
  return {
    x: right ? wa.x + wa.width - options.width - margin : wa.x + margin,
    y: bottom ? wa.y + wa.height - options.height - margin : wa.y + margin
  }
}

export function makeApi(opts = {}) {
  const workArea = opts.workArea || DEFAULT_WORK_AREA
  const rec = {
    overlays: new Map(), // id → create options（存活中的 overlay）
    positions: new Map(), // id → 当前实际坐标（= 宿主 win.getBounds() 的左上角，钳后）
    overlayLog: [], // ['create'|'destroy'|'setMouseThrough'|'setPosition', ...args]（按调用顺序）
    timers: new Map(), // name → { seconds, cb }
    timerLog: [],
    settings: new Map(Object.entries(opts.settings || {})),
    settingsLog: [], // [key, value]（按写入顺序）
    settingsListeners: new Set(),
    fs: new Map(Object.entries(opts.files || {})), // 相对路径 → 文本内容
    fsLog: [], // [op, path]
    statusTexts: new Map(),
    messageHandler: null,
    disposedLog: [],
    forbidden: [] // demo 残留探测：被调用的禁止成员名
  }

  /** opts.failCreate / opts.failWrite / opts.failSetPosition 支持函数形式（测试中途切换故障注入） */
  function failCreate() {
    return typeof opts.failCreate === 'function' ? opts.failCreate() : opts.failCreate
  }
  function failWrite() {
    return typeof opts.failWrite === 'function' ? opts.failWrite() : opts.failWrite
  }
  function failSetPosition() {
    return typeof opts.failSetPosition === 'function' ? opts.failSetPosition() : opts.failSetPosition
  }

  const api = {
    overlay: {
      async create(options) {
        rec.overlayLog.push(['create', options])
        // opts.gateCreate：让 create 停在门口（测试"create 进行中停用"的竞态）
        if (opts.gateCreate) await opts.gateCreate()
        const err = failCreate()
        if (err) return { ok: false, error: err }
        if (rec.overlays.has(options.id)) return { ok: false, error: 'overlay 已存在: ' + options.id }
        rec.overlays.set(options.id, options)
        const position = anchorPosition(workArea, options)
        rec.positions.set(options.id, position)
        // R31：成功回包带实际坐标；opts.createWithoutPosition 切回老宿主形态（入口走标定兜底）
        return opts.createWithoutPosition ? { ok: true } : { ok: true, position }
      },
      async destroy(id) {
        rec.overlayLog.push(['destroy', id])
        rec.overlays.delete(id) // 幂等：不存在也静默成功（宿主契约）
        rec.positions.delete(id)
        return { ok: true }
      },
      async setMouseThrough(id, through) {
        rec.overlayLog.push(['setMouseThrough', id, through])
        if (!rec.overlays.has(id)) return { ok: false, error: 'overlay 不存在: ' + id }
        return { ok: true }
      },
      async setPosition(id, x, y) {
        rec.overlayLog.push(['setPosition', id, x, y])
        if (typeof id !== 'string' || !id.trim()) {
          return { ok: false, error: 'setPosition 参数错误：overlay id 必须是非空字符串' }
        }
        // 宿主逐字口径：非法坐标**直接拒绝、不钳不猜**（src/main/appWindow.ts:611-623）
        for (const [name, value] of [
          ['x', x],
          ['y', y]
        ]) {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return {
              ok: false,
              error: `setPosition 参数错误：${name} 必须是有限数字（NaN/Infinity/非数字一律拒绝，不钳不猜），收到 ${String(value)}`
            }
          }
        }
        const entry = rec.overlays.get(id)
        if (!entry) return { ok: false, error: `overlay 不存在（或已销毁）：${id}` }
        if (opts.gateSetPosition) await opts.gateSetPosition()
        const err = failSetPosition()
        if (err) return { ok: false, error: err }
        const clamped = clampToWorkArea(workArea, entry.width, entry.height, x, y)
        rec.positions.set(id, clamped)
        // opts.noPositionResult：模拟"R31 之前的实现/畸形回包"⇒ 入口应以自记值为准并 warn 一次
        return opts.noPositionResult ? { ok: true } : { ok: true, position: clamped }
      }
    },
    timer: {
      setInterval(name, seconds, cb) {
        rec.timers.set(name, { seconds, cb })
        rec.timerLog.push(['setInterval', name, seconds])
      },
      clearInterval(name) {
        rec.timers.delete(name)
        rec.timerLog.push(['clearInterval', name])
      },
      setTimeout(name, seconds, cb) {
        rec.timers.set(name, { seconds, cb })
        rec.timerLog.push(['setTimeout', name, seconds])
      },
      clearTimeout(name) {
        rec.timers.delete(name)
        rec.timerLog.push(['clearTimeout', name])
      }
    },
    fs: {
      async writeFile(path, content) {
        rec.fsLog.push(['writeFile', path])
        const err = failWrite()
        if (err) throw new Error(err)
        rec.fs.set(path, content)
      },
      async readFile(path) {
        rec.fsLog.push(['readFile', path])
        if (!rec.fs.has(path)) throw new Error('ENOENT: ' + path)
        return rec.fs.get(path)
      },
      async exists(path) {
        rec.fsLog.push(['exists', path])
        return rec.fs.has(path)
      }
    },
    settings: {
      get(key, fallback) {
        return rec.settings.has(key) ? rec.settings.get(key) : fallback
      },
      set(key, value) {
        rec.settings.set(key, value)
        rec.settingsLog.push([key, value])
        for (const listener of [...rec.settingsListeners]) listener(key) // 宿主：setSetting 同步通知
      },
      onChanged(cb) {
        rec.settingsListeners.add(cb)
        return {
          dispose: () => {
            rec.settingsListeners.delete(cb)
            rec.disposedLog.push('settings.onChanged')
          }
        }
      }
    },
    statusBar: {
      setText(id, text) {
        rec.statusTexts.set(id, text)
      }
    },
    app: {
      onMessage(handler) {
        rec.messageHandler = handler
        return {
          dispose: () => {
            rec.messageHandler = null
            rec.disposedLog.push('app.onMessage')
          }
        }
      },
      // ————— 以下为"禁止调用"间谍（后台扩展不得注册卡片，design D-12） —————
      register() {
        rec.forbidden.push('app.register')
        return { dispose: () => {} }
      }
    },
    registerCommand() {
      rec.forbidden.push('registerCommand')
      return { dispose: () => {} }
    },
    views: {
      registerTreeProvider() {
        rec.forbidden.push('views.registerTreeProvider')
        return { dispose: () => {} }
      }
    },
    i18n: {
      t(key) {
        rec.forbidden.push('i18n.t')
        return key
      }
    }
  }

  /** 给测试用的便捷发送器：模拟页面经消息桥发一条请求（返回 handler 的业务回包） */
  rec.send = (channel, payload) => {
    if (!rec.messageHandler) throw new Error('入口尚未注册消息处理器')
    return rec.messageHandler(channel, payload)
  }
  /** 手动触发结算 tick（timer 回调无 payload，"到点了"语义，api-reference.md:417） */
  rec.tick = () => {
    const t = rec.timers.get('pet-tick')
    if (!t) throw new Error('pet-tick 定时器未注册')
    t.cb()
  }

  return { api, rec }
}

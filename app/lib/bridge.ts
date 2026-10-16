/**
 * 子窗口 ↔ 扩展入口的消息桥（页面侧实现）。
 *
 * 协议逐字来自 docs/extension-api/guides-user.md:131-143：
 * - 页面 → 宿主：`{ source:'obox-app', action:'obox-extension', appId, channel, payload, requestId }`
 * - 宿主 → 页面：`{ source:'obox-app', action:'obox-extension-reply', requestId, result }`
 * - `result` = `{ ok:true, data }` 或 `{ ok:false, error }`
 *
 * `data` 才是入口 handler 的返回值（src/renderer/src/core/host.ts:790-791、
 * docs/extension-api/api-reference.md:203-214）⇒ 业务字段一律从 `result.data` 里取，
 * 别把外层 `result` 当成 handler 的返回值（那是两层信封）。
 *
 * 为什么 `appId` 从查询串读而不写死：宠物是**后台扩展、没有 App 卡片**，而宿主既有桥是按卡片 id
 * 找 handler 的；overlay 窗体由宿主按 overlayId 路由，查询串里的 `appId` 与 `overlayId` 同值
 * （design D-1 的 `pet.overlay`）。页面只把读到的值原样回填，写死卡片 id 等于假设了一张并不存在的卡片。
 *
 * `requestId` 必须由页面自己生成并在 reply 里比对（guides-user.md:142）：主进程另有一层内部
 * requestId，两者不通用，混用会把别人的回包当成自己的。
 */

/** 桥回包的外层信封（宿主拼的，见 guides-user.md:137） */
export interface BridgeResult {
  ok: boolean
  data?: unknown
  error?: string
}

export interface Bridge {
  /** 发一次请求并等回包；本地超时也只 resolve（`ok:false`），从不 reject，调用方无需 try/catch */
  request(channel: string, payload?: unknown, timeoutMs?: number): Promise<BridgeResult>
  /** 卸载时移除监听并回收所有未决请求（避免窗体销毁后定时器残留） */
  dispose(): void
}

/** 查询串里读不到 appId 时的兜底：overlayId 的约定值（design D-1） */
export const FALLBACK_APP_ID = 'pet.overlay'

/** 一次性请求的本地超时。宿主的桥是 60s（guides-user.md:143），这里取更短以便尽早重试 */
export const REQUEST_TIMEOUT_MS = 15_000

/**
 * 订阅请求的本地超时 = 入口 hold 的 25s + 10s 余量。
 *
 * **25s 必须小于宿主的 60s 请求超时**（design D-3）：长轮询要在宿主判超时之前由入口自己回包，
 * 否则页面拿到的是"扩展未响应（超时）"这条错误而不是正常状态，同步会退化成每分钟一次的报错重试。
 * 页面侧再留 10s 余量，是为了区分"入口正常 hold"与"回包在半路丢了"。
 */
export const SUBSCRIBE_TIMEOUT_MS = 35_000

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function textOf(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : ''
}

/**
 * 读 overlay 窗体 URL 上的 `appId`。
 * 查询串由宿主在创建 overlay 时拼上（`obox-window=overlay&extId=pet&overlayId=pet.overlay&appId=pet.overlay`）；
 * 万一宿主只把查询串挂在窗体 URL 而没透传到页面，这里退回同一个约定值，功能不受影响。
 */
export function readAppId(search: string = window.location.search): string {
  try {
    const query = new URLSearchParams(search)
    const fromQuery = textOf(query.get('appId')) || textOf(query.get('overlayId'))
    if (fromQuery) return fromQuery
  } catch {
    // 查询串畸形（极少见）不影响启动，走兜底常量
  }
  return FALLBACK_APP_ID
}

/** 拆两层信封：外层 `ok` 只代表"桥走通了"，内层是入口 handler 自己的 `{ ok, ... }` */
export function unwrap(result: BridgeResult): {
  ok: boolean
  data?: Record<string, unknown>
  error?: string
} {
  if (!isRecord(result) || result.ok !== true) {
    const error = isRecord(result) ? textOf(result.error) : ''
    return { ok: false, error: error || '扩展未返回数据' }
  }
  const data = isRecord(result.data) ? result.data : undefined
  // design D-3 的道具不足分支：handler 返回 `{ ok:false, error:'没有小鱼干了…' }`
  if (data && data.ok === false) {
    return { ok: false, data, error: textOf(data.error) || '扩展拒绝了这次请求' }
  }
  return { ok: true, data }
}

/**
 * 建桥。一个页面只应建一座（`dispose` 后不要复用）。
 * 为什么监听挂在 `window` 而不是 `parent`：页面自己就是 iframe 里的文档，回包由父文档
 * `postMessage` 到 `e.source`（src/renderer/src/AppWindow.vue:126-136），落在本页 `window` 上。
 */
export function createBridge(appId: string): Bridge {
  const pending = new Map<string, { resolve: (r: BridgeResult) => void; timer: number }>()
  let seq = 0
  let disposed = false
  // 页面可能不在 iframe 里（开发期直接开产物页）；此时没有 parent，不做来源校验
  const framed = typeof window.parent !== 'undefined' && window.parent !== window

  function settle(requestId: string, result: BridgeResult): void {
    const item = pending.get(requestId)
    if (!item) return
    pending.delete(requestId)
    window.clearTimeout(item.timer)
    item.resolve(result)
  }

  function onMessage(event: MessageEvent): void {
    const data = event.data as
      | { source?: string; action?: string; requestId?: unknown; result?: unknown }
      | null
    if (!isRecord(data) || data.source !== 'obox-app') return
    if (data.action !== 'obox-extension-reply') return
    // 只认自己发出去的 requestId：桥是共享通道，别的来源的消息不能污染状态
    if (framed && event.source !== window.parent) return
    const requestId = textOf(data.requestId)
    if (!requestId) return
    settle(requestId, (data.result as BridgeResult) ?? { ok: false, error: '回包为空' })
  }

  window.addEventListener('message', onMessage)

  return {
    request(channel: string, payload?: unknown, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<BridgeResult> {
      if (disposed) return Promise.resolve({ ok: false, error: '消息桥已关闭' })
      const requestId = 'pet-req-' + ++seq + '-' + Date.now().toString(36)
      return new Promise<BridgeResult>((resolve) => {
        const timer = window.setTimeout(() => {
          settle(requestId, { ok: false, error: '扩展未响应（页面侧超时）' })
        }, timeoutMs)
        pending.set(requestId, { resolve, timer })
        window.parent.postMessage(
          { source: 'obox-app', action: 'obox-extension', appId, channel, payload, requestId },
          '*'
        )
      })
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      window.removeEventListener('message', onMessage)
      for (const requestId of [...pending.keys()]) {
        settle(requestId, { ok: false, error: '页面卸载' })
      }
    }
  }
}

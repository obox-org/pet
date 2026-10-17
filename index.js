/**
 * pet 桌面宠物扩展入口（**纯 ESM JavaScript，运行时零依赖，顶层零副作用**）。
 *
 * 为什么顶层零副作用：App 子窗口/overlay 窗体也会重跑入口模块的顶层代码
 * （docs/extension-api/api-reference.md:27 —— 子窗口只跳过"激活"，阶段一的 import 照常执行），
 * 所以连 IPC、写盘、定时器、监听、注册**全部在插件函数内**；模块顶层只有 import 与一个
 * default 导出（node --test 可直接 import 本文件做零副作用断言）。
 *
 * 结构：本文件只做**接线**（api 调用、生命周期、并发次序），全部业务数值逻辑在 lib/*.js
 * 纯函数里（不碰 api，可被 node --test 直接覆盖）——这是任务卡 07 的"纯函数状态机"要求。
 *
 * 停用时宿主执行下方返回的 cleanup（api-reference.md:30）：销毁 overlay、清 timer、
 * dispose 消息处理器与设置订阅、丢弃 pending 长轮询（design D-8"重复激活"由此成立：
 * 先 cleanup 再重新激活不会双份注册）。
 */
import { buildView, createSubscribeHub } from './lib/bridge.js'
import {
  CHANNELS,
  DRAG_PHASES,
  FILE_BAD,
  FILE_MAIN,
  FILE_TMP,
  KEY_CLEAN,
  KEY_DIAGNOSTIC,
  KEY_HUNGER,
  KEY_MOOD,
  KEY_VISIBLE,
  OVERLAY_HEIGHT,
  OVERLAY_ID,
  OVERLAY_MARGIN,
  OVERLAY_WIDTH,
  PERSIST_MIN_INTERVAL_MS,
  POSITION_PROBE,
  RANDOM_PERF_EVERY_SEC,
  RANDOM_PERF_SET,
  RANDOM_PERF_TIMER_ID,
  STATUSBAR_ID,
  STATUSBAR_IDLE,
  SUBSCRIBE_HOLD_MS,
  TEXT,
  TICK_ID,
  TICK_SECONDS,
  TRANSIENT_MS,
  TRANSIENT_TIMER_ID
} from './lib/constants.js'
import { interact } from './lib/interact.js'
import { isTransient, resolveStatus, transientDelaySeconds, transientExpired } from './lib/mapping.js'
import { deserialize, sanitizePosition, serialize } from './lib/persist.js'
import { initialState, settle, startupReset } from './lib/settle.js'

/** 错误对象 → 可日志化文本（宿主抛的可能是任意值） */
function errMsg(err) {
  return err && err.message ? err.message : String(err)
}

/** 诊断位的"窗体创建失败"前缀（恢复后只清同类诊断，不误清保存失败的文案） */
const TEXT_CREATE_FAILED_PREFIX = TEXT.createFailedPrefix

export default function pet(api) {
  // ————— 路径：用 import.meta.url 推导，不硬编码 app://extensions/pet/ —————
  // 安装目录名是 <name>_<清洗后 author>（如 pet_chenzhi），与 manifest.name 不同；
  // 调试态又是 app://debug/<id>/（docs/extension-api/guides-user.md:79-88）。
  const base = new URL('.', import.meta.url).href
  const overlayUrl = new URL('./dist/index.html', base).href // 卡 08 的构建产物（vite outDir=dist）

  // ————— 运行时状态（全部在插件函数内，随 cleanup 一起消亡） —————
  let state = null // 权威 PetState（lib/persist.js 的形状）；null = 存档还没加载完
  let rev = 0 // 状态版本号：只在状态**落定后** +1（D-8），长轮询以它判断"有没有变化"
  let overlayAlive = false // overlay 窗体是否存在（决定挂机累计与交互受理）
  let throughNow = true // 当前鼠标穿透态；创建后默认穿透（宿主保证，src/api/types.ts:213-215）
  let disposed = false // cleanup 已执行：异步续体一律短路（停用与 init 并发时的护栏）
  /**
   * 诊断位当前内容。初值 **`undefined` = 未知**（卡 17 / D-1 修复的关键）：
   * `pet.diagnostic` 是**落在设置存储里的**键，会活过重启——新会话的内存里并不知道
   * 上一会话往这个键写过什么。若初值取 `null`（"看起来是干净的"），第一次 `setDiagnostic(null)`
   * 会被去重短路、什么都不写，于是上一会话的失败文案就永远留在设置页
   * （卡 16 实机缺陷 D-1：新实例窗体建好了，设置页还显示「宠物窗体创建失败：…」）。
   */
  let currentDiagnostic = undefined
  let lastPersistAt = 0 // 上次成功写盘时刻（节流用）
  let lastPersistSig = '' // 上次写盘时的"显示口径签名"（节流用）
  let persistInFlight = false // 写盘不并发叠加（慢盘时跳过本轮，下一 tick 补）
  let forceQueued = false // 在途写盘期间又来一次**强制**落盘 ⇒ 记欠账，写完补一次（见 persistState）
  // ————— 卡 15 新增的运行时状态（同样随 cleanup 一起消亡） —————
  let dragging = false // 拖动中（design D-13 互斥：抑制随机表演与 sleep 推进、不弹气泡）
  let positionReplyWarned = false // overlay 成功回包却没带 position（R31 之前的宿主）⇒ 只 warn 一次
  let noSetPositionWarned = false // 宿主根本没有 setPosition ⇒ 只 warn 一次（拖动降级为"不移动"）
  /**
   * 最近一次窗体创建是否失败（卡 17 / D-1 的判据之一）。
   * init 里用它决定"启动成功 ⇒ 复位诊断位"要不要做：本次启动**真的失败过**就把刚写下的
   * 「宠物窗体创建失败：…」留给用户排查，成功（含"设置里关掉了宠物、根本没建窗"）才复位。
   */
  let lastCreateFailed = false

  // 长轮询订阅队列（design D-3）：hold 25s < 宿主桥 60s 超时（理由见 lib/constants.js 注释）
  const hub = createSubscribeHub({ holdMs: SUBSCRIBE_HOLD_MS })

  // overlay 的创建/销毁串行化队列：toggle 连点时按到达顺序执行（销毁优先语义不被乱序破坏；
  // design R2 的"频繁 toggle 闪烁"由串行化兜底——不叠加创建，也不需要额外的去抖定时器）
  let overlayQueue = Promise.resolve()
  function enqueueOverlay(task) {
    const run = overlayQueue.then(task, task) // 前一任务成败都继续
    overlayQueue = run.then(noop, noop) // 队列链上不吃错误（task 内部已自行处理）
    return run
  }
  function noop() {}

  /**
   * 拖动请求的串行化队列（同一套写法）。
   *
   * 为什么必须串行：`pet.drag{phase:'move'}` 是高频短请求（页面按 rAF 合并，最多每帧一发），
   * 而"累加位置"是**读 state.position → 算目标 → 写回 state.position** 的读改写；
   * handler 里有 await，若并发交错，第二帧会读到第一帧还没写回的旧基准 ⇒ 增量互相覆盖、窗体少移动。
   * 排队后每一帧都基于上一帧落定的位置累加（R10 的"位置写盘单写者"同源要求）。
   * 注意它与 `pet.subscribe` 的长轮询**互不阻塞**：两者是独立请求，宿主桥按 requestId 分别路由。
   */
  let dragQueue = Promise.resolve()
  function enqueueDrag(task) {
    const run = dragQueue.then(task, task)
    dragQueue = run.then(noop, noop)
    return run
  }

  // ————— 诊断位（D-9：状态栏 + 设置页 status 字段同文案；恢复后清空） —————
  /**
   * 写诊断位（`pet.diagnostic` 设置键 + 状态栏同文案）。
   * `force`（卡 17 / D-1）：跳过"同文案去重"这一层——去重是拿**内存里的** `currentDiagnostic`
   * 比对的，而内存值在会话开始时并不知道设置存储里有没有上一会话留下的旧值，
   * 启动成功后的复位必须真的落盘（见 resetDiagnostic）。
   */
  function setDiagnostic(text, force = false) {
    if (!force && text === currentDiagnostic) return
    currentDiagnostic = text
    // 宿主拆除期（cleanup 与写盘竞态）settings/statusBar 调用可能异常：诊断位是锦上添花，
    // 绝不能反过来把扩展崩掉（D-9"不抛出、不影响宿主"）
    try {
      api.settings.set(KEY_DIAGNOSTIC, text === null ? '' : text)
      api.statusBar.setText(STATUSBAR_ID, text === null ? STATUSBAR_IDLE : text)
    } catch (err) {
      console.warn('[pet] 诊断位写入失败：' + errMsg(err))
    }
  }

  /** 只清除**同类**故障的诊断（保存成功不该抹掉"窗体创建失败"，反之亦然） */
  function clearDiagnosticIf(prefix) {
    if (typeof currentDiagnostic === 'string' && currentDiagnostic.startsWith(prefix)) {
      setDiagnostic(null)
    }
  }

  /**
   * 启动成功后的**无条件**诊断位复位（卡 17 修复实机缺陷 D-1）。
   *
   * 为什么必须"无条件"：`pet.diagnostic` 是落盘的设置键，上一会话写下的失败文案会活过重启；
   * 旧实现只清「本会话自己设过的」（`currentDiagnostic` 初值 null ⇒ 内存里"看起来已经干净"），
   * 于是新实例窗体明明建好了、设置页却一直显示上一会话的「宠物窗体创建失败：…」。
   * 触发时机（入口 init）：首次状态就绪、且**本次启动没有窗体创建失败**之后——此时"本次启动正常"
   * 已成事实，该键与状态栏都该回到常态；本次启动失败过（`lastCreateFailed`）则不调用，
   * 刚写下的失败诊断照常留在设置页供用户排查。
   */
  function resetDiagnostic() {
    setDiagnostic(null, true)
  }

  // ————— 设置同步（任务卡：每次结算/交互后把三属性写进设置键，供 progress 字段渲染） —————
  function syncVitalSettings() {
    if (!state) return
    // 写**未取整真值**（浮点，已钳 [0,100]）：宿主显示 {cur} = Math.floor(cur)、
    // 条宽用未取整比例 cur/100（specs/pet-settings 的显示口径）——取整是渲染层的事，
    // 入口若先取整，条宽与数字会不一致（validation N3 修复的正是这一点）。
    api.settings.set(KEY_HUNGER, state.hunger)
    api.settings.set(KEY_CLEAN, state.clean)
    api.settings.set(KEY_MOOD, state.mood)
  }

  // ————— 持久化（specs/pet-vitals 存档 requirement + design R7 写盘节流） —————
  /**
   * 节流签名：显示口径的整数值 + 整数型字段。签名不变且距上次写盘 <60s ⇒ 跳过
   * （浮点衰减每 tick 都在动，按原始值判"变化"节流就形同虚设——口径记录在 constants.js）。
   * 卡 15 起把 `position` 也纳入签名：拖动换位必须能触发写盘
   * （拖动结束另有**强制落盘**，这里是让"非强制路径"也不漏掉它，R10 的单写者口径）。
   * 卡 17：卡 15 一并纳入签名的 `hidden` 随隐藏功能移除（Q15=B）。
   */
  function persistSignature(s) {
    return [
      Math.floor(s.hunger),
      Math.floor(s.clean),
      Math.floor(s.mood),
      s.fish,
      s.bubble,
      Math.floor(s.growth),
      s.lastPetAt,
      s.position ? s.position.x + ',' + s.position.y : ''
    ].join('|')
  }

  async function persistState(now, force = false) {
    if (!state) return
    const sig = persistSignature(state)
    if (
      !force &&
      lastPersistAt !== 0 &&
      sig === lastPersistSig &&
      now - lastPersistAt < PERSIST_MIN_INTERVAL_MS
    ) {
      return // 节流：值（显示口径）没变且不到 60s
    }
    if (persistInFlight) {
      if (!force) return // 上一次写还没完成：跳过，下一 tick 自然补上
      // **强制**落盘（拖动结束 / cleanup）不能被"正在写"吞掉，否则 D-13 的
      // "松手持久化位置"在慢盘上会静默丢一次。记一笔欠账，等在途写盘落定后由 finally 补写一次
      // （补写时重新 serialize，拿到的是**当时**最新的状态，不会写回旧位置）。
      forceQueued = true
      return
    }
    persistInFlight = true
    const text = serialize(state)
    try {
      // 原子写**等价方案**：api.fs 没有 rename（api-reference.md:561-565 只有
      // write/read/readDir/exists/remove/watch），做不到 POSIX 式"tmp→rename"原子替换。
      // 取舍：写 state.json.tmp → 读回逐字节校验 → 覆盖写 state.json。
      // 崩溃点分析：①tmp 写坏/没写完 ⇒ 正式文件仍是旧值（好）；②校验不过 ⇒ 不落正式文件（好）；
      // ③覆盖写正式文件的瞬间断电 ⇒ 理论上可能半新文件，这条残余风险由读档侧的
      // "损坏 ⇒ 备份 state.json.bad + 初始值重建"兜底（D-9），不会静默丢用户存档。
      await api.fs.writeFile(FILE_TMP, text)
      const back = await api.fs.readFile(FILE_TMP)
      if (back !== text) throw new Error('tmp 读回校验不一致')
      await api.fs.writeFile(FILE_MAIN, text)
      lastPersistAt = now
      lastPersistSig = sig
      clearDiagnosticIf(TEXT.saveFailed) // 写成功 ⇒ 清"宠物状态未能保存"（D-9：下一次 tick 重试成功即恢复）
    } catch (err) {
      console.warn('[pet] 存档写入失败：' + errMsg(err))
      setDiagnostic(TEXT.saveFailed) // 状态栏 + 诊断位（D-9）；内存值继续运行，下一 tick 重试
    } finally {
      persistInFlight = false
      if (forceQueued) {
        forceQueued = false
        void persistState(Date.now(), true) // 补写被"在途写盘"挡掉的那一次强制落盘
      }
    }
  }

  /**
   * 读档（specs/pet-vitals"状态存档"requirement + D-9）：
   * - 文件不存在 ⇒ 初始值（空态，D-8：三属性 100、成长 0、库存 3/3），不算错误；
   * - JSON 解析失败 / schemaVersion 不受支持 ⇒ 先备份 state.json.bad（MUST NOT 静默丢弃），
   *   再按初始值重建，并 console.warn 固定文案；
   * - IO 层读失败 ⇒ 拿不到原文，无物可备份，日志留痕后按初始值重建。
   */
  async function loadPersisted(now) {
    let text = null
    try {
      const exists = await api.fs.exists(FILE_MAIN)
      if (!exists) return initialState(now)
      text = await api.fs.readFile(FILE_MAIN)
    } catch (err) {
      console.warn('[pet] 存档读取失败（按初始值重建）：' + errMsg(err))
      return initialState(now)
    }
    const result = deserialize(text)
    if (result.ok) {
      // D-13 位置失效回退：存档写了 position 但非法（`{x:NaN}` / 缺字段 / 非对象 / 字符串坐标）
      // ⇒ lib/persist.js 已把它清洗成 null（= 用 `anchor` 默认位），这里补一条 warn（任务卡负向自检）。
      // "超工作区"**不在此列**：入口拿不到 workArea，判不出越界；越界坐标原样发给宿主 setPosition，
      // 由宿主钳位并回传实际坐标（卡 14），入口用回传值校正 ⇒ 账实一致。
      if (result.positionDropped) console.warn(TEXT.logPositionBad)
      return result.state
    }
    try {
      await api.fs.writeFile(FILE_BAD, text) // 备份原文（截断的 JSON 也原样保留，便于人工排查）
    } catch (err) {
      console.warn('[pet] 备份 state.json.bad 失败：' + errMsg(err))
    }
    // 文案逐字来自 D-9 / 任务卡（console.warn 带 [pet] 前缀，与仓库既有扩展日志口径一致）
    console.warn(result.reason === 'version' ? TEXT.logVersionBad : TEXT.logCorrupt)
    return initialState(now)
  }

  // ————— 窗体位置（design D-13；卡 15 的拖动换位） —————
  /**
   * 调 `api.overlay.setPosition` 并用回包校正自记位置。
   *
   * **钳位分工（卡 15 裁定，回执里同步说明）**：
   * - 入口**只拒绝 NaN/Infinity**（`Number.isFinite`；字符串坐标同样拒——与 `lib/vitals.js`
   *   "数字字符串按拒绝处理"同口径，不猜），**不做任何几何钳位**；
   * - **几何钳位（工作区 / 任务栏 / 多显示器）由宿主兜底**：扩展 api 面没有暴露显示器信息，
   *   入口拿不到 `screen.getPrimaryDisplay().workArea`，算不出 `x ∈ [wa.x, wa.x+wa.width-w]`；
   *   宿主 `clampOverlayPosition` 钳完把**实际坐标**放进 `OverlayResult.position` 回传（卡 14 / R31）；
   * - 入口以回传 `position` 为准校正自记值（账实一致，下一次累加才不漂）；回包没带 `position`
   *   （R31 之前的老实现 / 畸形回包）⇒ 以自记值为准并 **warn 一次**（不刷屏）。
   *
   * @returns {Promise<{x:number,y:number}|null>} 落定后的自记位置；被拒/宿主报错 ⇒ null（位置不动）
   */
  async function applyPosition(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      // 累加出非法坐标（存档被改坏 / 页面发了极端增量）⇒ 一次都不调宿主，也不写坏自记位置
      console.warn('[pet] 拒绝非法窗体坐标：(' + String(x) + ',' + String(y) + ')')
      return null
    }
    if (typeof api.overlay.setPosition !== 'function') {
      if (!noSetPositionWarned) {
        noSetPositionWarned = true
        console.warn(TEXT.logNoSetPosition)
      }
      return null
    }
    let res
    try {
      res = await api.overlay.setPosition(OVERLAY_ID, x, y)
    } catch (err) {
      // 宿主契约是"失败不抛错、返回 ok:false"（api-reference.md overlay 小节）；抛错属异常实现，
      // 这里兜住以免 rejection 逃进宿主渲染进程（与 requestOverlay 的 catch 同一口径）
      console.warn('[pet] 窗体移动异常：' + errMsg(err))
      return null
    }
    if (!res || res.ok !== true) {
      console.warn('[pet] 窗体移动失败：' + ((res && res.error) || '未知原因'))
      return null
    }
    if (!state) return null
    const back = sanitizePosition(res.position).position
    if (back) {
      state = { ...state, position: back } // 用宿主钳后的实际坐标校正（可能与我们请求的不同）
      return back
    }
    if (!positionReplyWarned) {
      positionReplyWarned = true
      console.warn(TEXT.logNoPositionReply)
    }
    const self = { x, y } // 老实现/畸形回包 ⇒ 以自记值为准（父代理裁定）
    state = { ...state, position: self }
    return self
  }

  /**
   * 标定探测：拿回主显示器工作区的**右下极限** `(maxX, maxY)`，用于反推 `anchor:'bottom-right'`
   * 的默认绝对位置 `(maxX-margin, maxY-margin)`（与宿主 `overlayPosition` 的公式逐字一致）。
   *
   * **R31 之后这整条路径仅为兼容兜底，正常宿主不会走到**：R31 让 `create` 的成功回包也带
   * `position`，入口建窗时就记下了绝对基准。只有"老宿主 / 畸形回包没带 position、且存档里也没有
   * position"时才需要它——否则 `pet.drag` 的**增量**协议无从换算成 setPosition 的**绝对**坐标
   * （design D-13 假设入口能拿到"最近一次 create 的值"，R31 之前拿不到）。
   * 做法：发一次必然被宿主按工作区钳位的远距离 setPosition（`POSITION_PROBE` 是有限数，
   * 宿主对 NaN/Infinity 直接拒绝），从钳后回包反推。一次安装生命周期里最多发生一次
   * （拖动结束强制落盘后 position 就已知了）。
   *
   * @returns {Promise<{x:number,y:number}|null>} 工作区右下极限；宿主未钳位/未回传 ⇒ null（不猜坐标）
   */
  async function probeClampedMax() {
    if (typeof api.overlay.setPosition !== 'function') {
      if (!noSetPositionWarned) {
        noSetPositionWarned = true
        console.warn(TEXT.logNoSetPosition)
      }
      return null
    }
    let res
    try {
      res = await api.overlay.setPosition(OVERLAY_ID, POSITION_PROBE, POSITION_PROBE)
    } catch (err) {
      console.warn('[pet] 位置标定异常：' + errMsg(err))
      return null
    }
    const p = res && res.ok === true ? sanitizePosition(res.position).position : null
    // 回包坐标仍等于探测值 ⇒ 宿主没做工作区钳位（异常实现）：此时反推出的"锚点"是天文数字，
    // 宁可放弃本次移动也不把窗体甩到看不见的地方
    if (!p || p.x >= POSITION_PROBE || p.y >= POSITION_PROBE) {
      console.warn(TEXT.logCalibrateFailed)
      return null
    }
    return p
  }

  // ————— transient 到期主动推送（卡 19 · 父代理裁定 R54） —————
  /**
   * 为"当前这一轮 transient"排一次到期推送（`pet-transient`，一次性 setTimeout）。
   *
   * **为什么必须有它**：入口的 `state.transient` 到期**不会自己推送**——`resolveStatus` 只是不再认它，
   * 下一次 rev++ 要等 `pet-tick`（15 秒，且只在属性真的变化时）或下一轮 `pet-perf`（10 秒）。
   * 页面因此在"用户点出来的那一轮"播完后仍按最近一次视图的 `anim.status` 继续渲染该轨
   * （进食/洗澡姿态挂着，最长 15 秒）——复验报告 D-1「影响面 ③」记的就是这条。
   * 页面侧**不能**自己按本地轮长折 idle：`prefers-reduced-motion: reduce`（400ms/帧）下页面轮长会
   * **长于**入口的 `TRANSIENT_MS`，提前折会掐掉用户刚点的动作。所以由入口承担这一半。
   *
   * **秒级取整**：`api.timer` 只收 **1–86400 的整数秒**（api-reference.md:405-414,552-572），
   * 没有毫秒级入口 ⇒ 用 `transientDelaySeconds`（**向上取整**，宁晚 ≤1 秒也绝不早到；
   * 早到会被 `transientExpired` 挡掉并按剩余时间重排）。取整的实际代价逐轨写在回执里。
   *
   * **覆盖语义（先清后设）**：三只定时器共用 `api.timer` 的名字空间，但到期推送固定用同一个 id
   * `pet-transient` ⇒ 新一轮 transient 落定时这里先 `clearTimeout` 再 `setTimeout`，
   * 任何时刻**至多一个**待触发的到期推送（宿主对同 id 重复设置本就是重置，clear 让 mock/断言也看得到）。
   *
   * 没有 transient / until 畸形 ⇒ **不排**（不为不存在的轮次空转；否则 1 秒一次的自我重排会成死循环）。
   */
  function armTransientExpiry(now, transient) {
    const until = transient && typeof transient === 'object' ? transient.until : undefined
    if (typeof until !== 'number' || !Number.isFinite(until)) return
    api.timer.clearTimeout(TRANSIENT_TIMER_ID)
    api.timer.setTimeout(TRANSIENT_TIMER_ID, transientDelaySeconds(until, now), onTransientExpire)
  }

  /**
   * 到期（或定时器早到）时的处理：**恰好三件事**——清运行时字段 → `rev++` → 唤醒推送。
   *
   * 次序与 D-8 一致（状态落定后才 rev+1，页面拿到的是同一份完整视图）。
   * **不清设置键、不写盘**：transient / transientSelf 都是不落盘的渲染态，三属性一个字节没动
   * （写盘节流签名的口径也不含它们）⇒ 到期推送不产生任何磁盘 IO。
   *
   * 幂等（硬要求）：清完 `state.transient` 为 null，**再次触发直接返回**（不会连推多个 rev；
   * 重复推送只会让页面白重绘）。宿主的一次性 setTimeout 触发后本就消失，这里不额外 clear。
   *
   * 早到（时钟回拨 / 定时器漂移）：`transientExpired` 为假 ⇒ **不清也不推**，按剩余时间**重排**一次
   * （不重排的话这一轮就再没人推，又退回"挂到下一次 tick"）。
   *
   * 门控口径（与既有路径的对照，写清以免后人误加判断）：
   * - **无窗体**（`!overlayAlive`）：照清照推。清 transient 只是让状态回到"本就该有"的基础态
   *   （`resolveStatus` 在 `until` 之后本就不再认它），hub 为空时 `wake()` 是 no-op，`rev++` 无副作用；
   * - **拖动中**：照清照推。`until` 是**墙钟截止时刻**，拖动不会延长它；拖动中 `buildView` 本就把输出
   *   折成 idle（D-13），清不清都不影响拖动中的画面，松手后按当时的条件重新判定，不会被"卡在半轮"；
   * - **打盹/属性过低**：与它们无关——到期后视图自然是按 `resolveStatus` 判定出来的真实状态。
   */
  function onTransientExpire() {
    if (disposed || !state) return
    const now = Date.now()
    if (!transientExpired(state, now)) {
      armTransientExpiry(now, state.transient) // 早到：按剩余时间重排（不清、不推）
      return
    }
    state = { ...state, transient: null, transientSelf: false }
    rev++
    hub.wake()
  }

  // ————— 随机表演（design D-14 改版 / 用户裁定 Q16；specs/pet-sprites 的随机表演 requirement） —————
  /**
   * 每 10 秒随机播一轮"表演型"动作（`RANDOM_PERF_EVERY_SEC` / `RANDOM_PERF_SET` 是单一来源）。
   *
   * 为什么用**周期定时器**（`api.timer.setInterval`，宿主级、整数秒）：`api-reference.md:405-414` 的
   * timer 只收 1–86400 的整数秒，10 秒合法；宿主级定时器在主窗口最小化时**不**被节流
   * （渲染进程的 setTimeout 会被节流到 1s 粒度，周期会漂）。Q10/Q14 那套"2–5 分钟随机
   * `setTimeout` + `trotArmed` 重排"的独立定时器随之整条退役（design D-14"trot 定时器退役"）。
   *
   * 触发时的门控**只有两条**（都是"让位"，不是"放弃以后再也不播"——下一个周期照常再看一眼）：
   * ① 正在打盹 ⇒ 不打扰（"睡着就该安静"，design D-14 父代理默认口径）；
   * ② 已经有 transient 在播（真实互动，或上一轮表演还没播完）⇒ 让位，绝不打断用户刚点出来的那一轮。
   * 状态指示轨（hungry/dirty/sad）**不**是门控：随机表演的优先级高于它们（Q16），
   * 它只暂时改姿态、不改数值，1.4–1.8s 后自然回落到"饿了/脏了/难过"的真实判定。
   *
   * 一轮只写 `state.transient`（与真实互动同一字段，复用既有 transient 机制与页面侧帧时钟），
   * 时长取 `TRANSIENT_MS`（= 该轨一轮的真实帧时长之和）。**副作用一个都没有**：
   * 不消耗道具、不改任何属性/库存/成长值、不弹气泡、不推进也不重置 `lastInteractAt`
   * （它不是用户交互，不能把 `sleep` 推后）。
   * `run-left`/`run-right` 也只是原地播帧：这条路径里**没有** `api.overlay.setPosition`
   * （宠物不位移，design Non-Goals）。
   *
   * 卡 19（热修 D-1）：写 transient 时**必须同时置 `transientSelf: true`**——
   * 随机集里有 `eating`/`bathing`/`petted`/`playing` 四项与真实互动同名同轨，
   * 页面只拿到状态字符串，分不出"这一轮是随机抽的还是用户刚点的"，于是本地一轮播完后
   * 仍按入口的 `animStatus='eating'` 一直渲染（实机停留 5/10/15s、连成一片 24.98s）。
   * 来源只能由写入方记录：这里是唯一的"自发"写入点（真实互动在 lib/interact.js 写 false）。
   */
  function onRandomPerf() {
    if (disposed || !state) return
    const now = Date.now()
    if (!overlayAlive || dragging) return // 没窗体没人看；拖动中不自己跑（D-13 互斥）
    const status = resolveStatus(state, now)
    if (status === 'sleep') return // 打盹期间不表演（specs/pet-sprites 第三条 scenario）
    if (isTransient(status)) return // 更高的优先级在播（真实互动 / 上一轮表演）⇒ 让位，不打岔
    // 均匀随机抽一条：`Math.random` 可在测试里 mock 成确定值来钉住抽到哪一项
    const pick = RANDOM_PERF_SET[Math.floor(Math.random() * RANDOM_PERF_SET.length)]
    const ms = TRANSIENT_MS[pick]
    if (!pick || !(ms > 0)) return // 常量被改坏 ⇒ 宁可不动，也不写一个畸形 transient
    // transientSelf 与 transient 同生命周期：两者在同一次状态写入里落定，读档/初始态里都是干净值
    state = { ...state, transient: { status: pick, until: now + ms }, transientSelf: true }
    // 卡 19（R54）：到期主动推一次（R54 前要等下一次 pet-perf/pet-tick，页面会把这条表演轨挂住）
    armTransientExpiry(now, state.transient)
    rev++ // 状态落定后才 +1（D-8 次序）：页面据此换轨并播完一轮自行回落
    hub.wake()
  }

  // ————— overlay 生命周期（specs/pet-window：关 = 销毁而非隐藏；D-8：销毁优先） —————
  function requestOverlay(visible) {
    return enqueueOverlay(async () => {
      // task 内部全量捕获：enqueueOverlay 的返回值可能被 void 调用（设置监听器），
      // 逃逸的 rejection 会变成 unhandled rejection 打进宿主渲染进程
      try {
        if (disposed) return
        if (visible) {
          if (overlayAlive) return // 幂等：已存在不重复创建（宿主也会拒绝同 id 重复创建）
          const res = await api.overlay.create({
            id: OVERLAY_ID,
            url: overlayUrl,
            width: OVERLAY_WIDTH,
            height: OVERLAY_HEIGHT,
            anchor: 'bottom-right', // 主显示器工作区右下角（D-1；宿主负责贴角与主显示器选择）
            margin: OVERLAY_MARGIN,
            transparent: true, // artwork 窗体：透明 + 无边框（创建后不可切换，宿主契约）
            alwaysOnTop: true,
            skipTaskbar: true
          })
          if (disposed) {
            // init/toggle 与停用并发：窗体若已建成，立刻回收（宿主停用也会自动回收，双保险且 destroy 幂等）
            if (res && res.ok) void api.overlay.destroy(OVERLAY_ID)
            return
          }
          if (res && res.ok) {
            overlayAlive = true
            lastCreateFailed = false // D-1 判据：本次创建成功
            throughNow = true // 创建后默认鼠标穿透（宿主契约），本地镜像同步，避免冗余 setMouseThrough
            clearDiagnosticIf(TEXT_CREATE_FAILED_PREFIX)
            // ————— 绝对位置基准（design D-13 + 父代理裁定 R31） —————
            // 主路径：`create` 的成功回包带 `position`（宿主 `overlayPosition(...)` 算出的实际坐标）
            // ⇒ 直接记下，作为拖动增量（dx/dy → setPosition 绝对坐标）的换算基准。
            // 存档里已有 position 时**以存档为准**（用户拖过就回他拖的地方，specs/pet-window
            // 的"拖动后重启回到存档位置"scenario）：create 只支持 anchor，绝对坐标得再发一次 setPosition；
            // 越界由宿主钳位并回传，入口用回传值校正（"完全落在工作区外 ⇒ 钳回，不丢弃存档"）。
            const saved = state ? state.position : null
            if (saved) {
              await applyPosition(saved.x, saved.y)
            } else {
              const created = sanitizePosition(res.position).position
              // 回包没带 position（R31 之前的老宿主）⇒ 基准保持 null，首次拖动时走 probeClampedMax 兜底
              if (created && state) state = { ...state, position: created }
            }
            if (disposed) {
              // await 期间被停用：把刚建成（且可能刚被移动过）的窗体回收，与上面的 disposed 护栏同款
              void api.overlay.destroy(OVERLAY_ID)
              overlayAlive = false
              return
            }
            // 卡 18（Q16）：随机表演不再需要"窗体就位时立刻排一次"——它是与窗体无关的 10 秒周期
            // 定时器（onRandomPerf 每轮自己看 overlayAlive）。toggle 关→开之间的空转被这一条挡掉。
            // 卡 19（R54）：**唯独**"transient 到期推送"要在重建时补排——销毁路径会清掉它
            // （见下面 else 分支），若用户在某一轮还没到期时关→开（1.x 秒内），不补这一手
            // 那条边界又会退回"姿态挂到下一次 tick"。已过期时 `transientDelaySeconds` 给 1 秒、
            // 回调的到期校验立刻放行 ⇒ 只补一次推送，不会空转。
            if (state && state.transient && !disposed) armTransientExpiry(Date.now(), state.transient)
          } else {
            const reason = (res && res.error) || '未知原因'
            lastCreateFailed = true // D-1 判据：本次创建失败 ⇒ 启动复位不吃掉这条诊断
            console.warn('[pet] 窗体创建失败：' + reason)
            setDiagnostic(TEXT.createFailed(reason)) // D-9：状态栏 + 诊断位；可重试（toggle 关再开）
          }
        } else {
          if (!overlayAlive) return
          // 先翻标志再 await：销毁优先（D-8）——await 期间到达的 interact/subscribe 一律按"窗体已关闭"拒绝
          overlayAlive = false
          throughNow = true
          dragging = false // 窗体销毁时若正在拖动：拖动会话随之作废（end 到达时按"窗体已关闭"拒绝）
          // 卡 19（R54）：窗体没了就不必再为它推送到期视图（rebuild 时按剩余时间补排一次，
          // 见 create 成功分支）。注意**只清定时器、不清 state.transient**：它是渲染态，
          // `resolveStatus` 在 until 之后本就不再认它，重建后页面拿到的是干净视图。
          api.timer.clearTimeout(TRANSIENT_TIMER_ID)
          hub.drain({ ok: false, error: TEXT.windowClosed }) // 丢弃该 overlay 的 pending 订阅（D-3/D-8）
          const res = await api.overlay.destroy(OVERLAY_ID)
          if (res && !res.ok) console.warn('[pet] 窗体销毁失败：' + res.error) // 宿主 destroy 幂等，理论路径
        }
      } catch (err) {
        console.warn('[pet] overlay 操作异常：' + errMsg(err))
      }
    })
  }

  // ————— 结算时钟（design D-5：tick 只负责"到点触发一次结算 + 唤醒订阅"） —————
  function onTick() {
    if (disposed || !state) return
    const now = Date.now()
    const result = settle(state, now, { overlayExists: overlayAlive })
    for (const w of result.warnings) console.warn('[pet] ' + w) // 时间回拨等（D-5/R4）
    state = result.state
    if (result.changed) {
      // 次序固定（D-8）：状态落定 → rev+1 → 设置同步（设置页当帧刷新，api-reference.md:312）→ 唤醒订阅 → 节流写盘
      rev++
      syncVitalSettings()
      hub.wake()
      void persistState(now)
    }
    // 卡 18（Q16）：随机表演是**独立周期**（10 秒的 pet-perf 定时器），tick 不再负责任何一次排程
    // （Q10/Q14 的"每次回落 idle 后重排随机 2–5 分钟"随 trot 定时器一并退役）。
  }

  /** 悬停/交互刷新"最近交互时刻"（D-4 sleep 的退出条件含悬停）；只在对外状态真的变了才唤醒订阅 */
  function noteInteraction(now) {
    if (!state) return
    const before = resolveStatus(state, now)
    state = { ...state, lastInteractAt: now }
    const after = resolveStatus(state, now)
    // 悬停指针事件可能很密集：状态没变（大多数情况）就不 rev+1，避免唤醒风暴；
    // 变了（如 sleep→idle）必须立刻推给页面，否则宠物"睡着了叫不醒"。
    if (before !== after) {
      rev++
      hub.wake()
    }
  }

  /** 统一的视图构建：把"拖动中"这个只存在于入口的互斥状态一起交给 buildView（D-13） */
  function currentView(now) {
    return buildView(state, now, { dragging })
  }

  // ————— 消息桥（design D-3 通道表 + D-13 的 pet.drag；宿主 reply 信封 { ok, data|error } 由宿主拼，handler 只返回业务体） —————
  const offMessage = api.app.onMessage(async (channel, payload) => {
    switch (channel) {
      case CHANNELS.ready: // 页面首帧拉一次，避免闪烁（D-3）
      case CHANNELS.state:
        await initPromise // 防御：首帧理论上晚于读档（overlay 在 init 里才创建），等一手无害
        if (!state) return { ok: false, error: TEXT.notReady }
        return { ok: true, state: currentView(Date.now()) }

      case CHANNELS.subscribe: {
        // 长轮询（D-3 的 S1 解法）：hold 到 rev 变化或 25s 超时；超时回**相同 rev**，
        // 页面不重绘只重订阅。25s < 宿主桥 60s 单次请求超时（guides-user.md:143），
        // 否则页面拿到的是"扩展未响应（超时）"错误而非正常状态（constants.js 有完整理由）。
        await initPromise
        if (!overlayAlive) {
          // 窗体已销毁 ⇒ 不再受理新订阅（与 drain 丢弃 pending 同一语义；页面若残存会收到明确错误而退避）
          return { ok: false, error: TEXT.windowClosed }
        }
        if (!state) return { ok: false, error: TEXT.notReady }
        const clientRev = payload && typeof payload === 'object' ? payload.rev : undefined
        if (typeof clientRev === 'number' && clientRev !== rev) {
          return { ok: true, state: currentView(Date.now()), rev } // 页面落后：立即补发当前状态
        }
        return hub.hold(() => ({ ok: true, state: currentView(Date.now()), rev }))
      }

      case CHANNELS.interact: {
        await initPromise
        if (!state) return { ok: false, error: TEXT.notReady }
        if (!overlayAlive) {
          // D-9：窗体已销毁时收到交互 ⇒ 日志 + { ok:false, error:'宠物窗体已关闭' }（任务卡负向自检逐字）
          console.warn(TEXT.logIgnoreInteract)
          return { ok: false, error: TEXT.windowClosed }
        }
        const kind = payload && typeof payload === 'object' ? payload.kind : undefined
        const now = Date.now()
        // 纯函数：未知 kind（含已移除的 summon/hide）/ 道具不足 ⇒ ok:false 且状态不动
        const result = interact(state, kind, now)
        if (!result.ok) return { ok: false, error: result.error }
        // 卡 18（Q16）：真实互动与随机表演**共用 `transient` 字段** ⇒ 这里直接覆盖即可
        // "立即抢占正在播的随机表演"（specs/pet-sprites 的"真实互动可打断随机表演"scenario）；
        // 数值效果由 lib/interact.js 的纯函数照常算出（道具/属性/联动记账），与表演无关。
        // 卡 19（热修 D-1）：lib/interact.js 的 succeed() 同时把 `transientSelf` 写回 false
        // ⇒ 入口与页面都知道"这一轮是用户点的"（页面因此不把它折成 idle，动画与气泡同为互动）。
        state = result.state
        // 卡 19（R54）：为这一轮真实互动排"到期主动推送"——否则页面会按最近一次视图里的
        // `anim.status`（优先级 9）把进食/洗澡姿态一直渲染到下一次 15 秒 tick。
        // 覆盖语义由 armTransientExpiry 保证（同一个 id：先清上一轮的，再排这一轮的）。
        armTransientExpiry(now, state.transient)
        // 先算完再唤醒（D-8）：rev 只在状态落定后 +1，避免把中间态发给页面
        rev++
        syncVitalSettings() // 交互后三属性立即进设置键（设置页 progress 当帧刷新）
        hub.wake()
        // 交互必然改变整数签名（道具/冷却/属性）⇒ 节流放行即可；没有任何 kind 需要强制落盘
        // （卡 15 的 summon/hide 曾走强制落盘，卡 17 随隐藏功能一并移除）
        void persistState(now)
        return { ok: true, state: currentView(now), feedback: result.feedback }
      }

      case CHANNELS.hit: {
        // 页面命中测试上报（D-2）：命中精灵/面板 ⇒ 关闭穿透以接收点击；移出 ⇒ 恢复穿透。
        // 窗体创建后默认穿透（宿主契约），本地只在穿透态真的变化时调 API（去重：指针事件密集）。
        await initPromise
        const inside = !!(payload && typeof payload === 'object' && payload.inside === true)
        if (overlayAlive) {
          const want = !inside
          if (throughNow !== want) {
            throughNow = want
            void api.overlay.setMouseThrough(OVERLAY_ID, want)
          }
        }
        // 悬停算交互（D-4 sleep 触发/退出条件都含悬停）：只在命中时刷新，移出不是"互动"
        if (inside) noteInteraction(Date.now())
        return { ok: true } // D-3：pet.hit 一律 { ok:true }
      }

      case CHANNELS.drag: {
        // ————— 拖动换位（design D-13；specs/pet-window 的拖拽 requirement） —————
        // 页面发**屏幕像素增量**（它不知道窗体在屏幕上的绝对位置，跨源也拿不到），
        // 入口维护自记位置、累加后调 setPosition；几何钳位由宿主兜底（分工见 applyPosition 注释）。
        const phase = payload && typeof payload === 'object' ? payload.phase : undefined
        if (typeof phase !== 'string' || !DRAG_PHASES.includes(phase)) {
          // 缺 phase / phase 未知 ⇒ 拒绝且不移动（任务卡负向自检）；先校验再 await，畸形请求不占队列
          return { ok: false, error: TEXT.unknownDragPhase(String(phase)) }
        }
        let dx = 0
        let dy = 0
        if (phase === 'move') {
          dx = payload.dx
          dy = payload.dy
          // 只接受**有限数字**：NaN/Infinity/字符串（'10'）一律拒绝且不移动——不做隐式转换。
          // 口径与 lib/vitals.js（"数字字符串按拒绝处理"）和宿主 setPosition（"不钳不猜"）一致：
          // 载荷被改坏时"猜一个数"会把窗体甩到不知道哪里，"不动"是可恢复的。
          if (
            typeof dx !== 'number' ||
            !Number.isFinite(dx) ||
            typeof dy !== 'number' ||
            !Number.isFinite(dy)
          ) {
            return { ok: false, error: TEXT.dragBadDelta }
          }
        }
        await initPromise
        if (!state) return { ok: false, error: TEXT.notReady }
        if (!overlayAlive) return { ok: false, error: TEXT.windowClosed }
        // 串行执行：move 是高频短请求，而"读 state.position → 算目标 → 写回"必须按到达顺序落定
        return enqueueDrag(async () => {
          try {
            if (disposed || !state) return { ok: false, error: TEXT.notReady }
            if (!overlayAlive) return { ok: false, error: TEXT.windowClosed }

            if (phase === 'start') {
              dragging = true
              // D-13 互斥①：拖动期间不触发随机表演。卡 18 起不需要"清定时器"——10 秒周期定时器
              // 一直在跑，靠 onRandomPerf 入口处的 `dragging` 判定跳过（拖动结束自动恢复，无需重排）。
              // D-13 互斥②：拖动是用户交互 ⇒ 刷新 lastInteractAt，sleep 判定不推进；
              // 加上 buildView 的 dragging 折叠（sleep/入口自发表演 → idle、气泡置 null），
              // 拖多久都不会"边拖边睡/边拖边跑/冒气泡"（specs/pet-window 的"拖动中不踱步不入睡"）
              noteInteraction(Date.now())
              return { ok: true }
            }

            if (phase === 'move') {
              const base = state.position
              let target
              if (base) {
                target = { x: base.x + dx, y: base.y + dy } // 增量累加到自记位置（入口不做几何钳位）
              } else {
                // 兜底标定（R31 之后正常宿主走不到：create 已回传 position）——见 probeClampedMax 注释
                const max = await probeClampedMax()
                if (!max) return { ok: false, error: TEXT.dragNoBase }
                // 反推 bottom-right 锚点默认位（D-1 公式：wa.x+wa.width-w-margin = maxX-margin），
                // 并把本次增量折进同一次调用 ⇒ 窗体一步落到正确位置，省一次"先恢复锚点"的往返
                target = { x: max.x - OVERLAY_MARGIN + dx, y: max.y - OVERLAY_MARGIN + dy }
              }
              const applied = await applyPosition(target.x, target.y)
              if (!applied) return { ok: false, error: TEXT.dragNoBase }
              return { ok: true, position: applied }
            }

            // phase === 'end'
            dragging = false
            const now = Date.now()
            noteInteraction(now) // 松手也是一次交互；此后 sleep/随机表演按当前条件重新判定（D-13）
            void persistState(now, true) // D-13：拖动结束**强制落盘** position（绕过写盘节流）
            return { ok: true, position: state.position ?? null }
          } catch (err) {
            // 拖动是用户手上的实时操作：任何异常都不能让 rejection 逃进宿主渲染进程，
            // 也不能把 dragging 卡在 true（那会永久抑制随机表演与 sleep）
            console.warn('[pet] 拖动处理异常：' + errMsg(err))
            dragging = false
            return { ok: false, error: TEXT.dragNoBase }
          }
        })
      }

      default:
        return { ok: false, error: TEXT.unknownChannel(String(channel)) }
    }
  })

  // ————— 设置订阅（specs/pet-settings：pet.visible 关 ⇒ 销毁窗体，开 ⇒ 重建且状态连续） —————
  const offSettings = api.settings.onChanged((key) => {
    if (disposed || !state) return // init 期间由 init 流程自己读最新值，避免半初始化状态驱动窗体
    // 只响应 visible 与"未指明 key"的广播（host.ts:443 语言切换等场景传空串 ⇒ 重读一遍，幂等无害）；
    // 自己写的三属性/诊断键会回声到这里，必须滤掉，否则每 tick 都触发窗体判定。
    if (key !== '' && key !== KEY_VISIBLE) return
    const visible = api.settings.get(KEY_VISIBLE, true) !== false // 默认 true（跨卡契约：卡 09 manifest 同默认值）
    void requestOverlay(visible)
    // 卡 17（Q15=B）：这里原来还有一段"关→开的跳变 ⇒ 清除隐藏态"（Q11 优先级）。
    // 隐藏态这个中间态已整条撤销 ⇒ 跳变逻辑连同它的本地镜像 `visibleNow` 一并删除：
    // toggle 的语义回到独一无二的一条——关 = 销毁窗体，开 = 重建窗体。
  })

  // 状态栏初始文本（D-12：脚手架贡献点里唯一保留的 pet.status，诊断用）
  api.statusBar.setText(STATUSBAR_ID, STATUSBAR_IDLE)

  // ————— 启动序列（D-5"启动"：读档 ⇒ 重置 lastSettledAt ⇒ 按设置建窗 ⇒ 起 tick） —————
  const initPromise = (async () => {
    // 全量兜底：init 任何一步意外抛错（宿主拆除竞态、settings 存储异常……）都不能让
    // 扩展变成"消息面永远 notReady、时钟永远不起"的半残状态（D-9"不抛出、不影响宿主"）
    try {
      const now = Date.now()
      state = await loadPersisted(now)
      if (disposed) return
      // 不追算离线（grill Q4 / specs/pet-vitals"关闭三天不追算"）：lastSettledAt 重置为当前时刻
      state = startupReset(state, Date.now())
      syncVitalSettings() // 首帧就把三属性写进设置键（设置页打开即有值，含"首次安装写默认值"场景）
      const visible = api.settings.get(KEY_VISIBLE, true) !== false
      await requestOverlay(visible)
      if (disposed) return
      // ————— D-1（卡 17 修复）：启动成功即无条件复位诊断位 —————
      // 判据 = 首次状态已就绪（state 在本函数开头就已读档 + startupReset）且**本次启动没有创建失败**
      // （设置里关掉了宠物、根本没建窗，同样算成功启动）。此刻"本次启动正常"已成事实，
      // 上一会话可能残留在 `pet.diagnostic` 设置键里的失败文案（设置存储落盘、跨会话留存）
      // 必须被写回 ''，状态栏回到「宠物」。
      // 启动失败时**不**复位：刚写下的「宠物窗体创建失败：…」正是给用户排查用的线索。
      if (!lastCreateFailed) resetDiagnostic()
      // tick 最后起：onTick 依赖 state 就绪；15 秒节拍（api.timer 单位是秒，api-reference.md:405-414）
      api.timer.setInterval(TICK_ID, TICK_SECONDS, onTick)
      // 随机表演的周期定时器（卡 18 / Q16：10 秒一轮，宿主级定时器不被后台节流）。
      // 与 tick 一样**无条件注册**：是否真的表演由 onRandomPerf 每轮自己判定（打盹不打扰、
      // 拖动中不跑、无窗体的空转直接返回），所以不需要随 toggle/入睡反复挂摘。
      api.timer.setInterval(RANDOM_PERF_TIMER_ID, RANDOM_PERF_EVERY_SEC, onRandomPerf)
    } catch (err) {
      console.warn('[pet] 初始化异常（按可恢复处理）：' + errMsg(err))
      if (!state) state = initialState(Date.now()) // 兜底空态：消息面至少可用
      if (!disposed) {
        try {
          api.timer.setInterval(TICK_ID, TICK_SECONDS, onTick) // 时钟兜底注册（同 id 重复设置会被宿主重置，幂等）
          api.timer.setInterval(RANDOM_PERF_TIMER_ID, RANDOM_PERF_EVERY_SEC, onRandomPerf) // 随机表演兜底注册
        } catch (err2) {
          console.warn('[pet] 定时器注册失败：' + errMsg(err2))
        }
      }
    }
  })()

  // ————— cleanup（api-reference.md:30：停用时宿主执行；每一项注册都要在这里释放） —————
  return () => {
    disposed = true
    dragging = false // 停用期间到达的 drag 请求由 disposed 护栏拒绝，标志也不该卡在 true
    // 两只周期定时器都要清：结算时钟 pet-tick 与随机表演 pet-perf（卡 18 / Q16；
    // 后者取代了 Q10/Q14 那个一次性 setTimeout 的 pet-trot）
    api.timer.clearInterval(RANDOM_PERF_TIMER_ID)
    api.timer.clearInterval(TICK_ID) // 清结算时钟（无此 id 时宿主无操作，api-reference.md:413）
    // 卡 19（R54）的第三只定时器：transient 到期推送（一次性 setTimeout）。不清它的话，
    // 停用后回调仍会在宿主里排队（虽然 disposed 护栏会短路，但句柄必须释放）
    api.timer.clearTimeout(TRANSIENT_TIMER_ID)
    hub.drain({ ok: false, error: TEXT.windowClosed }) // 丢弃全部 pending 长轮询（任务卡：cleanup 三件事之一）
    offMessage.dispose()
    offSettings.dispose()
    if (overlayAlive) {
      overlayAlive = false
      void api.overlay.destroy(OVERLAY_ID) // 宿主停用也会自动回收 overlay（src/api/types.ts:198）；destroy 幂等，双保险
    }
    if (state) void persistState(Date.now(), true) // 尽力落一次盘（异步，宿主拆除前能写完就写完）
  }
}

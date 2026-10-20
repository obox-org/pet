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
  BUBBLE_MS,
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
  TEXT_EVERY_SEC,
  TICK_ID,
  TICK_SECONDS,
  TRANSIENT_MS,
  TRANSIENT_TIMER_ID
} from './lib/constants.js'
import { finiteOr, levelOf } from './lib/growth.js'
import { interact } from './lib/interact.js'
import { resolveStatus, transientDelaySeconds, transientExpired } from './lib/mapping.js'
import { deserialize, sanitizePosition, serialize } from './lib/persist.js'
import { initialState, onWindowDestroyed, settle, startupReset } from './lib/settle.js'
import { pickFavorText } from './lib/texts.js'

/** 错误对象 → 可日志化文本（宿主抛的可能是任意值） */
function errMsg(err) {
  return err && err.message ? err.message : String(err)
}

/** 诊断位的"窗体创建失败"前缀（恢复后只清同类诊断，不误清保存失败的文案） */
const TEXT_CREATE_FAILED_PREFIX = TEXT.createFailedPrefix

/**
 * 入口本地常量：两只一次性定时器的 id 与 v2 的四个设置键。
 *
 * **为什么落在本文件而不是 `lib/constants.js`**：该文件（常量唯一来源）所有权在卡 1 / 卡 6，
 * 本次任务卡明令不得改动；它已经导出了**周期与时长**（`TEXT_EVERY_SEC` / `BUBBLE_MS`）与
 * 三只既有定时器 id（`TICK_ID` / `RANDOM_PERF_TIMER_ID` / `TRANSIENT_TIMER_ID`），
 * 但没有 `pet-text` / `pet-bubble` 的 id，也没有 `pet.growth` / `pet.favor` / `pet.favorExact` /
 * `pet.level` 四个设置键
 * （v1 只声明了三属性键）。为了让本次实现可运行、又不动别人的文件，这里以**字面量**落在唯一使用点，
 * 值逐字来自 design D-3 的定时器表与 specs/pet-settings 的字段清单；
 * 归并进 `constants.js` 时只搬位置、不改值（已在回执的"越界声明"里登记）。
 *
 * `pet.hunger` / `pet.clean` / `pet.mood` 三个**旧**键仍从 `constants.js` 引入（只用于迁移清理，
 * 见 `clearLegacyVitalKeys`）；它们的删除与本次的新键归并是同一件事，必须由常量文件的所有者一起做。
 */
const TEXT_TIMER_ID = 'pet-text'
const BUBBLE_TIMER_ID = 'pet-bubble'
const KEY_GROWTH = 'pet.growth'
const KEY_FAVOR = 'pet.favor'
const KEY_FAVOR_EXACT = 'pet.favorExact' // 精确好感值（status 行；progress 行会被宿主钳到 max）
const KEY_LEVEL = 'pet.level'

/**
 * v1 → v2 迁移的诊断文案（specs/pet-values R4 / design R6 的"记录一条迁移诊断"）。
 * 只写**一次**（迁移后三属性键已不存在，`migratedFromV1` 不会再为真）。
 */
const TEXT_MIGRATED_V1 = '已从 v1 迁移：三属性已丢弃'

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
  let dragging = false // 拖动中（design D-13 互斥：抑制随机表演、不弹气泡）
  let positionReplyWarned = false // overlay 成功回包却没带 position（R31 之前的宿主）⇒ 只 warn 一次
  let noSetPositionWarned = false // 宿主根本没有 setPosition ⇒ 只 warn 一次（拖动降级为"不移动"）
  /**
   * 最近一次窗体创建是否失败（卡 17 / D-1 的判据之一）。
   * init 里用它决定"启动成功 ⇒ 复位诊断位"要不要做：本次启动**真的失败过**就把刚写下的
   * 「宠物窗体创建失败：…」留给用户排查，成功（含"设置里关掉了宠物、根本没建窗"）才复位。
   */
  let lastCreateFailed = false
  /**
   * 读档时是否识别出 v1 的旧存档（`deserialize` 的 `migratedFromV1`）。
   * 用途**只有一条**（specs/pet-values R4 / design R6）：启动序列末尾写一次迁移诊断，
   * 并把三个旧设置键置空串（`api.settings` 无删除 API）。
   * 为什么不在读档当场写：启动成功后的诊断复位（`resetDiagnostic`）会无条件清空诊断位，
   * 当场写下会被它抹掉；所以先记标志，复位之后再写。
   */
  let migratedFromV1 = false

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

  // ————— 设置同步（specs/pet-settings：五行展示；每次状态落定后把两个数值 + 精确好感值 + 等级名写进设置键） —————
  /**
   * 把 `growth` / `favor` / 精确好感值 / 等级名写进四个设置键（沿用 v1 的"vital → settings"同步机制，只换键与口径）。
   *
   * 四者的**值类型由 `manifest.json` 的字段类型决定**（`docs/extension-api/themes-settings.md`）：
   * - `pet.growth` 是 `status`（只读文本）⇒ 必须写**字符串**；
   * - `pet.favor` 是 `progress`（只读进度条，`max: 650`）⇒ 必须写**数字**，宿主自己取整显示
   *   `{cur}/{max}`、条宽用未取整比例（好感是整数，这里不存在取整分歧）；
   * - `pet.favorExact` 是 `status` ⇒ 写**精确好感值**的字符串，不钳；
   * - `pet.level` 是 `status` ⇒ 写**等级名**（specs/pet-interaction：面板/设置页显示"心有灵犀"这种词）。
   *
   * **两条写入口径**（R-S1 修正）：
   * - 两个键都写**未钳真值**——入口不做任何 max 钳制，钳制是宿主行为，扩展侧钳一次就等于丢掉真值；
   * - 但**显示**要靠 `pet.favorExact`：宿主的 `progress` 字段把 `cur` 钳到 `[0,max]` 再向下取整
   *   （`SettingsView.vue:685-687`），好感满级（650）后继续累加时进度行永远是 `650/650`，
   *   真实好感只在这条 `status` 行可见（specs/pet-settings 的「好感超过进度条上限」scenario、
   *   design.md:13）。
   *
   * 设置 `set` 会同步通知订阅者（api-reference.md:312），而 `onChanged` 只认 `pet.visible` 与空 key
   * ⇒ 这里写的四个键会被设置监听器过滤掉，不会反过来触发窗体判定。
   *
   * **调用点 = 每一个 `rev++` 之后**（任务卡"设置值推送"的硬要求；沿用 v1 的 vital→settings 机制）。
   * 其中 `pet-perf` / `pet-text` / 两个到期回调**不改变**这四个值，写的是同一批数字——
   * 多写几笔的代价可以忽略（每次 4 次 `set`、约 2 次/分钟），换来的是"设置页永不落后于视图"
   * 这条不需要逐路径论证的硬保证（将来任何一条路径改了数值，只要它 rev++ 就自动同步）。
   */
  function syncValueSettings() {
    if (!state) return
    // 等级数字（`level`）只进视图（PetStateView.values.level），设置页这一行展示的是等级名
    const { name } = levelOf(state.favor)
    api.settings.set(KEY_GROWTH, String(state.growth))
    api.settings.set(KEY_FAVOR, state.favor)
    api.settings.set(KEY_FAVOR_EXACT, String(state.favor)) // 不钳：progress 行满格后，真值靠这一行可见
    api.settings.set(KEY_LEVEL, name)
  }

  /**
   * 迁移收尾（specs/pet-values R4 / design D-7 的最后一行）：
   * 把 v1 的三个属性设置键置**空串**。`api.settings` 没有删除方法，空串是"不显示/无值"的等价物，
   * 且 `manifest.json` 已不再声明这三个键 ⇒ 宿主设置页不再渲染它们（残留的值也不会再被读）。
   *
   * 只在 `migratedFromV1 === true` 时调用：正常存档里不存在这三个键，没必要每次启动都写三笔。
   * 三个键名仍取 `lib/constants.js` 的 `KEY_HUNGER/KEY_CLEAN/KEY_MOOD`（常量单一来源；
   * 它们的删除要连同本文件的引用一起做，见文件头部"入口本地常量"的注释）。
   */
  function clearLegacyVitalKeys() {
    try {
      api.settings.set(KEY_HUNGER, '')
      api.settings.set(KEY_CLEAN, '')
      api.settings.set(KEY_MOOD, '')
    } catch (err) {
      console.warn('[pet] 清理 v1 设置键失败：' + errMsg(err))
    }
  }

  // ————— 持久化（specs/pet-values R4 存档 requirement + design R7 写盘节流） —————
  /**
   * 节流签名：**显示口径的整数值 + 整数型字段 + 位置**。签名不变且距上次写盘 <60s ⇒ 跳过。
   *
   * v2 起签名只含真实**持久化字段**（design D-1 的白名单，与 `persist.serialize` 同一批）：
   * `growth` / `favor` 两个整数、道具、两个冷却基准与文本基准、位置。
   * v1 的三个属性已随 `pet-vitals` 删除（design D-10），连同"浮点衰减每 tick 都在动、
   * 只能按整数值判变化"的注释理由一起退役——现在参与签名的都是整数或时间戳，按原值比对即可。
   * `transient` / `transientSelf` / `speech` **故意不在签名里**：它们是运行时渲染态、不落盘，
   * 进签名只会让"播一轮动画"触发一次无意义的写盘（卡 19 的口径：到期推送零磁盘 IO）。
   */
  function persistSignature(s) {
    return [
      s.growth,
      s.favor,
      s.fish,
      s.bubble,
      s.lastInteractAt,
      s.lastPetAt,
      s.lastGrowthAt,
      s.lastAfkAt,
      s.lastTextAt,
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
      // v1 存档迁移（specs/pet-values R4）：`deserialize` 只在旧存档**真的带了三属性键**时为真。
      // 这里只记标志，诊断位与三个旧设置键在启动序列末尾处理（`resetDiagnostic` 会清空诊断位）。
      migratedFromV1 = result.migratedFromV1 === true
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
   * 下一次 rev++ 要等 `pet-tick`（15 秒，且只在属性真的变化时）或下一轮 `pet-perf`（1 分钟 / 60 秒）。
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
   * - **无窗体 / 数值高低**：与它们无关——到期后视图自然是按 `resolveStatus` 判定出来的真实状态
   *   （v2 只剩 idle 与未到期的 transient 两种，没有任何"数值过低"的负面姿态）。
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
    syncValueSettings() // 只在 rev++ 之后同步设置键（值没变，写的是同一批数字；见该函数的注释）
    hub.wake()
  }

  // ————— 气泡（specs/pet-interaction 的"气泡 4 秒"与"互动优先级"；design D-2 / D-6） —————
  /**
   * 气泡定时器的**秒数**（`api.timer` 只收 1–86400 的整数秒，api-reference.md:405-414,552-572）：
   * `max(1, ceil(剩余毫秒 / 1000))`。新气泡的剩余恰是 `BUBBLE_MS = 4000` ⇒ **4 秒**；
   * 早到重排与重建补排要按**剩余**算，所以统一从 `until - now` 推（同一个公式，三个调用点）。
   * `Math.max(1, ...)` 是下限保护：常量被改到 0/负数时宿主会拒绝非法秒数，宁可退化成 1 秒。
   *
   * 为什么不复用 `transientDelaySeconds`：那个函数带 86400 秒的**上限**与"畸形取 1 秒"的口径，
   * 是为动画轮长（1.4–1.8s）设计的；气泡是另一条独立的 4 秒语义（D-6），共用会让
   * "气泡哪天变长"悄悄受动画的钳制。两者只共享"向上取整、宁晚不早到"这条原则。
   */
  function bubbleDelaySeconds(until, now) {
    return Math.max(1, Math.ceil((finiteOr(until, 0) - finiteOr(now, 0)) / 1000))
  }

  /**
   * 为"当前这一条气泡"排一次到期清理（`pet-bubble`，一次性 setTimeout）。
   *
   * **覆盖语义（先清后设）**：互动反馈会替换当前气泡，所以这里固定先 `clearTimeout` 再 `setTimeout`，
   * 任何时刻**至多一个**待触发的清理（与 `armTransientExpiry` 同款，宿主对同 id 重复设置本就是重置，
   * clear 让 mock / 断言也看得到）。
   *
   * 没有气泡对象 / until 畸形 ⇒ 不排（不为不存在的气泡空转）。
   */
  function armBubbleExpiry(speech, now) {
    const until = speech && typeof speech === 'object' ? speech.until : undefined
    if (typeof until !== 'number' || !Number.isFinite(until)) return
    api.timer.clearTimeout(BUBBLE_TIMER_ID)
    api.timer.setTimeout(BUBBLE_TIMER_ID, bubbleDelaySeconds(until, now), onBubbleExpire)
  }

  /**
   * 当前气泡是否**仍在显示**（= 被占用）。判据只看 `until` 与 now：
   * 到期后即便回调还没跑（定时器漂移），也不算占用——视图侧 `buildView` 用的是同一口径
   * （`until > now` 才输出 `bubble`），两处必须一致，否则会出现"视图没有气泡但入口认为被占用"，
   * 定时文本被永久丢弃。
   */
  function bubbleActive(now) {
    const speech = state && state.speech
    return !!speech && typeof speech === 'object' && typeof speech.until === 'number' && speech.until > now
  }

  /**
   * 显示一条气泡（`state.speech`，运行时字段、不落盘）并把 `pet-bubble` 重排为 4000ms。
   *
   * **优先级只看"谁调用它"**（design D-6）：互动反馈直接调它 ⇒ **无条件替换**当前气泡并重排定时器
   * （互动反馈优先级最高，specs/pet-interaction 的"互动打断定时文本"scenario）；
   * 定时文本在调用前自己判 `bubbleActive`，占用时**不调用**（丢弃，不排队）。
   * 把判断留在调用方，是为了不让本函数偷偷丢弃"关键的失败反馈"（没有小鱼干这类）。
   *
   * @returns {boolean} 是否真的写了气泡（text 非空字符串才写）
   */
  function showBubble(text, tone, now) {
    if (!state || typeof text !== 'string' || text === '') return false
    state = { ...state, speech: { text, tone: tone === 'bad' ? 'bad' : 'good', until: now + BUBBLE_MS } }
    armBubbleExpiry(state.speech, now)
    return true
  }

  /**
   * `pet-bubble` 到期：清 `state.speech` → `rev++` → 唤醒推送。**不写盘、不动任何数值**
   * （气泡是渲染态，写盘签名里没有它）。
   *
   * 幂等：清完 `speech` 为 null，再次触发直接返回（不连推 rev）。
   * 早到（时钟回拨 / 定时器漂移）：`until` 还没到 ⇒ 不清、不推，按剩余秒数**重排**一次
   * （不重排的话这轮气泡会永远留在视图里，因为没有任何其它路径会来清它）。
   */
  function onBubbleExpire() {
    if (disposed || !state) return
    const now = Date.now()
    const speech = state.speech
    if (!speech || typeof speech !== 'object') return
    if (finiteOr(speech.until, 0) > now) {
      armBubbleExpiry(speech, now) // 早到：按剩余时间重排（不清、不推）
      return
    }
    state = { ...state, speech: null }
    rev++
    syncValueSettings() // 每次 rev++ 后同步设置键（与其它推送点同一口径）
    hub.wake()
  }

  // ————— 定时文本（specs/pet-favor：每 300 秒一条；design D-3 的 pet-text / D-6 的丢弃策略） —————
  /**
   * `pet-text` 每 300 秒（`TEXT_EVERY_SEC`）触发一次：按**当前等级**取样一条好感文本并弹 4 秒气泡。
   *
   * 取样口径（design D-5 / specs/pet-favor R1）：`levelOf(favor).level` 决定候选池（L1..LN 的并集，
   * 第 N 级 = N×12 条），`last` 传**上一次显示的气泡文本**做相邻去重。`last` 取 `state.speech.text`
   * 而不是另存一个游标：气泡文本本来就是"上一次显示的那一句"，多存一个字段只会多一处不一致。
   *
   * **丢弃策略（D-6，本卡的负向自检核心）**：气泡正被占用（互动反馈未过期）⇒ 本次**直接丢弃**：
   * 不排队、不补发、不 `rev++`、不排 `pet-bubble`、不动 `lastTextAt`——specs/pet-favor 的
   * "互动占用期间丢弃"scenario 就是这一条。绝不"延后 4 秒再冒出来"（那会在互动后突然冒一句陈旧文本）。
   *
   * 与动作节拍（`pet-tick` 60 秒 / `pet-perf` 60 秒）**互不取消**（specs/pet-favor 的"与动作节拍互不干扰"）：
   * 三只定时器各排各的，本函数只碰 `speech`，不碰 `transient`。
   *
   * 无窗体（`!overlayAlive`）时**不处理**：这不是 spec 要求的丢弃规则，而是同一件事的两种写法——
   * 关窗会清掉本定时器（见 `stopClocks`），能走到这里的只有"窗体在"的路径；
   * 保留这一句是为了防"定时器清掉前已排队的回调"在无窗状态下写一条没人看的气泡。
   */
  function onTimedText() {
    if (disposed || !state) return
    const now = Date.now()
    if (!overlayAlive) return
    if (bubbleActive(now)) return // 被互动反馈占用 ⇒ 丢弃（不排队、不补发、不 rev++）
    const last = state.speech && typeof state.speech === 'object' ? state.speech.text : undefined
    // 取样函数是卡 2 的纯模块（`lib/texts.js`）：`level` 决定候选池、`last` 做相邻去重
    const text = pickFavorText(levelOf(state.favor).level, last)
    if (!text) return
    // lastTextAt 是**持久化**的基准（design D-1 字段表）：推进它，重开后才不会"一启动就补一条"
    state = { ...state, lastTextAt: now }
    showBubble(text, 'good', now)
    rev++ // 状态落定后才 +1（D-8）
    syncValueSettings() // 每次 rev++ 后同步设置键（值没变 ⇒ 写的是同一批数字）
    hub.wake()
    void persistState(now)
  }

  // ————— 五个定时器的注册/清理（design D-3 定时器表；**唯一**的挂摘点） —————
  /**
   * 起三个**周期**定时器：
   * - `pet-tick` 60 秒（`TICK_SECONDS`）：结算成长与挂机奖励；
   * - `pet-perf` 60 秒（`RANDOM_PERF_EVERY_SEC`）：随机表演一轮；
   * - `pet-text` 300 秒（`TEXT_EVERY_SEC`）：好感文本一条。
   *
   * 三者的注册/清理**只在这里和 `stopClocks`**（单一挂摘点，避免"某条路径漏挂/漏摘"）：
   * 窗体创建成功 ⇒ `startClocks`；窗体销毁与 cleanup ⇒ `stopClocks`。
   *
   * 为什么跟窗体同生命周期，而不是像 v1 那样"进程内常驻"：design D-3 的"清理"列要求销毁窗体时清掉，
   * 且时间基准由 `onWindowDestroyed` 在销毁路径**一次性推进到当时**（"关窗不计成长/不挂机"的
   * 唯一实现点）⇒ 关窗期间没有 tick 也不会漏算。反之若常驻，就得靠每 60 秒一次的空转 tick
   * 去推基准（v1 的做法），关窗期间白跑进程。
   *
   * 重复调用是**幂等**的：宿主对同 id 重复 `setInterval` 就是重置，不会叠出两只。
   */
  function startClocks() {
    if (disposed) return
    api.timer.setInterval(TICK_ID, TICK_SECONDS, onTick)
    api.timer.setInterval(RANDOM_PERF_TIMER_ID, RANDOM_PERF_EVERY_SEC, onRandomPerf)
    api.timer.setInterval(TEXT_TIMER_ID, TEXT_EVERY_SEC, onTimedText)
  }

  /**
   * 清掉**全部五个**定时器：三只周期（tick / perf / text）+ 两只一次性（bubble / transient）。
   * 窗体销毁与 cleanup 共用（任务卡：销毁窗体后 `rec.timers.size === 0`）。
   * 不存在的 id 上 clear 是宿主的无操作（api-reference.md:413），可以无条件全调。
   */
  function stopClocks() {
    api.timer.clearInterval(TICK_ID)
    api.timer.clearInterval(RANDOM_PERF_TIMER_ID)
    api.timer.clearInterval(TEXT_TIMER_ID)
    api.timer.clearTimeout(BUBBLE_TIMER_ID)
    api.timer.clearTimeout(TRANSIENT_TIMER_ID)
  }

  // ————— 随机表演（design D-14 / 用户裁定 Q16；specs/pet-sprites 的随机表演 requirement） —————
  /**
   * 每 1 分钟（60 秒）随机播一轮"表演型"动作（`RANDOM_PERF_EVERY_SEC` / `RANDOM_PERF_SET` 是单一来源；**卡 22 / v1.0.2 用户裁定：原来的 10 秒太频繁 ⇒ 改为 1 分钟（60 秒）**）。
   *
   * 为什么用**周期定时器**（`api.timer.setInterval`，宿主级、整数秒）：`api-reference.md:405-414` 的
   * timer 只收 1–86400 的整数秒，1 分钟（60 秒）合法；宿主级定时器在主窗口最小化时**不**被节流
   * （渲染进程的 setTimeout 会被节流到 1s 粒度，周期会漂）。Q10/Q14 那套"2–5 分钟随机
   * `setTimeout` + `trotArmed` 重排"的独立定时器随之整条退役（design D-14"trot 定时器退役"）。
   *
   * 触发时的门控**只有两条**（都是"让位"，不是"放弃以后再也不播"——下一个周期照常再看一眼）：
   * ① 没有窗体 / 正在拖动 ⇒ 不表演（没人看；拖动中被拎起来的东西不该自己跑，D-13 互斥）；
   * ② 已经有 transient 在播（真实互动，或上一轮表演还没播完）⇒ 让位，绝不打断用户刚点出来的那一轮。
   * **v2 起没有「打盹时跳过」这条门控了**：打盹机制已删除（design D-10 / specs/pet-sprites 的
   * "宠物 MUST NOT 进入睡眠状态"），长时间无交互时随机表演必须照常每 60 秒一轮。
   * 也没有"属性过低时让位"的门控：三属性与 hungry/dirty/sad 三条指示轨一并删除，
   * 随机表演不存在需要让位的"负面真实状态"。
   *
   * 一轮只写 `state.transient`（与真实互动同一字段，复用既有 transient 机制与页面侧帧时钟），
   * 时长取 `TRANSIENT_MS`（= 该轨一轮的真实帧时长之和）。**副作用一个都没有**：
   * 不消耗道具、不改任何数值（成长/好感/库存）、不弹气泡、不推进 `lastInteractAt`、不写盘。
   * `run-left`/`run-right` 也只是原地播帧：这条路径里**没有** `api.overlay.setPosition`
   * （宠物不位移，design Non-Goals）。
   *
   * 卡 19（热修 D-1）：写 transient 时**必须同时置 `transientSelf: true`**——
   * 随机集里有 `eating`/`bathing`/`petted`/`playing` 四项与真实互动同名同轨，
   * 页面只拿到状态字符串，分不出"这一轮是随机抽的还是用户刚点的"，于是本地一轮播完后
   * 仍按入口的 `animStatus='eating'` 一直渲染（实机停留 5/10/15s、连成一片 24.98s）。
   * 来源只能由写入方记录：这里是唯一的"自发"写入点（真实互动在入口的 interact 分支写 false）。
   */
  function onRandomPerf() {
    if (disposed || !state) return
    const now = Date.now()
    if (!overlayAlive || dragging) return // 没窗体没人看；拖动中不自己跑（D-13 互斥）
    // 已有 transient 在播（真实互动 / 上一轮表演）⇒ 让位，不打岔
    if (resolveStatus(state, now) !== 'idle') return
    // 均匀随机抽一条：`Math.random` 可在测试里 mock 成确定值来钉住抽到哪一项
    const pick = RANDOM_PERF_SET[Math.floor(Math.random() * RANDOM_PERF_SET.length)]
    const ms = TRANSIENT_MS[pick]
    if (!pick || !(ms > 0)) return // 常量被改坏 ⇒ 宁可不动，也不写一个畸形 transient
    // transientSelf 与 transient 同生命周期：两者在同一次状态写入里落定，读档/初始态里都是干净值
    state = { ...state, transient: { status: pick, until: now + ms }, transientSelf: true }
    // 卡 19（R54）：到期主动推一次（R54 前要等下一次 pet-perf/pet-tick，页面会把这条表演轨挂住）
    armTransientExpiry(now, state.transient)
    rev++ // 状态落定后才 +1（D-8 次序）：页面据此换轨并播完一轮自行回落
    syncValueSettings() // 每次 rev++ 后同步设置键（表演不改数值，写的是同一批数字）
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
            // ————— 时钟（design D-3：五只定时器随窗体生命周期挂摘） —————
            // 建窗成功 ⇒ 起三只周期定时器（tick / perf / text）。它与销毁路径的 `stopClocks`
            // 成对出现，是本卡"五个定时器"的**唯一挂载点**（不在 init 里另起一次，
            // 否则关→开会叠出第二份注册；宿主对同 id 是重置，但读代码的人会以为有两处真相）。
            startClocks()
            // 唯独"transient 到期推送"要在重建时补排（v1 R54 的边界）：销毁路径会清掉它，
            // 若用户在某一轮还没到期时关→开（1.x 秒内），不补这一手那条边界又会退回
            // "姿态挂到下一次 tick"。已过期时 `transientDelaySeconds` 给 1 秒、
            // 回调的到期校验立刻放行 ⇒ 只补一次推送，不会空转。
            // 气泡同理：`speech` 是运行时字段，未到期就重建 ⇒ 按剩余秒数补排一次清理。
            const rebootAt = Date.now()
            if (state && state.transient && !disposed) armTransientExpiry(rebootAt, state.transient)
            if (state && bubbleActive(rebootAt) && !disposed) armBubbleExpiry(state.speech, rebootAt)
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
          // **五个定时器全清**（design D-3 的"清理"列；任务卡：销毁后 `rec.timers.size === 0`）。
          // 注意只清定时器、**不清** `state.transient` / `state.speech`：它们是渲染态，
          // `resolveStatus` / `buildView` 在 until 之后本就不再认它们，重建后页面拿到的是干净视图。
          stopClocks()
          hub.drain({ ok: false, error: TEXT.windowClosed }) // 丢弃该 overlay 的 pending 订阅（D-3/D-8）
          // ————— 关窗不计成长、也不发挂机奖励（specs/pet-values R1 的专门 scenario） —————
          // 两个累积基准都推进到"关窗这一刻"（lib/settle.js 的 onWindowDestroyed），并**立刻强制落盘**：
          // 否则进程退出后基准还停在关窗前，下次启动会把关窗时长算进补算里（关三小时涨 72 点）。
          // 这是本卡"关窗期间没有 tick"的**唯一**依据（时钟已随窗体清掉）。
          const closedAt = Date.now()
          if (state) {
            state = onWindowDestroyed(state, closedAt)
            void persistState(closedAt, true)
          }
          const res = await api.overlay.destroy(OVERLAY_ID)
          if (res && !res.ok) console.warn('[pet] 窗体销毁失败：' + res.error) // 宿主 destroy 幂等，理论路径
        }
      } catch (err) {
        console.warn('[pet] overlay 操作异常：' + errMsg(err))
      }
    })
  }

  // ————— 结算时钟（design D-5：tick 只负责"到点触发一次结算 + 唤醒订阅"） —————
  /**
   * `pet-tick` 每 60 秒（`TICK_SECONDS`）一次：结算成长 + 挂机奖励，必要时 `rev++` 推送。
   *
   * 🚩 **`{ overlayExists: overlayAlive }` 是本卡最容易踩的坑（任务卡要点第 0 条 / settle.js 的注释）**：
   * `settle` 的默认值是 **false**，语义是"宁可今天不涨，也不误发"。漏传或传错（比如传常量 true）
   * ⇒ 成长**永远不涨**、挂机奖励永远不发，且**不会有任何报错**；
   * 反之恒传 true ⇒ 关窗期间照样涨，违反 specs/pet-values R1 的"关闭显示期间不涨"。
   * 真实值只能是"浮层窗体此刻是否存活"（`overlayAlive`，由 create/destroy 两处维护）。
   * 关窗期间这条路径也不会跑（`pet-tick` 已随窗体一起清掉，见 `stopClocks`），
   * 基准由销毁路径的 `onWindowDestroyed` 一次性推进——两条路互为兜底。
   */
  function onTick() {
    if (disposed || !state) return
    const now = Date.now()
    const result = settle(state, now, { overlayExists: overlayAlive })
    for (const w of result.warnings) console.warn('[pet] ' + w) // 时间回拨等（D-5/R4）
    state = result.state
    if (result.changed) {
      // 次序固定（D-8）：状态落定 → rev+1 → 设置同步（设置页当帧刷新，api-reference.md:312）→ 唤醒订阅 → 节流写盘
      rev++
      syncValueSettings()
      hub.wake()
      void persistState(now)
    }
  }

  /**
   * **v1 的 `noteInteraction` 已删除**（悬停/拖动刷新 `lastInteractAt` 的那一段，连同它服务的打盹计时已删除）。
   * 原因：`lastInteractAt` **只剩一个语义**——喂食/洗澡的共享冷却基准（lib/interact.js）。
   * 因此悬停（`pet.hit`）与拖动**绝不能**再碰它：否则"把鼠标挪到宠物上"就会重置 10 分钟冷却，
   * 与 specs/pet-interaction R3「冷却必须持久化、按上次成功互动的时间计算」直接冲突。
   * 拖动的收尾只保留 design D-3 第二条硬细节：把 `lastAfkAt` 推到当时（见 `pet.drag` 的 end 分支）。
   */

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
        // 卡 3 的纯函数，五种返回（形状见 lib/interact.js 文件头，**不得**在这里改写）：
        //   成功      { ok:true,  anim:'eating'|'bathing'|'petted', text, state }
        //   共享冷却  { ok:false, reason:'cooling',     text, state }
        //   道具不足  { ok:false, reason:'no-item',     text, state }
        //   点击冷却  { ok:false, reason:'pet-cooling', anim:'petted', text, state }
        //   未知 kind { ok:false, reason:'unknown-kind', state }        ← 没有 text
        const result = interact(state, kind, now)

        // ① 未知 kind（含已移除的 play/summon/hide）：D-9「不弹气泡；诊断位记录」，状态一个字节都不动
        if (!result.ok && result.reason === 'unknown-kind') {
          const note = TEXT.unknownKind(String(kind))
          setDiagnostic(note)
          return { ok: false, reason: result.reason, error: note }
        }

        // ② 其余四种都带 state；`anim` 存在 ⇒ 写 transient（成功 = 该互动的轨；点击冷却 = petted）。
        //    `transientSelf: false` 是必须的（卡 19 / D-2）：这是**用户点出来的**那一轮，
        //    页面不能把它当自发表演折回 idle（否则"点了没反应"）。
        //    排一次性到期推送 ⇒ 播完由入口主动回落，不等下一次 tick（specs/pet-sprites 的"播完回落"）。
        state = result.state
        const animMs = typeof result.anim === 'string' ? TRANSIENT_MS[result.anim] : 0
        if (animMs > 0) {
          state = { ...state, transient: { status: result.anim, until: now + animMs }, transientSelf: false }
          armTransientExpiry(now, state.transient)
        }

        // ③ 气泡（D-6：互动反馈优先级最高，**无条件替换**当前气泡并把 pet-bubble 重排为 4000ms）。
        //    冷却/道具不足/点击冷却都带 text ⇒ 同样弹（specs/pet-interaction R5：不结算 ≠ 没有反馈）；
        //    未知 kind 早在上面返回了，不会走到这里。
        const tone = result.ok ? 'good' : 'bad'
        showBubble(result.text, tone, now)

        // 先算完再唤醒（D-8）：rev 只在状态落定后 +1。冷却类拒绝虽不改数值，但**视图变了**
        //（动画 + 气泡），所以同样要 rev++ 推送。
        rev++
        syncValueSettings() // 成功互动会改 growth/favor ⇒ 设置页两行当帧刷新
        hub.wake()
        // 成功互动必然改变整数签名（道具/好感/成长/两个冷却基准）⇒ 节流放行即可；
        // 冷却类拒绝不改任何持久化字段，签名不变 ⇒ 被节流跳过，不产生多余写盘。
        void persistState(now)
        return {
          ok: result.ok,
          reason: result.reason,
          state: currentView(now),
          feedback: { text: result.text, tone }
        }
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
        // v1 这里还有一次 `noteInteraction`（悬停算交互）：该函数与打盹机制一并已删除，
        // 悬停**不再**刷新 `lastInteractAt`（否则会把喂食/洗澡的 10 分钟冷却重置）。
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
              // D-13 互斥①：拖动期间不触发随机表演。卡 18 起不需要"清定时器"——1 分钟（60 秒）周期定时器
              // 一直在跑，靠 onRandomPerf 入口处的 `dragging` 判定跳过（拖动结束自动恢复，无需重排）。
              // D-13 互斥②（v2 修订）：加上 buildView 的 dragging 折叠（入口自发表演 → idle、气泡置 null），
              // 拖多久都不会"边拖边跑/冒气泡"（specs/pet-window 的"拖动中不踱步"）。
              // **不再**刷新 `lastInteractAt`：那个字段在 v2 只剩"喂食/洗澡共享冷却基准"一个语义，
              // 拖动若推它会白送一次冷却（v1 的 noteInteraction 已删除）。
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
            // design D-3 第二条硬细节：「任何成功互动与**拖动结束**后 MUST 把 `lastAfkAt` 推到当前时刻，
            // 下一次挂机奖励在之后 1200 秒」——松手算一次用户在场，挂机计时从这一刻重新开始。
            // `lastAfkAt` 是持久化字段，所以下面那次强制落盘会把它一起写下去。
            state = { ...state, lastAfkAt: now }
            void persistState(now, true) // D-13：拖动结束**强制落盘** position（绕过写盘节流）
            return { ok: true, position: state.position ?? null }
          } catch (err) {
            // 拖动是用户手上的实时操作：任何异常都不能让 rejection 逃进宿主渲染进程，
            // 也不能把 dragging 卡在 true（那会永久抑制随机表演）
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
    // 自己写的数值/等级/诊断键会回声到这里，必须滤掉，否则每 tick 都触发窗体判定。
    if (key !== '' && key !== KEY_VISIBLE) return
    const visible = api.settings.get(KEY_VISIBLE, true) !== false // 默认 true（跨卡契约：manifest 同默认值）
    void requestOverlay(visible)
    // 卡 17（Q15=B）：这里原来还有一段"关→开的跳变 ⇒ 清除隐藏态"（Q11 优先级）。
    // 隐藏态这个中间态已整条撤销 ⇒ 跳变逻辑连同它的本地镜像 `visibleNow` 一并删除：
    // toggle 的语义回到独一无二的一条——关 = 销毁窗体，开 = 重建窗体。
  })

  // 状态栏初始文本（D-12：脚手架贡献点里唯一保留的 pet.status，诊断用）
  api.statusBar.setText(STATUSBAR_ID, STATUSBAR_IDLE)

  // ————— 启动序列（D-5"启动"：读档 ⇒ 归一 ⇒ 按设置建窗（建窗即起时钟）⇒ 迁移收尾） —————
  const initPromise = (async () => {
    // 全量兜底：init 任何一步意外抛错（宿主拆除竞态、settings 存储异常……）都不能让
    // 扩展变成"消息面永远 notReady、时钟永远不起"的半残状态（D-9"不抛出、不影响宿主"）
    try {
      const now = Date.now()
      state = await loadPersisted(now)
      if (disposed) return
      // startupReset **不**重置累积基准：v2 的 R1 要求"重开时按存档里的 lastGrowthAt 补算"（≤24h），
      // 它只清运行时字段 + 把非法/未来的基准拉回 now（详见 lib/settle.js 的注释）。
      state = startupReset(state, Date.now())
      syncValueSettings() // 首帧就把成长/好感/精确好感值/等级名写进设置键（设置页打开即有值，含"首次安装写默认值"）
      const visible = api.settings.get(KEY_VISIBLE, true) !== false
      await requestOverlay(visible) // 建窗成功会顺手 startClocks（五个定时器的唯一挂载点）
      if (disposed) return
      // ————— D-1（卡 17 修复）：启动成功即无条件复位诊断位 —————
      // 判据 = 首次状态已就绪（state 在本函数开头就已读档 + startupReset）且**本次启动没有创建失败**
      // （设置里关掉了宠物、根本没建窗，同样算成功启动）。此刻"本次启动正常"已成事实，
      // 上一会话可能残留在 `pet.diagnostic` 设置键里的失败文案（设置存储落盘、跨会话留存）
      // 必须被写回 ''，状态栏回到「宠物」。
      // 启动失败时**不**复位：刚写下的「宠物窗体创建失败：…」正是给用户排查用的线索。
      if (!lastCreateFailed) resetDiagnostic()
      // ————— v1 迁移收尾（必须排在诊断复位**之后**，否则刚写的迁移诊断会被它抹掉） —————
      if (migratedFromV1) {
        clearLegacyVitalKeys() // 三个旧设置键置空串（api.settings 无删除 API；manifest 也不再声明）
        setDiagnostic(TEXT_MIGRATED_V1) // 迁移诊断只写一次（旧键已不存在，下次启动 migratedFromV1 为假）
        // **立刻重写一次存档**：把 v1 的三属性与流水账字段从 state.json 里真正抹掉
        // （`persist.serialize` 是白名单，写出来的文本里不再有它们）。不写这一手，
        // 下次启动读到的还是带 hunger/clean/mood 的旧文件 ⇒ `migratedFromV1` 又为真、诊断再写一遍，
        // "只写一次"就不成立。强制落盘（绕过写盘节流），只对 v1 老用户发生一次。
        void persistState(Date.now(), true)
      }
    } catch (err) {
      console.warn('[pet] 初始化异常（按可恢复处理）：' + errMsg(err))
      if (!state) state = initialState(Date.now()) // 兜底空态：消息面至少可用
      if (!disposed) {
        try {
          startClocks() // 时钟兜底注册（同 id 重复设置会被宿主重置，幂等）
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
    // **五个定时器全清**（design D-3 定时器表的"清理"列）：三只周期（pet-tick / pet-perf / pet-text）
    // + 两只一次性（pet-bubble / pet-transient）。统一走 stopClocks，与窗体销毁同一条路径（单一挂摘点）。
    stopClocks()
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

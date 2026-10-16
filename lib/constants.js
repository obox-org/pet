/**
 * 全部阈值、速率、键名、通道名与用户可见文案的**单一来源**（design D-3/D-4/D-5/D-7/D-9）。
 *
 * 为什么集中一处：这些数值同时被 lib 纯函数、入口 index.js 与 test/** 引用，
 * 散落各处会出现"改了速率忘了改文案"的漂移；文案必须**逐字**采用 design D-9 的表，
 * 集中定义让"逐字"可被测试直接断言。
 *
 * 本文件（与全部 lib/*.js）不碰注入的 api、不碰 DOM/IPC/定时器 —— 顶层零副作用，
 * 可被 node --test 直接 import（任务卡验收 ③）。
 */

/** 存档 schema 版本（specs/pet-vitals：顶层 MUST 含 schemaVersion:1；高于它 ⇒ 备份重建） */
export const SCHEMA_VERSION = 1

/** 存档文件名（扩展 data 目录内的相对路径，api.fs 沙箱根，api-reference.md:561-577） */
export const FILE_MAIN = 'state.json'
/** 原子写等价方案的中转文件（api.fs 无 rename，见 index.js persistState 的注释） */
export const FILE_TMP = 'state.json.tmp'
/** 损坏/超版本存档的备份名（specs/pet-vitals：MUST 备份为 state.json.bad，不得静默丢弃） */
export const FILE_BAD = 'state.json.bad'

/** overlay 窗体（design D-1：220×460、右下角、边距 24、透明+置顶+不占任务栏） */
export const OVERLAY_ID = 'pet.overlay'
export const OVERLAY_WIDTH = 220
export const OVERLAY_HEIGHT = 460
export const OVERLAY_MARGIN = 24

/** 结算时钟（design D-5：api.timer.setInterval('pet-tick', 15 秒)；timer 单位是秒，api-reference.md:405-414） */
export const TICK_ID = 'pet-tick'
export const TICK_SECONDS = 15

/**
 * 长轮询 hold 上限（design D-3）。
 * **25s 必须 < 宿主消息桥的 60s 单次请求超时**（guides-user.md:143）：
 * 若 hold 超过 60s，宿主会先判"扩展未响应（超时）"，页面拿到的是错误而不是正常状态，
 * 长轮询会退化成每分钟一次的报错重试。25s + 页面侧 10s 余量（app/lib/bridge.ts）仍留 25s 安全边界。
 */
export const SUBSCRIBE_HOLD_MS = 25_000
/** 宿主消息桥的单次请求超时（只用于测试断言 SUBSCRIBE_HOLD_MS 的安全边界，不是可调参数） */
export const HOST_REQUEST_TIMEOUT_MS = 60_000

/** 设置键（跨卡契约：卡 09 的 manifest contributes.settings 用同一批键，逐字一致） */
export const KEY_VISIBLE = 'pet.visible'
export const KEY_HUNGER = 'pet.hunger'
export const KEY_CLEAN = 'pet.clean'
export const KEY_MOOD = 'pet.mood'
export const KEY_DIAGNOSTIC = 'pet.diagnostic'

/** 状态栏诊断位（manifest contributes.statusBarItems 声明的 id；D-12：脚手架里唯一保留的贡献点） */
export const STATUSBAR_ID = 'pet.status'
/** 状态栏常态文本（出错时被 D-9 的错误文案替换，恢复后清回） */
export const STATUSBAR_IDLE = '宠物'

/**
 * 消息桥通道（design D-3 通道表 + 增补轮 D-13 的 `pet.drag`；子窗口页面按同一批通道派发）。
 *
 * `pet.drag` 与 `pet.subscribe` 是**互相独立的请求**：拖动是高频短请求（每帧一发、发完即回），
 * 长轮询是入口 hold 25s 的挂起请求。宿主桥按 requestId 逐个路由，`pet.drag` 不占用也不打断
 * `pet.subscribe` 的 pending 槽 ⇒ 拖动期间页面仍能收到状态推送（guides-user.md:131-145）。
 */
export const CHANNELS = {
  ready: 'pet.ready',
  state: 'pet.state',
  subscribe: 'pet.subscribe',
  interact: 'pet.interact',
  hit: 'pet.hit',
  drag: 'pet.drag'
}

/** `pet.drag` 的三个阶段（design D-13：start / move / end；其它值一律拒绝） */
export const DRAG_PHASES = ['start', 'move', 'end']

/**
 * 拖动位置的**标定探测坐标**（design D-13 缺口的兜底，父代理裁定 R31 后仅为兼容路径）。
 *
 * 为什么需要它：`pet.drag` 是**增量**协议（页面发 dx/dy），而 `api.overlay.setPosition` 收的是
 * **绝对**坐标 ⇒ 入口必须知道窗体当前的绝对位置才能累加。R31 之后 `create` 的成功回包已带
 * `position`（宿主 `overlayPosition(...)` 算出的实际坐标），入口直接记下即可，**正常宿主走不到这里**；
 * 只有"老宿主/畸形回包没带 position"时才需要标定：发一次必然被宿主按工作区钳位的远距离
 * setPosition，从回传的钳后坐标 `(maxX,maxY)` 反推 bottom-right 锚点默认位
 * `(maxX-margin, maxY-margin)`（与宿主 `overlayPosition` 的公式逐字一致，
 * `src/main/appWindow.ts:346-362`）。取 1e7 是因为它远超任何真实工作区坐标、又是有限数
 * （宿主对 NaN/Infinity **直接拒绝、不钳不猜**，`src/main/appWindow.ts:611-623`）。
 */
export const POSITION_PROBE = 1e7

/** 衰减速率（specs/pet-vitals：饥饿 -1/分钟、清洁 -10/小时、心情 -5/小时；内部按秒折算、保留浮点） */
export const DECAY_PER_SEC = {
  hunger: 1 / 60,
  clean: 10 / 3600,
  mood: 5 / 3600
}

/** 联动记账（specs/pet-vitals：每累计 10 点 ⇒ 心情 ±1，零头跨结算周期保留） */
export const LEDGER_STEP = 10
/** 经"恢复"途径的心情上限（specs/pet-vitals：恢复联动不得把心情推到 96 及以上） */
export const RECOVER_MOOD_CAP = 95

/** 挂机经济（specs/pet-economy：每满 1200s（20 分钟）发 1 鱼干 + 1 泡泡，库存上限各 20） */
export const AFK_PERIOD_SEC = 1200
export const ITEM_CAP = 20
/** 初始库存（design D-7：首次安装、无 state.json 时 3/3，避免首玩要等满一个挂机周期 AFK_PERIOD_SEC 才能喂食） */
export const INITIAL_FISH = 3
export const INITIAL_BUBBLE = 3

/** 互动增量（specs/pet-interaction：喂食 +5 饥饿 / 洗澡 +15 清洁 / 玩耍 +5 心情 / 点击 +1 心情） */
export const FEED_HUNGER = 5
export const BATHE_CLEAN = 15
export const PLAY_MOOD = 5
export const PET_MOOD = 1

/** 点击冷却（design D-7：300s；以"上次计分点击"为基准，冷却内仍播反馈不加分） */
export const PET_COOLDOWN_MS = 300_000

/** 气泡自动消失时长（design D-7：2600ms） */
export const BUBBLE_MS = 2600

/** 过低阈值（design D-7：三属性 < 30 分别触发 hungry/dirty/sad） */
export const LOW_THRESHOLD = 30

/** 入睡阈值（design D-7：连续 10 分钟无任何交互 ⇒ sleep；交互含点击/喂食/洗澡/玩耍/悬停，D-4） */
export const SLEEP_AFTER_MS = 600_000

/** 成长速率（specs/pet-growth：rate = max(0, 2 - 0.1*floor((100-mood)/5)) /小时） */
export const GROWTH_BASE_PER_HOUR = 2
export const GROWTH_PENALTY_PER_STEP = 0.1
export const GROWTH_MOOD_STEP = 5

/** 等级阈值与名称（design D-7：0–49 幼鲸 / 50–199 伙伴 / 200–499 挚友 / ≥500 深海羁绊） */
export const RANK_THRESHOLDS = [0, 50, 200, 500]
export const RANK_NAMES = ['幼鲸', '伙伴', '挚友', '深海羁绊']

/**
 * 写盘节流（design R7 的落地口径）：
 * "值变化"取**显示口径的整数值变化**（属性向下取整、道具/成长取整、lastPetAt 任何变化），
 * 或距上次写盘 ≥60s 才写。理由：浮点衰减每 15s tick 都在变，若按原始浮点判"变化"，
 * 节流形同虚设（回到 R7 说的约 4 次/分钟）；按整数值判则写盘频率 ≤ 约 1-3 次/分钟，
 * 且交互（道具/冷却为整数值）必然立即落盘。崩溃最多丢 60s 内的浮点零头，可接受。
 */
export const PERSIST_MIN_INTERVAL_MS = 60_000

/**
 * 瞬时动画的持续时长 = 对应动画轨一轮的总时长（design D-4 的逐帧时长求和，与 assets/whale/pet.json 一致）：
 * eating=jumping 300×3+350×2=1600ms；bathing/petted=waving 350×4=1400ms；playing/trot=running 250×6=1500ms;
 * run-left/run-right=running-left/right 225×8=1800ms（帧数取 pet.json 的 `frames` 第 2/1 行）。
 * 入口只用它决定"瞬时状态何时回落"；页面侧渲染按 pet.json 的实际 durations 走（app/lib/anim.ts）。
 *
 * 卡 18（Q16）起这里同时覆盖**随机表演**的三条新轨（`trot`/`run-left`/`run-right`）：
 * 随机表演复用同一套 transient 机制（同一字段、同一回落口径），所以时长也留在同一张表里，
 * 由 `test/mapping.test.js` 用真实 pet.json 的 trackTotalMs 逐条钉住（防止两处漂移）。
 */
export const TRANSIENT_MS = {
  eating: 1600,
  bathing: 1400,
  playing: 1500,
  petted: 1400,
  trot: 1500,
  'run-left': 1800,
  'run-right': 1800
}

/**
 * 随机表演（design D-14 / 用户裁定 **Q16**：卡 18 落地，取代 Q10/Q14 的"2–5 分钟独立小跑定时器"）。
 *
 * - **周期 10 秒**：宿主级 `api.timer.setInterval('pet-perf', 10, cb)`——timer 只收 **1–86400 的整数秒**
 *   （`docs/extension-api/api-reference.md:405-414,552-572`），10 合法；用宿主级定时器而不是渲染进程的
 *   setTimeout，是为了主窗口最小化时不被节流到 1s 粒度（会漂）。
 * - **随机集恰 7 项**（`RANDOM_PERF_SET`）：`eating`/`bathing`/`petted`/`playing`/`trot`/`run-left`/`run-right`。
 *   数组而非 Set：抽取要按下标（`Math.floor(Math.random() * length)`），顺序无意义。
 * - **MUST NOT 参与随机**：状态指示轨 `hungry`/`dirty`/`sad` 与 `sleep`——随机摆出"饿了/脏了/难过/睡着了"
 *   会与真实数值脱节，把"看一眼就知道它需要什么"的设计稀释掉（design D-14 的选择理由）。
 * - **无副作用**：不消耗道具、不改任何属性/库存/成长值、不弹气泡、不推进也不重置 `lastInteractAt`
 *   （它不是用户交互，不能把 `sleep` 推后）。
 * - **只原地播帧**：`run-left`(row2)/`run-right`(row1) 也**绝不**调 `api.overlay.setPosition`
 *   ——宠物不位移（design Non-Goals）。
 */
export const RANDOM_PERF_TIMER_ID = 'pet-perf'
export const RANDOM_PERF_EVERY_SEC = 10
export const RANDOM_PERF_SET = ['eating', 'bathing', 'petted', 'playing', 'trot', 'run-left', 'run-right']

/**
 * 用户可见文案的**单一来源**（design **D-16 文案总表** + D-9 错误与空态表，逐字采用、不得改写）。
 *
 * **两条硬规则（D-16 / 增补 Q12+Q13，测试用正则全表扫描钉住）**：
 * 1. MUST NOT 含「数字 + 时间单位」——`/\d+\s*(分钟|秒|小时)/` 0 命中；
 * 2. MUST NOT 含「属性增量数字」（`+5`/`+15`/`-1` 等）——`/[+-]\d+/` 0 命中。
 * 禁令覆盖气泡 / 面板（含三枚图标按钮的可访问名）/ 状态栏 / 设置页诊断的**全部**用户可见文案；设置页进度条的
 * `{cur}/100` 是用户明确要求的**值显示**（宿主渲染，不在本表内），不属反馈文案。
 *
 * 标 ★ 的五句与上游 dsh-pet **逐字一致**（出处见各行注释；R12：上游漂移**不自动跟随**）。
 * 页面侧（`app/lib/state.ts`）另有一份同文案的兜底表——页面与入口是两套构建、无法共享模块，
 * 两侧由 `test/actions-text.test.js` 的源码断言钉住一致。
 */
export const TEXT = {
  // ————— 反馈气泡（D-16 总表） —————
  /** ★ 摸头成功（上游 `affinity.ts` 逐字） */
  petOk: '咕噜咕噜～被摸摸好舒服！',
  /** ★ 摸头冷却（上游逐字；本就无数字时间——增补 Q12 废止了原来那句带剩余分钟数的文案） */
  petCooling: '摸过头啦，让鲸鱼娘歇口气～',
  /** ★ 喂食成功（上游 `affinity.ts` 逐字） */
  feedOk: '呜哇！小鱼干好好吃！',
  /**
   * ★ 喂食冷却（上游 `affinity.ts` 逐字，"晚点"为无数字口语，Q12=A 保留）。
   * 本扩展**喂食不设冷却**（specs/pet-interaction 只定义摸头 5 分钟冷却），故当前无逻辑引用；
   * 按 D-16"文案总表"收录并同受两条正则约束，将来若加喂食冷却即取此句（不再自拟）。
   */
  feedCooling: '吃饱啦，晚点再喂～',
  /** ★ 无小鱼干（上游 `ledger.ts` 逐字）：不扣不改属性 */
  noFish: '没有小鱼干了，多陪我工作一会儿吧～',
  /** 无沐浴泡泡（仿上游 `ledger.ts` 句式；上游无洗澡玩法） */
  noBubble: '没有沐浴泡泡了，多陪我工作一会儿吧～',
  /** 洗澡成功（本轮自拟，上游无洗澡；无数字，Q13） */
  batheOk: '泡泡好舒服～洗干净啦！',
  /** 玩耍成功（本轮自拟；无数字，Q13） */
  playOk: '玩得好开心！',
  /** 打盹提示（D-4：上游图集没有 sleep 轨，"Zzz" 由气泡/面板文字表达） */
  sleeping: '打盹中（Zzz）',

  // ————— 错误 / 诊断（D-9 + D-16 末行；同样不含时间/增量数字） —————
  /** D-8：窗体销毁后到达的交互/订阅一律拒绝 */
  windowClosed: '宠物窗体已关闭',
  /** D-9 窗体创建失败（状态栏 + 设置页诊断位同文案）；prefix 用于"恢复后只清同类诊断" */
  createFailedPrefix: '宠物窗体创建失败',
  createFailed: (reason) => `宠物窗体创建失败：${reason}`,
  /** D-9 持久化写失败（状态栏；下一次 tick 自动重试） */
  saveFailed: '宠物状态未能保存',
  /** 未定义通道（与脚手架同款口径，防止页面拼错通道时静默无响应） */
  unknownChannel: (channel) => `未知消息通道: ${channel}`,
  /** 任务卡负向自检：未知互动 kind 的拒绝文案。卡 17 起 `summon`/`hide` 也走这里（它们已不是合法 kind） */
  unknownKind: (kind) => `未知互动: ${kind}`,
  /** 任务卡负向自检：`pet.drag` 的 phase 缺失/未知 */
  unknownDragPhase: (phase) => `未知拖动阶段: ${phase}`,
  /** 任务卡负向自检：dx/dy 为 NaN/Infinity/字符串 ⇒ 拒绝且不移动（不做隐式转换） */
  dragBadDelta: '拖动增量非法：dx/dy 必须是有限数字',
  /** 入口既无自记位置、标定探测也失败 ⇒ 本次拖动不移动（不猜绝对坐标） */
  dragNoBase: '窗体位置未知，本次拖动未移动',

  // ————— 日志（console.warn 整行，含 [pet] 前缀；非界面文案，但同受两条正则约束） —————
  /** 存档尚未加载完成（理论上页面晚于加载，防御性文案） */
  notReady: '宠物状态尚未就绪',
  /** D-9 日志 */
  logVersionBad: '[pet] 存档版本不受支持，已备份并重建',
  logCorrupt: '[pet] state.json 损坏，已按初始值重建',
  logIgnoreInteract: '[pet] 忽略交互：窗体已关闭',
  /** D-13 位置失效回退：存档 position 非法（NaN/缺字段/非对象）⇒ 回退 anchor 默认值 */
  logPositionBad: '[pet] 存档窗体位置非法，已回退右下角默认锚点',
  /** 宿主 setPosition/create 成功但未回传 position（老实现）⇒ 以入口自记坐标为准，**只 warn 一次** */
  logNoPositionReply: '[pet] overlay 回包未带 position（宿主为 R31 之前的实现？），以入口自记坐标为准',
  /** 标定探测没被宿主钳位（异常实现）⇒ 不猜绝对坐标，放弃本次移动 */
  logCalibrateFailed: '[pet] 位置标定失败：宿主未按工作区钳位探测坐标，本次拖动不移动',
  /** 宿主没有 setPosition（apiVersion 门槛之外的异常）⇒ 拖动降级为"不移动"，只 warn 一次 */
  logNoSetPosition: '[pet] 宿主未提供 api.overlay.setPosition，拖动换位不可用'
}

/** settle() 返回的告警文本（不带前缀；入口打日志时统一加 [pet]，与仓库既有扩展一致） */
export const WARN = {
  clockRewind: '时间回拨（now < lastSettledAt）：dt 已钳 0，lastSettledAt 已重置为 now'
}

/** 三属性初始值（specs/pet-vitals 空态：三属性 100、成长 0；D-8） */
export const INITIAL_VITALS = { hunger: 100, clean: 100, mood: 100 }

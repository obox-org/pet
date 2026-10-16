# design — pet-desktop-companion（桌面宠物）

> 输入：`proposal.md`、`specs/{pet-window,pet-vitals,pet-economy,pet-growth,pet-interaction,pet-settings,pet-sprites}/spec.md`、`notes/grill.md`（Q1–Q8 + 附录 A）、`docs/extension-api/{api-reference,themes-settings,manifest-reference}.md`、参考实现 `extensions/webapp/src/theme.js`（已通读）。
>
> **UI 风格由用户在本步选定**（design 步强制项）：宠物窗体**不使用任何主题**——固定"透明 + 无边框"窗体，仿 dsh-pet；悬停面板用**固定深色玻璃 + 紧凑密度 + 10px 圆角**（用户选 A）。该裁定构成对"零自造色值 / 只用宿主 token"硬约束的**有意豁免**，范围与退场条件见 `## UI 视觉规范`。

## Context

- **宿主能力边界（已查实）**：App 卡窗口本来就 `frame: false`（`src/main/appWindow.ts:64-80`），但没有 `transparent` / `alwaysOnTop` / `skipTaskbar` / 初始坐标；扩展 API 没有创建或销毁自己窗体的能力（`api-reference.md:153-187` 只有 `api.app.register` 与 `api.app.onMessage`）；设置页只能声明字段（`api-reference.md:250,299`，字段类型 `text/number/boolean/select/directory/status`），**没有进度条类型**。⇒ 本设计依赖 proposal `## Impact` 列出的**四项**宿主新增能力（窗体选项、扩展自创建/销毁窗体、`progress` 字段、鼠标穿透+命中转发）。
- **子窗口约束（已查实）**：宠物窗体内的页面**没有 api 对象**，与主窗口**跨源、localStorage 不共享**（`api-reference.md:27,178`）⇒ 权威状态在扩展入口（主窗口插件函数内），子窗口只做渲染与回传交互，通道为 `api.app.onMessage` + `postMessage`（`api-reference.md:187`）；副作用（定时器/监听/注册）必须写在插件函数里（`api-reference.md:27`）。
- **主题桥**：`extensions/webapp/src/theme.js` 的 `installThemeBridge()` 是"子窗口跨源拿 token"的既有做法（宿主推 `obox-theme`、子窗口按 0/300/1000ms 请求重发、首帧用 `FALLBACK_TOKENS` 兜底）。**本扩展不接这座桥**（用户裁定窗体无主题）；被否决的理由见 D-6。
- **参考实现的样式基线**：`extensions/{rdp,webapp}/src/styles.css` 的密度/圆角基线**不适用**于"无主题的 artwork 窗体"；而**设置页由宿主渲染**（`SettingsView.vue`），其密度与标签列宽天然继承宿主既有规则，不需要扩展侧复刻。
- **驱动源**：obox 扩展拿不到 LLM 会话事件（`src/api/types.ts` 无 session/turn/tool 类事件）⇒ 状态机为**纯生活模拟**（grill Q1）。
- **素材来源（用户在 design 门禁裁定"宠物先用 dsh-pets 里的"）**：本轮内置**上游 dsh-pet 的鲸鱼娘图集**——`spritesheet.webp` 1,544,154 B + `pet.json` 838 B，取自 `DamonKoy/dsh-web-ui` 的 `packages/dsh-pet/assets/whale/`（上游主线为 `zhu1090093659/dsh-pet`，npm `@linxin666/dsh-pet`）。实测契约：**8 列 × 9 行、每格 192×208、整图 1536×1872**、`frames=[6,8,8,4,5,8,6,6,6]`、9 条 `tracks` 各带逐帧 `durations`（idle 400/400/500/400/400/500ms、waving 4×350ms、jumping 300·300·300·350·350ms、running 6×250ms、waiting 450·450·500·450·450·500ms、failed 450·450·450·500·550·600·450·450ms、review 6×550ms、running-left/right 8×225ms）。许可证处置见 D-10；AI 自制图集（grill 附录 A）延后为可选替换（OQ4）。

## Goals / Non-Goals

**Goals（本轮要达成，与 proposal 范围一致）**

1. 安装并启用后，主显示器工作区右下角自动出现**无边框 + 透明 + 置顶 + 不占任务栏**的宠物窗体；设置 toggle 关 = **销毁**窗体（省 CPU），开 = 重建且状态连续。
2. 三属性（饥饿度/清洁度/心情）按给定速率衰减、按联动规则互相影响、惰性结算且仅计运行期间。
3. 道具经济：挂机 20 分钟 +1 小鱼干 +1 沐浴泡泡（上限各 20）；喂食/洗澡消耗对应道具，玩耍不消耗。
4. 成长值 +2/小时，心情每缺 5 点则该小时 -0.1（下限 0），并在悬停面板显示数值与等级名。
5. 五种交互：点击（+1 心情，5 分钟冷却）、悬停（面板）、喂食（+5 饥饿）、洗澡（+15 清洁）、玩耍（+5 心情）。
6. 设置页「扩展-宠物」：显示 toggle + 三行 `progress` 进度条（右侧 `{cur}/100`，无描述）。
7. 图集契约：几何与帧时长由随图集的 `pet.json` **声明驱动**（内置上游鲸鱼娘：8 列 × 9 行、每格 192×208、整图 1536×1872、透明背景、每行帧数不等）；状态→动画轨有确定映射与优先级；窗体销毁时帧循环必须停止。

**Non-Goals（本轮明确不做；来自 grill 的显式延后项，在此定稿）**

- 不做**多宠物注册表 / 自定义宠物目录扫描**（本轮只有一只宠物 = 上游鲸鱼娘；目录仍按"目录 + `pet.json` + 图集"组织，为将来多宠物留口）。
- 不做 **Live2D / 骨骼动画**（只用帧动画图集）。
- 不做**离线（obox 关闭期间）衰减与收益**（grill Q4）。
- 不做**声音**。
- 不做**改名**（用户已把参照仓库的"改名"替换为"洗澡"）。
- 不做**沿屏行走 / 窗体内平移 / 跟随鼠标**（宠物不位移；`running-left/right` 两轨**只做原地随机表演**，见 D-14/Q16，MUST NOT 移动窗体）。
- 不做**多显示器选择**（固定主显示器；拖动也钳在主显示器工作区，Q9）。
- 不做**窗体内编辑设置**（属性只读展示，开关在宿主设置页）。
- 不做**"重置位置"按钮**（Q9：想回右下角就拖回去）。
- 不做**面板隐藏按钮 / 隐藏态 / 召唤胶囊**（Q15=B：隐藏只由设置页 toggle 承担 = 销毁窗体；D-15 已撤销）。
- 不做**互动按钮的文字标签与 emoji 图标**（Q15：三枚内联 SVG 图标一行，中文动作名只作为 `aria-label`/`title` 存在）。
- 不做**面板显示三属性**（Q13：悬停面板只显示成长值 + 等级名 + 库存；三属性**只在设置页**以进度条呈现）。
- 不做**反馈文案里的数字**：既禁"数字 + 时间单位"（Q12），也禁属性增量数字（如"心情 +5"，Q13）。

## Decisions

### D-1 窗体：单一透明置顶窗体，尺寸 220×460，精灵贴底、面板在其上方

- **选择**：经宿主新增的 **`api.overlay.create({ id:'pet.overlay', url, width:220, height:460, anchor:'bottom-right', margin:24, transparent:true, alwaysOnTop:true, skipTaskbar:true })`** 创建一个 overlay 窗体（**不注册 App 卡片**：本扩展是后台扩展，见 D-12）。窗体参数：`frame:false`（既有）、`transparent:true`、`backgroundColor:'#00000000'`、`alwaysOnTop:true`、`skipTaskbar:true`、`hasShadow:false`、`thickFrame:false`、`roundedCorners:false`、`resizable:false`、`maximizable:false`、`acceptFirstMouse:true`、`show:false` + `ready-to-show` 后显示；初始位置 = 主显示器 `workArea` 右下减去 24px 边距（`x = workArea.x + workArea.width - 220 - 24`，`y = workArea.y + workArea.height - 460 - 24`）。精灵区 192×208 贴窗体底部居中；上方 240px 为**面板预留区**（未悬停时全透明）。**透明的落地五处改动见 D-11**。
- **理由**：单窗体最简单；面板与精灵同窗体 ⇒ 悬停展开无需新建/移动窗体，也不会出现"面板与宠物分属两窗、层级错乱"。
- **被否决的备选**：① 窗体只占精灵大小、面板另开一窗（多窗体管理 + 悬停时创建窗体有闪烁与延迟）；② 面板覆盖在精灵上（挡住正在看的宠物）；③ 悬停时 `setBounds` 放大窗体（每次悬停都要主进程往返，且放大瞬间会短暂遮挡桌面）。

### D-2 鼠标穿透：窗体默认"穿透 + 命中转发"，命中精灵/面板时临时关闭穿透（**第 4 项宿主能力**）

- **选择**：宿主提供 `api.overlay.setMouseThrough(id, through)`（只作用于**本扩展自己创建的** overlay），内部实现为 `win.setIgnoreMouseEvents(true, { forward: true })` / `win.setIgnoreMouseEvents(false)`（`electron.d.ts:3392/6227`，`forward` 平台标注 `darwin,win32`，本机 win32 ✓）。宠物页在 `pointermove` 上做命中测试：命中精灵或面板 ⇒ 发 `pet.hit {inside:true}`；离开 ⇒ `{inside:false}`；扩展入口据此调用该 API。**窗体创建后默认穿透**（`through = true`）。
- **理由**：220×460 的透明窗体若不穿透，会**吞掉其覆盖区域内的桌面/其它窗口点击**（右下角正是常用区域）。`forward:true` 让页面仍能收到 mousemove，从而能自己判断"指针是否在宠物身上"。
- **作用域安全（validation N4）**：`api.overlay.create/destroy/setMouseThrough` MUST 按扩展 id 校验，只能操作**自己创建的** overlay——扩展与宿主同进程同上下文、无沙箱，不限定作用域等于让任一扩展能销毁或穿透别人的窗体。该约束由宿主 PR 实现并写进 `docs/extension-api/api-reference.md`。
- **被否决的备选**：① 不穿透（用户体验不可接受）；② 让宿主按像素 alpha 自动穿透（需要读回帧缓冲，成本高且 Electron 无此 API）；③ 窗体缩小到精灵尺寸（见 D-1 备选①的代价）。
- **回写**：本项需追加进 `proposal.md` 的 `## Impact`（宿主能力从三项变四项）；**不改任何 requirement**。

### D-3 状态权威在扩展入口，子窗口只渲染（消息桥通道与载荷）

- **选择**：入口持有 `PetState`（属性/库存/成长/`lastSettledAt`/窗体开关/冷却时刻），持久化到扩展 data 目录 `state.json`（`api.fs.writeFile/readFile`，`api-reference.md:561-577`）。子窗口经 `api.app.onMessage`（`api-reference.md:187`）取状态、回传交互。通道与载荷：

| 通道（channel） | 载荷（payload） | 返回 |
| --- | --- | --- |
| `pet.state` | 无 | `{ ok:true, state:PetStateView }` |
| `pet.interact` | `{ kind:'feed'\|'bathe'\|'play'\|'pet' }` | `{ ok:true, state:PetStateView, feedback:{ kind, text, tone:'good'\|'bad' } }` 或 `{ ok:false, error:'没有小鱼干了（挂机 20 分钟可得 1 条）' }` |
| `pet.hit` | `{ inside:boolean }` | `{ ok:true }`（入口据此调 `api.overlay.setMouseThrough('pet.overlay', !inside)`） |
| `pet.ready` | 无 | `{ ok:true, state:PetStateView }`（页面首帧拉一次，避免闪烁） |
| `pet.subscribe` | `{ rev:number }` | **hold 到状态变化或 25s 超时**后返回 `{ ok:true, state:PetStateView, rev:number }`；子窗口收到后立即重订阅（长轮询，见 D-3 的 S1 解法） |

  `PetStateView = { vitals:{ hunger:number, clean:number, mood:number }, items:{ fish:number, bubble:number }, growth:{ value:number, rank:number, rankName:string }, anim:{ row:number, label:string }, bubble:{ text:string, tone:string, until:number } | null }`
- **理由**：子窗口无 api 对象且跨源（`api-reference.md:27,178`），把权威状态放入口是唯一能保证"销毁重建后状态连续"的位置（`pet-window` 的 scenario 要求）。
- **被否决的备选**：状态放子窗口 localStorage（跨源不共享、销毁即丢）；状态放设置键（设置页会被三个数字刷屏，且 `api.settings` 是宿主可见配置，不适合高频写）。
- **状态同步方向（S1 的解法：长轮询订阅）**：现有 API **没有**"入口 → 子窗口主动推送"（`src/api/types.ts:163-170` 的 `api.app` 只有 `register`/`onMessage`；文档化通路是"子窗口请求 → 入口回答"，`api-reference.md:187,203-214`）。因此改为**长轮询订阅**：子窗口发 `pet.subscribe { rev }`，入口的 async handler **hold** 到状态 `rev` 变化（或 25s 超时）再 reply `{ ok:true, state, rev }`；子窗口收到后**立即重订阅**。效果等价于推送（状态变化后即时到达），且**零新增宿主能力**、无固定轮询开销；超时且 `rev` 未变时子窗口不重绘、只重订阅。窗体销毁时未决的订阅由入口丢弃（handler 侧按 `overlayId` 清理 pending 队列）。
  - **被否决的备选**：① 子窗口每秒轮询 `pet.state`（可见期间持续 RPC）；② 新增宿主"入口 → 子窗口推送"能力（要新定义一条 IPC 面，改动最大）；③ 参照仓库的 2s 轮询（同进程内无必要）。

### D-4 状态机：状态 → 上游动画轨映射 + 固定优先级；瞬时互动播完一轮回到判定

**素材前提**：内置图集是上游鲸鱼娘，它的 9 条轨语义为 `idle / running-right / running-left / waving / jumping / failed / waiting / running / review`（**没有** eating/bathing/playing/sleep 这些语义）⇒ 本轮按**语义就近**映射（用户裁定"先用 dsh-pets 里的"）；AI 自制图集到位后改为 1:1 恒等映射（R3 退场）。

**状态表**

| 扩展状态 | 上游轨（行号 / 帧数 / 逐帧时长） | 触发 | 界面表现 | 退出条件 |
| --- | --- | --- | --- | --- |
| `idle` 待机 | `idle`(0 / 6 / 400·400·500·400·400·500ms) | 默认（无其它状态命中） | 呼吸/眨眼循环，一轮约 2.6s | 任一其它状态命中 |
| `eating` 喂食 | `jumping`(4 / 5 / 300·300·300·350·350ms) | 喂食成功 | 开心跳跃一轮 + 气泡「呜哇！小鱼干好好吃！」（**上游 dsh-pet 逐字**，Q12） | 一轮播完（约 1.6s） |
| `bathing` 洗澡 | `waving`(3 / 4 / 4×350ms) | 洗澡成功 | 摆动一轮 + 气泡「泡泡好舒服～洗干净啦！」（**无数字**，Q13） | 一轮播完（1.4s） |
| `playing` 玩耍 | `running`(7 / 6 / 6×250ms) | 玩耍 | 原地跑一轮 + 气泡「玩得好开心！」（**无数字**，Q13） | 一轮播完（1.5s） |
| `petted` 摸头 | `waving`(3 / 4 / 4×350ms) | 点击宠物（含冷却内点击） | 挥手回应一轮 + 气泡：计分时「咕噜咕噜～被摸摸好舒服！」、冷却内「摸过头啦，让鲸鱼娘歇口气～」（**均上游逐字、均不含数字时间**，Q12） | 一轮播完 |
| `hungry` 饥饿 | `waiting`(6 / 6 / 450·450·500·450·450·500ms) | 饥饿度 < 30 | 等待投喂，循环 | 饥饿度 ≥ 30 或更高优先级状态 |
| `dirty` 脏 | `review`(8 / 6 / 6×550ms) | 清洁度 < 30 | 低头审视（就近映射），循环 | 清洁度 ≥ 30 或更高优先级 |
| `sad` 心情低 | `failed`(5 / 8 / 450·450·450·500·550·600·450·450ms) | 心情 < 30 | 低落，循环 | 心情 ≥ 30 或更高优先级 |
| `sleep` 打盹 | `idle`(0)，逐帧时长 ×1.5 | 连续 10 分钟无任何交互（点击/喂食/洗澡/玩耍/悬停） | 慢速呼吸 + 气泡/面板文字"打盹中（Zzz）" | 任一交互发生 |
| `trot` 原地小跑（**增补 Q10**） | `running`(7 / 6 / 6×250ms) | 自发：基础态为 `idle` 且指针不在窗体内、非拖拽时，随机间隔（默认 **2–5 分钟**，`lib/constants.js`；上限刻意小于 10 分钟入睡阈值，R40）触发 | 原地跑**一轮**（1.5s，落在 Q10 的 1–2s 区间），无气泡 | 一轮播完回落判定；期间任一交互/悬停/拖拽 ⇒ 立即回落 |

**优先级（同时命中取唯一一轨）**：瞬时互动（`eating`/`bathing`/`playing`/`petted`，播放中不可被打断）> `hungry` > `dirty` > `sad` > `sleep` > `trot` > `idle`。`trot` 的触发条件已要求"基础态为 idle"，故与 `sleep` 天然互斥（睡着不踱步）。
**帧时长**：以 `pet.json` 的 `tracks[轨名].durations` 为准（逐帧、不等间隔）；某轨未声明 durations 时回退 **250ms/帧**；`sleep` = `idle` 的 durations ×1.5。原设计的"120ms/帧"作废（与上游治愈系节奏不符）。
**缺帧容错**：按 `frames[r]` 声明的该行帧数取模循环，MUST NOT 越界采样相邻行（例：`waving` 只有 4 帧而列数是 8）。
**不使用的轨**：`running-left`(2) / `running-right`(1)——宠物不位移（Non-Goals）。

- **被否决的备选**：把 `hungry/dirty/sad` 合成一个"不适"态（信息量不足，用户看不出该喂还是该洗）；把 `sleep` 优先级提到最高（会导致"饿了却在睡觉"，掩盖需要照顾的信号）。

### D-5 结算：单时钟惰性结算，tick 只负责"到点触发一次结算 + 唤醒订阅"

- **选择**：入口用 `api.timer.setInterval('pet-tick', 15, ...)`（15 秒，`api-reference.md:405-414`）触发 `settle(now)`：
  1. `dt = max(0, now - lastSettledAt)`（**时间回拨/夏令时 ⇒ dt 钳到 0**，并把 `lastSettledAt` 重置为 now，日志 warn）；
  2. 按 dt 计算：饥饿 -1/min、清洁 -10/h、心情 -5/h（浮点累计，**显示时向下取整**，内部保留小数以避免长期漂移）；
  3. 联动记账：分别维护 `hungerDropAcc` / `cleanDropAcc` / `recoverAcc`（净变化累计），每满 10 点触发一次对应的心情增减，触发后扣掉 10 点（零头保留）；恢复途径把心情钳到 ≤ 95；
  4. 挂机：`idleAcc += dt`（仅当窗体存在），每满 1200s 发 1 鱼干 + 1 泡泡（各自钳到 20），`idleAcc -= 1200`；
  5. 成长：`growth += max(0, 2 - 0.1*floor((100-mood)/5)) * dt/3600`；
  6. 属性钳到 [0,100]；写 `state.json`（原子：先写 `state.json.tmp` 再 rename）；`rev` +1 并**唤醒挂起的 `pet.subscribe` 长轮询**（见 D-3，不做主动推送）；把三个属性写进设置键（`api.settings.set('pet.hunger', …)` 等，供 `progress` 字段渲染，`api-reference.md:291-318`）。
- **启动**：读 `state.json` ⇒ **把 `lastSettledAt` 重置为 now**（不追算离线，grill Q4）⇒ 若设置为显示则创建窗体。
- **休眠/卡顿**：tick 不触发期间的时间差在下次 tick 一次性补算（幂等：补算后立即推进 `lastSettledAt`）。
- **窗体销毁期间**：tick **继续跑**（属性照常衰减？——不。见下）：
  - 窗体销毁 ⇒ **挂机计时暂停**（`idleAcc` 不增，`pet-economy` scenario 要求）；
  - 属性衰减**继续**（`pet-vitals` 只要求"仅计运行期间"，未要求窗体存在）⇒ 关窗期间宠物仍会饿，重新开窗时按时间差一次补齐。
- **被否决的备选**：每分钟一个定时器直接扣 1 点（休眠/卡顿漏算，`pet-vitals` 的补算 scenario 过不了）；把状态写进设置键当权威存储（设置存储面向用户可见配置，高频写会污染，且无原子写保证）。

### D-6 视觉：窗体无主题（artwork 自带配色），面板固定深色玻璃

- **选择**：宠物窗体**不接主题桥**（不用 `installThemeBridge()`），精灵用图集原色；悬停面板 = 固定深色玻璃：底 `rgba(15,23,42,0.92)`、描边 `rgba(148,163,184,0.35)`、主文字 `#e2e8f0`、次文字 `rgba(226,232,240,0.72)`、强调/按钮渐变 `#7dd3fc → #38bdf8`、按钮文字 `#0f172a`、圆角 10px；**不使用 `backdrop-filter: blur()`**（官方文档：CSS blur 无法模糊透明窗口下方的桌面内容，加了只白耗 GPU——见 D-11 复核第 3 条），玻璃感由半透明底 + 描边实现；密度紧凑（行高 1.4、控件间距 6px、面板内边距 8px 10px）。
- **理由**：用户裁定（"宠物窗体不使用任何主题，固定透明窗体+无边框窗体，仿 dsh-pets"）+ 面板预设 A。深色玻璃在任何桌面壁纸上都可读，且与"宠物是 artwork"的定位一致。
- **被否决的备选**：接主题桥用宿主 token（深浅主题自适应，但透明窗体里放一块宿主面板色卡片与 dsh-pet 观感不同，且浅色主题下透明窗体边缘易发灰）；固定浅色玻璃（浅色壁纸上对比度不足）。
- **豁免登记**：见 `## UI 视觉规范` 的硬约束 1/2 条。

### D-7 等级与阈值（把 grill 的显式延后项定稿）

| 项 | 值 | 理由 |
| --- | --- | --- |
| 等级（成长值 → 名） | 0–49 `幼鲸` / 50–199 `伙伴` / 200–499 `挚友` / ≥500 `深海羁绊` | +2/h ⇒ 500 点 ≈ 250 小时挂机（≈10 天），节奏与参照仓库的 4 级亲密度相当 |
| 过低阈值 | 饥饿 < 30 → `hungry`；清洁 < 30 → `dirty`；心情 < 30 → `sad` | 30% 是"该照顾了"的直觉线；三者同阈值便于记忆 |
| 入睡阈值 | 连续 10 分钟无交互 → `sleep` | 短于挂机周期（20 分钟），使"挂着不管"先看到打盹 |
| 点击冷却 | 300 秒（计分）；冷却内点击仍播 `petted` + 气泡告知剩余分钟 | grill 成功标准⑥ |
| 初始库存 | 小鱼干 3、沐浴泡泡 3（首次安装、无 `state.json` 时） | 若为 0，用户装完要挂机 20 分钟才能第一次喂食，首玩体验差 |
| 气泡时长 | 2600ms 自动消失；互动反馈优先于状态气泡 | 与参照仓库一致 |

### D-8 边界（空/超长/极窄/并发）

- **空态**：无 `state.json` ⇒ 用 D-7 的初始值（三属性 100、成长 0、库存 3/3）；面板照常显示，不显示"暂无数据"。
- **超长文本**：气泡与面板文本单行截断（`text-overflow: ellipsis`），气泡最大宽 `min(200px, 窗体宽-20px)`；等级名最长 4 字（`深海羁绊`）不折行。
- **极窄/高 DPI**：窗体尺寸固定 220px，不随 DPI 缩放布局（Electron 已做 DPI 缩放）；面板在 220px 宽内三按钮**纵向堆叠**（一行一个），属性行"标签(56px 固定、左对齐) + 条(flex) + 数值(右对齐)"不折行。
- **并发**：同一 tick 内的多次交互按到达顺序串行处理（入口是单线程 JS）；交互处理**先算完再唤醒订阅**（`rev` 只在状态落定后 +1），避免两次唤醒把中间态发给子窗口；窗体销毁与交互并发时，销毁优先（销毁后交互返回 `{ ok:false, error:'宠物窗体已关闭' }`，并丢弃该 overlay 的 pending 订阅）。
- **重复激活**：入口被重复调用（宿主停用/启用）时，先跑上一次的 cleanup（释放定时器与窗体）再重新注册（`api-reference.md:30`）。

### D-9 错误与空态（用户可见中文文案 + 是否可重试）

| 情况 | 用户可见文案 | 可重试 | 处理 |
| --- | --- | --- | --- |
| 窗体创建失败（宿主返回错误） | 状态栏：`宠物窗体创建失败：<原因>`；设置页诊断位（`status` 字段，可选）同文案 | 是（toggle 关再开） | 日志 `[pet]`；不抛出、不影响宿主 |
| 图集加载失败（缺文件/解码失败） | 窗体内占位：灰色圆 + `图集加载失败` | 是（重启 obox） | 日志 `[pet]`；窗体仍创建，交互按钮仍可用（只是没有动画） |
| 持久化写失败 | 状态栏：`宠物状态未能保存`（下一次 tick 重试） | 自动 | 内存值继续运行；日志 warn；重试幂等（整文件覆盖写） |
| 持久化读失败/JSON 损坏 | 无（静默按空态处理），日志 `[pet] state.json 损坏，已按初始值重建` | — | 备份原文件为 `state.json.bad` 后重建 |
| 道具不足 | 气泡：`没有小鱼干了，多陪我工作一会儿吧～` / `没有沐浴泡泡了，多陪我工作一会儿吧～`（**无数字时间**；鱼干句为上游 dsh-pet 逐字，泡泡句仿其句式，Q12） | 否（需挂机） | 不扣不改属性 |
| 时间回拨（`now < lastSettledAt`） | 无 | — | dt 钳 0、重置 `lastSettledAt`、日志 warn |
| 窗体已销毁时收到交互 | 气泡无从显示；入口日志 `[pet] 忽略交互：窗体已关闭` | — | 返回 `{ ok:false }` |

**关于"道具不足」气泡的 UI 可达性（R24，卡 11 实机发现、卡 15 复核）**：上表"道具不足"一行由**入口**在收到该 kind 的交互时返回（桥级/异常路径可达）；页面侧另有一条"道具不足坏气泡"的**兜底分支**（`app/App.vue` 里对 `tone='bad'` 且回包缺 text 时的兜底文案），而**正常 UI 下不可达**——面板按钮在道具为 0 时是 `aria-disabled` 且 `onAct()` 会就地拦截，根本不会发出请求。该分支**保留**（防御畸形回包/老宿主），不视为死代码；本条备注即其存在理由。

### D-10 素材出处与许可证处置（上游鲸鱼娘图集）

- **选择**：把上游 `packages/dsh-pet/assets/whale/` 的 `spritesheet.webp`（1,544,154 B）与 `pet.json`（838 B）原样放进 `extensions/pet/assets/whale/`；**同时复制上游 `LICENSE` 原文**到 `assets/whale/LICENSE`，并在扩展 README 增加"素材出处"一节：上游仓库（`DamonKoy/dsh-web-ui`，主线 `zhu1090093659/dsh-pet`）、路径、许可证、以及"本项目与该素材作者无关联、未获背书"。
- **理由**：上游 `LICENSE` 文件是 **BSD-3-Clause**（© 2026 zhu1090093659），而其 `package.json`/npm 元数据写 **Apache-2.0**（自相矛盾）。两者都要求**保留版权与许可声明**，BSD-3 还额外要求**不得用作者名义背书** ⇒ **按较严的 BSD-3 履行即可同时满足两者**，无需向上游确认。
- **被否决的备选**：① 只用不声明（违反两种许可证的署名条款）；② 先联系上游澄清许可证再取用（阻塞本轮，且两种许可证的义务我们都能满足）；③ 改用 AI 自制图集（用户裁定"先用 dsh-pets 里的"；AI 契约保留为后续替换，见 OQ4）。
- **替换义务**：将来换成 AI 自制图集时，MUST 删除 `assets/whale/LICENSE` 与 README 的上游出处段，改记自制素材的来源与授权（不得留失效的第三方声明）——已写为 `pet-sprites` 的一条 requirement + scenario。
- **打包影响**：`.oix` 体积约 +1.5 MB；`scripts/pack.mjs` 需把 `assets/**` 纳入打包清单（dev 步核实其现有清单是否已含 `assets/`）。

### D-11 透明窗体的实现路径：复用 App 外壳的「overlay 模式」，五处一次改齐（S2 的解法）

- **选择**：overlay 窗体**复用**既有 App 窗体外壳（`AppWindow.vue` + `appWindow.ts`），由查询串 `?obox-window=overlay&extId=pet&overlayId=pet.overlay` 进入 overlay 模式；透明需要**五处同时改**，缺一处就不是透明窗体：

| # | 位置（已核实） | 现状 | overlay 模式改为 |
| --- | --- | --- | --- |
| 1 | `src/main/appWindow.ts:72` | `backgroundColor:'#1e1e1e'` | `'#00000000'` + `transparent:true`、`hasShadow:false`、`thickFrame:false`、`roundedCorners:false`、`acceptFirstMouse:true` |
| 2 | `src/renderer/src/AppWindow.vue:202` | 渲染 `<TitleBar>`（不透明标题栏） | `v-if="!isOverlay"` 不渲染（`<PromptHost>` 同样不渲染） |
| 3 | `AppWindow.vue:228` / `:233` | `.app-window` / `.app-window-content` `background: var(--bg,#1e1e1e)` | overlay 根 class 下 `background: transparent` |
| 4 | `AppWindow.vue:239` | `.app-frame { background:#ffffff }`（**iframe 白底**） | `background: transparent` |
| 5 | `src/renderer/src/assets/main.css:44-47` | **全局** `body { background: var(--bg) }` | 挂载前就地把 `html`/`body` 背景置 `transparent`（全局样式对每个窗口生效，漏这处前四处全白做） |

  扩展页面自身再加 `html,body{background:transparent}`，只有精灵与面板绘制像素。
- **为什么复用外壳而不是直接加载扩展页**：直接加载需要给 overlay 窗口挂 preload 才能与入口通信；**复用既有 preload 会把宿主 IPC 面暴露给扩展页面**，破坏"扩展页面跑在 sandboxed iframe 内、无 Node/IPC"的既有安全模型（`api-reference.md:176-187`：iframe 只能 `parent.postMessage`，宿主回 `obox-extension-reply`）；而**新写一个专用 preload + IPC 路由**则新增的宿主面比"关掉五处绘制"更大。复用外壳还能让 `api.app.onMessage` 消息桥原样可用（宿主按 `extId` 路由）。
- **可验收判据**：把窗体放在彩色壁纸上，取精灵与面板之外的一点截图像素，颜色 MUST 等于该处壁纸色（不是 `#1e1e1e`/`#ffffff`）——已写为 `pet-window` 的 scenario。
- **Windows 侧限制（记录为预期行为）**：`transparent` 依赖 DWM 合成（Win8+ 默认开启；被组策略关闭时透明失效并退化为不透明）；`transparent` **创建后不可运行时切换**（故只在 `create` 时决定）；全屏独占应用下 `alwaysOnTop` 窗体可能被遮挡；`setIgnoreMouseEvents` 的 `forward` 仅 `darwin,win32`（本机为 win32 ✓，`electron.d.ts:22298-22306`）。以上写进 `docs/extension-api/troubleshooting.md`（宿主 PR 的文档同步项）。
- **官方文档复核**（[Electron · 自定义窗口样式](https://www.electronjs.org/zh/docs/latest/tutorial/custom-window-styles) 的「透明窗口 → 局限性」节，逐条对齐）：
  1. **"你不能点击穿透透明区域"**（无逐像素穿透，electron#1335）⇒ 只能用 `setIgnoreMouseEvents` 做**整窗**切换，正是 D-2 的方案；**已知取舍**：指针命中精灵/面板期间，窗体的空白区也会一并捕获点击（220×460 范围内），移出后恢复穿透。
  2. **"透明窗口不可调整大小；设置 `resizable: true` 可能使透明窗口在某些平台上停止工作"** ⇒ D-1 的 `resizable:false`、`maximizable:false` 是**官方要求**，不是偏好。
  3. **"CSS `blur()` 仅适用于网页，无法对透明窗口下方的内容应用模糊"** ⇒ 面板**不得使用 `backdrop-filter: blur()`**（对桌面无效果，只白耗 GPU）；玻璃感改由半透明底色 + 描边实现（见 `## UI 视觉规范`）。
  4. **"打开开发人员工具时，窗口将不透明"** ⇒ **透明的验收必须在不开 DevTools 的前提下做**（用截图取色，见 `pet-window` 的像素判据 scenario）；这条直接约束 N6 的验证方法。
  5. **"在 Windows 上：透明窗口不能使用系统菜单或双击标题栏最大化"** ⇒ 与我们无标题栏 + `maximizable:false` 的设计一致，无额外动作。
  6. 无边框节另注：Wayland/GTK 下需 `hasShadow:false` 才是完全无边框 ⇒ 我们已设 `hasShadow:false`（跨平台一致，Linux 也安全）。

### D-12 后台扩展：不注册 App 卡片，脚手架残留全部清掉（S3 + N1 的解法）

- **选择**：本扩展是**后台扩展**——`manifest.json` 删除 `contributes.views`（`pet.tree`）、`contributes.commands`（`pet.hello`）、`contributes.i18n` 的 demo 词条；`index.js` 删除 `api.app.register({id:'pet.main', 900×640})` 与 `greet()`；删除 `app/theme.js`（不接主题桥，D-6）与 `app/style.css` 里的 `var(--token)` 残留；`test/extension.test.js` 的 6 条脚手架测试改为针对本扩展的纯函数测试。**保留** `contributes.statusBarItems` 的 `pet.status`（D-9/OQ3 的诊断位）与 `contributes.settings`（新增，toggle + 三行 `progress` + 一个只读 `status` 诊断位）。
- **理由**：用户明确"宠物是后台扩展，不注册到 app 里"；且卡片点开是 900×640 的普通窗口，与"右下角 220×460 透明置顶窗体"直接冲突（S3）。
- **被否决的备选**：① 保留卡片并改语义为"点卡片=创建/聚焦 overlay"（启动器里仍会多一个条目，与"后台扩展"矛盾）；② 注册卡片但标 `hidden:true`（宿主当前没有 hidden 语义，等于新增无用的贡献点字段）。
- **对外可见面（三处，仅此三处）**：设置页「扩展-宠物」、overlay 宠物窗体、状态栏诊断文本。

### D-13 拖动换位（增补 Q9）：页面发增量、入口换算并钳位、松手持久化

- **选择**：页面在精灵上 `pointerdown`（左键）⇒ 发 `pet.drag { phase:'start' }`；`pointermove` 期间按帧合并（rAF 节流）发 `pet.drag { phase:'move', dx, dy }`（**屏幕像素增量**，页面用 `movementX/Y` 或两次 `screenX/Y` 差）；`pointerup`/`pointercancel` ⇒ `pet.drag { phase:'end' }`。入口维护"当前窗体位置"：**启动时读存档的 `position`，无存档则取 `api.overlay.create` 回包的 `position`**（R31：create 与 setPosition 都回传实际绝对坐标，因为**扩展拿不到 workArea**，不能自己算 anchor 默认位）；`move` 时 `x+=dx, y+=dy` ⇒ 调 `api.overlay.setPosition(id, x, y)`，并用**回包的 `position`** 校正自记值（宿主兜底钳位后的真实坐标）；`end` 时把校正后的位置写进 `state.json`（与既有写盘节流同路径，但拖动结束**强制落盘**）。入口只做**数值合法性**校验（拒 NaN/Infinity/非数字），**几何钳位交宿主兜底**。
- **互斥**：拖动期间（start→end）抑制 `trot` 触发与 `sleep` 判定推进、不弹气泡；拖动中指针必然在窗体内 ⇒ 穿透已关（`pet.hit` 既有机制），无需额外处理。
- **位置失效回退**：启动读档时若存档位置**完全落在当前工作区外**（换显示器/改分辨率）⇒ 钳回工作区内（不丢弃存档）；若钳后仍非法（NaN 等）⇒ 回退 anchor 默认值并 warn。
- **被否决的备选**：① 页面直接算绝对坐标（页面不知道窗体在屏幕上的位置，跨源也拿不到）；② 用 `-webkit-app-region: drag`（透明窗体 + 整窗穿透切换下 region 与 hit-test 冲突，且无法钳位/持久化）；③ 宿主提供"beginWindowDrag"系统级拖拽（要新增 IPC 且与 forward 穿透交互复杂，增量方案已够）。
- **键盘可达性**：拖动是鼠标专属；键盘用户不做位置调整（Non-Goals 无"重置位置"，位置只能拖改）——在 UX 节注明。

### D-14 自发随机表演（增补 Q10 → **Q16 改为每 10 秒随机"表演型"动作**）

- **选择（Q16=A，取代原"2–5 分钟原地小跑"）**：入口维护一个 **10 秒**周期定时器（`RANDOM_PERF_EVERY_SEC = 10`，`lib/constants.js` 单点）；每次触发时若**当前不处于 `sleep`** 且没有更高优先级的瞬时互动在播，则从**随机集**里抽一条播**一轮**（约 1.4–1.6s），播完回落判定。
- **随机集（7 项）**：`eating`(row4 跳) / `bathing`(row3 挥手) / `petted`(row3 挥手) / `playing`(row7 原地跑) / `trot`(row7 原地跑) / **`run-left`(row2)** / **`run-right`(row1)**。状态指示轨 `hungry`(row6) / `dirty`(row8) / `sad`(row5) 与 `sleep` **MUST NOT** 参与——随机摆出"饿了/脏了/难过"会与真实数值脱节、稀释"看一眼就知道它需要什么"的设计。
- **`running-left/right` 终于用上（原地）**：Q10 时它们因"不做位移"而空置；本次纳入随机集但**只原地播帧**（MUST NOT 调 `setPosition`、MUST NOT 改窗体位置）——Non-Goal（不做沿屏行走/窗体内平移）不变。若实机观感别扭，从随机集删这两项即可（可逆）。
- **无副作用**：不消耗道具、不改任何属性/库存/成长值、不弹气泡、不推进也不重置 `lastInteractAt`（非用户交互，不能把 `sleep` 推后）。
- **优先级**：低于真实互动（`eating`/`bathing`/`playing`/`petted`）⇒ 用户互动可随时抢占它；高于 `hungry`/`dirty`/`sad`/`idle`（它是"表演"，短暂覆盖姿态 1.5s 后回该姿态）。
- **打盹期间暂停**（父代理默认口径，用户未反对）：`sleep` 时不触发，保持"睡着就该安静"。
- **trot 定时器退役**：Q10/Q14 的独立 2–5 分钟定时器（`TROT_MIN_SEC`/`TROT_MAX_SEC`/`trotTimer`）**删除**，职责并入本机制；R40 的 `TROT_MAX_SEC < SLEEP_AFTER_SEC` 关系断言随之退役（10s ≪ 10 分钟，天然成立）。`trot` 作为**状态条目**保留（就是"原地跑一轮"）。
- **理由**：用户要"每 10 秒随机播一个动作"（活泼）；随机而非固定顺序避免机械感；排除状态型轨保住状态语义。
- **被否决的备选**：B 全 9 轨随机（状态指示被稀释）｜C 两套机制并存（职责重叠、维护要同时看两处）。

### D-15 隐藏 / 召唤（增补 Q11 → **已撤销，Q15=B**）

**撤销理由**：用户裁定面板只保留"喂食/洗澡/玩耍"三枚图标（一行），**取消面板里的隐藏按钮**；失去入口后，隐藏态与召唤胶囊成为不可达功能，遂整条撤销。隐藏语义回到 Q2 的原意：**只由设置页 toggle 承担 = 销毁窗体**（真省 CPU），不再有"同窗体只渲染胶囊"的中间态。
**连带移除**（实现由卡 17 落地）：`state.json` 的 `hidden` 字段、`PetStateView.hidden`、`pet.interact` 的 `summon`/`hide` 两个 kind、召唤胶囊的渲染与样式、隐藏态的 hit-test 分支与 rAF 停摆逻辑、`TEXT.summon`/`TEXT.hiddenBlocked` 两句文案、设置 toggle 关→开清隐藏态的跳变逻辑、以及对应的 11 条 `test/actions-hidden.test.js` 用例（改为"断言这些通道/字段已不存在"的负向用例）。
**保留的历史备选记录**（当初为何选同窗体胶囊）：① 隐藏=销毁+状态栏召唤 ⇒ 主窗口收托盘时无召唤入口，且要把删掉的 command 加回来（违 D-12）；② 隐藏=`win.hide()` ⇒ 与 Q2"隐藏就是关闭窗体省 CPU"冲突，且隐藏时没有召唤入口。两者都不如"直接不要这个中间态"简洁——这正是 Q15=B 的取舍。

### D-16 反馈文案总表（增补 Q12 + Q13：禁数字时间、禁属性增量数字）

| 情形 | 文案 | 来源/约束 |
| --- | --- | --- |
| 摸头成功 | `咕噜咕噜～被摸摸好舒服！` | 上游 `affinity.ts` 逐字 |
| 摸头冷却 | `摸过头啦，让鲸鱼娘歇口气～` | 上游逐字（无数字时间） |
| 喂食成功 | `呜哇！小鱼干好好吃！` | 上游逐字 |
| 喂食冷却 | `吃饱啦，晚点再喂～` | 上游逐字（"晚点"为无数字口语，Q12=A 保留） |
| 无小鱼干 | `没有小鱼干了，多陪我工作一会儿吧～` | 上游 `ledger.ts` 逐字 |
| 无沐浴泡泡 | `没有沐浴泡泡了，多陪我工作一会儿吧～` | 仿上游句式（上游无洗澡） |
| 洗澡成功 | `泡泡好舒服～洗干净啦！` | 本轮自拟（上游无洗澡），无数字 |
| 玩耍成功 | `玩得好开心！` | 本轮自拟，无数字 |
| 打盹提示 | `打盹中（Zzz）` | 保留（无时间文本） |
| 三枚图标按钮的可访问名 | `喂食` / `洗澡` / `玩耍` | 控件标签（`aria-label` + `title`），非反馈文案；Q15 图标化后文字只以可访问名存在 |
| 错误/诊断（状态栏 + `pet.diagnostic`） | `宠物窗体创建失败：<原因>` / `宠物状态未能保存` / `[pet] 存档版本不受支持，已备份并重建` | 保留（D-9；不含时间/增量数字） |

**硬规则**：所有用户可见文案（气泡/胶囊/面板/状态栏/设置页诊断）**MUST NOT** 含「数字 + 时间单位」（分钟/秒/小时）与「属性增量数字」（`+5`/`+15`/`-1` 等）；面板**不显示三属性**（Q13），属性数值只出现在设置页进度条的 `{cur}/100`（那是用户明确要求的值显示，非反馈文案）。测试用正则断言：文案表全量扫描 `/\d+\s*(分钟|秒|小时)/` 与 `/[+-]\d+/` 均 0 命中。

## UX 与交互流程

**主路径**

1. 用户在扩展管理器安装 `pet-1.0.0.oix` → 宿主校验 `apiVersion`（`manifest-reference.md:20,300`）→ 激活扩展。
2. 入口读 `state.json`（无则初始值）→ 重置 `lastSettledAt` → 读设置 `pet.visible`（默认 true）→ 创建窗体（右下角）→ 起 15s tick。
3. 子窗口首帧发 `pet.ready` → 入口回状态 → 精灵按 D-4 判定播放 `idle`（或 `sleep`/`hungry` 等）。
4. 用户把鼠标移到宠物上 → 页面命中测试发 `pet.hit{inside:true}` → 入口关闭穿透 → 面板淡入（成长值+等级、鱼干/泡泡、三属性小条、三个按钮）→ 移出 → 面板淡出 → `pet.hit{inside:false}` → 恢复穿透。
5. 用户点"喂食" → `pet.interact{kind:'feed'}` → 入口校验库存 → 扣 1 鱼干、饥饿 +5、联动记账 → 播 `eating` + 气泡 → `rev`+1 唤醒挂起的 `pet.subscribe`（面板立即刷新；设置页进度条因 `api.settings.set` 当帧刷新）。
6. 用户点宠物本体 → `pet.interact{kind:'pet'}` → 冷却判定 → 计分或只播反馈 → 气泡告知（含剩余分钟）。
7. 用户在 设置 → 扩展 → 宠物 关掉"显示宠物" → 入口销毁窗体（帧循环随之停止）→ 挂机计时暂停；再打开 → 重建窗体、按时间差补算属性、状态连续，**且清除隐藏态**（Q11 设置优先）。
8. **拖动（增补 Q9）**：在精灵上按住左键拖动 ⇒ 窗体跟随（入口经 `api.overlay.setPosition` 钳位后移动）；松手 ⇒ 位置写进 `state.json`；重启后回到该位置。拖动期间不踱步、不入睡判定推进、不弹气泡。
9. **面板互动图标（Q15）**：面板底部一行三枚图标（喂食/洗澡/玩耍），横向等宽排列；道具不足的图标置灰禁用（`opacity .45` + `aria-disabled`）；每枚有 `aria-label` 与 `title` 中文动作名。**面板不提供隐藏入口**（Q15=B：隐藏只由设置页 toggle 承担 = 销毁窗体省 CPU）。
10. **自发随机表演（Q16）**：非打盹状态下每 **10 秒**从"表演型"随机集（eating/bathing/petted/playing/trot/run-left/run-right）抽一条原地播一轮（约 1.4–1.6s，无气泡）；用户互动可随时打断它；打盹期间暂停。

**失败路径**：见 D-9 表（每条都有可见文案与是否可重试）。

**键盘可达性**

- 精灵元素 `tabindex="0"`、`role="button"`、`aria-label="宠物（回车摸头）"`；面板三个按钮为原生 `<button>`。
- **Tab 顺序**：精灵 → 喂食 → 洗澡 → 玩耍 → 关闭面板。
- **焦点落点**：面板展开时焦点落在"喂食"；面板关闭时焦点**归还精灵**。
- **等价操作**：精灵上按 空格/回车 = 点击（摸头）；面板打开时 Esc = 关闭面板（**不关窗体**；关窗体只有设置页 toggle 一条路）。
- 键盘操作期间**不依赖鼠标穿透**：面板因焦点展开时，入口按"面板可见"关闭穿透（与 `pet.hit` 同一开关，取"命中或面板可见"的并集）。

## UI 视觉规范

**风格（用户选定）**：宠物窗体 = 透明 + 无边框 + 无主题（artwork 自带配色，仿 dsh-pet）；悬停面板 = 固定深色玻璃 + 紧凑密度 + 10px 圆角（预设 A）。

**色值与字号（面板；全部为固定值，不随主题变化）**

| 用途 | 值 |
| --- | --- |
| 面板底 | `rgba(15,23,42,0.92)`；**不加 `backdrop-filter: blur()`**——官方文档明确 CSS blur 无法模糊透明窗口下方的桌面内容，加了只白耗 GPU（D-11 复核第 3 条） |
| 面板描边 | `rgba(148,163,184,0.35)`，1px |
| 圆角 | 面板 10px；按钮/输入 6px；气泡 999px |
| 主文字 | `#e2e8f0`（12px/1.4） |
| 次文字（标签、库存数） | `rgba(226,232,240,0.72)`（12px） |
| 按钮 | 渐变 `linear-gradient(180deg,#7dd3fc,#38bdf8)`，文字 `#0f172a`，禁用态 `opacity:.45` + `cursor:not-allowed` |
| 焦点环 | `box-shadow: 0 0 0 2px rgba(56,189,248,0.85)` |
| 属性小条 | **已移除**（Q13：面板不显示三属性；属性数值只在设置页进度条，用宿主 token 渲染） |
| 气泡 | 好 `rgba(244,114,182,0.92)`／坏 `rgba(15,23,42,0.9)` + 描边 `rgba(125,211,252,0.5)` |
| 字体 | 系统字体栈（与宿主一致：`-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif`） |

**布局**：窗体 220×460；精灵区 192×208 贴底居中；面板区在精灵上方（`bottom: 208+6px`），宽 200px；面板内顺序 = 等级行（`深海羁绊 · 成长 128`）→ 库存行（`🐟 3 ｜ 🫧 3`）→ **互动图标行（喂食/洗澡/玩耍三枚图标，横向同一行、等宽、间距 8px）**。**面板不渲染三属性行**（Q13），**不含"隐藏"入口**（Q15=B）。**图标（Q15 + Q17）**：内联 SVG（`22px`、`fill: none`、`stroke: #ffffff`【Q17：白色线条】、`stroke-width: 1.6`、round cap/join）；按钮 **`background: transparent`**【Q17：底色透明】，`:hover` 给极淡白色叠加（`rgba(255,255,255,.08)`）+ 轻微放大感的描边高亮，`:focus-visible` 保留焦点环（白色 2px）；**悬浮（或键盘聚焦）即时显示动作名**：自绘浮层（`.tip`，绝对定位在图标上方，玻璃底 `rgba(15,23,42,.92)` + 白字 + 6px 圆角，无需等系统 `title` 的 ~1s 延迟），同时保留 `aria-label` 供读屏；不用 emoji、不用文字标签常驻、不用图标字体（运行时零依赖）。图标语义：喂食 = 一条小鱼、洗澡 = 泡泡/水滴、玩耍 = 球。禁用态（道具不足）= `opacity: .45` + `cursor: not-allowed` + 保留 `aria-disabled`，图标形状不变、仍可聚焦。
**面板开合（Q17）**：指针在宠物命中区**或**落在面板上 ⇒ 显示；离开 ⇒ **立刻关闭**——`closePanel()` 即时生效，MUST NOT 依赖过渡动画结束或延时定时器；`.panel` 的出现/消失过渡只允许作用在 `opacity/transform` 这类视觉属性上，且 MUST NOT 延迟 DOM 上的开合判定与命中矩形（命中矩形按 `panelOpen` 计算，与过渡无关）。

**七条硬约束的逐条落实**

1. **零自造色值** ⇒ **有意豁免（用户裁定）**：豁免范围**仅限宠物窗体内部**（精灵 artwork、面板、气泡、属性小条）。理由：窗体是桌面上的 artwork 覆盖层，用户明确要求"不使用任何主题、仿 dsh-pet"。**扩展的其余界面不自造色值**：设置页三行进度条与 toggle 由**宿主渲染**（天然使用宿主 token，`api-reference.md:299,310-318`），状态栏文本亦由宿主渲染。**退场条件**：若将来要求宠物跟随宿主主题，则改回 token 方案（需回 proposal/design 重定 D-6）。
2. **只用宿主主题 token** ⇒ 同上豁免；本扩展**不新增 token**、也**不接主题桥**（D-6）。宿主 25 个 token（`themes-settings.md:68-98`）在本扩展内**零引用**——这是豁免的直接后果，已登记。
3. **标签列固定宽、左对齐** ⇒ 面板已无属性行（Q13），该约束落到**设置页**：三行进度条由宿主渲染，沿用宿主既有标签列规则（`SettingsView.vue` 的 `.config-row label` 块级左对齐）；面板内等级/库存两行采用"标签左、数值右"的固定两列。
4. **窄窗口堆叠** ⇒ 窗体宽固定 220px，面板三按钮**纵向堆叠**（一行一个）；属性行在 200px 内不折行（标签 56 + 条 flex + 数值右对齐）。
5. **下拉选项说明写在选项文本内** ⇒ 本扩展**无下拉**（设置页只有 1 个 toggle + 3 个只读 progress）；并禁止将来用外部 tooltip 补语义（面板内所有说明直接写成文本）。
6. **模态框只能按钮关闭** ⇒ 本扩展**无模态框**：面板是悬停浮层（无遮罩、不夺焦、Esc 可关），窗体的关闭**只有设置页 toggle 一条路**（等价于"只能按钮关闭"）。
7. **中文文案** ⇒ 界面文案全中文（气泡/面板标签/按钮/错误），且错误文案**可执行**（例：`没有小鱼干了（挂机 20 分钟可得 1 条）`、`宠物窗体创建失败：<原因>`）。

**动效**：面板淡入 120ms；气泡 2.6s 后淡出；尊重 `prefers-reduced-motion: reduce`（关闭淡入淡出与气泡动画，帧动画降到每帧 400ms）。

## Risks / Trade-offs

| # | 风险 | 影响 | 退场条件 |
| --- | --- | --- | --- |
| R1 | `setIgnoreMouseEvents(true,{forward:true})` 在个别 GPU/驱动组合下 forward 不生效；且官方文档明确**没有逐像素穿透**（只能整窗切换） | 宠物窗体吞掉桌面点击，或命中测试失效（面板打不开）；悬停期间窗体空白区也会捕获点击（已知取舍） | 实测失效 ⇒ 退回"窗体只占精灵大小 + 面板覆盖宠物"（D-1 备选②），并去掉 D-2 的宿主能力 |
| R2 | 销毁/重建 `BrowserWindow` 有 200–400ms 开销，频繁 toggle 会闪 | 观感差 | toggle 加 300ms 去抖；仍闪则改为"销毁前淡出 120ms" |
| R3 | 上游图集**没有** eating/bathing/playing/sleep 语义的轨 ⇒ 本轮为就近映射（`dirty`→`review`、`sleep`→`idle` 慢放、`petted`/`bathing` 共用 `waving`） | 观感与语义不完全对得上（"洗澡却在挥手"） | 退场：按 grill 附录 A 的 AI 契约出 9 行 1:1 图集（行序即扩展状态），映射表改为恒等；或砍状态数（去掉 `dirty`/`sleep`） |
| R4 | 惰性结算遇到时间回拨/夏令时 | 负时长 ⇒ 属性反向增长 | dt 钳 0 + 重置 `lastSettledAt`（D-5 已含），并写测试 |
| R5 | 无主题豁免与宿主主题演进脱节 | 面板在浅色主题下仍是深色玻璃（用户已知并接受） | 用户要求跟随主题时按 D-6 退场条件改回 |
| R6 | 四项宿主能力未落地前扩展不可用（`apiVersion` 门槛会拒绝加载） | 交付顺序耦合 | 先发宿主 PR（含 `apiVersion` 递增与文档同步），再发扩展 `.oix`；README 写明最低宿主版本 |
| R7 | 15s tick + 每次结算写盘 | 磁盘写入频繁（约 4 次/分钟） | 改为"值变化超过阈值或距上次写盘 ≥60s 才写"；`state.json` 很小（<1KB），风险低 |
| R8 | Windows 透明窗体的平台限制：DWM 合成被关时透明失效、`transparent` 不可运行时切换、全屏独占应用下被遮挡、**打开 DevTools 时窗口变不透明**（官方文档，D-11 复核第 4 条） | 个别环境看不到透明效果或看不到宠物；**透明验收若开着 DevTools 必然失败**（会误判为宿主没改对） | 记入 `troubleshooting.md` 作为**预期行为**；N6 的验证方法固定为"不开 DevTools + 截图取色"；若用户环境普遍失效，退场方案是改为"主窗口内右下角浮层"（需宿主提供主窗口浮层贡献点，属新 change） |
| R9 | overlay 模式改的是**共用外壳**（`AppWindow.vue` / `appWindow.ts` / 全局 `main.css`） | 改错会影响既有 rdp/webapp 卡片窗口（背景变透明、标题栏消失） | 用 `isOverlay` 单一开关 + 根 class 隔离，且宿主 PR 必须回归验证既有两个扩展的卡片窗口（截图对比 + 标题栏存在性断言） |
| R10 | 拖动与踱步/隐藏/结算并发（增补） | 拖动中触发踱步会"边拖边跑"；拖动跨结算周期时位置与属性同时写盘可能互相覆盖 | D-13 互斥规则（拖动期间抑制 trot 与 sleep 推进）+ 位置写盘走"拖动结束强制落盘"、与属性节流写盘共用同一 serialize（单写者）；实机复验拖动静止后踱步才恢复 |
| R11 | ~~召唤胶囊的命中与穿透~~（**已随 Q15=B 撤销**：无隐藏态、无胶囊） | — | 保留编号以免其它文档的 R 编号漂移；风险不再存在 |
| R12 | 上游文案漂移（增补） | 将来上游 dsh-pet 改了 reaction 文案，我们的"逐字一致"就过期 | 文案表（D-16）在 `lib/constants.js` 单点维护并有测试钉住逐字值；上游漂移**不自动跟随**（跟随属新 change）；PROVENANCE 已记录上游版本锚点 |

## Open Questions

| # | 问题 | 谁回答 | 阻塞哪一步 |
| --- | --- | --- | --- |
| OQ1 | ~~初始库存 3/3、等级阈值（50/200/500）、过低阈值 30、入睡 10 分钟~~ —— **已裁定**：design 门禁通过时用户接受 D-7 全部默认值 | 用户（已答） | 已解除 |
| OQ2 | ~~obox 收进托盘时宠物窗体是否继续显示~~ —— **已裁定：继续显示**（独立置顶窗体，符合"桌面伴侣"语义） | 用户（已答） | 已解除 |
| OQ3 | ~~是否在设置页加只读 `status` 诊断位~~ —— **已裁定：加**（窗体创建失败/保存失败时显示原因，见 D-9） | 用户（已答） | 已解除 |
| OQ4 | AI 自制图集何时替换上游鲸鱼娘（替换后 D-4 映射改为 1:1、并按 D-10 删除上游 LICENSE 与出处声明） | 用户 | **不阻塞本轮**；作为 `ship` 之后的新 change |

未跑官方校验（缺 `openspec` CLI）。

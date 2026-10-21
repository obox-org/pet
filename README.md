# 宠物（obox 扩展）

桌面宠物：在屏幕右下角养一只鲸鱼娘——无边框透明置顶窗体里的精灵帧动画。喂食与洗澡能同时攒**成长值**与**好感值**，好感按固定阈值分 10 级、每级解锁一组新台词；数值**只涨不跌**，没有任何会随时间掉下去的属性。

- 扩展版本：**2.0.0**（`manifest.json` 的 `version`；分发包 `out/pet-2.0.0.oix`）
- 需要宿主 **`apiVersion ≥ 2`**（见「最低宿主版本」）

这是一个**后台扩展**：不在启动器 / 导航区出现，也没有 App 卡片。对外可见面只有三处：

| 可见面 | 位置 | 说明 |
| --- | --- | --- |
| 设置页「扩展 → 宠物」 | 宿主设置页（宿主渲染） | 1 个开关 + 成长值 + 好感进度条 + 好感精确值 + 等级行 + 诊断位（5 个逻辑行，见下） |
| 宠物 overlay 窗体 | 屏幕右下角 | 220×460 透明、无边框、置顶、不占任务栏 |
| 状态栏诊断位 | 宿主状态栏右侧（`pet.status`） | 常态显示「宠物」；出错时显示可执行的中文文案 |

## 运行位置（obox 2.0.0 宿主进程适配）

obox **2.0.0** 起用户扩展的入口跑在 **Extension Host Process**（Electron `utilityProcess`：完整 Node、**没有 DOM / `window` / `document` / `localStorage`**，入口由宿主按 `file://` 动态 `import()`），只有页面代码在渲染进程。本扩展的三端分工：

| 部分 | 跑在哪 | 说明 |
| --- | --- | --- |
| 入口 `index.js` + `lib/*.js` | **Extension Host Process** | `manifest.main` 指向它；它建窗、写盘、起定时器、跑消息处理器。**不得碰 DOM**（本扩展入口确实一个都没碰） |
| 页面 `app/` → `dist/` | **渲染进程**的 overlay 页面（`app://` 静态页，iframe 内） | 有自己的 DOM 与 `localStorage`（本扩展**不用**）；只做渲染与指针交互，全部能力经消息桥回入口 |
| 设置页 5 行 + 状态栏 | 宿主渲染（渲染进程 UI） | 入口写 `api.settings` / `api.statusBar`，宿主负责画 |

回退开关（设置 → 通用 → 「在独立进程中运行扩展」，或 `OBOX_EXTENSION_HOST=0`）关掉后，入口回到渲染进程执行，其余不变——本扩展两种运行时都支持。

### 浮层页面 URL 的构造方式（**宿主模式下唯一的硬阻塞点，已修**）

页面 URL 的校验只认 `app:` 协议 + 本扩展目录（宿主 `src/main/appWindow.ts` 的 `isOverlayUrlInsideExtension`：协议、host、首段 = 扩展 id、必须有子路径、不得含 `..`）。而**宿主模式下入口的 `import.meta.url` 是 `file://`**，所以不能直接拿它当页面 URL：

```js
// ✗ 宿主模式下会得到 file:///…/extensions/pet_chenzhi/dist/index.html
//   ⇒ 宿主 create 校验拒绝（"url 必须指向本扩展目录内的页面…"）⇒ 窗体建不出来、宠物完全不出现
new URL('./dist/index.html', new URL('.', import.meta.url).href).href

// ✓ 本扩展的实际写法（index.js 的 overlayPageUrl）：按协议分两条路
// - 回退模式（入口经 app:// 加载）：相对推导，天然是 app://extensions|debug/<id>/dist/index.html
// - 宿主模式（入口经 file:// 加载）：反推安装目录名，显式拼
//   const dirName = decodeURIComponent(new URL('.', import.meta.url).pathname).split(/[\\/]/).filter(Boolean).pop()
//   return `app://extensions/${dirName}/dist/index.html`
```

- **不硬编码 `app://extensions/pet/`**：安装目录名是 `<manifest.name>_<清洗后 author>`（本机为 `pet_chenzhi`），且它同时就是**宿主看到的扩展 id**（`main/capabilities.ts` 用目录名当 id）——所以反推出来的首段必然通过宿主的 `首段 === extId` 校验。
- **"页面能加载"的判断依据**（三条，缺一不可）：① 拼出来的 URL 过宿主 `create` 的 `isOverlayUrlInsideExtension`（本次已用宿主真实函数验证：`file://` 形状被拒、`app://extensions/pet_chenzhi/dist/index.html` 通过）；② 页面里全部资源都是**相对路径**（`vite base: './'`，图集与清单是 `../assets/whale/*`）⇒ 落成 `app://extensions/<目录名>/dist/assets/…` 与 `app://extensions/<目录名>/assets/whale/…`，对应 `dist/` 与 `assets/` 都在打包白名单里；③ 宿主数据/源码目录不变，文件都在。
- **验证边界（如实登记）**：本卡验到的是"URL 形状通过宿主校验 + 产物齐全"（用宿主真实校验函数与安装态目录名模拟跑通）；**页面在宿主模式的真机加载**属 obox 的 D8 实机验证卡，本卡未在真机 GUI 上跑。若实机仍不加载，先打印入口的 `import.meta.url` 与拼出的 URL 对照（很可能宿主接缝另有改动）。
- 页面**不允许**内联 `<script>`（srcdoc 会继承 CSP）；本扩展的产物是外部脚本，不受影响。

### 宿主模式下已知不可用的功能（技术债 #13，未修，属宿主侧）

**症状**：入口创建的 overlay 收不到 `api.app.onMessage`。原因是消息桥按 `overlayId` 找所属扩展的路由表（`overlayOwners`）只在**渲染侧**的 `api.overlay.create` 里回填，而宿主模式下 overlay 由宿主创建（`src/main/appWindow.ts` 的 `createOverlayWindow`），渲染侧那张表是空的 ⇒ 页面发来的请求一律回 `{ ok:false, error:'扩展未注册消息处理器' }`（`src/renderer/src/core/host.ts` 的 `handleExtensionMessage` / `resolveMessageExtId`）。登记见 `docs/extension-host-migration.md` 的 #13。

本扩展**完全依赖**页面 → 入口这一向（六条通道：`pet.ready` / `pet.state` / `pet.subscribe` / `pet.interact` / `pet.hit` / `pet.drag`），所以受影响的不是某个小功能，而是全部交互：

| 功能 | 宿主模式下（#13 未修） | 关掉「在独立进程中运行扩展」后 |
| --- | --- | --- |
| 窗体出现 + 精灵与呼吸待机动画 | ✅ 正常（页面本地资源 + 本地帧时钟） | ✅ |
| 面板等级名 / 库存数字 | ❌ 永远是空等级名与空态默认（3/3）——状态一次都拿不到，`syncing` 常驻 | ✅ |
| 悬停弹面板、点宠物摸头、喂食 / 洗澡 | ❌ 入口收不到 `pet.hit` ⇒ 从不 `setMouseThrough(false)` ⇒ 窗体保持创建时的**整窗穿透**，连点击都进不到页面（悬停、Tab 焦点同理） | ✅ |
| 气泡（互动反馈、定时文本） | ❌ 入口侧定时器照跑，但推送不出去 | ✅ |
| 拖动换位 | ❌ `pet.drag` 无人受理 | ✅ |
| 随机表演 | ❌ 入口写的 `transient` 推不出来，只剩本地 idle 循环 | ✅ |
| 设置页 5 行数值、成长/好感结算、`state.json` 落盘 | ✅ 全部在入口侧，不经过消息桥 | ✅ |

**恢复办法**：设置 → 通用 → 关掉「在独立进程中运行扩展」（或 `OBOX_EXTENSION_HOST=0`）后**重启**应用；代价是失去宿主进程隔离与完整 Node。宿主侧修法（不属本仓）见 #13 的退场条件：`host.overlay.create` 成功后把 `(overlayId → extId)` 同步给渲染侧。

### 持久化归属：页面无本地存储，真数据在入口

- **页面**：全仓 grep **零处** `localStorage` / `sessionStorage`——页面状态只是 `App.vue` 里的内存 `ref`，窗口销毁即丢。这不是缺陷：页面本就不承担持久化（也避免"页面存一份、入口存一份"两处真相）。
- **入口**：唯一持久化是 `api.fs` 写在 `<userData>/extensions/<安装目录名>/data/state.json`（写入走 `state.json.tmp` 读回校验，损坏时备份 `state.json.bad` 并按初始值重建）。宿主模式下 `api.fs` 的根仍是 **`<扩展目录>/data`**（`src/extension-host/apiFactory.ts` 的 `extensionDataDirOf`，与渲染进程模式逐字同一路径）⇒ **开关来回切不会丢档**。

### 定时器与宿主进程

五个定时器**全部**走 `api.timer`（宿主级、整数秒），没有任何裸 `setInterval` / `setTimeout`：三只周期（`pet-tick` 60s、`pet-perf` 60s、`pet-text` 300s）+ 两只一次性（`pet-bubble` 4s、`pet-transient` 按剩余秒数）。挂摘点各只有一处：建窗成功 `startClocks()`，销毁窗体与停用 `stopClocks()`（关窗即清，`rec.timers.size === 0`）。宿主模式下这些定时器由宿主进程实现，不随主窗口最小化节流。

### 设置页的读写时序（`api.settings` 同步读，不改）

`api.settings.get` 是**同步**签名，宿主只能读本地缓存；缓存靠渲染侧在 `host-renderer` 端口到达时推的那份快照校准（`src/renderer/src/core/extensionHostConsumer.ts` 的 `pushSnapshot`，早于 `init` 一个 IPC 往返）。所以：

- **写方向不受影响**：成长值 / 好感 / 精确好感值 / 等级名 / 诊断位都是入口 `api.settings.set` 写出来的（宿主同步通知，设置页当帧刷新），**不依赖任何同步读**；
- 唯一的同步读是 `pet.visible`（`init` 与 `onChanged` 各一次）。若快照真的还没到（异常时序，宿主会打一条 `数据面快照还没到…先返回缺省值` 的 warn），这一读会拿到默认 `true`：本次启动可能**多建一次窗体**（用户明明关着宠物），下一次 toggle 或重启即恢复。这是宿主侧时序的技术债，本仓不做"猜一次再重读"的绕法（没有可靠的"快照已到"信号可等）。

### 激活时机与 `apiVersion`

- **激活时机**：`manifest.json` **不写 `activationEvents` ⇒ 缺省 `*` = 启动即激活**。这正是常驻宠物要的：它没有 App 卡片、没有命令、没有视图，写 `onCommand:` / `onView:` 会**永不激活**。要显式化可以写 `"activationEvents": ["*"]`，与本字节行为完全等价，本次不改（避免为等价声明改动已发版清单）。
- **`apiVersion` 保持 `2`（本次不上调 3）**，理由三条：
  1. 本扩展用到的能力 v2 就已全部具备（`api.overlay` 四方法、`progress`/`status` 设置字段、整数秒 `api.timer`；`api.fs` / `api.settings` 更早就有），**宿主模式下这些能力的契约没变**（数据目录逐字同一路径）；
  2. 它**不依赖**任何 v3 才存在的宿主专属能力——不用 `api.globalState` / `workspaceState`（技术债 #16 的 memento 隔离差异与本扩展无关：入口从不读写 memento）；
  3. `apiVersion` 的语义是"**最低** API 门槛"，不是"我要跑在宿主里"的声明。写 3 会让 ≤ 1.0.17 的宿主**直接拒载**本扩展，而它在渲染进程模式下功能完全可用（页面 URL 保留了 `app://` 相对推导分支）⇒ 没有理由收窄兼容面。

## 玩法

### 互动与道具

| 互动 | 效果 | 消耗 | 动画轨 |
| --- | --- | --- | --- |
| 喂食（面板左侧图标） | 成长值 +1、好感值 +1 | 小鱼干 ×1 | `jumping`（开心地吃） |
| 洗澡（面板右侧图标） | 成长值 +1、好感值 +1 | 沐浴泡泡 ×1 | `waving`（摆臂 ≈ 擦洗） |
| 点击宠物本体（摸头） | 好感值 +1（**每小时最多 1 次**） | 无 | `waving` |
| **拖动**（按住精灵左键移动） | 窗体跟随换位，松手把坐标写进 `state.json`（重启回到该位置） | 无 | 无（移动的是窗体，不切轨） |
| **随机表演**（自发，非用户触发） | 每 **1 分钟（60 秒）**从 7 项"表演型"动作里随机抽一条**原地**播一轮（约 1.4–1.8 s，含 `run-left`/`run-right` 两条侧向原地跑），无气泡；播完立即回到呼吸待机（页面侧锁存 + 回落兜底定时器，不等入口下一次推送）；不耗道具、不改任何数值、不推进冷却基准 | 无 | `jumping` / `waving` / `running` / `running-left` / `running-right`（各一轮） |

- 面板**恰好两枚图标**：喂食（小鱼）与洗澡（泡泡），横向一行、间距 8px；可访问名逐字「喂食」「洗澡」。
- **共享冷却**：喂食与洗澡共用同一个 **10 分钟（600 秒）** 冷却窗口——任一次成功后，**两个图标都**在接下来 10 分钟内拒绝执行（气泡提示「刚互动过啦，让我歇一会儿～」），到期自动恢复。冷却**持久化**，重启后仍按上次成功互动的时间计算。
- **点击冷却**：摸头是独立的 **1 小时（3600 秒）** 冷却。冷却期内点击**不改变任何数值**，但仍会播放摸头动画并从 8 条冷却文本里随机显示一条。
- **判定顺序固定为：冷却 → 库存 → 结算**。两个门任一不满足就整体拒绝，**不消耗道具、不改数值**（先判冷却再判库存，避免在冷却期误报"没有小鱼干"）。时间戳缺失/非法/落在未来、或系统时钟回拨 ⇒ 一律视为"已到期"（宁可给用户一次互动，也不永久卡死）。
- 道具不足时不扣不改，气泡提示：`没有小鱼干了，多陪我工作一会儿吧～` / `没有沐浴泡泡了，多陪我工作一会儿吧～`。
- 气泡**任何一条都是 4 秒**（4000 ms）后消失。**互动反馈优先级最高**：它会立刻替换当前气泡；定时文本在气泡被占用时**直接丢弃**（不排队、不补发）。
- 拖动只响应**鼠标左键**，页面按帧（rAF）合并增量发 `pet.drag{phase,dx,dy}`，入口累加自记坐标后调 `api.overlay.setPosition`；**几何钳位（工作区/任务栏）由宿主兜底并回传钳后坐标**，入口只拒绝 `NaN`/`Infinity`。拖动期间抑制随机表演、不弹气泡，且**不刷新共享冷却**（拖窗口不会白送 10 分钟冷却）。

### 面板与键盘

- **悬停面板**（指针命中精灵时淡入，宽 200px，玻璃底）：顶部一行**只读等级名**（如「渐渐熟悉」）→ 两枚图标按钮。面板上**没有任何数字**（成长值与好感的精确值只在设置页）。
- 图标是**内联 SVG**（22px、`fill: none` + `stroke: #ffffff`【白色线条】、线宽 1.6、圆头圆角），按钮**底色透明**（无渐变），悬浮时用宿主 token 的 `--hover-bg` + `--border` 高亮，键盘焦点环为**白色 2px**；**不用文字标签、不用 emoji、不用图标字体**（运行时零依赖）。中文动作名在悬浮（或键盘聚焦）时**即时**显示在图标上方的自绘浮层 `.tip`（无延迟），同时保留 `aria-label` 供读屏。道具不足的那一枚显示为禁用态（`opacity .45` + `cursor: not-allowed` + `aria-disabled="true"`，图标形状不变），**但仍可聚焦、浮层照常显示动作名**。
- **Tab 顺序**：精灵 → 喂食 → 洗澡 → 关闭面板；面板展开时焦点落「喂食」，关闭时焦点归还精灵；精灵上 空格/回车 = 摸头，面板打开时 Esc = 关面板（**不关窗体**，关窗体只有设置页开关一条路）。
- **面板开合**：指针在宠物命中区**或落在面板上** ⇒ 显示；离开 ⇒ **立刻**关闭——`closePanel()` 同步翻转状态位与命中矩形缓存，开合判定是纯函数 `panelShouldOpen(hovered, focusOpened, dragging)`，**不依赖任何过渡动画或延时定时器**（`.panel` 的 120 ms 过渡只作用在 `opacity` 上）。拖动中不弹面板，松手时指针若仍在精灵上，面板照常出现。

## 数值

### 成长值（只增、不驱动任何功能）

- 两个来源：**每次成功喂食或洗澡 +1**；**连续运行每满 1 小时 +1**（进程内按时间差结算；重开时按存档里的上次结算时间补算，单次补算上限 **24 小时**，防改系统时钟刷值）。
- **只增不减、无上限**，且**不参与等级判定、不解锁任何动作或文案**：它只是一个纯累计数字，用于"陪伴时长"的可视化。
- **关闭「显示宠物」期间不计成长**：销毁浮层窗口时把"上次结算时间"推进到当时，重新打开后从那一刻重新计时（关三天再开**不会**一次涨 72 点）。

### 好感值与 10 级

- 两个来源：**每次成功喂食或洗澡 +1**；**每次冷却已过的点击 +1**。**只增不减、无上限**（满级后继续累加），冷却期内的点击不加。
- 等级只看好感值，按固定阈值取"满足阈值的最大级"（单调不减，初始 0 = 第 1 级）：

| 级 | 等级名 | 累计好感 ≥ |
| --- | --- | --- |
| 1 | 初次见面 | 0 |
| 2 | 点头之交 | 20 |
| 3 | 渐渐熟悉 | 50 |
| 4 | 开始依赖 | 90 |
| 5 | 相互惦记 | 140 |
| 6 | 心有灵犀 | 200 |
| 7 | 形影不离 | 280 |
| 8 | 无话不谈 | 380 |
| 9 | 彼此唯一 | 500 |
| 10 | 命定相伴 | 650 |

- 面板那一行等级名**随好感变化即时更新**（面板开着时升级也会变）；满级（650）后继续累加，等级停在最高级、不回落，好感真值仍可在设置页「好感（精确值）」一行看到。
- 阈值表是**唯一**可调难度的地方（`lib/constants.js` 的 `FAVOR_THRESHOLDS` / `FAVOR_LEVEL_NAMES`），改它不动结构。

## 文本

- 好感文本共 **128 条**：**120 条等级文本**（L1–L10 每组 **12 条**）+ **8 条冷却文本**（点击冷却期专用，不参与等级解锁，第 1 级与第 10 级都能看到）。
- **每 5 分钟（300 秒）显示一条**（与 60 秒的动作节拍、3600 秒的成长结算相互独立、互不取消），气泡 4 秒。
- **等级揭示规则**：当前第 N 级时，取样范围是 **L1..LN 的并集**（第 N 级的候选池 = N × 12 条）——高等级仍能看到低等级文本，**低等级绝不会出现高等级文本**。取样为**均匀随机**，且**不连续两次取到同一句**（相邻去重）。
- **硬约束**（由自动化测试逐条正则扫描全部 128 条）：**不含任何阿拉伯数字**；**不含时长单位「分钟 / 小时 / 秒」**（「今天 / 明天 / 每天」这类日常"日子"词允许）；**不承诺任何功能**（不写"提醒你""帮你记着"）；**不出现旧属性名**（饥饿 / 清洁 / 心情）；单条 ≤ 24 字（4 秒气泡读得完）。
- 文本正文的唯一来源是 `lib/texts.js`（页面与入口共用同一份，页面不重复抄写）；上游 dsh-pet 的文案漂移**不会自动跟随**，跟随属新的一次 change。

## 设置页（设置 → 扩展 → 宠物）

5 个逻辑行（共 6 个 `contributes.settings` 字段：进度条按 650 封顶，精确好感值单独一行）：

| 行 | 字段 | 类型 | 说明 |
| --- | --- | --- | --- |
| 显示宠物 | `pet.visible` | boolean | **关 = 销毁窗体**（真正释放渲染进程与 rAF 帧循环，省 CPU；实测 rAF 窗体单核当量 ≈2.18%，销毁后 0.0 ms/10 s），**不是隐藏**；再开 ⇒ 重建窗体并回到存档位置，数值连续。**隐藏（把宠物收起来）只由本 toggle 承担**——它等于销毁窗体、真省 CPU；面板里没有、也不再有那个入口 |
| 成长值 | `pet.growth` | status（只读文本） | 精确整数（入口写字符串）。成长值无上限，本行如实显示、不被吞掉 |
| 好感 | `pet.favor` | progress（只读，`max: 650`） | 进度条显示 `{cur}/650`。**宿主会把这个数字钳到 `[0,650]` 再向下取整** ⇒ 好感满级（650）后继续累加时进度条保持满格、数字停在 `650/650`（真实值见下一行） |
| 好感（精确值） | `pet.favorExact` | status（只读） | **精确好感值**（入口写字符串、不钳）。好感无上限，满级后每一次互动仍继续累加 ⇒ **只有这一行能看到 650 以上的真值** |
| 等级 | `pet.level` | status（只读） | 当前等级中文名（如「初次见面」）；与好感行同一时刻刷新 |
| 诊断 | `pet.diagnostic` | status（只读） | 正常为空；窗体创建失败 / 状态保存失败时显示与状态栏相同的可执行文案（如 `宠物窗体创建失败：<原因>`）。它是**落盘**的设置键：启动成功（窗体建好且状态就绪）后扩展会**无条件**把它写回空、状态栏写回「宠物」，因此上一会话残留的失败文案不会跟到新会话 |

- 四个数值键（成长值 / 好感 / 好感精确值 / 等级名）在**每一个状态推送之后**同步写入（`api.settings.set` 同步通知，设置页当帧刷新）。
- 每个字段都**不声明 `description`**，且只使用宿主既有字段类型（`boolean` / `status` / `progress`）——不抬 `apiVersion`。
- v1 的三个属性设置键在迁移时被置空串（`api.settings` 无删除方法），`manifest.json` 也不再声明它们。

## 历史沿革（v1 → v2）

v2 是一次**业务模型重做**，下面这些 v1 能力被整体移除（不是"暂时停用"），因此代码、测试与验收口径里都不再允许出现它们：

| v1 能力 | 处置 | 原因 |
| --- | --- | --- |
| 三属性体系：`hunger`（饥饿）/ `clean`（清洁）/ `mood`（心情）三条 0–100 属性、各自的衰减速率、上限钳制与联动记账（`hungerDropAcc` / `cleanDropAcc` / `recoverAcc`） | **删除**（spec `pet-vitals` 的 4 条 REMOVED） | 用户要求移除会掉值的属性；职责被"只涨不跌的成长值 + 好感值"取代，衰减与维护压力一并消失 |
| 属性过低的三条负面表情轨（`hungry` / `dirty` / `sad`）与 `LOW_THRESHOLD` 阈值判定 | **删除** | 依赖三属性阈值；新模型没有"过低"状态 |
| 打盹：连续 10 分钟无交互 ⇒ `sleep` 状态、`SLEEP_AFTER_MS`、`idle` 轨 1.5 倍慢放、Zzz 提示文案 | **整体删除**（design D-10 的连带清理） | 用户要求取消打盹；长时间无交互时宠物保持正常待机与正常节拍 |
| 第三种互动（`play` kind）、以及更早的两条通道 kind（把宠物叫出来 / 收起来） | **删除**（按"未知互动"拒绝，状态一个字节都不变） | 面板只剩喂食/洗澡两枚图标；点击宠物本体的"摸头"保留 |
| 成长速率公式（`growthRatePerHour` / `growthDelta`，按心情打折）与按成长值分级的 `rankOf`（幼鲸/伙伴/挚友/深海羁绊） | **删除** | 成长值改为"只增、不参与等级"；等级改由好感决定（10 级） |
| 2600 ms 气泡、15 秒结算 tick、面板三枚图标 + 五行 | **改写** | v2 为 4000 ms 气泡、60 秒 tick、两枚图标 + 一行等级名 |
| `TEXT.sleeping` / `TEXT.playOk` / `TEXT.feedCooling` / `TEXT.petCooling` 四条 v1 文案（已在 v2 无任何引用） | **删除** | 分别指向打盹、`play`、喂食冷却与单条摸头冷却；v2 的点击冷却文本改由 `lib/texts.js` 的 8 条集合承担 |

存档迁移：v1 存档里的 `growth`、道具数量、冷却与位置**原样保留**，`favor` 初始化为 0，三属性与流水账字段被**静默丢弃**（不报错、不备份 `state.json.bad`——废字段是正常版本演进，只有 JSON 坏或 `schemaVersion` 不受支持才走"备份 + 初始值重建"）。

## 最低宿主版本

需要 **`apiVersion ≥ 2` 的 obox**（宿主仓库 `package.json` 当前 `apiVersion: 3`；**2.0.0 起用户扩展默认在宿主进程里执行**，见「运行位置」一节的适配说明）。本扩展依赖 v2 才有的能力：

- `api.overlay.create / destroy / setMouseThrough / setPosition`：透明 overlay 窗体——不注册卡片、不进启动器 / 导航区，作用域限定只能操作本扩展自己创建的窗体，宿主停用 / 卸载扩展时自动回收；`setPosition`（拖动换位用）按主显示器工作区**兜底钳位**并在成功回包里带上**钳制后的实际坐标** `position`，入口用它校正自记位置；
- 设置页 `progress` / `status` 字段类型（好感进度条 + 成长值 / 好感精确值 / 等级名 / 诊断位四条只读文本行）；
- `api.timer` 的整数秒 `setInterval` / `setTimeout`（三只周期定时器与两只一次性定时器）。

扩展清单已声明 `apiVersion: 2`；老宿主会按门槛**拒绝加载**，扩展在管理器里标红并提示：`需要 obox API v2 或更高（当前 obox 为 vN）`（`src/renderer/src/core/manifest.ts:35`）。**为什么不上调 3**：本扩展不依赖任何 v3 专属能力（不用 `api.globalState` / `workspaceState`），而 `apiVersion` 是"最低门槛"声明——写 3 会让 ≤ 1.0.17 的宿主直接拒载，却没有换来任何能力，详见「运行位置」一节的结论与三条理由。

## 安装与调试

- **安装**：扩展管理器工具栏「安装扩展」选 `out/pet-2.0.0.oix`，或把 `.oix` **拖进**扩展管理器视图；安装（含同名覆盖升级）成功后**立即热生效**，无需重启。安装位置 `<userData>/extensions/pet_chenzhi/`（目录名 = `<name>_<author>`）。
- **调试（不安装直接加载）**：

  ```bash
  # 打包版（已安装 obox）
  obox.exe --remote-debugging-port=9333 --debug-extension pet@C:\绝对\路径\extensions\pet

  # 开发版（在 obox 仓库执行；参数要经两个 -- 才能传到 electron）
  npm run dev -- -- --remote-debugging-port=9333 --debug-extension pet@<路径>
  ```

  调试扩展经 `app://debug/pet/` 加载：管理器显示「调试中」、不可卸载、重启消失；改代码后**重载窗口**生效（入口是动态 import，模块缓存不自动失效）。
  **调试扩展不进宿主进程**（`src/renderer/src/core/loader.ts` 的 `collectHostedExtensions` 只收 `source === 'user'`）⇒ `--debug-extension` 下入口仍在渲染进程执行、页面 URL 走 `app://debug/<id>/` 的相对推导分支。要在真机上验宿主模式，请装 `.oix`（或用安装态对照开关前后两种行为）。

## 开发

```bash
npm install        # 构建期依赖（vite + vue + @vitejs/plugin-vue）；运行时零依赖
npm test           # node --test：286 条测试，全绿约 1 秒（零依赖，不装 node_modules 也能跑）
npm run build      # 构建 Vue 子应用（app/ → dist/：index.html + assets/*.css + assets/*.js）
npm run pack       # 先 build 再打包 → out/pet-2.0.0.oix（18 个条目，带打包清单回读自检，失败即删产物退出非 0）
```

- 测试分布（`test/`，全部 `node --test`，无 jsdom / 无测试框架依赖）：
  - `lib/**` 纯函数：`values.test.js`（数值模型与存档迁移）、`settle.test.js`（成长/挂机结算）、`texts.test.js`（128 条文本与取样）、`mapping.test.js`（状态→轨映射与帧几何）、`economy.test.js`（库存与挂机奖励）、`interact.test.js` / `interaction-v2.test.js`（互动判定与文案）、`persist.test.js`（存档读写与清洗）、`bridge.test.js`（长轮询 hub 与视图形状）；
  - 入口接线：`extension.test.js`（消息路由 / 长轮询端到端 / 写盘节流）、`window.test.js`（overlay 生命周期）、`settings.test.js`（设置键同步）、`timers-v2.test.js`（五只定时器与设置推送）、`actions-drag.test.js`（拖动换位）、`actions-hidden.test.js`（已撤销通道的负向断言与诊断位）、`hotfix-19-*`（`anim.self` 回落门禁与到期推送门禁）、`actions-trot.test.js`（随机表演）；
  - `app/**` 源码与纯函数：`actions-ui.test.js`（面板结构与样式）、`actions-text.test.js`（文案口径）、`view-v2.test.js`（视图归一化与页面映射）。
- 校验清单（在 obox 仓库根执行）：`node scripts/validate-manifest.mjs extensions/pet/manifest.json`。
- 入口 `index.js` 是**纯 ESM JavaScript**：不能 `import` npm 包、不能 `import` 宿主源码，只能用注入的 `api`；顶层零副作用，全部业务数值在 `lib/*.js` 纯函数里（不碰 api / DOM / 定时器），阈值与文案的单一来源是 `lib/constants.js` 与 `lib/texts.js`。

### 打包清单（`scripts/pack.mjs`）

`.oix` 就是 zip，按**白名单**收集（guides-user.md 第 6 节的四条硬性要求全部满足）：

- **根文件**：`manifest.json`（必须是 zip **根条目**，无目录前缀、无 `./`）、`index.js`（`manifest.main` 指向的入口）；
- **目录（递归）**：`dist/`（Vue 子应用构建产物）、`assets/`（精灵图集 + 上游 LICENSE + PROVENANCE）、`lib/`（**9 个**纯函数模块：constants / growth / items / interact / mapping / persist / settle / texts / bridge——入口 `import './lib/…'`，**缺一个都会加载失败**）；
- **永不进包**：`data/`（扩展运行时数据目录，含 `data/` 的包被安装器以 `forbidden-entry` 直接拒收）、`node_modules/`、`out/`、`.git/`，以及源码 / 规格目录 `openspec/`、`docs/`、`test/`、`app/`、`scripts/`；
- **回读自检**：打包后重新解析产物的 zip 中央目录，断言必需条目齐全（含全部 9 个 `lib/*.js`）、无禁止前缀、`manifest.json` 为根条目、路径全为正斜杠（无反斜杠 / `..` / 空段 / `./`）、条目 ≤ 10000、解压总量 ≤ 512 MB；任何一条不过 ⇒ 删除产物并退出非 0。
- 手工复核：`tar -tf out/pet-2.0.0.oix`（`.oix` 就是 zip）。

## 已知平台限制（透明窗体）

以下五条来自 design 的 D-11（Electron 官方局限性逐条对齐），均为**预期行为**而非缺陷。实机验证情况见证据文件 `openspec/changes/pet-desktop-companion/notes/evidence/overlay-feasibility.md`（Windows 11 25H2 + Electron 44.6.0，下称「证据」）：

| # | 限制 | 实机验证 | 说明 |
| --- | --- | --- | --- |
| 1 | `transparent` 依赖 DWM 合成：被组策略关闭时透明失效，退化为不透明 | ✗ 未测（证据 §6-5） | Win8+ 默认开启；窗体不透明时先排查 DWM |
| 2 | `transparent` **创建后不可运行时切换** | ✗ 官方限制，未实机复现（证据 §6-5） | 因此只在 overlay `create` 时决定透明；开关只做销毁 / 重建，不改透明属性 |
| 3 | 全屏独占应用下 `alwaysOnTop` 窗体可能被遮挡 | ✗ 未测（证据 §6-5） | 全屏游戏 / 放映时宠物可能看不见 |
| 4 | 打开 DevTools 时窗口变**不透明** | ✗ 仅防御性守卫，未主动复现（证据 §6-6） | 透明验收 / 排障**不得开 DevTools**，改用截图取色 |
| 5 | 无逐像素穿透，只能 `setIgnoreMouseEvents` 做**整窗**切换 | ✓ 已实机验证（证据 §2/§5/§7） | 穿透态点击落桌面（右键菜单截图 + `WindowFromPoint` 双证据）；非穿透态**整窗**捕获点击——指针命中精灵 / 面板期间，220×460 内的空白区也会一并捕获，移出后恢复穿透（已知取舍） |

已实机验证通过的相关判据：透明像素（精灵 / 面板之外的点完全透出壁纸色，证据 §1）、销毁窗体省 CPU（证据 §4）、alwaysOnTop / skipTaskbar（证据 §3）。另注：`forward:true` 的命中转发对**注入式**光标移动在本机间歇性失灵，真实鼠标正常（证据 §6-2）——自动化环境排查 hover 问题时先用真实鼠标复核。

## 主题：窗体有意不接主题桥

宠物窗体是桌面上的 **artwork 覆盖层**，**不接主题桥**（不调用主题桥 API）：面板是固定深色玻璃，配色**只用宿主 CSS token**（`--bg-panel` / `--fg` / `--fg-dim` / `--fg-bright` / `--border` / `--hover-bg` / `--font-size` / `--font-size-sm`），**零自造色值**；白色只出现在两处用户明确要求的位置——**图标描边**与**白色 2px 焦点环**。理由：深色玻璃在任何桌面壁纸上都可读，与「宠物是 artwork」的定位一致；这是经用户裁定、已在 design 的 `## UI 视觉规范` 硬约束 1/2 条登记的豁免（退场条件：将来要求跟随主题时回 proposal / design 重定该节）。

面板**不使用** `backdrop-filter: blur()`：官方文档明确 CSS blur 无法模糊透明窗口下方的桌面内容，加了只白耗 GPU——玻璃感由半透明底 + 描边实现。

设置页的 5 行由**宿主渲染**，天然跟随宿主主题，扩展无需也未做任何主题桥接。

## 目录结构

| 路径 | 说明 | 进 `.oix` |
| --- | --- | --- |
| `manifest.json` | 扩展清单（`version: 2.0.0`、`apiVersion: 2`、`main: "./index.js"`；contributes = `statusBarItems` + `settings` 6 字段） | ✓（根条目） |
| `index.js` | 入口：纯 ESM，`default` 导出插件函数、返回 cleanup；只做接线，顶层零副作用；**跑在 Extension Host Process**（obox 2.0.0 起） | ✓ |
| `lib/*.js` | **9 个**纯函数模块：`constants`（阈值/键名/文案单一来源）、`growth`（成长与等级）、`items`（库存）、`interact`（互动判定）、`mapping`（状态→轨与帧几何）、`persist`（存档读写与迁移）、`settle`（成长/挂机结算）、`texts`（128 条文本与取样）、`bridge`（长轮询 hub 与视图） | ✓ |
| `dist/` | `vite build` 产物（overlay 窗体页面；gitignore，pack 时重建） | ✓ |
| `assets/whale/` | 鲸鱼娘图集（上游原字节）+ `LICENSE` + `pet.json` + `PROVENANCE.md` | ✓ |
| `app/` | Vue 子应用源码（精灵 / 面板 / 气泡组件、页面侧桥、`lib/panel.ts` 的面板开合判定、`lib/burst.ts` 的"自发表演播完回落"判定、`lib/anim.ts` 的页面侧帧映射） | ✗（源码） |
| `test/` | `node --test` 单测（**286 条**：`lib/**` 纯函数 + 入口接线 + `app/**` 源码/纯函数断言） | ✗（源码） |
| `openspec/` | 需求容器（proposal / spec delta / design / tasks / 证据） | ✗（规格） |
| `docs/` | 需求来源文档 | ✗（规格） |
| `scripts/pack.mjs` | 零依赖打包脚本（白名单收集 + 手写 zip + 回读自检） | ✗（工具） |
| `out/pet-2.0.0.oix` | 分发包（产物，gitignore，不提交） | — |

## 素材出处与许可证

鲸鱼娘精灵图集（`assets/whale/spritesheet.webp`，1,544,154 B；8 列 × 9 行、每格 192×208、整图 1536×1872，透明背景无损 WebP）为**上游原字节再分发**（未修改、未重编码）。完整出处记录（下载方式、版本锚点、字节级校验值）见 `assets/whale/PROVENANCE.md`。

- **直接来源（快照 monorepo）**：`DamonKoy/dsh-web-ui` 的 `packages/dsh-pet/assets/whale/`；
- **上游主线仓库**：`zhu1090093659/dsh-pet`（素材路径 `assets/whale/`），对应 npm 包 `@linxin666/dsh-pet`；图集本体在快照与主线之间字节相同；
- **许可证（上游为分层声明，PROVENANCE §7）**：上游不同层级各有一份声明——仓库根 `LICENSE` 为 Apache-2.0 全文；**包级** `packages/dsh-pet/LICENSE` 为 **BSD 3-Clause**（`Copyright (c) 2026, zhu1090093659`，即本项目随附于同目录的 `assets/whale/LICENSE` 原文，字节未改）；npm / `package.json` 元数据写 Apache-2.0；**素材自身声明为 BSD-3-Clause**（主线 v2 清单显式带 `"license": "BSD-3-Clause"`）。本项目随附并履行的是**素材自身声明的 BSD-3-Clause**：保留版权与许可声明、不以作者名义背书或推广、再分发不改字节；该履行方式**同时满足**仓库根 Apache-2.0 的署名要求。
- **随附清单为快照版**（PROVENANCE §9）：`pet.json` 838 B、无 `petManifestVersion` 字段，`idle` 轨六帧 400/400/500/400/400/500 ms（一轮约 **2600 ms**）——本扩展的帧时长契约按快照版写死并验收。**升级为主线 v2 清单**（2,718 B、`petManifestVersion: 2`，动画节奏与字段结构都不同）**是一次有意变更，必须走新的 change**（proposal → spec delta → design → tasks），不得在 dev / ship 里顺手替换。
- **关联与背书声明（PROVENANCE §8）**：本项目与素材作者 zhu1090093659、上游主线仓库 `zhu1090093659/dsh-pet`、快照仓库 `DamonKoy/dsh-web-ui` 及 npm 包 `@linxin666/dsh-pet` **无任何组织、法律或开发上的关联**，**未取得作者或上游项目的背书、赞助、认可或授权许可之外的任何承诺**；素材仅按上述许可证条款原样再分发，文中出现的名称 / 商标仅用于说明来源，不代表其对本项目的推荐。
- **打包强制项**：`.oix` 内含 `assets/whale/LICENSE` 与 `assets/whale/pet.json`（spec `pet-sprites` Requirement 4，打包回读自检强制断言）。
- **替换条款**：将来用自制或其它素材替换鲸鱼娘时，**必须删除** `assets/whale/LICENSE` 与 `PROVENANCE.md`，为新素材另写来源与授权记录，并同步更新本节（不得留下失效的第三方声明）。

# pet-desktop-companion — 桌面宠物：右下角透明窗体 + 饥饿度/清洁度/心情养成

## Why

obox 目前没有任何"陪伴/养成"类的界面反馈：用户长时间开着 obox 工作时，界面上没有随时间与交互变化的活物。参照实现（`dsh-pet`，一个 DSH Web GUI 插件）已经验证了这套玩法（悬浮宠物 + 属性养成 + 道具经济 + 亲密度/成长），但它是 **DSH 插件模型**（`window.__ModuleLoader__` 闭包 + cordis bundle + 宿主插槽），与 obox 的 `.oix` 用户扩展模型（`app://` 协议 + App 卡片子窗口 + `api.*` 注入）完全不通，无法直接安装使用（grill 痛点与现状，用户答复）。

同时参照实现的状态驱动源（LLM 会话事件）在 obox 里不存在（`src/api/types.ts` 无 session/turn/tool 类事件），因此本轮把驱动源改为**纯生活模拟**（grill Q1），并按用户给定的数值规则重做属性/经济/成长系统。

不做的代价：用户想要的"桌面宠物"在 obox 里继续缺失；参照仓库的能力也无法惠及 obox 用户。

## What Changes

1. **新增宠物窗体能力线**：本扩展是**后台扩展**——**不注册 App 卡片**、不出现在启动器与导航区；对外只有三处可见面（设置页「扩展-宠物」、overlay 宠物窗体、状态栏诊断文本）。扩展激活且设置为显示时，经宿主新增的 **overlay 窗体能力**（`api.overlay.create`）在**主显示器工作区右下角**自动创建一个**无边框、背景透明、置顶、不占任务栏**的窗体，且宿主外壳在该模式下**不绘制标题栏与任何背景**（否则透明失效，见 validation S2）；设置 toggle 关闭时**销毁**该窗体（不是隐藏，以省 CPU），重新打开时重建且状态不丢。
2. **新增三属性数值系统**：饥饿度（-1/分钟）、清洁度（-10/小时）、心情（-5/小时），满分 100、下限 0；联动规则（饥饿/清洁每降 10 点 ⇒ 心情 -1；每恢复 10 点 ⇒ 心情 +1 且该途径上限 95）；**惰性结算**，仅计 obox 运行期间（启动不追算离线时长，休眠/卡顿恢复后补算一次）。
3. **新增道具经济**：挂机（运行 + 窗体存在）每满 20 分钟 +1 小鱼干 +1 沐浴泡泡，库存上限各 20；喂食消耗 1 小鱼干、洗澡消耗 1 沐浴泡泡、玩耍不消耗；道具不足时该互动不可用并提示。
4. **新增成长值**：+2/小时；心情每缺 5 点（相对满分、向下取整档）⇒ 该小时 -0.1；下限 0；成长值与等级名在悬停面板呈现。
5. **新增五种交互**：点击（心情 +1，每 5 分钟至多一次，冷却内只播反馈）、悬停（弹出面板：成长值/等级/库存/三属性）、喂食（+5 饥饿）、洗澡（+15 清洁）、玩耍（+5 心情）。
6. **新增设置页「扩展-宠物」**：一个"显示宠物" toggle + 三行进度条（饥饿度/清洁度/心情，右侧 `{cur}/100`，无描述）。
7. **新增图集契约与帧动画**：几何（列数、格子尺寸、每行帧数、每轨帧时长）由随图集的 `pet.json` **声明驱动**，渲染不硬编码；本轮内置**上游 dsh-pet 的鲸鱼娘图集**（8 列 × 9 行、每格 192×208、整图 1536×1872、`frames=[6,8,8,4,5,8,6,6,6]`、帧时长取 `tracks`），状态 → 动画轨为语义就近的固定映射并有确定优先级；随附上游 BSD-3-Clause 许可证与出处声明（AI 自制图集为后续可选替换，契约与 prompts 见 grill 附录 A）。**增补（Q10）**：新增自发"原地小跑"状态（idle 时随机一段 `running` 轨 burst）；`running-left/right` 两轨本轮不使用并显式声明。
8. **新增拖动换位与隐藏/召唤**（增补轮 Q9/Q11）：拖宠物本体 ⇒ 窗体跟随、松手把位置持久化到扩展 `state.json`、钳在主显示器工作区内（宿主经 `api.overlay.setPosition` 实现移动）；面板加"隐藏"按钮 ⇒ 窗体不销毁、只渲染一个约 96×36 的"召唤"胶囊并停掉 rAF（其余区域继续穿透），点胶囊恢复；隐藏态持久化，**设置页 toggle 关→开清除隐藏态**（设置优先）。
8. **宿主需新增一套「overlay 窗体」能力**（在 obox 仓库另立 change/PR，本扩展依赖之；不是四个零散开关，而是一条完整能力线）：
   - **创建/销毁**：`api.overlay.create({ id, url, width, height, anchor, margin, transparent, alwaysOnTop, skipTaskbar })` 与 `api.overlay.destroy(id)`——**新命名空间，不挂在 `api.app` 下**（`api.app` 是 App 卡片语义；本扩展是后台扩展，不注册卡片）；overlay **不进启动器**、不作为可点击卡片；
   - **移动**（增补轮 Q9）：`api.overlay.setPosition(id, x, y)`——供扩展实现"拖宠物换位"；与其余方法同作用域约束；
   - **窗体参数**：`frame:false`（既有）、`transparent:true` + `backgroundColor:'#00000000'`、`alwaysOnTop:true`、`skipTaskbar:true`、`hasShadow:false`、`resizable:false`、`maximizable:false`，初始位置按 `anchor:'bottom-right'` + `margin` 由主显示器 `workArea` 计算；
   - **外壳透明（S2 的解法：五处必须一次改齐，缺一处就不是透明窗体）**：
     1. `src/main/appWindow.ts:72` 的 `backgroundColor:'#1e1e1e'` ⇒ overlay 路径改为 `'#00000000'`，并加 `transparent:true`、`hasShadow:false`、`thickFrame:false`（去掉 Windows 原生边框/阴影残留）、`roundedCorners:false`（避免 Win11 圆角裁剪）、`acceptFirstMouse:true`（首次点击即生效，不必先聚焦）、`show:false` + `ready-to-show` 后显示；
     2. `src/renderer/src/AppWindow.vue:202` 的 `<TitleBar>` ⇒ overlay 模式不渲染（`v-if="!isOverlay"`），`<PromptHost>` 同样不渲染；
     3. `AppWindow.vue:228` `.app-window` 与 `:233` `.app-window-content` 的 `background: var(--bg,#1e1e1e)` ⇒ overlay 根 class 下改为 `transparent`；
     4. `AppWindow.vue:239` `.app-frame { background:#ffffff }` ⇒ overlay 下改为 `transparent`（这是最容易被漏掉的一处：iframe 白底会直接把宠物糊成白色矩形）；
     5. `src/renderer/src/assets/main.css:44-47` 的**全局** `body { background: var(--bg) }` ⇒ overlay 窗口在挂载前把 `html`/`body` 的背景就地置为 `transparent`（全局样式对每个窗口都生效，不改这里前四处都白做）。
     overlay 窗体**复用**这套外壳（查询串 `?obox-window=overlay&extId=pet&overlayId=…`），因此子窗口→入口的消息桥（`api.app.onMessage`）与"扩展页面在 sandboxed iframe 内、无 Node/IPC"的安全模型都**原样保留**，宿主只需按窗体所属扩展路由消息（overlay 查询串带 `extId`）；
   - **透明的可验收判据**：把窗体放在彩色壁纸上，取精灵与面板之外的一点截图像素，其颜色 MUST 等于该处壁纸颜色（而不是 `#1e1e1e` 或 `#ffffff`）；
   - **鼠标穿透 + 命中转发**：`api.overlay.setMouseThrough(id, through)`（封装 `setIgnoreMouseEvents(true,{forward:true})` / `false`），避免透明窗体的空白区吞掉桌面点击；
   - **作用域安全约束**：上述三个 API MUST 只允许扩展操作**自己创建的** overlay（按扩展 id 校验）——扩展与宿主同进程同上下文、无沙箱，不限定作用域等于让任一扩展能销毁/穿透别人的窗体；
   - **设置字段新增 `progress` 类型**（进度条 + 右侧 `{cur}/{max}`，只读，值由扩展经 `api.settings.set` 写入）。
   宿主 `apiVersion` 递增后，老宿主按既有门槛**拒绝加载**本扩展（grill Q8）。上述能力必须同步 `docs/extension-api/{api-reference,manifest-reference,themes-settings,troubleshooting}.md` 与受影响的 `skills/obox-ext-*`（AGENTS.md 强制）。

## Capabilities

### New

- `pet-window`：宠物窗体的形态（右下角/无边框/透明/置顶/不占任务栏/不可 resize）与生命周期（安装即创建、toggle 销毁与重建、销毁即停动画循环）；**增补（Q9/Q11）**：拖动换位（拖精灵 ⇒ `api.overlay.setPosition` 移窗体、松手持久化、钳主显示器工作区）与隐藏态（同窗体只渲染召唤胶囊、停 rAF、其余穿透；设置 toggle 关→开清除隐藏态）。
- `pet-vitals`：饥饿度/清洁度/心情三个属性的衰减、联动、上下限与惰性结算时机。
- `pet-economy`：小鱼干/沐浴泡泡的挂机产出、库存上限与互动消耗规则。
- `pet-growth`：成长值的累积速率、心情惩罚与等级呈现。
- `pet-interaction`：点击/悬停/喂食/洗澡/玩耍五种交互的生效条件、数值效果与冷却；**增补（Q11/Q12）**：面板"隐藏"按钮与召唤胶囊的交互、**反馈文案口径**（摸头/喂食的成功与冷却文案与上游 dsh-pet 逐字一致；所有用户可见文案 MUST NOT 含"数字 + 时间单位"）。
- `pet-settings`：设置页「扩展-宠物」的 toggle 与三行进度条呈现（含宿主 `progress` 字段依赖）。
- `pet-sprites`：图集契约（几何/每行帧数/帧时长由随图集的 `pet.json` 声明驱动；内置上游 dsh-pet 鲸鱼娘：8 列 × 9 行、192×208、透明）与状态→动画轨的映射及优先级、帧动画驱动与停止、上游许可证与出处随附；**增补（Q10）**：自发"原地小跑"状态（idle 时随机一段 `running` 轨 burst），并显式声明 `running-left/right` 两轨本轮不使用。

### Modified

（无。`openspec/specs/` 当前为空，本 change 全部为新增能力线。）

## Impact

- **扩展工程**：`extensions/pet/`（本仓库）——`manifest.json`（`contributes.settings` 手写、`apiVersion` 声明）、`index.js`（状态权威 + 结算 + 消息桥）、`app/**`（Vue 子应用：精灵渲染、悬停面板、交互）、`assets/whale/`（上游鲸鱼娘图集 `spritesheet.webp` + `pet.json` + 上游 `LICENSE`，见 D-10）、`test/**`、`scripts/pack.mjs`。
- **宿主（obox 仓库，另立 change/PR）**：
  - `src/main/appWindow.ts`：新增 overlay 窗体创建路径——`BrowserWindowConstructorOptions` 增加 `transparent:true` + `backgroundColor:'#00000000'`（替换 `:72` 的 `'#1e1e1e'`）、`alwaysOnTop`、`skipTaskbar`、`hasShadow:false`、`resizable:false`、`maximizable:false`，并按 `anchor`+`margin` 用 `screen.getPrimaryDisplay().workArea` 计算初始 `x/y`（Electron 支持性已核：`electron.d.ts:4080/3851/4031/3924/12298/8115`）；
  - `src/renderer/src/AppWindow.vue`：overlay 模式下**不渲染 `<TitleBar>`**（`:202`），`.app-window`（`:228`）/`.app-window-content`（`:233`）/`.app-frame`（`:239`，现为 `#ffffff`）背景改为 `transparent`——用一个根 class 切换，**不得影响既有 rdp/webapp 卡片**；
  - `src/api/types.ts:163-170`（`api.app` 现仅 `register`/`onMessage`）：**新增 `api.overlay` 命名空间**（`create` / `destroy` / `setMouseThrough` / **`setPosition`（增补 Q9）**），不挂在 `api.app` 下（本扩展不注册卡片）；子窗口→入口的消息桥**复用** `api.app.onMessage`（宿主按窗体所属扩展路由，overlay 窗体查询串带 `extId`）；`setMouseThrough` 内部调 `win.setIgnoreMouseEvents(ignore, { forward })`（`electron.d.ts:3392/6227`，`IgnoreMouseEventsOptions.forward` 见 `:22298-22306`）；四个方法 MUST 按扩展 id 限定作用域；
  - `src/api/contributions.ts:97-127` 的 `SettingFieldType` 增加 `progress`，`SettingsView.vue` 字段链增加对应分支（沿用 `status` 的只读语义：值由扩展经 `api.settings.set` 写入，`api-reference.md:291-318`）；
  - 根 `package.json` 的 `apiVersion` 递增 ⇒ 老宿主按 `manifest-reference.md:20,300` 的门槛拒绝加载（Q8 的"拒绝安装"即由此机制实现，无需额外代码）；
  - **文档同步（AGENTS.md 强制）**：`docs/extension-api/api-reference.md`（overlay 三方法 + 作用域约束 + 子窗口在 overlay 下的透明要求）、`manifest-reference.md`（`progress` 字段与 `apiVersion`）、`themes-settings.md`（overlay 模式不推送/不消费 token 的说明）、`troubleshooting.md`（透明窗体在全屏应用下可能被遮挡、DWM 关闭时透明失效），以及受影响的 `skills/obox-ext-*`。
- **数据与配置**：属性/库存/成长值/`lastSettledAt`/窗体开关持久化在扩展自己的 data 目录（`api.fs`，`api-reference.md:561-577`）；**增补**：窗体位置 `{x,y}` 与隐藏态布尔同存 `state.json`（`schemaVersion` 仍为 1，缺字段按默认值）；设置键经 `api.settings.register/get/set/onChanged`（`api-reference.md:250,291-332`）。
- **子窗口约束**：宠物窗体内的页面**没有 api 对象**且与主窗口**跨源、localStorage 不共享**（`api-reference.md:27,178`）⇒ 权威状态在入口（主窗口插件函数），子窗口经 `api.app.onMessage` + postMessage 取状态与回传交互（`api-reference.md:187`）；副作用（定时器/监听/注册）必须放进插件函数（`api-reference.md:27`）。
- **定时与结算**：`api.timer.setInterval`（秒级，`api-reference.md:405-414`）驱动 tick；结算用时间差补算（Q4）。
- **兼容与迁移**：新扩展，无存量数据；老宿主拒绝加载（apiVersion 门槛）。
- **分发**：`.oix`（`scripts/pack.mjs`）+ commit → tag → release（Q8）；README 写明最低宿主版本。
- **素材**：内置**上游 dsh-pet 鲸鱼娘图集**（`spritesheet.webp` 1,544,154 B + `pet.json` 838 B，落于 `assets/whale/`；用户在 design 步裁定"先用 dsh-pets 里的"）。许可证按较严的 **BSD-3-Clause** 履行：随附 `assets/whale/LICENSE` 上游原文 + README 写明出处与"未获背书"（上游 `package.json`/npm 元数据写 Apache-2.0 的矛盾已登记）。`.oix` 体积因此约 **+1.5 MB**。AI 自制图集为后续可选替换（grill 附录 A 的契约与 prompts 保留备用），替换后须删除上游许可证与出处声明。

未跑官方校验（缺 `openspec` CLI）。

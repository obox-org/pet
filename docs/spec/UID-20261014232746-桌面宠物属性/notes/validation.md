# validation — pet-desktop-companion（第 5 步：规格校验，只读）

> 输入：`specs/{pet-window,pet-vitals,pet-economy,pet-growth,pet-interaction,pet-settings,pet-sprites}/spec.md`、`design.md`、`proposal.md`、`notes/grill.md`。
> 本步**不改** spec / design / 代码。官方 CLI 未安装 ⇒ **未跑 `openspec validate --strict`**（结构自检由代理执行，见末节）。

## 结论摘要

| 档 | 数量 | 是否阻断 |
| --- | --- | --- |
| **严重问题** | **3** | 是（照现状实现会做错） |
| 普通问题 | 8（其中 **4 条为"证据不足"**） | 否，但需在 dev 前定口径 |
| 一般建议 | 3 | 否 |

九维度结论：互相冲突 **有**（S1/S3）｜需求遗漏 **有**（S2/N2/N4）｜不可验收 **有**（N3 取整口径缺失）｜与宿主不符 **有**（S1/S2 + `progress` 待新增）｜权限与安全 **有**（N4）｜数据语义与迁移 **有**（N2）｜行为冲突 **无**（`pet.*` 前缀与 rdp/webapp/obox-updater 不撞；脚手架残留见 N1）｜兼容与异常 **有**（N5 平台限制未记录）｜可维护性 **有**（N1/G3）。

## 严重问题（逐条一问）

### S1 · 入口无法"主动推送"到子窗口：D-3 的推送方向在现有 API 下**不可实现**

- **证据**：`src/api/types.ts:163-170` 的 `api.app` **只有** `register()` 与 `onMessage()`；文档化的通路是**子窗口发问 → 入口回答**（`docs/extension-api/api-reference.md:187`（`onMessage` 为 async handler）、`:203-214`（子窗口 `parent.postMessage` 请求，宿主回 `{source:'obox-app', action:'obox-extension-reply', requestId, result}`））。`design.md` 的 D-3 写"入口在结算/交互后**主动 postMessage** 到子窗口"，**无对应 API**。
- **影响**：照 D-3 实现会在 dev 步卡住（要么写不出来，要么临时改成轮询而未更新设计），并连带影响"设置页写后当帧刷新"与"窗体内即时反馈"的一致性。
- **修复意见（三选一，建议 a）**：
  - **(a) 长轮询订阅（推荐，零新增宿主能力）**：子窗口发 `pet.subscribe { rev }`，入口的 async handler **hold** 到状态变化（或 ~25s 超时）再 reply 新 `rev`+state；子窗口收到后立刻再订阅。利用 `onMessage` 的 async 语义即可，无固定轮询开销。
  - (b) 定时轮询：子窗口每 1s 发 `pet.state`（最简，但每秒一次 RPC，且窗体可见期间持续）。
  - (c) 新增第 5 项宿主能力"入口 → 子窗口推送"（改动最大，但语义最干净；需回 proposal 的 Impact）。

### S2 · 透明窗体被 App 窗体外壳**破坏**：宿主能力清单不完整

- **证据**：`src/renderer/src/AppWindow.vue:202` 渲染 `<TitleBar>`（不透明标题栏）；`:228` `.app-window{background:var(--bg,#1e1e1e)}`；`:233` `.app-window-content{background:var(--bg,#1e1e1e)}`；`:239` **`.app-frame{background:#ffffff}`（iframe 白底）**；`src/main/appWindow.ts:72` 还设了 `backgroundColor:'#1e1e1e'`。
- **影响**：即使 BrowserWindow 开了 `transparent:true`，用户看到的仍是一个**带标题栏的白/深色不透明矩形**，`pet-window` 的 Requirement 1（"背景透明、无边框"）与其 scenario 全部无法通过。design D-1 只列了 BrowserWindow 选项，**漏了外壳与 iframe**。
- **修复意见**：把宿主第 1 项能力扩写为"overlay 模式"：注册参数带 `overlay/transparent` 标记时，`appWindow.ts` 用 `backgroundColor:'#00000000'`，`AppWindow.vue` **不渲染 TitleBar**、`.app-window`/`.app-window-content`/`.app-frame` 背景改为 `transparent`（可用一个根 class 切换，避免影响既有 rdp/webapp 卡片）；并实测 iframe 内 `body{background:transparent}` 能透出桌面。

### S3 · "App 卡片"与"扩展自建 overlay 窗体"语义冲突：窗体来源未定义

- **证据**：`api.app.register`（`src/api/types.ts:165`、`api-reference.md:153`）注册的是**启动器里的卡片**，用户点卡片由宿主 `AppView.vue:52` 调 `window.api.openAppWindow` 打开一个 `width×height`（脚手架默认 900×640）的普通窗口；而 `pet-window` 要求窗体由扩展**自行创建**、220×460、透明置顶、且在设置 toggle 下销毁/重建（`design.md` D-1/D-2）。design 未定义：卡片还注册吗？点了会怎样？overlay 窗体由哪个 API 创建？
- **影响**：若照脚手架保留 `pet.main` 卡片，启动器里会出现一个"宠物"卡片，点开是 900×640 的空白窗口（与需求冲突）；若不注册卡片，现有 API 里**没有**可创建窗体的入口 ⇒ dev 步无从下手。
- **修复意见（建议 a）**：
  - **(a)** 宿主第 2 项能力定为 **`api.overlay.create({ id, url, width, height, anchor:'bottom-right', margin, transparent, alwaysOnTop, skipTaskbar })` + `api.overlay.destroy(id)`**（**最终命名**：新命名空间 `api.overlay`，不挂在 `api.app` 下——用户裁定"宠物是后台扩展，不注册到 app 里"），overlay **不进启动器**；扩展不注册任何 App 卡片。
  - (b) 保留卡片但改语义：点卡片 = 创建/聚焦 overlay 窗体（仍需在注册参数里带 overlay 选项，且卡片点击不再走 `openAppWindow`）。
  - (c) 卡片作为"宠物设置/召唤"入口，overlay 由扩展自动创建（卡片与窗体解耦，但要处理"卡片点开什么"的空态）。

## 普通问题（合并多选；含 4 条"证据不足"）

| # | 维度 | 发现（含锚点） | 影响 | 修复意见 |
| --- | --- | --- | --- | --- |
| N1 | 可维护性 / 行为冲突 | 脚手架残留贡献点未在 design 裁定：`manifest.json` 的 `views[pet.tree]`、`commands[pet.hello]`、`statusBarItems[pet.status]`、`i18n` demo 词条；`index.js` 的 `greet()` 与 `app.register({id:'pet.main', 900×640})`；`test/extension.test.js` 的 6 条脚手架测试 | 导航区会多一个"宠物"树视图、命令面板多一条"打个招呼"，与需求无关 | design 增一条决策：删 `views`/`commands`/demo i18n/`greet` 与其测试；**保留** `pet.status`（D-9/OQ3 的诊断用）；卡片按 S3 结论处理 |
| N2 | 数据语义与迁移 | `state.json` 未定义 `schemaVersion` 与升级迁移（design D-5/D-8 只写了字段与空态） | 将来加字段（如新道具）时旧存档无法判定版本，只能靠"缺字段给默认值"猜 | spec/design 明确：`state.json` 顶层含 `schemaVersion:1`；读到未知版本 ⇒ 备份为 `state.json.bad` 后按初始值重建（与 D-9 的损坏分支同路径） |
| N3 | 不可验收 | `pet-settings` 的 Requirement 2 写"右侧显示 `{cur}/100`"，但 D-5 明确"内部保留小数、显示向下取整" ⇒ spec 未写取整口径 | 99.9 该显示 99 还是 100 无法判定，check 步会各说各话 | spec 补一句：显示值 = `Math.floor(cur)`，且 `cur` 钳制在 `[0,100]`；进度条宽度用未取整的真实比例 |
| N4 | 权限与安全 | 新增的窗体创建/销毁与 `setMouseThrough` API **未限定作用域**（design D-2、proposal Impact） | 扩展与宿主同进程同上下文、无沙箱 ⇒ 若不限定，任一扩展可销毁/穿透别人的窗体 | 宿主 PR 必须把新 API 限定为"只能操作**本扩展自己**创建的窗体"（按扩展 id/appId 校验），并写进 `docs/extension-api/api-reference.md` |
| N5 | 兼容与异常 | 平台限制未记录：Windows 上 `transparent` 窗体在**全屏应用/独占全屏游戏**下可能被遮挡；`transparent` 创建后不可运行时切换；DWM 合成关闭时透明失效 | 用户在全屏场景看不到宠物，会被当 bug 报 | design 的 Risks 增一条（预期行为 + 退场：文档写明"全屏应用下可能被遮挡"）；`transparent` 只在创建时决定（与 D-1 一致） |
| N6 | **证据不足** | 透明 + 置顶 + 穿透（`setIgnoreMouseEvents(true,{forward:true})`）在**本机 Windows 实机**的观感与"关窗后 CPU 回落"均未验证（缺实机证据；design 把 CPU 回落写成了验收判据） | 可能命中 R1（forward 不生效 ⇒ 吞点击或命中测试失效） | dev 步做最小实机验证：一个只有透明方块 + 命中变色的 demo 窗体，量 CPU（关窗前/后）与点击穿透；结论写进 `notes/dev.md` |
| N7 | **证据不足** | 结算/联动/挂机/成长的**自动测试尚不存在**（缺单元测试证据；`pet-vitals`/`pet-economy`/`pet-growth` 的 scenario 都可纯函数化） | scenario 无法被回归保护 | dev 步把 `settle(dt)`、联动记账、挂机发放、成长速率写成纯函数并逐 scenario 建测（含时间回拨、上限钳制、跨多周期补算） |
| N8 | **证据不足** | 上游 `spritesheet.webp`（1,544,154 B）在**透明窗体**里的边缘/抗锯齿表现未验证（缺实机证据） | 精灵边缘可能出现白边或锯齿，影响"无边框透明"观感 | dev 步实机看一眼；若有白边，退场：改用 PNG 或加 1px 内缩裁剪 |

## 一般建议（默认只登记）

| # | 建议 |
| --- | --- |
| G1 | 面板按钮与气泡文案统一术语（"喂食/洗澡/玩耍"），避免"投喂/清洗/游玩"混用 |
| G2 | 扩展 README 增"素材出处与许可证"（D-10）与"为何不接主题桥"（D-6）两段，便于后来者理解豁免 |
| G3 | 删除脚手架的 `app/theme.js`（本扩展不接主题桥），避免留下未使用文件造成误解；`app/style.css` 里的 `var(--token)` 一并清掉 |

## 已核对的 API / 字段 / token 清单（零"凭记忆"）

| 引用 | 核对结果 | 锚点 |
| --- | --- | --- |
| `api.app.register` | ✓ 存在 | `src/api/types.ts:165`、`api-reference.md:153` |
| `api.app.onMessage`（async） | ✓ 存在 | `src/api/types.ts:170`、`api-reference.md:187` |
| 入口 → 子窗口**主动推送** | ✗ **不存在** | `src/api/types.ts:163-170`（仅两个方法）；reply 机制见 `api-reference.md:214` ⇒ **S1** |
| `api.settings.register/get/set/onChanged` | ✓ 存在 | `api-reference.md:250,290-332` |
| 设置字段类型 `progress` | ✗ **不存在**（现为 `text/number/boolean/select/directory/status`） | `src/api/contributions.ts:97-127`、`api-reference.md:299` ⇒ 待宿主新增（proposal Impact 已列） |
| `api.timer.setInterval`（秒） | ✓ 存在 | `api-reference.md:405-414` |
| `api.fs.writeFile/readFile/exists/remove`（仅 data 目录） | ✓ 存在 | `api-reference.md:561-577` |
| `api.statusBar.setText` | ✓ 存在 | `api-reference.md:68` |
| `apiVersion` 门槛（老宿主拒绝加载） | ✓ 存在 | `manifest-reference.md:20,300` |
| BrowserWindow `transparent`/`alwaysOnTop`/`skipTaskbar`/`hasShadow` | ✓ Electron 支持 | `node_modules/electron/electron.d.ts:4080/3851/4031/3924` |
| `setIgnoreMouseEvents(ignore,{forward})` | ✓ Electron 支持 | `electron.d.ts:3392,6227`；`IgnoreMouseEventsOptions.forward` `:22298-22306` |
| `screen.getPrimaryDisplay().workArea` | ✓ Electron 支持 | `electron.d.ts:12298,8115` |
| App 窗体外壳透明 | ✗ **当前会画标题栏 + `--bg` 背景 + iframe 白底** | `AppWindow.vue:202,228,233,239`、`appWindow.ts:72` ⇒ **S2** |
| 主题 token（25 个） | ✓ 表已核对；本扩展**零引用**（D-6 豁免已登记） | `themes-settings.md:68-98` |
| `scripts/pack.mjs` 是否打包 `assets/` | ✓ **已含**（`DIRS = ['dist','assets']`），D-10 的待核实项**当场关闭** | `extensions/pet/scripts/pack.mjs:34` |
| 官方 CLI 校验 | ⚠ **未跑**（`openspec` 未安装） | 结构自检见下 |

**结构自检（代替官方 CLI）**：7 份 spec 共 **22 条 requirement / 36 个 scenario**；`#### Scenario:` 全部 4 个 `#`（3/6 个 `#` 命中 0）；每条 requirement ≥1 scenario（0 例外）；ADDED 正文均含 SHALL/MUST；`change-id` = `pet-desktop-companion` 合法；design 七节齐、10 条决策、4 条 OQ（OQ1–OQ3 已裁定）。

## 未决项

无（3 条严重问题都有明确修复路径，待用户裁定"回 proposal 还是回 design"）。

---

# 第二轮复检（用户裁定"回 proposal 修"之后的复查）

> 结论：**0 严重 / 0 普通待办 / 3 一般建议登记**；3 条"证据不足"项经用户裁定 **"接受风险并登记"**，转为 dev 步的**前置验证任务卡**。

## 严重问题：3 条全部关闭

| # | 关闭方式 | 落点（锚点） |
| --- | --- | --- |
| S1 推送通道不存在 | 改为**长轮询订阅** `pet.subscribe { rev }`（入口 async handler hold 到状态变化或 25s 超时再 reply，子窗口收到即重订阅）；零新增宿主能力 | `design.md` D-3（"状态同步方向（S1 的解法）" + 通道表新增 `pet.subscribe` 行） |
| S2 外壳不透明 | 定为 **overlay 模式复用 App 外壳**，并列出**五处必须一次改齐**的绘制点（含此前漏掉的全局 `body{background:var(--bg)}`）；给出**像素级可验收判据**；新增共用外壳的回归风险 R9 | `proposal.md` What Changes #8「外壳透明」五条 + `design.md` D-11（含被否决的"直接加载扩展页 + 专用 preload"方案与安全理由）+ `specs/pet-window/spec.md` 新 scenario「窗体空白区完全透出桌面」 |
| S3 窗体来源未定义 | 用户裁定**宠物是后台扩展、不注册 App 卡片** ⇒ 新增 `api.overlay` 命名空间（`create`/`destroy`/`setMouseThrough`），overlay 不进启动器；脚手架的卡片注册与 demo 贡献点全部删除 | `proposal.md` What Changes #1/#8 + `design.md` D-12 + `specs/pet-window/spec.md` 新 requirement「本扩展 SHALL 是后台扩展」（2 个 scenario：启动器无卡片、停用即回收窗体） |

## 普通问题：N1–N5 关闭，N6–N8 接受并登记

| # | 状态 | 落点 |
| --- | --- | --- |
| N1 脚手架残留 | **已关闭** | `design.md` D-12：删 `views[pet.tree]`/`commands[pet.hello]`/demo i18n/`greet()`/`app/theme.js` 与 6 条脚手架测试；保留 `statusBarItems[pet.status]`（诊断位） |
| N2 存档无版本 | **已关闭** | `specs/pet-vitals/spec.md` 新增 requirement「状态存档 SHALL 带 `schemaVersion`」（2 个 scenario：版本不受支持⇒备份 `state.json.bad` 后重建；正常恢复且不追算离线）+ `design.md` D-5 的原子写 |
| N3 取整口径缺失 | **已关闭** | `specs/pet-settings/spec.md` Requirement 2 增「显示口径」：`{cur}` = `Math.floor(cur)` 钳 `[0,100]`，条宽用**未取整**真实比例 |
| N4 新 API 作用域安全 | **已关闭** | `proposal.md` What Changes #8「作用域安全约束」+ `design.md` D-2「作用域安全」：三个 `api.overlay.*` 方法 MUST 按扩展 id 校验，只能操作自己创建的 overlay |
| N5 平台限制未记录 | **已关闭** | `design.md` D-11「Windows 侧限制」+ R8：DWM 合成关闭时透明失效、`transparent` 不可运行时切换、全屏独占下可能被遮挡、`forward` 仅 `darwin,win32`；宿主 PR 须写入 `troubleshooting.md` |
| N6 实机透明/穿透/CPU 无证据 | **接受风险并登记**（用户裁定） | 转 dev 前置任务卡：最小 demo 窗体（透明方块 + 命中变色）验证 transparent/穿透/置顶，并量关窗前后的 CPU 回落 |
| N7 结算逻辑无自动测试 | **接受风险并登记**（用户裁定） | 转 dev 任务卡：`settle(dt)`/联动记账/挂机发放/成长速率写成纯函数，逐 scenario 建测（含时间回拨、上限钳制、跨多周期补算） |
| N8 webp 透明边缘无证据 | **接受风险并登记**（用户裁定） | 转 dev 任务卡：实机看边缘，若有白边则改 PNG 或内缩 1px 裁剪 |

## 第二轮结构自检（代替官方 CLI；`openspec` 仍未安装 ⇒ **未跑官方校验**）

- 7 份 spec **首行均为 `## ADDED Requirements`**（修正了第一轮把新 requirement 插到标题之前的结构错误）；
- 合计 **24 条 requirement / 44 个 scenario**；`#### Scenario:` 全部 4 个 `#`，3/5/6 个 `#` 命中 **0**；每条 requirement ≥1 scenario（0 例外）；ADDED 正文均含 SHALL/MUST；
- 旧 API 名残留扫描：`api.app.createOverlay` / `api.app.destroyOverlay` / `api.app.setMouseThrough` / "四项通用能力" / "主动 postMessage" / "创建自己的 App 窗体" ⇒ **全部 0 命中**；新命名 `api.overlay.create`(6) / `api.overlay.destroy`(2) / `api.overlay.setMouseThrough`(1) / `pet.subscribe`(2) / `schemaVersion`(4) / 后台扩展(8) 一致；
- `design.md`：七节齐、**12 条决策**（新增 D-11 透明实现路径、D-12 后台扩展）、**9 条风险**（新增 R8 平台限制、R9 共用外壳回归）；`proposal.md` 四个必需标题逐字在。

## 未决项（第二轮）

无。3 条"证据不足"项已按用户裁定登记为 dev 前置任务卡，不阻塞进入 `obox-ext-task`。

---

# 第三轮 · 官方文档复核（用户给出 Electron 官方链接后追加）

依据：[Electron · 自定义窗口样式](https://www.electronjs.org/zh/docs/latest/tutorial/custom-window-styles)（「无边框窗口」「透明窗口 → 局限性」两节）。逐条核对结果与产物改动：

| 官方结论 | 对本 change 的影响 | 落点 |
| --- | --- | --- |
| 不能点击穿透透明区域（无逐像素穿透，electron#1335） | 印证 D-2 只能用 `setIgnoreMouseEvents` **整窗**切换；新增已知取舍"悬停期间窗体空白区也捕获点击" | `design.md` D-11 复核第 1 条 + R1 |
| 透明窗口不可调整大小，`resizable:true` 可能使透明在某些平台失效 | D-1 的 `resizable:false` / `maximizable:false` 由"设计偏好"升级为**官方要求** | `design.md` D-11 复核第 2 条 |
| CSS `blur()` 无法模糊透明窗口下方的内容 | **面板删除 `backdrop-filter: blur(6px)`**（无效开销），玻璃感改由半透明底 + 描边实现 | `design.md` `## UI 视觉规范` 面板底色行 + D-11 复核第 3 条 |
| 打开 DevTools 时窗口不透明 | **N6 的透明验收方法固定为"不开 DevTools + 截图取色"**，否则会误判宿主没改对 | `design.md` D-11 复核第 4 条 + R8 |
| Windows 上透明窗口不能最大化（无系统菜单/双击标题栏） | 与无标题栏 + `maximizable:false` 一致，无额外动作 | `design.md` D-11 复核第 5 条 |
| Wayland/GTK 下需 `hasShadow:false` 才是完全无边框 | 已设 `hasShadow:false`，跨平台一致 | `design.md` D-11 复核第 6 条 |

**复核结论**：D-11 的五处改动清单与窗体参数**不需要推翻**，官方文档反而为其中三条提供了依据；实际改动两处（面板去掉 `backdrop-filter`、N6 验证方法固定为不开 DevTools）。仍未跑官方 `openspec validate --strict`（CLI 未安装）。

---

# 第四轮 · 增补需求校验（Q9–Q13：拖动 / 原地小跑 / 隐藏召唤 / 文案口径 / 面板去属性）

> 触发：用户实机反馈（dev.md R29）+ 两条追加约束（Q12/Q13），裁定**并入本轮**。本轮为**增量校验**：只审增补的 requirement / design 决策，前三轮结论不变。

## 增补的规格面（逐条核对）

| capability | 增补 requirement | scenario 数 | 与 design 的落点 |
| --- | --- | --- | --- |
| `pet-window` | 拖拽精灵移动窗体 + 松手持久化 + 钳工作区 + 与踱步/隐藏互斥 | 3 | D-13（增量通道 `pet.drag`、钳位公式、位置失效回退、被否决备选） |
| `pet-window` | 隐藏态同窗体只渲染召唤胶囊 + 停帧循环 + 持久化 + toggle 关→开清除 | 3 | D-15（优先级：设置 > 隐藏态；CPU 口径；被否决备选） |
| `pet-sprites` | 自发原地小跑（`running` 轨一轮）+ `running-left/right` 本轮 MUST NOT 使用 | 3 | D-14（4–10 分钟随机、触发条件、不推进 `lastInteractAt`） |
| `pet-interaction` | 面板内容改为"成长值+等级+库存+四按钮"，**MUST NOT 显示三属性** | （并入原悬停 scenario） | UI 视觉规范（删属性小条色值行与属性行布局）、Q13 |
| `pet-interaction` | 点召唤胶囊 = 第五种 `interact` kind（`summon`），不耗道具不改数值 | 1 | D-15 |
| `pet-interaction` | 文案与上游逐字一致（五句）+ 全量禁「数字+时间单位」「属性增量数字」 | 2 | D-16 文案总表 + 正则扫描断言 |

结构自检：增补后 7 份 spec 共 **27 条 requirement / 56 个 scenario**；`#### Scenario:` 仍全为 4 个 `#`；每条 requirement ≥1 scenario；ADDED 正文含 SHALL/MUST；新增 requirement 均挂在既有 capability 下（**不新增 capability**，符合"一个 capability 一条能力线"：拖动/隐藏属窗体能力线、小跑属图集动画线、文案与召唤属交互线）。

## 九维度复审（增补面）

| 维度 | 结论 |
| --- | --- |
| 互相冲突 | **无**：Q13 取代 Q7 的面板结论已在 grill 显式标注"被本问取代"；D-4 优先级表与 D-14/D-15 的互斥规则一致（hidden 不参与轨优先级、trot 要求基础态 idle） |
| 需求遗漏 | **无**：Q9–Q13 每条都有 requirement + design 落点；宿主新增面仅 `setPosition` 一个方法（proposal Impact 已列） |
| 不可验收 | **无**：文案禁令给了可执行判据（两条正则 0 命中）；拖动给了钳位与持久化 scenario；小跑给了触发/抑制 scenario |
| 与宿主不符 | `api.overlay.setPosition` **尚不存在**（待卡 14 实现）——与当初 `create/destroy/setMouseThrough` 同性质：先定规格后实现，已列入任务卡 |
| 权限与安全 | `setPosition` 与既有三方法同作用域约束（proposal Impact 已扩写为"四个方法"）；拖动钳位避免窗体被拖出屏幕造成"找不到宠物" |
| 数据语义与迁移 | `state.json` 增 `position:{x,y}` 与 `hidden:boolean`，`schemaVersion` **仍为 1**（缺字段按默认值的既有清洗逻辑覆盖，无需迁移）——已在 proposal Impact 注明 |
| 行为冲突 | 拖动与 `setMouseThrough` 的交互已定义（拖动中指针必在窗体内 ⇒ 穿透已关）；召唤胶囊的 hit-test 与穿透互斥见 R11 |
| 兼容与异常 | 位置失效回退（换显示器/改分辨率 ⇒ 钳回；NaN ⇒ 回退 anchor + warn）已写进 requirement |
| 可维护性 | 文案表单点维护在 `lib/constants.js` 并有逐字测试（R12：上游漂移不自动跟随） |

## 新增"证据不足"项（归普通问题，门禁单独追问）

| # | 缺什么证据 | 补证方式 |
| --- | --- | --- |
| N9 | 拖动手感与钳位、隐藏态 CPU/穿透、原地小跑触发 —— **均未实机验证** | 卡 16（增补实机复验）：真实鼠标拖动 + 隐藏态点胶囊 + 等待/强制触发一次 trot |
| N10 | 文案与上游"逐字一致"目前靠人工比对上游源码 | 卡 15 测试钉住逐字字符串 + 卡 16 实机截图气泡文本比对 |

## 未决项（第四轮）

无。增补面全部归入"已关闭"（用户答复 Q9–Q13 + 代理查得事实）；N9/N10 为证据不足项，按流程在门禁单独追问后转任务卡。

---

# 第五轮 · Q15 变更校验（面板图标化 + 彻底取消隐藏/召唤）

> 触发：用户裁定 Q15（三枚图标一行、取消面板隐藏按钮）与 Q15=B（彻底取消隐藏功能）。本轮为**收缩型变更**校验：只核"删除是否干净、是否留下不可达规格/代码、计数是否自洽"。

## 规格面变化

| capability | 变化 | 结果计数 |
| --- | --- | --- |
| `pet-window` | **删除**「隐藏态 SHALL 只渲染召唤胶囊…」整条 requirement（含 3 scenario）；拖动 requirement 的互斥对象由"踱步/隐藏"改为"踱步" | 5 req / 11 scenario |
| `pet-interaction` | **删除**「点召唤胶囊 SHALL…」整条 requirement（含 1 scenario）；面板 requirement 改为"三枚图标按钮、同一行、MUST NOT 提供隐藏入口、每枚 MUST 有 `aria-label`+`title`"；文案 requirement 删「召唤胶囊 `召唤鲸鱼娘`」句、补"图标可访问名属控件标签"口径；悬停 scenario 的"五类信息"改"四类" | 4 req / 7 scenario |
| `pet-sprites` | trot 触发条件删"非隐藏"；scenario 的抑制条件删"隐藏" | 5 req / 12 scenario |
| 其余四份 | 无变化（`pet-vitals` 4/8、`pet-economy` 2/5、`pet-growth` 2/4、`pet-settings` 3/5） | — |
| **合计** | 27 req / 56 scenario → **25 req / 52 scenario** | 已用脚本复核计数 |

## 九维度复审（收缩面）

| 维度 | 结论 |
| --- | --- |
| 互相冲突 | **已消除**：Q11 与 Q15=B 冲突（前者要隐藏态、后者删掉它），grill 已显式标注"Q11 的结论被 Q15 取代"，design D-15 改为撤销说明并保留历史备选 |
| 需求遗漏 | **无新增遗漏**：隐藏语义由既有 `pet-window` 的 toggle requirement（销毁而非隐藏）完整承担；面板互动仍由 `pet-interaction` 的喂食/洗澡/玩耍 requirement 覆盖 |
| 不可达规格/代码 | **本轮重点**：删除后不得留下"规格无、代码有"的僵尸通道 ⇒ 卡 17 的验收含**负向断言**（`KINDS` 不含 summon/hide、`buildView` 不含 hidden 键、`serialize` 白名单不含 hidden、页面无 `.summon` 节点与"隐藏"按钮、产物 grep `召唤鲸鱼娘`/`isHidden` = 0） |
| 可验收 | 图标行给了可执行判据（三枚同一行、各有 `aria-label`+`title`、无文字标签、内联 SVG 不用图标字体/emoji）；D-16 的两条正则禁令继续覆盖可访问名 |
| 与宿主不符 | 无新增宿主面（Q15 纯扩展侧）；`setPosition`（卡 14）不受影响 |
| 权限与安全 | 无变化 |
| 数据语义与迁移 | **新增一条兼容要求**：旧存档可能含 `hidden:true` ⇒ `deserialize` MUST 忽略废字段（不报错、不触发备份重建）；`schemaVersion` 仍为 1（字段删除属"读时忽略"，不需要版本递增） |
| 行为冲突 | 拖动与 trot 的互斥保留；删除隐藏态后 `hitBoxes` 只剩"精灵 ∪ 面板可见"一支，口径回到卡 08 的原始定义 |
| 可维护性 | 少一个持久字段、两个 interact kind、一条渲染分支 ⇒ 净简化；Risks R11 标为已撤销但**保留编号**（避免其它文档的 R 编号漂移） |

## 证据不足项（第五轮）

| # | 缺什么证据 | 补证方式 |
| --- | --- | --- |
| N11 | 三枚图标一行的**实机观感**（尺寸/间距/禁用态/焦点环）与 `aria-label` 的实际可访问名 | 卡 17 完成后由卡 16 的实机代理复验（同一代理续跑，工具与 CDP 通道已在手） |
| N12 | D-1（`pet.diagnostic` 跨会话残留）修复后的实机确认 | 同上：预置旧诊断值 → 新会话启动 → 设置页应为「（无）」 |

## 未决项（第五轮）

无。Q15/Q15=B 为用户答复；N11/N12 为证据不足项，转卡 17 完成后的复验。

---

# 第六轮 · Q16/Q17 变更校验（每 10 秒随机表演 + 图标白线透明底与悬浮显名 + 面板即时关闭）

> 触发：用户裁定 Q16=A（随机集只含"表演型"动作、trot 定时器并入 10 秒机制、打盹期间不播）与 Q17（图标透明底/白线/悬浮显名；面板"指针在宠物或面板上"才显示、其它情况立刻关闭）。本轮为**机制替换 + 视觉微调**校验。

## 规格面变化

| capability | 变化 | 结果计数 |
| --- | --- | --- |
| `pet-sprites` | **替换**原「自发原地小跑（2–5 分钟、`running-left/right` MUST NOT 使用）」requirement ⇒ 新「每 10 秒随机播放"表演型"动画；状态指示轨 MUST NOT 参与」requirement（4 scenario：每 10 秒一轮 / 互动可打断 / 打盹不表演 / 侧跑轨不位移） | 4 req / 11 scenario |
| `pet-interaction` | 面板 requirement 改写：开合条件 = 指针在宠物命中区**或**面板上，其它情况 **MUST 立刻关闭**；三枚图标按钮 **底色透明 + 白色线条 + 悬浮（或聚焦）即时显示中文动作名 + 保留 `aria-label`**；悬停 scenario 的"移出后面板关闭"改"指针移到面板上保持显示、完全离开立刻关闭" | 4 req / 7 scenario |
| 其余五份 | 无变化 | — |
| **合计** | 25 req / 52 scenario → **24 req / 51 scenario**（`pet-sprites` 的替换是 5→4 req、3 scenario→…按净变化：旧 1 req/3 scenario 换成 1 req/4 scenario，另因 Q15 已把 5→4 计入） | 已用脚本复核 |

## 九维度复审（Q16/Q17 面）

| 维度 | 结论 |
| --- | --- |
| 互相冲突 | **已消除**：Q16 取代 Q10/Q14 的 trot 节奏（grill/design 均注明"trot 定时器退役、`trot` 作为状态条目保留"）；R40 的关系断言随之退役（10s ≪ 10 分钟天然成立），dev.md 已留痕 |
| 需求遗漏 | **已补齐**：新状态 `run-left`/`run-right` 需要 `mapping` 条目 + `buildView` 能表达 ⇒ 已进卡 18 实现清单与验收 |
| 不可验收 | 给了可执行判据：随机集**恰 7 项且不含 hungry/dirty/sad/sleep**（集合断言）、`run-left/right` 播放期间 `rec.positions` **不增加**（零位移）、图标 `stroke` 为白色且 `.act` 无 `linear-gradient`（产物 grep，**js 与 css 都要扫**）、`.tip` 浮层存在、面板关合不被过渡延迟 |
| 与宿主不符 | 无新增宿主面；`api.timer` 只收**整数秒 ≥1**（`api-reference.md:552,572`）⇒ 10s 合法（原 1.5s 回落本就不能用定时器，现由页面侧锁存处理，机制不变） |
| 权限与安全 | 无变化 |
| 数据语义与迁移 | 无持久化字段变化（随机表演是运行时瞬态，不落盘）⇒ `schemaVersion` 不变 |
| 行为冲突 | **优先级已定**：随机表演低于真实互动、高于 hungry/dirty/sad/idle，且 sleep 期间不触发；与拖动互斥沿用 D-13（拖动期间不表演）——卡 18 需在触发条件里保留"非拖拽"（若入口能感知拖拽；不能则说明由"指针在窗体内"天然覆盖） |
| 兼容与异常 | 随机集的单一来源在 `lib/constants.js`，测试断言集合内容 ⇒ 将来改集合会红，防止与规格漂移 |
| 可维护性 | 少一套定时器（trot 退役）⇒ 净简化；`running-left/right` 从"永不用"变成"原地随机表演"，Non-Goal（不位移）不变，可逆（从集合删两项即可） |

## 证据不足项（第六轮）

| # | 缺什么证据 | 补证方式 |
| --- | --- | --- |
| N13 | 10 秒随机表演的**实机观感**（节奏是否合适、侧向原地跑是否别扭、打盹期间确实安静） | 卡 18 完成后由实机代理复验（观察 60–90 秒、截图/帧采样），若"侧向原地跑"观感别扭 ⇒ 只从随机集删两项（可逆，父代理改规格 + 一句实现改动） |
| N14 | 图标透明底/白线在**深色玻璃面板**上的可读性与悬浮浮层位置 | 同上：CDP 读计算样式（`stroke` 值、`background` 透明、`.tip` 可见性）+ 悬停截图 |

## 未决项（第六轮）

无。Q16/Q17 为用户答复；N13/N14 为证据不足项，转卡 18 完成后的实机复验。

# 03 · host-overlay-window（宿主：overlay 窗体创建/销毁 + 五处透明改动）

| 字段 | 内容 |
| --- | --- |
| **目标** | 实现 overlay 窗体的**主进程与外壳**：按 `api.overlay.create` 的参数创建 `BrowserWindow`（透明/置顶/不占任务栏/不可 resize/初始右下角）、`destroy` 真正销毁、`setMouseThrough` 切换穿透；并把 D-11 列出的**五处绘制点**一次改齐，使窗体除页面内容外**完全透出桌面**；停用/卸载扩展时回收其 overlay。 |
| **输入** | `design.md` D-1（窗体参数与定位公式）、D-2（穿透与命中转发）、D-11（**五处改动表** + 官方文档复核 6 条 + 被否决的"直接加载扩展页"方案与安全理由）、D-12（后台扩展）；`specs/pet-window/spec.md` 三条 requirement（自动出现于右下角 / 空白区完全透出桌面 / 不可 resize / toggle 销毁而非隐藏 / 停用即回收）；锚点：`src/main/appWindow.ts:64-94`（现有窗体选项与 `app:open-window`）、`src/renderer/src/AppWindow.vue:202,228,233,239`（TitleBar 与三处背景）、`src/renderer/src/assets/main.css:37-51`（全局 `body{background:var(--bg)}`）、`src/preload/index.ts:25`、`src/renderer/src/extensions/app/AppView.vue:52`（既有卡片开窗路径，**不得回归**）；`node_modules/electron/electron.d.ts:4080/3851/4031/3924/4015/4049/3846/12298/8115/3392/22298-22306`（选项与 API 存在性）。 |
| **文件所有权** | `src/main/appWindow.ts`、`src/main/index.ts`（IPC 处理器）、`src/renderer/src/AppWindow.vue`、`src/renderer/src/assets/main.css`、`src/renderer/src/core/host.ts`（`api.overlay` 运行时接线）、`test/overlay-window.test.ts`（新建）。**不含** `src/api/types.ts`、`src/shared/types.ts`（卡 02）。 |
| **验收命令** | 宿主根：`npm run typecheck` + `npm run lint` + `npm test`（全绿）；新测试须覆盖：① overlay 创建参数映射（`transparent`/`backgroundColor:'#00000000'`/`alwaysOnTop`/`skipTaskbar`/`hasShadow:false`/`thickFrame:false`/`roundedCorners:false`/`resizable:false`/`maximizable:false`）；② `anchor:'bottom-right'` + `margin` 的坐标公式（用假 `workArea` 断言 x/y）；③ `destroy` 后窗体与 pending 订阅被清理；④ `setMouseThrough` 调 `setIgnoreMouseEvents(true,{forward:true})` / `false`；⑤ **作用域**：A 扩展不能销毁/穿透 B 扩展的 overlay；⑥ overlay 模式下外壳不渲染 TitleBar（组件级断言）。另需**既有卡片回归**：`npm test` 中原有 app 窗口/卡片测试全绿。 |
| **依赖与阻塞** | 依赖 **02**（类型面）与 **01**（实机结论决定是否需要调参）。**阻塞** 05（文档要写实际行为）、11（实机联调）。 |
| **并行组** | 组 2 |

## 负向自检（不改实现）

- 非法/越权输入断言被拒：`create` 用未注册的 `extId`、`destroy` 别人的 `overlayId`、`setMouseThrough` 传非布尔、`margin` 为负 ⇒ 断言抛错或返回错误码。
- 透明回归判据不用"临时改坏 CSS"：改用**断言 overlay 模式下三处背景的 computed 值为 `transparent`**（组件/单测层面），以及 `AppWindow.vue` 在 overlay 模式不渲染 `<TitleBar>`。

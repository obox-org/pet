# Tasks

> change：`pet-v2-growth-favor`｜依据：`specs/*/spec.md`（25 条新增 + 4 条删除、57 scenario）、`design.md`（七节、10 决策）、`notes/validation.md`（1 严重已裁定 + 7 普通已处置 + 4 建议登记 + 证据不足已接受）。
> 门槛（每卡通用）：扩展工程根跑 `npm test`、清 `dist/` 后 `npm run build`、`vue-tsc --noEmit`、`npm run pack`（回读自检 18 条目）；宿主 `vue-tsc` 与 `npm test` 仅在第 8 步整体复跑时使用（本 change 不改宿主）。

## 1. 入口数据层（值模型 / 存档 / 结算 / 映射）

**组文件所有权**：`lib/constants.js`、`lib/growth.js`、`lib/persist.js`、`lib/settle.js`、`lib/mapping.js`、删除 `lib/vitals.js`、`test/values.test.js`（新建）

- [ ] 1.1 删三属性、建成长值/好感值模型与 10 级阈值映射、写 v1 存档迁移与归一。验证：`test/values.test.js` 覆盖成长来源（互动/每小时/关窗不计）、好感只增无上限、阈值边界（19→20 等）、迁移（留 growth/道具/时间戳、favor=0、三属性消失）、损坏值归一。

## 2. 文本池（128 条 + 取样）

**组文件所有权**：`lib/texts.js`（新建）、`test/texts.test.js`（新建）

- [ ] 2.1 把 `notes/texts.md` 的 120 条等级文本 + 8 条冷却文本落成数据模块，并实现"1..当前等级并集 + 均匀随机 + 相邻去重"的取样。验证：`test/texts.test.js` 逐条正则（无数字、无 `分钟/小时/秒`、无旧属性名、无功能承诺）、条数（10×12 + 8）、等级揭示（第 N 级不出现 N+1）、相邻去重、第 1 级也可见冷却文本。

## 3. 互动与冷却（喂食 / 洗澡 / 点击）

**组文件所有权**：`lib/interact.js`、`test/interaction-v2.test.js`（新建）

- [ ] 3.1 两枚互动（喂食/洗澡）各 +1/+1 并耗对应道具、共享 10 分钟冷却、点击 1 小时 1 次 + 冷却期动画与冷却文本、取消 `play`。验证：`test/interaction-v2.test.js` 覆盖判定顺序（冷却→库存）、拒绝不产生副作用、冷却跨重启、点击冷却期"数值不变但仍播动画 + 冷却文本"、旧 `play`/`summon`/`hide` 载荷按未知互动拒绝。

## 4. 入口编排（定时器 / 视图 / 设置字段）

**组文件所有权**：`index.js`、`manifest.json`、`lib/bridge.js`、`test/timers-v2.test.js`（新建）

- [ ] 4.1 五个定时器（tick 60s / perf 60s / text 300s / bubble 4s / transient）与视图字段（growth、favor、levelName、气泡、`anim.self`），取消打盹与全部睡眠表现；`manifest.json` 设置字段改为开关 + 成长值 + 好感 + 等级 + 诊断，版本 `2.0.0`。验证：`test/timers-v2.test.js` 覆盖注册秒数（60/60/300）、互动优先级替换气泡、定时文本在占用时被丢弃、无任何 sleep 常量与分支、设置字段类型合法（`boolean/progress/status`）且无 description。

## 5. 页面与面板（视图消费 / 气泡 / 两图标 + 等级名）

**组文件所有权**：`app/App.vue`、`app/lib/state.ts`、`app/lib/anim.ts`、`app/components/PetPanel.vue`、`app/style.css`、`test/view-v2.test.js`（新建）

- [ ] 5.1 页面消费新视图（无三属性、无 sleep）：气泡 4000ms、面板两枚图标 + 一行只读等级名（不显示数字）、悬浮即时显名、白色焦点环、播完回落与 `anim.self` 锁存保持。验证：`test/view-v2.test.js` 断言视图归一化（缺字段降级）、气泡时长常量 4000、面板不渲染数字、图标 SVG 白描边与 `.tip`、无沉睡相关样式；`npm run build` 产物禁止项全 0。

## 6. 旧测试清理与 README

**组文件所有权**：`test/**`（**除** `test/values.test.js`、`test/texts.test.js`、`test/interaction-v2.test.js`、`test/timers-v2.test.js`、`test/view-v2.test.js` 这五个新文件）、`README.md`

- [ ] 6.1 删除/改写引用三属性、睡眠、`play`、旧设置键的既有测试（`vitals/actions-*/extension/bridge/window/settings-*` 等），并把 README 的玩法、数值、文本、设置、版本号全部更新到 v2。验证：`npm test` 全绿且用例数与新 spec 匹配；`git grep` 在 `test/` 与 `README.md` 中不再出现 `hunger|clean|mood|SLEEP_AFTER|打盹|play` 作为现行口径（历史说明除外，需逐条列明）；`npm run pack` 产出 `out/pet-2.0.0.oix`。

## 并行组

| 组 | 卡 | 理由 |
| --- | --- | --- |
| G1 | 1、2 | 文件所有权完全不相交（1 改 `lib/{constants,growth,persist,settle,mapping}`，2 只建 `lib/texts.js`），无数据依赖 |
| G2 | 3 | 依赖 1 的常量（冷却/等级阈值）与 2 的取样 API |
| G3 | 4 | 依赖 1/2/3 的落地 API（视图、互动、文本取样） |
| G4 | 5 | 依赖 4 的视图字段契约（`growth/favor/levelName/anim.self`） |
| G5 | 6 | 依赖 1–5 全部落地（要清理的旧测试据最终 API 改写） |

# dev — pet-v2-growth-favor（实现记录）

> 本步只写代码、**不提交**；交付归档 / 文档同步 / 提交 / 发版在 `obox-ext-ship`。

## 并行批次

| 批次 | 卡 | 说明 |
| --- | --- | --- |
| B1 | 01、02 | 文件所有权不相交、无数据依赖 ⇒ 并行（同组 G1） |
| B2 | 03 | 依赖 01 的常量与 02 的取样 API |
| B3 | 04 | 依赖 01/02/03 的落地 API（视图字段、互动、文本） |
| B4 | 05 | 依赖 04 输出的视图字段契约 |
| B5 | 06 | 依赖 01–05 全部落地（清理旧测试 + README v2） |

## 开工前工作区快照

`git status --porcelain`（开工前）：仅 `openspec/changes/pet-v2-growth-favor/` 下的新产物（grill / proposal / design / specs / texts / validation / tasks / 任务卡），无代码改动。

## 各卡回执

（待回填：改动清单 + 门槛原始输出）

### 卡 01 · values-and-store（✅ 完成）

- **改动**：`lib/constants.js`（删三属性/衰减/联动/打盹/旧等级表；建 `GROWTH_PER_INTERACT/HOUR`、`GROWTH_BACKFILL_CAP_HOURS`、`INTERACT_COOLDOWN_MS`、`PET_COOLDOWN_MS=3_600_000`、`FAVOR_PER_*`、`FAVOR_THRESHOLDS/LEVEL_NAMES`、`BUBBLE_MS=4000`、`TEXT_EVERY_SEC`、`TICK_SECONDS=60`）、`lib/growth.js`（重写：数值原语 `clamp/finiteOr/toNonNegInt`、`levelOf`、`accrueGrowth`）、`lib/persist.js`（重写：迁移 + 双语义时间戳归一 + `migratedFromV1` 信号）、`lib/settle.js`（重写：去衰减、`accrueGrowth`、`lastAfkAt`、`onWindowDestroyed`）、`lib/mapping.js`（状态表 8 键、`resolveStatus` 只剩 transient→idle）、**删除 `lib/vitals.js`**、`lib/items.js`（仅第 8 行 import，R57 批准）、新建 `test/values.test.js`（28 条）。
- **门槛原始输出**：`npm test -- test/values.test.js` ⇒ `tests 28 / pass 28 / fail 0`；6 个 lib 模块 `import` 全部可加载；`vue-tsc` 0 error；prettier 通过。
- **自选口径（均给出理由）**：`levelOf` 落 `growth.js`（纯数值，与 `mapping.js` 的动画映射职责分开）；**冷却基准非法/未来 ⇒ 0（视为到期）**；**累积基准**缺失 ⇒ now、非法 ⇒ `lastGrowthAt=0`/`lastAfkAt=now`（"宁可少发不可多发"，避免一次补满库存）、未来 ⇒ now；`schemaVersion` 保持 1（抬版会让 v1.0.2 存档被判坏档重建 ⇒ 丢 growth/道具）；`TICK_SECONDS` 15→60（对齐 design D-3）。
- **整仓中间态**：`tests 101 / pass 78 / fail 23`，全部指向卡 3（`interact.js` 未迁移）与卡 6（旧用例引用已删能力）；卡 1 未改动任何旧用例。
- **给卡 4 的硬约束**：`onTick` 必须传 `{ overlayExists }`；用 `deserialize` 的 `migratedFromV1` 写"已丢弃 v1 三属性"诊断；清理三个旧设置键。

### 卡 02 · favor-texts（✅ 完成）

- **改动**：`lib/texts.js`（新建，零 import 纯模块：`LEVEL_TEXTS` 10×12、`COOLING_TEXTS` 8、`TEXT_TOTAL` 推导值 128、`pickFavorText(level,last,rand)`、`pickCoolingText(last,rand)`、共用底座 `pickFromList`）、`test/texts.test.js`（新建，20 个 test）。
- **去重实现**：先把 `last` 从候选剔除再取 ⇒ **每次取样只调用一次 `rand()`**（无"抽到就重抽"的死循环风险）。
- **逐字一致性**：`%TEMP%\verify-texts-parity.mjs` 解析 `notes/texts.md` 与模块做 `===` **且码点级**比较 ⇒ `ALL 128 TEXTS VERBATIM-IDENTICAL`。
- **门槛原始输出**：`npm test -- test/texts.test.js` ⇒ `tests 20 / pass 20 / fail 0`；`node -e` ⇒ `128 10 12,12,12,12,12,12,12,12,12,12`；`vue-tsc` 0 error；prettier `--check` 通过。
- **跨卡观察（非缺陷）**：卡 1 删除 `lib/vitals.js` 后，`lib/interact.js:27` 仍 import 它 ⇒ 整仓 16 个测试文件暂时失败，属**卡 3 的迁移范围**；卡 2 施工期间整仓曾 217/217 绿（证明新增 `lib/texts.js` 不破坏既有测试）。

### 卡 03 · interaction-v2

### 卡 03 · interaction-v2（✅ 完成）

- **改动**：`lib/interact.js`（重写：`KINDS = ['feed','bathe','pet']`、`interact(state,kind,now)` 纯函数、`SHARED_COOLING_TEXT`、`msSince()` 冷却原语、`reject()` 统一形状；`vitals.js` 的 import 迁到 `growth.js` 的 `finiteOr/toNonNegInt`；`ledgerRecover` 与 `withRecovery` 整体删除——属性联动已废，无逻辑可迁）、新建 `test/interaction-v2.test.js`（16 条）。
- **门槛原始输出**：`npm test -- test/interaction-v2.test.js` ⇒ `tests 16 / pass 16 / fail 0`；`vue-tsc` 0 error；prettier 通过。
- **返回契约（转给卡 4，不得改形状）**：成功 `{ok:true,anim,text,state}`；共享冷却 `{ok:false,reason:'cooling',text,state}`；无道具 `{ok:false,reason:'no-item',text:noFish|noBubble,state}`；点击冷却 `{ok:false,reason:'pet-cooling',anim:'petted',text:pickCoolingText(state.speech.text),state}`；未知 kind `{ok:false,reason:'unknown-kind',state}`（**无 text、不弹气泡**，入口写诊断）。`interact` 不碰 `transient/transientSelf/speech/rev`、不排定时器。
- **整仓中间态**：`tests 131 / pass 100 / fail 31`，16 个红文件全部指向卡 4（`bridge.js` 的 `rankOf` 死 import）与卡 6（旧用例）；新增的三个测试文件（values 28 / texts 20 / interaction-v2 16）全绿。
- **移交**：`bridge.js:11` 死 import（卡 4）；`playOk`/`feedCooling`/`petCooling` 三句死文案（卡 6）。

### 卡 04 · entry-orchestration

### 卡 04 · entry-orchestration（✅ 完成）

- **改动**：`index.js`（五个定时器 `pet-tick` 60 / `pet-perf` 60 / `pet-text` 300 / `pet-bubble` 4s 一次性 / `pet-transient`，由 `startClocks`/`stopClocks` **单一挂摘点**管理并随窗体生命周期挂摘；`onTick` 逐字传 `{ overlayExists: overlayAlive }`；`pet.interact` 按卡 3 契约重写；定时文本按等级取样、被占用即丢弃且不动 `lastTextAt`；随机表演无气泡零副作用；删打盹与 v1 `noteInteraction`（鼠标扫过不再重置 10 分钟冷却）；迁移收尾 = 诊断 + 三个旧设置键置空 + 存档重写）、`lib/bridge.js`（`rankOf`→`levelOf`，视图改 `{items, values:{growth,favor,level,levelName}, anim:{…,self}, bubble}`，删 `vitals`）、`manifest.json`（`2.0.0` + 恰 5 个设置字段、全无 description、`favor.max=650`）、新建 `test/timers-v2.test.js`（18 条）。
- **门槛原始输出**：`npm test -- test/timers-v2.test.js` ⇒ 18/18；manifest `node -e` 断言通过 + 仓库 `validate-manifest.mjs` 通过；`npm test` 整体 `245 tests / 177 pass / 68 fail`（**全部 16 个卡 6 旧文件**）；`vue-tsc` 0 error；清 `dist/` 后 `npm run build` 成功。
- **`overlayExists` 三重证据**：`index.js:839` 唯一调用点、`overlayAlive` 在 create/destroy 两处翻转（`:752/:798`）、测试同时断言"true ⇒ 涨 / false ⇒ 不涨且基准推进（关窗 3h 再开只补 1h）"与源码门禁（不存在 `overlayExists: true|false|undefined` 字面量）。
- **裁定 R58**：`KEY_HUNGER/KEY_CLEAN/KEY_MOOD` **保留**（正被迁移清理使用，非死代码）；`TEXT.sleeping` + `playOk`/`feedCooling`/`petCooling` 交卡 6 删；5 个局部字面量（`TEXT_TIMER_ID`/`BUBBLE_TIMER_ID`/`KEY_GROWTH`/`KEY_FAVOR`/`KEY_LEVEL`）**留在 `index.js`**，登记为 v2.0.1 可选清理（搬进 `constants.js` 需跨两个所有权，收益仅为"少 5 处字面量"）。
- **移交卡 5 的接线坑**：页面**不能**沿用 v1 `unwrap`（把 `ok===false` 一律当错误）；`cooling`/`no-item`/`pet-cooling` 必须走气泡（`tone:'bad'`），只有 `unknown-kind` 是错误。
- **观察**：整仓 `npm test` 因 `extension.test.js` 的长轮询用例真跑 25s hold，耗时从 0.3s 升到约 25s；卡 6 重写后应回落到秒级。

### 卡 05 · page-and-panel（✅ 完成）

- **改动**：`app/lib/state.ts`（视图四字段 `items/values/anim/bubble`、`BUBBLE_MS=4000`、归一化降级、`interactDispatch` 分流）、`app/lib/anim.ts`（`PetStatus` 8 个、八轨 `speed:1`、`TRANSIENT_SET` 七项、`KIND_TO_STATUS` 三种、删属性仲裁）、`app/App.vue`（气泡 4000ms、`reason` 分流替代 `unwrap`、删睡眠分支、精灵焦点环改白）、`app/components/PetPanel.vue`（两枚图标 + 一行等级名、零数字、token 化）、`app/style.css`、新建 `test/view-v2.test.js`（22 条）。
- **门槛原始输出**：`view-v2` 22/22；`build` 成功；`vue-tsc` 0；产物禁止项按词边界全 0（`clean=7` 是 Vue 运行时 `cleanups`，已如实标注）；必需项 `<svg`=3 / `stroke:#fff`=1 / `.tip`=3。
- **裁定**：面板 ✕ 关闭按钮**保留**（面板 chrome + 唯一键盘关闭入口，不违反"互动区恰两枚图标"）；精灵焦点环改白、图集失败占位改 token 均批准。

### 卡 06 · cleanup-and-readme（✅ 完成）

- **改动**：17 个旧测试文件重写 + 删 `test/growth.test.js`；`README.md` 全面重写为 v2；`lib/constants.js` 只删 4 条死字符串（`petCooling`/`feedCooling`/`playOk`/`sleeping`）。
- **门槛原始输出**：`npm test` = **284 / 284 / 0 fail / 0.32s**（改造前 267/187/80/25.2s；长轮询真等 25s 的问题一并修掉）；`pack` ⇒ `out/pet-2.0.0.oix`（18 条目，1,661,403 B）；`vue-tsc` 0 error；`build` 成功且产物禁止项全 0。
- **裁定 A**：`TEXT.sleeping` 等键名在 `app/lib/state.ts`（页面自有兜底表）、负向门禁测试与 README 沿革段仍会出现，**接受"入口侧零引用 + 逐条列明"**，不动 `app/**`。

## 门槛汇总（父代理独立复跑）

| 门槛 | 结果 |
| --- | --- |
| `npm test` | ✅ **284 tests / 284 pass / 0 fail**（310ms） |
| `npm run build`（先清 `dist/`） | ✅ 26 modules、`index-Bsxlc5_3.css` 4.62 kB、`index-C6rUe7Zg.js` 91.61 kB |
| 产物 grep（禁止项，词边界） | ✅ `hunger/clean/mood/sleep/打盹/playOk/feedCooling/2600/38bdf8/7dd3fc/linear-gradient/backdrop-filter` 全 **0**（`clean` 原始 7 次为 Vue 运行时 `cleanups`；`petCooling` 2 次为页面自有键，按裁定 A 保留） |
| 产物 grep（必需项） | ✅ `<svg`=3、`stroke:#fff`=1、`.tip`=3、`levelName`=5、`喂食`=2、`洗澡`=2、`var(--bg-panel)`=2 |
| `vue-tsc --noEmit` | ✅ 0 error |
| `npm run pack` | ✅ `out/pet-2.0.0.oix`（18 条目，1,661,403 B，回读自检通过，SHA-256 `DB8CE04D8E3E1008…`） |
| 提交状态 | ✅ 无暂存、HEAD 仍 `99e4307`、提交数仍 7 |

## 修复轮 R-S1 · fix-favor-exact（S-1：满级后设置页看不到真实好感值）

> 触发：第 8 步验收 `notes/check.md` 的 **S-1**（唯一影响用户可见数据的严重问题）。任务卡 `notes/tasks/07-fix-favor-exact.md`。

**根因（三层，缺一都不成立）**

1. **宿主钳制**：`progress` 字段的 `{cur}` 在渲染前被钳到 `[0,max]` 再向下取整（宿主 `SettingsView.vue:685-687`；文档同口径 `src/api/contributions.ts:87-92`），`max: 650` ⇒ 好感 651 时只显示 `650/650`。
2. **好感无上限**：Q9 裁定满级（650）后继续累加（`pet-values` R2）⇒ 钳制不是"越界的极端情况"，而是**满级后的常态**：真实进度永久不可见。
3. **design 要求的出口没落地**：`design.md:13` 写明"`progress` 会饱和，精确数字必须另用 `status` 行展示"，但 `manifest.json` 只有 5 个字段、没有任何一行承载精确好感值；`pet.level` 承载的是等级名。旧回执与 README 却写成"精确数字与等级名如实显示"（`dev.md:53`、`README.md:88`），与宿主实际渲染**相反** ⇒ 单测只断言"写进设置键的是 651"（`test/timers-v2.test.js:472-480`），断不到"显示得出来"。

**改法（4 个文件，均在任务卡所有权内）**

| 文件:行 | 改动 |
| --- | --- |
| `manifest.json:20` | `pet.favor` 之后、`pet.level` 之前新增 `{ "key": "pet.favorExact", "label": "好感（精确值）", "type": "status", "default": "0" }`（**无 `description`**；不用 `progress`，因为正是 `progress` 才会被钳）⇒ 设置字段 5 → **6 项** |
| `index.js:82` | 新增入口本地常量 `KEY_FAVOR_EXACT = 'pet.favorExact'`（与既有 5 个本地字面量同批，仍登记为 v2.0.1 可选清理：搬进 `constants.js` 会跨所有权） |
| `index.js:231-239` | `syncValueSettings()` 增加 `api.settings.set(KEY_FAVOR_EXACT, String(state.favor))`（**不钳**，与 `pet.favor` 写同一个真值）；注释按事实重写（原文"进度条满格而数字如实显示"是错的，改为"宿主钳 `progress`，真值只在这条 status 行"） |
| `index.js:63-77`、`:1087` | 文件头"三个设置键"→"四个设置键"、首帧同步注释补上精确值 |
| `test/timers-v2.test.js:487-562` | 新增 2 条用例（见下）+ 文件头第 10 条口径（`:22-24`）+ 既有"每个 rev++ 之后"用例补 `pet.favorExact` 不变断言（`:641`、`:647`） |
| `README.md:12/69/82-92/117/151/183/189/195` | 措辞按事实改正：先前的"好感超过 650 时进度条满格而**精确数字与等级名如实显示**"是错的 ⇒ 改为"进度条按 650 封顶（满级后保持满格），旁边的「好感（精确值）」一行显示精确好感值"；设置段字段清单 5 → **6 字段 / 5 逻辑行**；测试数 284 → 286 |

**新增测试（2 条，`test/timers-v2.test.js`）**

1. `R-S1 · 满级后精确值可见：favor 0/650/651/99999 ⇒ pet.favorExact 写 "0"/"650"/"651"/"99999"，pet.favor 写同一个真值（钳制是宿主行为，扩展侧不钳）`——四个点逐一断言 `pet.favorExact` 是**字符串真值**、`pet.favor` 是**同一个数字真值**（不是 650），并核视图 `values.favor` 同源、等级名不越界（99999 ⇒ 仍是「命定相伴」）。
2. `R-S1 · manifest 契约：设置字段恰 6 项、全部无 description、类型均合法，且 pet.favorExact 是 favor 与 level 之间的 status 行`——顺带补上 check.md **P-7**（此前 21 个测试文件无一读 `manifest.json`）：字段集合与顺序、6 项、`type ∈ {text,number,boolean,select,directory,status,progress}`、逐字段无 `description`、`favorExact.type='status'`、`favor.max=650`、三个 v1 键不得再声明。

**门槛原始输出（本轮逐条复跑）**

| 门槛 | 结果 |
| --- | --- |
| `npm test` | ✅ **286 tests / 286 pass / 0 fail**（324ms；基线 284 ⇒ +2） |
| `node -e` 读 manifest | ✅ 6 字段 / 全部无 description / 类型全合法（见回执） |
| `npm run build`（先清 `dist/`） | ✅ 26 modules、`index-Bsxlc5_3.css` 4.62 kB、`index-C6rUe7Zg.js` 91.61 kB（`app/` 未改动 ⇒ 产物哈希与上一轮一致） |
| `node <ROOT>/node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.json` | ✅ 0 error（exit 0） |
| `npm run pack` | ✅ `out/pet-2.0.0.oix`（**18 条目**，回读自检通过，**1,661,747 B**，SHA-256 `DF05BC9739D66D2361F3C07842AA7ACDABA611843FDFBAA5F080CFFDBE5F83C2`；基线 1,661,403 B ⇒ +344 B 压缩后） |
| `node scripts/validate-manifest.mjs extensions/pet/manifest.json`（仓库根，附加） | ✅ 0 error / 0 warning |
| `prettier --check`（4 个改动文件，附加） | ✅ 全部符合 |
| 提交状态 | ✅ 无 `git add` / 无 commit / 无 push |

**越界声明**：本轮**只**改任务卡列出的 5 个文件（`manifest.json` / `index.js` / `test/timers-v2.test.js` / `README.md` / 本文件），未碰 `lib/**`、`app/**`、其它 `test/**`、`scripts/**`、`package.json`、`specs/**`、`design.md`、宿主仓库。

**移交（不在本轮所有权内，未改）**：

- `test/settings.test.js:12` 的注释仍写"精确数字由 `pet.level` 行旁展示"（实为 `pet.favorExact`）——该文件不属本轮所有权，留给 ship 前的一次性清扫；
- check.md **P-3**（spec 的"4 个逻辑行 / 5 个字段"口径）与 `specs/pet-settings/spec.md:9-10` 的行集合表述需要按"5 个逻辑行 / 6 个字段"改口径——`specs/**` 明确禁改，需在 ship / 修正 spec 的一轮里处理（本次实现与 README 已按新口径落地）。

## 本次全部改动文件

（待回填）


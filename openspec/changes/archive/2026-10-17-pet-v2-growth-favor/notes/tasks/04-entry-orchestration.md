# 04 · entry-orchestration（定时器 / 视图 / 设置字段）

| 字段 | 内容 |
| --- | --- |
| **目标** | 入口按五个定时器编排（tick 60s、perf 60s、text 300s、bubble 4s、transient 一次性），视图输出 `growth/favor/levelName/anim.self/bubble`，**打盹与全部睡眠表现消失**，`manifest.json` 设置字段与版本号更新为 v2 |
| **输入** | `specs/pet-values/spec.md`（成长/好感的结算时机）、`specs/pet-interaction/spec.md`（气泡 4 秒与优先级、面板等级名）、`specs/pet-sprites/spec.md`（60 秒一轮、无打盹、播完回落）、`specs/pet-settings/spec.md`（4 行设置、只用既有字段类型、关即销毁）、`design.md` 的 D-2/D-3/D-6/D-10 |
| **文件所有权** | `index.js`、`manifest.json`、`lib/bridge.js`、`test/timers-v2.test.js`（新建） |
| **验收命令** | ① `npm test -- test/timers-v2.test.js` 全绿；② 断言定时器注册秒数（`pet-tick` 60、`pet-perf` 60、`pet-text` 300）与清理（销毁/cleanup 全清）；③ 断言**不存在** `SLEEP_AFTER_MS`、`sleep` 分支、`打盹` 文案（`git grep` 逐条列明）；④ 断言气泡优先级（互动替换定时文本；定时文本在占用时被丢弃）；⑤ `manifest.json`：`version = 2.0.0`、`contributes.settings.fields` 恰为 5 项（开关/成长值/好感/等级/诊断）、类型合法、无 `description`；⑥ `npm run pack` 回读 18 条目 |
| **依赖与阻塞** | 依赖卡 1/2/3；阻塞卡 5 |
| **并行组** | G3 |

## 要点

0. **两条来自卡 01 回执的硬约束（裁定 R57）**：
   - `pet-tick` 调 `onTick(state, now, { overlayExists })` 时**必须继续传 `overlayExists`**（真实值 = 浮层是否存活）。卡 01 的成长结算按它门控：只有 `overlayExists === true` 才累计成长，隐藏/销毁期间每 tick 把 `lastGrowthAt` 推到 now（**关窗不计成长**，spec 的专门 scenario）。传错 ⇒ 成长永远不涨，且不会有任何报错。
   - 迁移时**清理三个旧设置键** `pet.hunger` / `pet.clean` / `pet.mood`（宿主无删除 API ⇒ `api.settings.set(key, '')`），`manifest.json` 同时不再声明它们；`lib/constants.js` 里的 `KEY_HUNGER/KEY_CLEAN/KEY_MOOD` 常量也随之删除（该文件所有权在卡 01，**本条由你在自己的文件里接线，需要改常量文件时停下报回**）。

1. `pet-tick`（60s）：成长按整小时发放（`lastGrowthAt`）、挂机奖励（`lastAfkAt`，1200s 各 +1，上限 20）、必要时 `rev++`。
2. `pet-perf`（60s）：7 项随机抽一条演一轮，写 `transient` + `transientSelf = true`，排 `pet-transient`。
3. `pet-text`（300s）：`levelOf(favor)` → `pickFavorText`；气泡被占用则**丢弃**本次；否则写气泡并排 `pet-bubble`（4000ms）。
4. 互动路径：调卡 3 的 `interact`，成功/失败都按返回的 `anim/text` 更新视图；成功排队 `pet-transient`。
5. `lib/bridge.js`：`anim` 保留 `self` 与到期推送；新增 `values: { growth, favor, level, levelName }`；`bubble` 保留（4 秒由入口定时器控制清理并 `rev++`）。
6. **删**：`sleep` 相关（常量、`resolveStatus` 分支、`transient` 门控、Zzz 文案、视图 sleep 字段）。
7. `manifest.json`：`version: "2.0.0"`；设置字段 `pet.visible`(boolean) / `pet.growth`(status) / `pet.favor`(progress, max 650) / `pet.level`(status) / `pet.diagnostic`(status)，**均无 description**；删除 `pet.hunger/clean/mood`。

## 负向自检（不改实现）

- 定时文本触发时气泡正被互动占用 ⇒ 文本被丢弃、`rev` 不因它增加；
- 互动成功后 1 秒内再来一次互动 ⇒ 由卡 3 判 `cooling`，入口只更新气泡，不定时器泄漏；
- 销毁浮层 ⇒ 五个定时器全清（`rec.timers.size === 0`）、且 `lastGrowthAt` 被推进；
- `manifest.json` 里不得出现 `type: "password"` 等未支持类型（宿主会拒绝加载）。

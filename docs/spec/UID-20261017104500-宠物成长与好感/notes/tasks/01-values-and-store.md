# 01 · values-and-store（入口数据层）

| 字段 | 内容 |
| --- | --- |
| **目标** | 三属性体系彻底消失；成长值与好感值的模型、10 级阈值映射、v1 存档迁移与归一全部落地，`test/values.test.js` 全绿 |
| **输入** | `specs/pet-values/spec.md` 全部 4 条 requirement（尤其 R1 的"关窗不计成长"、R3 的阈值表、R4 的迁移）；`specs/pet-vitals/spec.md`（4 条 REMOVED，按它删代码）；`design.md` 的 D-1（字段表）、D-2（状态机里的 `transientSelf`）、D-5（阈值与取样）、D-7（迁移表） |
| **文件所有权** | `lib/constants.js`、`lib/growth.js`、`lib/persist.js`、`lib/settle.js`、`lib/mapping.js`、**删除** `lib/vitals.js`、`test/values.test.js`（新建）、**`lib/items.js`（仅第 8 行的 import：`./vitals.js` → 新的数值原语源；裁定 R57，不得改任何逻辑）** |
| **验收命令** | ① `npm test -- test/values.test.js` 全绿；② `node -e "import('./lib/settle.js')"` 等模块可加载（无顶层抛错）；③ `git grep -n "hunger\|clean\|mood" -- lib/` 的命中**只允许**出现在迁移注释里，且必须逐条列明；④ `lib/vitals.js` 已删除；⑤ `node <ROOT>\node_modules\vue-tsc\bin\vue-tsc.js --noEmit -p tsconfig.json` 0 error |
| **依赖与阻塞** | 无（G1 起点）。**阻塞卡 3/4**（它们需要本卡导出的常量与函数） |
| **并行组** | G1 |

## 要点（按 design 落）

1. **删**：`vitals.js` 整体、三属性常量（`DECAY_PER_SEC`、`INITIAL_VITALS`、`FEED_HUNGER`、`BATHE_CLEAN`、`PLAY_MOOD`、`PET_MOOD`、`GROWTH_BASE_PER_HOUR`/`GROWTH_PENALTY_*`）、`SLEEP_AFTER_MS`、`STATUS_*` 里 `hungry/dirty/sad/play` 与 `sleep` 条目。
2. **建**：`GROWTH_PER_INTERACT = 1`、`GROWTH_PER_HOUR = 1`、`GROWTH_BACKFILL_CAP_HOURS = 24`、`INTERACT_COOLDOWN_MS = 600_000`、`PET_COOLDOWN_MS = 3_600_000`、`FAVOR_PER_INTERACT = 1`、`FAVOR_PER_PET = 1`、`FAVOR_THRESHOLDS = [0,20,50,90,140,200,280,380,500,650]`、`FAVOR_LEVEL_NAMES = ['初次见面',…,'命定相伴']`、`BUBBLE_MS = 4000`、`TEXT_EVERY_SEC = 300`。
3. **成长结算**：进程内按"距 `lastGrowthAt` 的整小时数"发放（`pet-tick` 每 60 秒调用）；**销毁浮层窗口时把 `lastGrowthAt` 推到 now**（关窗不计成长）；重开补算上限 24 小时。
4. **存档**：`state = { growth, favor, fish, bubble, lastInteractAt, lastPetAt, lastGrowthAt, lastAfkAt, lastTextAt, diagnostic }`；`sanitizeState` 增加 favor/lastGrowthAt/lastTextAt 归一，**删除**三属性字段的读写；`serialize` 白名单同步。
5. **迁移**：读档时若存在 `hunger/clean/mood` ⇒ 丢弃并置 `favor = 0`（若无 favor）、`lastGrowthAt = now`（不补历史）、保留 growth/fish/bubble/各时间戳；清掉 `pet.hunger/clean/mood` 三个设置键（宿主无删除 API ⇒ 置空并由 `manifest` 不再声明）。
6. **映射**：`levelOf(favor)` 返回 `{ level: 1..10, name }`；`STATUS_TRACK`/`STATUS_PRIORITY` 保留 `idle/eating/bathing/petted/trot/run-left/run-right`，删除负面与 `play`；`resolveStatus` 不再有属性分支。

## 负向自检（不改实现）

- `levelOf(-1)` / `levelOf(NaN)` / `levelOf('abc')` ⇒ 第 1 级；
- `levelOf(649)` ⇒ 第 9 级、`levelOf(650)` ⇒ 第 10 级、`levelOf(99999)` ⇒ 第 10 级；
- 存档里 `favor: -5`、`lastGrowthAt: 'x'` ⇒ 归一为 0 / 视为已到期，且**不阻止启动**；
- 迁移后 `JSON.stringify(state)` 里**不存在** `hunger|clean|mood` 三个键；
- 关窗路径：`destroy` 后 `lastGrowthAt` 被推进（用 mock 时钟断言）。

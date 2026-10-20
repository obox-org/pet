# 07 · fix-favor-exact（S-1：满级后设置页看不到真实好感值）

| 字段 | 内容 |
| --- | --- |
| **背景** | 第 8 步验收（`notes/check.md` 的 S-1）发现：宿主 `progress` 字段会把 `cur` 钳到 `[0,max]`（`SettingsView.vue:685-687`），而好感**无上限**（Q9 裁定：满级后继续累加）⇒ 好感 >650 时设置页永远只显示 `650/650`，玩家看不到真实值。`design.md` 明确要求"另用 status 行展示精确好感值"，但实现里没有这一行。 |
| **目标** | 设置页在好感超过 650 后**仍能看到精确值**：新增一行只读 status 显示精确好感值；progress 行照旧（满格） |
| **输入** | `specs/pet-settings/spec.md:5`（好感行须"同时展示精确好感值与等级名"）与 `:12-15`（scenario「好感超过进度条上限」）；`design.md:13`；`notes/check.md` 的 S-1 |
| **文件所有权** | `manifest.json`（新增一个 status 字段）、`index.js`（`syncValueSettings` 写入精确值）、`test/timers-v2.test.js`（新增断言）、`README.md`（措辞）、`openspec/changes/pet-v2-growth-favor/notes/dev.md`（记录） |
| **验收命令** | ① `npm test` 全绿（基线 **284**，新增 ≥2 条）；② 断言 `favor = 651`（以及 650、99999）时：`pet.favor`（progress）= 真值（宿主显示 650/650）、**`pet.favorExact`（status）= `"651"`**；③ `manifest.json` 的设置字段 ≤ 6 项且全部无 `description`、类型均合法；④ `npm run build` 成功 + `vue-tsc` 0 error；⑤ `npm run pack` 回读通过（产物 `out/pet-2.0.0.oix`）；⑥ **不要 git add/commit/push** |
| **依赖与阻塞** | 无（卡 1–6 已完成）；阻塞 ship |
| **并行组** | 修复卡（单独一轮） |

## 要点
1. `manifest.json`：新增 `pet.favorExact`，`type: "status"`，label 建议「好感（精确值）」，无 description；放在 `pet.favor` 之后、`pet.level` 之前。
2. `index.js` 的 `syncValueSettings`：写 `pet.favorExact = String(state.favor)`（**不钳**）；其余不变。
3. 测试：在 `test/timers-v2.test.js` 增"满级后精确值可见"用例（650 / 651 / 99999 三个点），并断言 progress 行仍是真值（由宿主钳，扩展侧不钳）。
4. `README.md`：把"精确数字与等级名如实显示"改成准确表述——"进度条按 650 封顶、旁边一行显示精确好感值"，并在设置段列出 6 个字段（5 逻辑行 → 6 行）。
5. 记录到 `notes/dev.md`，注明这是 S-1 的修复轮。

## 负向自检
- `favor` 为 0 / 650 / 651 / 99999 时 `pet.favorExact` 分别写 `"0"`/`"650"`/`"651"`/`"99999"`；
- 写入失败不阻塞状态推进（沿用既有 `syncValueSettings` 的容错）；
- 字段总数增加后，宿主设置页仍能渲染（无 description、类型合法）。

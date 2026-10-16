# 04 · host-progress-field（宿主：设置页 progress 字段全链 + manifest 校验同步）

| 字段 | 内容 |
| --- | --- |
| **目标** | 让扩展设置页能声明**进度条字段**：`SettingsView.vue` 的字段链新增 `progress` 分支（只读渲染：条 + 右侧 `{cur}/{max}`，**不渲染任何可编辑控件**、**不显示 description**），并同步 manifest 校验脚本的字段类型白名单与其差分门禁测试。 |
| **输入** | `specs/pet-settings/spec.md` Requirement 2（三行进度条 + `{cur}/100` + MUST NOT 带描述）与「显示口径」段（`{cur}` = `Math.floor(cur)` 钳 `[0,100]`；**条宽用未取整真实比例**）、Requirement 3（`apiVersion` 门槛）；`design.md` D-7（等级/阈值常量，仅作为示例值）、UI 视觉规范硬约束第 3 条（标签列固定宽、左对齐）；锚点：`src/api/contributions.ts:97-127`（字段类型来源，卡 02 已加 `progress`）、`docs/extension-api/api-reference.md:299,310-318`（`status` 的只读语义与"写后当帧刷新"，`progress` 沿用同一语义）、`scripts/validate-manifest.mjs:39` 起（字段/类型校验）、`test/manifest-script-parity.test.ts`（AGENTS.md 要求的差分门禁）。 |
| **文件所有权** | `src/renderer/src/extensions/settings/SettingsView.vue`、`scripts/validate-manifest.mjs`、`test/manifest-script-parity.test.ts`、`test/settings-progress-field.test.ts`（新建）。**不含** `src/api/contributions.ts`（卡 02）、`docs/**`（卡 05）。 |
| **验收命令** | 宿主根：`npm run typecheck` + `npm run lint` + `npm test`；新测试须断言：① `progress` 字段渲染出条与 `{cur}/{max}` 文本，且**不渲染** input/select/button；② `description` 即使被声明也**不显示**（spec 的 MUST NOT）；③ `cur=99.9` 显示 `99/100` 而条宽 ≈ 99.9%（取整口径）；④ `cur` 越界（-5 / 180）被钳到 `[0,100]`；⑤ 扩展 `api.settings.set` 写值后设置页**当帧刷新**（不需重进页面）；⑥ `node scripts/validate-manifest.mjs` 对含 `progress` 字段的 manifest 判"通过"，对未知类型仍判 error；⑦ 差分门禁测试通过（校验脚本与宿主实现的类型白名单一致）。 |
| **依赖与阻塞** | 依赖 **02**（`progress` 进入类型面）。**阻塞** 05（文档）、09（扩展 manifest 要声明 `progress` 字段并通过校验）。 |
| **并行组** | 组 2 |

## 负向自检（不改实现）

- 喂非法字段声明断言被拒：`type:'progress'` 但 `max` 为 0/负数/字符串、值写入非数字（`'abc'`）、以及未知类型 `type:'gauge'` ⇒ 断言校验脚本报 error 或渲染层钳制/降级而不崩。

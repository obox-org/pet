# 05 · page-and-panel（页面消费 / 气泡 / 两图标 + 等级名）

| 字段 | 内容 |
| --- | --- |
| **目标** | 页面消费 v2 视图（无三属性、无 sleep）：气泡 4000ms、面板两枚图标 + 一行只读等级名（**不显示数字**）、悬停即时显名、白色焦点环、播完回落与 `anim.self` 锁存保持 |
| **输入** | `specs/pet-interaction/spec.md`（两枚图标、气泡 4 秒、面板等级名）、`specs/pet-values/spec.md`（视图只读字段）、`specs/pet-sprites/spec.md`（播完回落与 `anim.self`）、`design.md` 的 D-2（状态机）、D-8（面板）、`## UI 视觉规范`（token 表 + 七条硬约束） |
| **文件所有权** | `app/App.vue`、`app/lib/state.ts`、`app/lib/anim.ts`、`app/components/PetPanel.vue`、`app/style.css`、`test/view-v2.test.js`（新建） |
| **验收命令** | ① `npm test -- test/view-v2.test.js` 全绿；② 断言视图归一化（缺 `values`/缺 `levelName` 降级不白屏）；③ 断言 `BUBBLE_MS = 4000`；④ 面板源码断言：恰两枚 `.act`、**无数字渲染**、含 `levelName` 文案、`stroke:#fff` 与 `.tip` 仍在；⑤ 清 `dist/` 后 `npm run build` 成功，产物 grep 禁止项全 0（含 `hunger/clean/mood/sleep/打盹`）；⑥ `vue-tsc --noEmit` 0 error |
| **依赖与阻塞** | 依赖卡 4 的视图字段契约；阻塞卡 6 |
| **并行组** | G4 |

## 要点

1. `app/lib/state.ts`：`PetStateView` 增 `values: { growth, favor, level, levelName }`，删三属性与 `sleep`；`DEFAULT_STATE` 同步。
2. `app/lib/anim.ts`：删 `hungry/dirty/sad/sleep/play` 的状态映射与 1.5× 慢放；保留 `anim.self` 与 `entryTrackOf` 的折回逻辑。
3. `app/App.vue`：气泡 4 秒（常量来自共享）、面板等级名透传、删除睡眠相关分支。
4. `app/components/PetPanel.vue`：**两枚**图标（喂食/洗澡）+ 顶部一行 `.level`（`var(--font-size-sm)`、`var(--fg-dim)`、单行省略），不渲染任何数字；`aria-label` 逐字「喂食」「洗澡」；`:focus-visible` 白色 2px；`.tip` 即时显名。
5. `app/style.css`：只用宿主 token（`--bg-panel`/`--fg`/`--fg-dim`/`--fg-bright`/`--border`/`--hover-bg`/`--font-size`/`--font-size-sm`），白色仅用于图标描边与焦点环（v1 既有裁定）。

## 负向自检（不改实现）

- 视图缺 `values` ⇒ 页面不崩、等级名回退为空串；
- `levelName` 超长 ⇒ 单行省略不撑破面板；
- 产物里 `hunger|clean|mood|sleep|打盹` 命中 0；
- 两枚图标都 `aria-disabled` 时仍可 Tab 聚焦并显示提示（不设原生 `disabled`）。

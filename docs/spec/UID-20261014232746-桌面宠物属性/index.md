# 交付归档索引 · UID-20261014232746-桌面宠物属性

| 项 | 值 |
| --- | --- |
| UID | `UID-20261014232746-桌面宠物属性` |
| change-id | `pet-desktop-companion` |
| 扩展 | `pet`（displayName：宠物；author：chenzhi） |
| created | 2026-10-14 |
| 归档时间 | 2026-10-16 |
| 当前阶段 | **九步链已完成**（init → grill → proposal → design → validation → task → dev → check → ship） |
| 交付物 | **`v1.0.1`**：`out/pet-1.0.1.oix`（1,644,100 B，18 个条目；SHA-256 `3C732F0C8AFCFFCF6FE9F2BF5BFCECA4E6268F492ACAB6D9296BA201ABD1EBA5`）<br>首发 `v1.0.0`：`out/pet-1.0.0.oix`（1,637,311 B） |
| 依赖宿主 | `apiVersion >= 2` ⇒ **obox v1.0.16** 起 |
| 发布 | 扩展仓 `obox-org/pet`：release [v1.0.1](https://github.com/obox-org/pet/releases/tag/v1.0.1)（热修）/ [v1.0.0](https://github.com/obox-org/pet/releases/tag/v1.0.0) |
| 归档方式 | 工具归档为**手工移动**（`openspec` CLI 未安装）⇒ `openspec/changes/archive/2026-10-16-pet-desktop-companion/` |
| 发版后热修 | **v1.0.1**（`notes/hotfix-v1.0.1.md`）：随机表演播完不回落（D-1）+ 互动姿态挂到下一次推送（老毛病，R54）+ ✕ 焦点环统一（R53）；实机复验证据见 `notes/evidence/real-window-v2.md` 的「卡 18 后复验」节 |

**双向映射（三方一致）**：`.openspec.yaml` 的 `uid: UID-20261014232746-桌面宠物属性` ↔ 本目录名 ↔ `change-id: pet-desktop-companion`（归档目录名 `2026-10-16-pet-desktop-companion`）。

## 需求方向（用户原话要点，供后续 grill 逐条逼问）

1. **窗体**：安装扩展后，在主屏幕**右下角**显示一个**无边框透明窗体**，渲染参照仓库（`dsh-pet`）里的宠物形象；带**点击**与**鼠标悬停**交互。
2. **业务逻辑**与参照仓库一致，但三个互动改为 **喂食 / 洗澡 / 玩耍**，对应 **饥饿度 / 清洁度 / 心情** 三个隐藏属性（均以 100 为满分）：

| 规则 | 数值 |
| --- | --- |
| 饥饿度衰减 | 每分钟 -1 |
| 清洁度衰减 | 每小时 -10 |
| 心情衰减 | 每小时 -5 |
| 饥饿度每掉 10 点 | 心情 -1 |
| 清洁度每掉 10 点 | 心情 -1 |
| 恢复 10 点饥饿度或清洁度 | 心情 +1（最多加到 95） |
| 喂食 | 饥饿度 +5 |
| 洗澡 | 清洁度 +15 |
| 玩耍 | 心情 +5 |
| 挂机 | 每 20 分钟 +1 小鱼干、+1 沐浴泡泡 |
| 点击 | 每 5 分钟点击宠物一次 +1 心情 |
| 成长 | 基础每小时 +2 成长值；心情每降低 5 点，每小时成长值 -0.1 |

3. **设置页**（设置 → 扩展 → 宠物）：一个**显示 toggle**（开=显示宠物窗口，关=关闭宠物窗口）；另**三行**分别显示饥饿度 / 清洁度 / 心情，**带进度条**，右侧显示 `{cur}/100`，每属性一行，**不写描述**。

## 已查明的宿主能力缺口（init 阶段查实，留给 grill/proposal 定方案）

| 要求 | 宿主现状 | 结论 |
| --- | --- | --- |
| 无边框透明窗体 | `src/main/appWindow.ts:64-80` 已 `frame: false`，但**没有** `transparent` / `alwaysOnTop` / `skipTaskbar` / 初始坐标 | 需宿主加窗口能力 |
| 扩展自行开/关窗口 | `src/api/types.ts` 中 `apps|openApp|closeApp|appWindow` 零命中；开窗只有宿主的 `window.api.openAppWindow`（`src/preload/index.ts:25` → `app:open-window`），由内置 App 视图在用户点卡片时调用 | 需宿主给扩展一个"显示/隐藏自己的窗口"的能力 |
| 设置页进度条 | `SettingsPage = { id, title, fields: SettingField[] }`（`src/api/contributions.ts:130-137`），字段类型仅 `text/number/boolean/select/directory/status`（`status` 可带 `modal`），**扩展不能自定义渲染** | 需新增进度条字段类型（如 `progress` + `max`） |

## 检查结论摘要（由 `obox-ext-check` 追加）

来源：`notes/check.md`（第 8 步只读验收，**未改任何代码/测试/规格**）。

| 档 | 条数 | 关键条目 |
| --- | --- | --- |
| **严重** | **0** | — |
| **普通** | 3 | **O-1** Tab 经「✕→精灵」时 iframe `blur/focus` 触发 `onWindowBlur` ⇒ 面板闪关一次（净 Tab 顺序不变、不丢站；**无法判定是否卡 17 引入**）⇒ 登记为已知小瑕疵；**N13** 10 秒随机表演的实机观感（含"原地侧向跑"是否别扭）⇒ 9.2 复验给出保留/删除建议；**R10** 宿主 `test/settings-network-layout.test.ts` 4 条 prettier warning（**非本次改动**，修它会给 PR 添无关 diff） |
| **一般建议** | 3 | **A-1** 宿主 `core/host.ts:779-780` 两条 JSDoc 错位（`git show HEAD` 证明既有）；**A-2** 上游文案改动不自动跟随（文案表单点 + 逐字测试钉住）；**A-3** `run-left/right` 的"原地侧向跑"是**可逆**决策（观感不佳即从随机集删两项） |

**门槛复跑（父代理亲手，非回执转述）**：宿主 `typecheck` 0 / `lint` 0 error（4 条既有 warning）/ `test` **793 passed + 5 skipped**；扩展 `test` **170 passed**；扩展 `build` 成功且产物 **js+css 双 grep** 禁止项全 0；`npm run pack` 18 条目回读自检通过；`vue-tsc` 0 error。

**规格规模**：7 份 spec delta 共 **24 requirement / 51 scenario**（经六轮校验；Q15=B 收缩掉隐藏/召唤、Q16 替换掉小跑定时器）；官方 `openspec validate --strict` 因 **CLI 未安装**未运行（已在各产物逐次注明，以脚本计数 + 结构自检替代）。

## 归档产物清单（34 个文件）

- `proposal.md` / `design.md` / `tasks.md`
- `specs/pet-{window,vitals,economy,growth,interaction,settings,sprites}/spec.md`
- `notes/{grill,validation,dev,check}.md` + `notes/ship.md`（ship 步写出后补入）
- `notes/tasks/01–11,14–18-*.md`（含跨卡修正与增补轮任务卡）
- `notes/evidence/{overlay-feasibility,real-window,real-window-v2}.md`（卡 01 探测 + 卡 11/16 实机 + 8.2/9.2 复验）

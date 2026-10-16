# ship — 桌面宠物扩展 `pet`（第 9 步 · 交付与发版）

change-id：`pet-desktop-companion`｜UID：`UID-20261014232746-桌面宠物属性`｜归档日期：2026-10-16

## 1. 文档同步（逐行结论，含"无需更新"的理由）

| 改动性质 | 按规程要更新 | 结论 |
| --- | --- | --- |
| 目录结构 / 常用命令 | 宿主 `README.md` | **无需更新**：本次没有新增/移动/删除顶层或 `src/` 关键目录，也没有改动 `package.json` 的 scripts（`typecheck`/`lint`/`test`/`build`/`security:audit` 均沿用）。扩展侧新增一个源文件 `app/lib/panel.ts`，已由扩展自己 README 的"目录结构"表覆盖（卡 17） |
| 架构变化（IPC 能力） | 宿主 `README.md` | **已更新**（卡 05）：架构树的 `main/appWindow.ts` 补 overlay 窗体（`api.overlay` 四方法的 IPC 与窗体实现），`renderer/src/AppWindow.vue` 改为"App 子窗口 / overlay 窗体的共用外壳（`=app` / `=overlay`）" |
| 术语 | 宿主 `CONTEXT.md` | **已更新**（本次）：新增 **「Overlay Window / overlay 窗体」** 词条（与 App 子窗口的区别、查询串、不渲染 TitleBar/PromptHost、默认穿透、生命周期归属、`_Avoid_` 列出易混词） |
| 宿主 / 主进程 / 扩展系统 | 仓库 `docs/adr/`（续编号） | **已新增**：`docs/adr/0024-extension-overlay-window-capability.md`（背景 5 条 + 四个被否决备选与否决理由 + 决策 7 条 + 后果/代价/风险与退路） |
| 扩展自身 | 扩展工程 `docs/adr/` | **无需更新**：扩展工程未建 `docs/adr/` 目录（既有两个扩展 `rdp`/`webapp` 同样没有）；扩展侧全部决策已落在本 change 的 `design.md`（D-1…D-16，含被否决备选与否决理由）与交付归档，符合"决策要有单一落点"的意图 |
| 改过宿主 API / 贡献点 schema / IPC | `docs/extension-api/` 对应文档（AGENTS.md 强制同步义务） | **已更新**（卡 05 + 卡 13 + 卡 14 + 本次）：`api-reference.md`（新增 `### overlay` 小节四方法签名/参数契约/作用域/生命周期/定位/消息桥与五参数/透明五处绘制点/平台限制 + `setPosition` 契约表 + `OverlayResult.position`）、`manifest-reference.md`（`apiVersion` 当前值 1→2 与递增理由 + 新增 settings 校验规则节 + error 表）、`themes-settings.md`（字段类型列表补 `progress` + 新增 progress 字段小节 + overlay 主题不触达说明）、`troubleshooting.md`（新增 4 条：透明排查/整窗穿透取舍/overlay 无 alert/overlay 收不到消息）、`guides-user.md` + `guides-builtin.md`（锚点按当前代码重校 + **更正"调试扩展不写 userData"** 并补"调试扩展生命周期只由 CLI 控制"） |
| 改过 `scripts/validate-manifest.mjs` 校验规则 | 同步 `test/manifest-script-parity.test.ts` 差分门禁 | **已更新**（卡 04）：头注释记录"脚本独有静态收紧"及理由，新增 1 条 it 断言两侧白名单**逐字同序**相等（含 `progress`） |
| 扩展用户向文档 | 扩展 `README.md` | **已更新**（卡 10/15/17/18 累计）：三处可见面、玩法与数值表、文案口径（上游逐字五句 + 禁数字两条）、悬停面板（三图标一行/透明底白线/悬浮显名/Tab 序）、拖动钳位分工、10 秒随机表演、五条平台限制、素材出处与许可证分层口径、最低宿主版本（`apiVersion ≥ 2`）、打包清单与回读自检 |
| skills 是否受影响 | `skills/obox-ext-*` | **无需更新**（卡 05 已 grep 判定并留证）：九个 skill 对 API/字段类型/apiVersion 一律只写**文档路径与章节名**，`apiVersion`/`SettingFieldType`/`字段类型`/`overlay`/`透明`/`progress`/`窗体`/`api.overlay` 在 skills 全目录 **0 命中**；skills 里的"门槛"全部指质量门槛（typecheck/lint/test/build/manifest 校验），与 `apiVersion` 门槛无关 |

## 2. 发版一问（选项与用户答复，原文留档）

- **问**：`Q18（发版确认）：扩展仓怎么处理？`（宿主仓 PR 按 AGENTS.md 由 AI 在 CI 通过后自行 squash 合并，不占这一问）
- **选项**：
  1. **A：建仓并完整发版（推荐）** —— 建 `obox-org/pet`（public，与 rdp/webapp 同惯例）⇒ 首次提交 ⇒ tag `v1.0.0` ⇒ push（含 tag）⇒ 建 release 并上传 `out/pet-1.0.0.oix`；优点：与既有扩展一致、可直接安装；缺点：在组织下新建公开仓库、发布 tag 即定版。
  2. **B：只本地提交 + tag，不建远端** —— 零外部副作用，但别人拿不到 `.oix`。
  3. **C：只合宿主仓，扩展仓暂不提交** —— 扩展代码留待用户自己掌掐时机。
- **用户答复**：**A：建仓并完整发版（推荐）**。
- **执行结果**：已按 A 执行（见 §3）。

## 3. 收尾自检（原始输出 / 可访问链接）

| 检查 | 结果 |
| --- | --- |
| 宿主 `git status` | **clean**（提交后 0 行；提交 `2156bcd`，26 文件 +4439/−255） |
| 宿主质量门槛（合并前复跑） | `typecheck` **0 error**；`lint` **0 error**（4 条既有 prettier warning 在 `test/settings-network-layout.test.ts`，本次未触碰）；`test` **793 passed + 5 skipped** |
| 扩展质量门槛 | `npm test` **170 passed / 0 fail**；`npm run build` 成功且产物 **js+css 双 grep** 禁止项全 0；`vue-tsc --noEmit` **0 error**；`npm run pack` **18 条目**回读自检通过（`out/pet-1.0.0.oix`，1,637,311 B） |
| 宿主 PR | **#130** `feat: 新增扩展 overlay 窗体能力与 progress 设置字段，apiVersion 升至 2`（head `feat/extension-overlay-window` → base `master`）；CI `check` = **completed/success**、`mergeable_state=clean` ⇒ **已 squash 合并**：merge sha **`a06bf98`**（提交标题 `…(#130)`），源分支 `feat/extension-overlay-window` **已删除**；本地 master 已 `pull --ff-only` 同步、工作区 clean |
| `npm run security:audit`（**合并后**复跑，AGENTS.md 强制） | **found 0 vulnerabilities**（exit 0） |
| Dependabot 开放告警（**合并后**复查） | **0 条**（`GET /repos/obox-org/obox/dependabot/alerts?state=open`） |
| 宿主门槛（**合并后**复跑，`src/**` 有改动 ⇒ 必须） | `typecheck` **0 error**；`lint` **0 error**（4 条既有 warning）；`test` **793 passed + 5 skipped**（exit 0） |
| 扩展仓自检 | `dependencies = {}`（**运行时零依赖**）；devDependencies = `@vitejs/plugin-vue ^6.0.2` / `vite ^7.2.6` / `vue ^3.5.25`（仅构建期） |
| 扩展仓远端 | `obox-org/pet`（public，本次新建；与 `obox-org/rdp`、`obox-org/webapp` 同惯例） |
| 扩展 tag / release | `v1.0.0`（与 `manifest.json` 的 `version: 1.0.0` 一致）+ release 附 `pet-1.0.0.oix` |
| 归档 | 交付归档 `extensions/pet/docs/spec/UID-20261014232746-桌面宠物属性/`（34 文件）；工具归档 `openspec/changes/archive/2026-10-16-pet-desktop-companion/`（34 文件，手工移动——`openspec` CLI 未安装） |
| 未决项移交 | **O-1**（Tab 经 ✕→精灵时面板闪关一次，无法判定是否卡 17 引入）、**R10**（宿主既有 4 条 prettier warning）、**A-1**（宿主 `core/host.ts:779-780` JSDoc 错位）⇒ 均为"登记不阻塞"；**`run-left/right` 的原地侧向跑**为可逆决策（观感不佳即从随机集删两项）；**N13/N14**（10 秒随机表演观感、图标白线可读性）由 9.2 实机复验补证 |

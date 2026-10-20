# ship — pet-v2-growth-favor（v2.0.0）

## 一、文档同步（逐行结论）

| 改动性质 | 结论 | 落盘位置 |
| --- | --- | --- |
| 目录结构 / 常用命令 / 架构 / 技术栈 / 文档导航 | **已更新**：`README.md` 全面改写为 v2（版本 2.0.0、玩法表、数值与 10 级阈值表、128 条文本段、设置 6 字段 / 5 逻辑行、无打盹、历史沿革 v1→v2 表格、测试条数 286、目录表） | `extensions/pet/README.md` |
| 术语 | **无需更新**：扩展仓没有 `CONTEXT.md`（术语集中在宿主仓 `CONTEXT.md`）；本次没有引入需要新术语的概念（"成长值/好感值"是普通名词） | — |
| 宿主 / 主进程 / 扩展系统 | **无需更新**：本次**未改宿主任何代码或文档**（`git -C <ROOT> status` 未含本次改动） | — |
| 扩展自身（`docs/adr/`） | **无需更新（无该目录）**：扩展仓自 v1 起就没有 `docs/adr/`；本 change 的决策全部记在交付归档的 `design.md`（D-1..D-10）与 `grill.md`（16 问结论）里，新增 ADR 目录属另一条线（Extension Host）的事 | — |
| 宿主 API / 贡献点 schema / IPC | **无需更新**：未改 `src/api/**`、`src/main/**`、manifest 校验规则；扩展只用到既有 `api.settings` / `api.timer` / `api.overlay` / `api.fs` / `api.app.onMessage`，签名未变 | — |

## 二、发版一问（单独提问，未混入收尾门禁）

- **问题**：pet v2 的 dev/check 已全部通过，是否现在发版（tag v2.0.0 + release + 上传 `.oix`）？
- **选项**：A 发 v2.0.0（推荐）｜B 只提交不发版｜C 先本地试装，暂不发
- **用户答复**：**A = 发 v2.0.0**

## 三、提交与发版

| 项 | 值 |
| --- | --- |
| 仓库 | `obox-org/pet`（扩展仓，master 直推 + tag） |
| 提交 | **`628aa77`** `feat!: pet v2.0.0（三属性 → 成长值 + 好感值，10 级文本体系）`（88 文件，+9,529 / −2,078） |
| tag | **`v2.0.0`**（已 push；仓内现有 v1.0.0 / v1.0.1 / v1.0.2 / v2.0.0） |
| release | **https://github.com/obox-org/pet/releases/tag/v2.0.0**，资产 `pet-2.0.0.oix`（**1,661,747 B**，state=uploaded） |

## 四、收尾自检

| 项 | 结果 |
| --- | --- |
| `npm test` | ✅ **286 / 286 pass / 0 fail** |
| `npm run build`（清 `dist/`） | ✅ 成功（26 modules，`index-Bsxlc5_3.css` 4.62 kB / `index-C6rUe7Zg.js` 91.61 kB） |
| `vue-tsc --noEmit` | ✅ 0 error（零输出） |
| `npm run pack` | ✅ `out/pet-2.0.0.oix`（18 条目，1,661,747 B，回读自检通过） |
| `node scripts/validate-manifest.mjs` | ✅ 0 error / 0 warning |
| 依赖安全 | ✅ 扩展仓**运行期零依赖**（`package.json` 无 `dependencies`，devDeps 仅 vite/vue-tsc/prettier 等）⇒ 无可审计对象；**本次未改宿主**，宿主仓的 `security:audit` 与 Dependabot 属另一条线 |
| `git status` | ✅ **clean**（提交后 0 行）；HEAD `628aa77`；提交数 8 |

## 五、九步链收尾

| 步 | 产物 |
| --- | --- |
| 1 init / 2 grill | `notes/grill.md`（13 问 + Q14–Q16 下钻，12 维度全关闭） |
| 3 proposal | `proposal.md` + `specs/**`（7 capability、**23 新增 + 4 REMOVED**、**56 scenario**） |
| 4 design | `design.md`（七节、D-1..D-10、UI 七条硬约束） |
| 5 validation | `notes/validation.md`（1 严重 → 已裁定；7 普通；4 建议；证据不足已接受） |
| 6 task | `tasks.md` + `notes/tasks/01..07`（6 实现卡 + 1 修复卡，所有权两两不相交） |
| 7 dev | `notes/dev.md`（7 张卡回执 + 四项门槛原始输出，含 R57/R58 两处所有权裁定） |
| 8 check | `notes/check.md`（第 1 轮 1 严重 / 12 普通 / 8 建议；**第 2 轮 S-1 关闭 → 严重 0**） |
| 9 ship | 本文件 + `docs/spec/UID-20261017104500-宠物成长与好感/` + tag `v2.0.0` + release |

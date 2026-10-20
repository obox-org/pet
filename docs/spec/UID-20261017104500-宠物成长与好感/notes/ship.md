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
| 提交 | 待填（`git log -1` 的 sha 与标题） |
| tag | `v2.0.0` |
| release | 待填（release URL + 资产名与大小） |

## 四、收尾自检

| 项 | 结果 |
| --- | --- |
| `npm test` | 286 / 286 pass / 0 fail |
| `npm run build`（清 `dist/`） | 成功（26 modules） |
| `vue-tsc --noEmit` | 0 error |
| `npm run pack` | `out/pet-2.0.0.oix`（18 条目，1,661,747 B，回读自检通过） |
| `node scripts/validate-manifest.mjs` | 0 error / 0 warning |
| 依赖安全 | 扩展仓**运行期零依赖**、`package.json` 无 dependencies ⇒ `npm audit` 无对象；宿主仓的 `security:audit` 与 Dependabot 属另一条线（本 change 未改宿主） |
| `git status` | 待填（提交后应 clean） |

# 10 · ext-pack-readme（扩展：打包清单核实 + README + 工程元数据）

| 字段 | 内容 |
| --- | --- |
| **目标** | 确保 `.oix` 打得对、装得上：核实/调整 `scripts/pack.mjs` 的打包清单（`assets/**` 与 `dist/**` 都进包，`data/` 被拒），产出一次真实打包并回读校验；写 `README.md`（用法、设置页说明、**素材出处与许可证**、最低宿主版本、无主题的理由、已知平台限制）；同步扩展 `package.json`（版本、脚本、`files` 如需）。 |
| **输入** | `specs/pet-sprites/spec.md` Requirement 4（打包物含 `assets/whale/LICENSE` 与 `pet.json`，README 有出处与许可证说明）、`specs/pet-settings/spec.md` Requirement 3（最低宿主版本声明）；`design.md` D-10（素材出处与许可证处置、`.oix` 约 +1.5 MB、"打包清单需含 `assets/**`"）、D-11（平台限制五条，写进 README 的已知问题）、D-6/D-12（无主题、后台扩展的对外可见面）；`notes/validation.md` 第三轮（官方文档复核结论）；已核实事实：脚手架 `scripts/pack.mjs:34` 的 `DIRS = ['dist','assets']` **已含 assets**（`validation.md` API 核对表最后一行）。 |
| **文件所有权** | `extensions/pet/scripts/pack.mjs`、`extensions/pet/README.md`、`extensions/pet/package.json`、`extensions/pet/.gitignore`（如需补 `dist/`、`out/`）。**不含** `manifest.json`（卡 09）、`app/**`（卡 08）、`lib/**`/`index.js`（卡 07）、`assets/**`（卡 06）。 |
| **验收命令** | 在 `extensions/pet`：① `npm run build` 成功（依赖卡 08 产物）；② `npm run pack` 生成 `out/pet-<version>.oix`，并**回读校验**：包内条目含 `manifest.json`、`index.js`、`lib/**`、`dist/**`、`assets/whale/{spritesheet.webp,pet.json,LICENSE,PROVENANCE.md}`，且**不含** `data/`、`node_modules/`、`out/`、`openspec/`、`docs/`；③ 包大小 ≈ 1.5–2 MB（记录实际值）；④ README grep 断言：含"素材出处"、`BSD-3-Clause`、`zhu1090093659`、"未获背书"、最低宿主版本、五条平台限制；⑤ `git status` 无未忽略的构建产物（`dist/`、`out/` 已在 `.gitignore`）。 |
| **依赖与阻塞** | 依赖 **06、07、08、09**（打包需要它们的产物）。**阻塞** 11（实机安装用的是本卡产出的 `.oix`）。 |
| **并行组** | 组 4 |

## 负向自检（不改实现）

- 断言打包脚本的**拒绝逻辑**仍然有效：把 `data/` 目录塞进待打包清单（`%TEMP%` 下的副本工程，不动仓库），断言 `pack.mjs` 报错或剔除该目录（脚手架 `:66-74` 的 forbidden 兜底）。仓库内工程不被改动。

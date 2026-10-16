# 06 · ext-assets（扩展：内置鲸鱼娘图集 + 上游许可证）

| 字段 | 内容 |
| --- | --- |
| **目标** | 把上游 dsh-pet 的鲸鱼娘素材落到 `extensions/pet/assets/whale/`：`spritesheet.webp`（1,544,154 B）、`pet.json`（838 B，含 `frames`/`tracks`）、以及**上游 `LICENSE` 原文**（BSD-3-Clause），并校验三者字节级正确（大小 + SHA256）。 |
| **输入** | `specs/pet-sprites/spec.md` Requirement 1（几何与 `frames`/`tracks` 的实测值）与 Requirement 4（**随附上游许可证与出处声明**，含"替换为自制图集后须删除"的 scenario）；`design.md` D-10（素材出处与许可证处置：按较严的 BSD-3 履行）、Context「素材来源」条（上游路径与实测大小）；`notes/grill.md`「Q3 修订」（用户裁定"宠物先用 dsh-pets 里的"）。上游路径：`https://raw.githubusercontent.com/DamonKoy/dsh-web-ui/main/packages/dsh-pet/assets/whale/{spritesheet.webp,pet.json}` 与同目录 `LICENSE`（本会话已实测直连与 `http://127.0.0.1:7897` 代理两条通路均可用）。 |
| **文件所有权** | `extensions/pet/assets/whale/spritesheet.webp`、`extensions/pet/assets/whale/pet.json`、`extensions/pet/assets/whale/LICENSE`、`extensions/pet/assets/whale/PROVENANCE.md`（出处记录：上游仓库/路径/版本/许可证/未取得背书声明）。**不含** `extensions/pet/README.md`（卡 10 负责把出处摘要写进 README）。 |
| **验收命令** | 在 `extensions/pet`：① `Get-FileHash assets/whale/spritesheet.webp -Algorithm SHA256` 与下载源一致、`(Get-Item ...).Length -eq 1544154`；② `node -e "JSON.parse(require('fs').readFileSync('assets/whale/pet.json','utf8'))"` 解析成功且 `frames` 逐字等于 `[6,8,8,4,5,8,6,6,6]`、`tracks` 含 9 条轨；③ `assets/whale/LICENSE` 首行含 `BSD 3-Clause License` 且版权行为 `Copyright (c) 2026, zhu1090093659`；④ 四个文件都在 `git status` 里可见（`assets/` 未被 `.gitignore` 排除）。 |
| **依赖与阻塞** | 无（不依赖宿主改动）。**阻塞** 08（UI 要加载图集）、10（README 出处段）、11（实机看边缘，对应 N8）。 |
| **并行组** | 组 1 |

## 负向自检（不改实现）

- 断言"图集与 manifest 自洽"：用 `pet.json` 的 `frames`/`cell`(默认 192×208)/`columns`(默认 8) 反算整图尺寸应为 **1536×1872**，并与 webp 的实际像素尺寸比对（可用 Node 读 webp 头部 VP8X/VP8L 的宽高字段，零依赖）。不一致即判素材损坏。

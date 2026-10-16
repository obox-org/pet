# 鲸鱼娘素材出处记录（PROVENANCE）

本文件记录 `assets/whale/` 下**第三方素材**的来源、取得方式、字节级校验值、许可证分层与义务履行方式。
除本文件外，同目录三个文件均为**上游原文，字节未作任何修改**。
替换素材时必须按 §10 处理（删除本文件与同目录 `LICENSE`）。

---

## 1. 素材内容

| 文件 | 性质 | 说明 |
| --- | --- | --- |
| `spritesheet.webp` | 上游原文 | 鲸鱼娘精灵图集：8 列 × 9 行、每格 192×208、整图 **1536×1872**；WebP 容器内单 `VP8L`（无损）chunk，**带 alpha 透明通道**（窗体透明所需） |
| `pet.json` | 上游原文 | 图集清单（**快照版**格式，无 `petManifestVersion`/`license` 字段）：`id`/`displayName`/`description`/`spritesheetPath`/`frames`/`tracks` |
| `LICENSE` | 上游原文 | 上游**包级**许可证原文：**BSD 3-Clause License**，版权行 `Copyright (c) 2026, zhu1090093659` |
| `PROVENANCE.md` | 本项目自制 | 本文件 |

---

## 2. 上游仓库与路径

- **直接来源（快照 monorepo）**：`DamonKoy/dsh-web-ui`（分支 `main`）
  - `packages/dsh-pet/assets/whale/spritesheet.webp`
  - `packages/dsh-pet/assets/whale/pet.json`
  - `packages/dsh-pet/LICENSE`（包级许可证；**注意不是**仓库根的 `LICENSE`，见 §7）
  - 实际下载用的 raw URL：
    - `https://raw.githubusercontent.com/DamonKoy/dsh-web-ui/main/packages/dsh-pet/assets/whale/spritesheet.webp`
    - `https://raw.githubusercontent.com/DamonKoy/dsh-web-ui/main/packages/dsh-pet/assets/whale/pet.json`
    - `https://raw.githubusercontent.com/DamonKoy/dsh-web-ui/main/packages/dsh-pet/LICENSE`
- **上游主线仓库**：`zhu1090093659/dsh-pet`（分支 `main`，素材路径 `assets/whale/`），对应 npm 包 **`@linxin666/dsh-pet`**（`repository.url = git+https://github.com/zhu1090093659/dsh-pet.git`）。
- **两者关系**：`DamonKoy/dsh-web-ui` 是主线 `dsh-pet` 的一个 **monorepo 快照**（把 `dsh-pet` 收进 `packages/dsh-pet/`），并非独立的上游项目；素材本体在两处**字节相同**（见 §5.3）。

---

## 3. 版本锚点（取得时的上游状态，2026-10-15 查询）

| 对象 | 值 |
| --- | --- |
| 快照仓库 `DamonKoy/dsh-web-ui` HEAD（下载基准 `ref=main`） | `3647a33fa467e0335260468614f6eed04b196c38`，commit 日期 `2026-08-15T15:36:39Z` |
| 快照仓库中 `packages/dsh-pet/assets/whale/` 最后一次变更 commit | `f1f3747c989397db2d9193cba8271441b37f0acf`，`2026-08-15T10:04:56Z`，"feat(pet): registry-driven multi-pet support with per-pet naming" |
| 快照仓库中 `packages/dsh-pet/LICENSE` 最后一次变更 commit | `58188e9e322ea27e0f3f299cc56cc211ccd491be`，`2026-08-12T10:45:28Z`，"docs: 版权署名统一为 zhu1090093659，新增 NPM 发布限制规则" |
| 快照中的包版本（`packages/dsh-pet/package.json`） | `@linxin666/dsh-pet` **0.1.16** |
| 主线仓库 `zhu1090093659/dsh-pet` HEAD | `550bce840287f6a6fd33dd1c205277d02957e500`，commit 日期 `2026-10-15T11:59:37Z` |
| npm `@linxin666/dsh-pet` latest（查询时） | **0.4.6** |

---

## 4. 取得方式与日期

- **日期**：2026-10-15（本地 UTC+8；文件落地时刻 23:32:30 / 23:33:54 / 23:35:18，对应 UTC 15:32:30 / 15:33:54 / 15:35:18）。
- **工具**：Windows PowerShell 5.1 `Invoke-WebRequest -Uri <raw> -OutFile <本地路径> -UseBasicParsing`（二进制**直写文件**，不经字符串转换，避免破坏字节）。
- **网络通路**：直连 `raw.githubusercontent.com` 三个 URL **全部失败**（`基础连接已经关闭: 接收时发生错误` / `无法连接到远程服务器`），改走本机代理 `-Proxy 'http://127.0.0.1:7897'` **三个文件全部下载成功**。
- **改动**：无。未重压缩、未裁剪、未转换换行、未加 BOM；本地字节与上游 blob 完全一致（§5）。

---

## 5. 字节级校验

### 5.1 本地实测值（下载后在本机计算）

| 文件 | 大小（B） | SHA256 | git blob SHA1（本地算） |
| --- | --- | --- | --- |
| `spritesheet.webp` | 1544154 | `6c2c26ebaf920d69403da90c7fe844ce64cd2984f5bf7f3bd677b07e5a3914df` | `5ffb1ac7650a78f9691f66928333fa9dd8dcc1ad` |
| `pet.json` | 838 | `d4a75257f7d2ce730e37a707b8d1fdda20d9752971aba9b06f621be988831dbe` | `ce7c1d9da8c6d5e9b14ff5a0538664a14853cc8e` |
| `LICENSE` | 1521 | `02e1e3ebf73df5c1840c842a8e93b40942bf6e53a66acbe6c5643fc8664ff97d` | `fd674136195478eac50ab24cb5a8ff105886abf3` |
| `PROVENANCE.md` | 见 §5.4 说明 | 见 §5.4 说明 | —（本项目自制文件，上游无对应 blob） |

### 5.2 上游旁证值（GitHub contents API，`ref=main`，2026-10-15 查询）

| API 路径 | `size` | `sha`（git blob SHA1） |
| --- | --- | --- |
| `DamonKoy/dsh-web-ui` : `packages/dsh-pet/assets/whale/spritesheet.webp` | 1544154 | `5ffb1ac7650a78f9691f66928333fa9dd8dcc1ad` |
| `DamonKoy/dsh-web-ui` : `packages/dsh-pet/assets/whale/pet.json` | 838 | `ce7c1d9da8c6d5e9b14ff5a0538664a14853cc8e` |
| `DamonKoy/dsh-web-ui` : `packages/dsh-pet/LICENSE` | 1521 | `fd674136195478eac50ab24cb5a8ff105886abf3` |

### 5.3 一致性结论

- 三个文件 **API `size` == 本地大小**，且 **API `sha` == 本地按 `sha1("blob <len>\0" + 内容)` 计算的 git blob SHA1**，逐字相同 ⇒ **字节级一致**。
  该比对为**零依赖强校验**：只用 Node 内置 `crypto`（无第三方库、无 `git` 命令），git blob SHA1 的构造规则与 GitHub API 返回值同源，因此等价于"本地文件与上游对象库里的那个 blob 是同一个对象"。
- **主线交叉验证**：`zhu1090093659/dsh-pet` 的 `assets/whale/spritesheet.webp` blob SHA1 同为 `5ffb1ac7650a78f9691f66928333fa9dd8dcc1ad`、size 同为 1544154 ⇒ **图集本体在快照与主线之间一字未变**。

### 5.4 关于 `PROVENANCE.md` 自身的哈希

本文件是**自指**的：把自己的 SHA256 写进自己会改变自己的内容，从而改变那个 SHA256，逻辑上不可能自洽。
因此本文件内只固定记录**三个上游文件**的大小与 SHA256（§5.1），本文件自身的大小与 SHA256 由落地当次的开发回执与扩展仓库的提交记录承载（提交后 `git log`/`git cat-file` 可复核）。三个上游文件的哈希**不受本文件内容变化影响**，可长期作为完整性基准。

---

## 6. 图集几何自洽（落地时的负向自检结果）

零依赖读 WebP 头（Node 直接解字节）：

- 文件头 64 字节（hex）：`52494646 d28f1700 57454250 5650384c c68f1700 2fffc5d3 118d408c …`
  - `52 49 46 46` = `RIFF`；随后 uint32LE `1544146` = 文件长 1544154 − 8 ✔；`57 45 42 50` = `WEBP` ✔
- chunk 列表：**只有一个** chunk，fourcc = `VP8L`（无损），size = `1544134`
  - `VP8L` 载荷首字节签名 = `0x2F` ✔（VP8L 规定值）
  - 随后 4 字节 `ff c5 d3 11` → uint32LE = `299091455` → **14-bit** `width-1 = 1535`、`height-1 = 1871`、alpha 位（bit28）= 1
  - ⇒ 实际像素尺寸 **1536 × 1872**，**带 alpha**
- 由 `pet.json` 反算：`columns` 缺省 = **8**、`cell` 缺省 = **192×208**、行数 = `frames.length` = **9** ⇒ 8×192 = **1536**、9×208 = **1872** ✔ 与实际尺寸一致
- 每行帧数均 ≤ 列数 8 ✔（`[6, 8, 8, 4, 5, 8, 6, 6, 6]`）
- 透明背景 ✔（`VP8L` alpha 位为 1；满足"窗体透明、不得出现白底方块"的要求）

> 注：`VP8X`（24-bit 画布尺寸）与 `VP8 `（有损，帧头 `9d 01 2a` 后的 14-bit 宽高）两条分支在校验脚本里同样实现并覆盖，本图集走的是 `VP8L` 分支。

---

## 7. 许可证：上游是**分层声明**，本项目履行素材自身声明的 BSD-3-Clause

上游并非"一处写错"，而是**不同层级各有一份声明**：

| 层级 | 许可证 | 证据 |
| --- | --- | --- |
| 上游**仓库根** `LICENSE` | **Apache-2.0 全文**，11,358 B | `DamonKoy/dsh-web-ui` 与主线 `zhu1090093659/dsh-pet` 的仓库根 `LICENSE` 是**同一个 blob**：`d645695673349e3947e8e5ae42332d0ac3164cd7`（size 11358，正文以 "Apache License / Version 2.0, January 2004" 开头） |
| 上游**包级** `packages/dsh-pet/LICENSE` | **BSD 3-Clause License**，1,521 B，blob `fd674136195478eac50ab24cb5a8ff105886abf3` | 即**本项目随附于同目录的这份**（版权行 `Copyright (c) 2026, zhu1090093659`） |
| 上游 npm / `package.json` 元数据 | 写的是 `Apache-2.0` | 快照 `packages/dsh-pet/package.json`：`"license": "Apache-2.0"`（version 0.1.16）；npm `@linxin666/dsh-pet` 元数据同为 `Apache-2.0`（latest 0.4.6） |
| **素材自身**声明 | **BSD-3-Clause** | 主线最新 `assets/whale/pet.json`（`petManifestVersion: 2`，2,718 B）中显式带 `"license": "BSD-3-Clause"`，其 `sprite2d.spritesheetPath` 指向的图集 blob SHA1 与本项目随附的**完全相同** |

**结论**：本项目随附并履行的是**素材自身声明的 BSD-3-Clause**（即同目录 `LICENSE` 原文）；这一履行方式**同时满足**仓库根 Apache-2.0 的署名要求——保留版权与许可声明、不以作者名义背书。具体义务履行：

1. **保留版权与许可声明**：同目录随附 `LICENSE` 原文（字节未改），并在扩展 `README.md` 写明出处、上游仓库与"未获背书"；打包 `.oix` 时把 `assets/whale/LICENSE` 与 `assets/whale/pet.json` 一并带上（见 `specs/pet-sprites` Requirement 4 的 Scenario「打包物含许可证」）。
2. **不以作者/贡献者名义背书或推广**（BSD-3 第 3 条）：见 §8 声明。
3. **再分发不改字节**：本项目未修改、未重编码素材，故无需附加"修改声明"；本项目自制内容仅本文件。
4. 若将来分发范围扩大到**上游代码**（而不只是素材），须另行取上游仓库根 Apache-2.0 全文，并补齐其 NOTICE / 变更声明等义务；当前范围不需要。

---

## 8. 关联与背书声明

本项目（obox 桌面宠物扩展）与素材作者 **zhu1090093659**、上游主线仓库 **`zhu1090093659/dsh-pet`**、快照仓库 **`DamonKoy/dsh-web-ui`** 及 npm 包 **`@linxin666/dsh-pet`**：

- **无任何组织、法律或开发上的关联**；
- **未取得作者或上游项目的背书、赞助、认可或授权许可之外的任何承诺**；
- 素材仅按上述许可证条款**原样再分发**，文中出现的名称/商标仅用于说明来源，不代表其对本项目的推荐。

---

## 9. 随附清单是**快照版**，不是主线最新版（改动前必读）

本项目随附的 `pet.json` 取自快照仓库（838 B），**不是**主线 `zhu1090093659/dsh-pet` 当前的 v2 清单（2,718 B）。两版差异：

| 项 | 本项目随附（快照版） | 主线最新版 |
| --- | --- | --- |
| 大小 / blob SHA1 | 838 B / `ce7c1d9da8c6d5e9b14ff5a0538664a14853cc8e` | 2718 B / `eeec702673bf77ae97db128e463a315a12f4eb35` |
| 清单版本字段 | 无 `petManifestVersion` | `petManifestVersion: 2` |
| 素材 license 字段 | 无（许可证在同目录 `LICENSE`） | `"license": "BSD-3-Clause"` |
| 顶层结构 | `id`/`displayName`/`description`/`spritesheetPath`/`frames`/`tracks` | `petManifestVersion`/`id`/`displayName`/`renderer`/`sprite2d`/`description`/`license`/`sequences`（`frames`/`tracks` 收进 `sprite2d`） |
| `displayName` | `鲸鱼娘` | `鲸鱼娘（原版）` |
| `frames` | `[6, 8, 8, 4, 5, 8, 6, 6, 6]` | **相同** `[6, 8, 8, 4, 5, 8, 6, 6, 6]` |
| `idle.durations` | `[400, 400, 500, 400, 400, 500]`（一轮 2600ms） | `[500, 500, 600, 500, 500, 600]`（一轮 3200ms） |
| 其它轨时长 | 较快（如 `running-right` 全 225） | 较慢（如 `running-right` `[300×7, 400]`） |
| 图集本体 | blob SHA1 `5ffb1ac7…`，1544154 B | **同一 blob**，字节完全相同 |

**取舍理由**：本项目 `specs/pet-sprites` 的帧时长契约（如 `idle` 六帧 400/400/500/400/400/500、一轮约 2600ms）是按**快照版**写死并验收的，故随附快照版清单，保持"规格 ↔ 素材"一致。

**升级为主线 v2 清单是一次有意的变更**（会改动画节奏、清单字段与解析代码），**必须走新的 change（proposal → spec delta → design → tasks）**，不得在 dev / ship 步骤里顺手替换本文件或 `pet.json`。

---

## 10. 替换条款（强制）

将来把鲸鱼娘换成自制素材或其它素材时：

1. **必须删除本文件 `PROVENANCE.md` 与同目录 `LICENSE`** —— 不得留下已失效的第三方声明（`specs/pet-sprites` Requirement 4 的 Scenario「替换为自制图集后」）。
2. 为新素材**另写来源与授权记录**：自制素材写明作者、生成方式、授权；第三方素材随附其许可证原文，并写与本文件同级的出处记录（仓库/路径/commit/大小/SHA256/许可/未获背书）。
3. 同步更新扩展 `README.md` 的出处与许可证段，以及打包产物内的许可证/出处文件清单。

---

## 11. 复核方式（可复现）

```powershell
# 大小与 SHA256
Get-FileHash assets/whale/spritesheet.webp -Algorithm SHA256
(Get-Item assets/whale/spritesheet.webp).Length   # 期望 1544154
```

```js
// 零依赖：git blob SHA1（与 GitHub API 的 sha 同源）+ WebP 头解析
node -e "const fs=require('fs'),c=require('crypto');for(const n of ['spritesheet.webp','pet.json','LICENSE']){const b=fs.readFileSync('assets/whale/'+n);console.log(n,b.length,c.createHash('sha256').update(b).digest('hex'),c.createHash('sha1').update(Buffer.from('blob '+b.length+'\0','utf8')).update(b).digest('hex'));}"
```

```
# 上游旁证（size 与 git blob sha1）
https://api.github.com/repos/DamonKoy/dsh-web-ui/contents/packages/dsh-pet/assets/whale/spritesheet.webp?ref=main
https://api.github.com/repos/DamonKoy/dsh-web-ui/contents/packages/dsh-pet/assets/whale/pet.json?ref=main
https://api.github.com/repos/DamonKoy/dsh-web-ui/contents/packages/dsh-pet/LICENSE?ref=main
https://api.github.com/repos/zhu1090093659/dsh-pet/contents/assets/whale/spritesheet.webp   # 主线交叉验证
```

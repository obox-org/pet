# 09 · ext-manifest-settings（扩展：manifest 设置页 + apiVersion + 清 demo 贡献点）

| 字段 | 内容 |
| --- | --- |
| **目标** | 手写 `contributes.settings`（脚手架不生成）：一个 `boolean` 显示开关 + 三行 `progress`（饥饿度/清洁度/心情，`max:100`，**不写 description**）+ 一个只读 `status` 诊断位；声明 `apiVersion`（= 卡 02 递增后的值）；删除脚手架 demo 贡献点（`views[pet.tree]`、`commands[pet.hello]`、`i18n` demo 词条），保留 `statusBarItems[pet.status]`；**不注册任何 App 卡片**。 |
| **输入** | `specs/pet-settings/spec.md` 三条 requirement（toggle 语义 = 创建/销毁窗体、三行进度条 + `{cur}/100` + MUST NOT 带描述、`apiVersion` 门槛拒绝老宿主）、`specs/pet-window/spec.md`「本扩展 SHALL 是后台扩展」（MUST NOT 注册 App 卡片、MUST NOT 出现在启动器/导航区）；`design.md` D-7（阈值常量）、D-9（诊断位文案：窗体创建失败/状态未保存）、D-12（保留 `pet.status`、删除清单）、Context「宿主能力边界」；锚点：`docs/extension-api/manifest-reference.md:150`（`contributes.settings` 形状）、`:20,300`（`apiVersion` 语义与校验）、`:292-347`（error/warning 校验规则）、`docs/extension-api/api-reference.md:299,310-318`（`status` 只读语义与 `modal`）。 |
| **文件所有权** | `extensions/pet/manifest.json`。**不含** `index.js`（卡 07 负责读设置与注册逻辑）、`scripts/validate-manifest.mjs`（卡 04）。 |
| **验收命令** | ① `node <宿主根>/scripts/validate-manifest.mjs extensions/pet/manifest.json` ⇒ `0 个 error、0 个 warning`（**须在卡 04 完成后跑**，否则 `progress` 会被判未知类型）；② 断言 manifest 里 **不存在** `contributes.views` / `contributes.commands` / 任何 App 卡片声明（`node -e` 读 JSON 断言）；③ 断言 `contributes.settings.fields` 恰为 5 项且顺序为 `boolean, progress, progress, progress, status`，三个 `progress` 的 `max === 100` 且**均无 `description` 键**；④ 断言 `apiVersion` 等于宿主根 `package.json` 的 `apiVersion`；⑤ `manifest.name === 'pet'`、`displayName === '宠物'`、`author === 'chenzhi'`（中文字节无损，`Get-Content -Encoding utf8` 读回比对）。 |
| **依赖与阻塞** | 依赖 **02**（`progress` 与 `api.overlay` 进类型面）、**04**（校验脚本白名单含 `progress`）。**阻塞** 10、11。 |
| **并行组** | 组 3 |

## 负向自检（不改实现）

- 用校验脚本直接验非法形状（不改任何实现文件）：临时构造**内存中的** manifest 对象（或 `%TEMP%` 下的副本文件）分别注入 `type:'gauge'`、`progress` 缺 `max`、`views` 未声明数据源、`apiVersion` 高于宿主 ⇒ 断言校验脚本报 error 且错误信息可执行。**仓库内的 `manifest.json` 不被改动**。

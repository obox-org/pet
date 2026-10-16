# 05 · host-docs-sync（宿主：扩展 API 文档与 skill 同步）

| 字段 | 内容 |
| --- | --- |
| **目标** | 按 AGENTS.md 的**强制同步**要求，把 02/03/04 实际做出来的行为写进真相文档：`api.overlay.*` 三方法（参数、作用域约束、overlay 窗体的透明要求与生命周期）、`progress` 设置字段（只读语义、`max`、取整口径、不显示 description）、`apiVersion` 递增对老宿主的拒绝加载语义、以及透明窗体的**平台限制**（DWM 关闭时失效、`transparent` 不可运行时切换、全屏独占下可能被遮挡、**开 DevTools 会变不透明**、无逐像素穿透只能整窗切换）。 |
| **输入** | `proposal.md` `## Impact` 的「文档同步（AGENTS.md 强制）」条；`design.md` D-11（五处改动 + 官方文档复核 6 条）、D-2（作用域安全）、D-12（后台扩展的对外可见面）；`notes/validation.md` N5（平台限制须记入 troubleshooting）；实际实现以 **03/04 的代码为准**（文档只写代码的实际行为，未实机验证的须标注"未实机验证"）；官方文档 <https://www.electronjs.org/zh/docs/latest/tutorial/custom-window-styles>。 |
| **文件所有权** | `docs/extension-api/api-reference.md`、`docs/extension-api/manifest-reference.md`、`docs/extension-api/themes-settings.md`、`docs/extension-api/troubleshooting.md`、`skills/obox-ext-*`（受影响的技能文档）、宿主 `README.md`（仅当扩展能力概览需要更新时）。**不含** `extensions/pet/**`（其 README 属卡 10）。 |
| **验收命令** | 纯文档改动 ⇒ 按 AGENTS.md「纯文档/配置/skill 改动：跳过本地检查直接提交（CI 仍会跑）」；自检：① 四个文档都出现 `api.overlay` / `progress` 的条目且与代码签名逐字一致（逐个方法名比对 `src/api/types.ts`）；② `troubleshooting.md` 含五条平台限制；③ `themes-settings.md` 说明 overlay 模式**不推送/不消费 token**（与 D-6 的无主题裁定一致）；④ 文档内不得出现"未实机验证"却写成已验证的句子（卡 11 出证据前，透明观感类描述须标注）。 |
| **依赖与阻塞** | 依赖 **02、03、04**（写的是它们的实际行为）。**阻塞** 无（可与扩展侧并行收尾）；但 `ship` 步会核对文档同步，故须在提交前完成。 |
| **并行组** | 组 3 |

## 负向自检（不改实现）

- 反向核对：从 `src/api/types.ts` 抽出 `api.overlay` 的方法名与参数名，逐个在 `api-reference.md` 里 grep，**任一缺失即判本卡不通过**（防"文档写了个不存在的方法"或"代码有方法文档没写"）。

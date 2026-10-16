# 14 · host-overlay-setposition（宿主：overlay 移动能力）

| 字段 | 内容 |
| --- | --- |
| **目标** | 给 `api.overlay` 增加第四个方法 `setPosition(id, x, y)`（供扩展实现拖宠物换位），含主进程实现、preload 桥接、`MainApi` 签名、作用域校验、钳位由**扩展侧**负责但宿主侧做**工作区合法性兜底**，并同步 `api-reference.md` 的 overlay 小节与两个既有测试文件。 |
| **输入** | `proposal.md` `## Impact` 宿主第 3 条（四个方法 + 作用域）；`design.md` **D-13**（增量通道、钳位公式、位置失效回退、被否决备选）；`specs/pet-window/spec.md` 新增的拖拽 requirement（3 个 scenario）；锚点：`src/main/appWindow.ts`（overlay 注册表与 `overlayPosition`/`validateOverlayRequest`）、`src/renderer/src/core/host.ts`（`buildOverlayApi`/`overlayOwners`）、`src/preload/index.ts:70-72`、`src/shared/types.ts`（`MainApi` + overlay 类型）、`src/api/types.ts`（overlay 命名空间）、`docs/extension-api/api-reference.md` 的 `### overlay` 小节（卡 05 新写）。 |
| **文件所有权** | `src/api/types.ts`、`src/shared/types.ts`、`src/preload/index.ts`、`src/main/appWindow.ts`、`src/main/index.ts`（若需注册 IPC）、`src/renderer/src/core/host.ts`、`test/overlay-window.test.ts`、`test/host-api-surface.test.ts`、`docs/extension-api/api-reference.md`。**不含**：`AppWindow.vue`、`main.css`、`SettingsView.vue`、`validate-manifest.mjs`、`guides-*`、其它 docs、`extensions/**`。 |
| **验收命令** | 宿主根：`npm run typecheck`（0 error）、`npm run lint`（0 error、不新增 warning）、`npm test`（基线 **777 passed** 起，新增后不减）；新断言：① `setPosition` 签名与其余三方法同构（`Promise<OverlayResult>`）；② 作用域：A 扩展 setPosition B 扩展的 overlay ⇒ `ok:false` + 中文可执行 error + `[overlay]` warn；③ 宿主兜底：x/y 为 NaN/Infinity/超工作区 ⇒ 钳到主显示器工作区（与 D-13 的扩展侧钳位双保险，注释写明"宿主兜底、扩展主钳"）；④ 不存在的 id ⇒ `ok:false`（与 setMouseThrough 同口径）；⑤ `api-reference.md` 的 overlay 小节含 `setPosition` 且参数名与源码逐字一致；⑥ 回归：create/destroy/setMouseThrough 的既有断言全绿。 |
| **依赖与阻塞** | 无（契约已由 D-13 固定，可与卡 15 并行）。**阻塞** 卡 16（实机联调需要真 setPosition）。 |
| **并行组** | 组 6 |

## 负向自检（不改坏实现）
喂非法输入断言被拒/钳制：`setPosition(id, NaN, 100)`、`(id, Infinity, -Infinity)`、`(id, '10', '20')`、缺参、id 非字符串；越权 id；不存在的 id。全部用"喂值断言返回/钳制结果"的方式，**不**临时改坏校验。

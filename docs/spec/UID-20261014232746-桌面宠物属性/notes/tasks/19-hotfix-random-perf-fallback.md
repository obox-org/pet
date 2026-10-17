# 19 · hotfix-random-perf-fallback（v1.0.1：随机表演播完必须回落）

| 字段 | 内容 |
| --- | --- |
| **目标** | 修掉卡 18 实机复验发现的**实现级缺陷 D-1**：随机表演抽到 `eating`/`bathing`/`petted`/`playing` 四项时**播完不回落到呼吸 idle**（实测 DOM 停留 5.0 / 10.0 / 15.0 / **24.98s**，连成一片），并顺带收敛自发表演轨的渲染停留（`trot` 2.41s、`run-left/right` 3.21s，规格 1.5s/1.8s + 500ms slack）；另修一条一致性问题：用户互动与随机表演**抢动画**（连点玩耍时气泡「玩得好开心！」还在，精灵已切到 eating 轨）。 |
| **根因** | 入口 `state.transient` 被随机表演与真实互动**共用**，状态字符串完全相同（随机抽到的 `eating` 与用户点喂食都是 `'eating'`）⇒ `app/App.vue` 的 `entryStatus` 只能按 `isSelfBurst(status)`（trot/run-left/run-right）折 idle，对同名四项无能为力；而页面 `decideAnimation` 见 `animStatus='eating'`（优先级 9）就一直渲染该轨。 |
| **输入** | 证据：`openspec/changes/archive/2026-10-16-pet-desktop-companion/notes/evidence/real-window-v2.md` 的「卡 18 后复验」节（§1 D-1、§3 缺陷清单 O-3）；实现落点：`lib/bridge.js` 的 `buildView`、`index.js` 的 `onRandomPerf`/`interact`/`state.transient`、`app/lib/anim.ts` 的 `isSelfBurst`/`SELF_BURST_SET`、`app/App.vue` 的 `entryStatus`/`entryRow`/`burstLatched`/`burstWatchdog`/`syncBurst`。 |
| **文件所有权** | `<EXT>\index.js`、`<EXT>\lib\**`、`<EXT>\test\**`、`<EXT>\app\**`、`<EXT>\manifest.json`（**仅版本号**）、`<EXT>\README.md`（若需）。**不含**：`scripts/pack.mjs`、`package.json`、`.gitignore`、`vite.config.ts`、`tsconfig.json`、`assets/**`、`openspec/**`、`<ROOT>/**`。 |
| **修法（父代理指定，按此实现）** | ① **入口区分来源**：新增**运行时**字段（例：`state.transientSelf: boolean`，**不落盘**、不进 `serialize` 白名单）——`onRandomPerf`/trot 写 transient 时置 `true`，`interact` 写 transient 时置 `false`，两者与 `transient` 同生命周期；② **视图暴露**：`buildView` 的 `anim` 增加 `self: boolean`（= 当前 transient 是否来自自发表演；无 transient 时为 `false`），JSDoc 写明用途与"为什么不能用状态字符串区分"；③ **页面按 `anim.self` 锁存回落**：把 `entryStatus`/`entryRow` 的折 idle 条件从 `isSelfBurst(status)` 改成 `anim.self === true`（`isSelfBurst` 可保留给其他用途或删除，删除则同步测试与 `SELF_BURST_SET`）；这样**七项随机动作一律"播完即回呼吸"**，而**真实互动照旧渲染完整一轮**（不会被提前折成 idle）；④ **收敛停留**：自发表演一轮结束后，回落必须发生在"该轨一轮时长 + 既有 slack（500ms）"之内（用页面侧锁存 + 看门狗，不依赖入口下一次 tick）；⑤ **气泡与动画一致**：随机表演期间用户点互动 ⇒ 互动动画与气泡同时生效（互动优先级本就更高，`self` 标记不得把互动也折掉）；⑥ **顺带（父代理裁定 R53）**：✕ 关闭按钮的 `:focus-visible` 环由青色 `rgba(56,189,248,.85)` 改为**白色 2px**，与三枚图标按钮统一（复验报告 O-2）。 |
| **验收命令** | `<EXT>`：① `npm test` 全绿（基线 **170**）。新增用例：入口 `anim.self` 对**七项**随机抽到的取值均为 `true`（逐项参数化）、对四种真实互动的取值均为 `false`；随机表演播完 ⇒ 页面回落（在"一轮 + slack"内）；**真实互动不被 self 折掉**（点喂食后仍渲染 eating 完整一轮）；随机表演中触发互动 ⇒ 动画与气泡同时为互动（无"气泡还在、动画已切"）；`transientSelf` **不落盘**（serialize 白名单断言）；✕ 的焦点环为白色（样式/源码断言）。② 清 dist + `npm run build` 成功；产物 grep：`transientSelf` 不进产物（仅入口侧）或按实现说明、旧禁止项仍全 0。③ `node <ROOT>\node_modules\vue-tsc\bin\vue-tsc.js --noEmit -p tsconfig.json` 0 error。④ `npm run pack` 回读自检通过（条目数不变，文件名随版本变为 `pet-1.0.1.oix`）。⑤ `manifest.json` 的 `version` 由 `1.0.0` 改 `1.0.1`（**只改这一处**），其余字段逐字不动。 |
| **负向自检** | 随机抽到与互动同名的四项 ⇒ 播完必回落（这是本次的核心断言，务必参数化七项逐项覆盖）；`anim.self` 在无 transient 时为 `false`；畸形 `transientSelf` 非布尔 ⇒ 归一 `false`；真实互动期间 `anim.self=false` ⇒ 页面不得折 idle。 |
| **依赖与阻塞** | 无。**阻塞** v1.0.1 的发版（父代理做 tag/release）。 |

## 备注
- 本次是**发版后热修**：`openspec/changes/` 的 change 已归档 ⇒ 不改规格/design（缺陷属"实现与规格不符"——规格原文即"播完一轮后回落判定"，实现没做到；修复是把实现拉回规格，不是改需求）。父代理会在归档目录与交付归档里补一份 `notes/hotfix-v1.0.1.md` 记录本次热修的起因、根因、修法与验证。
- `run-left`/`run-right` **保留**（复验报告建议：先修 D-1 再复看观感；若届时仍突兀，删除是 v1.0.2 的一句话改动）。

# 热修记录 · pet v1.0.1（发版后修复）

关联 change：`pet-desktop-companion`（已归档 `2026-10-16-pet-desktop-companion`）｜UID：`UID-20261014232746-桌面宠物属性`｜日期：2026-10-16

> 本文件记录 **v1.0.0 发版后**由实机复验（tasks.md §9.2）发现并修复的两处问题。按流程，`openspec/changes/` 的 change 已归档 ⇒ **不改规格/design**：两处都是"**实现与既有规格不符**"（规格原文即"播完一轮后回落判定"、"互动播放一轮后回落到当前状态判定"），修复是把实现拉回规格，而非改需求。

## 1. 触发与定级

| 项 | 内容 |
| --- | --- |
| 发现者 | 卡 18 后实机复验（tasks.md §9.2，代理 `cf5e34cb`） |
| 证据 | `notes/evidence/real-window-v2.md` 的「卡 18 后复验」节（第 272 行起）：§1 D-1（含 DOM 停留原始数据）、§3 缺陷清单 O-1/O-2/O-3 |
| 定级 | **实现级缺陷、建议"中"**（可见且违背规格；不崩、不丢数据） |
| 用户裁定 | 立即修成 **v1.0.1**（选项 A）；随后追加裁定把"真实互动姿态挂到下一次推送"**一并并入 v1.0.1**（选项 A） |

## 2. 缺陷 D-1：随机表演抽到同名四项时播完不回落

**现象**：每 10 秒随机表演抽到 `eating` / `bathing` / `petted` / `playing` 时，**播完不回落到呼吸 idle**——实测 DOM 停留 `row4 = 5.0 / 10.0 / 15.0s`、`row3 = 5.0 / 25.0s`、`row7(playing) = 10.0s`（连续多轮同轨连成一片，最长 **24.98s**）；而 `trot` / `run-left` / `run-right` 会回落（2.41s / 3.21s vs 规格 1.5s / 1.8s + 500ms slack）。**副作用**：连点玩耍时气泡「玩得好开心！」还在、精灵已切到随机抽到的 eating 轨。

**根因（读码定位）**：入口 `state.transient` 被**随机表演与真实互动共用**，状态字符串完全相同（随机抽到的 `eating` 与用户点喂食都是 `'eating'`）⇒ 页面 `entryStatus` 只能按 `isSelfBurst(status)`（trot / run-left / run-right 三条）折 idle，对同名四项无能为力；而 `decideAnimation` 见 `animStatus='eating'`（优先级 9）便持续渲染该轨。

**修法（卡 19）**：**来源只能由写入方记录**——
1. 入口新增**运行时**字段 `state.transientSelf`（自发写 `true`：`onRandomPerf`；互动写 `false`：`lib/interact.js` 的 `succeed()`；`settle.initialState` 初值、`persist.sanitizeState` 读档归一为 `false`；**不进 `serialize` 白名单 ⇒ 不落盘**）；
2. 视图 `buildView` 的 `anim` 暴露 **`self: boolean`**（经 `lib/mapping.js` 的 `isSelfTransient`：认得的 transient + 未到期 + **真布尔 `true`**；拖动折叠时同步报 `false`）；
3. 页面折 idle 条件由 `isSelfBurst(status)` 改为 **`anim.self === true`**（零依赖纯模块 `app/lib/burst.ts` 的 `entryTrackOf(anim, latched)`）⇒ **七项随机动作一律"播完即回呼吸"**，而**真实互动照旧渲染完整一轮**（"锁存位脏 true 也不折"有用例钉住）；
4. **删除两张按状态字符串认来源的表**（`lib/mapping.js` 的 `SELF_BURST_STATUSES`/`isSelfBurst`、`app/lib/anim.ts` 的 `SELF_BURST_SET`/`isSelfBurst`）——它们天生认不出同名四项，正是根因；产物级断言 `isSelfBurst=0`、`SELF_BURST=0`。

## 3. 老毛病 R54：真实互动姿态挂到下一次推送（≤15s）

**现象**（自卡 07 起即存在，非本次引入；9.2 复验记为 D-1 影响面 ③）：点喂食/洗澡/玩耍/摸头后，精灵姿态一直挂到**入口下一次推送**（≤15 秒 tick）才回落——因为入口的 transient 到期既不 `rev++` 也不推送。

**修法（入口侧，父代理裁定 R54）**：入口在 transient 写入时排一个**一次性到期定时器** `pet-transient`：
- `transientDelaySeconds(until, now) = clamp(ceil(remain / 1000), 1, 86400)`（`api.timer` 只收**整数秒**；**向上取整 ⇒ 宁晚 ≤1 秒也绝不早到**）；
- 到期回调 `onTransientExpire()` 做三件事：**先校验真到期**（`transientExpired`，早到 ⇒ 只重排、不清不推）→ 清 `transient`/`transientSelf` → `rev++` + `hub.wake()`（**不写盘、不写设置键**：数值没变，`rev` 是唯一副作用）；
- 排程入口共 4 处：`onRandomPerf`、`pet.interact`、**create 成功补排**（覆盖"1.x 秒内关闭再打开"的边界）、早到重排；清理共 3 处：arm 内先清后设、**窗体销毁**、**cleanup**（与 `pet-tick`/`pet-perf` 同处释放）。
- **为什么不在页面折**：`prefers-reduced-motion: reduce` 下页面轮长（400ms/帧）**长于**入口 `TRANSIENT_MS`，页面按本地轮长折会**掐掉用户刚点的动作**；入口是唯一时间源。

## 4. 顺带修复（父代理裁定 R53，复验报告 O-2）

✕ 关闭按钮的 `:focus-visible` 环由青色 `rgba(56,189,248,.85)` 改为**白色 2px**，与三枚图标按钮统一（可访问属性未动）。**未含**：精灵自身的焦点环仍为青色（R53 只要求"✕ 与三枚图标统一"，复验报告的 O-2 亦仅指 ✕）；悬停与焦点分属两枚按钮时两条 `.tip` 同时显示（复验报告 O-1）**登记不修**（涉及"悬停 vs 焦点谁优先"的优先级设计，属新决策）。

## 5. 验证

| 项 | 结果 |
| --- | --- |
| 扩展测试 | **196 passed / 0 fail**（v1.0.0 基线 170 ⇒ 卡 19 首轮 +13、R54 追加 +13；含"七项逐项为 `self:true` / 四种互动逐项 `self:false` / 同名四项播完必回落 / `self=false` 不被折 / 停留收敛 / `transientSelf` 不落盘 / 到期恰好推一次 / 覆盖先清后设 / 销毁与 cleanup 清理 / 早到不清不推 / 属性过低回落 hungry·dirty·sad / 畸形输入"等） |
| 页面侧零改动铁证 | R54 前后重新 build 的产物 **哈希逐字相同**（`dist/assets/index-DYgb4OTm.js` 93.33 kB、`index-fYjIS2KV.css` 4.57 kB）⇒ 两半修复互不污染 |
| 产物 grep | 旧禁止项全 0；新增禁止项（`linear-gradient`/`TROT_*`/`trotUntil`/`pet-trot`/`currentColor`/`isSelfBurst`/`SELF_BURST`/`transientSelf`/`pet-transient`）全 0（新 id 只在入口侧）；必需项 `<svg=4`、`.tip=3`、`stroke:#fff`、`self===!0=3` |
| `vue-tsc` | 0 error |
| `npm run pack` | 18 条目、回读自检通过 ⇒ `out/pet-1.0.1.oix`（1,644,100 B） |

## 6. 口径边界与裁定（R55）

`api.timer` 是**整数秒** ⇒ 到期落点 = `ceil(本轮/1000)` 秒，逐轨：`run-left/right` 1800ms ⇒ 2s（+200ms）、`eating` 1600ms ⇒ 2s（+400ms）、`playing`/`trot` 1500ms ⇒ 2s（+500ms，贴 slack）、`bathing`/`petted` 1400ms ⇒ 2s（**+600ms，超既有 slack 100ms**）。

**父代理裁定 R55：接受，不发 v1.0.2**。理由：① 这是"≥1 整数秒定时器"的**数学下界**（`floor`/`round` 会先早到再重排，收敛到同一个 `ceil`）；② 与 README 写明的口径「最迟该轮 **+1 秒**回落」一致（规格只要求"一轮播完回落判定"，未规定亚秒精度）；③ 要严格压进 500ms 只有两条路——宿主提供毫秒级 timer（属扩展 API 面变更，需另开宿主改动）或页面按本地轮长折（已被 R54 否决：reduced-motion 下会掐动作）；④ 相比修复前的 ≤10–15 秒已是量级改善。

## 7. 发布信息

| 项 | 值 |
| --- | --- |
| 版本 | `manifest.json`：`1.0.0 → 1.0.1`（仅此一行） |
| 产物 | `out/pet-1.0.1.oix`（18 条目，1,644,100 B） |
| tag / release | `v1.0.1`（扩展仓 `obox-org/pet`） |
| 依赖宿主 | 仍为 `apiVersion >= 2`（obox **v1.0.16** 起；该版本已于同日发布） |

## 8. 未改动面（明确声明）

`openspec/**` 的 change 与规格、`design.md`、`tasks.md`、`scripts/pack.mjs`、`package.json`、`.gitignore`、`vite.config.ts`、`tsconfig.json`、`assets/**`、`app/**`（R54 之后）、宿主 `<ROOT>/**` 一律未改。`run-left`/`run-right` **保留**（复验报告建议："先修 D-1 再复看观感"；若届时仍突兀，删除是 v1.0.2 的一句话改动）。

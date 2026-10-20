# check — pet-v2-growth-favor（第 8 步 · 验收检查）

> 检查对象：`extensions/pet` 工作区未提交改动（HEAD `99e4307`、`git diff --cached` 空、提交数 7 ——**三项均已核对通过，无人越过 dev/ship 边界**）。
> 本步性质：**纯只读**。除本文件外未写任何源码/测试/spec/design/任务卡，未执行 `git add/commit/push`。
> 门槛复跑写入的只有被 gitignore 的 `dist/`、`out/`（`npm run build` / `npm run pack` 的必然产物，`.gitignore:1-6`）。
> 环境：Windows + PowerShell，`node v24.14.0` / `npm 11.9.0`；门槛输出为本次原始 stdout/stderr 原文粘贴。

---

## 1. 结论摘要

### 1.1 三档计数

| 档位 | 条数 | 说明 |
| --- | --- | --- |
| **严重** | **1** | S-1：好感值 > 650 后设置页**不显示精确好感值**（宿主把 `progress` 的 `{cur}` 钳到 `[0,max]`），与 `pet-settings` 的专门 scenario 直接冲突，且 design 明文要求的"另用 `status` 行展示精确值"没有落地 |
| **普通** | **12** | 其中 3 条为**证据不足**（P-7 manifest 无自动化校验 / P-10 无实机验证 / P-11 无组件挂载级渲染测试），已标明缺哪类证据 |
| **一般建议** | **8** | 风格与可选改进，不阻断 |
| 证据不足（并入普通） | 3 类 | 见普通问题 P-7、P-10、P-11 |

### 1.2 门槛一句话

**全绿。** `npm test` = **284 / 284 pass / 0 fail（352.68ms）**；`npm run build`（先清 `dist/`）= 成功（26 modules，`index-Bsxlc5_3.css` 4.62 kB / `index-C6rUe7Zg.js` 91.61 kB）；`vue-tsc --noEmit` = **exit 0、零输出**；`npm run pack` = `out/pet-2.0.0.oix`（18 条目 / 1,661,403 B / 回读校验通过，SHA-256 `DB8CE04D8E3E1008…` 与回执**逐字一致**）；产物 grep 禁止项**按词边界全 0**、必需项全部命中且计数与回执相同。原始输出见 §5。

**与 dev 回执的一致性**：6 项门槛的数值与 dev.md:74-82 **逐项一致**（含 oix 字节数与 SHA-256 前缀）。**唯一实质性不符**是回执对"好感超过 650 时数字如实显示"的描述（dev.md:53、README:88）与宿主实际渲染行为相反 —— 见 S-1，这条也是本次唯一的严重问题。

### 1.3 spec delta 逐条判定统计（对应附录 A）

| 类别 | 实际条数 | 判定分布 |
| --- | --- | --- |
| `### Requirement:`（新增 ADDED） | **23** | 有实现且有测试 **20** ｜ 有实现无测试 **1** ｜ 实现与需求不一致 **2** ｜ 无实现 **0** |
| `### Requirement:`（REMOVED） | **4** | 有实现且有测试 **4**（标题口径问题见 P-6） |
| `#### Scenario:` | **56** | 有实现且有测试 **51** ｜ 有实现无测试 **2** ｜ 实现与需求不一致 **3** ｜ 无实现 **0** ｜ 跳过 **0** |

> ⚠️ **与上游计数不符，必须先更正口径**：本步 brief、`notes/validation.md:96`、`tasks.md:3` 都写"**25 条新增 + 4 条删除 + 57 个 scenario**"，`design.md:3` 写"22 + 4 + 53"；**实测为 23 + 4 + 56**（`Select-String '^### Requirement:' / '^#### Scenario:'` 逐文件计数）。差额可由"design 的 22 + validation 环节 P3 新增的 1 条（面板等级名）= 23""design 的 53 + P3 的 2 个 scenario + S1 的 1 个 scenario（关闭显示期间不涨）= 56"完整解释 ⇒ 判为**上游计数笔误，不是 spec 丢条**（proposal 的 11 条 What Changes 与 23 条 requirement 逐条对得上，见 P-9）。附录 A 的 83 行判定严格按**实际 23+4+56** 展开、无跳过。

### 1.4 越界结论（对应附录 D）

- **文件级**：`git status --porcelain=v1` 的 **41 项**（34 项已跟踪改动 + 7 项新增：`lib/texts.js`、5 个新测试、`openspec/changes/pet-v2-growth-favor/`）**全部落在 6 张任务卡的所有权内**，无"所有权外文件"。`openspec/changes/pet-v2-growth-favor/` 是本 change 的产物目录（任务卡之外的规格产物，非代码）。
- **行为级**：**1 处越界** —— 卡 06 改了 `lib/constants.js`（所有权属卡 01）。dev.md:56/68 以"裁定 R58"记录了这次移交，但 `tasks.md:8/38` 的所有权段没有同步修订 ⇒ 事后审计无法从任务卡复现该归属（P-12）。
- 另有 1 处**经卡 01 回执明确授权的**跨文件改动：`lib/items.js` 仅第 8 行 import（`./vitals.js` → `./growth.js`，裁定 R57），`git diff -U0 lib/items.js` 确认**只此一行**。
- 工作区未被本步改动：复跑门槛前后的 `git status` 完全相同（`dist/`、`out/` 被 `.gitignore` 忽略）。

---

## 2. 严重问题逐条

### S-1 · 好感值 > 650 后，精确好感值在设置页被宿主钳成 650（与 spec scenario 直接冲突，design 要求的补充行缺失）

- **锚点**：
  - spec 冲突：`openspec/changes/pet-v2-growth-favor/specs/pet-settings/spec.md:5`（"③ 好感值（只读进度条，`max = 650`，并同时展示**精确好感值**与**当前等级名**）"）与 `:12-15`（scenario「好感超过进度条上限」：`THEN` 进度条满格，而**精确数字与等级名如实显示（数字不被吞掉）**）。
  - design 已给的解法没落地：`design.md:13`（"`progress` 会饱和，精确数字必须另用 `status` 行展示"）。
  - 实现取证：`manifest.json:19`（`pet.favor` 是 `progress`/`max:650`，**没有**第二个承载精确好感值的 `status` 字段；5 个字段里只有 `pet.level` 承载等级名）；`index.js:230`（`api.settings.set(KEY_FAVOR, state.favor)` 写未钳真值）。
  - 宿主实际渲染：`src/renderer/src/extensions/settings/SettingsView.vue:685-687`（`clamped = min(max(cur,0),max)`、`now = floor(clamped)`、`text = ${now}/${max}`）；`SettingsView.vue:1168`（每个字段一行）；文档同口径 `src/api/contributions.ts:87-92`（"显示的 `{cur}` 先钳制到 `[0, max]` 再向下取整"）。
  - 测试口径差：`test/timers-v2.test.js:472-480` 只断言"**写进设置键**的是 651"（用例名"数字如实写"），断不到"**显示** 651"；该用例注释甚至自承"宿主自己钳满格"。
  - 回执/README 与事实不符：`notes/dev.md:53`、`README.md:88`（"好感超过 650 时进度条满格而**精确数字与等级名如实显示**"）。
- **影响**：好感**无上限**（`pet-values` R2），满级 650 之后每一次互动都继续 +1，但玩家在 UI 上永远只看到 `650/650` —— 真实进度不可见（好感是本 change 唯一的长期数值目标，等于满级后失去反馈）。全部 56 个 scenario 里判"实现与需求不一致"的只有 3 个（本条的 `pet-settings:12`、`pet-settings:7` 的行集合口径、`pet-values:84` 缺"记录一条诊断"），**本条是其中唯一影响用户可见数据的那一个**。
- **修复意见**（择一，均只需改 `manifest.json` + `index.js` 的一处写入 + 文档）：
  1. **推荐**：新增一个 `status` 行（如 `pet.favorExact`，label「好感（精确）」）在 `syncValueSettings()` 里写 `String(state.favor)`；`pet.favor` 的 progress 保留为视觉条。改完把 spec `pet-settings:9-10` 的行集合口径与 `README.md:82` 一并改成"4 个逻辑行 / 6 个字段"。
  2. 把 `pet.favor` 改成 `status` 直接展示"`651 · 命定相伴`"，另保留一个 `progress` 作纯视觉（行数不变，但进度条不再是"数字的来源"）。
  3. 若决定接受"看不到 650 以上"，则**必须改 spec**：删掉 `pet-settings:5` 的"精确好感值"与 `:12-15` 的整条 scenario，并同步 `design.md:13`、`README.md:88` ——（不推荐，等于取消满级后的进度反馈）。

> 本条发现**不属于**已知的两个既定裁定（① `app/lib/state.ts` 的 `petCooling` 兜底键；② 产物里 `clean` 7 次 / `玩耍` 1 处），是本次新发现。

---

## 3. 普通问题清单

> 含"证据不足"项（P-7 / P-10 / P-11），已标明缺哪类证据。均不阻断，但建议在 ship 前裁定。

| # | 问题 | 锚点 | 缺什么证据 | 修复意见 |
| --- | --- | --- | --- | --- |
| P-1 | v1 存档迁移**未保留** `lastSettledAt`，而 spec 把它列进"必须保留的既有值" | spec：`specs/pet-values/spec.md:77`（"MUST 保留 `growth`、`fish`、`bubble`、`lastInteractAt`、`lastPetAt`、`lastSettledAt`…"）vs 实现：`lib/persist.js:144-160`（serialize 白名单无该键）、`:113-134`（sanitizeState 不读它）；测试**反向钉住**"丢弃"：`test/values.test.js:325`、`test/persist.test.js:97` | 已有（代码 + 测试都确认丢弃） | v2 已无惰性结算，建议**改 spec**：把 R4 的字段清单删去 `lastSettledAt`（改由 `lastGrowthAt`/`lastAfkAt` 承担），而不是给实现加一个死字段 |
| P-2 | "损坏字段不阻止启动"只做到"归一"，**没做"记录一条诊断"** | spec：`specs/pet-values/spec.md:84-87`（`THEN` 宠物正常启动、归一，**并记录一条诊断**）；实现：`lib/persist.js:113-134` 静默归一，`index.js:333-363` 只对 `positionDropped` / 迁移写日志；`test/values.test.js:340-370` 只断言归一值 | 已有 | 在 `loadPersisted` 里比对"原始 JSON 与归一后的关键字段"，有差异就 `setDiagnostic('存档字段已归一')` 一次；或改 spec 去掉该子句 |
| P-3 | 设置页**行集合与 spec 不一致**：spec 是 4 行（好感行含"进度条 + 数字 + 等级名"），实现是 5 行（等级名独立成行） | spec：`specs/pet-settings/spec.md:9-10`（依次可见：开关、成长值、`好感（进度条 + 数字 + 等级名）`、诊断）vs `manifest.json:17-21`（5 字段）+ `SettingsView.vue:1168`（一字段一行） | 已有 | 与 S-1 一并改：把 spec 的口径改成"4 个逻辑行 / 5 个字段"（与 `README.md:82` 现有措辞一致），或把等级名并进某条 `status` 值 |
| P-4 | **spec 内部条数冲突**：点击冷却文本 6 条 vs 8 条 | `specs/pet-interaction/spec.md:71`（"`notes/texts.md` 的「冷却文本」**6 条**"）与 `specs/pet-favor/spec.md:43`（**8 条**）、`:52`（"120 条等级文本 + **8 条**冷却文本"=128）、`notes/texts.md:167`（8 条）、`tasks.md:16`（8 条）冲突；实现取 8：`lib/texts.js:167-176`；测试 `test/texts.test.js:89/106/209` | 已有 | 把 `pet-interaction:71` 的"6 条"改成"8 条"，并同步 `design.md:105/155/179` 的"6 条" |
| P-5 | **spec 内部冲突**：`pet-interaction` R1 要求"玩耍图标**或其状态条目** MUST NOT 存在"，`pet-sprites` R1 又要求随机集 7 项**必须含 `playing`** —— `mapping` 里 `playing` 与中文「玩耍」仍在 | `specs/pet-interaction/spec.md:5` vs `specs/pet-sprites/spec.md:5`；实现按后者（用户裁定 Q8）：`lib/mapping.js:35`（`playing: {row:7…}`）、`:44-52`（`STATUS_LABEL.playing='玩耍'`）、`lib/constants.js:226`（`RANDOM_PERF_SET` 含 `playing`）；`test/values.test.js:72` 反向钉住"仍含 playing" | 已有 | 把 `pet-interaction` R1 的"状态条目"限定为"面板图标与 UI 条目"（推荐），或从 `pet-sprites` 的随机集删 `playing`（会改动已裁定的 7 项，需用户确认） |
| P-6 | **pet-vitals 的 4 条 REMOVED 与 v1 归档 spec 不逐字对应**；v1 另有 2 条 pet-vitals requirement、整个 `pet-growth` capability 未被任何 delta 处置 | v2 `specs/pet-vitals/spec.md:3/7/11/15` vs v1 `openspec/changes/archive/2026-10-16-pet-desktop-companion/specs/pet-vitals/spec.md` 的 4 条标题（"状态存档 SHALL 带 `schemaVersion`…" / "三属性 SHALL 以 100 为满分…衰减" / "属性联动…" / "结算 SHALL 惰性进行…启动时重置"）：只有第 2 条近似，其余 3 条对不上；其中"三属性过低 ⇒ 负面表情"在 v1 并不属于 pet-vitals（v1 把它放在 `pet-sprites` 的状态轨）；v1 `pet-growth` 的 2 条（含"成长值与等级名 SHALL 在悬停面板呈现（**数值** + 等级名）"，与本 change "面板不显示数字"直接对立）既无 MODIFIED 也无 REMOVED | 已有（归档 spec 可对读） | ① 把 v2 REMOVED 的 4 条标题**逐字改成 v1 标题**；② 把 v1 pet-vitals 未处置的 2 条（schemaVersion 备份重建、惰性结算）移入 MODIFIED 或"保留"说明；③ 给 `pet-growth` 补 MODIFIED（并入 `pet-values`）或 REMOVED。当前 `openspec/specs/` 只有 `.gitkeep`，暂时不会真冲突，但归档合并/`validate --strict` 时会暴露 |
| P-7 | **manifest 零自动化测试**（证据不足：缺 manifest 契约的可执行断言） | `test/settings.test.js:18` 明写"设置页字段声明/渲染归 `manifest.json` 与宿主 SettingsView，**不在本文件范围**"；`npm test` 的 21 个测试文件**无一读取 manifest.json**；`scripts/validate-manifest.mjs` 只在 `README.md:150` 作为手工命令出现（CI 未跑：`.github/workflows/*` 无该调用） | 缺"manifest 自动校验"这一类证据 | 在卡 04 所有权内加一条 `node:test`：读 `manifest.json` 断言 `version='2.0.0'`、`fields` 恰 5 项、`type ∈ {text,number,boolean,select,directory,status,progress}`、无 `description`、无 `pet.hunger/clean/mood`、`favor.max===650`。当前这些结论只能靠本步人工核对（附录 B/C 已核对通过） |
| P-8 | **UI 硬约束 1/2 在气泡组件未遵守**：`PetBubble.vue` 仍是 5 处写死色值 + 写死字号；且 token 门禁测试只扫面板 | `app/components/PetBubble.vue:27`（`#0f172a`）、`:39`（`rgba(244,114,182,.92)`）、`:40`、`:45`（`rgba(15,23,42,.9)`）、`:46`（`rgba(125,211,252,.5)`）、`:47`（`#e2e8f0`）、`:28`（`font-size: 12px`，未用 `var(--font-size-sm)`）；design 硬约束 1 要求"CSS 里只有 `var(--…)`"（`design.md:208`），而 D-6 又写"气泡外观沿用 v1"（`design.md:128`）——design 自相矛盾；测试 `test/view-v2.test.js:334-352` 只用 `styleOf(panel)` 扫 PetPanel | 已有（注释与代码可对读） | 择一：① 把气泡改成 token（`--bg-panel`/`--fg`/`--font-size-sm`）并把 token 门禁扩到 `app/**`（气泡会失去"粉/深"两态区分，需确认视觉）；② 把硬约束 1 的口径限定为"本 change 新增/改写的样式"，并把 `PetBubble.vue` 记为 v1 遗留债。**该文件不在本 change 改动面**，修与不修都要留裁定 |
| P-9 | **文档/计数口径不一致**（spec 之外的三处口径漂移） | ① 计数：`notes/validation.md:96`、`tasks.md:3`、"25+4+57" vs 实测 23+4+56（见 §1.3）；② 文本条数：`proposal.md:18` 仍写"10 级 × 每级 10 条（共 100 条）"、`design.md:221` 写"满级也只有 100 条"；③ 字段名：`design.md:136` 仍写 `lastSeen`（spec 已在 `pet-values:77` 更正为 `lastSettledAt`）、`design.md:47-49` 说"只保留 8 个数值/时间字段"但实际列了 9 个 | 已有 | 把 validation/tasks/design 的计数统一为 23+4+56、文本统一 120+8、字段名统一 `lastSettledAt`，并把"8 个"改成"9 个" |
| P-10 | **证据不足：无实机验证**（缺"实机"这一类证据） | 本 change 的 `notes/` 下**没有** `evidence/` 目录（v1 归档有 `notes/evidence/{overlay-feasibility,real-window,real-window-v2}.md`）；以下 4 项只有单测/源码断言：① 设置页 5 行的真实外观与好感 >650 的显示（即 S-1）；② 面板 hover / `.tip` / 白色焦点环的真实渲染；③ "关 = 销毁，CPU 归零"（`specs/pet-settings/spec.md:35-38`）；④ 拖动换位与位置持久化回归 | 缺"实机（真实宿主 + 真窗口）"证据 | 补 `notes/evidence/real-window-v2.md`（至少覆盖设置页一行一插件、面板 hover、关窗 CPU、拖动），或明确裁定"本 change 仅凭单测放行" |
| P-11 | **证据不足：无组件挂载级测试**（缺"组件渲染"这一类证据） | spec `pet-interaction`:26-29「升级后即时更新」只有**分段**断言：`test/timers-v2.test.js:480`（视图 `levelName` 随好感变）+ `test/view-v2.test.js:295`（模板绑定 `state.values.levelName`）；无 jsdom / `@vue/test-utils`（`test/actions-ui.test.js` 文件头已声明本扩展没有它们）。气泡的渲染/淡出同理 | 缺"组件挂载 + 重渲染"证据 | 接受（两段断言已覆盖"入口算对 → 面板绑定对"的链路，Vue 响应式风险极低），或补一个 jsdom 用例 |
| P-12 | **行为级越界 1 处**：卡 06 改了卡 01 的 `lib/constants.js` | `tasks.md:8`（`lib/constants.js` 属卡 01）vs `tasks.md:38`（卡 06 只有 `test/**` + `README.md`）；`notes/dev.md:56`（裁定 R58"交卡 6 删"）、`:68`（卡 06"`lib/constants.js` 只删 4 条死字符串"）；`git diff lib/constants.js` 可见 `petCooling`/`feedCooling`/`playOk`/`sleeping` 四条被删 | 已有 | 在 `tasks.md` 6.1 的验收里补一句"含 `lib/constants.js` 的 4 条死文案删除（R58 授权）"，或把该删除退回卡 01；下次拆卡时直接把"跨卡裁定"写进所有权表 |

---

## 4. 一般建议清单

| # | 建议 |
| --- | --- |
| A-1 | `design.md:210` 说"设置页由宿主渲染（`progress`/`status` 行**自带对齐**）"，但宿主实际是**块级堆叠**（`SettingsView.vue:1381-1386`：`.config-row label { display:block }`），没有"固定宽标签列"。建议把 UI 硬约束 3 的表述改成"由宿主堆叠渲染，扩展零自定义样式"（结论仍是"已遵守"） |
| A-2 | `specs/pet-values/spec.md:77` 括注"非数字 ⇒ 0"，但道具的非数字归一取**初值 3**（`lib/items.js:11-14` 的 `finiteOr(value, fallback)`，fallback = `INITIAL_FISH/INITIAL_BUBBLE`），与 v1 既有 sanitize 口径一致。建议在 spec 里把道具单列一条"缺/非法 ⇒ 初值 3、越界 ⇒ 钳 [0,20]" |
| A-3 | `pet.hunger/clean/mood` 只能做到"manifest 不再声明 + 迁移时置空串"（`lib/constants.js:67-69`、`index.js:243-251`，宿主 `api.settings` 无删除 API）。建议 spec `pet-settings:5` 的"不得残留这三个设置键"补一句宿主限制说明 |
| A-4 | 5 处入口本地字面量（`TEXT_TIMER_ID`/`BUBBLE_TIMER_ID`/`KEY_GROWTH`/`KEY_FAVOR`/`KEY_LEVEL`，`index.js:77-81`）与 `SHARED_COOLING_TEXT`（`lib/interact.js:83`）仍是"用点定义"，`dev.md:56` 已登记为 v2.0.1 可选清理。建议随下次改动并入 `lib/constants.js` 与 `TEXT` 总表（纯位置搬移） |
| A-5 | 过期注释：`app/components/PetBubble.vue:3` 仍写"design D-7：**2.6s** 自动消失"，v2 是 4000ms（`lib/constants.js:170`、`app/lib/state.ts:87`）。顺手改 |
| A-6 | 包内 `.oix` 含**未压缩**的 `index.js` 与 `lib/**`，注释里仍出现 `hunger/clean/mood/sleep/打盹`（共 5 个文件、22 行，逐条列在附录 D.2，全部是"已删除/迁移"说明或迁移键常量）。当前不违反 spec（禁的是用户可见文案/运行逻辑），但若将来加"包内禁止项"门禁，需先区分注释与运行字符串 |
| A-7 | `README.md:82/88` 与 `dev.md:53` 对"等级名在好感行内""精确数字如实显示"的描述与实现不符 —— 修 S-1/P-3 时**必须一起改文档**，否则下一位检查者会再次踩这个坑 |
| A-8 | `lib/mapping.js:213-229` 的 `speed` 乘法在 v2 全表恒为 1（v1 唯一 1.5× 慢放已随打盹删除）。保留可维持帧契约与页面同构（注释已说明理由），属可选简化 |

---

## 5. 门槛复跑原始输出（本次亲手复跑，原文粘贴）

### 5.1 `npm test`（`node --test`）

命令：`cd extensions/pet; npm test`（尾部摘要原文；`✔` 行 284 条、`✖` 行 0 条）

```text
> pet-ext@1.0.0 test
> node --test

✔ 卡05 面板 · **不渲染任何数字**：只透传 values.levelName，没有成长/好感/道具数量 (0.3052ms)
✔ 卡05 面板 · 等级行：var(--font-size-sm) + var(--fg-dim) + 单行省略 (0.0867ms)
✔ 卡05 面板 · 图标白色描边 + 白色 2px 焦点环 + .tip 即时显名（Q17/R53 基线） (0.2192ms)
✔ 卡05 面板 · 只用宿主 token：除图标描边/焦点环的白色外一个自造色值都没有 (0.161ms)
✔ 卡05 接线 · interact() 用 interactDispatch 分流，**不再**用 unwrap 把 ok:false 一律 throw (0.1267ms)
✔ 卡05 接线 · 删掉睡眠分支与 1.5× 慢放：App.vue / state.ts / anim.ts 里不存在睡眠实现 (0.2886ms)
✔ 卡05 动画 · PetStatus 只剩 8 个（无 hungry/dirty/sad/sleep）、七条表演轨与入口同值 (0.2646ms)
✔ 卡05 动画 · 集合按 v2 收敛：TRANSIENT_SET 七项、KIND_TO_STATUS 三种、label 反查无睡眠/属性态 (0.194ms)
✔ 卡05 播完回落 · anim.self 的本轮标记仍把"自发一轮"折回 idle（不看状态字符串） (0.1483ms)
✔ 卡05 播完回落 · App.vue 仍按 anim.self 折回并用 burstFallbackMs 挂兜底定时器 (0.105ms)
✔ 卡05 style.css · 透明底保留、只用宿主 token、白色不在这里出现 (0.1121ms)
✔ pet-window · 激活即自动创建：D-1 全参数（220×460 右下角透明置顶不占任务栏，URL 由 import.meta.url 推导） (3.7264ms)
✔ pet-window · visible 关 ⇒ 调 api.overlay.destroy（不是 setMouseThrough、不是隐藏） (1.1524ms)
✔ pet-window · visible 开 ⇒ 重新 create 且状态连续（不重置、不读档回旧值） (1.4347ms)
✔ pet-window · 停用 cleanup ⇒ overlay 销毁 + pet-tick 清理 + pending 订阅丢弃 + 处理器/订阅释放 (0.6184ms)
✔ pet-window · 创建失败 ⇒ 状态栏 + 诊断位"宠物窗体创建失败：<原因>"，不抛出，toggle 可重试 (0.7919ms)
✔ pet-window · 关窗即停时钟：销毁后五只定时器全清，且两个累积基准被推到关窗时刻（关窗不计成长/挂机） (0.7121ms)
✔ pet-window · 重复激活（停用后再启用）：先 cleanup 再注册，无双份 timer/窗体（D-8） (0.9867ms)
✔ pet-window · 读档期间停用（init 竞态）：disposed 短路 ⇒ 窗体不建、时钟不起、消息面释放 (1.0063ms)
✔ pet-window · create 进行中停用：刚建成的窗体被 disposed 护栏回收（destroy 幂等，双保险） (0.7239ms)
✔ pet-window · pet.hit ⇒ setMouseThrough(!inside)：命中关穿透、移出恢复、去重不刷 IPC (0.6983ms)
✔ pet-window · 长时间无交互仍活跃：两小时没互动也是 idle（无打盹），pet.hit 不改变状态 (0.6475ms)
ℹ tests 284
ℹ suites 0
ℹ pass 284
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 352.6837
```

**结论：284 / 284 pass / 0 fail。**（与 `dev.md:76` 的"284/284/0（310ms）"一致；耗时 352.68ms vs 310ms 属机器噪声，非缺陷。）

### 5.2 `npm run build`（**先清 `dist/`**）

命令：`Remove-Item -Recurse -Force dist` → `npm run build`

```text
dist removed

> pet-ext@1.0.0 build
> vite build

vite v7.3.7 building client environment for production...
transforming...
✓ 26 modules transformed.
rendering chunks...
computing gzip size...
../dist/index.html                  0.68 kB │ gzip:  0.54 kB
../dist/assets/index-Bsxlc5_3.css   4.62 kB │ gzip:  1.28 kB
../dist/assets/index-C6rUe7Zg.js   91.61 kB │ gzip: 36.17 kB
✓ built in 523ms
```

**结论：成功**；26 modules、文件名与体积与 `dev.md:77` **逐字一致**。

### 5.3 `vue-tsc --noEmit`

命令：`node <ROOT>\node_modules\vue-tsc\bin\vue-tsc.js --noEmit -p tsconfig.json`（捕捉 stdout+stderr 后回显）

```text
EXIT=0
OUTLEN=0
<no stdout/stderr>
```

**结论：exit 0、零输出（0 error）。**

### 5.4 `npm run pack`

```text
> pet-ext@1.0.0 pack
> npm run build && node scripts/pack.mjs

> pet-ext@1.0.0 build
> vite build

vite v7.3.7 building client environment for production...
transforming...
✓ 26 modules transformed.
rendering chunks...
computing gzip size...
../dist/index.html                  0.68 kB │ gzip:  0.54 kB
../dist/assets/index-Bsxlc5_3.css   4.62 kB │ gzip:  1.28 kB
../dist/assets/index-C6rUe7Zg.js   91.61 kB │ gzip: 36.17 kB
✓ built in 457ms
[pack] 已打包 C:\Users\chenzhi\Documents\workspace\web\obox\extensions\pet\out\pet-2.0.0.oix（18 个条目，1661403 B）
[pack] 回读校验通过：18 个条目，解压总量 1814025 B，包文件 1661403 B
  manifest.json (994 B)
  index.js (68771 B)
  dist/assets/index-Bsxlc5_3.css (4622 B)
  dist/assets/index-C6rUe7Zg.js (91605 B)
  dist/index.html (683 B)
  assets/whale/LICENSE (1521 B)
  assets/whale/pet.json (838 B)
  assets/whale/PROVENANCE.md (14005 B)
  assets/whale/spritesheet.webp (1544154 B)
  lib/bridge.js (7074 B)
  lib/constants.js (19204 B)
  lib/growth.js (7292 B)
  lib/interact.js (8739 B)
  lib/items.js (1326 B)
  lib/mapping.js (12828 B)
  lib/persist.js (10962 B)
  lib/settle.js (8724 B)
  lib/texts.js (10683 B)
```

附加复现性证据：

```text
SHA256=DB8CE04D8E3E1008211A64FD7D973970979AF04593561AC196ECDE786C3F975C
SIZE=1661403
```

**结论：成功**；18 条目 / 1,661,403 B / SHA-256 前缀 `DB8CE04D8E3E1008` 与 `dev.md:81` **逐字一致**（构建可复现）；`lib/vitals.js` 已不在包内。

### 5.5 产物 grep（`dist/**`，禁止项按词边界）

命令：读 `dist/{index.html, assets/*.css, assets/*.js}` 全文（96131 字符）做正则计数。

```text
FILES: dist\index.html, dist\assets\index-Bsxlc5_3.css, dist\assets\index-C6rUe7Zg.js
TEXTLEN=96131
hunger             0
clean              0
mood               0
sleep              0
打盹                 0
playOk             0
feedCooling        0
2600               0
38bdf8             0
7dd3fc             0
linear-gradient    0
backdrop-filter    0
```

原始子串计数（非词边界，用于对照已知裁定 ②）：

```text
--- 原始子串计数（非词边界，供对照裁定②）---
clean        7
cleanups     4
sleep        0
hunger       0
mood         0
玩耍           1
petCooling   2
```

必需项：

```text
--- 必需项 ---
<svg               3
stroke:#fff        1
.tip               3
levelName          5
喂食                 2
洗澡                 2
var(--bg-panel)    2
```

**结论：禁止项按词边界全 0；必需项全部命中，计数与 `dev.md:78-79` 逐项相同。** 两个已知裁定均已核实、**不重复报**：① `petCooling` 2 次是 `app/lib/state.ts` 的页面兜底键（裁定 A：入口侧零引用）；② `clean` 原始 7 次 = `cleanups` 4 + `cleanup` 3（Vue 运行时），`玩耍` 1 次是 `app/lib/anim.ts:163` 的动画中文 label 反查表（`playing` 轨按 spec 保留）。

### 5.6 与 dev 回执的差异（显式指明）

| 门槛 | 回执（`notes/dev.md:74-82`） | 本次复跑 | 是否一致 |
| --- | --- | --- | --- |
| `npm test` | 284/284/0（310ms） | 284/284/0（352.68ms） | ✅（耗时差属噪声） |
| `npm run build` | 26 modules、`index-Bsxlc5_3.css` 4.62 kB、`index-C6rUe7Zg.js` 91.61 kB | 同上，逐字一致 | ✅ |
| 产物禁止项 | 全 0 | 全 0（词边界） | ✅ |
| 产物必需项 | `<svg`=3、`stroke:#fff`=1、`.tip`=3、`levelName`=5、`喂食`=2、`洗澡`=2、`var(--bg-panel)`=2 | 完全相同 | ✅ |
| `vue-tsc --noEmit` | 0 error | exit 0 / 零输出 | ✅ |
| `npm run pack` | 18 条目 / 1,661,403 B / SHA-256 `DB8CE04D8E3E1008…` | 同 | ✅ |
| 提交状态 | 无暂存、HEAD `99e4307`、提交数 7 | 同 | ✅ |
| **回执中的实质性描述** | `dev.md:53` + `README.md:88`："好感超过 650 时进度条满格而**精确数字与等级名如实显示**" | **不成立**：宿主把 `{cur}` 钳到 `[0,max]`（`SettingsView.vue:685-687`），`favor=651` 显示为 `650/650`；等级名在**另一行**而非好感行 | ❌ **唯一的实质性不符 → 已升级为 S-1** |

> 说明：`test/timers-v2.test.js:472` 的用例名是"数字**如实写**"（写入口径，成立），而回执/README 把它写成了"如实**显示**"（渲染口径，不成立）——差别就在这一处，是本步最强的一条证据。

---

## 6. 未决项（交用户/上一环节裁定）

| # | 未决内容 | 建议决策者 | 是否阻断 ship |
| --- | --- | --- | --- |
| U-1 | **S-1**：好感 >650 的精确值如何展示（新增 `status` 行 / 把 `favor` 改 `status` / 改 spec 取消该 scenario） | 用户（改 UI 还是改规格） | **阻断**（当前与 spec 直接冲突） |
| U-2 | 设置页行集合口径：维持 5 行（改 spec）还是压回 4 行（把等级名并入某行） | 用户 | 不阻断（与 U-1 同批改） |
| U-3 | `pet-interaction` R5 的"冷却文本 6 条"改成 8（推荐）还是把 `texts.md` 收回 6 条 | 用户 | 不阻断 |
| U-4 | `lastSettledAt`：改 spec（推荐）还是实现补一个死字段 | 用户 | 不阻断 |
| U-5 | "损坏字段归一"是否必须写诊断（P-2） | 用户 | 不阻断 |
| U-6 | `playing`/「玩耍」的口径（`pet-interaction` R1 vs `pet-sprites` R1） | 用户（涉及已裁定 Q8） | 不阻断 |
| U-7 | **是否接受带着未验证项继续**（P-10 无实机 / P-11 无组件级测试 / P-7 manifest 无自动校验） | 用户（本步门禁必须单独问一次） | 由用户裁定 |
| U-8 | 卡 06 改 `lib/constants.js` 的越界记账（补 tasks.md 还是退回卡 01） | 用户/流程 | 不阻断 |
| U-9 | 上游计数口径（25+4+57 vs 实际 23+4+56）在 validation/tasks/design 里的更正 | 上一环节（本步只读，未改） | 不阻断 |

---

## 附录 A · spec delta 逐条判定（23 条 ADDED + 4 条 REMOVED + 56 scenario，行号均为 spec 文件内行号）

判定口径：`有实现且有测试`＝有运行代码落点 **且** 有本仓自动化断言；`有实现无测试`＝有落点但无断言；`实现与需求不一致`＝与 spec 字面冲突；`无实现`＝不存在。**无一条跳过。**

### A.1 pet-values（4 requirement / 14 scenario）

| 条目 | 行 | 判定 | 实现证据 | 测试证据 |
| --- | --- | --- | --- | --- |
| R1 成长值只增不减 / 两个来源 / 关窗不计 | 3 | 有实现且有测试 | `lib/growth.js:99-127`、`lib/interact.js:175`、`lib/settle.js:146-150`、`index.js:806-814` | `test/values.test.js:116/137/143/153/167/175/203`、`test/settle.test.js:43/62/68/76/94`、`test/timers-v2.test.js:222/240`、`test/window.test.js:166` |
| S 互动使成长 +1 | 7 | 有实现且有测试 | `lib/interact.js:175` | `test/interaction-v2.test.js:180`、`test/economy.test.js:96` |
| S 连续运行满一小时 +1 | 12 | 有实现且有测试 | `lib/growth.js:111-126` | `test/values.test.js:116`、`test/settle.test.js:43` |
| S 重开时按离线时长补算（≤24h） | 17 | 有实现且有测试 | `lib/growth.js:112-124` | `test/values.test.js:143`、`test/persist.test.js:202` |
| S 成长值不驱动任何功能 | 22 | 有实现且有测试 | `lib/growth.js:6-8`（无 growth→等级映射）、`lib/growth.js:66-73`（只用 favor）、`lib/texts.js:241`（按 level） | `test/values.test.js:508/526`、`test/texts.test.js:189` |
| S 关闭显示期间不涨 | 27 | 有实现且有测试 | `lib/settle.js:146-150/171-173`、`index.js:806-814` | `test/timers-v2.test.js:240`、`test/window.test.js:166`、`test/values.test.js:175/203` |
| R2 好感只增无上限 / 两个来源 | 32 | 有实现且有测试 | `lib/interact.js:149/176`、`lib/growth.js:49-51` | `test/values.test.js:242`、`test/interaction-v2.test.js:180/202/219` |
| S 喂食/洗澡增加好感 | 36 | 有实现且有测试 | `lib/interact.js:176` | `test/interaction-v2.test.js:180/202` |
| S 点击增加好感（冷却已过） | 41 | 有实现且有测试 | `lib/interact.js:143-154` | `test/interaction-v2.test.js:219` |
| S 点击冷却期内点击 | 46 | 有实现且有测试 | `lib/interact.js:136-142` | `test/interaction-v2.test.js:296`、`test/interact.test.js:96` |
| S 满级后继续累加 | 51 | 有实现且有测试 | `lib/interact.js:176`（无上限）、`lib/growth.js:66-72`（等级封顶） | `test/timers-v2.test.js:472-480`、`test/values.test.js:242` |
| R3 10 级阈值映射 / 单调不减 | 56 | 有实现且有测试 | `lib/constants.js:155-167`、`lib/growth.js:66-73` | `test/values.test.js:50/219/236` |
| S 初始等级 | 60 | 有实现且有测试 | `lib/growth.js:67-72` | `test/values.test.js:219`、`test/settle.test.js:43` |
| S 跨越阈值升级（19→20） | 65 | 有实现且有测试 | `lib/growth.js:69-71` | `test/values.test.js:219` |
| S 不降级 | 70 | 有实现且有测试 | `lib/growth.js:66-73`（favor→level 纯单调）+ 只增保障 | `test/values.test.js:242`、`test/interaction-v2.test.js:148`（拒绝零副作用） |
| R4 v1 存档迁移 / 归一 | 75 | **实现与需求不一致** | `lib/persist.js:113-134/169-189`、`index.js:1092-1100` | 迁移与归一部分：`test/values.test.js:290/311/331/340`、`test/persist.test.js:87`；**缺**"保留 `lastSettledAt`"（P-1）与"记录一条诊断"（P-2） |
| S 从 v1 存档升级 | 79 | 有实现且有测试 | `lib/persist.js:116-133` | `test/values.test.js:290-338`、`test/persist.test.js:87-106` |
| S 损坏字段不阻止启动（**并记录一条诊断**） | 84 | **实现与需求不一致** | 归一：`lib/persist.js:117-128`；诊断：**无**（`index.js:333-363` 只覆盖 position/迁移） | `test/values.test.js:340-370` 只断言归一值，无诊断断言 |

### A.2 pet-interaction（6 requirement / 14 scenario）

| 条目 | 行 | 判定 | 实现证据 | 测试证据 |
| --- | --- | --- | --- | --- |
| R1 面板恰两枚图标 + 删玩耍 | 3 | 有实现且有测试 | `app/components/PetPanel.vue:106-140`、`lib/interact.js:74` | `test/view-v2.test.js:250`、`test/actions-ui.test.js:68`、`test/actions-hidden.test.js:91` |
| S 面板只渲染两枚图标 | 7 | 有实现且有测试 | `app/components/PetPanel.vue:106-140` | `test/view-v2.test.js:250-275`、`test/actions-ui.test.js:68-117` |
| S 旧载荷的玩耍请求被拒绝 | 12 | 有实现且有测试 | `lib/interact.js:130-132`、`index.js:909-913` | `test/interaction-v2.test.js:65`、`test/extension.test.js:260/275`、`test/actions-hidden.test.js:100/140` |
| R2 面板显示当前好感等级名（只读、无数字） | 17 | 有实现且有测试 | `app/components/PetPanel.vue:95-97`、`lib/bridge.js:105/117` | `test/view-v2.test.js:276-297`、`test/actions-ui.test.js:46` |
| S 面板显示等级名 | 21 | 有实现且有测试 | `app/components/PetPanel.vue:95-97` | `test/view-v2.test.js:276`（断言唯一数据出口 `state.values.levelName`）、`:295` |
| S 升级后即时更新 | 26 | 有实现且有测试（**分段/间接**，见 P-11） | `lib/bridge.js:105`（每次 buildView 重算 levelName）、`app/App.vue:968`（透传 `display`） | `test/timers-v2.test.js:480`（视图 levelName 随好感变）+ `test/view-v2.test.js:295`（模板绑定）；无组件挂载级用例 |
| R3 喂食/洗澡 各 +1/+1 + 消耗 1 个 | 31 | 有实现且有测试 | `lib/interact.js:168-181` | `test/interaction-v2.test.js:180/202`、`test/economy.test.js:96` |
| S 喂食成功 | 35 | 有实现且有测试 | `lib/interact.js:168-181` | `test/interaction-v2.test.js:180`、`test/interact.test.js:41` |
| S 洗澡成功 | 40 | 有实现且有测试 | `lib/interact.js:168-181` | `test/interaction-v2.test.js:202`、`test/interact.test.js:57` |
| S 道具不足 | 45 | 有实现且有测试 | `lib/interact.js:164-166`、`lib/constants.js:262/264` | `test/interaction-v2.test.js:123`、`test/economy.test.js:105` |
| R4 共享 10 分钟冷却（持久化） | 50 | 有实现且有测试 | `lib/interact.js:158-160`、`lib/constants.js:139`、`lib/persist.js:152` | `test/interaction-v2.test.js:248/272`、`test/settle.test.js`、`test/interact.test.js:84` |
| S 冷却期内拒绝 | 54 | 有实现且有测试 | `lib/interact.js:158-160` | `test/interaction-v2.test.js:248` |
| S 冷却到期恢复 | 59 | 有实现且有测试 | `lib/interact.js:158`（`>=` 放行） | `test/interaction-v2.test.js:248` |
| S 冷却跨重启有效 | 64 | 有实现且有测试 | `lib/persist.js:152`（落盘）+ `lib/interact.js:94-98` | `test/interaction-v2.test.js:272` |
| R5 点击 1 小时 1 次 + 冷却期动画与冷却文本 | 69 | 有实现且有测试 | `lib/interact.js:136-154`、`lib/texts.js:249-251` | `test/interaction-v2.test.js:219/296`、`test/interact.test.js:96` |
| S 成功点击 | 73 | 有实现且有测试 | `lib/interact.js:143-154` | `test/interaction-v2.test.js:219` |
| S 冷却期内点击 | 78 | 有实现且有测试 | `lib/interact.js:136-142` | `test/interaction-v2.test.js:296`、`test/texts.test.js:209` |
| R6 气泡 4 秒 + 互动反馈优先 | 83 | 有实现且有测试 | `lib/constants.js:170`、`index.js:546-551/589-602/574-579` | `test/timers-v2.test.js:153/310/342`、`test/view-v2.test.js:175` |
| S 气泡 4 秒后消失 | 87 | 有实现且有测试 | `index.js:533-551/589-602` | `test/timers-v2.test.js:153` |
| S 互动打断定时文本（2000ms 处） | 92 | 有实现且有测试 | `index.js:574-579`（无条件替换并重排）、`index.js:627`（占用即丢弃） | `test/timers-v2.test.js:342/310` |

### A.3 pet-favor（4 requirement / 8 scenario）

| 条目 | 行 | 判定 | 实现证据 | 测试证据 |
| --- | --- | --- | --- | --- |
| R1 10 组×12 条 / 1..N 并集 / 均匀 / 相邻去重 | 3 | 有实现且有测试 | `lib/texts.js:23-164/221-243` | `test/texts.test.js:89/153/163/176/189/221/252/266/326` |
| S 第 1 级只能看到第 1 级文本 | 7 | 有实现且有测试 | `lib/texts.js:240-243` | `test/texts.test.js:153` |
| S 高等级可见低等级文本（第 5 级 = 60 条） | 12 | 有实现且有测试 | `lib/texts.js:241` | `test/texts.test.js:163/189` |
| S 相邻去重 | 17 | 有实现且有测试 | `lib/texts.js:224-226` | `test/texts.test.js:221/231/241/252` |
| R2 每 5 分钟一条（节拍独立、占用即丢弃） | 22 | 有实现且有测试 | `lib/constants.js:173`、`index.js:662/623-639` | `test/timers-v2.test.js:125/288/310` |
| S 每 5 分钟一条 | 26 | 有实现且有测试 | `index.js:662` | `test/timers-v2.test.js:288` |
| S 与动作节拍互不干扰 | 31 | 有实现且有测试 | `index.js:658-663`（三只独立 interval） | `test/timers-v2.test.js:125` |
| S 互动占用期间丢弃 | 36 | 有实现且有测试 | `index.js:627`（占用直接 return，不动 `lastTextAt`） | `test/timers-v2.test.js:310` |
| R3 冷却文本独立集合 + 全等级可见 + 去重 | 41 | 有实现且有测试 | `lib/texts.js:167-176/249-251` | `test/texts.test.js:106/209/231` |
| S 第 1 级也能看到冷却文本 | 45 | 有实现且有测试 | `lib/texts.js:249`（与等级无关） | `test/texts.test.js:209` |
| R4 文本硬约束（无数字/时长/旧属性/功能承诺） | 50 | 有实现且有测试 | `lib/texts.js:23-176` | `test/texts.test.js:124/134`（128 条逐条正则，含"正则自证有区分力"） |
| S 文本语料合规 | 54 | 有实现且有测试 | 同上 | `test/texts.test.js:134` |

### A.4 pet-economy（3 requirement / 7 scenario）

| 条目 | 行 | 判定 | 实现证据 | 测试证据 |
| --- | --- | --- | --- | --- |
| R1 0–20 整数库存 / 初始 3/3 | 3 | 有实现且有测试 | `lib/items.js:11-22`、`lib/constants.js:111-115` | `test/economy.test.js:35/41`、`test/values.test.js:372` |
| S 首次安装 | 7 | 有实现且有测试 | `lib/settle.js:49-67` | `test/economy.test.js:35` |
| S 越界归一（25→20 / -2→0） | 12 | 有实现且有测试 | `lib/items.js:11-14` | `test/economy.test.js:41` |
| R2 1200 秒挂机各 +1（上限 20、互动重置） | 17 | 有实现且有测试 | `lib/settle.js:152-173`、`lib/items.js:29-34`、`lib/interact.js:152/179` | `test/economy.test.js:51/63/69`、`test/settle.test.js:105/119` |
| S 挂机一小时 | 21 | 有实现且有测试 | `lib/settle.js:152-170` | `test/economy.test.js:51`、`test/settle.test.js:105` |
| S 互动重置计时 | 26 | 有实现且有测试 | `lib/interact.js:152/179`、`index.js:1035`（拖动结束） | `test/economy.test.js:69` |
| S 上限封顶 | 31 | 有实现且有测试 | `lib/items.js:29-34` | `test/economy.test.js:63`、`test/settle.test.js:119` |
| R3 只在成功时消耗 / 先冷却后库存 | 36 | 有实现且有测试 | `lib/interact.js:157-181` | `test/interaction-v2.test.js:104/123/148`、`test/economy.test.js:96/105` |
| S 成功消耗 | 40 | 有实现且有测试 | `lib/interact.js:174` | `test/economy.test.js:96` |
| S 拒绝不消耗 | 45 | 有实现且有测试 | `lib/interact.js:158-166` | `test/economy.test.js:105`、`test/interaction-v2.test.js:148` |

### A.5 pet-sprites（3 requirement / 7 scenario）

| 条目 | 行 | 判定 | 实现证据 | 测试证据 |
| --- | --- | --- | --- | --- |
| R1 60 秒一轮 / 7 项 / 无副作用 | 3 | 有实现且有测试 | `lib/constants.js:224-226`、`index.js:661/707-724` | `test/actions-trot.test.js:102/122/140/242/307/324/342/376/393/430`、`test/timers-v2.test.js:369` |
| S 一分钟一轮 | 7 | 有实现且有测试 | `index.js:661`（`setInterval 60`） | `test/actions-trot.test.js:102` |
| S 无副作用 | 12 | 有实现且有测试 | `index.js:707-724` | `test/actions-trot.test.js:307/376` |
| S 互动可抢占 | 17 | 有实现且有测试 | `index.js:919-924`（interact 直接改写同一 transient） | `test/actions-trot.test.js:324/342/478` |
| R2 无睡眠状态与表现 | 22 | 有实现且有测试 | `lib/constants.js`（无 `SLEEP_AFTER_MS`）、`lib/mapping.js:12-16/175-181`、`app/lib/anim.ts:8/61-69`（speed 全 1） | `test/values.test.js:85/521`、`test/timers-v2.test.js:412`、`test/window.test.js:261`、`test/actions-trot.test.js:140/287`、`test/view-v2.test.js:381` |
| S 长时间无交互仍活跃 | 26 | 有实现且有测试 | `index.js:690-693`（无睡眠门控） | `test/actions-trot.test.js:287`、`test/window.test.js:261` |
| S 旧睡眠门控不再存在（无 `SLEEP_AFTER_MS`） | 31 | 有实现且有测试 | 源码门禁见左 | `test/values.test.js:85`、`test/timers-v2.test.js:412` |
| R3 播完回落 / 不依赖下一次推送 / 区分来源 | 36 | 有实现且有测试 | `lib/mapping.js:119-125`、`index.js:509-520/481-486`、`lib/bridge.js:97-103` | `test/hotfix-19-transient-expiry.test.js:140/199/236/332`、`test/hotfix-19-self-fallback.test.js:46/65/79` |
| S 互动播完回落 | 40 | 有实现且有测试 | `index.js:509-520` + `armTransientExpiry` | `test/hotfix-19-transient-expiry.test.js:140`、`test/interact.test.js:41` |
| S 自发表演播完回落 | 45 | 有实现且有测试 | `index.js:718-721` + `onTransientExpire` | `test/hotfix-19-self-fallback.test.js:65`、`test/actions-trot.test.js:430` |

### A.6 pet-settings（3 requirement / 6 scenario）

| 条目 | 行 | 判定 | 实现证据 | 测试证据 |
| --- | --- | --- | --- | --- |
| R1 四项齐全 / 三属性行删除 | 3 | **实现与需求不一致** | `manifest.json:16-22`（开关/成长值/好感/等级/诊断，**无** hunger/clean/mood 行 ✓；但"精确好感值"没有独立展示位，level 成了独立行） | 无 manifest 自动测试（P-7）；`test/settings.test.js` 只测设置键写入 |
| S 设置页行集合（4 行、好感行含等级名） | 7 | **实现与需求不一致** | `manifest.json:17-21` + `SettingsView.vue:1168`（5 行，等级名独立） | 无（P-7） |
| S 好感超过进度条上限（数字不被吞掉） | 12 | **实现与需求不一致** | `index.js:230` 写未钳真值，但宿主 `SettingsView.vue:685-687` 钳 `{cur}` ⇒ 显示 `650/650`；无第二行承载精确值 | `test/timers-v2.test.js:472` 只断言写入值 |
| R2 无 description + 只用既有字段类型 | 17 | 有实现无测试 | `manifest.json:17-21`（无 `description`；类型 `boolean/status/progress/status/status` 全在 7 种内） | **无**自动化断言（`test/settings.test.js:18` 明示范围外；`scripts/validate-manifest.mjs` 仅手工） |
| S 无描述 | 21 | 有实现无测试 | `manifest.json:17-21` | 无（P-7） |
| S 只用既有类型 | 26 | 有实现无测试 | `manifest.json:17-21` | 无（P-7） |
| R3 关 = 销毁 / 开 = 重建且连续 | 31 | 有实现且有测试 | `index.js:727-822`（destroy / create + 位置与数值连续） | `test/window.test.js:46/67/84/166` |
| S 关闭销毁 | 35 | 有实现且有测试 | `index.js:795-817`（`api.overlay.destroy`，非隐藏） | `test/window.test.js:67/166` |
| S 开启恢复 | 40 | 有实现且有测试 | `index.js:733-788`（重建 + 存档位置 + 状态连续） | `test/window.test.js:84`、`test/actions-drag.test.js:208` |

### A.7 pet-vitals（4 条 REMOVED，0 scenario）

| 条目 | 行 | 判定 | 实现证据 | 测试证据 |
| --- | --- | --- | --- | --- |
| R 状态机维护三属性 0–100 | 3 | 有实现且有测试（删除已完成；**标题口径问题见 P-6**） | `lib/vitals.js` 已删除；`lib/persist.js:52/113-134`（只做迁移识别） | `test/values.test.js:108`（模块解析失败）、`:85`（常量已删） |
| R 三属性固定速率衰减 | 7 | 有实现且有测试（同上） | `lib/constants.js` 无 `DECAY_PER_SEC`（`git diff` 可见删除） | `test/values.test.js:85` |
| R 联动 10 点 ⇒ 心情 ±1（上限 95） | 11 | 有实现且有测试（同上） | `lib/constants.js` 无 `LEDGER_STEP/RECOVER_MOOD_CAP`；`lib/interact.js` 无联动 | `test/values.test.js:85`、`test/interaction-v2.test.js:148` |
| R 三属性过低 ⇒ 负面表情（hungry/dirty/sad） | 15 | 有实现且有测试（同上） | `lib/mapping.js:31-40`（`STATUS_TRACK` 无四条状态指示轨） | `test/values.test.js:511`、`test/mapping.test.js:81`、`test/view-v2.test.js:400` |

**附录 A 计数复核**：requirement 新增 4+6+4+3+3+3 = **23**；REMOVED = **4**；scenario 14+14+8+7+7+6 = **56**。判定合计：requirement 有测试 **20** / 无测试 **1** / 不一致 **2** / 无实现 **0**（=23）；REMOVED 有测试 **4**；scenario 有测试 **51** / 无测试 **2** / 不一致 **3** / 无实现 **0** / 跳过 **0**（=56）。

---

## 附录 B · design 决策 D-1..D-10 落点核对

| 决策 | 判定 | 落点证据 |
| --- | --- | --- |
| D-1 状态模型（字段与语义） | 已遵守（字段名/语义一致） | `lib/persist.js:113-134`（`growth/favor/fish/bubble/lastInteractAt/lastPetAt/lastGrowthAt/lastAfkAt/lastTextAt/diagnostic`+`position`）、`lib/persist.js:144-160`（白名单 serialize）、`lib/settle.js:49-67`（initialState）。注：D-1 自述"8 个数值/时间字段"实列 9 个（P-9 ③） |
| D-2 状态机（状态/触发/表现/退出 + `transientSelf`） | 已遵守 | `lib/mapping.js:31-40/64-73/119-125/175-181`、`index.js:718`（自发 `true`）/`:922`（互动 `false`）、`lib/bridge.js:97-103/118`（视图 `anim.self`） |
| D-3 定时器（5 只 / 单一挂摘点 / 两条硬细节） | 已遵守 | `index.js:658-676`（`startClocks`/`stopClocks`）、`:481-486`（transient 到期）、`:546-551`（bubble 4s）、`:658-663`（tick 60 / perf 60 / text 300）；`lib/settle.js:115-119`（销毁推进基准）+ `index.js:810-814`（立刻强制落盘）；`lib/interact.js:152/179` + `index.js:1035`（互动/拖动重置 `lastAfkAt`） |
| D-4 冷却判定（冷却→库存→结算 + 边界） | 已遵守 | `lib/interact.js:123-181`（顺序固定）、`:94-98`（`msSince` 非法/未来/回拨一律 `Infinity`＝已到期）、`lib/persist.js:81-85` |
| D-5 等级映射与取样（阈值表 / 并集 / 均匀 / 去重） | 已遵守 | `lib/constants.js:155-167`、`lib/growth.js:66-73`、`lib/texts.js:221-243` |
| D-6 气泡优先级与丢弃策略 | 已遵守 | `index.js:564-579`（无条件替换 + 重排 4000ms）、`:623-639`（占用即丢弃、不排队、不动 `lastTextAt`）、`:559-562`（`bubbleActive` 与视图同口径） |
| D-7 存档迁移与归一 | 部分（主要路径已遵守；字段清单有偏差） | 白名单/迁移/归一：`lib/persist.js:113-134/169-189` + `index.js:243-251/1092-1100`；偏差：`lastSettledAt` 未保留（P-1）、D-7 仍写 `lastSeen`（P-9 ③） |
| D-8 面板与数值展示（两图标 + 一行等级名、无数字） | 已遵守 | `app/components/PetPanel.vue:95-97`（等级名）、`:106-140`（两图标，零数字）；`app/lib/state.ts:168`（`levelName` 缺失降级空串）；`lib/bridge.js:105/117` |
| D-9 错误与空态（中文可执行文案） | 已遵守（条数口径有笔误） | `lib/constants.js:262/264`（无道具）、`lib/interact.js:83`（共享冷却逐字）、`lib/texts.js:167-176`（点击冷却 8 条）、`index.js:169-201`（诊断位）、`manifest.json:21`（诊断行）；D-9 仍写"6 条"（P-4） |
| D-10 取消打盹的连带清理 | 已遵守 | `lib/constants.js`（无 `SLEEP_AFTER_MS`、无 `TEXT.sleeping`）、`lib/mapping.js:12-16`（`resolveStatus` 只剩两步）、`app/lib/anim.ts:61-69`（`speed` 全 1）、`app/App.vue:415`（打盹提示已删）；测试反向断言见 A.5 |

---

## 附录 C · UI 视觉规范「七条硬约束」逐条判定

| # | 约束 | 判定 | 位置/证据 |
| --- | --- | --- | --- |
| 1 | **零自造色值** | **未遵守**（1 个文件） | 遵守：`app/components/PetPanel.vue:253/307/337`（仅白色，2 处语义：描边/焦点环）、`app/App.vue:1011`（焦点环白色）、`app/style.css`（零色值）。**违反**：`app/components/PetBubble.vue:27/39/40/45/46/47`（`#0f172a`、`rgba(244,114,182,.92)`、`rgba(15,23,42,.9)`、`rgba(125,211,252,.5)`、`#e2e8f0`）→ P-8（该文件不在本 change 改动面） |
| 2 | **只用宿主 token** | **部分遵守** | 遵守：`PetPanel.vue` 用到 `--bg-panel/--fg/--fg-dim/--fg-bright/--border/--hover-bg/--font-size-sm`（`:168-275`）、`style.css:35-37`（`--font-size`/`--fg`）。违反：`PetBubble.vue:28`（`font-size: 12px` 硬编码，未用 `var(--font-size-sm)`）→ P-8 |
| 3 | 标签列固定宽、左对齐 | 已遵守（由宿主渲染，扩展零自定义） | `manifest.json:16-22` 只声明字段、扩展无设置页 CSS。**注**：宿主实际是**块级堆叠**（`SettingsView.vue:1381-1386`），不是"固定宽标签列"，`design.md:210` 的措辞不准 → A-1 |
| 4 | 窄窗堆叠 | 已遵守 | 面板宽 200px（`PetPanel.vue:163`）在 220px 窗体内（`lib/constants.js:24`）；互动区一行 flex（`:206-210`）；等级名单行省略（`:182-199`）；气泡 `max-width: min(200px, 100vw-20px)`（`PetBubble.vue:24`）；`style.css:29` 禁滚动条 |
| 5 | 下拉说明写在选项内 | 已遵守（本轮无下拉） | `manifest.json:16-22` 无 `type: select`；`design.md:212` 已声明"本轮无下拉字段" |
| 6 | 模态框只能按钮关闭 | 已遵守（本轮无模态） | 无 `modal: true` 字段（`manifest.json`）；`PetPanel` 是窗体内浮层而非模态（`PetPanel.vue:38-39`）；`App.vue` 无遮罩 |
| 7 | 中文文案 | 已遵守 | `lib/constants.js:255-302`（`TEXT` 全中文）、`app/lib/state.ts:90-119`（页面文案全中文）、`manifest.json`（label 全中文）；另有硬规则测试 `test/actions-text.test.js:88/106`（无数字+时间单位） |

---

## 附录 D · 越界核对（实际改动 vs 6 张任务卡所有权）

### D.1 改动文件 → 所有权归属（`git status --porcelain=v1` 全 41 项 = 34 已跟踪 + 7 新增）

| 文件 | 归属卡（`tasks.md`） | 结论 |
| --- | --- | --- |
| `lib/constants.js` | 卡 01（`:8`） | ⚠️ 卡 06 也改过（删 4 条死文案）→ **P-12**（R58 已记录，任务卡未同步） |
| `lib/growth.js`、`lib/persist.js`、`lib/settle.js`、`lib/mapping.js` | 卡 01 | ✅ 所有权内 |
| `lib/vitals.js`（删除） | 卡 01 | ✅ 所有权内（"删除 `lib/vitals.js`"） |
| `lib/items.js` | 卡 01（**仅第 8 行 import**，裁定 R57） | ✅ `git diff -U0 lib/items.js` 只有 `./vitals.js` → `./growth.js` 一行 |
| `lib/texts.js`（新增） | 卡 02 | ✅ |
| `lib/interact.js` | 卡 03 | ✅ |
| `index.js`、`manifest.json`、`lib/bridge.js` | 卡 04 | ✅ |
| `app/App.vue`、`app/lib/state.ts`、`app/lib/anim.ts`、`app/components/PetPanel.vue`、`app/style.css` | 卡 05 | ✅ |
| `README.md` | 卡 06 | ✅ |
| `test/actions-*.test.js`（5）、`test/bridge/economy/extension/interact/mapping/persist/settings/settle/window.test.js`、`test/hotfix-19-*.test.js`（2） | 卡 06（`test/**` 除 5 个新文件） | ✅ |
| `test/growth.test.js`（删除） | 卡 06 | ✅ |
| `test/values.test.js`、`test/texts.test.js`、`test/interaction-v2.test.js`、`test/timers-v2.test.js`、`test/view-v2.test.js`（新增） | 卡 01/02/03/04/05 各自新建 | ✅ |
| `openspec/changes/pet-v2-growth-favor/**`（新增，含本文件） | —（规格产物，非代码） | ✅ 属本 change |
| 未改动（应保持）：`app/lib/{bridge,burst,frameClock,panel,sprites}.ts`、`app/components/PetBubble.vue`、`app/main.ts`、`assets/**`、`test/helpers/mock-api.js`、`package.json`、`vite.config.ts`、`tsconfig.json`、`scripts/pack.mjs` | — | ✅ 均无改动（`git status` 未列） |

**文件级越界：0 处。** 行为级越界：1 处（P-12）。经授权的跨文件改动：1 处（`lib/items.js` 第 8 行，R57）。

### D.2 卡 01 验收 ③ 要求逐条列明的 `hunger|clean|mood`（+`sleep`/`打盹`）残留命中

命令：`Select-String -Path lib\*.js,index.js -Pattern '\b(hunger|clean|mood|sleep)\b|打盹'`（**全部为注释说明或迁移键常量，无运行期文案/逻辑**）：

```text
bridge.js:72:  * - **v1 的 `vitals:{hunger,clean,mood}` 已删除**（specs/pet-vitals 的 4 条 REMOVED / design D-10）：
bridge.js:77:  *   v1 的 `sleep`/`hungry`/`dirty`/`sad` 与打盹的 1.5× 慢放一并已删除，design D-10）。
constants.js:67: export const KEY_HUNGER = 'pet.hunger'
constants.js:68: export const KEY_CLEAN = 'pet.clean'
constants.js:69: export const KEY_MOOD = 'pet.mood'
constants.js:217: *   **v2 起没有"不得参与随机"的黑名单了**：v1 的 `hungry`/`dirty`/`sad`/`sleep` 四条状态指示轨随
mapping.js:13:  * 与 `sleep`（连续 10 分钟无交互的打盹）——三属性体系整体移除（specs/pet-vitals 的 4 条 REMOVED）、
mapping.js:14:  * 打盹连同它的 1.5× 慢放一并撤销（design D-10）。于是 `resolveStatus` 只剩两个来源：
mapping.js:29:  * 保留的键**只有这七个**（v1 的 `hungry`/`dirty`/`sad`/`sleep` 已删；`test/values.test.js` 钉住）。
mapping.js:57:  * v2 起表里**没有属性轨**了（hungry/dirty/sad/sleep 随三属性与打盹一并删除），`playing` 与 `trot`
mapping.js:168: * **v2 只剩这两步**：v1 的第 2/3 步（属性阈值 ⇒ hungry/dirty/sad、连续 10 分钟无交互 ⇒ sleep）
mapping.js:214: *   是打盹的慢放，已随 design D-10 删除；保留乘法是为了不破坏帧契约与页面侧的同名实现）。
persist.js:17:  * `hunger` / `clean` / `mood`（三属性）以及 v1 的联动/挂机流水账
persist.js:29:  * | `hunger` / `clean` / `mood` | 丢弃，且 `serialize` 不再写回 ⇒ `JSON.stringify(state)` 里查不到这三个键 |
persist.js:50:  * 单独抽成常量而不是散在代码里：grep `hunger|clean|mood` 时这套键名是唯一合法命中点之一。
persist.js:52: const LEGACY_VITAL_KEYS = ['hunger', 'clean', 'mood']
persist.js:142:  * **三属性字段不在白名单里**——这是"迁移后再也查不到 hunger/clean/mood"的最终保证。
index.js:74:  * `pet.hunger` / `pet.clean` / `pet.mood` 三个**旧**键仍从 `constants.js` 引入（只用于迁移清理，
index.js:690:  * **v2 起没有「打盹时跳过」这条门控了**：打盹机制已删除（design D-10 / specs/pet-sprites 的
index.js:852:  * **v1 的 `noteInteraction` 已删除**（悬停/拖动刷新 `lastInteractAt` 的那一段，连同它服务的打盹计时已删除）。
index.js:960:  // v1 这里还有一次 `noteInteraction`（悬停算交互）：该函数与打盹机制一并已删除，
index.js:1097:  // 下次启动读到的还是带 hunger/clean/mood 的旧文件 ⇒ `migratedFromV1` 又为真、诊断再写一遍，
```

> `constants.js:67-69` 的 `KEY_HUNGER/KEY_CLEAN/KEY_MOOD` 是**活代码**（迁移清理用，裁定 R58 保留）；其余 19 行均为说明性注释。产物侧（`dist/**`）按词边界 **0 命中**（§5.5），用户可见面干净。

---

## 第 2 轮复验（S-1 关闭，2026-10-17）

**用户裁定**：S-1 走 **立即修复（回 dev）**。修复卡 `notes/tasks/07-fix-favor-exact.md`，实现方回执见 `notes/dev.md` 的「修复轮 R-S1」。

### S-1 闭环（三处对齐 + 我补的两处口径）

| 落点 | 状态 | 证据 |
| --- | --- | --- |
| `manifest.json` | ✅ 6 字段，新增 `pet.favorExact`（`status`，label「好感（精确值）」，无 description） | `node -e` 读取：字段数 6、`favorExact` 存在且类型 status |
| `index.js` 的 `syncValueSettings` | ✅ 写 `String(state.favor)`（**不钳**） | `git grep KEY_FAVOR_EXACT` = 2 处（常量定义 + 写入） |
| 测试 | ✅ 新增 2 条：`favor` 0/650/651/99999 ⇒ `pet.favorExact` = `"0"/"650"/"651"/"99999"`；manifest 契约（6 字段、无 description、类型合法、顺序） | `npm test` 286/286，两条新用例逐条列在回执 |
| `specs/pet-settings/spec.md` | ✅ **本步由父代理修正**：Requirement 标题与正文改为"6 字段 / 5 逻辑行"，并把**键名 `pet.favorExact` 写进 requirement**（首轮只写了"精确值行"未给键名），scenario「好感超过进度条上限」改为"进度条满格 + 精确值行显示 651" | 修正后 `favorExact` 在 spec 中可检出 |
| `test/settings.test.js` 头注释 | ✅ **本步由父代理修正**：原写"精确数字由 `pet.level` 行旁展示"（与事实相反）⇒ 改为"`pet.favor` 写数字真值、宿主钳制；`pet.favorExact` 写字符串真值" | 残留检查 0 处 |
| `README.md` / `notes/dev.md` | ✅ 修复卡已按事实改措辞（进度条按 650 封顶、精确值单独一行） | 回执 §一 |

### 第 2 轮门槛（父代理亲手复跑）

```text
npm test      : tests 286 / pass 286 / fail 0   (exit 0)
npm run build : exit 0（清 dist 后重建，26 modules）
vue-tsc       : exit 0，零输出
npm run pack  : out/pet-2.0.0.oix 1,661,747 B（18 条目，回读自检通过）
                SHA-256 = DF05BC9739D66D2361F3C07842AA7ACDABA611843FDFBAA5F080CFFDBE5F83C2
产物禁止项（词边界）: \bhunger=0 \bclean=0 \bmood=0 \bsleep=0 打盹=0
git          : HEAD 99e4307、暂存 0 项、提交数 7（未被提交，符合 dev 边界）
```

### 第 2 轮三档

| 档位 | 计数 | 说明 |
| --- | --- | --- |
| 严重 | **0** | S-1 已关闭（实现 + spec + 测试三处对齐） |
| 普通 | 12 | 首轮 12 条**全部保留登记**：P-1/P-2/P-3（口径与计数笔误，已随本轮 spec 修正顺带解决）｜P-4/P-5（spec 内部两处措辞冲突：冷却文本 6 vs 8 条、`playing` 轨与"玩耍状态条目删除"的措辞）｜P-6（`pet-vitals` 的 4 条 REMOVED 标题与 v1 归档不逐字对应；v1 另有 2 条与本 change 未处置的 `pet-growth` capability）｜P-7/P-10/P-11（**证据不足**：manifest 无自动化校验→已由 R-S1 的 manifest 契约测试部分补上；无实机验证；无组件挂载级测试）｜P-8（`PetBubble.vue` 有 5 处写死色值，不在改动面）｜P-9/P-12（tasks.md 未同步 R58 的跨卡改动） |
| 一般建议 | 8 | 全部登记，不外理 |

### 第 2 轮未决项

| # | 内容 | 谁回答 | 阻塞 |
| --- | --- | --- | --- |
| 1 | P-4/P-5 两处 spec 措辞冲突是否在本轮统一（冷却文本统一为 8 条；`playing` 轨说明改为"保留为随机表演轨、仅删除互动 kind"） | 用户（门禁一并问） | 不阻塞发版（实现已按裁定一致） |
| 2 | P-6：`pet-vitals` 的 REMOVED 标题是否要与归档逐字对齐、以及 v1 `pet-growth` capability 的处置 | 用户 | 不阻塞发版（归档合并时一并处理） |
| 3 | 证据不足三项（无实机验证 / 无组件挂载测试 / manifest 校验已部分补上） | 用户（门禁单独问） | 不阻塞 |

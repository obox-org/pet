# check — 桌面宠物扩展 `pet`（第 8 步 · 只读验收）

> 本步**不改任何代码/测试/规格**。结论分三档：**严重**（阻塞交付）/ **普通**（应处置或登记）/ **一般建议**（可选）。
> 场景：用户已实机把玩并裁定"没有什么问题，可以提交定版"，本文件是定版前的最后留痕。

## 0. 结论摘要

| 项 | 结果 |
| --- | --- |
| spec delta 逐条核对 | **24 requirement / 51 scenario 全部有实现与测试**（逐条见 §1；无"跳过不适用"条目） |
| design 决策与 UI 规范核对 | **D-1…D-16 全部有落点**；UI 规范 5 条硬约束逐条核对（1 条为**登记豁免**：宠物窗体是 artwork 覆盖层、不接主题 token，见 §2） |
| 越界改动 | **无**（宿主 24 行 = 卡 02/03/04/05/14 的所有权文件；扩展 85 个文件 = 卡 06/07/08/09/10/12/15/17/18 的所有权文件） |
| 门槛复跑（父代理亲手） | 宿主 typecheck **0** / lint **0 error**（4 条既有 warning）/ test **793 passed + 5 skipped**；扩展 test **170 passed**；扩展 build 成功、产物 js+css 双 grep 全过；`npm run pack` 18 条目回读自检通过 |
| 严重问题 | **0 条** |
| 普通问题 | **3 条**（O-1 面板闪关观察项；N13/N14 实机复验进行中；R10 既有 prettier warning） |
| 一般建议 | **3 条**（R22 JSDoc 错位；上游文案漂移不自动跟随；`run-left/right` 可在实机观感不佳时移除） |

## 1. spec delta 逐条核对（24 requirement / 51 scenario）

| # | capability | requirement（缩写） | 实现落点 | 测试/证据 |
| --- | --- | --- | --- | --- |
| 1 | pet-window | 后台扩展：MUST NOT 注册卡片、不出现在启动器 | `manifest.json`（contributes 仅 `statusBarItems`+`settings`）；`index.js` 不调 `api.app.register` | `test/extension.test.js`「demo 已删 / 不注册命令·卡片·树视图」 |
| 2 | pet-window | 激活即自动出现在工作区右下角（无边框/透明/置顶/不占任务栏） | `index.js` 的 overlay create（220×460、anchor bottom-right、margin 24） | `test/window.test.js`「激活即自动创建」；**实机**卡 11 §①（(2316,908) 与公式逐项相等） |
| 3 | pet-window | toggle 关 = **销毁**窗体（非隐藏），重开重建且状态不丢 | `index.js` 设置监听 + `api.overlay.destroy` | `test/window.test.js`「visible 关 ⇒ destroy（不是 setMouseThrough、不是隐藏）」；**实机**卡 16 §⑥（CPU 296.9→15.6ms/10s、数值不重置） |
| 4 | pet-window | 不可 resize / 不可最大化 | `index.js` create 参数 | `test/window.test.js`；`test/overlay-window.test.ts`（宿主侧） |
| 5 | pet-window | 拖动移动窗体 + 松手持久化 + 钳工作区 + 与踱步互斥（3 scenario） | `index.js` 的 `pet.drag` 三相位 + `applyPosition`；宿主 `setOverlayPosition`/`clampOverlayPosition` | `test/actions-drag.test.js` 18 条；`test/overlay-window.test.ts`「主进程 · setPosition」11 条；**实机**卡 16 §① 与 8.2 §3（101 行 setPosition、「钳制后(2340,932)」、重启回位） |
| 6 | pet-vitals | 衰减速率与惰性结算（-1/分、-10/时、-5/时） | `lib/settle.js` + `lib/vitals.js` | `test/settle.test.js`、`test/vitals.test.js`（12 条含时间回拨/脏输入） |
| 7 | pet-vitals | 联动（每降/恢复 10 点 ⇒ 心情 ∓1）+ 上限 100 / 恢复途径 95 | `lib/vitals.js` | `test/vitals.test.js`「饥饿联动扣分/联动零头跨周期/恢复联动不超 95」 |
| 8 | pet-vitals | 休眠后补算一次、启动不追算离线 | `lib/settle.js` 的 `startupReset` | `test/settle.test.js`「休眠后补算一次/关闭三天不追算」 |
| 9 | pet-vitals | 脏输入不污染（NaN/字符串/越界） | `lib/vitals.js`/`lib/persist.js` 清洗 | `test/vitals.test.js`、`test/persist.test.js`「字段清洗」 |
| 10 | pet-economy | 挂机 20 分钟 +1 鱼干 +1 泡泡（仅窗体存在时） | `lib/items.js` | `test/economy.test.js`「挂机满 20 分钟/关窗暂停挂机/跨结算连续」 |
| 11 | pet-economy | 库存上限 20、初始 3/3 | `lib/constants.js` + `lib/items.js` | `test/economy.test.js`「库存到顶」；`test/settle.test.js` |
| 12 | pet-economy | 喂食耗鱼干 / 洗澡耗泡泡 / 玩耍不耗；不足则拒绝且不改数值 | `lib/interact.js` | `test/economy.test.js`「无小鱼干/无沐浴泡泡/有道具洗澡/喂食消耗」 |
| 13 | pet-growth | 成长 +2/时、心情每缺 5 点 -0.1/时、不为负 | `lib/growth.js` | `test/growth.test.js`「满心情 +2/心情 80 ⇒ 1.6/心情 0 不扣成负/档位边界」 |
| 14 | pet-growth | 等级四档（0/50/200/500） | `lib/growth.js` | `test/growth.test.js`「等级阈值」 |
| 15 | pet-interaction | 点击 +1 心情、5 分钟至多一次、冷却内仍播反馈 | `lib/interact.js` + `lib/constants.js` | `test/interact.test.js`「冷却内重复点击/冷却到期后点击/上限约束」 |
| 16 | pet-interaction | 面板：指针在宠物**或**面板上显示、其它情况**立刻关闭**；三枚图标同一行、透明底、白线、悬浮即时显名；MUST NOT 显示三属性、MUST NOT 有隐藏入口 | `app/App.vue`（`panelOpen`/`hitBoxes`/`closePanel`）、`app/lib/panel.ts`、`app/components/PetPanel.vue`（`.act`/`.icon`/`.tip`） | `test/actions-ui.test.js`「三枚图标横向一行/禁用态 aria-disabled/浮层即时可见/开合判定纯同步」；**实机** 8.2 §① 与 §3（`top` 全 209.00、`width` 全 54.00、`stroke` 白色、`hasSummon=false`、`vital-row=false`） |
| 17 | pet-interaction | 喂食 +5 / 洗澡 +15 / 玩耍 +5 并播对应动画；受上下限约束 | `lib/interact.js` + `lib/mapping.js` | `test/interact.test.js`「喂食生效/玩耍不耗道具/瞬时互动优先且播完回落」 |
| 18 | pet-interaction | 反馈文案与上游逐字一致（五句）且全量禁「数字+时间单位」「属性增量数字」（2 scenario） | `lib/constants.js`（TEXT 单点）+ `app/lib/state.ts` | `test/actions-text.test.js`（逐字 + 两条正则扫描）；**实机**卡 16 §④、8.2 §3（语料 31 行两正则 0 命中） |
| 19 | pet-settings | toggle 语义（关 ⇒ 销毁、开 ⇒ 创建）与持久化 | `index.js` + `manifest.json` 的 `pet.visible` | `test/settings.test.js`「toggle 语义」；**实机** 8.2 §3 |
| 20 | pet-settings | 三行 `progress`（`{cur}/100`、取整口径、无 description）当帧刷新 | `manifest.json` 的 5 字段 + `index.js` 写设置键；宿主 `SettingsView.vue` 的 progress 分支 | `test/settings.test.js`「三属性写入/结算后立即同步/无变化不刷键」；`test/settings-progress-field.test.ts`（宿主 22 条）；**实机** 8.2 §3（`role=progressbar`+`NN/100`+`desc=null`+同实例 84→89） |
| 21 | pet-settings | 诊断位（只读 `status`）+ 启动成功无条件清空（D-1） | `index.js` 的 `setDiagnostic/resetDiagnostic` + `manifest.json` 的 `pet.diagnostic` | `test/settings.test.js`「诊断位」；`test/actions-hidden.test.js` 的 3 条 D-1 回归；**实机** 8.2 §②（正反向都有证据） |
| 22 | pet-sprites | 图集几何由 `pet.json` 声明、渲染不硬编码 | `app/lib/sprites.ts` + `assets/whale/pet.json` | `test/mapping.test.js`、`test/actions-trot.test.js`「映射契约（真实图集帧数）」 |
| 23 | pet-sprites | 状态→轨映射固定 + 优先级唯一一轨 | `lib/mapping.js` + `app/lib/anim.ts`（两张表逐字同值） | `test/mapping.test.js`「优先级/属性过低优先/十二态 label」 |
| 24 | pet-sprites | 帧动画随窗体销毁停止、重建回 idle 首帧 | `app/lib/frameClock.ts` + `App.vue` | `test/window.test.js`、`test/actions-ui.test.js`「页面不可见就停」；**实机**卡 11 §④（销毁后 CPU 回落） |
| 25 | pet-sprites | **每 10 秒随机表演**（7 项表演集、状态指示轨不参与、`run-left/right` 原地、打盹不播）（4 scenario） | `index.js` 的 `onRandomPerf` + `lib/constants.js`（`RANDOM_PERF_*`）+ `app/App.vue` 的 `syncBurst`/看门狗 | `test/actions-trot.test.js` 15 条（含"随机集恰 7 项且不含 hungry/dirty/sad/sleep"「侧跑轨零 setPosition」「打盹不播」）；**实机** 9.2（进行中） |

> 注：表内 25 行对应 24 条 requirement——`pet-window` 第 5 条把"拖动 + 钳位 + 互斥"算一条（3 scenario），`pet-sprites` 第 25 条即 Q16 新 requirement。逐条计数与 7 份 spec 用脚本复核一致（24 / 51）。

## 2. design 决策与 UI 规范核对

| 决策 | 落点 | 判定 |
| --- | --- | --- |
| D-1 窗体参数与定位（220×460、anchor、margin 24） | `index.js` create | ✅ 已遵守（实机坐标与公式逐项相等） |
| D-2 三属性只在设置页呈现 | `manifest.json` + `PetPanel.vue` 无属性行 | ✅ 已遵守（实机 `vital-row=false`） |
| D-3 通道与 25s 长轮询 < 宿主 60s | `lib/bridge.js` + `lib/constants.js` | ✅ 已遵守（`test/bridge.test.js` 常量关系断言） |
| D-4 状态表/优先级/气泡文案 | `lib/mapping.js` | ✅ 已遵守（`test/mapping.test.js`） |
| D-5 惰性结算与 `startupReset` | `lib/settle.js` | ✅ 已遵守 |
| D-6 无主题的理由（artwork 覆盖层） | design 已登记豁免；`app/style.css` 固定色板、零 token | ✅ **登记豁免**（README 与 design 都写明理由与退场条件） |
| D-7 阈值/上限/经济常量单点 | `lib/constants.js` | ✅ 已遵守 |
| D-8 重复激活先 cleanup | `index.js` | ✅ 已遵守（`test/window.test.js`） |
| D-9 文案表与错误文案 | `lib/constants.js` TEXT | ✅ 已遵守（无数字时间/增量数字） |
| D-10 许可证与出处随附 | `assets/whale/{LICENSE,PROVENANCE.md}` + pack 强制断言 | ✅ 已遵守（`scripts/pack.mjs` 回读断言） |
| D-11 透明五处绘制点 + 平台限制 | 宿主 `appWindow.ts`/`AppWindow.vue`/`main.css`；README 五条限制 | ✅ 已遵守（实机取色差 0） |
| D-12 后台扩展三处可见面、保留 `pet.status` | `manifest.json` | ✅ 已遵守 |
| D-13 拖动：增量通道 + 钳位分工 + end 强制落盘 | `index.js` + 宿主 `setOverlayPosition` | ✅ 已遵守（实机 101 行 setPosition、零标定探测） |
| D-14 每 10 秒随机表演（Q16 版） | `index.js` + `lib/constants.js` + `app/App.vue` | ✅ 已遵守（`test/actions-trot.test.js` 15 条） |
| D-15 隐藏/召唤 → **已撤销**（Q15=B） | 代码与规格均已移除；`design.md` 留撤销说明 | ✅ 已遵守 |
| D-16 文案总表 + 两条正则硬规则 | `lib/constants.js` | ✅ 已遵守（产物与语料双 0 命中） |
| UI 硬约束 1/2「零自造色值 / 只用宿主主题 token」 | — | ⚠️ **登记豁免**：宠物 overlay 是 artwork 覆盖层（design D-6），固定深色玻璃色板、不接主题；**设置页由宿主渲染**故天然跟随主题（豁免理由与退场条件已在 design/README 登记） |
| UI 硬约束 3「标签列固定宽左对齐」 | 面板等级/库存两行采用"标签左、数值右"；设置页沿用宿主规则 | ✅ 已遵守 |
| UI 硬约束 4「窄窗堆叠」 | 窗体固定 220×460，无窄窗场景 | ✅ 不适用（固定尺寸，非响应式布局） |
| UI 硬约束 5「下拉说明写在选项内 / 模态框只能按钮关闭」 | 本扩展无下拉、无模态 | ✅ 不适用（无此控件） |

## 3. 越界核对（改动集合 vs 各卡所有权）

- **宿主仓**（`git status --porcelain` 24 行）：`README.md`、`docs/extension-api/{api-reference,manifest-reference,themes-settings,troubleshooting,guides-user,guides-builtin}.md`、`package.json`、`scripts/validate-manifest.mjs`、`src/api/{types,contributions}.ts`、`src/main/{appWindow,index}.ts`、`src/preload/index.ts`、`src/renderer/src/{AppWindow.vue,assets/main.css,core/host.ts,extensions/settings/SettingsView.vue,main.ts}`、`src/shared/types.ts`、`test/manifest-script-parity.test.ts` + 新增 `test/{host-api-surface,overlay-window,settings-progress-field}.test.ts`。
  **归属**：卡 02（api/shared/preload/host-api-surface）、卡 03（appWindow/main/index/preload/AppWindow/main.css/host.ts/main.ts/overlay-window）、卡 04（SettingsView/validate-manifest/parity/settings-progress-field）、卡 05 + 卡 13 + R26（6 份 docs + README）、卡 14（四方法 + `OverlayResult.position` + api-reference + 两个测试）⇒ **无所有权外文件，无越界行为**。
- **扩展仓**（85 个应跟踪文件）：`manifest.json`、`index.js`、`lib/**`(9)、`app/**`(14，含卡 17 新增 `app/lib/panel.ts`)、`test/**`(17)、`assets/whale/**`(4)、`scripts/pack.mjs`、`package.json`、`package-lock.json`、`.gitignore`、`README.md`、`tsconfig.json`、`vite.config.ts`、`openspec/**`(28)、`docs/spec/**`(1)。
  **归属**：卡 06（assets）、卡 07/12/15/17/18（index/lib/test）、卡 08/12/15/17/18（app）、卡 09（manifest）、卡 10（pack/README/.gitignore/package*）、规格与证据（父代理）⇒ **无越界**。`dist/`、`out/` 为构建产物且已被 `.gitignore` 覆盖，不在提交集合内。

## 4. 门槛复跑原始输出（父代理亲手，非回执转述）

```
=== 宿主（C:\...\obox）===
npm run typecheck → exit=0（0 error）
npm run lint      → exit=0；✖ 4 problems (0 errors, 4 warnings)——4 条全在 test/settings-network-layout.test.ts（本次未触碰该文件）
npm test          → Test Files 56 passed | 2 skipped (58)；Tests 793 passed | 5 skipped (798)；Duration 3.86s；exit=0
                     （stderr 的 [state] persist failed ReferenceError: localStorage is not defined 为 node 环境既有噪音，非失败）

=== 扩展（C:\...\obox\extensions\pet）===
npm test          → ℹ tests 170 / ℹ pass 170 / ℹ fail 0；exit=0
npm run build     → ✓ 25 modules transformed；dist/index.html 0.68 kB + dist/assets/index-DRxxmL2O.css 4.58 kB + dist/assets/index-DZ8id3ZK.js 93.21 kB
产物 grep（js+css 双扫）→ 禁止项全 0：linear-gradient / TROT_MIN_SEC / TROT_MAX_SEC / TROT_TIMER_ID / TROT_MS / trotTimer / trotUntil / pet-trot / currentColor / backdrop-filter / installThemeBridge / var(-- / onclick= / alert( / 挂机 20 分钟 / 还需 / 时间正则 / 裸 +5 +15 / 召唤鲸鱼娘 / isHidden / 隐藏
                    必须出现：#fff(#ffffff) ×6、.tip ×3、rf=10,of=rf*1e3（10 秒常量）、stroke:#fff、#ffffff14、<svg ×4、八句 D-16 文案各 1、喂食/洗澡/玩耍各 2
npm run pack      → [pack] 已打包 out/pet-1.0.0.oix（18 个条目，1637311 B）+ 回读校验通过（解压 1757739 B；9 个 lib 全在）
vue-tsc --noEmit  → exit=0（0 error；宿主 node_modules 只读调用）
```

**与回执的差异**：无。三份回执（卡 14 / 17 / 18）声明的数字与父代理复跑逐字一致；唯一差异是**环境噪音行**（宿主 test 的 `localStorage is not defined` stderr），不影响判定。

## 5. 严重问题

**0 条。**

## 6. 普通问题清单

| # | 问题 | 锚点 | 处置建议 |
| --- | --- | --- | --- |
| **O-1** | Tab 从「✕ 关闭面板」移到精灵时，iframe `window` 触发 `blur`+`focus` 对 ⇒ `onWindowBlur` 走 `closePanel()` ⇒ 面板闪关一次（DOM 移除 t=23ms），再按一次 Tab 由精灵 keydown 重开面板；**净 Tab 顺序不变、不丢站** | `app/App.vue` 的 `onWindowBlur` / `closePanel`；证据 `real-window-v2.md` §Q15 复验 §4 | 卡 16 只记 `activeElement` 看不到该现象 ⇒ **无法判定是否卡 17 引入**。建议：**登记为已知小瑕疵**（键盘用户可见的 1 次闪关，不影响功能与 Tab 可用性）；若要修，改动是"`onWindowBlur` 里区分 iframe 内部焦点迁移"，属独立小改动 ⇒ **不阻塞定版** |
| **N13** | 10 秒随机表演的实机观感（节奏、"原地侧向跑"是否别扭、打盹期确实安静） | 证据 `real-window-v2.md` 的"卡 18 后复验"节（**9.2 进行中**） | 9.2 会给出"`run-left/right` 保留/删除"的明确建议；若建议删除 ⇒ 只需从 `RANDOM_PERF_SET` 删两项 + 同步规格一句（可逆、独立小改动）。**当前判定：证据不足项**，按用户"可以定版"的裁定接受风险登记 |
| **R10** | 宿主 `test/settings-network-layout.test.ts` 4 条 prettier warning（本次未触碰该文件） | 该文件 :34/:35/:36/:44 | **不属于本次改动**；修它会给本次 PR 添一段无关 diff。建议：登记，后续独立 `style:` 提交修（或跟随下次触碰该文件时） |

## 7. 一般建议清单

| # | 建议 | 锚点 |
| --- | --- | --- |
| A-1 | 宿主 `src/renderer/src/core/host.ts:779-780` 两条相邻 JSDoc 错位（`showNotification` 的描述被 `showUiModal` 隔开）；`git show HEAD` 证明为**既有**问题 | `src/renderer/src/core/host.ts` | 下次触碰该文件时顺手调顺序（本次不动，避免无关 diff） |
| A-2 | 上游 dsh-pet 若将来改动 reaction 文案，本扩展**不自动跟随**（文案表在 `lib/constants.js` 单点 + 逐字测试钉住） | `lib/constants.js`、`test/actions-text.test.js` | 已在 README 与 design R12 说明；跟随属新 change |
| A-3 | `run-left`/`run-right` 的"原地侧向跑"是父代理的可逆决策 | `lib/constants.js` 的 `RANDOM_PERF_SET` | 若 9.2 观感建议删除 ⇒ 从集合删两项（同步 spec 一句），或保留作为多样性 |

## 8. 未决项

- **9.2 实机复验**（N13/N14）尚在收尾：证据会追加进 `real-window-v2.md` 的"卡 18 后复验"节；其"`run-left/right` 保留/删除"建议若为删除，属**可逆小改动**，可在定版后随下一次触碰该文件时处理（或立即处理后再提交，由用户定）。
- **用户物理确认**：用户已完成实机把玩并明确"没有什么问题，可以提交定版"⇒ 视为**物理确认通过**（清单见 `real-window-v2.md` §Q15 复验 §5）。
- **官方 `openspec validate --strict` 未运行**（CLI 未安装）⇒ 已在本 change 的各产物中逐次注明；本次仍以脚本计数（24 req / 51 scenario）+ 结构自检替代。

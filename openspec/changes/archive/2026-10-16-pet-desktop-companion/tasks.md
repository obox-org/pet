# Tasks

> change-id：`pet-desktop-companion`｜UID：`UID-20261014232746-桌面宠物属性`
> 卡与文件所有权一一对应，**同一文件只归一张卡**；同组可并行，跨组串行。任务卡详情见 `notes/tasks/<nn>-<slug>.md`。
> 两个仓库：**宿主 obox**（卡 02–05，走 PR + CI 门槛）与**扩展 extensions/pet**（卡 06–10，独立 git 仓库）。

## 1. 组 1 · 前置验证与类型面

**组文件所有权**：`notes/evidence/overlay-feasibility.md`｜宿主 `src/api/types.ts`、`src/api/contributions.ts`、`src/shared/types.ts`、`package.json`（仅 `apiVersion`）、`test/host-api-surface.test.ts`｜扩展 `assets/whale/**`

- [ ] 1.1 用原生 Electron 最小脚本实测透明/穿透/置顶/关窗 CPU，落证据（卡 01）。验证：证据文件四项各有可复核数值；**测量透明度时不开 DevTools**；并用 `transparent:false` 做反向对照。
- [ ] 1.2 宿主类型面：新增 `api.overlay`（`create`/`destroy`/`setMouseThrough`，按扩展 id 限定作用域）、设置字段类型加 `progress`、`apiVersion` 递增（卡 02）。验证：宿主 `npm run typecheck` + `lint` + `npm test` 全绿；新测试断言三方法签名、作用域校验入口、`progress` 的 `max` 默认 100、`apiVersion` 已递增。
- [ ] 1.3 下载上游鲸鱼娘图集与许可证到 `assets/whale/`（卡 06）。验证：`spritesheet.webp` 大小 = 1,544,154 B 且 SHA256 与源一致；`pet.json` 的 `frames` 逐字等于 `[6,8,8,4,5,8,6,6,6]`、9 条 `tracks`；`LICENSE` 首行 `BSD 3-Clause License`；由 `frames`+默认 cell/columns 反算整图 = 1536×1872 与 webp 实际尺寸一致。

## 2. 组 2 · 宿主实现（依赖组 1 的 1.2）

**组文件所有权**：宿主 `src/main/appWindow.ts`、`src/main/index.ts`、`src/renderer/src/AppWindow.vue`、`src/renderer/src/assets/main.css`、`src/renderer/src/core/host.ts`、`test/overlay-window.test.ts`｜`src/renderer/src/extensions/settings/SettingsView.vue`、`scripts/validate-manifest.mjs`、`test/manifest-script-parity.test.ts`、`test/settings-progress-field.test.ts`

- [ ] 2.1 overlay 窗体主进程与外壳：创建/销毁/穿透 + **五处透明改动**（`appWindow.ts:72` 背景、`AppWindow.vue:202` TitleBar、`:228`/`:233` 两处 `var(--bg)`、`:239` iframe 白底、`main.css:44-47` 全局 body 背景）（卡 03）。验证：宿主三门槛全绿；新测试覆盖参数映射、右下角坐标公式、`destroy` 清理、`setMouseThrough` 调用、跨扩展越权被拒、overlay 模式不渲染 TitleBar；**既有 App 卡片窗口回归测试全绿**。
- [ ] 2.2 设置页 `progress` 字段全链 + manifest 校验白名单同步（卡 04）。验证：宿主三门槛全绿；新测试断言只渲染条与 `{cur}/{max}`（无 input/select/button）、`description` 不显示、`cur=99.9` 显示 `99/100` 而条宽 ≈99.9%、越界钳 `[0,100]`、写后当帧刷新、`validate-manifest.mjs` 接受 `progress` 且仍拒未知类型、差分门禁通过。

## 3. 组 3 · 文档同步与扩展主体（依赖组 2）

**组文件所有权**：宿主 `docs/extension-api/{api-reference,manifest-reference,themes-settings,troubleshooting}.md`、`skills/obox-ext-*`、宿主 `README.md`｜扩展 `index.js`、`lib/**`、`test/**`｜扩展 `app/**`、`vite.config.ts`、`tsconfig*.json`｜扩展 `manifest.json`

- [ ] 3.1 同步扩展 API 真相文档与受影响 skill（`api.overlay` 三方法与作用域、`progress` 字段、`apiVersion` 语义、透明窗体五条平台限制、overlay 不推送/不消费 token）（卡 05）。验证：从 `src/api/types.ts` 抽方法名逐个 grep 文档，零缺失；`troubleshooting.md` 含五条限制；未实机验证的观感描述已标注。
- [ ] 3.2 扩展入口 + 纯函数状态机 + 单测（惰性结算/联动/挂机/成长/道具/冷却/映射/存档/overlay 生命周期/长轮询订阅），并删脚手架 demo（卡 07）。验证：`npm test` 全绿且**逐条覆盖** spec 的 scenario（含时间回拨钳 0、关闭三天不追算、恢复途径心情不超 95、库存到顶、关窗暂停挂机、无鱼干喂食不生效、玩耍不耗道具、冷却内外差异、成长 2/1.6/0 三档、存档超版本备份重建、映射优先级、缺帧取模）；入口顶层零副作用。
- [ ] 3.3 Vue 子应用：精灵逐帧渲染、悬停面板、气泡、命中测试上报、长轮询订阅；页面 `html,body{background:transparent}`；删 `app/theme.js`（卡 08）。验证：`npm run build` 成功；产物 grep **不含** `backdrop-filter`/`installThemeBridge`/内联 `onclick=`；样式含透明背景；卸载路径 `cancelAnimationFrame`。
- [ ] 3.4 扩展 `manifest.json`：`contributes.settings`（1 个 boolean + 3 个 progress（`max:100`、无 description）+ 1 个 status 诊断位）、`apiVersion`、删 demo 贡献点、**不注册 App 卡片**（卡 09）。验证：`validate-manifest.mjs` 0 error/0 warning；断言无 `views`/`commands`/卡片声明；字段恰为 5 项且顺序正确；`apiVersion` 与宿主一致；中文 `displayName`/`description` 字节无损。

## 4. 组 4 · 打包与交付文档（依赖组 3）

**组文件所有权**：扩展 `scripts/pack.mjs`、`README.md`、`package.json`、`.gitignore`

- [ ] 4.1 核实打包清单并产出 `.oix`，写 README（用法/设置页/**素材出处与 BSD-3 许可证与未获背书**/最低宿主版本/五条平台限制/无主题理由）（卡 10）。验证：`npm run build && npm run pack` 成功；回读包内条目含 `manifest.json`/`index.js`/`lib/**`/`dist/**`/`assets/whale/{spritesheet.webp,pet.json,LICENSE,PROVENANCE.md}` 且不含 `data/`/`node_modules/`/`out/`/`openspec/`/`docs/`；记录包大小；README grep 断言齐全；`git status` 无未忽略产物。

## 5. 组 5 · 实机联调证据（依赖组 2–4）

**组文件所有权**：`notes/evidence/real-window.md`

- [x] 5.1 装机联调并落八项证据（自动出现于右下角、空白区透出桌面、穿透与命中、toggle 销毁/重建与 CPU 回落、精灵边缘、设置页三行进度条与当帧刷新、五种交互与动画、停用即回收）（卡 11）。验证：证据文件逐项有数值/截图；像素判据差值 ≤ 2/255 且非 `#1e1e1e`/`#ffffff`；CPU 关窗前后可对比；缺陷（若有）写进"缺陷清单"交回 dev，本卡不改代码。**（已完成：八项全过、实现级缺陷 0；用户物理反馈触发增补轮，见组 6/7）**

## 6. 组 6 · 增补轮实现（依赖组 5 的用户反馈；14 与 15 分属宿主/扩展两仓库，可并行）

**组文件所有权**：宿主 `src/api/types.ts`、`src/shared/types.ts`、`src/preload/index.ts`、`src/main/appWindow.ts`、`src/main/index.ts`、`src/renderer/src/core/host.ts`、`test/overlay-window.test.ts`、`test/host-api-surface.test.ts`、`docs/extension-api/api-reference.md`｜扩展 `index.js`、`lib/**`、`test/**`、`app/**`、`README.md`

- [ ] 6.1 宿主 `api.overlay.setPosition(id,x,y)`：实现 + 作用域校验 + 工作区兜底钳位 + 文档与两测试文件同步（卡 14）。验证：宿主三门槛全绿（test 基线 777 起）；越权/NaN/超界/不存在 id 的负向断言全过；api-reference overlay 小节含 setPosition 且与源码逐字一致。
- [ ] 6.2 扩展增补功能：拖动（pet.drag 增量 + 钳位 + 持久化 + 互斥）、隐藏/召唤（hidden 持久化 + 胶囊 + 停 rAF + summon kind + toggle 清隐藏）、原地小跑（trot 随机 4–10 分钟 + 条件门控）、文案换 D-16 全表（禁数字时间/增量数字 + 上游五句逐字）、面板删三属性加隐藏按钮、README 文案引用同步（卡 15）。验证：`npm test` 全绿（旧文案断言同步更新并逐条列明）、build 产物 grep 禁止项 0 且新文案在、vue-tsc 0 error、新增测试覆盖 drag/hidden/trot/文案正则。

## 7. 组 7 · 增补功能实机复验（依赖组 6）

**组文件所有权**：`notes/evidence/real-window-v2.md`

- [ ] 7.1 真实鼠标复验拖动/隐藏/召唤/trot/新文案/面板去属性 + 回归卡 11 的②④⑥（卡 16）。验证：证据文件逐项数值/截图；文案截图与 D-16 逐字比对；隐藏态 CPU≈0 且胶囊外穿透；trot 若观察窗未触发须如实记录并以单测为证。**（范围已按 Q15=B 收缩：②隐藏/召唤整组标 N/A、④去掉召唤胶囊与隐藏态拒绝两句、⑤只记实测现状并注明待卡 17 后复验）**

## 8. 组 8 · Q15 落地（依赖组 7 收尾，避免干扰实机观察）

**组文件所有权**：扩展 `index.js`、`lib/**`、`test/**`、`app/**`、`README.md`

- [ ] 8.1 取消隐藏/召唤（按 design D-15 撤销清单）+ 面板改三枚内联 SVG 图标一行 + 修缺陷 D-1（启动成功无条件清空 `pet.diagnostic`）+ README 同步（卡 17）。验证：`npm test` 全绿（`actions-hidden` 11 条转为负向断言 + 图标行断言 + D-1 回归）；产物 grep `召唤鲸鱼娘`/`鲸鱼娘藏起来了`/`summon`/`isHidden`/`vital-row` 全 0、`<svg` ≥3、`aria-label` 与三个中文动作名在；旧禁止项仍全 0；`vue-tsc` 0 error；`npm run pack` 回读自检通过；旧存档含 `hidden:true` 可正常读入。
- [ ] 8.2 卡 17 完成后的实机复验（由卡 16 的代理续跑）：三枚图标一行的观感/禁用态/焦点环与 `aria-label` 实际可访问名（N11）、D-1 修复确认（N12）、并回归拖动与文案。验证：证据追加进 `notes/evidence/real-window-v2.md` 的"Q15 复验"节。**（已完成：三项全过、实现级缺陷 0；观察项 O-1「Tab 经 ✕→精灵时面板闪关一次，无法判定是否卡 17 引入」交 check 步甄别）**

## 9. 组 9 · Q16/Q17 落地（依赖组 8）

**组文件所有权**：扩展 `index.js`、`lib/**`、`test/**`、`app/**`、`README.md`

- [ ] 9.1 每 10 秒随机表演（7 项"表演型"随机集，状态指示轨不参与；`running-left/right` 原地参与；trot 独立定时器退役；打盹期间暂停；不耗道具/不改数值/不弹气泡/不推进 `lastInteractAt`）+ 图标底透明与白色线条 + 悬浮即时显示动作名 + 面板即时关闭核对 + README 同步（卡 18）。验证：`npm test` 全绿（新增随机表演与图标样式/浮层用例）；dist 的 **js 与 css** grep：`.act` 无 `linear-gradient`、图标描边为白色、`.tip` 在、`TROT_MIN_SEC`/`TROT_MAX_SEC`/`trotTimer` 全 0、旧禁止项仍全 0；`vue-tsc` 0 error；`npm run pack` 回读自检通过。
- [ ] 9.2 卡 18 后的实机复验：10 秒随机表演的节奏与"侧向原地跑"观感、打盹期间确实安静（N13）、图标透明底/白线在深色面板上的可读性与悬浮浮层（N14）、并回归拖动与面板开合。验证：证据追加进 `notes/evidence/real-window-v2.md` 的新节。

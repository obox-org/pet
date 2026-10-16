# dev — pet-desktop-companion（第 7 步：回执汇总 + 门槛原始输出 + 改动文件清单）

> 本文件**增量维护**：每张卡完成即入账（改动清单 + 门槛原始输出 + 越界核对）。
> 本步**不提交、不推送**（`git log -1` 必须仍是开工前那条）。开工前基线：宿主 `fbdb882`（porcelain 0 行）；扩展仓库 0 提交（porcelain 40 行）。

## 0. 批次与派发记录

| 批次 | 卡 | 子代理 id | 状态 |
| --- | --- | --- | --- |
| 组 1 | 01 overlay-feasibility-probe | `3d576976` | ✅ 完成 |
| 组 1 | 02 host-api-surface | `5dc8f37c` | ✅ 完成 |
| 组 1 | 06 ext-assets | `a10cdd86` | ✅ 完成 |
| 组 2 | 03 host-overlay-window | `1987fcb9` | 🔄 进行中 |
| 组 3 | 07 ext-core | `295d1f45` | 🔄 进行中 |
| 组 3 | 08 ext-ui | `15c5a1c9` | 🔄 进行中 |
| 组 2 | 04 host-progress-field | — | ⏸ **押后**：与卡 03 同在宿主仓库，并发跑 `typecheck`/`test` 会互相污染（半成品文件被对方的全仓门槛扫到）⇒ 等 03 完成再派 |
| 组 3 | 05 host-docs-sync | — | ⏳ 待 02/03/04 |
| 组 3 | 09 ext-manifest-settings | — | ⏳ 待 02/04 |
| 组 4 | 10 ext-pack-readme | — | ⏳ 待 06/07/08/09 |
| 组 5 | 11 verify-real-window | — | ⏳ 待 03/04/07/08/09/10 |

## 1. 父代理裁定（跨卡事项，均留痕）

| # | 事项 | 裁定 | 依据 |
| --- | --- | --- | --- |
| R1 | 卡 03 所有权缺口：overlay 的渲染进程→主进程接线要动 `src/preload/index.ts`（原不在任何卡）与 `src/shared/types.ts` 的 `MainApi`（原属卡 02） | **扩权给卡 03**：`src/preload/index.ts` + `src/shared/types.ts`（仅 `MainApi` 的 overlay 方法）+ `src/api/types.ts` 一行（`overlay?` → `overlay`） | 卡 02 已完成 ⇒ **顺序交接**而非并发重叠，不违反"同一文件只归一张卡" |
| R2 | `api.overlay` 该是可选还是必填 | **翻成必填 `overlay:`**（在卡 03 落 `host.ts` 接线的同批改动里） | `apiVersion` 门槛已保证声明 v2 的扩展只跑在有该能力的宿主上；可选面只会逼扩展写 `api.overlay?.` 并在老宿主静默无效 |
| R3 | 上游许可证"自相矛盾"的措辞 | 卡 06 查证为**分层声明**（仓库根 Apache-2.0 blob `d6456956…` / 包级 BSD-3-Clause blob `fd674136…` / 主线 v2 清单显式声明素材 `license: BSD-3-Clause`）⇒ `PROVENANCE.md` 用分层口径，**决定不变**（按较严 BSD-3 履行） | 卡 06 回执 + 上游主线交叉验证 |
| R4 | `design.md` D-10 与 `specs/pet-sprites` Req 4 里"自相矛盾"那句现在不准确 | **本步不改 spec/design**（skill 明令）⇒ 在此登记为**事实更正**，交第 8 步 check 处置；结论（按 BSD-3 履行 + 随附 LICENSE + 出处声明）不变，不影响实现 | `obox-ext-dev` 的「不做」条 |
| R5 | `docs/extension-api/manifest-reference.md:20` 仍写"当前 `1`" | 归**卡 05**（文档同步）修正为 `2`，并同步 overlay/progress 章节 | 卡 02 上报 |
| R6 | 卡 07 与卡 09 共用的设置键命名 | 固定为 `pet.visible`（boolean，默认 true）、`pet.hunger` / `pet.clean` / `pet.mood`（number 0..100，`progress`）、`pet.diagnostic`（string，默认 `''`，只读 `status`） | design D-9/OQ3；两卡任务书已同文下发 |
| R7 | overlay 消息桥的路由（宠物无卡片，而既有桥按 `appId` 找卡片） | overlay 窗体查询串带 `obox-window=overlay&extId=pet&overlayId=pet.overlay&appId=pet.overlay`；宿主路由**先按卡片 id 查、查不到再按 overlayId 查所属扩展**（`core/host.ts:787-803` 新增分支），页面侧沿用既有消息形状 | `guides-user.md:131-145`、proposal `## Impact` |
| R8 | 长轮询 hold 时长 | **25s**，必须 < 宿主单次请求 **60s** 超时（`src/main/appWindow.ts:162-168`）；代码注释须写明该理由 | design D-3 |
| R9 | 扩展仓库无 `.gitignore`，卡 08 的 `npm install` 使未跟踪项从 44 涨到 **790**（`node_modules/**`） | **卡 10 必须新建 `.gitignore`**（至少 `node_modules/`、`dist/`、`out/`），否则 ship 步会误提交依赖 | 本步实测 `git status --porcelain=v1 -uall` |
| R10 | 宿主 lint 有 **4 条 prettier warning** 落在 `test/settings-network-layout.test.ts`（上一轮为设置页版式加的门禁文件，不属任何卡） | 0 error ⇒ 门槛通过；**本步不动它**（越界），登记为 ship 步的仓库卫生项 | 卡 02 lint 原始输出 |
| R11 | 卡 03 上报：`src/renderer/src/main.ts` 只认 `obox-window=app`，overlay 窗体加载同一份 index.html 会**挂载整个主窗口 App 并激活全部扩展** | **授权扩权**给卡 03：判定改为集合同时含 `app`/`overlay`，overlay 同样 `activateExtensions:false`；须加回归断言（主窗口与 `obox-window=app` 行为逐字不变）；并在注释写明"overlay 不参与 `ui.ts` 的模态框转发是预期取舍"。否决"伪装成 app"方案（会让模态框 60s 悬挂，且违背已钉死的查询串） | 卡 03 开工上报 + design D-11 |
| R12 | 卡 03 上报：裁定 R2 把 `overlay?` 翻必填后，卡 02 的 `test/host-api-surface.test.ts` 有 3 处断言钉死可选形态，必红 | **授权顺序交接**该文件给卡 03，仅限两类最小同步（3 处标记 `overlay?:`→`overlay:`、1 段注释改写为"已翻必填 + apiVersion 门槛理由"），**不得改动其它任何断言**，条数不得减少；回执须贴该文件 `git diff` | 卡 03 开工上报 + 裁定 R2 |
| R13 | 卡 03 报备：外壳需要扩展页 URL，但 overlay 无卡片进不了 `appStore`，且 preload/shared 类型只授权三方法与 `MainApi` 签名（无第 4 个 IPC 面） | **接受**在 overlay 查询串**末尾追加** `url=<encodeURIComponent(...)>`（前四参数名与顺序不变）；**强制加固**：外壳消费前二次校验（`app://` 协议 + host `extensions` + 路径以同一查询串的 `<extId>/` 开头），不匹配则不加载 iframe 并记 `[overlay] 拒绝非法 url`；主进程"必须指向本扩展目录内"的校验保留且两处判据一致；该契约（五参数 + 校验规则）由卡 05 同步进 `api-reference.md` | 卡 03 开工上报；信任链：扩展 → 主进程校验 → 主进程写查询串 → 外壳消费 |

## 2. 卡 06 · ext-assets（✅ 完成，父代理已独立复核）

**改动清单**（新增 4 文件 + 新建目录 `extensions/pet/assets/whale/`；宿主 0 改动）

| 文件 | 大小(B) | SHA256 |
| --- | --- | --- |
| `assets/whale/spritesheet.webp` | 1544154 | `6c2c26ebaf920d69403da90c7fe844ce64cd2984f5bf7f3bd677b07e5a3914df` |
| `assets/whale/pet.json` | 838 | `d4a75257f7d2ce730e37a707b8d1fdda20d9752971aba9b06f621be988831dbe` |
| `assets/whale/LICENSE` | 1521 | `02e1e3ebf73df5c1840c842a8e93b40942bf6e53a66acbe6c5643fc8664ff97d` |
| `assets/whale/PROVENANCE.md` | 14005 | `940a291c91e1addc49aa60caf31ed86f8dba6069077fef41f5ab6b53d1135dca` |

**门槛**：本卡只落地素材，typecheck/lint/test/build/pack **不适用**（未碰 `manifest.json`/`index.js`/`app/**`/`test/**`/`src/**`）。

**验收原始输出（六条，摘录关键行；全文见回执）**

```
spritesheet.webp Length = 1544154 ; -eq 1544154 => True
pet.json Length = 838 ; -eq 838 => True
LICENSE Length = 1521 ; -eq 1521 => True
spritesheet.webp | gitBlobSha1=5ffb1ac7650a78f9691f66928333fa9dd8dcc1ad | api.sha=5ffb1ac7…c1ad | BLOB_MATCH=true
pet.json         | gitBlobSha1=ce7c1d9da8c6d5e9b14ff5a0538664a14853cc8e | api.sha=ce7c1d9d…cc8e | BLOB_MATCH=true
LICENSE          | gitBlobSha1=fd674136195478eac50ab24cb5a8ff105886abf3 | api.sha=fd674136…abf3 | BLOB_MATCH=true
[2] frames===[6,8,8,4,5,8,6,6,6] OK; tracks keys(9)===expected OK; idle.durations===[400,400,500,400,400,500] OK
[3] line1 = "BSD 3-Clause License" ; copyright = "Copyright (c) 2026, zhu1090093659" ; 第三条(不背书)存在 = true
[4] chunk @12 fourcc="VP8L" size=1544134 ; VP8L 签名 0x2f ; ffc5d311 => 14-bit w-1=1535 h-1=1871 alpha=true => 1536x1872
[4] derived from pet.json: columns=8 cell=192x208 rows=9 => 1536 x 1872 ; ASSERT PASS ; 每行帧数<=8 PASS
[5] <EXT>\.gitignore Test-Path = False ; check-ignore: NOT IGNORED ×4 ; git status -- assets => ?? ×4
下载通路：直连 3 条 URL 全败（基础连接已经关闭 / 无法连接到远程服务器），代理 http://127.0.0.1:7897 全成
```

**父代理独立复核**：四文件大小与 SHA256 逐一复算一致；`PROVENANCE.md` 无 BOM（首字节 `35,32,233`）、含"分层"、**不含**"自相矛盾"、含 Apache-2.0 仓库根 blob、含素材级 BSD-3 声明、含未获背书声明、含替换条款；宿主 porcelain 0 行 @`fbdb882`；扩展 0 提交、暂存区 0 项、未跟踪 44 = 基线 40 + 新增 4 ⇒ **无越界**。

**下游解锁**：卡 08 可直接依赖 1536×1872 / 8 列 / 192×208 / 9 轨 / 带 alpha；卡 10 的 README 出处段引用 `PROVENANCE.md` §7 分层口径与 §8 未获背书句。

## 3. 卡 02 · host-api-surface（✅ 完成）

**改动清单**（`git diff --numstat` 原文）

```
1	1	package.json                       （apiVersion: 1 → 2，仅此一行）
25	2	src/api/contributions.ts           （SettingFieldType += 'progress'；SettingField += max?: number；文档块）
62	2	src/api/types.ts                   （api.overlay 命名空间 + JSDoc 作用域约束 + 共享类型再导出）
54	0	src/shared/types.ts                （OverlayAnchor / CreateOverlayRequest / OverlayResult）
?? test/host-api-surface.test.ts         （新建 423 行 / 21008 B / 26 tests）
```

**门槛原始输出（关键行）**

```
【npm run typecheck】EXIT=0
> obox@1.0.15 typecheck
> npm run typecheck:node && npm run typecheck:web
> tsc --noEmit -p tsconfig.node.json --composite false
> vue-tsc --noEmit -p tsconfig.web.json --composite false
（0 error）

【npm run lint】（已先删 .eslintcache）EXIT=0
> eslint --cache .
test/settings-network-layout.test.ts
  34:17  warning  Insert `⏎···`                             prettier/prettier
  35:5   warning  Insert `··`                               prettier/prettier
  36:1   warning  Insert `··`                               prettier/prettier
  44:95  warning  Replace `block` with `⏎······block⏎····`  prettier/prettier
✖ 4 problems (0 errors, 4 warnings)
→ 0 errors 达标；4 条 warning 全在非本卡文件（见裁定 R10）

【npm test】EXIT=0
 ✓ test/host-api-surface.test.ts (26 tests) 11ms
 …（56 个文件全表见回执）…
 Test Files  54 passed | 2 skipped (56)
      Tests  701 passed | 5 skipped (706)
   Duration  3.80s
关键既有门禁未破坏：settings-view-wiring 25 ✓、manifest 34 ✓、manifest-script-parity 20 ✓
```

**apiVersion 1→2 影响面（已逐个查证）**：`extensions/rdp`、`extensions/webapp`、`extensions/obox-updater` 的 `manifest.json:6` 均声明 `apiVersion: 1` ≤ 2 ⇒ 不受影响；`extensions/todo`、`extensions/pet` 与 5 个内置扩展未声明（视为 0）⇒ 不受影响；parity fixtures（`high-api-version.json`=999、`ok-full.json`=1）与宿主同读单源 ⇒ 差分门禁仍绿。

**父代理独立复核**：`apiVersion = 2` ✓；`api.overlay` 命名空间 ✓；`CreateOverlayRequest`/`OverlayAnchor`（四值）✓；`'progress'` 与 `max?: number` ✓；新测试文件 21008 B ✓；`git status` 恰为那 5 条、HEAD 仍 `fbdb882` ⇒ **无越界**。

## 4. 卡 01 · overlay-feasibility-probe（✅ 完成）

**改动清单**：仓库内仅 `notes/evidence/overlay-feasibility.md`（16,316 B，新建）；临时脚本/截图/日志全在 `%TEMP%\pet-probe\`（25 张截图 + 10 个脚本 + 日志），**不进仓库**。未 git add/commit。

**环境**：Windows 10 Pro 25H2 build 26200.9457、16 核、electron 44.6.0 / chrome 152.0.7977.130 / node 24.21.0；主显示器 `workArea={0,0,2560,1392}`、`scaleFactor=1`、`displayCount=1`；显卡 AMD Radeon + RTX 4070 SUPER + MuMu/ToDesk 虚拟显示适配器。

**四项结论与硬数据（原始输出摘录）**

```
[predict] windowBounds(DIP) x=2316 y=908 w=220 h=460 ; workArea={"x":0,"y":0,"width":2560,"height":1392}
[bounds-match] predicted==actual: True
[baseline] A=#fdf5f4(R253,G245,B244)  [after-show] A=#fdf5f4 maxdiff=0 | C=#ff00ff maxdiff=255
[verdict-transparent] A diff<=2/255: True ; B diff<=2/255: True
反向对照1 --opaque(transparent:false, bg #00000000): A=#f3f3f3 maxdiff=10 / B maxdiff=12 ⇒ 判据有区分力
反向对照2 --opaque --bg1e: A=#1e1e1e（精确）maxdiff=223
[alwaysOnTop] win.isAlwaysOnTop() = True ；decoy(白色普通窗 400x500 全覆盖)时品红色块仍浮其上
[taskbar] baseline=11 → with-pet=11 → with-decoy=12 → after-decoy-closed=11（skipTaskbar 为截图/目检证据）
[wfp IGNORE_ON] D/A/C: class=SysListView32 title=FolderView（桌面）
[wfp IGNORE_OFF] D/C: class=Chrome_RenderWidgetHostHWND（本窗）
[rightclick3-region.png] 目检：Win11 桌面右键菜单弹出（撤销删除/新建/显示设置/个性化/…）且 overlay POINTERDOWN=0
[matrix a-unfocused-fast] imDelta=11 pmDelta=9 ；[b-focused-fast] imDelta=89 pmDelta=39
[c] focused-slow / [d] jumpC / [e] jumpA: imDelta=0 pmDelta=0（注入式输入间歇性不转发；真实人工移动 PM_TICK n=101 正常）
[cpuA] 窗体存活 + rAF 60FPS，10s：sumCpu=218.8ms（renderer +140.6ms、gpu +93.7ms、main/utility 0）= 单核当量 2.18%
[cpuB] win.destroy()+2s 后同口径 10s：sumCpu=0.0ms（3 进程逐个 delta 均为 0）
[cpu-delta] A-B = 218.8 ms / 10s
```

**结论**：① 透明 **通过**；② 穿透 + forward **通过（附不稳定声明）**；③ alwaysOnTop/skipTaskbar **通过**；④ 关窗省 CPU **通过**（⇒ toggle 必须真 `destroy`，与用户裁定一致）。

**未验证/如实声明**：`forward:true` 对**注入式**光标移动间歇性不转发（5 组中 3 组为 0，根因未查明，疑 ToDesk/虚拟显示输入栈）⇒ **卡 11 必须用真实鼠标复验**；前两次合成右键未捕到菜单（负记录截图保留，未编造解释）；skipTaskbar 仅截图证据；overlay 顶层 HWND 读回因 `Buffer.readUIntLE` ≤6 字节限制失败（改用 `WindowFromPoint` 类名证据）；全屏独占 / DWM 关闭 / 多显示器混合 DPI 未测；测量期间有真实人工操作（已声明，各判据带对照）。

**对卡 03 的建议（已转达）**：design D-1 参数原样全有效（`thickFrame:false`/`roundedCorners:false` 建议保留）；`backgroundColor:'#00000000'` 必须与 `transparent:true` 同用；穿透默认 true+forward、命中切 false；**验收勿开 DevTools**；自动化注入输入偶发失灵时先用真实鼠标/`WindowFromPoint` 复核再怀疑宿主。

**父代理独立复核**：证据文件存在（16,316 B）且含 `maxdiff`/`218.8`/`0.0ms`/`WindowFromPoint`/`DevTools`/局限节/`thickFrame`；临时物确在 `%TEMP%\pet-probe`；宿主 porcelain 仅卡 02 那 5 条（与本卡无关，已区分）；HEAD 仍 `fbdb882` ⇒ **无越界**。

## 5. 卡 08 · ext-ui（✅ 完成，父代理已独立复核）

**改动清单**

| 动作 | 路径 |
| --- | --- |
| 新增 | `app/lib/bridge.ts`（消息桥：查询串读 appId、requestId 自生成比对、两层信封 unwrap、本地超时）、`app/lib/sprites.ts`（pet.json 加载/几何归一化/图集容错/缺帧与缺 durations 回退）、`app/lib/anim.ts`（D-4 映射与优先级、sleep×1.5、reduced-motion 400ms）、`app/lib/state.ts`（PetStateView 归一化 NaN/缺失→0、D-7 等级、中文文案表）、`app/lib/frameClock.ts`（rAF 帧时钟，逐帧不等间隔 + pause/resume/stop）、`app/components/PetPanel.vue`、`app/components/PetBubble.vue`、`app/env.d.ts`、`tsconfig.json` |
| 修改 | `app/App.vue`、`app/main.ts`（删主题桥安装）、`app/style.css`（`html/body/#app` 透明、零 token）、`app/index.html`（删 color-scheme，防画布默认底色破坏透明）、`vite.config.ts`（仅新增 dev 期 `/assets/*` 转接中间件，`apply:'serve'`，不影响产物） |
| 删除 | `app/theme.js` ✅（父代理复验 `Test-Path` = False） |
| 安装/构建产物 | `node_modules/**`（743 条未跟踪）、`package-lock.json`、`dist/**`（3 文件） |

**门槛原始输出（关键行）**

```
① npm install → up to date in 258ms（首次：added 35 packages in 55s）  exit 0
② 清空 dist/ 后 npm run build →
   vite v7.3.7 building client environment for production...
   ✓ 24 modules transformed.
   ../dist/index.html                  0.68 kB │ gzip:  0.54 kB
   ../dist/assets/index-B1CuWlvY.css   4.58 kB │ gzip:  1.33 kB
   ../dist/assets/index-D9MisqLV.js   90.23 kB │ gzip: 35.68 kB
   ✓ built in 468ms   exit 0
③ 类型检查：扩展 package.json 无 typecheck 脚本（该文件属卡 10，未改）⇒ 替代方案：新增 tsconfig.json（strict），
   用宿主已装的 vue-tsc 跑：node <ROOT>\node_modules\vue-tsc\bin\vue-tsc.js --noEmit -p tsconfig.json → exit 0（0 error）
⑥ dist 清单：index.html 683 B + assets/index-*.css 4,584 B + assets/index-*.js 90,231 B = 95,498 B（93.26 KB）
```

**父代理独立复核（自己重跑断言，不轻信回执）**

```
app\theme.js 存在 = False ✓        dist 总大小 = 95498 B ✓
禁止项 grep（dist/** 与 app/** 合查，命中数）：
  backdrop-filter=0 ✓  installThemeBridge=0 ✓  obox-theme=0 ✓  onclick==0 ✓
  alert(=0 ✓  confirm(=0 ✓  prompt(=0 ✓  var(--=0 ✓
必需项 grep：background:transparent=4 ✓  cancelAnimationFrame=5 ✓
  pet.ready=4 ✓  pet.subscribe=3 ✓  pet.interact=3 ✓  pet.hit=4 ✓
dist/index.html：src="./ ✓ href="./ ✓ 绝对路径 (src|href)="/ = False ✓  vite base:'./' 仍在 ✓
```

**⚠ 给第 8 步 check 的一条免误判说明**：源码级 grep 会看到 `App.vue`/`PetPanel.vue`/`main.ts`/`env.d.ts` 各有一处 `from 'vue'`（裸模块）。这是**构建期**依赖：vite 已把 Vue 运行时打进 `dist/assets/index-*.js`（90.23 KB / gzip 35.68 KB 即含 Vue 的体积特征），页面产物在 `app://` 下**不再 import 任何裸模块**，符合"运行时零依赖"（`guides-user.md:47,59`）。**入口侧**（`index.js` / `lib/**`，卡 07）才是"绝不许 import 裸模块"的硬约束对象。

**实现要点（子代理给出，附文件:行）**：帧时钟 `frameClock.ts:119` 用 rAF 累加 + `while (acc >= durationAt(i))` 逐帧扣时长（真机采样 idle 驻留 500/401/400/500/400/401/500ms、sleep 750/602/600/750/600/601/750ms = idle×1.5 ⇒ **逐帧不等间隔成立**）；缺帧取模 `App.vue:148`（模数取 `frames[row]`，行号越界钳回第 0 行，不采相邻行像素）；清理 `App.vue:547-548,565` + `frameClock.ts:75,87`（`pagehide`/`beforeunload` → `cancelAnimationFrame` + 清定时器 + 拆桥）与 `App.vue:525-529`（hidden 暂停 / visible 恢复，不补欠帧）；命中去抖 `App.vue:450`（仅结果变化时发 `pet.hit`，实测 false→true→false 共 3 条）+ `App.vue:419`（面板槽矩形向下补 8px 消掉 6px 悬停缝；上报取"指针命中 ∪ 面板可见"⇒ 键盘展开面板同样关穿透）；长轮询 `App.vue:298` + `bridge.ts:41-48`（**25s hold < 宿主 60s 超时**的理由写在注释；页面本地超时 35s = 25+10 余量；实测 30s 内 35 次 subscribe、rev 0→34 严格递增）；键盘可达性 `App.vue:345,402,505-510` + `PetPanel.vue:32`（空格/回车=摸头、Esc 只关面板、焦点归还精灵、展开落"喂食"且禁用时顺延）。

**子代理的附加验证（超出卡要求，用仓库自带 Electron 44 + 同 sandbox 的 iframe 假宿主；脚本在 `%TEMP%\pet-smoke*.mjs`，不进仓库）**：透明位图 alpha 抽检（空白点 0 / 精灵点 255）、几何（精灵 192×208 贴底居中 left=14 top=252 bottom=460；面板 200×210、bottom=246 留 6px 缝、`fitsWindow=true`）、协议（`appId` 全部取自查询串 = `pet.overlay`；首帧 `pet.ready` → `pet.subscribe{rev:0}` → `pet.hit{inside:false}`；内层 `{ok:false,error}` 的道具不足/冷却分支正确显示坏气泡且**不切轨**；`hunger=12.7` 无 `anim` 时按阈值切 `waiting` 行并显示 `12/100`（向下取整）；成长 520 无 `rankName` 时按 D-7 推出「深海羁绊」）。**并自行修掉一处缺陷**：互动气泡占位期间入睡会永久吞掉「打盹中（Zzz）」⇒ 改为气泡到期后补发（`App.vue:226,254-268`），复测通过。

**越界核对**：`<EXT>` 未跟踪 820 行 = 743 行 `node_modules/**` + 3 行 `dist/**` + 其所有权内文件；`index.js`/`lib/**`/`test/**`（10 个文件）/`manifest.json`/`assets/**` 均为卡 06/07 产物或既有文件，**未触碰**（`manifest.json` 最后写入时间仍是脚手架时刻 10-14 23:27）。`<ROOT>` 的非空 status 全部来自并行的卡 02/03（宿主侧），子代理开工时为空、全程只读 ⇒ 非其越界。两仓库均无新提交（`<EXT>` 0 提交；`<ROOT>` HEAD `fbdb882`）。

**遗留（转交）**：① `<EXT>` 无 `.gitignore` ⇒ `node_modules/`（743 条）、`dist/`、`out/` 以未跟踪出现，**卡 10 必须补**（裁定 R9）；② `package-lock.json` 是否入库由卡 10/ship 决定（建议入库以固定构建期依赖）；③ 实机联调时 overlay 查询串需带 `appId=pet.overlay`（页面已按此读取并有同名兜底）——转卡 11。

## 6. 卡 03 · host-overlay-window（✅ 完成，父代理已独立复核）

**改动清单**（`git status` 中属本卡的 8 条：6 个 `M` + 2 个 `??`；卡 02 的 5 条原样保留未触碰）

| 文件 | 关键改动（文件:行） |
| --- | --- |
| `src/main/appWindow.ts` | overlay 全套 :234-588：`isOverlayUrlInsideExtension`(:272) url 归属校验、`validateOverlayRequest`(:291)、`overlayPosition`(:344) 四 anchor 定位纯函数、`overlayQuery`(:371) 五参数、`createOverlayWindow`(:389)（11 选项 + `transparent?'#00000000':'#1e1e1e'`(:432) + `ready-to-show` 后显示 + **默认穿透**）、`destroyOverlay`(:499) 真销毁+幂等、`setOverlayMouseThrough`(:530)、`registerOverlayIpc`(:576)；既有处：`mainWindow()`(:152) 排除 overlay URL、`app:extension-message`(:172) 60s 超时加 senderId 追踪、`flushPendingReplies`(:163)、`closeAllAppWindowsOnMainClose`(:217) 一并关 overlay |
| `src/main/index.ts` | import + 调用 `registerOverlayIpc`(:19-23, :103) |
| `src/preload/index.ts` | 三桥接 `overlayCreate/overlayDestroy/overlaySetMouseThrough`(:70-72)（R11 扩权） |
| `src/shared/types.ts` | `MainApi` 三签名(:346/351/357)；`OverlayAnchor/CreateOverlayRequest/OverlayResult` 形状未动（R11 扩权） |
| `src/renderer/src/core/host.ts` | `resolveMessageExtId`(:89) 导出纯函数、`overlayOwners`(:122)、buildApi 加 `overlay:`(:435)、`buildOverlayApi`(:581)、`handleExtensionMessage`(:619)、监听改走它(:885)、`removeExtension` 清扫(:1148) |
| `src/renderer/src/AppWindow.vue` | 模块级 `<script>`(:1-18) 首帧前挂 `obox-overlay` class、`isOverlay/extId`(:62-64)、`isOverlayUrlAllowed`(:72) 外壳二次校验（R13）、`overlayUrl`(:91) 非法则空白+warn、iframeSrc/srcdoc/frameKey overlay 分支、onMessage 强制路由(:210)、模板三处 `v-if`(:287-313)、scoped 三层透明(:341-344) |
| `src/renderer/src/assets/main.css` | `html.obox-overlay, html.obox-overlay body { background: transparent }`(:58-59)；全局 body 默认背景原样保留 |
| `src/renderer/src/main.ts` | **R11**：`windowKind`(:22) + `isChildWindow = 'app' \|\| 'overlay'`(:23) + `activateExtensions:!isChildWindow`(:37) + 挂载分支(:40)；注释含 D-11/R11/ui.ts 取舍 |
| `src/api/types.ts` | **R2/R12**：`overlay?: {` → `overlay: {`(:207) 一行 + 紧邻 JSDoc 同步 |
| `test/host-api-surface.test.ts` | **R12**：3 处必填标记 + 1 段注释；26 条断言语义与条数不变 |
| `test/overlay-window.test.ts` | 新建 50,679 B / **53 条**：验收①-⑧ + 全部负向夹具 + 回归断言 |

**门槛原始输出（关键行；全文 `tmp/gates/{typecheck,lint,test}.txt`）**

```
typecheck：tsc(node) + vue-tsc(web) 均无输出 = 0 error
lint：✖ 4 problems (0 errors, 4 warnings) —— 4 条全在 test/settings-network-layout.test.ts（既有、非本卡、未动）= 0 新增
test：Test Files 55 passed | 2 skipped (57)；Tests 754 passed | 5 skipped (759)
      （基线 701 + 新增 53；host-api-surface 26 条不减 = R12 达成）
git：log -1 = fbdb882；diff --cached 空（无 add/commit/push）
```

**五处透明改动（改前 → 改后，父代理逐处复验 = True）**

| # | 位置 | 改前 | 改后 |
| --- | --- | --- | --- |
| ① | `appWindow.ts:432` | `backgroundColor:'#1e1e1e'`（单一路径） | overlay 独立参数对象：`transparent ? '#00000000' : '#1e1e1e'` + 11 选项；App 卡片路径未动 |
| ② | `AppWindow.vue:289,313` | `<TitleBar>` / `<PromptHost>` 恒渲染 | `v-if="!isOverlay"` |
| ③ | `AppWindow.vue:341-344` | `.app-window`/`.app-window-content` = `var(--bg,#1e1e1e)` | 基础规则保留 + `.app-window--overlay …{background:transparent}`（根 class 由 `:class` 绑定 :287） |
| ④ | 同上 | `.app-frame{background:#ffffff}`（最易漏） | overlay 规则覆盖为 transparent |
| ⑤ | `main.css:58` | 全局 `body{background:var(--bg)}` 对每窗生效 | 追加 `html.obox-overlay …{background:transparent}`；class 由模块级 script 在**首帧前**挂上（早于 ready-to-show，避免闪底） |

**消息路由与超时**：overlay 页把 overlayId 当 `appId` 发既有消息形状；外壳强制用查询串 appId 转发(:210)；宿主 `handleExtensionMessage`(:619) → `resolveMessageExtId`(:89) = **先查 appStore 卡片、未命中再查 overlayOwners**，都未命中回既有错误「扩展未注册消息处理器」（文案逐字不变）；60s 超时**未缩短**（全文件仅此一处 :190），注释写明"扩展长轮询 hold 必须小于该超时"；destroy 时 `flushPendingReplies`(senderId) 立即以「overlay 窗体已销毁」结算该窗 pending，不空挂 60s。

**作用域安全（真实现）**：主进程三方法按 `overlayKey(extId,overlayId)` 定位；越权 ⇒ `ok:false` + 中文可执行 error（指认真实属主）+ `console.warn('[overlay] 越权被拒…')`；"不存在"与"别人的"区分处理（destroy 幂等 ok:true；setMouseThrough 明确 ok:false）；宿主侧 extId 绑死在 `buildOverlayApi` 闭包。测试断言 ext-b 操作 ext-a 的 overlay ⇒ ok:false、error 含属主与"越权"、`destroyCalls===0`、warn 记录在案。

**回归（isOverlay 单一开关）**：卡片模式 isOverlay=false 时 TitleBar/PromptHost 照常、三层背景基础规则不变、iframeSrc/srcdoc/frameKey 走原 registration 路径、extensionMessage 用 `data.appId`、overlayUrl IIFE 提前 return ''（不误 warn）；`app-window-wiring`(7)、`host-api-surface`(26)、theme/manifest 等既有 55 文件全绿；`pushThemeTokens` 未加分支（overlay 因 registration 缺省自然跳过，符合 D-6）。

**R13 的一个解释性裁定（子代理提出，我认可）**：外壳/主进程 url 校验的 host 白名单取 `app://` 协议的三个合法 host（`extensions|builtin|debug`）而非仅 `extensions`——否则调试态（`app://debug/…`）与内置扩展的 overlay 无法工作；两处校验判据一致并有断言钉住；非法夹具（http/https/file/别的扩展目录/`..` 穿越/目录本身/未知 host/相对路径/空串）逐条断言被拒且不建窗体。

**父代理独立复核**：五处透明 = True×5；R11 集合语义/activateExtensions = True；R13 双重校验函数在码 = True；60s 未缩短 = True；`resolveMessageExtId`/`overlayOwners`/`buildOverlayApi`/preload 三桥接 = True；`overlay:` 必填 = True；新测试 50,679 B 在；`git status` 13 行 = 卡 02 的 5 + 卡 03 的 8（逐条对上）；HEAD `fbdb882`、暂存空 ⇒ **无越界、无提交**。

**遗留（转交）**：① overlay 查询串契约（五参数 + 双重校验判据）由**卡 05** 同步进 `docs/extension-api/api-reference.md`；② 实机联调（卡 11）须用**真实鼠标**复验穿透（卡 01 已证注入式输入间歇性不转发）。

## 7. 卡 07 · ext-core（✅ 完成，95/95 全绿）

**改动清单**（全部在 `<EXT>` 所有权内；`manifest.json`/`app/**`/`vite.config.ts`/`assets/**`/`README.md`/`scripts/pack.mjs`/`package.json`/宿主 一律未动）

| 组 | 文件 |
| --- | --- |
| 新增 `lib/**`（9 个纯函数模块，不碰 api） | `constants.js`（阈值/速率/键名/通道/D-9 文案单一来源；`SUBSCRIBE_HOLD_MS=25s` :38 且 <60s 理由注释 :32-37）、`vitals.js`（口径/衰减/联动记账 `ledgerDrop`:45 `ledgerRecover`:60）、`growth.js`（`growthRatePerHour`:17、`rankOf`:30）、`items.js`（库存钳 [0,20]、`grantAfkOnce`）、`mapping.js`（`STATUS_TRACK`:34、`resolveStatus`:72、`wrapFrame`:96、`frameDurations`:113）、`settle.js`（惰性结算七步 `settle`:64、`startupReset`:51）、`interact.js`（四互动 `interact`:48）、`persist.js`（白名单 serialize/deserialize/`sanitizeState`:34）、`bridge.js`（长轮询 hub `createSubscribeHub`:22、`buildView`:71） |
| 改写 `index.js`（398 行，只接线） | 入口 :52；overlay 生命周期（串行队列+销毁优先+创建失败诊断）:198-244；结算 tick :247-259；消息桥五通道 :276-342；`pet.subscribe` hold :298；设置订阅（只认 `pet.visible`/空 key）:345-352；init 序列 :358-383；cleanup :386-397；原子写等价+节流 :120-166；读档备份重建 :175-195 |
| 改写/新增 `test/**`（11 文件 / **95 条**） | `extension.test.js`（删 6 条脚手架测试换 16 条接线/零副作用/负向/节流）、`settle`(10)、`growth`(7)、`economy`(9)、`interact`(9)、`mapping`(9)、`persist`(11)、`bridge`(6)、`window`(11)、`settings`(7)、`helpers/mock-api.js`（共享 mock，范式照 `guides-user.md:272-299`，含 overlay 三方法与"禁止调用"间谍） |
| 删除项（D-12，逐条确认） | `greet()` 与其测试 ✅、`api.app.register` 卡片 ✅、`api.views.registerTreeProvider` ✅、`api.registerCommand('pet.hello')` ✅、demo i18n 依赖 ✅（入口零调用 `api.i18n`）；**保留** `api.statusBar.setText('pet.status', …)` ✅（出错换 D-9 文案、恢复清回，index.js:84-95） |

**门槛原始输出（关键行）**

```
npm test（node --test）：ℹ tests 95 / pass 95 / fail 0 / duration 180.93ms
顶层零副作用：node -e "import('./index.js')…" → exports: default | default: function；exit=0（进程自然退出）
validate-manifest（只读现状，manifest 仍脚手架版归卡 09）：0 error、0 warning
git：<EXT> rev-list --all --count = 0（无提交）；<ROOT> HEAD = fbdb882，本卡对 <ROOT> 零写入
```

**scenario 覆盖**：7 份 spec 逐条对照表见回执（pet-vitals 8/8、pet-economy 5/5、pet-growth 4/4、pet-interaction 5/5、pet-sprites 6 本卡+3 归他卡、pet-window 5 本卡+3 归他卡、pet-settings 3 本卡+2 归他卡）；归属他卡的条目（真实窗体呈现、打包物含许可证、manifest 声明等）已在表中标明由卡 03/06/08/09/10/11 承担。

**实现口径（18 条，摘要）**：写盘节流按"显示口径整数签名"判变化（浮点每 tick 都变，按原值判则节流形同虚设）；原子写 = 写 tmp→读回逐字节校验→覆盖（`api.fs` 无 rename，取舍注释 index.js:147-152，残余风险由读档"损坏→备份 .bad+重建"兜底）；设置键写**未取整真值**（99.9 写 99.9，宿主显示 floor、条宽用真值 ⇒ 两者一致）；恢复联动 95 上限"不加也不倒扣"；成长速率用衰减/联动落定后的心情（D-5 步骤序字面）；挂机需显式 `overlayExists:true`（少发可恢复、多发不可回收）；冷却剩余分钟**向上取整**、冷却内点击不推进 `lastPetAt`；`startupReset` 同时重置 `lastInteractAt`（离线不计入睡）但**持久化 `lastPetAt`**（重启不重置冷却）；存档清洗"NaN/字符串→回退初始值、负数/超界→钳制、账本钳回一个周期"；诊断位单槽+同类清除；`transient` 时长 = 各轨一轮总时长并有测试拿真实 pet.json 钉住不漂移；`setMouseThrough` 去重；overlay URL 由 `import.meta.url` 推导 `./dist/index.html`（不硬编码，安装目录是 `pet_chenzhi`）；overlay 创建/销毁走**串行 promise 队列**（toggle 连点按序、销毁优先，替代去抖定时器）；`changed=false` 不 rev+1/不写设置/不写盘，cleanup 尽力落盘一次。

**越界核对**：写入仅 `index.js` + `lib/**`(9) + `test/**`(11)；`<ROOT>` 的 13 条 status 全为卡 02/03 并行改动（开工时为空、全程只读）⇒ **无越界、无提交**。

## 8. 跨卡问题裁定（卡 07 上报）

| # | 问题 | 裁定 |
| --- | --- | --- |
| R14 | `anim.label` 契约歧义：卡 07 按我派卡时的文字实现为**中文**状态名，而卡 08 页面 `app/lib/anim.ts:88 knownStatus()` 只认**英文** key ⇒ 行号渲染全对，但 **sleep 的 ×1.5 慢放与「打盹中（Zzz）」气泡在页面侧失效**（`App.vue:256` 判 `plan.status==='sleep'`），spec 的「打盹为慢放 idle」scenario 会在实机验收失败 | **加法式修正**：`PetStateView.anim` 增补机器可读字段 `status`（9 个英文 key 之一），`label` 保留中文（显示用）；入口 `buildView` 补 `status`，页面 `knownStatus` 优先读 `anim.status`（中文 label 反查仅作兜底）。design D-3 的形状为**加字段**（消费者忽略多余字段即兼容），不改任何已定行为；由**卡 12** 落地 |
| R15 | `scripts/pack.mjs:34` `DIRS = ['dist','assets']` **不含 `lib/`** ⇒ 现状打出的 `.oix` 缺 `lib/*.js`，入口 `import './lib/…'` 必加载失败 | **卡 10 强制项**：`DIRS` 加 `'lib'`（或 FILES 白名单逐一列出），并在卡 10 的回读校验里断言包内含 `lib/*.js`；`test/` 天然不进包（白名单制），无需处理 |

## 9. 卡 12 · cross-card-anim-contract（✅ 完成，R14 落地）

**背景**：卡 07 的 `anim.label` 为中文、卡 08 页面按英文 key 判行为 ⇒ sleep 的 ×1.5 慢放与「打盹中（Zzz）」气泡在页面侧失效。裁定 R14：`anim` 增补机器可读 `status`（英文 key），`label` 保留中文。卡 12 开工时发现 6 处 `deepEqual` 把 anim 钉死为恰好 `{row,label}`（在卡 07 的测试文件里）⇒ **停下报回**；父代理裁定 **R14-A**：三个测试文件纳入卡 12 所有权、**仅限 6 行机械更新**。

**改动清单**

| 侧 | 文件:行 | 改动 |
| --- | --- | --- |
| 入口 | `lib/mapping.js:4-6,86-96` | anim 契约注释 `{row,label}`→`{row,label,status}`；`animOf()` 返回加 `status`（`Object.hasOwn(STATUS_TRACK, status) ? status : 'idle'`，**单一来源 = STATUS_TRACK 键，未新造映射表**）；row/label 与回退口径逐字不变 |
| 入口 | `lib/bridge.js:60-72` | 仅文档注释更新；`buildView` 逻辑零改动（anim 由 animOf 产出，status 自动随发） |
| 入口 | `lib/constants.js` | **零改动**（映射不在它那里） |
| 页面 | `app/lib/state.ts:34-45,160-166,179` | `PetStateView.anim` 加 `status: string`（必填；老/畸形数据归一化为 `''` 表示"没给"）；`normalizeState` 透传；`DEFAULT_STATE` 补 `status:''` |
| 页面 | `app/lib/anim.ts:87-95,97-121,178-197,208-219,221-256` | `knownStatus` 主输入改为 `anim.status`；新增 `LABEL_TO_STATUS` 9 项反查表 + `statusFromLabel`（`Object.hasOwn` 守门，原型链键返回 undefined）仅作兜底；`planForStatus` 加可选 `rowOverride`（**status 只驱动语义不驱动行号**）；`decideAnimation` = `knownStatus(animStatus) ?? statusFromLabel(animLabel)`，D-4 优先级比较逐字未动 |
| 页面 | `app/App.vue:112-121` | plan computed 传 `animStatus: display.value.anim.status`；`maybeShowSleepHint`(:257-263) 与其 watch **零改动**（plan.status 现在能真正到 'sleep'） |
| 测试 | `test/mapping.test.js:168-208` | +2 test：九状态全量（status 回传同名 key、∈ STATUS_TRACK、与 row 自洽、label 仍中文、未知回退 idle）+ **区分度断言**（sleep 与 idle 同 row 0 但 status 不同） |
| 测试 | `test/bridge.test.js:10-13,142-168` | +1 test：buildView 级契约（三视图 anim 逐字含 status、`Object.hasOwn(STATUS_TRACK, status)`、顶层键不变 `['anim','bubble','growth','items','vitals']`） |
| **R14-A 扩权** | `test/extension.test.js:132-133`、`test/interact.test.js:63,76`、`test/window.test.js:247,260` | **仅 6 行机械更新**：期望对象补 `status`（'idle'/'eating'/'playing'/'sleep' 与语义对应）、132 行键列表 `['label','row','status']`；row/label 取值逐字不变 |

**门槛原始输出（关键行）**

```
npm test：ℹ tests 98 / pass 98 / fail 0 / duration 181.54ms（98 = 基线 95 + 新增 3；卡 07 既有断言全保留且通过）
npm run build（先清 dist）：✓ 24 modules transformed；dist/index.html 683B + index-BLnK3bwj.css 4584B + index-DdbsK-p9.js 90662B；✓ built in 690ms
产物 grep 禁止项：backdrop-filter=0、installThemeBridge=0、var(--=0、onclick==0、alert(=0（卡 08 禁止项无回归）
产物 grep 正向：animStatus 读取 8 处、`$f(t.animStatus)??Bf(t.animLabel)`、九键表、反查表 zr、`sleep:{row:0,track:"idle",speed:1.5}`、`Te.value?.status!=="sleep"`
vue-tsc --noEmit -p tsconfig.json：EXIT=0（宿主只读调用，零写入）
git：EXT rev-list --all --count = 0；ROOT HEAD = fbdb882；ROOT 的 3 条新宿主改动（validate-manifest.mjs/SettingsView.vue/manifest-script-parity.test.ts）为并行卡 04 所写，非本卡
```

**父代理只读抽查（在 2/2 到达前独立完成）**：6 行机械更新逐字精确 ✓；`mapping.js` 契约注释与 `STATUS_TRACK` 单一来源 ✓；`anim.ts` 的 `knownStatus(anim.status) ?? statusFromLabel(anim.label)` 优先级链在码 ✓；dist 产物 `animStatus`/`打盹:"sleep"`/`speed:1.5` 在、三项禁止串 0 命中 ✓；区分度断言与 buildView 级断言在码 ✓。

**慢放与 Zzz 气泡接通的证据链**（子代理给出，含最小运行验证）：`App.vue:116` 传 status → `anim.ts:237` 优先 status → 命中 'sleep' → `planForStatus(..., rowOverride)` → `STATUS_TRACK.sleep.speed=1.5` → 逐帧 `Math.round(base*1.5)`；同时 `plan.status='sleep'` ⇒ `App.vue:257` 弹「打盹中（Zzz）」。esbuild 实跑：sleep 的 plan.durations = `[600,600,750,600,600,750]`，**与入口侧 `frameDurations(petJson,'sleep')` 的既有测试断言值逐字一致**（两卡帧时长契约对齐的直接证据）。

**负向自检**：缺 status（老数据）⇒ label 反查兜住、慢放不丢；`status='bogus'` ⇒ 反查兜住；status+label 全废 ⇒ row 兜底不崩；`status:'sleep'` 但 `row:3`（畸形冲突）⇒ **以 row 渲染且慢放仍生效、Zzz 可达**（status 只驱动语义）；label 缺失 ⇒ 显示走页面 TEXT 表、无英文 key 外露；anim 整体缺失 ⇒ 属性判定兜底 idle；`statusFromLabel('toString')` ⇒ undefined（原型链守住）。

**越界核对**：写入 10 个文件全在所有权（含 R14-A 扩权的 3 个测试文件、仅 6 行）；未碰 `index.js`/`manifest.json`/`scripts/pack.mjs`/`README.md`/`package.json`/`vite.config.ts`/`tsconfig.json`/`assets/**`/app 其余文件/`openspec/**`/宿主；6 行之外零变化的三重证据（原始 `\n` 计数 341/120/262 不变、5 次编辑均字面唯一匹配、编辑区域重读与开工快照逐字比对）⇒ **无越界、无提交**。

## 10. 卡 04 · host-progress-field（✅ 完成，两处偏差经核实接受）

**改动清单**（4 个文件，均在所有权内）

| 文件 | 关键改动 |
| --- | --- |
| `src/renderer/src/extensions/settings/SettingsView.vue` | `:476` `PROGRESS_FIELD_TYPE` 常量（同 `MODAL_FIELD_TYPE` 约定）；`:506` `progressMetrics` 纯函数（钳制/取整/条宽口径）；`:519` `warnedProgressFields`（warn 按 slot 去重）；`:528` `progressView`（经 `fieldValue` 取值 ⇒ 与 status/text 同一条 `settingsRevision` 响应式路径；无值回退 `default`；非数字按 0 + 一条 warn）；`:933-949` 链上分支 `v-else-if="field.type === PROGRESS_FIELD_TYPE"`：`role=progressbar` 槽（`--bg-input`）+ 填充（`--accent`，`:style` 绑未取整 width%）+ 右侧 `{cur}/{max}` 文本；**零 input/select/button/textarea、零 @change**；`:1005` description 条件加 `field.type !== PROGRESS_FIELD_TYPE`；`:1189-1207` 样式全走既有 token（无新增 token、无写死色值），标签沿用 `.config-row label`（块级左对齐，design 硬约束 3） |
| `scripts/validate-manifest.mjs` | 新增 `SETTING_FIELD_TYPES` 白名单（含 progress，与宿主 `SettingFieldType` 逐字一致）+ `checkSettings`/`checkSettingsField`：type 白名单、key/label 非空、`max` 出现必须 >0 有限数字（错误文案逐字用卡面示例）、progress 的 `default` 出现必须为数字（越界不报错，注释写明渲染时钳制）；`validateManifest` 改具名导出 + CLI 包进 `isMainModule()` 守卫（execFileSync/直接执行行为不变，被 import 时不跑 CLI） |
| `test/manifest-script-parity.test.ts` | 头注释记录 settings 段为"脚本独有静态收紧"及理由；新增 1 条 it（20→21）：两侧源码解析白名单逐字相等（含顺序）+ 显式含 progress |
| `test/settings-progress-field.test.ts` | 新建 22 条，验收①-⑨ 全覆盖：node 环境无法挂载 .vue（仓库先例即源码门禁）⇒ ①②⑦ 源码接线断言；③④⑤⑥ 把 .vue 里**真实实现**（progressMetrics/progressView/fieldValue/fieldSlot/warnedProgressFields 五段声明）原样提取、经 typescript（devDep，非新增依赖）转译后注入真 stateStore + 真 vue ref/computed 跑行为用例；⑧ `%TEMP%` 临时 manifest 走 CLI + 模块直喂 Infinity/NaN；⑨ 与 parity 同款白名单差分 |

**门槛原始输出（关键行）**

```
typecheck：0 error
lint：0 error（仅既有 4 条 warning，在 test/settings-network-layout.test.ts，未触碰）
npm test：777 passed | 5 skipped（基线 754 + 新增 23 = settings-progress-field 22 + parity 1）
关键门禁：settings-view-wiring 25 全绿、manifest-script-parity 21 全绿、manifest 34 全绿
git：HEAD 仍 fbdb882；diff --cached 空；卡 02/03 的 13 处未提交改动原样保留
```

**偏差 A（progress 分支位置）——核实后接受**：任务卡建议"放在 status 之后"，但 `settings-view-wiring.test.ts`（只读、必须保持 25 条全绿）`:488` 把链上带引号字面量分支钉成**恰好六项**、`:492-502` 把「directory 尾→status 起点」「status 尾→兜底」两段缝隙钉成紧邻 ⇒ "status 之后"**没有合法插入点**。实现改用 `PROGRESS_FIELD_TYPE` 常量（该测试自己留下的 `MODAL_FIELD_TYPE` 先例）放在唯一未被钉死的链上位置（select 之后、directory 之前）。硬要求全满足：仍在链上、仍在兜底 `v-else` 之前（测试①钉住）、链完整（测试⑦钉住七种字段按序各恰好一个分支：text→number→boolean→select→progress→directory→status→兜底）。spec 只要求"渲染成条、不可编辑、不显示 description"，不规定链上位置 ⇒ 不构成规格偏离。
**偏差 B（校验脚本此前完全没有 settings 校验）——核实后接受**：`scripts/validate-manifest.mjs` 与 `core/manifest.ts` 此前都**没有** settings 校验（grep 核实），白名单段是本次新增；属**脚本独有静态收紧**（宿主运行期对未知类型走兜底渲染而非清单 error），理由与"差分 fixture 不受影响"（现有 fixtures 无非法 settings）已写进脚本与 parity 测试注释。刻意不对称已留痕（见 R17）。

**移交事项**：① docs 同步（`manifest-reference.md` 的 settings 校验规则、`themes-settings.md:155` 字段表补 progress）⇒ **卡 05**（已派发，任务书含此两条）；② `core/manifest.ts` 不校验 settings 的刻意不对称 ⇒ 记 R17，将来若要求两侧对齐需另开卡；③ `extensions/pet/manifest.json` 未动（卡 09 加 progress 字段后可直接过新校验）。

## 11. 跨卡裁定补充

| # | 事项 | 裁定 |
| --- | --- | --- |
| R16 | 卡 04 偏差 A：progress 分支放 select 之后、directory 之前（非任务卡建议的 status 之后） | **接受**：`settings-view-wiring.test.ts` 钉死链上字面量分支为六项且缝隙紧邻，"status 之后"无合法插入点；常量写法沿用该测试自己的 `MODAL_FIELD_TYPE` 先例；spec 不规定链上位置 |
| R17 | 卡 04 偏差 B：`validate-manifest.mjs` 新增 settings 校验为**脚本独有收紧**（宿主 `core/manifest.ts` 不校验 settings，运行期对未知类型走兜底渲染） | **接受并留痕**：静态收紧有利于"装前就报错"；不对称已在脚本与 parity 测试注释记录；若将来要求两侧对齐，另开卡改宿主并补 parity fixtures |

## 12. 卡 09 · ext-manifest-settings（✅ 完成）

**改动清单**：唯一写入 = `<EXT>\manifest.json`（脚手架 46 行 → 目标形状 23 行，1,007 B，UTF-8 无 BOM，首三字节 `123,10,32`）。

最终 manifest（全文，逐字）：

```json
{
  "name": "pet",
  "version": "1.0.0",
  "displayName": "宠物",
  "author": "chenzhi",
  "description": "桌面宠物：右下角无边框透明窗体，喂食/洗澡/玩耍影响饥饿度、清洁度与心情",
  "apiVersion": 2,
  "main": "./index.js",
  "contributes": {
    "statusBarItems": [
      { "id": "pet.status", "name": "宠物", "text": "宠物", "alignment": "right", "priority": 10 }
    ],
    "settings": {
      "id": "pet.settings",
      "title": "宠物",
      "fields": [
        { "key": "pet.visible", "label": "显示宠物", "type": "boolean", "default": true },
        { "key": "pet.hunger", "label": "饥饿度", "type": "progress", "max": 100, "default": 100 },
        { "key": "pet.clean", "label": "清洁度", "type": "progress", "max": 100, "default": 100 },
        { "key": "pet.mood", "label": "心情", "type": "progress", "max": 100, "default": 100 },
        { "key": "pet.diagnostic", "label": "诊断", "type": "status", "default": "" }
      ]
    }
  }
}
```

删除项：`contributes.views`（`pet.tree`）、`contributes.commands`（`pet.hello`）、`contributes.i18n`（demo 词条）、`statusBarItems[0].command`（悬空引用，见 R19）。新增：`apiVersion: 2`（与 ROOT `package.json` 读出比较，非硬编码）+ `contributes.settings`（单个对象，形状依 `manifest-reference.md:150-169`）。五字段**零 description**；contributes 键集恰为 `{statusBarItems, settings}`（后台扩展，无卡片）。

**门槛原始输出（关键行）**

```
node <ROOT>\scripts\validate-manifest.mjs <EXT>\manifest.json → ✓ 通过；0 个 error、0 个 warning
Node 断言脚本（%TEMP%）：44 条全 PASS（键集/顺序/类型/max/description/apiVersion/中文无损/无 BOM）
npm test → ℹ tests 98 / pass 98 / fail 0（卡 07 测试不读 manifest，条数不变）
git：EXT rev-list = 0；mtime 铁证 = 会话窗口内仅 manifest.json 被写（02:34:54）；ROOT 零写入、HEAD fbdb882
```

**负向自检（10 组夹具，%TEMP% 副本，仓库 manifest 哈希前后一致未污染）**：F01 `type:'gauge'` / F03 `max:0` / F04 `max:-5` / F05 `max:'100'` / F06 `default:'abc'` / F07 缺 key / F08 缺 label / F09 `apiVersion:3`（报「需要 obox API v3 或更高（当前 obox 为 v2）」）/ F10 `apiVersion:'2'` ⇒ 各 1 error、中文可执行；**F02 `progress` 缺 `max` ⇒ 0 error**（见 R18）。

## 13. 跨卡裁定补充（二）

| # | 事项 | 裁定 |
| --- | --- | --- |
| R18 | 卡 09 负向清单 F02（"`progress` 缺 `max` ⇒ 报 error"）与卡 04 已落地规则冲突（`max` 可选、出现才校验、缺省 100，`contributions.ts:124`） | **任务卡负向清单写错，实际行为正确**：缺 `max` 合法（0 error）。仓库 manifest 三行 progress 均显式写 `max:100`，不受影响。不改脚本 |
| R19 | 脚手架 `statusBarItems[0]` 带 `"command": "pet.hello"`，而该命令属必删 demo（D-12） | **删除该键**（保留 `id/name/text/alignment/priority`），否则成悬空引用。状态栏项仍可被 `api.statusBar.setText('pet.status', …)` 写文本（卡 07 已用） |

## 14. 卡 10 · ext-pack-readme（✅ 完成）

**改动清单**（4 文件，均在所有权内；`package.json` 核对后**零改动**）

| 文件 | 改动 |
| --- | --- |
| `scripts/pack.mjs` | **R15 修复**：`DIRS` `['dist','assets']` → `['dist','assets','lib']`；`SKIP_DIRS` 增 `openspec/docs/test/app`；新增 `FORBIDDEN_PREFIXES = ['data','node_modules','out','openspec','docs','test','app']`，collect() 兜底从"仅 data/"扩到全部禁止前缀（写盘前 throw）；**新增回读自检** `readZipCentralDirectory()` + `verify()`：断言必需条目（manifest.json 根条目精确名 / index.js / dist 三件 / assets/whale 四件 / **lib 下 9 个 .js 逐一在包内且数量恰为 9**）、禁止前缀不存在、路径全正斜杠（无反斜杠/绝对/`..`/空段/`./`）、条目 ≤10000、解压 ≤512MB；任一不过 ⇒ 打印全部违规、**删除产物**、exit 1 |
| `.gitignore`（新建） | `node_modules/`、`dist/`、`out/`、`*.log`、`.eslintcache`（R9） |
| `README.md` | 全文重写（中文无 BOM）：三处可见面、玩法数值表、设置页说明（含"关 = 销毁窗体省 CPU"+ 实测 2.18%→0.0ms）、最低宿主版本（apiVersion ≥ 2 + 拒绝加载文案）、安装与 `--debug-extension` 调试、打包清单与回读自检、**五条平台限制逐条标实机验证状态**、无主题豁免理由（D-6）与"不用 backdrop-filter"理由、**素材出处与许可证**（引用 PROVENANCE §7 分层口径 + §8 未获背书句 + §9 快照版清单与"升级须走新 change" + 替换条款） |
| `package.json` | **零改动**：`scripts.pack` 已自带先 build；devDependencies 为 `@vitejs/plugin-vue/vite/vue`、**没有 typescript**（node_modules 与 lock 中亦无）⇒ 卡面"若已有 typescript 而缺 vue-tsc"条件不成立，按最小改动不加 vue-tsc/typecheck 脚本（避免留跑不通的脚本） |

**门槛原始输出（关键行）**

```
npm run build（先清 dist）：✓ 24 modules transformed；✓ built in 452ms；exit 0
npm run pack：[pack] 已打包 out\pet-1.0.0.oix（18 个条目，1620364 B）；[pack] 回读校验通过：18 个条目，解压总量 1716270 B
tar -tf out\pet-1.0.0.oix：18 行与 pack 自检列表逐条一致（manifest.json / index.js / dist×3 / assets/whale×4 / lib×9）
validate-manifest：0 error、0 warning
npm test：98/98 不变
git status（EXT）：820 → 75 行（node_modules 743 条与 dist 3 条消失；out/ 0 条）；pack 后复测仍 75
git：EXT rev-list = 0；ROOT HEAD = fbdb882、ROOT 零写入
```

**负向自检**：A）副本工程把 `data/` 塞进 `DIRS` ⇒ collect() 写盘前抛错 exit 1、无产物（forbidden 兜底扩围生效）；B）副本还原旧 `DIRS=['dist','assets']` ⇒ 复现 9 条目坏包，**新增回读断言当场列出缺失的 9 个 lib 文件、删除产物、exit 1**（证明 R15 修复前入口必加载失败、修复后被自检拦截）。

**越界核对**：仅写 `scripts/pack.mjs`/`README.md`/`.gitignore` + 产物 `out/pet-1.0.0.oix`（gitignore 覆盖）；`package.json`/manifest/index.js/lib/test/app/vite.config/tsconfig/assets/openspec/宿主 一律未动 ⇒ **无越界、无提交**。

## 15. 卡 11 · verify-real-window（🔄 进行中，`e6ee41d5`）

派发要点（任务书已钉死）：关已安装的 1.0.15 → dev 宿主 + `--debug-extension pet@<EXT>`（不装 .oix）→ 全程不开 DevTools → 八项验收（定位公式 / 空白区像素判据 / WindowFromPoint 穿透 + 桌面右键菜单 / toggle 销毁重建 + CPU 回落 / webp 边缘放大目检 / 设置页三行进度条与当帧刷新 / 五通道交互回包与动画行 / 停用即回收）→ 证据落 `notes/evidence/real-window.md`；**注入式输入不可信**（卡 01 结论）⇒ hover/点击类交互留"需用户物理确认清单"；不改任何实现代码，缺陷只记录；验收结束关 dev 实例。

## 16. 卡 05 · host-docs-sync（✅ 完成）

**改动清单**（5 文件：4 份真相文档 + 宿主 README 两行；skills 经 grep 判定零同步义务）

| 文件 | 新增/修正 |
| --- | --- |
| `docs/extension-api/api-reference.md` | 新增 `### overlay` 小节（7 个子小节：三方法签名 / 参数契约与校验 / 作用域安全 / 生命周期 / 窗体参数与定位 / 消息桥五参数与 url 双重校验 / 透明五处绘制点 / 平台限制与取舍）；`### app.onMessage` 补 overlay 路由与 60s 超时复用；`### settings` 字段清单**改为引用 themes-settings.md**（唯一真相，不复制副本）；`## 方法总览`/`## 类型文件位置` 补 overlay；顺带修正约 25 处漂移锚点 |
| `docs/extension-api/manifest-reference.md` | `apiVersion` 当前 `1` → **`2`** + 递增理由；新增 `#### settings 字段校验（脚本独有静态收紧）`（8 条规则 + 逐字错误文案 + 白名单同序 + 刻意不对称说明 + parity 不受影响 + `core/manifest.ts` 不校验 settings 的留痕）；`### settings` 补 `progress`/`max?` 与示例；error 表补 settings 行（标注仅脚本）；修正约 15 处漂移锚点 |
| `docs/extension-api/themes-settings.md` | 字段类型列表补 `progress` + `max?` + 两道防漂移门禁出处；新增 `#### progress 字段（只读进度条）`（10 条：只读语义/同存储同刷新/max 缺省 100/显示口径/不渲染 description/非数字按 0 + 去重 warn/只用既有 token/老宿主兜底成可编辑 text + apiVersion 出路/overlay 不消费 token）；主题下发协议节补 overlay（**按代码实际：不触达**，见 R20）；修正约 20 处漂移锚点（含把失效的 `activateExtensions: !isAppWindow` 更正为 `!isChildWindow`） |
| `docs/extension-api/troubleshooting.md` | 新增 4 条：`## 34 透明 overlay 看起来不透明`（五处绘制点排查表 + 参数组合实测 + 4 条平台限制 + 自查命令）、`## 35 overlay 吞桌面点击/点击不响应`（整窗切换取舍 + forward 对注入输入间歇性失灵 + WindowFromPoint 复核判据）、`## 36 overlay 里 alert/confirm/prompt 无效`、`## 37 overlay 页面收不到消息`（五参数/拒载/handler/60s/已销毁/主窗口不可用）；修正 9 处漂移锚点 |
| 宿主 `README.md` | 仅 2 行：`main/appWindow.ts` 补 overlay IPC 职责；`AppWindow.vue` 改为"App 子窗口 / overlay 窗体的共用外壳"（AGENTS.md 的"架构变化（IPC 能力）"同步义务） |

**自核对六项（全过）**：① `api.overlay` 三方法名+参数名与 `src/api/types.ts:207-234` 逐字一致，MISSING 0；② `CreateOverlayRequest` 九字段与 `src/shared/types.ts:527-553` 一致，MISSING 0；③ 脚本白名单与 manifest-reference 新小节**逐字同序**一致；④ themes-settings 字段列表与 `SettingFieldType` 逐字同序一致（api-reference **故意不含**该串，改引用）；⑤ 全部"已实机验证"句都指到卡 01 证据文件或卡 03/04 测试文件，4 条平台限制与多显示器/混合 DPI 一律标"**未实机验证**"并附证据出处（21 处标注逐条复核）；⑥ 临时脚本把四份文档指向"被改过文件"的每个 `文件:行` 解析当前内容逐条核对，修正约 60 处漂移；markdown 表格列数一致；`60_000` 确认全文件仅 `appWindow.ts:193` 一处设定。

**skills 判定**：九个 skill + 两个脚手架脚本 grep（`apiVersion`/`SettingFieldType`/`字段类型`/`overlay`/`透明`/`progress`/`窗体`/`api.overlay`）**全 0 命中**（`directory`/`status` 的命中经逐条看原文均为 PowerShell 参数或 git status）；skills 对 API 只写文档路径与章节名（唯一真相不复制副本）⇒ 零同步义务。脚手架对 `validate-manifest.mjs:39`/`core/manifest.ts:11` 的引用仍正确（卡 04 改动在 :220 之后）。

**越界核对**：仅 5 个所有权内文件；卡 02/03/04 的 14 改 + 3 新测试原样保留；无 commit/add/push/stash；HEAD 仍 `fbdb882`；核对用临时脚本曾误建在仓库根、已移出并确认不存在。

## 17. 跨卡裁定补充（三）

| # | 事项 | 裁定 |
| --- | --- | --- |
| R20 | 卡 05 发现任务卡 C.3 措辞与代码不符：overlay **收不到**主题推送（`AppWindow.vue:161-171` 的 `pushThemeTokens()` 首行 `if (!registration.value?.url) return`，overlay 不进 appStore ⇒ registration 恒 undefined） | **文档按代码写**（"复用同一外壳，但本协议对 overlay 不触达；需要 token 只能走消息桥"）。任务卡措辞有误，以代码为准 |
| R21 | 任务卡 A.1 的"11 个 BrowserWindow 选项"与代码/测试不完全一致（代码 18 个顶层选项；测试钉的 11 个不含 `backgroundColor`、含 `acceptFirstMouse`） | **文档按代码 + 测试写全 18 项**，并注明那 11 项的门禁出处（`test/overlay-window.test.ts:244-268`） |
| R22 | `src/renderer/src/core/host.ts:779-780` 两条相邻 JSDoc 错位（`showNotification` 的描述被 `showUiModal` 隔开）；`git show HEAD` 证明为**既有**问题、非本次引入、不影响行为 | **不动**，留档；将来有宿主代码卡时顺手调顺序 |
| R23 | 卡 05 发现 `guides-user.md` / `guides-builtin.md` 的 `文件:行` 锚点因卡 02/03/04 大面积漂移（且部分错锚点早于本次存在）；这两份不在卡 05 所有权内（我派卡时漏列） | **追加卡 13 · guides-anchor-resync**：只修这两份文档的锚点（按当前工作区内容重解析），纯文档不跑门槛；与卡 11 并发安全（文档不进运行时） |

## 19. 卡 11 · verify-real-window（✅ 完成，八项全过，实现级缺陷 0）

**证据文件**：`notes/evidence/real-window.md`（新建，无 BOM）；截图/脚本/日志在 `%TEMP%\pet-e2e\`（01-fullscreen、02-overlay-region、03-desktop-ctxmenu、04-hover-panel、05-sprite-4x、05b-sprite-head-4x、06-overlay-gone、07-bubble-on、08-bubble-off + dev.log×3 + poll-final.json）。

**八项结论（硬数据）**

| # | 结论 | 关键数据 |
| --- | --- | --- |
| ① 自动出现于右下角 | 通过 | overlay target 存在；`screenX/Y=2316,908`、220×460，与 `x=workArea.x+w-220-24`、`y=workArea.y+h-460-24` 逐项相等（workArea 2560×1392）；dev.log `[overlay] 已创建 …默认鼠标穿透=true` |
| ② 空白区完全透出桌面 | 通过 | 有窗/无窗同点 `#E8FDB2`/`#ADD999`，差 0 ≤ 2/255 且非 `#1e1e1e`/`#ffffff`；精灵点 `#3F7CC8`/`#A8B0C1` 非透明；在本扩展真实页面完成 |
| ③ 穿透与命中 | 通过（自动化部分） | 穿透态 `WindowFromPoint`=SysListView32/Progman（桌面）；合成右键⇒桌面菜单弹出且 overlay 页 `POINTERDOWN=0`；CDP 悬停精灵⇒面板开、命中 `Chrome_RenderWidgetHostHWND`（本窗）；移出⇒恢复桌面命中；dev.log 穿透 false/true 成对。**真实鼠标体验留用户清单** |
| ④ toggle 销毁/重建 + CPU | 通过 | 关⇒overlay+iframe target 消失、electron 进程 7→5、CPU **296.9ms/10s → 0.0ms/10s**；开⇒target 回归、三行 84/97/97 **连续未重置 100** |
| ⑤ webp 边缘 | 通过 | 4× 放大无白/黑 halo；屏幕 1px 淡紫边经源图 canvas 仲裁为 artwork 自带线稿（(133,94,160,a=217) 等高 alpha），白色残边仅 a≤3（不可见）⇒ 无需改 PNG/内缩 |
| ⑥ 设置页三行进度条 | 通过 | 三行 `role=progressbar` + `aria-valuenow=89/98/98` + 文本 `NN/100`、**无 description 节点**、toggle 在、诊断行「（无）」；**向下取整实证：真值 89.9994 → 显示 89**；互动后不重进页面再读 98/100/100/100（当帧刷新） |
| ⑦ 五交互与气泡 | 通过 | feed×3 `ok:true`（fish 3→0、row4/eating）、feed#4 `{ok:false,error:'没有小鱼干了（挂机 20 分钟可得 1 条）'}` **逐字**、bathe row3/bathing、play row7/playing、pet row3/petted；气泡文本与 feedback 一致、~2.6s 消失（截图 07/08）。口径注：桥级调用不经过页面 `interact()`，ok 类气泡经 subscribe 推送到达；道具不足无页面气泡属该口径预期（非缺陷） |
| ⑧ 停用即回收 | 通过（替代路径） | 调试态无 UI 停用入口（`ExtensionManagerView.vue:361` 对 `source==='debug'` 隐藏）⇒ 不带 `--debug-extension` 重启⇒无 overlay/无 `[overlay]` 日志/状态栏无「宠物」/设置树无宠物节点；带扩展重启⇒overlay 恢复 @(2316,908)。回收链（销毁→target 消失→进程退出→CPU 0）由④覆盖 |

**附加观测**：`[overlay]` 日志 7 条（创建×3/穿透×2/销毁×2），**无越权拒绝、无非法 url 拒绝**（正常路径不应出现）；查询串五参数逐字实读；30s 长轮询窗 2 次往返、rev 39→40 随 15s tick 递增、无订阅失败 warn；状态栏「宠物」常态、诊断位常态「（无）」。

**缺陷清单（只记录不修）**：实现级 **0 项**。文档级 2 条：
- **D-1**：页面侧"道具不足坏气泡"分支（`App.vue:330`）UI 不可达（按钮道具不足即禁用，`PetPanel.vue:75,78`）⇒ 属防御分支；建议在 design 注明其定位（见 R24）。
- **D-2**：调试态停用不可触发 ⇒ ⑧ 的 installed 态全路径未实机覆盖；建议把"调试扩展生命周期只由 CLI 控制"写入 `guides-user.md`（落点 `ExtensionManagerView.vue:361` 的说明）——该文件正属在跑的卡 13，**等 13 收尾后再处理**，避免抢所有权（见 R25）。

**需用户物理确认（30 秒，证据文件第 4 节同款）**：真鼠标悬停出面板/移开恢复穿透；点喂食/洗澡/玩耍看动画+气泡、喂到 0 按钮灰；点宠物摸头+冷却文案；空白处拖图标/右键应落到桌面；设置 toggle 关/开窗体与数值连续。

**合规**：双仓无新提交（host HEAD `fbdb882`、ext 0 提交；status 与开工前逐字一致）；仓库内唯一新增 = 证据 md；dev 实例（npm 52980/52236/41388 及 electron 子进程）**已全部关闭**，5173/9333 无监听；未改任何实现代码/spec/任务卡。

## 20. 跨卡裁定补充（四）

| # | 事项 | 裁定 |
| --- | --- | --- |
| R24 | 卡 11 D-1：页面侧"道具不足坏气泡"分支 UI 不可达（按钮禁用即不可点） | 属**防御分支**（桥级/畸形路径仍可能触发）；不删代码；在 ship 步把"该分支为防御性、正常 UI 不可达"一句补进 design 的 D-9 说明（ship 允许补记，不改行为） |
| R25 | 卡 11 D-2：调试态无停用入口 ⇒ installed 态停用回收未实机覆盖；建议 guides-user.md 补"调试扩展生命周期只由 CLI 控制" | **等卡 13 收尾后**以最小改动补进 `guides-user.md`（该文件此时空闲）；installed 态回收链已由④（toggle 销毁）+「不带扩展重启」两条证据覆盖，风险低 |

## 21. 卡 13 · guides-anchor-resync（✅ 完成）

**结果**：两份 guides 的 **73 处** `文件:行` 锚点逐条对**当前工作区代码**核对（每条锚点配"按区间的代码特征签名"做可复核判定）：修前 `PASS=39 / MISMATCH=34 / unbound=0` ⇒ 修后 `PASS=73 / MISMATCH=0 / unbound=0`；markdown 表格 4 表 0 MISMATCH。
**修正分布**：guides-user.md 25 处、guides-builtin.md 9 处；覆盖卡 05 点名的全部漂移 + **早于本次就错**的历史锚点（oixCore.ts 的 deriveDirName/readRootManifest/resolveEntry/限额常量、AppWindow.vue 的窗口控制与 obox-extension/requestId、api/types.ts 的 registerTreeProvider 等）。**39 处核实无误保留**。**"无法自动修正"清单 = 空**（73 处全部能唯一定位，无一降级为函数名引用）。
**overlay 指引句**：guides-user.md 第 5 节末尾加一句 bullet（指向 api-reference.md 的 `### overlay`，点明三点差异：不进 appStore / 不渲染 TitleBar·PromptHost / 主题推送不触达），三点均对码核实，未复制契约细节。
**合规**：`git diff --stat` 只含这两个文件（builtin 9+/9−、user 24+/23−，多的 1 行即 overlay bullet）；逐 hunk 只有行号/区间变化 + 那一行新增，无语义改写；HEAD 仍 `fbdb882`、暂存空、无提交；纯文档跳过本地门槛。
**方法学留痕（环境陷阱）**：本机 pwsh 是 PowerShell 5.1，`Get-Content`/`>` 按 GB2312 解码 UTF-8 中文会**吞换行/串行号**（host.ts 实测报 1349 行、真实 1420 LF）⇒ 行号一律以 node 读文件或 `git grep -n` 为准（记 R28，后续卡与 ship 步沿用）。

## 22. 跨卡裁定补充（五）与收尾小修

| # | 事项 | 裁定/处置 |
| --- | --- | --- |
| R26 | 卡 13 发现 `docs/extension-api/manifest-reference.md:12,23` 的 `main/oixCore.ts:50-54` 错锚（deriveDirName 实在 56-60；50-54 是 OixInstallError 构造器）——卡 05 写入时即错 | **父代理直接修**（2 处，replace_all）：`50-54` → `56-60`。属文档锚点勘误，不改语义 |
| R27 | 卡 13 发现 `src/main/appWindow.ts` 工作区为**全 CRLF**（590 CRLF / 0 LF），其余被改文件均 LF | **不处置**：`.gitattributes` 为 `* text=auto eol=lf`，提交时 git 归一为 LF，仓库内容不受影响；卡 03 的 lint 0 error 佐证 prettier 未报 CRLF 噪音。留档备查 |
| R28 | pwsh 5.1 的 GB2312 解码会吞 UTF-8 中文文件的换行 ⇒ 行号核对不可信 | 后续一律用 node / `git grep -n` 做行号核对（卡 13 方法学） |

## 23. 用户实机反馈与范围变更（R29）

**物理确认（部分）**：用户真鼠标实机交互后反馈两条：① **拖宠物本体不动**——经澄清属本轮 Non-Goal（design Non-Goals「不做拖动换位」），**非缺陷**；② **动作偏少**，对照 dsh-pet 缺：`running-left/right` 两轨空着（踱步）、拖动换位、面板隐藏/召唤按钮。其余步骤（面板/气泡/穿透/toggle）用户**未报异常**。卡 11 的"需用户物理确认"清单中第 4 步（空白处拖桌面图标）用户未执行，穿透的拖拽情形仍以卡 11 自动化证据（右键菜单 + WindowFromPoint）为准，标注"拖拽情形未实机验证"。

**差距对照表（dsh-pet vs 本轮）**：dsh-pet 有 9 轨动画 + 拖动换位 + 隐藏/召唤 + 改名 + 会话活动驱动；本轮用 7 轨（`running-left/right` 空）、无拖动、隐藏只有设置页 toggle、改名被用户替换为洗澡、无会话活动驱动（obox 无 LLM 事件，grill Q1 已定）。

| # | 事项 | 裁定 |
| --- | --- | --- |
| R29 | 用户裁定把三条新需求（**拖动换位 / 踱步用满 running-left·right / 面板隐藏+召唤**）**并进本轮 change**（选项 B：回退重跑），而非开 change #2 | 按链条回退：grill 增补（Q9–Q11）→ proposal/spec 增补 → design 增补 → validation 复跑 → 新任务卡 → dev → 卡 11 证据重跑（受影响项）→ check → ship。已验证部分尽量复用 |
| R30 | 三条新需求的**技术边界**（父代理查实，供 grill 提问用） | 拖动：页面不能自移窗体 ⇒ 宿主需新增 `api.overlay.setPosition(id,x,y)`（作用域同既有三方法）；位置持久化在扩展 `state.json`；`anchor` 退化为"无存档位置时的默认值"。踱步：窗体 220 宽、精灵格 192 宽 ⇒ 窗体内仅 28px 位移；要走出"来回走"需加宽窗体或让窗体沿屏幕底边行走（复用 setPosition）。隐藏/召唤：**零宿主改动**可行——隐藏态 = 同窗体只渲染小召唤按钮（其余继续穿透、停 rAF ⇒ CPU≈0） |

## 24. 增补轮（R29）规格/设计/校验/任务卡落地记录

- **grill**：增补 Q9–Q13 入 `notes/grill.md`（拖动=任意位置+持久化+钳主显示器工作区；踱步=原地小跑、`running-left/right` 不用；隐藏=同窗体召唤胶囊+持久化+设置优先；文案=上游逐字五句+禁数字时间；面板=不显示三属性+禁属性增量数字）。顺带清理了文件里早期遗留的重复「已关闭/显式延后」表与错位的 Q8。
- **proposal**：What Changes 增第 7 条（trot 与 running-left/right 声明）与第 8 条（拖动+隐藏/召唤）、宿主第 3 条扩为四方法（含 `setPosition`）；Capabilities 三行（pet-window / pet-interaction / pet-sprites）补增补语义；Impact 数据节补 `state.json` 的 `position` / `hidden`（`schemaVersion` 仍为 1，缺字段按默认值清洗）。
- **specs**：`pet-window` +2 requirement（拖动 3 scenario、隐藏 3 scenario）；`pet-sprites` +1（trot 3 scenario，含 `running-left/right` MUST NOT 使用声明）；`pet-interaction` 面板 requirement 改（MUST NOT 显示三属性、四按钮）+2（summon 1 scenario、文案 2 scenario）。合计 **27 requirement / 56 scenario**。
- **design**：D-4 状态表加 `trot` / `hidden` 两行与优先级行（hidden 不参与轨优先级）；D-4 气泡文案与 D-9 道具不足文案换 D-16 口径；Non-Goals 重写（删"不做拖动换位"，加"不做重置位置按钮/副屏/面板属性/文案数字"四条）；**新增 D-13（拖动）/ D-14（trot）/ D-15（隐藏召唤）/ D-16（文案总表 + 两条正则硬规则）**；UI 视觉规范删属性小条色值行、面板改四按钮且无属性行、加召唤胶囊样式、硬约束 3 改落设置页；UX 加第 8/9/10 步；Risks 加 R10（拖动并发）/ R11（胶囊命中）/ R12（上游文案漂移不自动跟随）。
- **validation 第四轮**：增补面九维度复审无严重问题；新宿主面仅 `setPosition` 一个方法（先定规格后实现，与当初三方法同性质）；`state.json` 加字段不改 `schemaVersion`；新增证据不足项 **N9**（拖动/隐藏/trot 未实机）与 **N10**（文案逐字一致目前靠人工比对上游源码）⇒ 转卡 16。
- **任务卡**：新增 `14-host-overlay-setposition.md`（宿主 setPosition + api-reference 同步 + 两测试文件）、`15-ext-actions-v2.md`（扩展拖动/隐藏/trot/文案/面板/README）、`16-verify-actions-v2.md`（增补实机复验 + 回归卡 11 的②④⑥）；`tasks.md` 增组 6（14∥15，跨仓库）与组 7（16），5.1 标为已完成。
- **派发**：卡 14 = `39f8fe15`、卡 15 = `423edcfc`（并行）。父代理裁定补充：① `OverlayResult` 增可选 `position`（**create 与 setPosition 都回传实际坐标**，见 R31；最初派发时写的是"仅 setPosition"，卡 15 中期发现缺口后扩展为两者）；② 几何钳位分工 = "入口拒 NaN/Infinity，宿主兜底钳主显示器工作区"（入口拿不到 workArea，见 R33）。

## 25. 增补轮裁定（六）

| # | 事项 | 裁定 |
| --- | --- | --- |
| R31 | 卡 15 中期发现 D-13 真实缺口：`createOverlayWindow` 只返回 `{ok:true}`，而入口**拿不到 workArea** ⇒ 首次拖动（存档无 position）没有绝对基准把 dx/dy 换算成 `setPosition` 的绝对坐标。卡 15 临时用"`setPosition(1e7,1e7)` 让宿主钳位后反推 anchor 默认位"的标定探测（能跑，但绕路） | **宿主侧修正**：`api.overlay.create` 成功返回也带 `position:{x,y}`（= `overlayPosition(...)` 已算出的实际绝对坐标，`appWindow.ts:493-497` 日志已在打印，复用同一份不重算）；`OverlayResult.position` 语义扩为"create 与 setPosition 都回传实际坐标"；卡 14 追加测试（anchor 的 create 回包 position 等于公式期望值、失败路径不带 position、既有断言回归）与 api-reference 同步。卡 15 按"主路径（create.position）+ 兜底（标定探测，注释标明 R31 后仅兼容用）"两层实现，零返工 |
| R32 | 面板"隐藏"按钮的通道 design/spec 未点名（spec 只定义 `summon` 为第五种 kind） | **采纳卡 15 的对称实现**：`pet.interact { kind:'hide' }`（第六种 kind），与 summon 同样不耗道具/不改数值/不弹气泡。design D-15 与 `specs/pet-window`、`specs/pet-interaction` 已同步补通道名与 kind 计数（父代理改规格，卡 15 不动 `openspec/**`） |
| R33 | 钳位分工（R31 派生） | 入口只做**数值合法性**校验（拒 NaN/Infinity/非数字）；**几何钳位（主显示器工作区）由宿主兜底**——入口无 workArea，不做几何钳位。design D-13 已按此改写 |

## 26. 卡 14 · host-overlay-setposition（✅ 完成，含 R31 追加项）

**改动清单**（9 文件，全在所有权内）

| 文件 | 关键改动 |
| --- | --- |
| `src/shared/types.ts` | `:360-367` 新增 `overlaySetPosition(extId,id,x,y)` + JSDoc（钳位双保险/不钳不猜/position 回传/只改位置）；`:563-580` `OverlayResult` 增可选 `position?: {x,y}`，JSDoc 按 R31 写明"create 与 setPosition 成功时回传（destroy/setMouseThrough 不带）；扩展拿不到 workArea，靠它建立/校正位置基准"；`:339-347` `overlayCreate` JSDoc 补 position 语义；三/四方法措辞同步 |
| `src/main/appWindow.ts` | `:498-501`【R31】create 成功返回 `{ok:true,position:{x,y}}`（复用 `overlayPosition` 同一份 x/y，与日志同源不重算）；`:574-597` 导出纯函数 `clampOverlayPosition(workArea,width,height,x,y)`（D-13 同公式，退化情形 max<min 以 min 为准）；`:599-660` `setOverlayPosition`：extId/id 校验 → **坐标必须有限数字，NaN/Infinity/非数字/缺参 ⇒ ok:false 不钳不猜** → `overlayKey` 定位、越权 ⇒ ok:false + error 指认属主 + `[overlay] 越权被拒` warn → 不存在/已销毁 ⇒ ok:false（与 setMouseThrough 同口径）→ 宿主兜底钳位（w/h 取 `getBounds` 当前尺寸）→ 只调 `win.setPosition`（不触碰 transparent/alwaysOnTop/穿透态）→ 日志（被钳时含"请求(x,y) 钳制后(x',y')"）→ 回传钳后 position；`:662-686` 第 4 条 IPC `overlay:set-position` |
| `src/preload/index.ts` | `:74-76` 第四条桥接 `overlaySetPosition` |
| `src/api/types.ts` | `:238-251` 新增 `setPosition(id,x,y): Promise<OverlayResult>` + 中文 JSDoc；`:216-220`【R31】create JSDoc 补"绝对坐标基准"；`:194` 作用域措辞改四方法 |
| `src/renderer/src/core/host.ts` | `:610-612` `buildOverlayApi` 新增 `setPosition`（extId 闭包绑定，走既有 IPC 路径） |
| `src/main/index.ts` | `:101` 注释"四条 IPC"（`registerOverlayIpc()` 位置不变，无需新注册代码） |
| `test/overlay-window.test.ts` | 53 → **67 tests**：MockWin 增 `positionCalls`/`getBounds`/`setPosition`；新 describe「主进程 · setPosition」11 条；【R31】create 回传 position = `overlayPosition` 公式值（四 anchor 各一次 + 与 `win.opts` 同源）、失败路径不带 position、既有 create 断言全部改造后回归；extId 非法测试补四方法；宿主接线新测试（闭包绑定逐字转发 + position 原样回传）；源码门禁（preload 四条桥接 + MainApi 四签名） |
| `test/host-api-surface.test.ts` | 26 → **28 tests**：`OverlayResult` props 2→3（`position` optional `{x,y}`）+ R31 JSDoc 断言；四方法签名逐字；作用域 JSDoc 覆盖四方法（含 not「三个方法」）；setPosition 文档断言（主钳/兜底/公式逐字/不钳不猜/钳后坐标/只改位置/越权） |
| `docs/extension-api/api-reference.md` | overlay 小节：三方法→四方法签名表、`OverlayResult` 形状 `{ok,error?,position?}` 与用途、四条 IPC 通道、**setPosition 参数契约表**、作用域安全（"销毁、穿透或**移走**别人的窗体"）、生命周期表补两行、窗体参数节新增「运行期移动（setPosition，卡 14）」段（含 create 即返回初始绝对位置、钳位双保险、日志格式、门禁指向）、共享类型段同步；顺带修正卡 02/03/04 造成的行号漂移（host.ts:622-646 等） |

**门槛原始输出（关键行）**

```
typecheck：exit 0（typecheck:node + typecheck:web 均过）
lint：exit 0；✖ 4 problems (0 errors, 4 warnings)——4 条全在 test/settings-network-layout.test.ts（既有基线，未触碰）；中途新测试触发的 1 条 prettier warning 已 --write 修复后归零
npm test：Test Files 56 passed | 2 skipped；Tests 793 passed | 5 skipped（基线 777 + 16：overlay-window +14、host-api-surface +2）；Duration 3.58s
git status --porcelain=v1：与开工前快照逐行一致（21 M + 3 ??）；git log -1 = fbdb882；无 commit/add/push/stash
```

**setPosition 11 条新断言全 ✓**：合法坐标（`{ok:true,position}` + setPosition 恰一次 + 日志一条）；超工作区 (5000,-100) ⇒ 钳到 (1700,0) 且回传钳后值 + 日志含钳前钳后；非零工作区原点下限钳位；`clampOverlayPosition` 纯函数与退化情形；NaN/±Infinity/字符串/缺参/null/对象 **9 组全部 ok:false 且 position undefined、窗体一次未动**；id/extId 非法全拒；不存在 id ⇒ ok:false；已销毁 ⇒ ok:false 不抛；越权 ⇒ ok:false + 指认属主 + warn + 窗体未动（属主自己移动仍成功）；**setPosition 后窗体选项逐键不变**（除 x/y）、穿透态不受影响；连续两次 ⇒ 最后一次生效不崩。

**文档自核对**：四方法签名与参数名（options/id/through/x/y）从 `src/api/types.ts` 抽出逐字 grep `api-reference.md` ⇒ 源码:True 文档:True ×4，**零缺失**；`OverlayResult.position`、`overlay:set-position`、`clampOverlayPosition` 均在文档出现。

**R31 追加项**：五项全落实（create 回传 position 且与日志同源不重算 / JSDoc 三处同步 / 测试四 anchor + 失败路径 + 回归 / 文档 OverlayResult 形状与"运行期移动"段 / 门槛全绿）；`destroy`、`setMouseThrough` 返回**未动**。⇒ 卡 15 可直接用 create 回包的 position 做首次拖动基准，1e7 标定探测降为兼容兜底路径。

## 27. 增补轮裁定（七）

| # | 事项 | 裁定 |
| --- | --- | --- |
| R34 | 卡 14 偏差：IPC 通道名用 `overlay:set-position`，而非任务提示里示例的 `app:overlay-set-position` | **接受**：仓库既有三条 overlay IPC 均为 `overlay:create` / `overlay:destroy` / `overlay:set-mouse-through` 同族命名，卡 14 按"与既有一致"原则处理正确；任务提示的示例是我笔误 |
| R35 | 卡 14 中途唯一一次 test 失败是其**新测试期望写错**（非零 workArea 下仍断言 {0,0} 工作区坐标），修正期望后全绿、实现未改 | 记录留痕；不构成实现缺陷 |

## 28. 卡 15 · ext-actions-v2（✅ 完成）

**验收**：`npm test` **160/160**（基线 98 + 新增 62，无基线用例丢失）；清 dist + `npm run build` 成功（`index-WxOV6Or0.css` 4,268 B + `index-2uXq4Gzs.js` 91,411 B + `index.html` 495 B）；`vue-tsc --noEmit` 0 error；`git rev-list --all --count` = 0；`<ROOT>` 零写入；附带 `npm run pack` 18 条目回读自检通过。

**产物 grep（父代理独立复核 + 卡 15 自测一致）**：旧禁止项（backdrop-filter/installThemeBridge/var(--/onclick=/alert(）全 0；新增禁止项（`挂机 20 分钟`/`还需`/三句旧增量文案/裸 `+5`/`+15`）全 0；必需文案十句逐字在；面板属性相关标识（vital-row/fill/bar/label/num、hunger/clean/mood）全 0；召唤胶囊 96×36 + 虚线描边命中；`pet.drag` 三阶段 + `setPointerCapture` + `screenX`（`movementX` 0 命中）+ `touch-action` 命中。

**改动面**：入口 `index.js`（drag 串行队列/applyPosition/probeClampedMax 兜底/trot 排程/hidden 与 position 落盘/设置跳变清 hidden/cleanup 复位）、`lib/{constants,mapping,persist,settle,interact,bridge}.js`、页面 `app/App.vue`（拖动四件套 + 隐藏态只渲染胶囊 + hitBoxes 隐藏分支 + trot 锁存）、`app/components/PetPanel.vue`（**整文件重写**：删三属性行与样式、四枚按钮）、`app/lib/{state,anim}.ts`（加 `hidden`/`trot`、删属性标签与 `displayInt`）、`README.md`（互动表补三行 + 新增「文案口径」与「悬停面板与隐藏态」两节 + 测试数/体积更新）、测试新增 5 文件 62 条 + 7 个既有测试文件的旧文案/形状断言同步（逐条清单在回执）。

**旧文案断言修改（12 处断言 + 1 fixture + 4 处形状断言）**：economy 两句道具不足、interact 冷却句（并**新增**"冷却早期 10s 与晚期 290s 同一句"断言，证明文案不再依赖剩余时间）、interact 三处注释与玩耍 speech/bubble、persist fixture 与往返键表（加 `hidden`/`position`）、mapping 九→十状态 label 与优先级新增 `sleep>trot`/`trot>idle`、extension/window 的 overlay 三→四方法与 state 5→6 键、window 的 timer 数 1→2（pet-tick + pet-trot，改为按 id 断言各只一份 + cleanup 后归零）。

## 29. 增补轮裁定（八）

| # | 事项 | 裁定 |
| --- | --- | --- |
| R36 | 卡 15 新增 `TEXT.hiddenBlocked` = `鲸鱼娘藏起来了，点点召唤胶囊吧`（D-16 表外的一句拒绝文案），且 `hide` 在隐藏态**幂等放行**（与 summon 对称） | **采纳**：无数字时间/无增量数字，受两条正则约束；父代理已把该句补进 design D-16 文案总表（含来源标注 R36）。隐藏态收 `pet/feed/bathe/play` ⇒ `ok:false` + 该文案且状态不动 |
| R37 | `pet.drag` 的 move/end **不要求先有 start**（丢 start 时 move 仍移动窗体，代价是那一次不享受互斥抑制；异常路径 `dragging` 必被复位） | **接受**：可用性优先，且不会永久抑制 trot/sleep；注释已写明 |
| R38 | trot 回落不用 `api.timer`（只收整数秒 ≥1，表达不了 1.5s）⇒ 入口写 `trotUntil = now+1500` 由 `resolveStatus` 自然回落，页面侧"播完一轮 + 锁存"精确停在 1.5s | **接受**并已把该口径写进 design D-14（避免入口最长 15s 后才改报 idle 导致跑个不停） |
| R39 | 父代理抽查发现整文件扫 `/\d+\s*(分钟\|秒\|小时)/` 在 `lib/constants.js` 有 **5 处命中**，与卡 15"0 命中"表述看似冲突 | **不冲突**：5 处全在 **JSDoc 注释**（tick 15 秒、挂机 1200s=20 分钟、入睡 10 分钟、trot 240–600s、摸头 5 分钟冷却），无一是用户可见文案；spec scenario 的断言范围本就写的是"**文案表**"，卡 15 口径正确。留痕以免 check 步误判 |
| R40 | **设计张力**：trot 触发要求"基础态为 idle"，而连续 10 分钟无交互即进 `sleep` ⇒ trot 的可见窗口只有入睡前的 0–10 分钟，随机间隔 4–10 分钟 ⇒ 实际能看到的概率不高 | **用户裁定 Q14=A**：间隔改 **2–5 分钟**（上限刻意小于 10 分钟入睡阈值）。规格侧父代理已改：design D-14（含理由）、D-4 trot 行、UX 第 10 步、`specs/pet-sprites` trot requirement（加"上限 MUST 小于 10 分钟入睡阈值"规范句）；实现侧续派卡 15 改 `TROT_MIN_SEC/MAX_SEC` 240/600→120/300 + 测试期望区间 + **新增关系断言 `TROT_MAX_SEC < SLEEP_AFTER_SEC`** + README |

## 30. 卡 15 的 R40 追加（✅ 完成）

`lib/constants.js:171-172` 的 `TROT_MIN_SEC`/`TROT_MAX_SEC` 240/600 → **120/300**（JSDoc 补 R40 理由：上限刻意小于入睡阈值 `SLEEP_AFTER_MS`）；`index.js` 四处注释同步；`test/actions-trot.test.js` 期望区间与 mock 随机源期望 `[120,165,210,300]` 同步，并**新增关系断言用例**（`TROT_MAX_SEC < SLEEP_AFTER_SEC`、`TROT_MIN_SEC===120`、`TROT_MAX_SEC===300`、区间非退化、`api.timer` 的 1–86400 整数秒约束、`TROT_MAX_SEC*2 <= SLEEP_AFTER_SEC`）；`README.md:37,63` 同步。门槛：`npm test` **161/161**、build 产物哈希不变（只改 `lib/**`，不进 vite 产物，符合预期）、vue-tsc 0 error、零提交、`<ROOT>` 零写入。命名口径：不新增 `SLEEP_AFTER_SEC` 常量，测试内由 `SLEEP_AFTER_MS/1000` 派生并先断言 `===600` ⇒ **单一来源不破坏**（父代理认可，无需再导出）。

## 31. 用户裁定 Q15 / Q15=B 与规格回退（父代理执行）

**用户新约束（实机把玩后提出）**：① 喂食/洗澡/玩耍用 **icon 替代文字**；② **取消面板里的隐藏**；③ 三个 icon **放在一行**。追问"取消面板隐藏后 Q11 的隐藏态/召唤胶囊失去入口"⇒ 用户裁定 **Q15=B：彻底取消隐藏功能**（隐藏只由设置页 toggle 承担 = 销毁窗体省 CPU，回到 Q2 原意）。

**父代理已完成的规格/设计回退**（`openspec/**` 属父代理所有权，卡 16/17 均不碰）：

| 文件 | 变化 |
| --- | --- |
| `specs/pet-window/spec.md` | 用 node 精确切除「隐藏态 SHALL 只渲染召唤胶囊…」整条 requirement（19 行 / 3 scenario）；拖动 requirement 标题的互斥对象"踱步/隐藏"→"踱步" |
| `specs/pet-interaction/spec.md` | 切除「点召唤胶囊 SHALL…」整条 requirement（10 行 / 1 scenario）；面板 requirement 改为"三枚图标按钮、同一行、MUST NOT 提供隐藏入口、每枚 MUST 有 `aria-label`+`title`、内联 SVG 不用 emoji/图标字体"；悬停 scenario"五类信息"→"四类"；文案 requirement 删「召唤胶囊 `召唤鲸鱼娘`」并补"图标可访问名属控件标签"口径 |
| `specs/pet-sprites/spec.md` | trot 触发条件与抑制 scenario 删"非隐藏/隐藏" |
| `design.md` | D-4 删 `hidden` 行、trot 行删"非隐藏"；优先级行删"hidden 不参与轨优先级"句；**D-15 改为撤销说明**（含连带移除清单 + 保留两个历史被否决备选）；D-16 删召唤胶囊与隐藏态拒绝两行、新增"三枚图标可访问名"行；UI 视觉规范布局段改 Q15 新版（三枚 22px 内联 SVG 一行、间距 8px、`stroke: currentColor`、禁用态 `opacity .45`+`aria-disabled`、图标语义：小鱼/泡泡水滴/球）；UX 第 9 步改为"面板互动图标"、第 10 步删"隐藏"；Non-Goals 新增两条（不做面板隐藏/召唤胶囊、不做文字标签与 emoji 图标）；Risks **R11 标为已撤销但保留编号**（避免其它文档 R 编号漂移） |
| `notes/grill.md` | 新增 **Q15** 条目（三条连带裁定 + 向后兼容要求：旧存档 `hidden:true` 读时忽略）；Q13 的连带修订句同步（不再写"按钮改四枚"） |
| `notes/validation.md` | 新增**第五轮 · Q15 变更校验**（收缩型变更：规格计数 27/56 → **25/52** 已脚本复核；九维度复审；重点维度"不可达规格/代码"⇒ 卡 17 必须做负向断言；数据语义新增"读时忽略废字段、`schemaVersion` 不递增"；证据不足项 **N11**（图标行实机观感与可访问名）、**N12**（D-1 修复实机确认）） |
| `tasks.md` | 7.1 标注范围收缩；新增**组 8**：8.1 = 卡 17（实现）、8.2 = 卡 17 后由卡 16 的代理续跑复验（N11/N12） |
| `notes/tasks/17-ext-q15-icon-panel.md` | 新建任务卡（所有权 = `index.js`/`lib/**`/`test/**`/`app/**`/`README.md`；实现清单四节；验收含产物 grep 新增禁止项 `召唤鲸鱼娘`/`鲸鱼娘藏起来了`/`summon`/`isHidden`/`vital-row` 全 0 与 `<svg`≥3；负向自检含旧存档 `hidden:true` 兼容） |

**顺带确认的实机缺陷 D-1**（卡 16 发现、父代理定级"普通"）：`pet.diagnostic` **跨会话残留**——入口启动成功时只清"本会话自己设过的"诊断（`currentDiagnostic` 初值 null），清不掉上一会话写入的旧值 ⇒ 设置页会显示上一实例的「宠物窗体创建失败：…」。修复归**卡 17**（启动成功即无条件把该键写回 `''`、状态栏写回「宠物」+ 回归测试）。卡 16 只记录不修（它无权改代码）。

## 32. 卡 16 范围收缩指令（已送达）

②（隐藏/召唤）整组标 **N/A**（Q15=B），裁定前 incidental 测到的隐藏态数据作为"裁定前存档"附在 N/A 节、不计结论；④ 去掉召唤胶囊与隐藏态拒绝两句（其余八句照测）；⑤ 只记实测现状（无属性行 ✓、当前为四枚文字按钮 + ✕、Tab 序）并注明 Q15 改三图标一行由后续卡复验，**不把隐藏按钮当缺陷**；①③⑥ 照做。两条技术事实已入账：**CDP 合成事件无法模拟增量拖动**（`screenX` 与窗体跟随形成反馈环 ⇒ 真实 OS 鼠标是唯一可行路径）、**锁屏冻结宿主 tick 与帧时钟**（⇒ 观察窗必须解锁后做）。用户已解锁并承诺约 20 分钟不碰鼠标键盘。

## 33. 卡 16 · verify-actions-v2（✅ 完成）

**证据**：`notes/evidence/real-window-v2.md`（仓库内唯一新增文件）；截图/脚本/日志/事件流在 `%TEMP%\pet-e2e2\`（含 `wait1b/wait2-events.jsonl`、`out-frames-sleep.json`、`corpus.txt`、drag-step40/70/80、W1b-*、W2-*、U-04a~g 等）。

| 组 | 结论 | 关键数据 |
| --- | --- | --- |
| ① 拖动换位 | **通过** | OS 合成鼠标（真实输入队列）(2332,888)→(40,44) 跟手；松手 `state.json` 落 `position:{40,44}`；钳位拖出界 ⇒ 日志 `请求(2364,942) 钳制后(2340,932)` 且 bounds 逐像素 = workArea 极限；**重启 dev 后回存档位**（`已创建@(2316,908)` → `setPosition→(700,700)`）；**首次拖动无标定探测**（grep `10000000\|标定\|位置未知\|回包未带` = 0 行 ⇒ R31 生效）；用户 11:02 的硬件真实拖动留作 incidental 旁证（80+ setPosition 行 + 钳位行 + `lastPetAt` 不变 ⇒ 拖动未误触摸头） |
| ② 隐藏/召唤 | **N/A**（Q15=B） | 裁定前 incidental 数据留档不计结论（胶囊 96×36「召唤鲸鱼娘」、隐藏态桥级拒绝句、点胶囊恢复、toggle 关→开清隐藏） |
| ③ trot + sleep | **通过** | 观察窗 #1（桥级 play 锚定 T0'=12:12:27、指针停 (2400,300)）：**trot 第 4 分 33 秒**（2–5 分钟窗内 ⇒ **R40 调参实机有效**）row7 无气泡、**持续 1500ms**、回 idle；第 7 分 32 秒第二次 trot（墙钟 3.0s 单次抖动、帧数仍一轮，如实记录）；**第 10 分 05 秒入睡**：气泡「打盹中（Zzz）」+ 页内高采样帧间隔 600/600/750… = idle×1.5 慢放实证。观察窗 #2：**trot 中桥级喂食 ⇒ 100ms 内回包、row7×1.4s → row4 eating**（负向自检通过） |
| ④ 文案 | **通过**（可测 8/8 逐字；2 句 N/A） | 摸头成功/冷却、喂食成功、无鱼干、洗澡成功、无泡泡、玩耍成功、打盹全部逐字命中（OS 点击主口径 + 气泡截图；无鱼干/无泡泡 = 桥级回包逐字 + 按钮 disabled 截图，口径同卡 11）；「召唤鲸鱼娘」「鲸鱼娘藏起来了…」N/A；喂食冷却句如实记"TEXT 表内、当前无冷却逻辑触发路径"；**全量正则复核 25 行语料两正则均 0 命中** |
| ⑤ 面板 | **实测现状通过** | 等级行 + 库存行 + 四文字按钮 + ✕；`hasVitalRow`/`hasVitalFill`/`.vitals`/"饥饿度\|清洁度\|心情" 全 false；Tab 序 精灵→喂食→洗澡→玩耍→隐藏→✕→精灵→循环 ✓；注明 Q15 改三图标一行由卡 17 后复验，隐藏按钮不计缺陷 |
| ⑥ 回归 | **通过** | 取色：有窗/无窗同点 `#BBDE9B`/`#EAFFB4` **差 0/255**、精灵点 `#3E7CC8` 非透明；toggle：关 ⇒ target 消失 + 进程 7→5 + CPU **218.8→15.6 ms/10s**，开 ⇒ target 回归 + setPosition 回存档位 + 三行 69/99/99→68/99/99 连续不重置；设置页 progressbar + `NN/100` + 无 desc + 诊断（无）+ 当帧刷新（70→75、97→100 同页实例）；穿透/命中正常；长轮询 30s 窗 rev 115→116→117（hold 2.9s/15.0s = tick 节拍、无 25s 超时风暴）；两会话全日志 **越权/非法 url/创建被拒/订阅失败/exception = 0 行**。桌面右键菜单截图本轮不可得（MuMu 覆盖，已注明） |

**缺陷清单**：**D-1（普通，卡 17 修）** `pet.diagnostic` 跨会话残留（根因 `currentDiagnostic` 初值 null、`clearDiagnosticIf` 只清本会话自设；落点 `index.js` 的 setDiagnostic/clearDiagnosticIf；修法 = 启动成功无条件写回 `''` + 状态栏「宠物」）——卡 16 明确**证伪**了"它手动清值"的推测（只计划未执行），11:44 变「（无）」的触发点**未归因**，证据里两可能并列不断言；**D-2（轻微，卡 17 修）** 拖动中面板弹出（负向自检不通过；落点 `app/App.vue` 的 `panelOpen = hovered || focusOpened` 未排除 dragging）；**D-3 已撤销**（AFK 发放异常系测量伪迹，解锁后两次实时观测正常）。观察项：hover latch（合成/边缘路径 `pointerleave` 不触发，硬件正常）、trot#2 墙钟 3.0s 抖动、MuMu 顶层窗口干扰晚期 OS 命中（一次误中其游戏退出对话框、已点取消撤销、游戏未退出，留证）。

**合规**：dev1/dev2 已关（electron/obox 进程 0、9333/5173 无监听、无残留 watcher）；双仓零提交（宿主 HEAD `fbdb882d`、status 24 行 = 基线；扩展 0 提交）；未改任何实现代码/规格/任务卡；`state.json` 测试终态留存，重置前旧档备份在 `%TEMP%\pet-e2e2\state-backup\state.json.orig`。

## 34. 增补轮裁定（九）

| # | 事项 | 裁定 |
| --- | --- | --- |
| R41 | 卡 16 发现 D-2（拖动中面板弹出） | 归**卡 17** 修（`panelOpen` 加 `&& !dragging` 或 drag start 关面板并抑制 hover 开面板；拖动结束后指针仍在精灵上面板须能恢复）；补测试 |
| R42 | 卡 16 的 toggle 后 CPU 为 **15.6 ms/10s**，而卡 11 同口径测得 **0.0 ms/10s** | **不算缺陷**：销毁后入口的 15s 结算 tick 与长轮询仍在（design D-5 明确"关窗不停结算时钟"），15.6ms/10s ≈ 单核 0.16%，量级与"帧循环已停"一致；卡 11 的 0.0 属测量粒度取整。两次数据都留档，check 步按"帧循环停止 ⇒ CPU 大幅回落"这一判据判定 |
| R43 | 卡 16 报告"调试扩展会写 userData"（`%APPDATA%\obox\extensions\pet\data\state.json` 实锤），与我任务卡里的假设相反 | **以实测为准**：任务卡假设错误已更正；持久化判据直接用 state.json + 重启验证（①/③ 已这么做）。此事实需在第 9 步 ship 时同步进 `guides-user.md` 的调试扩展段（与 R25 一并落） |
| R44 | 桌面右键菜单截图本轮不可得（MuMu 模拟器顶层窗口覆盖工作区、吃掉穿透落点，且一次误中其游戏退出对话框已撤销） | **不补测**：卡 01 与卡 11 已两次拿到该证据（穿透态右键落桌面），本轮以 `WindowFromPoint` 矩阵 + 取色差 0 为等价判据；证据文件已注明环境干扰。后续实机前**先关 MuMu** |

## 35. 卡 17 · ext-q15-icon-panel（✅ 完成）

> 首次派发（`8a376667`）**在动代码前异常终止**；父代理核查确认树未被改动（近 2h 内只有父代理自己的文档编辑与卡 16 证据文件；`npm test` 仍 161/161、扩展仓 0 提交）⇒ **无半成品可收拾**，原任务书重新派发（`c3ad0cf6`）从零实现。

**改动清单**（<EXT> 内 `index.js`、`lib/**`、`app/**`（含新增 `app/lib/panel.ts`）、`test/**`、`README.md`）

| 侧 | 关键改动 |
| --- | --- |
| `lib/constants.js` | 删 `TEXT.summon` / `TEXT.hiddenBlocked`；禁令说明改"气泡/面板（含三枚图标可访问名）/状态栏/诊断"；`unknownKind` 注释补"summon/hide 也走这里" |
| `lib/interact.js` | `KINDS` 导出且只剩四种（导出给测试做负向断言）；删 `toggleHidden` 与隐藏态拒绝分支；未知 kind 提前返回；表头改为撤销说明 |
| `lib/persist.js` | `sanitizeState` 不再构造 `hidden`、`serialize` 白名单不再写 `hidden`；**四处注释写明"废字段静默丢弃、不触发 `.bad` 备份重建"** |
| `lib/settle.js` | `initialState` 去掉 `hidden: false` |
| `lib/bridge.js` | `buildView` 返回五键（`hidden` 已删） |
| `index.js` | `currentDiagnostic` 初值 `undefined`（未知）；新增 `setDiagnostic(text, force)` 与 `resetDiagnostic()`；新增 `lastCreateFailed` 供 D-1 判定；`persistSignature` 去 `hidden`；`syncTrot`/`onTrotFire` 去 hidden 门控；设置监听删"`visibleNow` false→true 清隐藏"跳变（`visibleNow` 本身也删，已无使用点）；init 在"状态就绪且本次未创建失败"后**无条件**复位诊断 |
| `app/App.vue` | `dragging` 改 `ref`；`panelOpen` 走纯函数；删 `summonEl`/`isHidden`/`onHide`/`onSummon`/hitBoxes 隐藏分支/`watch(isHidden)`/胶囊模板/`.summon` 样式；`syncClock` 只剩可见性；`restoreFocusToSprite` 只归还精灵 |
| `app/lib/panel.ts`（新增） | `panelShouldOpen(hovered, focusOpened, dragging) = !dragging && (hovered || focusOpened)`（D-2 方案 A，含取舍说明） |
| `app/components/PetPanel.vue` | 三枚**等宽图标按钮横向一行**；`blocked` computed + `onAct` 拦截（`aria-disabled` 而非 `disabled`）；`.actions{flex-direction:row;gap:8px}`、`.act{flex:1 1 0}`、`.act[aria-disabled='true']{opacity:.45;cursor:not-allowed}`、`.icon{22px;fill:none;stroke:currentColor;stroke-width:1.6;round}` |
| `app/lib/state.ts` | `PetStateView` 五键、`normalizeState`/`DEFAULT_STATE` 去 `hidden`、TEXT 删 hide/summon/summonAria、新增 `petCooling` 兜底 |
| `README.md` | 玩法表删隐藏行、trot 行去"非隐藏"；"悬停面板与隐藏态"→"悬停面板"（三图标一行/可访问名/禁用态仍可聚焦/Tab 序/拖动中不弹面板）；文案口径删召唤胶囊句；toggle 行补"隐藏只由本 toggle 承担"；诊断行补 D-1 口径；测试数 160→164、产物体积 97→95 KB；目录表补 `panel.ts` |
| `test/**` | `actions-hidden.test.js` 重写（11 → **14 条**负向 + D-1 + D-2）；`actions-ui.test.js` 图标行/禁用态/移除断言（仍 14 条）；其余 6 个测试文件机械更新 |

**三枚图标（内联 SVG，viewBox 0 0 24 24，尺寸/描边由 `.icon` 统一）**：喂食 = 小鱼（椭圆身 + 分叉尾鳍 + 鳃线 + 眼点）；洗澡 = 泡泡（大中小三圆 + 高光弧）；玩耍 = 沙滩球（外圆 + 三条缝：左弯/中直/右弯）。子代理另用 headless Chrome 按**真实 22px**与 **4× 放大**渲染复核可辨识、禁用态仍看得清形状（截图与临时页已删，未留仓库）。

**验收原始输出（关键行）**

```
npm test：ℹ tests 164 / pass 164 / fail 0（基线 161，+3）；node --test actions-hidden+actions-ui+actions-drag ⇒ 46/46 全绿
build（先清 dist）：✓ 24 modules transformed；index.html 0.68 kB / css 4.01 kB / js 92.46 kB
产物 grep 新禁止项：召唤鲸鱼娘=0 鲸鱼娘藏起来了=0 summon=0 isHidden=0 vital-row=0 隐藏=0
产物 grep 旧禁止项：backdrop-filter=0 installThemeBridge=0 var(--=0 onclick==0 alert(=0 挂机 20 分钟=0 还需=0 时间正则=0 +5=0 +15=0
产物必须出现：<svg=4（3 枚图标静态字符串 + Vue 运行时 1）、aria-label=16、喂食/洗澡/玩耍各 2、八句 D-16 各 1
vue-tsc --noEmit：EXIT=0（0 error）
npm run pack：[pack] 已打包 out/pet-1.0.0.oix（18 个条目，1635698 B）+ 回读校验通过（解压总量 1754261 B）
git：EXT rev-list --all --count = 0；ROOT status 24 行 = 开工基线（无本卡写入）
```

**D-15 连带移除清单逐项确认（9 项，无一项"本就不存在"）**：`state.json` 的 `hidden`（含旧存档 `hidden:true` **静默忽略**、白名单构造不报错不写 `.bad`）｜`PetStateView.hidden`（bridge + state.ts）｜`summon`/`hide` 两个 kind（KINDS/toggleHidden/拒绝分支/`TEXT.hiddenBlocked`）｜召唤胶囊渲染与 `.summon` 样式｜隐藏态 hit-test 分支与 rAF 停摆｜两句文案｜设置 toggle 关→开清隐藏的跳变逻辑（`visibleNow` 一并删）｜11 条旧用例转负向｜清单外连带（`persistSignature` 的 hidden、`syncTrot`/`onTrotFire` 门控、interact 强制落盘分支、`settle.initialState`、README 段落）。

**D-1 修法与回归**：`currentDiagnostic = undefined`（未知）+ `setDiagnostic(text, force)` + 新增 `resetDiagnostic()`；init 在"状态就绪且本次启动没有创建失败"后**无条件**复位（创建失败时保留 `宠物窗体创建失败：<原因>`）。回归三条：预置上会话失败文案 ⇒ 启动成功后该键为 `''` 且状态栏写回「宠物」且**确实写了一次设置**；本次创建失败 ⇒ 保留失败文案；`visible:false` 不建窗也算成功启动 ⇒ 照样清掉。
**D-2 修法与回归**：选**方案 A**（`panelOpen` 显式排除 `dragging`），理由写进 `app/lib/panel.ts`——方案 B 要记住"拖动前面板是否开着"才能还原、且污染 `hovered` 这个纯几何事实；方案 A 让 `hovered` 继续如实反映几何，拖动结束 `dragging` 翻回 false 后**自动**按当前几何恢复，无需补偿代码。取舍：`dragging` = "按下→抬起"（D-13 会话边界）⇒ 普通点击在按住瞬间也会收起面板（松手即回）；宁可"可能开始拖动"就收起，也不用位移阈值猜意图（那会让慢速拖动前几帧漏判）。回归：真跑 `panelShouldOpen`（拖动中 false、松手后指针仍在命中区 true）+ 页面接线断言。

## 36. 增补轮裁定（十）

| # | 事项 | 裁定 |
| --- | --- | --- |
| R45 | 页面侧新增 `TEXT.petCooling` 作为"回包缺 text 且 tone=bad"时的兜底（同时让产物 grep 的八句 D-16 在 dist 内全部命中；`feedCooling` 仍只在入口 `lib/constants.js`，因本扩展喂食不设冷却、页面无触发路径） | **接受**：兜底文案即摸头冷却句（D-16 表内），不新增文案口径；双份出现属"同一句的两处兜底"，已在回执说明 |
| R46 | 图标禁用态采用 `aria-disabled`（不做 `disabled` 属性）⇒ 键盘仍可聚焦、click 仍派发，在 `onAct()` 就地拦截 | **接受**：符合 A11y 常规（禁用但可聚焦可发现），且避免 `disabled` 导致焦点丢失；负向自检口径即如此。check 步按"禁用可见 + 动作被拦截 + 可聚焦"三条判定 |
| R47 | 产物门禁 `<svg` ≥3 依赖 Vue 的 `stringifyStatic`（子树"带属性节点数"≥5 才编译成静态 HTML 字符串）⇒ 每枚图标保留 4 个带属性子元素，简化图形会让门禁无声失效 | **记录并要求**：`PetPanel.vue` 的 `.icon` 注释已写明该约束；check 步需确认该注释仍在，且后续改图标时同步复核 `<svg` 计数门禁 |

## 38. 8.2 实机复验（✅ 三项全过，实现级缺陷 0）

> 首次派发 `0932a5a7` 异常终止且**零写入**（证据文件未变、代码 mtime 仍为卡 17 的 13:01-13:11、164/164 仍绿、无残留 dev 实例）⇒ 重新派发 `cf5e34cb` 从零重跑。

| 项 | 结论 | 关键数据 |
| --- | --- | --- |
| ① N11 图标面板 | **通过** | 三枚按钮 `aria-label`/`title` 实际值逐字 = 喂食/洗澡/玩耍；按钮内 `innerText=""`、`childElementCount=1`（只有 SVG）；`top` 全 209.00、`left` 21/83/145 递增、`width` 全 54.00；`.actions` = `flex-direction:row` + `gap:8px`；SVG `fill=none`、`stroke=rgb(15,23,42)`（= 按钮 color，currentColor 生效）、`stroke-width=1.6px`、`22px×22px`；`hasSummon`/`vital-row`/三属性词/`NN/100`/数字时间/增量数字全 false；道具 0 时 `aria-disabled="true"`（**无 `disabled`**）+ `opacity .45` + `not-allowed`、**Tab 仍能停上去**、点击被 `onAct` 拦截（前后读数逐字相同）；Tab 循环 = 喂食→洗澡→玩耍→✕→精灵 |
| ② N12 D-1 | **通过（正反向都有实机证据）** | 预置方式：`pet.diagnostic` 落在主窗 localStorage `obox:state:v1`（**非 state.json**），经 CDP 读改写 + 合成 `StorageEvent` 走跨窗通道；重启后 `pet.diagnostic=""`、状态栏「宠物」、设置页「（无）」、`dev3b.log` 失败类 grep 0 行；**反向构造成功**（`Page.reload` 让 pet init 撞主进程仍持有的 overlay ⇒ 日志 `创建被拒（pet）…` + `[pet] 窗体创建失败…`）⇒ 诊断位**保留**失败文案，复位没吃掉排查线索。上一轮残留触发点**仍未归因**（按事实记录） |
| ③ 回归 | **通过** | D-2 现场：OS 真实鼠标 100 步拖动，`hasPanel` 悬停 true → 按下 false → step40/step70 false → 松手仍在宠物上 true（D-2 已修且"拖完不再出"未出现）；跟手 101 行 `setPosition`、末值与"起点+位移"逐像素吻合；钳位 `请求(2356,944) 钳制后(2340,932)` 落定 = (2560-220,1392-460)；重启两次回存档位；文案 5 句逐字 + 语料 31 行两正则 0 命中；设置页三行 progressbar + `NN/100` + `desc=null` + 当帧刷新（同实例 84→89）+ toggle CPU 296.9→46.9 ms/10s 且数值不重置 |

**观察项**：**O-1** Tab 从 ✕ 到精灵时 iframe `window` 触发 `blur`+`focus` 对 ⇒ `onWindowBlur` 走 `closePanel()` ⇒ 面板闪关一次（`panel.removed` t=23ms），再按一次 Tab 由精灵 keydown 重新开面板；净 Tab 顺序不变（不丢站）；卡 16 只记 `activeElement` 看不到该现象 ⇒ **无法判定是否卡 17 引入**，交 check 步甄别（若判为既有行为且影响极小，按"一般建议"登记）。**O-2** 复验期间检测到**用户并发手动试玩**（一段拖动 + 摸头/喂食/洗澡）⇒ 该轮数据作废、改用干净 fixture 重测（子代理无法调用 `ask_user_question`，已由父代理转达"避免在受控采样期手动试玩"）。**O-3** MuMu 模拟器在跑（面板画在其游戏画面之上 ⇒ 反证 overlay 置顶生效；本轮未做易受干扰的桌面穿透项）。**O-4** D-1 反向用的"渲染进程重载"会让旧 overlay 孤儿化（非产品路径）。

**合规**：dev 实例已全关（electron 0、9333/5173 无 LISTEN、未杀无关 node）；双仓零提交（宿主 HEAD `fbdb882d`、status 24 行；扩展 0 提交）；证据**追加**在 `real-window-v2.md` 的 `## Q15 复验（卡 17 后）`（旧内容逐行未动），12 张新截图在 `%TEMP%\pet-e2e2\`。

## 39. 用户裁定 Q16/Q17 与规格回退（父代理执行）

**用户新要求**：① 图标按钮**底色透明、白色线条**；② **鼠标悬浮显示名称**；③ **每 10 秒播放一次动画、随机动作**；④ 面板**指针在宠物或面板上时显示、其它情况立刻关闭**。

| 裁定 | 内容 |
| --- | --- |
| **Q16=A** | 随机集只含**"表演型"** 7 项（`eating`/`bathing`/`petted`/`playing`/`trot`/`run-left`/`run-right`）；`hungry`/`dirty`/`sad`/`sleep` **不参与**（状态指示不被稀释）；**trot 独立定时器退役**（职责并入 10 秒机制，`trot` 作为状态条目保留）；**打盹期间不播**（父代理默认口径）；不耗道具/不改数值/不弹气泡/不推进 `lastInteractAt` |
| **Q16 派生（父代理决策，可逆并已告知用户）** | `running-left/right` 两轨**纳入随机集、只原地播放**（MUST NOT 调 `setPosition`）——它们此前因"不做位移"而空置，本次终于用上；Non-Goal（不做沿屏行走/窗体内平移）不变；若实机观感别扭，从随机集删两项即可 |
| **Q17** | 图标按钮 `background: transparent`、图标 `stroke: #ffffff`、`:hover` 极淡白叠加 + 白描边高亮、`:focus-visible` 白色 2px 焦点环；**自绘 `.tip` 浮层**在 hover/focus 时**即时**显示中文动作名（`aria-label` 保留）；面板开合 = 指针在宠物命中区**或**面板上，其它情况 **MUST 立刻关闭**（过渡只许作用视觉属性、不得延迟开合判定与命中矩形） |

**父代理已完成的规格/设计回退**（`openspec/**`）：`specs/pet-sprites` 的旧 trot requirement（33 行 / 5 scenario，含"`running-left/right` MUST NOT 使用"）**整条切除**，改为「每 10 秒随机表演」requirement（4 scenario：每 10 秒一轮 / 互动可打断 / 打盹不表演 / 侧跑轨不位移）；`specs/pet-interaction` 面板 requirement 改写（开合条件 + 立刻关闭 + 图标透明底白线 + 悬浮显名 + 保留 `aria-label`）与悬停 scenario；`design.md` **D-14 重写**（Q16 机制、随机集、侧跑原地、打盹暂停、trot 定时器退役、被否决备选 B/C）、UI 视觉规范布局段（Q17 样式与 `.tip`）新增"面板开合（Q17）"段、Non-Goals 更新（侧跑只原地、仍不位移）、UX 第 10 步改 10 秒随机表演；`notes/grill.md` 新增 Q16/Q17；`notes/validation.md` 新增**第六轮**（规格计数 25/52 → **24/51** 已脚本复核；重点维度"不可验收"给了集合断言/零位移/产物 js+css 双扫等判据；证据不足项 **N13**（10 秒随机表演实机观感、侧跑原地是否别扭、打盹确实安静）、**N14**（图标透明底白线在深色面板上的可读性与浮层位置））；`tasks.md` 新增组 9（9.1 = 卡 18 实现、9.2 = 卡 18 后实机复验）；新建任务卡 `notes/tasks/18-ext-random-perf-icons.md`。

## 40. 卡 18 · ext-random-perf-icons（✅ 完成）

**验收原始输出（关键行）**

```
npm test：ℹ tests 170 / pass 170 / fail 0（基线 164；actions-trot 重写为 15 条 + actions-ui 新增 6 条 − 旧 trot 用例）
npm run build（清 dist）：✓ 25 modules transformed；index-DRxxmL2O.css 4.58 kB + index-DZ8id3ZK.js 93.21 kB + index.html 0.68 kB
dist 的 js+css 双 grep：禁止项全 0（linear-gradient / TROT_MIN_SEC / TROT_MAX_SEC / TROT_TIMER_ID / TROT_MS / trotTimer / trotUntil / pet-trot / currentColor / backdrop-filter / installThemeBridge / var(-- / onclick= / alert( / 挂机 20 分钟 / 还需 / 时间正则 / 裸 +5 +15 / 召唤鲸鱼娘 / isHidden / 隐藏）
  必须出现：#fff 或 #ffffff ×6、.tip ×3、rf=10,of=rf*1e3（10 秒常量）、stroke:#fff、#ffffff14（白色悬浮叠加）、<svg ×4、八句 D-16 文案各 1、喂食/洗澡/玩耍各 2
vue-tsc --noEmit：exit 0（0 error）
npm run pack：[pack] 已打包 out/pet-1.0.0.oix（18 个条目，1637311 B）+ 回读校验通过（解压 1757739 B；9 个 lib 全在）
git：EXT rev-list --all --count = 0；ROOT status 24 行 = 基线（本卡对 ROOT 零写入）
```

**实现清单**（全部在所有权内）

| 侧 | 关键改动 |
| --- | --- |
| `lib/constants.js` | `TRANSIENT_MS` 扩到 7 条（新增 `trot:1500`、`'run-left':1800`、`'run-right':1800`，取自 pet.json 8×225）；新增 `RANDOM_PERF_TIMER_ID='pet-perf'`、`RANDOM_PERF_EVERY_SEC=10`、`RANDOM_PERF_SET`（**恰 7 项**）；**删除** `TROT_TIMER_ID`/`TROT_MS`/`TROT_MIN_SEC`/`TROT_MAX_SEC` 与全部 R40 注释 |
| `lib/mapping.js` | 新增 `'run-left'→row2/running-left`、`'run-right'→row1/running-right` 与中文 label「向左小跑/向右小跑」；优先级并入 trot 档 **2**（`hungry6 > dirty5 > sad4 > sleep3 > trot/run-left/run-right 2 > idle1`）；新增 `TRANSIENT_STATUSES` 三条 + `SELF_BURST_STATUSES`/`isSelfBurst()`；`resolveStatus` **删** `trotUntil` 分支（第 123 行留退役注释），表演改走 transient 分支 |
| `lib/bridge.js` | 拖动折叠改用 `isSelfBurst(status)`（sleep 与入口自发表演折 idle；用户点出来的互动不折） |
| `lib/settle.js`、`lib/persist.js` | 状态形状**移除** `trotUntil`（随定时器退役） |
| `index.js` | 导入新常量 + `isTransient`；删死变量 `pointerInside`；新增 `onRandomPerf()`（门控 = sleep / 已有 transient 在播 / 无窗体 / 拖动中；只写 `state.transient`，**体内零 `api.overlay.*` 调用**）；init（含异常兜底分支）注册 `setInterval('pet-perf', 10, onRandomPerf)`；cleanup 清 `pet-perf` + `pet-tick`；删 `syncTrot`/`clearTrot`/`trotUntil` 全部调用 |
| `app/lib/anim.ts` | `PetStatus` 十二态；新增 `RANDOM_PERF_EVERY_SEC=10`/`RANDOM_PERF_PERIOD_MS`（**页面侧镜像 + 真实消费者：锁存看门狗**）；三张表补两条新轨；`TRANSIENT_SET` 三条；`SELF_BURST_SET`/`isSelfBurst()`；`ALL_STATUSES`/`LABEL_TO_STATUS` 补两条 |
| `app/App.vue` | 新增 `BURST_FALLBACK_MS=2000`、`burstLatched`/`burstLatchedStatus`/`burstWatchdog`；`entryStatus`/`entryRow` 改用 `isSelfBurst`；新增**收包驱动**的 `syncBurst()`（含 force）+ `armBurstWatchdog()` + `resyncBurst()`（替代原来只能看"状态字符串变化"的 trot watch——否则连着两轮抽到同一条会被吞掉）；teardown 复位；`.panel-fade-leave-active { pointer-events: none }` 加固 |
| `app/components/PetPanel.vue` | 三枚 `.tip` 浮层（hover/**focus-visible** 零延迟显示中文动作名），**删掉三处 `:title`**；`.act` 透明底 + 透明边框槽位、`:hover`（排除禁用态）极淡白叠加 `rgba(255,255,255,.08)` + 描边高亮、白色 2px 焦点环；`.icon` `stroke: #ffffff` |
| `README.md` | 节奏改"非打盹时每 10 秒随机表演一次（含侧向原地跑）"、删"2–5 分钟小跑"、图标行补"透明底 + 白线 + 悬浮显名"、测试数 170 |

**负向自检（在临时副本 `%TEMP%\pet-mut2` 真跑变异，副本已删）**：删 `if (status === 'sleep') return` ⇒「打盹期间到期也不播」FAIL（13/15）；表演分支加一行 `setPosition` ⇒「侧跑轨零 setPosition」FAIL；`RANDOM_PERF_SET` 塞 `hungry` ⇒ 5 条 FAIL（10/15）。

**面板即时关闭核对结论 = 已符合（+ 一处加固）**：① 判定源 = `panelShouldOpen(...)` 纯函数 + `panelOpen` computed（只依赖三个 ref，无定时器/无过渡事件）；② `closePanel()` 同步翻 `focusOpened`/`hovered`/清 `boxesCache`（无 `setTimeout`；仅 `restoreFocusToSprite` 的 0ms 翻转用于防"归还焦点又开面板"回环，不可能重开）；③ 命中矩形在 `panelOpen && panelSlotEl` 时含面板并补 `PANEL_GAP+2` 缝 ⇒ 指针在面板上即 `pointerInside()===true` ⇒ 保持显示；缓存键含 `open` 且关闭时清缓存 ⇒ 不复用带面板的旧矩形；④ `syncInside()` 取 `dragging ∪ panelOpen ∪ 几何命中`；⑤ `.panel-fade-*` 只有 `transition: opacity 120ms`（reduced-motion 下 `none`）、无 JS 钩子 ⇒ 过渡不参与判定；⑥ **加固** `.panel-fade-leave-active{pointer-events:none}`（淡出期间不再吃指针）。第 1–6 条已钉成回归门禁用例。

## 41. 增补轮裁定（十一）

| # | 事项 | 裁定 |
| --- | --- | --- |
| R48 | 卡 18 行为变更：**悬停不再打断自发表演**（旧 trot 的 `pet.hit{inside}` 当场回落用例已删） | **接受**：Q16/D-14 只要求"真实互动可抢占"；表演是装饰性的，悬停仍会刷新"最近交互"因而不影响入睡判定 |
| R49 | 卡 18 去掉图标按钮的原生 `title`（避免与 `.tip` 双提示），`aria-label` 逐字保留 | **接受**：可访问名不丢，视觉提示由 `.tip` 承担且零延迟 |
| R50 | 卡 18 在 `app/lib/anim.ts` 加 `RANDOM_PERF_EVERY_SEC=10` 作**页面侧镜像**（入口真源仍在 `lib/constants.js`；dist 只含 Vue 页面，源头常量天然进不了产物） | **接受**：该镜像有**真实消费者**（锁存看门狗：入口静默一个完整周期就补拉一次 `pet.state` 再解锁），不是为过 grep 造的装饰常量；产物里逐字 `rf=10,of=rf*1e3` |
| R51 | 父代理抽查发现 `lib/mapping.js` 仍有 1 处 `trotUntil` | **非残留代码**：第 123 行是"该字段随 2–5 分钟定时器一并退役"的说明注释（`npm test` 170/170 与 `persist` 白名单断言共同证明无活代码） |
| R52 | 入口 `onRandomPerf()` 的门控使表演**高于**状态指示轨（短暂覆盖 hungry/dirty/sad 姿态 1.5s 后回落） | **接受**：这是"每 10 秒都要看到动作"的必然结果，已在 spec 的 tick/scenario 写明；`lastInteractAt` 不受影响，状态语义靠"回落即回该姿态"保住 |

## 42. 待入账

9.2 实机复验（`cf5e34cb` 续跑：N13 随机表演观感与"侧跑原地是否别扭"保留/删除建议、N14 图标白线与浮层、打盹期安静、拖动与面板开合回归）⇒ 用户 60–70 秒物理确认 ⇒ 第 8 步 `obox-ext-check`（四路并行，**含 O-1 甄别**）⇒ 第 9 步 `obox-ext-ship`（含 R24/R25/R43 文档补记）。

**失败处理留痕（两次子代理异常终止）**：
- 卡 17 首次派发 `8a376667` **在动代码前异常终止、零写入** ⇒ 父代理核查（近 2h 内只有父代理自己的文档编辑与卡 16 证据文件；`npm test` 仍 161/161；扩展仓 0 提交）确认**无半成品可收拾**，原任务书重新派发 `c3ad0cf6` 从零实现并已完成（164/164）。
- 8.2 首次派发 `0932a5a7`（卡 16 的代理续跑）**异常终止且零写入**（证据文件仍 12:48:51、无"Q15 复验"章节；扩展代码 mtime 仍为卡 17 的 13:01-13:11；`npm test` 164/164；无残留 dev 实例、9333/5173 无监听）⇒ 重新派发 `cf5e34cb`（新代理从零开始）。
- 环境提醒：`node` 进程里有一个 22:02 起的属**会话/宿主自身**（非 dev 残留），处置残留实例时**不得**按进程名整片 kill。

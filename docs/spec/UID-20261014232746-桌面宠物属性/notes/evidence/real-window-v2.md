# 卡 16 · verify-actions-v2 实机复验证据（增补功能 + 回归）

> 本文件只记录证据与缺陷，**不含任何修复**。宿主 = 工作区未提交 overlay/setPosition 能力（卡 02/03/04/05/14），扩展 = `<EXT>`（`--debug-extension` 调试态加载）。
> 截图与脚本均在 `%TEMP%\pet-e2e2\`（不进仓库）；下文截图名均相对该目录。
> **范围裁定（用户 Q15=B，验证中途下达）**：彻底取消"隐藏/召唤"功能 ⇒ **② 整组 N/A**、④ 的「召唤鲸鱼娘」「鲸鱼娘藏起来了，点点召唤胶囊吧」两句 N/A、⑤ 只记实测现状（面板将改三枚图标一行，由后续卡复验）。①③⑥ 全做。
> **环境裁定**：① 调试扩展**会**写 userData（`%APPDATA%\obox\extensions\pet\data\state.json` 实锤），任务卡"调试扩展不写 userData"假设不成立，持久化判据直接用 state.json + 重启；② 验证中途机器两度锁屏（~11:23–12:08），锁屏期宿主 settle/帧时钟冻结（state.json `lastSettledAt` 停摆实证）⇒ 锁屏期只取渲染层证据，OS 级与 ③ 观察窗全部排到解锁后；③ 解锁后用户 opened MuMu 模拟器窗口覆盖工作区，晚期 OS 命中/右键受其干扰（见 0 节）。

## 0. 环境

| 项 | 值 |
| --- | --- |
| 宿主启动 | session 1：11:01:50 `npm run dev -- -- --remote-debugging-port=9333 --debug-extension pet@C:\Users\chenzhi\Documents\workspace\web\obox\extensions\pet`（日志 `%TEMP%\pet-e2e2\dev.log`）；session 2（重启验持久化）：12:00:15 同参数（`dev2.log`） |
| 参数生效证据 | dev.log/dev2.log 首行 `[debug] 调试扩展 1 个: pet@C:\…\extensions\pet`；`[overlay] 已创建: pet/pet.overlay 220x460 anchor=bottom-right margin=24 transparent=true alwaysOnTop=true skipTaskbar=true @(2316,908) 默认鼠标穿透=true` |
| 启动前清理 | 旧 dev 一族（npm 55512 / electron-vite 17060 / electron 34900 + 子进程 34716/55916/52920/50304）Stop-Process 干净关闭；已安装 obox 1.0.15 未在跑 |
| 显示器 | 单屏 2560×1440，workArea=(0,0,2560,1392)，dpr=1 |
| DevTools | **全程未开**；控制台经 dev.log 的 `[renderer:*]`/`[child-renderer:*]` 转发 + 定向 CDP 订阅；两会话 dev.log/dev.err.log/dev2.* 全量 grep `越权|拒绝非法|创建被拒|订阅失败|unhandled|exception|窗体创建失败|存档写入失败|标定|位置未知|回包未带` = **0 行** |
| CDP targets | 主窗 `http://localhost:5173/`；overlay page（查询串五参数 `obox-window=overlay&extId=pet&overlayId=pet.overlay&appId=pet.overlay&url=app%3A%2F%2Fdebug%2F…`）；iframe `app://debug/pet/dist/index.html`（宠物页真实运行处，iframe 偏移 (0,0)） |
| 存档 fixture | 旧存档 `hunger=0` 会门控 trot/sleep ⇒ 备份至 `%TEMP%\pet-e2e2\state-backup\state.json.orig` 后重置（父代理认可）；调试扩展写 userData 实锤：每次拖动结束/隐藏翻转/交互后 state.json 即时更新 |
| 锁屏插曲 | ~11:23–12:08 锁屏：settle/帧时钟冻结（`lastSettledAt` 20s+ 不动）、OS 输入/截屏失效 ⇒ 该窗口内只取渲染层证据（CDP/桥/DOM/cdpsnap），③ 与 CPU/取色/OS 拖动排到解锁后；证据中两种口径分开标注 |
| MuMu 插曲 | 解锁后用户开启 MuMu 模拟器（`Qt5156QWindowIcon` (430,159)-(2358,1283)、`Qt5156QWindow` (2353,159)-(2669,1280)）覆盖工作区 ⇒ 12:38 后的 OS 命中测试在窗体空白点返回 MuMu 类名；一次桌面右键补测误中 MuMu 游戏弹出"是否退出游戏"对话框，**已点「取消」撤销、游戏未退出**（`U-06c-mumu-dismissed.png`）；桌面右键菜单截图本轮不可得，穿透结论以 MuMu 出现前的测量为准 |
| 用户真实拖动 incidental | 11:02–11:03 用户硬件鼠标拖动宠物一圈：dev.log 80+ 行 `[overlay] setPosition`（含 `请求(2286,941) 钳制后(2286,932)` 等钳位行）、松手落盘 `position:{2332,888}`、`lastPetAt` 不变（拖动未误触发摸头）——真实鼠标拖动的 incidental 旁证 |
| 输入口径 | OS 合成鼠标（SetCursorPos+`mouse_event`，真实输入队列）= 主口径；**CDP 合成事件无法模拟增量拖动**（页面增量协议用 `screenX/Y` 差，而 CDP 合成事件 screenX 由"窗体当前位置+client 坐标"推导，与窗体跟随形成反馈环：恒零或线性加速）；**forward:true 不转发合成 move**（硬件 move 才转发）⇒ 悬停开面板用 CDP 注入或硬件，OS 点击/拖动在 through=OFF 后走真实队列（与卡 01/11 口径一致） |

## 1. 六组逐项

### ① 拖动换位（真实鼠标为主） —— 通过（附 D-2 观察）

- 方法：OS 合成鼠标左键拖动（先 CDP hover 关穿透 → `WindowFromPoint` 命中自检 = `Chrome_RenderWidgetHostHWND` → 按下 → 步进 MOVE（每步补 `MOUSEEVENTF_MOVE` 真实事件）→ 松手）；CDP 读 overlay bounds 前后/中途对比；dev.log `[overlay] setPosition` 流；松手后读 state.json。
- 原始数据：
  - **拖动 #1（右下→工作区左上）**：起点窗 (2332,888)（用户拖动后的存档位）→ 终点窗 **(40,44)**；pre-hit=`Chrome_RenderWidgetHostHWND`；中途截图 `drag-step40.png`/`drag-step80.png`（窗体跟手、面板可见见 D-2）；post bounds `(40,44)`；state.json `position:{x:40,y:44}`（松手强制落盘 ✓）。
  - **钳位拖 #2（拖出工作区）**：指针拖至 (2555,1435)（任务栏/右缘外）⇒ dev.log `请求(2349,943) 钳制后(2340,932)`、`请求(2364,942) 钳制后(2340,932)`…；post bounds **(2340,932)** = workArea 极限 (2560-220, 1392-460) 逐像素吻合；截图 `U-01c-clamped.png`。
  - **拖动 #3/#4**：回左上 (40,44)；再 (40,44)→(700,700) 带有效中途探针（t+5s bounds **(280,283)** = 真实中途）。
  - **持久化跨重启**：session 2 dev2.log `已创建 …@(2316,908)` 后紧跟 `[overlay] setPosition: pet/pet.overlay → (700,700)`（入口用存档位校正）；CDP bounds `(700,700)`；截图 `U-01e-after-restart.png`（精灵在存档位）⇒ **重启回到存档位置** ✓。
  - **首次拖动不触发标定探测**：dev.log+dev2.log 全量 grep `10000000|标定|位置未知|回包未带` = **0 行**（R31 后 create 回传 position，探测路径未走）✓。
  - **自动化旁证**：bounds 前后对比序列 (2332,888)→(40,44)→(2340,932)→(40,44)→(700,700)→重启(700,700)→桥级摆位(2316,908)（`geomwin.js` 逐次读）。
  - 用户 11:02 硬件拖动 incidental（见 0 节）。
- 结论：跟手/钳位/落盘/跨重启/无标定 全部符合 specs/pet-window 拖拽 requirement。
- 截图：`drag-step40.png`、`drag-step80.png`、`U-01c-clamped.png`、`U-01e-after-restart.png`、`U-01d-topleft-before-restart.png`。

### ② 隐藏 / 召唤 —— **N/A（用户裁定 Q15=B：功能整体取消，实现由后续卡移除）**

- 裁定下达前（锁屏期）已 incidental 测得的数据留档不计结论：召唤胶囊 96×36 文案 `召唤鲸鱼娘`（`summonRect:{w:96,h:36}`、截图 `L-20-hidden-capsule.png`）；隐藏态桥级 feed 拒绝回包逐字 `鲸鱼娘藏起来了，点点召唤胶囊吧`；点胶囊恢复精灵；设置 toggle 关→开 清除隐藏态（直接显示精灵）；隐藏态 DOM 只剩 `.summon`（精灵/面板 v-if 卸载）。
- 本组其余项（隐藏态 CPU、胶囊外穿透、重启仍隐藏）按裁定不再测。

### ③ 原地小跑（2–5 分钟）+ 入睡气泡 —— 通过（一次等待同时观察两者 + 负向自检第二段）

- 方法：解锁后桥级 `pet.interact{kind:'play'}` 锚定 T0'（重置入睡钟）→ 指针停 (2400,300) 不互动 → 页内 100ms 采样 logger（row/气泡/面板变化即记）+ 事件触发截图（`watch-anim.mjs`，区域 (660,640,320,560)）。
- 观察窗 #1（T0'=12:12:27，纯观察 13.3 分钟）：
  - **trot #1**：t=12:16:20（**T0'+4 分 33 秒**，落 2–5 分钟窗）row7（running 轨）**无气泡**，持续 **1500ms**（12:16:20.2→12:16:21.7）后回 idle ✓；截图 `W1b-trot-10.png`。
  - **trot #2**：12:19:59（T0'+7 分 32 秒，第二次随机间隔）row7 无气泡，墙钟 3.0s（帧数仍一轮；单次帧时钟抖动，如实记录）后回 idle；截图 `W1b-trot-14.png`。
  - **入睡**：12:22:32（**T0'+10 分 05 秒**，10 分钟阈值 + 一个 tick 节拍）气泡 `打盹中（Zzz）` 出现、2.6s 后自灭 ✓；截图 `W1b-bubble-18.png`。
  - **慢放实证**：睡态页内 5s 高采样（`framesample.mjs`）：列停留 **600/600/750/600/600/750ms** = idle 逐帧(400/400/500…)×1.5 ✓（`out-frames-sleep.json`）。
- 观察窗 #2（T0''=12:28:02 桥级 feed 唤醒 + 页内自动响应器武装）：**trot #3** 12:33:31（武装后 ≈4.3 分钟）row7 → 响应器 100ms 内桥级 feed（回包 1ms）→ 行时间线 row7×1.4s → **row4（eating）** ⇒ 任务卡负向自检"trot 播放中点喂食 ⇒ 立即切 eating（瞬时互动优先）"✓；页内记录 `trotFeed.rows`（100ms 粒度 7→4 切换点 12:33:32.776）与回包（fish 2→1）。
- 门控修复记录（口径）：观察窗起点曾出现面板 latch 打开（解锁过程指针路径/焦点态残留使 `hovered` 或 `focusOpened` 置位；合成/路径边缘情形下 `pointerleave` 不触发，真实硬件离开会正常 fire WM_MOUSELEAVE）⇒ trot 门控"指针不在窗体内"不成立；经 CDP leave（窗内空白点注入 move）修复并重锚 T0'。非产品缺陷（真实用户路径不受影响），记为口径观察。
- 结论：trot 在 2–5 分钟随机窗内出现（两次）、约 1.5s 一轮、无气泡、播完回 idle；sleep 在第 10 分钟出现（慢放 ×1.5 + Zzz 气泡）；负向自检通过。
- 截图/日志：`wait1b-events.jsonl`、`wait2-events.jsonl`、`W1b-*.png`、`W2-*.png`、`out-frames-sleep.json`。

### ④ 文案逐字比对 —— 通过（可测 8/8 逐字命中；2 句 N/A；正则 0 命中）

| # | 情形 | 文案（D-16） | 触发口径 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | 摸头成功 | `咕噜咕噜～被摸摸好舒服！` | OS 点击精灵本体 | 气泡 DOM 逐字 + `U-04a-pet-ok.png`（row3 petted） |
| 2 | 摸头冷却 | `摸过头啦，让鲸鱼娘歇口气～` | 5 分钟内第二次 OS 点击 | 逐字 + `U-04b-pet-cooling.png`（仍播 petted、心情不计分） |
| 3 | 喂食成功 | `呜哇！小鱼干好好吃！` | OS 点面板「喂食」 | 逐字 + `U-04c-feed-ok.png`（fish -1、row4 eating） |
| 4 | 无小鱼干 | `没有小鱼干了，多陪我工作一会儿吧～` | fish=0 时桥级 feed（第 5 次喂食尝试） | 回包 `error` 逐字；面板「喂食」`disabled=true` + `U-04g-feed-disabled.png` |
| 5 | 洗澡成功 | `泡泡好舒服～洗干净啦！` | OS 点「洗澡」 | 逐字 + `U-04d-bathe-ok.png`（bubble -1、row3） |
| 6 | 无沐浴泡泡 | `没有沐浴泡泡了，多陪我工作一会儿吧～` | bubble=0 时桥级 bathe | 回包 `error` 逐字；「洗澡」`disabled=true` + `U-04f-bathe-disabled.png` |
| 7 | 玩耍成功 | `玩得好开心！` | OS 点「玩耍」 | 逐字 + `U-04e-play-ok.png`（row7、道具不耗） |
| 8 | 打盹 | `打盹中（Zzz）` | ③ 观察窗第 10 分钟 | 逐字（logger 气泡事件）+ `W1b-bubble-18.png` |
| 9 | 召唤胶囊 | `召唤鲸鱼娘` | — | **N/A（Q15=B）**；裁定前 incidental 留档（② 节） |
| 10 | 隐藏态拒绝 | `鲸鱼娘藏起来了，点点召唤胶囊吧` | — | **N/A（Q15=B）**；裁定前 incidental 留档（桥级回包逐字） |

- **喂食冷却句 `吃饱啦，晚点再喂～`**：本扩展喂食不设冷却（specs/pet-interaction 只定义摸头冷却），**当前无逻辑触发路径**——文案在 `lib/constants.js` TEXT 表内受正则约束但无引用（源码注释同述），如实记录、不伪造触发。
- **全量正则复核**：语料 25 行（观察窗全部气泡 6 句 + 胶囊 1 句（留档口径）+ 面板等级行/库存行/四按钮/✕/两条 aria + 设置页四行 + 状态栏项）⇒ `/\d+\s*(分钟|秒|小时)/` **0 命中**、`/[+-]\d+/` **0 命中**（`corpus.txt`/`regexsweep.mjs`）。口径：设置页 `{cur}/100` 与面板成长值/库存裸数字属**值显示**，不在禁令内（design D-16 硬规则同口径）。
- 口径注：无鱼干/无泡泡的**页面侧坏气泡分支**在真实 UI 下不可达（道具=0 时按钮 disabled），按桥级回包逐字 + 禁用态截图为证（与卡 11 D-1 同口径）。

### ⑤ 面板内容（Q13） —— 实测现状通过（Q15=B 改型由后续卡复验）

- 悬停截图 `U-05-hover-panel.png`：面板 = 等级行（`幼鲸 · 成长 N`）+ 库存行（`🐟 n ｜ 🫧 n`）+ **四枚文字按钮（喂食/洗澡/玩耍/隐藏）** + ✕；**无三属性行、无 `{cur}/100`、无属性条**。
- CDP DOM 断言：`hasVitalRow=false`、`hasVitalFill=false`、`.vitals=false`、面板文本 `/饥饿度|清洁度|心情/ = false` ✓（`panel-dump.mjs` 多次采样一致）。
- Tab 顺序（CDP 派 Tab 读 `document.activeElement`）：BODY → 喂食 → 洗澡 → 玩耍 → 隐藏 → ✕(aria-label=关闭面板) → 精灵 DIV(aria-label=宠物（回车摸头）) → 回喂食循环 ✓ 与 design UX 节一致。
- 现状注明：当前构建为四枚文字按钮（含隐藏）；用户裁定 Q15=B 后面板改三枚图标一行、隐藏入口取消，**改后由后续卡复验**；"面板有隐藏按钮"为当前已实现形态，**不计缺陷**。

### ⑥ 回归（卡 11 ②④⑥ + 增补回归） —— 通过

- **② 空白区透出桌面**：有窗 (2352,908)=`#BBDE9B`、(2442,988)=`#EAFFB4`；toggle 销毁后同点 **逐字节相同** ⇒ 差 **0 ≤ 2/255** 且均非 `#1e1e1e`/`#ffffff`（壁纸绿）；精灵点 (2442,1244) 有窗 `#3E7CC8` vs 无窗 `#D3F497` ⇒ 精灵非透明；透明区点 (2400,1300) 两态同 `#C5EB86` ✓。截图 `U-06-overlay-gone.png`。
- **④ toggle 销毁/重建**：关 ⇒ `/json` 仅主窗、electron 进程 **7→5**、dev.log `已销毁`；CPU（口径同卡 01：electron 全进程 `TotalProcessorTime` 10s 差）**218.8 → 15.6 ms/10s** 显著回落；开 ⇒ target 回归 + `已创建` + `setPosition → (2332,888)`（存档位）+ 三行连续（关前 69/99/99 → 开后 68/99/99，随 tick 衰减、**未重置 100**）。
- **⑥ 设置页三行**：三行均 `[role=progressbar]` + `aria-valuemax=100` + 右侧 `NN/100`（多组实测 85/97/97、76/99/99、68/99/99、39/93/96…）+ 各行 `desc=null`（无 description）；诊断行常态 `（无）`（D-1 清值后）；**当帧刷新**：锁屏期 CDP 喂食同页实例 70→75、解锁后 OS 洗澡同页实例 97→100（均不重进页面）✓。
- **增补回归**：非隐藏态穿透/命中正常——CDP 悬停后 OS `WindowFromPoint`(精灵点)=`Chrome_RenderWidgetHostHWND`（本窗、非穿透），OS 移至窗内空白 ⇒ 面板关闭且空白点=`SysListView32/Progman`（穿透恢复）✓；长轮询健康：30s 观察窗内 subscribe 往返 rev 115→116（hold 2.9s 被状态变化唤醒）→117（hold 15.0s = tick 节拍），**无 25s 超时风暴**、控制台无"订阅失败…重试"warn ✓；`[overlay]` 日志无越权拒绝/非法 url 拒绝（两会话 grep 0 行）✓。
- **桌面右键菜单截图**：本轮不可得——MuMu 窗口覆盖工作区后空白点命中 `Qt5156QWindow`（环境干扰，见 0 节）；穿透结论以 MuMu 出现前的 `WindowFromPoint=Progman` + 取色差 0 为准（卡 11 同点位曾有桌面菜单截图口径）。

## 2. 缺陷清单（只记录不修）

- **D-1（普通；父代理已确认，卡 17 修复）`pet.diagnostic` 跨会话残留**。现象：上一 dev 实例写入的设置值 `宠物窗体创建失败：overlay id 已存在（重复创建）：pet.overlay；要重建请先 destroy('pet.overlay')` 持久化在宿主设置存储（主窗 localStorage `obox:state:v1`）；本卡 session 1 于 11:02 **创建成功**后，11:16 设置页诊断行仍显示该旧文案。复现步骤：旧实例留下 diagnostic → 新实例启动且 overlay 创建成功 → 设置页仍显示旧失败文案。根因：入口 `currentDiagnostic` 初值 null，`clearDiagnosticIf` 只清"本会话自己设过的"诊断，清不掉上会话残留。疑似落点：`extensions/pet/index.js` 的 `setDiagnostic`/`clearDiagnosticIf` 与启动序列。建议修法（卡 17）：启动成功即无条件 `api.settings.set(KEY_DIAGNOSTIC, '')` 并把状态栏写回「宠物」。补充事实：① 本会话 dev.log/dev2.log 全量**无**任何创建失败/创建被拒行 ⇒ 残留确系上一实例所写；② 该值在 11:16→11:44 之间变回 `（无）`（localStorage 现值 `pet.diagnostic:""`），**触发点未归因**——父代理推测的"子代理经跨窗 storage 通道手动清值"**并未发生**（该操作只在计划中、从未执行），其余候选（宿主设置同步/设置页某写入路径）无日志可证，两种可能并列存疑、不断言；③ 缺陷复现链以 11:16 读数为准，不受②影响。
- **D-2（轻微）拖动中面板弹出**。现象：任务卡负向自检"拖动中悬停面板不得弹出"不通过——拖动进行中（中途 bounds (280,283) 实证为真实中途）面板保持打开（t+5s/t+7s 两探针 `hasPanel=true`；截图 `drag-step40.png` 可见面板）。复现：悬停精灵（面板开）→ 左键拖动 → 面板全程在。疑似落点：`extensions/pet/app/App.vue` 的 `panelOpen = hovered || focusOpened` 未排除 `dragging`（D-13 只互斥了 trot/sleep/气泡）。建议修法：`panelOpen` 加 `&& !dragging` 或 drag start 时 `closePanel()`。
- **D-3（已撤销）** AFK 挂机发放账实疑问：11:47–11:57 的 `afkAcc` 回绕未见道具 +1 系我跨锁屏 dt 补算的墙钟重建误差；解锁后**两次实时观测发放正常**（12:08 fish 2→3/bubble 0→1；~12:25 fish 3→4/bubble 1→2）⇒ 撤销，非缺陷。
- **观察项（非缺陷）**：① 合成/边缘路径下 `pointerleave` 不触发可致 `hovered` latch（观察窗起点面板 latch 打开，CDP leave 修复；真实硬件离开正常）；② trot #2 墙钟 3.0s（帧数仍一轮，单次帧时钟抖动）；③ MuMu 模拟器顶层窗口干扰晚期 OS 命中/右键（环境因素）。

## 3. 需用户物理确认清单（真实鼠标，约 60 秒；Q15=B 后无隐藏/召唤项）

> 前置：dev 宿主按本卡命令在跑、宠物在右下角可见。以下结论不能由注入输入代替。**建议先关掉 MuMu 模拟器窗口**（它覆盖工作区会吃掉穿透落点）。

1. **0–20s 拖动跟手**：按住鲸鱼娘左键拖到屏幕中部再拖回右下角 ⇒ 窗体跟手、无"脱手"；往屏幕右缘/任务栏外拖 ⇒ 被钳在工作区内；松手后重启 obox ⇒ 回到松手处。
2. **20–35s 悬停与按钮**：鼠标停在宠物上 ⇒ 面板 120ms 淡入（等级/库存/按钮/✕，**无三属性行**）；点喂食/洗澡/玩耍 ⇒ 对应动画 + 气泡（呜哇！/泡泡好舒服～/玩得好开心！），气泡约 2.6s 自灭；道具为 0 时对应按钮灰掉点不动。
3. **35–45s 摸头与冷却**：点宠物本体 ⇒ `咕噜咕噜～被摸摸好舒服！`；1 分钟内再点 ⇒ `摸过头啦，让鲸鱼娘歇口气～`（仍播挥手）。
4. **45–55s 穿透手感**：在宠物上方空白处右键 / 拖桌面图标 ⇒ 应直接操作到桌面（窗体不吃指针）；移回宠物上 ⇒ 又能点中。
5. **55–70s 观感**：独置 10 分钟 ⇒ 慢呼吸 + 「打盹中（Zzz）」气泡；期间 2–5 分钟随机来一段约 1.5s 原地小跑；**拖动过程中面板是否弹出打扰**（D-2 人工复核）。

## 4. 未验证项与原因

- 真实鼠标**手感**类（跟手顺滑度、穿透手感、气泡观感）：注入输入不冒充，见第 3 节清单。
- 桌面右键菜单截图：MuMu 窗口覆盖工作区（环境干扰，见 0 节）；穿透本身已由 WindowFromPoint=Progman + 取色差 0 证明。
- 多显示器/非主显示器锚定、dpi≠1：本机单屏 dpr=1。
- 写盘失败诊断位（`宠物状态未能保存`）：无法在不改代码/不动磁盘权限下制造，仅验常态空。
- 存档损坏/超版本备份重建：属卡 10 单测覆盖，本卡不重复。
- 页面侧 `!ok` 坏气泡渲染分支：防御分支、真实 UI 不可达（按钮 disabled），桥级回包为证（卡 11 D-1 同口径）。
- 锁屏期测量：settle/帧时钟冻结 ⇒ 该窗口内不做 ③/CPU/取色/OS 输入（已排到解锁后并重做）。

## 5. 收尾确认

- dev 实例已全部关闭：12:44 核实 `Get-Process electron,obox` = 0、9333/5173 无监听（session 1 于 11:59 关闭、session 2 于 12:44 关闭）。
- 双仓零提交：宿主仓 HEAD 仍 `fbdb882d1939f4e3340d4cf1a6476c5430640269`、`git status --short` 24 行与基线一致；扩展仓仍 0 提交、15 行 untracked 与基线一致（本证据文件落在既有 untracked 目录 `openspec/` 内，不新增条目）。仓库内唯一新增文件 = 本证据文件。
- 存档处置：测试结束态留在 state.json（位置右下角 (2316,908)、fish 0/bubble 2、可见态）；重置前旧存档备份在 `%TEMP%\pet-e2e2\state-backup\state.json.orig`。
- 截图清单（`%TEMP%\pet-e2e2\`）：`00-baseline-fullscreen.png`、`L-10-pet-ok.png`、`L-20-hidden-capsule.png`（留档）、`U-04a-pet-ok.png`、`U-04b-pet-cooling.png`、`U-04c-feed-ok.png`、`U-04d-bathe-ok.png`、`U-04e-play-ok.png`、`U-04f-bathe-disabled.png`、`U-04g-feed-disabled.png`、`U-05-hover-panel.png`、`U-06-overlay-gone.png`、`U-06b-desktop-ctxmenu.png`（MuMu 误中留证）、`U-06c-mumu-dismissed.png`、`U-01c-clamped.png`、`U-01d-topleft-before-restart.png`、`U-01e-after-restart.png`、`U-final-fullscreen.png`、`drag-step40.png`、`drag-step80.png`、`drag-step70.png`、`W1b-*.png`（trot/sleep/周期）、`W2-*.png`（trot+自动喂食）。

---

## Q15 复验（卡 17 后）

> 任务卡：`tasks.md` §8.2（卡 17 落地后的实机复验）。范围：**① N11 图标面板实机、② N12 D-1 修复确认、③ 回归（D-2 拖动现场 / 文案抽测 / 设置页）**。
> 本代理只读实现代码、只写本证据文件；截图/脚本/日志全部落在 `%TEMP%\pet-e2e2\`（沿用，未删旧文件）。
> 上一位代理在本任务中异常终止且未写入任何内容 ⇒ 本节全部数据由本次从零重跑取得。
> **口径**：截图名相对 `%TEMP%\pet-e2e2\`；"渲染层截图"= 经 CDP `Page.captureScreenshot` 对 overlay 顶层 target 做 clip（不开 DevTools）；"OS 截图"= `CopyFromScreen`（cap.ps1）。

### 0. 环境

| 项 | 值 |
| --- | --- |
| 启动前现场 | 9333/5173 无监听、`Get-Process electron` = 0、无 dev 残留；已安装 obox 1.0.15 未在跑；node 只剩 22:02 起的 DSH web 服务（与本任务无关，未动） |
| 宿主动作 | 三次会话，同一参数 `npm run dev -- -- --remote-debugging-port=9333 --debug-extension pet@C:\Users\chenzhi\Documents\workspace\web\obox\extensions\pet` |
| session 1 | 13:19:0x 启动（`dev3.log`）——N11、Tab 顺序、D-2 拖动/钳位；13:25:22 关闭 |
| session 2 | 13:26:0x 启动（`dev3b.log`）——D-1 正向、重启回位、`hidden:true` 兼容、设置页、toggle；13:30:3x 关闭 |
| session 3 | 13:31:5x 启动（`dev3c.log`）——干净 fixture 下的文案抽测 + D-1 反向；13:34:3x 关闭 |
| 参数生效证据 | 每会话首段均见 `[debug] 调试扩展 1 个: pet@C:\…\extensions\pet` 与 `[overlay] 已创建: pet/pet.overlay 220x460 anchor=bottom-right margin=24 transparent=true alwaysOnTop=true skipTaskbar=true @(2316,908) 默认鼠标穿透=true` |
| 构建新鲜度 | `extensions/pet/dist` 产物时间 **13:16:29** > 最后一次源码改动 **13:11:39**（`index.js`）⇒ 本轮跑的就是卡 17 后的图标面板产物；产物 grep：`<svg` ×4、`aria-label` 与 喂食/洗澡/玩耍 均在、`召唤鲸鱼娘`/`鲸鱼娘藏起来了`/`summon`/`isHidden`/`vital-row` 全 0、CSS `.icon{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.6;…}`、`.actions{display:flex;flex-direction:row;gap:8px}` |
| DevTools | **全程未开** |
| 显示器 | 单屏 2560×1440，workArea=(0,0,2560,1392)，dpr=1 |
| CDP targets | 主窗 `http://localhost:5173/`；overlay page（`?obox-window=overlay&extId=pet&overlayId=pet.overlay&appId=pet.overlay&url=app%3A%2F%2Fdebug%2F…`）；iframe `app://debug/pet/dist/index.html`（宠物页真实运行处，iframe 偏移 (0,0)，尺寸 220×460） |
| **MuMu 是否在跑** | **在跑**。session 1 期间 MuMu 安卓设备窗体在屏（`Q15-01` 里面板正画在 MuMu 游戏画面上方 ⇒ 本轮的 overlay 在 MuMu 之上）；到收尾时实测 MuMu 只剩启动器窗体 `MuMuNxMain class=Qt5156QWindowToolSaveBits title='MuMu模拟器' rect=(1113,621)-(1973,1201)`，设备窗体已最小化（rect 为 -32000,-32000）。**影响面**：本轮唯一依赖 OS 命中的动作是拖动起点自检，在 (2400,1250) 返回 `Chrome_RenderWidgetHostHWND`（本窗）⇒ 落点未被 MuMu 吃掉；本轮**没有**做"空白区透出桌面/桌面右键菜单"这类会被 MuMu 干扰的项（那属卡 11/16 口径）。 |
| **并发真实鼠标操作（外来）** | session 2 期间检测到**非本代理脚本**的真实鼠标动作：光标停在 (979,1166)（本代理所有脚本结束位置都不是这里）；state.json 出现一段 (2340,932)→(2148,688) 的平滑拖动、外加一次摸头/一次喂食/一次洗澡（fish 3→1、clean 84.9→99.6、`lastPetAt` 被刷新）。时间落在两次脚本之间。**处置**：该轮文案数据作废，改用干净 fixture 在 session 3 重测（下文本项数据均来自 session 3）；`ask_user_question` 在子代理中不可用，故此项作为环境事实记录、未能当场与用户确认。 |

### 1. N11 图标面板实机 —— **通过**

- 方法：CDP 向 iframe 派 `Input.dispatchMouseEvent{mouseMoved}` 悬停精灵（3 次抖动 + 落点，抖动是为了让页面收到 pointermove）⇒ `q15-panel.mjs` 读 DOM 与 `getComputedStyle` 实际值；面板/图标截图两份：渲染层 clip（`q15-shot.mjs`，经 overlay 顶层 target）+ OS 截图（`cap.ps1`）。
- **原始断言（`out-q15-panel-1.txt`）**：`spriteRect={left:14,top:252,right:206,bottom:460,w:192,h:208}`；`hasPanel=true`；`panelText="幼鲸· 成长 3🐟 1｜🫧 3 ✕"`；`panelFlexDirection=column`；`actionsFlexDirection=row`；`actionsGap=8px`；`actionsChildCount=3`。
- **三枚按钮的可访问名（逐字实际值）**：`aria-label` 与 `title` 依次为 `喂食` / `洗澡` / `玩耍`；每枚 `innerText=""`、`childElementCount=1`（按钮内**只有 SVG、无任何文字节点**）。面板内文字节点全清单：`SPAN:幼鲸`、`SPAN:· 成长 3`、`SPAN:🐟 0`、`SPAN:｜`、`SPAN:🫧 2`、`BUTTON:✕`。
- **同一行 + 等宽（`getBoundingClientRect`）**：三枚 `top` 全为 **209.00**；`left` 递增 **21 / 83 / 145**；`width` 全为 **54.00**；`height` 28。⇒ 横向同一行、等宽、DOM 顺序 = Tab 顺序 = 喂食→洗澡→玩耍。
- **SVG 规格（计算值）**：三枚均 `svgTag=svg`、`class="icon"`、`viewBox="0 0 24 24"`、`aria-hidden="true"`、`fill=none`、`stroke=rgb(15, 23, 42)` **与所属按钮 `color` 逐字相同**（⇒ `stroke: currentColor` 生效）、`stroke-width=1.6px`、`stroke-linecap=round`、`stroke-linejoin=round`、`width=22px`、`height=22px`、`childElementCount=4`（小鱼：椭圆身+尾鳍+鳃线+眼；泡泡：一大两小三圆+高光弧；球：外圆+三条球缝）⇒ 图标为**内联 SVG**，非图标字体/emoji/`<img>`。
- **旧形态必须不存在**：`hasSummon=false`、`hasVitalRow=false`、`hasVitalFill=false`、`hasVitalsClass=false`、`panelHasVitalWords=false`、`panelHasSlash100=false`、`panelHasTimeUnit=false`、`panelHasSignedNumber=false`；面板文字节点里**没有"隐藏"按钮**（关闭按钮 `aria-label="关闭面板"`、文本 `✕`，`top=159`，仍在 DOM 末位）。
- **图形可辨识**：`Q15-02-panel-render-clip.png`（4×）+ `Q15-12-disabled-panel-clean.png`（4×）肉眼可辨 小鱼 / 泡泡 / 球；`Q15-01-icon-panel-mumu.png`（OS 2×，背景是 MuMu 游戏画面，反证 overlay 在 MuMu 之上）。
- **道具为 0 的禁用态**（fixture `fish=3` 起、连点面板喂食 3 次后 `fish=0`；`out-q15-copy-feed.txt`）：
  - `aria-disabled` **实际值 `"true"`**、`hasDisabledProp=false`、`disabledProp=false`（用的是 `aria-disabled` 而**不是** `disabled` 属性）；`opacity=0.45`；`cursor=not-allowed`；图标形状/配色不变。
  - **Tab 仍能停上去**（读 `document.activeElement`）：从 ✕ 起连续 6 次 Tab 序列 `["BUTTON[洗澡]","BUTTON[玩耍]","BUTTON[关闭面板]","DIV[宠物（回车摸头）]","BUTTON[喂食]","BUTTON[洗澡]"]` ⇒ 禁用的 **喂食** 仍在焦点序列内（若是 `disabled` 属性，这一格会被跳过）。
  - **点击被就地拦截**：CDP 点该按钮前后两次读数**逐字相同** ⇒ `before {inv:"🐟 0｜🫧 3", bubble:null, row:4}` / `after {inv:"🐟 0｜🫧 3", bubble:null, row:4}`（数值不变、无气泡、无动画触发）。
- **Tab 顺序实测**：`out-q15-tab-1.txt` 的循环 `… 喂食 → 洗澡 → 玩耍 → 关闭面板(✕) → 精灵 → 喂食 …`，与 design UX 节要求 `精灵 → 喂食 → 洗澡 → 玩耍 → ✕ → 回到精灵` 的**循环等价**（起点不同）。见"观察项 O-1"关于 ✕→精灵 那一步的 iframe `window.blur/focus` 现象。
- 截图：`Q15-01-icon-panel-mumu.png`、`Q15-02-panel-render-clip.png`、`Q15-11-feed-disabled-panel.png`（禁用态 + 残留喂食气泡）、`Q15-12-disabled-panel-clean.png`（禁用态干净图）。
- 结论：三枚内联 SVG 图标横向一行、等宽、可辨识、无文字标签、无隐藏按钮、无三属性行、无 `{cur}/100`；禁用语义为 `aria-disabled` 且**键盘可达**、点击被拦截。**全部符合卡 17 规格。**

### 2. N12 D-1 修复确认 —— **通过（正向 + 反向都拿到实机证据）**

- **预置方法（具体文件/通道）**：`pet.diagnostic` 是**设置键**，落在宿主设置存储 = **主窗渲染进程 localStorage 的 `obox:state:v1`**（`src/renderer/src/core/state.ts:15`，非 state.json）。本代理在主窗 CDP 里读改写该键，并**合成一次 `StorageEvent`** 走 ADR-0022 的既有跨窗同步通道（`stateStore.applyExternal`），使内存态与落盘态一致。原始数据：`{"before":"","wrote":"宠物窗体创建失败：overlay id 已存在（重复创建）","bytes":901}`；随后设置页"诊断"行**逐字**显示该句（`out-q15-settings-preset.txt`、`Q15-05-settings-preset-diag.png`）⇒ 预置"上一会话残留"成立。
- **重启（session 2）后应为空/（无）**：
  - 宿主设置存储原始键值：`pet.diagnostic` = **`""`**（`out-q15-diag-after-restart.txt`：`diagnosticRaw:""`、`diagnosticIsEmptyString:true`；同一次读数 `petSettings={pet.hunger:84.49…,pet.clean:84.91…,pet.mood:84.95…,pet.visible:true,pet.diagnostic:""}`）。
  - 状态栏实际文本：状态栏项 `status-item clickable` 文本 = **「宠物」**（同一读数 `statusItems` 里 `扩展已就绪 / 宠物 / Obox v1.0.15`）。
  - 设置页：诊断行 `values:["（无）"]`、`statusText:"（无）"`（`out-q15-settings-after-restart.txt`、`Q15-06-settings-after-restart.png`）。
  - `dev3b.log` 全量 grep `创建被拒|窗体创建失败|失败|异常|回退|重建|损坏|越权` = **0 行** ⇒ 本次启动确实**创建成功**，残留确系上一会话所写。
- **反向（能造出创建失败）**：本轮**构造成功**，且命中 `lastCreateFailed` 的 **init 分支**：让主窗渲染进程 `Page.reload`（主进程 `overlays` 表只在**主窗关闭**时清空，`src/main/appWindow.ts:216-232`）⇒ 新渲染进程里 pet 入口 init 的 `create` 撞上旧 overlay。原始日志（`dev3c.err.log`）：
  - `[overlay] 创建被拒（pet）：overlay id 已存在（重复创建）：pet.overlay；要重建请先 destroy('pet.overlay')`
  - `[renderer:warning] app://debug/pet/index.js:489 [pet] 窗体创建失败：overlay id 已存在（重复创建）：pet.overlay；要重建请先 destroy('pet.overlay')`（`index.js:489` = 入口 `requestOverlay` 内的 `console.warn`，且紧跟在重载后的 `[host] 启动完成: … 激活 11` 之后 ⇒ 确为 **init 阶段**失败）
  - 结果：`pet.diagnostic` **保留**失败文案（未被复位吃掉）：`宠物窗体创建失败：overlay id 已存在（重复创建）：pet.overlay；要重建请先 destroy('pet.overlay')`，状态栏同一句（`out-q15-reverse-d1.txt`：`BEFORE {"diagnostic":"", statusItems:[…"宠物"…]}` → `AFTER {"diagnostic":"宠物窗体创建失败：…", statusItems:[…"宠物窗体创建失败：…"…]}`）；设置页诊断行同句（`out-q15-settings-reverse.txt`、`Q15-13-settings-reverse-retained.png`）。
  - 侧记（**测试手法产物、非产品路径**）：重载后旧 overlay 窗体仍活着但被新渲染进程"孤儿化"，其页面打印 `订阅失败，2000ms 后重试：扩展未注册消息处理器`。
- **历史事实（不作归因）**：上一轮 `pet.diagnostic` 残留的**触发点始终未被归因**——卡 16 证据 D-1 已列过"父代理推测的子代理手动清值并未发生、其余候选无日志可证，两种可能并列存疑"。本轮只确认**修复后的行为**（成功启动 ⇒ 清空；本次失败 ⇒ 保留），不对上一轮残留成因下任何结论。
- 结论：D-1 双向都符合任务卡判据；失败文案在"本次启动真的失败"时**不会被复位吃掉**，排查线索保留。

### 3. 回归三项 —— **通过**

#### 3.1 D-2 拖动现场（真实鼠标）

- 方法：`q15-drag.ps1`（OS 级 `SetCursorPos`+`MOUSEEVENTF_MOVE` 真实输入队列；抖动到位 → `WindowFromPoint` 命中自检 → 按下 → 步进移动 → 松手）；拖动**过程中**插两次 `node q15-probe.mjs` 探针读 `hasPanel`；松手后再探一次。
- **双探针原始数据（`out-q15-drag1.txt`，拖动 (2400,1250)→(700,700)，100 步）：**
  - `pre-hit class at (2400,1250) = Chrome_RenderWidgetHostHWND`
  - `pre-drag(hover: panel should be OPEN)` ⇒ `hasPanel:true`（active=`BUTTON[玩耍]`）
  - `mouse-down-before-move(panel should be CLOSED)` ⇒ **`hasPanel:false`** ← 已知取舍：按下瞬间即收起
  - `during-drag-step40-at-1720-1030` ⇒ **`hasPanel:false`**
  - `during-drag-step70-at-1210-865` ⇒ **`hasPanel:false`**
  - `after-release(pointer still on pet: panel should be OPEN)` ⇒ **`hasPanel:true`**（active=`BUTTON[喂食]`）⇒ 松手且指针仍在宠物上时面板**恢复**，没有"拖完再也不出"
  - 拖动中截图 `Q15-03-drag-nopanel-50.png`（区域 (1454,753,244×350)，窗体跟手位置，画面内**没有面板**）
- **跟手**：`dev3.log` 该次拖动共 **101** 行 `[overlay] setPosition`（100 步 + 落定），末值 `(616,358)` = 起点窗位 `(2316,908) + (700-2400, 700-1250)` 逐像素吻合；松手强制落盘 `state.json position={"x":616,"y":358}`。
- **钳位**：第二次拖动 (700,700)→(2500,1400)，`dev3.log` 出现 `[overlay] setPosition: pet/pet.overlay 请求(2356,944) 钳制后(2340,932)`（多行），落定 `state.json position={"x":2340,"y":932}` = workArea 极限 `(2560-220, 1392-460)` 逐像素吻合（`out-q15-drag2-clamp.txt`）。松手时指针在 (2500,1400)、已越出窗体下缘 (1392) ⇒ 该次 `hasPanel:false` 属正确几何判定（指针不在宠物上），不计缺陷。
- **重启回存档位置**：session 2 启动后 `[overlay] 已创建 … @(2316,908)` 紧接 `[overlay] setPosition: pet/pet.overlay → (2340,932)`（= session 1 拖后落盘位）✓；session 3 启动后 `setPosition → (2148,688)`（= 上一会话结束时的存档位）✓，两次复现。
- 结论：拖动跟手、钳位到工作区极限、落盘、跨重启回位 全部正常；**D-2 已修**（拖动全程 `hasPanel=false`，松手即恢复）。

#### 3.2 文案抽测（逐字 + 截图 + 正则）

| # | 情形 | 实际气泡/DOM 逐字（`out-q15-copy-*.txt`） | 触发口径 | 截图 |
| --- | --- | --- | --- | --- |
| 1 | 摸头成功 | `咕噜咕噜～被摸摸好舒服！` | CDP 点精灵本体（fixture `lastPetAt=0`，首次） | `Q15-07-pet-ok.png`（row 3 petted） |
| 2 | 摸头冷却 | `摸过头啦，让鲸鱼娘歇口气～` | 紧接着第二次点精灵（5 分钟内） | `Q15-08-pet-cooling.png`（仍 row 3、心情不计分） |
| 3 | 喂食成功 | `呜哇！小鱼干好好吃！` | 点面板图标「喂食」（3 次：fish 3→2→1→0） | `Q15-10-feed-ok.png`（row 4 eating） |
| 4 | 玩耍成功 | `玩得好开心！` | 点面板图标「玩耍」 | `Q15-09-play-ok.png`（row 7；道具不变 🐟3｜🫧3） |
| 5 | 无小鱼干 | `没有小鱼干了，多陪我工作一会儿吧～` | fish=0 时**第 4 次**喂食尝试（桥级 `pet.interact{kind:'feed'}`） | 回包逐字 `{"ok":false,"error":"没有小鱼干了，多陪我工作一会儿吧～"}`；禁用态截图 `Q15-11/12` |
| 6 | 洗澡成功 | `泡泡好舒服～洗干净啦！` | 卡 16 已验（本轮未重跑，实现未动） | `U-04d-bathe-ok.png`（卡 16） |
| 7 | 打盹 | `打盹中（Zzz）` | 卡 16 已验（本轮观察窗未重跑） | `W1b-bubble-18.png`（卡 16） |

- 口径注①：**无鱼干的页面侧坏气泡分支在真实 UI 下不可达**——道具为 0 时按钮走 `aria-disabled` + `onAct()` 就地拦截，点下去**根本不发请求**（3.1 节已验证"前后数值逐字相同、无气泡"）。因此本句以**桥级回包逐字**为证（与卡 11/16 同口径），并额外给出"点击被拦截"这一新行为的实测。
- 口径注②：`fish=0` 后桥级 feed 的 `afterBridgeNoFish {inv:"🐟 0｜🫧 3", bubble:null, row:4}` ⇒ 拒绝后状态与画面都不变。
- **全量正则复核（`q15-corpus.mjs`、语料 `q15-corpus.txt`）**：语料 31 行（本轮 16 个 `out-q15-*.txt` 里抽出的全部 bubble/panelText/inv/statusText/error/text/rowText/文案节点 + 显式补入的 D-16 十句与面板/设置页可见文案）⇒ `/\d+\s*(分钟|秒|小时)/` **0 命中**、`/[+-]\d+/` **0 命中**。面板侧的 `panelHasTimeUnit=false`、`panelHasSignedNumber=false`（§1）为同判据的 DOM 级复核。
- 口径注③：设置页 `{cur}/100` 与面板成长值/库存裸数字属**值显示**，按 design D-16 既有口径不在禁令内。

#### 3.3 设置页

- **三行 progressbar + `NN/100` + 无 description + 诊断位**（`out-q15-settings-after-restart.txt`，session 2 重启后）：
  - `饥饿度 [role=progressbar] aria-valuenow=84 aria-valuemax=100 values:["84/100"] desc:null`
  - `清洁度 … 84/100 desc:null`、`心情 … 84/100 desc:null`
  - `显示宠物` boolean（`checked:true`）、`诊断 values:["（无）"] statusText:"（无）"`；行内**无 input/select/button**（progress 行 `toggle:null`）。
- **互动后不重进页面、当帧刷新**（`out-q15-live-update.txt`）：主窗打标记 `window.__q15mark="q15-live-1792128410458"` → 桥级 `pet.interact{kind:'feed'}`（回包 ms=4，`feedback.text="呜哇！小鱼干好好吃！"`，items fish 3→2）→ 1.2s 后**同一实例**复读：`饥饿度 84/100 → 89/100`，标记仍为同一值、`nav:"设置"` ⇒ **未重进页面**。
- **toggle 关 ⇒ target 消失 + CPU 回落；开 ⇒ target 回归 + 数值连续不重置**（`out-q15-toggle.txt`）：
  - 开态：targets = `page:overlay | iframe:pet/dist | page:main`；CPU（electron 全进程 `TotalProcessorTime` 10s 差，口径同卡 01）**296.9 ms/10s，procs=7**。
  - 关：`settings.mjs off` ⇒ targets 只剩 `page:main`（overlay page 与 iframe **都消失**）；CPU **46.9 ms/10s，procs=5**（回落 84%）。
  - 开：targets 回归 `overlay + iframe + main`，日志 `[overlay] 已创建 …` + `[overlay] setPosition: pet/pet.overlay → (2148,688)`（**回到存档位**）；三行数值 关前 `90/99/92` → 开后 `90/99/92`（**未重置回 100**，连号）;诊断位全程 `（无）`。
  - 说明：本次 CPU 绝对值高于卡 16（218.8→15.6），但方向与量级关系一致；采样窗内存在外来鼠标活动的可能（见 0 节），故只作"显著回落"的定性判据，不作跨轮绝对值比较。

### 4. 缺陷清单（只记录不修）

- **本轮未发现实现级缺陷（阻塞项 0 条）。**
- **O-1（观察项，未归因是否本轮引入）Tab 从 ✕ 移到精灵时面板会闪一次**。事实（`out-q15-tabinstr.txt` 时间线）：在 ✕ 上按 Tab ⇒ 同一 tick 内 iframe `window` 触发 `blur` + `focus` 事件对 ⇒ `App.vue` 的 `onWindowBlur` 走 `closePanel()`（非 dismiss）⇒ `panel.removed`(t=23ms)，焦点落到精灵；再按一次 Tab 由精灵的 keydown 分支 `openPanelByFocus()` 重新开面板并把焦点送到「喂食」。**净效果**：Tab 顺序仍为 精灵→喂食→洗澡→玩耍→✕→精灵（不丢站），但 ✕→精灵 这一步有一次开合闪烁。卡 16 只记录了 `activeElement`，看不到这个现象 ⇒ **无法判定是否卡 17 引入**，如实记录、交回裁定。
- **O-2（环境，非缺陷）外来真实鼠标操作**：session 2 期间（约 13:26:52–13:27:5x）有非本代理脚本的真实鼠标动作（光标位置异常 + 一段 (2340,932)→(2148,688) 拖动 + 一次摸头/喂食/洗澡）。导致该轮"摸头成功"拿到的是冷却句、`fish` 计数被破坏；已清理 fixture 后在 session 3 重测。
- **O-3（环境，非缺陷）MuMu 在跑**：见 0 节。session 1 的 OS 截图背后是 MuMu 游戏画面（也反证 overlay 置顶生效）；拖动起点 OS 命中自检仍返回本窗类名 ⇒ 未影响本轮结论。本轮未做"桌面透出/右键菜单"类易受 MuMu 干扰的项。
- **O-4（测试手法产物，非产品路径）**：D-1 反向测试用的"渲染进程重载"会让旧 overlay 窗体孤儿化（`订阅失败…扩展未注册消息处理器`）。真实用户路径不会这么干，仅为构造 init 失败的手段。

### 5. 需用户物理确认清单（图标面板版，真实鼠标，约 60–70 秒）

> 前置：dev 宿主按任务卡命令在跑、宠物可见。以下结论**不能由注入输入代替**。**建议先关掉 MuMu 模拟器窗口**（它覆盖工作区会吃掉穿透落点）。**本轮已去掉"隐藏/召唤"两项**（功能整体移除）。

1. **0–18s 拖动跟手 + D-2 复核**：按住鲸鱼娘拖到屏幕中部再拖回右下角 ⇒ 窗体跟手、无脱手；**拖动过程中面板不应出现**（D-2），松手且指针还停在宠物上 ⇒ 面板应立刻回来；往屏幕右缘/任务栏外拖 ⇒ 被钳在工作区内；重启 obox ⇒ 回到松手处。
2. **18–32s 图标面板观感（N11 重点）**：鼠标停在宠物上 ⇒ 面板 120ms 淡入，应看到**三枚横向一行、等宽的图标按钮（小鱼 / 泡泡 / 球）**，**没有任何文字标签**、**没有"隐藏"按钮**、无三属性行、无 `NN/100`；把鼠标移到每枚上应有 `title` 中文提示（喂食/洗澡/玩耍）。
3. **32–45s 图标可点 + 禁用态**：点「喂食/洗澡/玩耍」⇒ 对应动画 + 气泡（呜哇！/泡泡好舒服～/玩得好开心！），约 2.6s 自灭；把道具用到 0 ⇒ 对应图标变淡（半透明）且鼠标变禁止光标，点它**没有任何反应**（数值不变、不出气泡）；用 **Tab** 键应仍能落到那枚变淡的图标上（有焦点环），回车也不该发出动作。
4. **45–55s 摸头与冷却**：点宠物本体 ⇒ `咕噜咕噜～被摸摸好舒服！`；5 分钟内再点 ⇒ `摸过头啦，让鲸鱼娘歇口气～`（仍播挥手）。
5. **55–70s 穿透 + 观感**：在宠物上方空白处右键 / 拖桌面图标 ⇒ 应直接操作到桌面（窗体不吃指针）；移回宠物上 ⇒ 又能点中。独置 10 分钟 ⇒ 慢呼吸 + 「打盹中（Zzz）」；期间 2–5 分钟随机来一段约 1.5s 原地小跑。
6. **可选 10s 收尾**：设置页「显示宠物」关 ⇒ 宠物消失、状态栏/设置页仍在；再开 ⇒ 宠物回到原位、三条进度条数字**接着原来的值**（不重置 100）；诊断行常态 「（无）」。

### 6. 未验证项与原因

- **trot / sleep 观察窗（2–5 分钟、第 10 分钟）本轮未重跑**：卡 16 已逐帧验证且卡 17 未改动画与门控；本卡范围是 N11/N12 + 拖动与文案回归。若需复验，需 ≥12 分钟静置窗口。
- **洗澡成功文案（`泡泡好舒服～洗干净啦！`）本轮未重跑**：同上，卡 16 有逐字与截图；卡 17 未动该路径。
- **真实鼠标手感类**（跟手顺滑度、穿透手感、气泡观感、图标"好不好认"）：注入输入不冒充，见第 5 节清单。
- **桌面右键菜单截图 / 空白区透出桌面取色**：MuMu 在跑（见 0 节），本轮不重复卡 11/16 该项。
- **写盘失败诊断位（`宠物状态未能保存`）**：不改代码/不动磁盘权限无法制造，仅验常态空。
- **多显示器 / 非主显示器锚定 / dpi≠1**：本机单屏 dpr=1。
- **`hidden:true` 旧存档兼容**：已做（fixture 带 `hidden:true` 启动 ⇒ 精灵正常渲染、无 `state.json.bad`、无 warn，落盘后该键被丢弃：`state.json` 无 `hidden`），但**未**覆盖"旧存档同时含隐藏态与非法位置"的组合。
- **上一轮 `pet.diagnostic` 残留的触发点**：仍未归因（历史事实，见 §2）。

### 7. 收尾确认

- dev 实例已全部关闭：13:35 核实 `Get-Process electron` = 0、9333/5173 **无 LISTEN**（只剩 TIME_WAIT）；未杀与本任务无关的 node（22:02 起的 DSH web 服务仍在）。
- 双仓零提交、无越界写入：宿主仓 HEAD 仍 `fbdb882d1939f4e3340d4cf1a6476c5430640269`、`git status --short` **24 行**与基线一致；扩展仓仍 **0 提交**、**15 行** untracked 与基线一致（本证据文件落在既有 untracked 目录 `openspec/` 内，不新增条目）。仓库内唯一被写的文件 = 本证据文件。
- 存档处置：`state.json` 留在 session 3 结束态（`fish:0`、`bubble:3`、三属性 92/79/86、`position:(2148,688)`、`lastPetAt` 有值）；本轮各阶段备份：`%TEMP%\pet-e2e2\state-backup\state.json.q15pre`（本轮开始前）、`state.json.q15mid`（fixture 前）、`state.json.orig`（卡 16 的重置前原件）。**注意**：session 3 以"渲染进程重载"收尾，进程被关掉后该孤儿 overlay 已随进程消失；下次启动会正常建窗并把诊断位复位。
- 截图清单（`%TEMP%\pet-e2e2\`，本轮新增 12 张）：`Q15-01-icon-panel-mumu.png`、`Q15-02-panel-render-clip.png`、`Q15-03-drag-nopanel-50.png`、`Q15-05-settings-preset-diag.png`、`Q15-06-settings-after-restart.png`、`Q15-07-pet-ok.png`、`Q15-08-pet-cooling.png`、`Q15-09-play-ok.png`、`Q15-10-feed-ok.png`、`Q15-11-feed-disabled-panel.png`、`Q15-12-disabled-panel-clean.png`、`Q15-13-settings-reverse-retained.png`；本轮日志 `dev3.log`/`dev3b.log`/`dev3c.log`(+`.err`)、原始断言 `out-q15-*.txt`、语料 `q15-corpus.txt`、新脚本 `scripts/q15-*.mjs`、`scripts/cap.ps1`、`scripts/q15-drag.ps1`（旧文件均未删）。

---

## 卡 18 后复验（10 秒随机表演 + 图标白线透明底）

> 任务卡：`tasks.md` §9.2（卡 18 落地后的实机复验）。范围：**① N13 随机表演观感、② 打盹期间安静、③ N14 图标白线/透明底/悬浮浮层、④ 回归（面板开合 / 拖动 / 文案 / 设置页与 toggle）**。
> 本代理只读实现代码、只写本证据文件（及其 `docs/spec/…` 同源副本）；截图/脚本/日志全部落在 `%TEMP%\pet-e2e2\`（沿用，未删旧文件）。
> 口径：截图名相对 `%TEMP%\pet-e2e2\`；"渲染层截图" = 经 CDP `Page.captureScreenshot` 对 overlay 顶层 target 做 clip（全程不开 DevTools）。

### 0. 环境

| 项 | 值 |
| --- | --- |
| 启动前现场 | 9333/5173 无监听、`Get-Process electron` = 0；已安装 obox 未在跑；无关 node（22:02 起的 DSH web 服务）未动 |
| 宿主动作 | 三次会话，同一参数 `npm run dev -- -- --remote-debugging-port=9333 --debug-extension pet@C:\Users\chenzhi\Documents\workspace\web\obox\extensions\pet` |
| session A（`dev4.log`） | 14:13:37 起 —— N13 被动观察 180s、逐轮追踪 120s、rAF/帧停留 32s、N14、面板开合、玩耍/洗澡文案；14:37:0x 关闭 |
| session B（`dev5.log`） | 14:37:35 起 —— 拖动尝试（被锁屏挡住）、设置页、toggle、摸头文案、打盹闸门、桥级拖动/钳位；14:43:5x 关闭 |
| session C（`dev6.log`） | 14:44 起 —— 重启回位校验；14:45:5x 关闭 |
| 参数生效证据 | 每会话首段均见 `[debug] 调试扩展 1 个: pet@…` 与 `[overlay] 已创建: pet/pet.overlay 220x460 anchor=bottom-right margin=24 transparent=true alwaysOnTop=true skipTaskbar=true @(2316,908) 默认鼠标穿透=true` |
| 构建新鲜度 | `dist/index-DZ8id3ZK.js`(+`index-DRxxmL2O.css`) 构建于 **14:10:34** > 最后一次源码改动 **14:10:22**（`app/App.vue`）⇒ 本轮跑的就是卡 18 产物（产物文件名与卡 17 不同，确已重建） |
| DevTools | **全程未开** |
| 显示器 | 单屏 2560×1440，workArea=(0,0,2560,1392)，dpr=1 |
| CDP targets | 主窗 `http://localhost:5173/`；overlay page（`?obox-window=overlay&extId=pet&overlayId=pet.overlay&appId=pet.overlay&url=app%3A%2F%2Fdebug%2F…`）；iframe `app://debug/pet/dist/index.html`（宠物页真实运行处，iframe 偏移 (0,0)、尺寸 220×460） |
| MuMu | 设备窗体**已最小化**（rect -32000,-32000）；屏上只剩 `MuMuNxMain`「MuMu模拟器」 (1113,621)-(1973,1201)。本轮**没有**依赖 OS 命中的验收项（唯一一次真鼠标拖动被锁屏挡住，见 §4②），故 MuMu **未影响任何结论** |
| **锁屏（关键环境事实）** | 约 **14:38 起** `Get-Process LogonUI` = 1、`WindowFromPoint(2250,1050)` 返回 `Windows.UI.Core.CoreWindow`（标题「Windows 默认锁屏界面」）；期间 `CopyFromScreen` 取到的是锁屏壁纸（`Q18-09-screenstate.png`）。⇒ **OS 级真实鼠标/拖动不可用**（§4② 因此只做替代口径）。另：锁屏期间 electron 全进程 CPU 实测 **0.0 ms/10s**（渲染被挂起），故 toggle 的 CPU 项本轮无效（§4④） |
| **外部并发改动（HMR）** | **14:25:56** 有 11 个宿主 `src/` 文件被写入（另一个代理在改/提交宿主，现宿主 HEAD 已到 `f41d561`、工作区 clean）⇒ Vite 对宿主渲染进程做热更新/重载 ⇒ 运行中的 overlay 被"孤儿化"：日志出现 `[overlay] 创建被拒（pet）：overlay id 已存在…`、宠物页打印 `订阅失败…扩展未注册消息处理器` 并回落到首帧占位（`成长 0🐟 3｜🫧 3` + 「正在连接宠物状态…」）。后果：① 一个采样脚本在目标被替换后挂住（已 kill 重跑）；② 一次互动采样作废。**非产品缺陷**（卡 17 已归因的"渲染进程重载"手法产物）；副作用上它**偶发复现了卡 17 的 D-1 反向场景**——诊断位/状态栏又显示出「宠物窗体创建失败：overlay id 已存在（重复创建）…」，下一次成功启动（session B）后自动复位为 `""`/「宠物」，与卡 17 结论一致 |

### 1. N13 每 10 秒随机表演 —— **节奏与抽取通过，但发现实现级缺陷 D-1（见 §5）**

- 方法：让宠物独自待着（指针停在 (300,300) 远离窗体），**页内 60ms 采样"实际渲染行" + 行变化时经消息桥取入口权威 `anim.status`**（`q18-perf-watch.mjs` / `q18-perf-trace.mjs`），另用 `q18-raf.mjs` 采 rAF 频率与逐帧停留。
- **节奏（入口侧，1s 采样分辨率；`out-q18-trace-summary.txt`）**：120s 内 **12 轮**，起点间隔逐条为 `10.00 / 9.99 / 9.99 / 10.02 / 9.99 / 10.00 / 10.17 / 9.84 / 10.15 / 10.14 / 9.70` 秒 ⇒ **严格每 10 秒一轮**（与 `RANDOM_PERF_EVERY_SEC=10` 一致）。
- **抽取覆盖（两轮观察合计 ≥22 轮）**：**7 项全部自然抽到** —— `eating 3 / petted 2 / bathing 2 / run-right 2 / playing 1 / run-left 1 / trot 1`（120s 窗口，另加 180s 窗口同集）⇒ 随机集确实是那 7 项，`hungry/dirty/sad/sleep` **一次都没出现**（与 design D-14 一致）✓
- **不耗道具 / 不改数值 / 不弹气泡**：随机表演期间 `items`/`vitals`/`growth` 只有 tick 的自然衰减、无跳变；采样到的 `bubble` 恒为 `null`（表演不弹气泡）✓
- **引擎健康度**：`q18-raf.mjs` 实测 rAF **1922 ticks / 32054ms = 60.0 Hz**（无节流），idle 轨逐帧停留稳定 **400ms**（与 pet.json 一致）⇒ 下面测到的时长不是被 rAF 节流"拉长"的。
- **渲染停留（`q18-trace.jsonl` → DOM 行切段）**：
  - `trot`(row7) **2410ms**、`run-left`(row2) **3210ms**、`run-right`(row1) **3210 / 3190ms** ⇒ **会回落**到呼吸 idle，但比规格（1.5s / 1.8s）长 0.9–1.4s（其中 `TRANSIENT_SLACK_MS`=500ms 是设计内的兜底余量，其余为回落路径本身的延迟）。
  - `eating`(row4) **4980 / 14990ms**、`bathing|petted`(row3) **4980 / 24980ms**、`playing`(row7) **10000ms** ⇒ **播完不回落**：页面一直渲染该轨直到入口下一次状态推送（下一次随机表演 10s 或 15s tick），连续几轮抽到同轨时会连成一片（实测最长 **24.98s** 连续渲染 row3）。
- **原地侧向跑是否别扭（观感判断，附 20 张帧）**：`Q18-run-left-f01..f10.png`、`Q18-run-right-f01..f10.png`（416×444、2×）显示宠物以**侧面朝向**（左/右）做 8 帧行走循环，腿部交替、**身体零位移**（该窗口 `dev4.log` 内 **0 行** `setPosition`，与"只原地播帧"一致）。**我的判断：动作本身画得干净、不丑，但它是"位移动作零位移播放" ⇒ 读起来是原地踏步/太空步；真正让它显得别扭的是 D-1——它把 1.8s 的一轮拖成 3.2s，越长越像"走了半天没动"。** 结论与建议见 §6。
- 截图：`Q18-run-left-f01..f10.png`、`Q18-run-right-f01..f10.png`、`Q18-04-idle-contrast.png`（同窗体全幅）。

### 2. 打盹期间安静 —— **通过（时钟推进法，父代理明确许可）**

- 方法（`q18-sleep-test.mjs`）：入口跑在主窗渲染进程，把主窗的 `Date.now` **前推 11 分钟**（`window.__q18RealNow` 保存原函数、用完立即还原），使 `resolveStatus` 的第 3 条（`now-lastInteractAt ≥ 10min`）成立；**不碰 `state.json`、不碰任何实现代码**。
- 原始数据（`out-q18-sleep.txt` / `q18-sleep-test.json`）：
  - **基准（推进前，32s）**：3 次表演 —— `run-right@1.8s`、`eating@10.8s`、`run-left@21.6s`，各自约 1.8s 后回 idle。
  - **前推后（100s）**：入口状态序列**只有一条** `{t:0, status:"sleep"}`（采样起点的 sleep 本身，**不是**一次表演）⇒ **100 秒内没有任何 idle→表演 的转换，即随机表演触发 0 次**；同时气泡出现 **`打盹中（Zzz）`**；末次读数 `{"status":"sleep","row":0}`。
  - **还原时钟后（32s）**：表演恢复 2 次（`run-right@18.0s`、`run-left@28.9s`）⇒ 证明那 100 秒里 10s 定时器**一直在跑**，是**闸门**在拦，不是定时器停摆。
- 口径注：本机 14:38 起锁屏、且 rAF 在锁屏期被挂起，故"帧时长 ×1.5 慢放"这一项**本轮未复现**（`resolveStatus='sleep'` 已由上面的状态序列证实；慢放与 Zzz 气泡的实现见卡 16 的 `out-frames-sleep.json` 与 `W1b-bubble-18.png`）。
- 结论：**打盹期间确实安静**——10s 定时器照常到点，但 `onRandomPerf` 的 `status === 'sleep'` 闸门每次都拦下，"睡着了还自己表演"不会发生 ✓

### 3. N14 图标（透明底 / 白线 / 悬浮浮层 / 焦点环）—— **通过**

- 方法：`q18-icon.mjs`，双口径 —— ① 真实 CDP 指针移动（测"即时"延迟）；② `CSS.forcePseudoState`（确定性交叉验证，抗外部鼠标干扰）；另用真实 `Tab` 走键盘路径。
- **静态计算样式（面板打开、无悬浮）**：三枚 `button.act` 全部 `background-color: rgba(0, 0, 0, 0)`、`background-image: none`（**无渐变底**）、`border-top-color: rgba(0, 0, 0, 0)`（1px 透明边框槽）、`svg.icon` 全部 **`stroke: rgb(255, 255, 255)`**、`fill: none`、`stroke-width: 1.6px`、`22px×22px`；`aria-label` 逐字 = 喂食 / 洗澡 / 玩耍，**原生 `title` 已去除**（`titleAttr: null`，无双提示）。
- **`.tip` 浮层**（`.panel .tip`）：三枚各一条，文本逐字 喂食 / 洗澡 / 玩耍；默认 `visibility:hidden` + `opacity:0`；`transition-duration: **0s**`（零过渡 ⇒ 真"即时"）；`background: rgba(15,23,42,.92)`、白色字、`border-radius: 6px`、`pointer-events: none`、`aria-hidden="true"`。
- **真实指针悬浮（逐枚实测）**：`hidden/0 → visible/1` 耗时 **17ms**（≈1 帧，含 CDP 往返）；`tipAboveBtn: true`、tip 与按钮**中心偏差 0px**、间隙 **5px**（tip 底 204 ↔ 按钮顶 209）；悬浮态按钮 `background: rgba(255,255,255,0.08)` + `border: rgba(255,255,255,0.28)`（极淡白叠加 + 白描边高亮）✓
- **禁用态**：`fish=0` 的「喂食」`aria-disabled="true"`、`opacity:0.45`，悬浮时**不加白底/白边**（`:not([aria-disabled='true']):hover` 生效），但**它的 `.tip` 照常显示**「喂食」✓（与任务卡负向自检一致）
- **焦点环**：`:focus-visible` ⇒ `box-shadow: rgb(255, 255, 255) 0px 0px 0px 2px`（**白色 2px**）；`forcePseudoState` 与真实 `Tab` 两条路径都逐字命中；键盘聚焦时对应 `.tip` 同时可见 ✓
- 截图：`Q18-01-panel-whiteicons.png`（面板 + 三枚白线图标）、`Q18-02-tip-feed/bathe/play.png`（悬浮浮层）、`Q18-03-focus-ring.png`（白色焦点环）。
- **可读性结论**：白色 1.6px 线条在 `rgba(15,23,42,.92)` 深色玻璃面板上对比清晰、三枚图形（小鱼 / 泡泡 / 球）均可辨识；禁用那枚靠透明度变淡而不是变色，仍看得出是什么动作。
- **观察项（非缺陷，见 §5）**：① 鼠标停在其中一枚上、同时用键盘把焦点移到另一枚时，**两条 `.tip` 会同时显示**（`Q18-03-focus-ring.png` 里「洗澡」+「玩耍」同时可见）；② 关闭按钮 ✕ 仍是旧的青色焦点环 `rgba(56, 189, 248, 0.85)`，与三枚图标的白色环不一致（卡 18 只改了 `.act`）。

### 4. 回归四项

**① 面板开合（进宠物显示 / 移到面板上保持 / 完全离开立刻关闭）—— 通过**（`q18-panel.mjs`、`out-q18-panel.txt`）

- 指针进精灵 ⇒ `hasPanel=true`；指针移到**面板上**（等级行 (40,166)）⇒ **8/8 连续采样（约 720ms）全部 `true`**（面板自己在命中矩形里 ⇒ 保持显示）✓
- 完全离开（移到 (2,2)）⇒ **判定延迟 `judgeLatency_ms = 2.2ms`**（从页面收到的第一条 pointermove 事件到 `.panel-fade-leave-active` 的 `pointer-events:none` 生效 = 判定已翻转），DOM 节点移除在其后 **17.2ms** ⇒ **没有 120ms 以上的判定延迟**；`panelOpen` 是纯同步 computed、`hitBoxes()` 只看它，过渡只作用在视觉属性上 ✓
- 回到精灵 ⇒ 面板恢复 `true` ✓
- 口径注：本机 `prefers-reduced-motion` 使淡出被 `transition: none` 关掉（DOM 移除只用 17ms），因此「淡出 120ms 内不吃指针」这条加固**在本机窗口期内不可观测**（代码在 `App.vue` 的 `.panel-fade-leave-active { pointer-events: none }`，已读码确认）。

**② 拖动（跟手 / 拖动中面板不弹 / 松手恢复 / 钳位 / 重启回位）—— 部分通过；"跟手"半项被锁屏挡住**

- **被挡住的部分**：14:37:57 用 OS 真鼠标脚本从宠物身上起拖，`pre-hit class at (2250,1050) = Windows.UI.Core.CoreWindow`（锁屏界面）⇒ 鼠标事件根本没进 overlay，`dev5.log` 未新增 `setPosition`、`state.json` 位置不变。截图 `Q18-08-drag-40.png` 留证（画面是锁屏）。**"跟手/顺滑手感"本轮未复验**（卡 17 已用真鼠标验过 101 行 setPosition 逐像素吻合；卡 18 未改该路径的页面侧接线）。
- **替代口径 A（页面侧：拖动中面板不弹、松手恢复）—— 通过**（`out-q18-dragtest.txt`）：`panelBefore=true` ⇒ CDP 在精灵上按下后 **5/5 采样全部 `false`**（press 期间 `dragging=true` ⇒ `panelShouldOpen` 为假）⇒ 同点抬起后 **`true`**（松手即恢复）✓ 与卡 17 的真鼠标结论一致。
- **替代口径 B（入口侧：桥级 `pet.drag` start/move/end）—— 通过**：
  - 起点自记位 (2148,688) 收到 `move{dx:-1400,dy:-350}` ⇒ 回包 `position:{x:748,y:338}` = 逐像素精确累加 ✓；`end` ⇒ 落盘 `state.json position={748,338}`（强制落盘）✓
  - 超大增量 ⇒ `dev5.log` `[overlay] setPosition: pet/pet.overlay 请求(100747,100337) 钳制后(2340,932)`，(2340,932) = workArea 极限 (2560-220, 1392-460) 逐像素吻合 ✓
  - 负向：`{phase:'nope'}` ⇒ `未知拖动阶段: nope`；`{dx:'x'}` ⇒ `拖动增量非法：dx/dy 必须是有限数字`（都不移动）✓
  - **重启回位**：落到位 (640,332) ⇒ session C 启动日志 `[overlay] setPosition: pet/pet.overlay → (640,332)` ✓

**③ 文案抽测 —— 通过（4 句逐字 + 正则 0 命中）**

| 情形 | 实际气泡逐字 | 证据 |
| --- | --- | --- |
| 摸头成功 | `咕噜咕噜～被摸摸好舒服！` | `out-q18-pet.txt`、`Q18-06-pet-ok.png` |
| 摸头冷却 | `摸过头啦，让鲸鱼娘歇口气～` | 同一次会话内连点两次、`Q18-07-pet-cooling.png` |
| 玩耍成功 | `玩得好开心！` | `out-q18-interact.txt`、`Q18-05-play-ok.png`（道具不变 `🐟0｜🫧2`） |
| 洗澡成功 | `泡泡好舒服～洗干净啦！` | 同上、`Q18-05-bathe-ok.png`（`🫧` 2→1） |

- 面板 + 气泡 + 三条 `.tip` 的全文本复核：`/\d+\s*(分钟|秒|小时)/` **0 命中**、`/[+-]\d+/` **0 命中**、`/\d+\s*\/\s*100/` **0 命中**（面板文本实测 `幼鲸· 成长 4🐟 0｜🫧 1喂食洗澡玩耍 ✕`）✓
- 口径注（与 D-1 相关）：点「玩耍」后 1.7s，气泡仍是「玩得好开心！」而精灵已被随机表演抢占到 `eating` 轨（`out-q18-interact.txt` 的 rowTimeline）——**气泡与动画短暂不一致**，根因同 §1 的 D-1。

**④ 设置页与 toggle —— 结构通过；CPU 项在锁屏下无效**

- 三行 `[role=progressbar]` + `aria-valuemax=100` + 右侧 `NN/100`（`68/100`、`98/100`、`96/100`）+ 各行 `desc: null`（无 description）+ 诊断行 `（无）` + boolean「显示宠物」`checked:true`（`out-q18-settings-rows.txt`、`Q18-10-settings.png`）
- toggle 关 ⇒ targets 只剩主窗（overlay page 与 iframe **都消失**）；开 ⇒ targets 回归 + `[overlay] 已销毁` → `已创建` → `setPosition → (2148,688)`（存档位）+ 三行数值**连续不重置**（关前 68/98/96 → 开后 68/97/96，清洁度只按衰减走）✓
- **CPU 项无效**：锁屏期间 electron 全进程 `TotalProcessorTime` 10s 差 **ON 0.0ms / OFF 0.0ms**（进程 7→5）——渲染被系统挂起，数值不具区分度；CPU 判据沿用卡 17 实测的 **296.9 → 46.9 ms/10s**（未锁屏），本卡未改动画/渲染路径。

### 5. 缺陷清单（只记录不修）

- **D-1（卡 18，建议按"中"处理）随机表演抽到 `eating`/`bathing`/`petted`/`playing` 时不回落到呼吸 idle**。
  - 现象：这 4 项播满一轮（1.4–1.6s）后**画面停在该轨**，直到入口下一次状态推送（下一次随机表演 10s 或 15s tick）才换轨/回 idle；连续几轮抽到同轨会连成一片（实测 row3 连续 **24.98s**、row4 **14.99s**）。而 `trot`/`run-left`/`run-right` 会回落（2.41s / 3.21s）。
  - 复现：起 dev 宿主 → 让宠物独处 → `q18-perf-trace.mjs` 采 120s：入口状态每 10s 换一条、DOM 行却常常不经过 0（`out-q18-trace-summary.txt` 的"DOM 行切段"章节）。
  - 根因（已读码定位，非猜测）：`app/App.vue` 的 `entryStatus` 只在 `isSelfBurst(status)`（= `trot`/`run-left`/`run-right`）且 `burstLatched` 时折成 `idle`；随机表演与真实互动**共用入口的同一个 `transient` 字段**，而 4 项互动轨（eating/bathing/playing/petted）与"用户刚点的喂食/洗澡/玩耍/摸头"**状态字符串完全相同**，页面无法区分来源 ⇒ `decideAnimation` 在本地一轮播完后仍按入口的 `animStatus` 渲染该轨（`STATUS_PRIORITY.eating=9 > idle=1`），直到下一份状态到达。
  - 影响面：① 观感上"每 10 秒表演一次、1.4–1.8s 后回落"这一条**在真实窗口不成立**（约 4/7 的轮次会拖长到 10–25s）；② 连点互动时**气泡与动画会短暂不一致**（气泡 2.6s，动画已被随机表演抢走）；③ 该行为**对真实互动同样存在**（点喂食后若 15s 内没有 tick，进食姿态会一直挂着）——卡 18 只是把它变得高频可见；是否卡 ≤15 就已有，本卡不作归因。
  - 落点建议：让页面能区分"入口自发的 4 项表演"与"用户点出来的互动"（例如入口在 view 里加一个 `anim.selfBurst: true` 标记，或让随机表演用与互动不同的状态 key），随后把 `entryStatus` 的折 idle 条件从 `isSelfBurst` 扩展到"入口标记为自发的一轮"。**本卡只记录不修**。
- **观察项 O-1（非缺陷）**：鼠标停在某一枚图标上、同时键盘把焦点移到另一枚时，**两条 `.tip` 同时显示**（`Q18-03-focus-ring.png`）。
- **观察项 O-2（非缺陷）**：✕ 关闭按钮的焦点环仍是青色 `rgba(56,189,248,.85)`，与三枚图标的白色 2px 环**风格不一致**（卡 18 只改了 `.act`；若属有意保留可忽略）。
- **观察项 O-3（非缺陷）**：自发表演轨（trot / run-left / run-right）的**渲染停留高于规格**：实测 2.41s / 3.21s vs 规格 1.5s / 1.8s（含设计内的 `TRANSIENT_SLACK_MS=500ms` 兜底余量，其余为回落路径延迟）。若非刻意，可随 D-1 一并收敛。
- **观察项 O-4（环境，非缺陷）**：14:38 起机器锁屏（`LogonUI=1`）⇒ 本轮"真鼠标拖动/跟手"与 toggle 的 CPU 项不可测；14:25:56 另一代理改宿主 11 个文件触发 Vite HMR 重载 ⇒ 运行中的 overlay 被孤儿化（`扩展未注册消息处理器` + 首帧占位），并使一个采样脚本挂住。
- **上一轮遗留 O-1（卡 17）**：Tab 经 ✕→精灵时面板闪关一次（iframe `window.blur/focus` 触发 `onWindowBlur`）——本轮未复测，维持"交 check 步甄别"。

### 6. `run-left` / `run-right` 保留还是删除 —— **建议保留**（附一个前置条件）

- **理由**
  1. 动作本身没问题：20 帧实地采样显示侧面行走循环画得干净、腿部交替自然、**零位移**（该窗口 `setPosition` 0 行），没有穿模/跳帧/越界。
  2. "位移动作原地播放"在本产品里**已经是既成惯例且被用户接受**：`trot`(row7 running) 同样是行走循环原地播，卡 15 起就在，用户裁定 Q10/Q14 明确要了"原地小跑"；侧跑只是把同一件事换成**侧面朝向**。
  3. 用户裁定 Q16 的原文就把这两条列进了随机集合；删除属于**推翻用户刚下的裁定**，应由用户定夺而不是由观感单方面否决。
  4. 我实测到"别扭"的那部分**有独立成因**：D-1 把 1.8s 的一轮拖成 **3.21s**，越长越像"走半天没动"。**先修 D-1（1.8s 一轮、播完即回呼吸 idle）再复看**，我判断观感会明显改善。
- **前置条件 / 何时改判为删除**：若修完 D-1（恢复 1.8s + 立即回落）后用户仍觉得"侧面原地走"突兀，那就应删——因为届时不别扭的理由只剩"另一个版本"了。删除成本确实很小（`RANDOM_PERF_SET` 去掉两项 + `STATUS_TRACK`/`STATUS_LABEL`/`STATUS_PRIORITY` 与 `app/lib/anim.ts` 同名表各去两项 + 规格删两条 scenario），可作为 **v1.0.1** 的可逆小改。
- 一句话给用户：**"侧跑先留着，但先把『抽到吃饭/洗澡/摸头/玩耍时播完不回落到呼吸』这个 bug 修掉再看"**。

### 7. 需用户物理确认清单（图标白线 + 10 秒随机表演版，约 60–70 秒）

> 前置：dev 宿主按任务卡命令在跑、宠物可见。以下结论不能由注入输入代替。**建议先关掉 MuMu 窗口**（上轮它覆盖工作区会吃掉穿透落点）。本轮**新增**第 2、5 两条与卡 18 直接相关的观察点。

1. **0–15s 图标观感（N14 重点）**：鼠标停在宠物上 ⇒ 面板淡入，应看到**三枚没有底色的白色线条图标**（小鱼 / 泡泡 / 球）直接画在深色玻璃面板上；鼠标移到任一枚上 ⇒ **立刻**（不是等 1 秒）在图标**正上方**弹出中文名（喂食/洗澡/玩耍）；面板上不应出现系统自带的原生提示（原生 `title` 已去掉）。
2. **15–30s 十秒随机表演（本次最重要的人工判据）**：让宠物自己待着（手离开宠物与面板）60–90 秒 ⇒ 应**大约每 10 秒**出现一次"表演"（进食/洗澡/摸头/玩耍/原地小跑/向左小跑/向右小跑 之一），每次约 1.5–1.8 秒，**并且应回到平静的呼吸待机**。请特别留意：**抽到"向左/向右小跑"（侧面朝向原地迈步）时是否觉得别扭**（这是 §6 的判据）。
3. **30–45s 图标可点 + 禁用态**：点喂食/洗澡/玩耍 ⇒ 对应动画 + 气泡（呜哇！/泡泡好舒服～/玩得好开心！）；道具为 0 时对应图标变淡且点不动，但鼠标移上去**仍应弹出中文名**，Tab 也能停上去（有白色焦点环）。
4. **45–55s 面板开合手感**：悬停出面板 ⇒ 把鼠标**移到面板上**（比如"成长"那一行）⇒ 面板应保持；把鼠标**完全移开** ⇒ 面板应**立刻**开始淡出（不应有"卡一下"的延迟），并且淡出中的面板不该吃掉你的点击。
5. **55–70s 打盹期安静**：手离开宠物 **10 分钟以上**（可先去做别的事）⇒ 应出现「打盹中（Zzz）」与更慢的呼吸；**打盹期间不应再自己表演**（这是本轮修好后要人工确认的反向判据）。回来后随便点点它 ⇒ 应立刻"醒"过来并恢复表演。
6. **可选**：把一侧道具用到 0，再往屏幕其他位置点几下 —— 面板淡出期间不应误点到幽灵按钮。

### 8. 未验证项与原因

- **真鼠标"跟手/手感"**：机器 14:38 起锁屏（`LogonUI=1`），OS 输入不可用；已用"页面侧按下/抬起 + 桥级 drag"覆盖「拖动中面板不弹 / 松手恢复 / 增量累加 / 钳位 / 落盘 / 重启回位」，**只缺"跟手顺滑"这一项主观项**（卡 17 真鼠标实测 101 行 setPosition 逐像素吻合，卡 18 未改该路径）。
- **toggle 的 CPU 回落绝对值**：锁屏导致渲染挂起，ON/OFF 都是 0.0 ms/10s；沿用卡 17 的 296.9→46.9 ms/10s。
- **打盹的"帧时长 ×1.5 慢放"**：锁屏期 rAF 被挂起、无法测逐帧停留；`resolveStatus='sleep'` 与「打盹中（Zzz）」已实测，慢放本身见卡 16 的 `out-frames-sleep.json`。
- **`prefers-reduced-motion` 关闭淡出时的"淡出期不吃指针"**：本机被系统 reduced-motion 关掉了过渡，窗口期不可观测（代码已读码确认）。
- **多显示器 / 非主显示器锚定 / dpi≠1**：本机单屏 dpr=1。
- **`run-left/right` 的人工观感**：只能给本代理的帧级判断（§6），最终"别扭与否"须用户物理确认（§7 第 2 条）。
- **D-1 是否卡 ≤15 就存在**：本卡只做卡 18 后的现状复验，不对历史归因。

### 9. 收尾确认

- **dev 实例已全部关闭**：14:46 核实 `Get-Process electron` = **0**、9333/5173 **无 LISTEN**（只剩 TIME_WAIT）；node 只剩 22:02 起的 DSH web 服务与其子进程（**未杀**）。
- **零提交、无越界写入**：本代理**未执行任何 `git add/commit/push`**。仓库内被本代理写的文件只有两份同源的证据副本（`openspec/changes/archive/2026-10-16-pet-desktop-companion/notes/evidence/real-window-v2.md` 与 `docs/spec/UID-20261014232746-桌面宠物属性/notes/evidence/real-window-v2.md`，二者提交 v1.0.0 时字节一致、互为副本）；**未改任何实现代码/规格/任务卡**。写入前扩展仓 `git status` clean（HEAD `95ecc57`），写入后应只见这两个 modified；宿主仓（HEAD `f41d561`）本轮**未被本代理改动**。
- 存档处置：`state.json` 留在 session C 结束态（`position:(640,332)`、`fish:1`、`bubble:2`、三属性约 53/95/94）；本轮备份 `%TEMP%\pet-e2e2\state-backup\state.json.q18pre`（本轮开始前）。
- 截图清单（`%TEMP%\pet-e2e2\`，本轮新增 35 张）：`Q18-00-screencheck.png`、`Q18-01-panel-whiteicons.png`、`Q18-02-tip-feed.png`、`Q18-02-tip-bathe.png`、`Q18-02-tip-play.png`、`Q18-03-focus-ring.png`、`Q18-04-idle-contrast.png`、`Q18-05-play-ok.png`、`Q18-05-bathe-ok.png`、`Q18-06-pet-ok.png`、`Q18-07-pet-cooling.png`、`Q18-08-drag-40.png`（锁屏挡拖动的留证）、`Q18-09-screenstate.png`（锁屏期取色）、`Q18-10-settings.png`、`Q18-run-left-f01..f10.png`、`Q18-run-right-f01..f10.png`；日志 `dev4.log`/`dev5.log`/`dev6.log`(+`.err`)、原始断言 `out-q18-*.txt`、逐轮数据 `q18-trace.jsonl`/`q18-trace-rounds.json`/`q18-watch-a.jsonl`/`q18-sleep-test.json`、新脚本 `scripts/q18-*.mjs`（旧文件均未删）。

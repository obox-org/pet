# 卡 11 · verify-real-window 实机联调证据

> 本文件只记录证据与缺陷，**不含任何修复**。宿主 = 工作区未提交 overlay 能力（卡 02/03/04），扩展 = `<EXT>`（`--debug-extension` 调试态加载，未安装 .oix）。
> 截图与脚本均在 `%TEMP%\pet-e2e\`（不进仓库）；下文截图名均相对该目录。

## 0. 环境

| 项 | 值 |
| --- | --- |
| 宿主启动方式 | `npm run dev -- -- --remote-debugging-port=9333 --debug-extension pet@C:\Users\chenzhi\Documents\workspace\web\obox\extensions\pet`（后台、日志重定向 `%TEMP%\pet-e2e\dev.log`） |
| 参数进入 electron 的证据 | dev.log 首行：`[debug] 调试扩展 1 个: pet@C:\Users\chenzhi\Documents\workspace\web\obox\extensions\pet` |
| 启动前清理 | 已安装的 obox 1.0.15 在跑（5 个进程，apiVersion 1 老宿主且抢单实例锁）⇒ 先 `Stop-Process -Name obox` 全部关闭 |
| 显示器 | 单屏 2560×1440，workArea = (0,0,2560,1392)（任务栏 48px），dpr=1 |
| 主窗口位置 | (722,336) 1116×728 —— 与 overlay 采样区 (2316,908)-(2536,1368) 不重叠 |
| DevTools | **全程未开**；控制台经 CDP `Runtime.consoleAPICalled` / `Log.entryAdded` 订阅（t13-diag.mjs），无未捕获异常 |
| CDP targets | 主窗口 `http://localhost:5173/`；overlay page `http://localhost:5173/?obox-window=overlay&…`；overlay 内 iframe（OOPIF）`app://debug/pet/dist/index.html`（宠物页真实运行处） |
| 查询串五参数实读 | `obox-window=overlay` `extId=pet` `overlayId=pet.overlay` `appId=pet.overlay` `url=app%3A%2F%2Fdebug%2Fpet%2Fdist%2Findex.html`（/json 逐字） |
| 取色/截图工具 | PowerShell `CopyFromScreen`（pixel.ps1 / shot.ps1 / zoom.ps1，NearestNeighbor 放大）；命中测试 `WindowFromPoint`+`GetClassName`+`GetAncestor(GA_ROOT)`（hit.ps1）；合成鼠标 `SetCursorPos`+`mouse_event`（click.ps1） |
| CPU 口径 | `Get-Process electron`（Path 过滤 `*web\obox\node_modules\electron*`）全部进程 `TotalProcessorTime.TotalMilliseconds` 求和，10s 差值（同卡 01） |

## 1. 八项逐项

### ① 自动出现于右下角 —— 通过

- 方法：CDP `/json` 确认 overlay target 存在；overlay 页渲染进程读 `screenX/screenY/outerWidth/outerHeight` 与 `screen.avail*`（t1-bounds.mjs）；与公式核对；整屏截图。
- 原始数据：
  - `screen.avail = (0,0,2560,1392)`；窗体 `screenX=2316, screenY=908, outer=220×460`
  - 公式：`x = 0+2560-220-24 = 2316`、`y = 0+1392-460-24 = 908` ⇒ `matchX/matchY/matchW/matchH = true/true/true/true`
  - dev.log：`[overlay] 已创建: pet/pet.overlay 220x460 anchor=bottom-right margin=24 transparent=true alwaysOnTop=true skipTaskbar=true @(2316,908) 默认鼠标穿透=true`
- 结论：位置与尺寸逐像素符合公式；创建即默认穿透。
- 截图：`01-fullscreen.png`（整屏）、`02-overlay-region.png`（窗体区，可见壁纸透出 + 精灵）。

### ② 空白区完全透出桌面 —— 通过（差值 0/255）

- 方法：窗体内"精灵与面板之外"两点 (2426,1008)、(2336,928)（窗体本地 (110,100)/(20,20)，位于 `.upper` 预留区，DOM 实测该处无面板/气泡）；**有窗**取色 → 经设置页 toggle 销毁窗体后**无窗**同点取色对照；再取精灵上两点确认非透明。本项在本扩展真实页面上做。
- 原始数据：
  - 有窗：(2426,1008)=`#E8FDB2`、(2336,928)=`#ADD999`
  - 无窗：(2426,1008)=`#E8FDB2`、(2336,928)=`#ADD999` ⇒ **差值 0 ≤ 2/255**，且均非 `#1e1e1e`/`#ffffff`（为壁纸绿）
  - 精灵点：(2426,1264)=`#3F7CC8`、(2400,1300)=`#A8B0C1`（非透明、非壁纸色）
- 结论：空白区与无窗桌面逐字节一致；精灵正常绘制。
- 截图：`02-overlay-region.png`、`06-overlay-gone.png`（无窗对照区）。

### ③ 穿透与命中 —— 通过（自动化部分）；真实鼠标体验见第 4 节清单

- 方法：hit.ps1 `WindowFromPoint`；穿透态在窗内空白点合成右键（click.ps1）⇒ 截图桌面菜单 + 读 overlay 页注入的 pointerdown 计数（`__e2e.pd`）；非穿透态经 CDP `Input.dispatchMouseEvent`（发到 iframe target，绕过 OS 转发不确定性）移动"指针"到精灵/面板外再复核。
- 原始数据：
  - 穿透态空白点 (2426,1008)/(2336,928) ⇒ `hwnd=65966 class=SysListView32 root=Progman`（桌面）
  - 合成右键后：桌面右键菜单弹出（查看/排序方式/刷新/新建…），`__e2e.pd = 0`（overlay 页 POINTERDOWN=0）
  - CDP 悬停精灵 (110,356) ⇒ 面板展开（`.panel` 存在，截图 `04-hover-panel.png`）；(2426,1264) ⇒ `class=Chrome_RenderWidgetHostHWND root=Chrome_WidgetWin_1`（本窗，非穿透）
  - CDP 移到 (110,10)（面板矩形外）⇒ `.panel` 消失；(2426,1008) 复核 ⇒ `SysListView32/Progman`（穿透恢复）
  - dev.log 配套：`[overlay] 鼠标穿透=false: pet/pet.overlay`、`[overlay] 鼠标穿透=true: pet/pet.overlay`
- 结论：穿透↔命中切换链路（页面命中上报 → `pet.hit` → `setMouseThrough` → OS 命中测试）闭环成立。
- 口径声明：悬停/面板的**视觉体验**用 CDP 注入事件驱动（卡 01 已证注入光标移动对 forward:true 间歇不转发，故不用 OS 级移动冒充）；真实鼠标结论留给用户物理确认（第 4 节）。
- 截图：`03-desktop-ctxmenu.png`（桌面菜单 + 右下角宠物同框）、`04-hover-panel.png`。

### ④ toggle 销毁/重建 + CPU —— 通过

- 方法：CDP 在主窗口 设置→扩展→宠物 页点 `显示宠物` 的 checkbox；`/json` 看 target；cpu.ps1 测关前/关后各 10s electron 进程 CPU 增量；再切开读三行数值看连续性。
- 原始数据：
  - 关：`/json` 仅剩主窗口（overlay page + iframe 消失）；electron 进程数 7→5；dev.log `[overlay] 已销毁: pet/pet.overlay`
  - CPU：关前 **296.9 ms/10s**（7 进程）→ 关后 **0.0 ms/10s**（5 进程）；显著回落（卡 01 基线 218.8→0.0 同口径）
  - 开：target 回归（overlay page + iframe）；dev.log 再一条 `[overlay] 已创建 … @(2316,908)`
  - 属性连续性：关前 `84/97/97` → 关后 `84/97/97`（第二循环 `85/97/97→84/97/97` 仅随 15s tick 衰减变化），**未重置为 100**
- 结论：关=真销毁（渲染进程退出、CPU 归零），开=重建且状态连续。
- 截图：`06-overlay-gone.png`（关窗期间窗体区=纯桌面）。

### ⑤ webp 边缘 —— 通过（无白边/黑边 halo）

- 方法：窗体精灵区 4× NearestNeighbor 放大目检（zoom.ps1）+ 跨边扫描线取色 + **源图仲裁**：overlay 页 canvas `getImageData` 读 `spritesheet.webp` 轮廓边缘 RGBA。
- 原始数据：
  - 屏幕扫描线 y=1200（发丝左缘）：`#DEF7A4`(壁纸) → `#9B8198`(1px) → `#89B6DD`(发色)
  - 源图同位置：x=72 `(133,94,160,a=217)`、头顶芽 x=87 `(229,199,249,a=200)` ⇒ 屏幕上那 1px 淡紫描边是**源 artwork 自带线稿**（高 alpha 紫色），不是合成 halo
  - 源图白色残边仅 `a≤3`（x=70 `(255,255,255,a=1)`、x=84 `(255,255,255,a=2)`）⇒ 屏幕贡献 ≤3/255，目视不可见
- 结论：无白边/黑边/锯齿 halo；不需要改 PNG 或内缩 1px。若日后要更严的 matte，可选清理源图 alpha≤3 的白像素（当前无必要）。
- 截图：`05-sprite-4x.png`（全身 4×）、`05b-sprite-head-4x.png`（头部 4×）。

### ⑥ 设置页三行进度条 —— 通过

- 方法：CDP 读 设置→扩展→宠物 页 `.settings-content .config-row` DOM；触发互动后经消息桥改属性，**不重进页面**再读；向下取整用 overlay 页 `pet.subscribe` 回包真值对照。
- 原始数据（首次读）：
  - `显示宠物`：`input[type=checkbox] checked=true`（toggle 存在）
  - `饥饿度/清洁度/心情`：三行均有 `[role=progressbar]`，`aria-valuemax=100`、`aria-valuenow=89/98/98`，右侧 `.config-value` 文本 `89/100`、`98/100`、`98/100`（形如 NN/100）
  - **无任何 description 文本节点**（五行 `desc=null`）
  - `诊断` 行 status 文本 `（无）` ⇒ 诊断位常态为空 ✓
- 向下取整实证：同刻 overlay subscribe 回包真值 `hunger=89.9993833…`、`mood=98.1666…` ⇒ 页面显示 `89/100`、`98/100`：**整数且 ≤ 真值**（即 cur=99.9 型口径，无需伪造存储）
- 当帧刷新：互动前 `83/97/97` → 经桥 feed×3+bathe+play+pet 后**同一页面实例**再读 `98/100/100/100`（未重进设置页）
- 结论：三行 progress 渲染口径（floor 文本 + 未取整条宽）、无 description、toggle、当帧刷新全部符合 spec。
- 截图：`03-desktop-ctxmenu.png` 中可见设置页三行（88/98/98 时刻）。

### ⑦ 五种交互与气泡/动画 —— 通过（桥级口径，见下注）

- 方法：overlay iframe 页执行 `parent.postMessage({source:'obox-app',action:'obox-extension',appId:'pet.overlay',channel:'pet.interact',payload:{kind},requestId},'*')` 并监听 `obox-extension-reply`（t10-interact.mjs）；每种 kind 记录回包、精灵 `background-position` 行号（row = -bgY/208）、`.bubble` DOM 文本与消失时刻；气泡另配截图序列。
- 原始数据（回包外层为宿主信封 `{ok,data|error}`，内层为入口业务体）：
  - feed×3：`{ok:true,data:{ok:true,…,feedback:{kind:'feed',text:'吃饱啦（饥饿度 +5）',tone:'good'}}}`；库存 fish 3→2→1→0；精灵 row **4**（bgY=-832px，eating）
  - feed#4（fish=0）：`{ok:true,data:{ok:false,error:'没有小鱼干了（挂机 20 分钟可得 1 条）'}}` ⇒ **文案逐字命中**
  - bathe：`feedback.text='洗干净啦（清洁度 +15）'`；row **3**（-624px，bathing）；bubble 库存 3→2
  - play：`feedback.text='好开心（心情 +5）'`；row **7**（-1456px，playing）
  - pet：`feedback.text='心情 +1'`；row **3**（-624px，petted）
  - 气泡：`.bubble` 文本与 feedback 一致；回复后 ~3.07s 探测到消失（2600ms + 300ms 轮询粒度）；截图序列 `07-bubble-on.png`（粉色气泡「好开心（心情 +5）」+ playing 姿态）→ `08-bubble-off.png`（气泡已消失）
  - 顺带实证挂机经济：两次测试间隔内 settle 跨过 AFK 周期，fish 0→1、bubble 2→3（settle.js ④ 步），与"挂机 20 分钟各得 1"一致
- **口径注（重要，非缺陷）**：本项按任务指定用**自携 requestId 的宿主级消息桥**验证，页面侧 `interact()` 不在回路内——ok 类的气泡/换轨实际经 `pet.subscribe` 推送（`applyState`）到达页面；道具不足时入口不改状态、不唤醒订阅，故桥级视角**本就不该**出现页面气泡。页面侧 `!ok` 坏气泡分支（App.vue:330）只可能被真实 UI 点击触发，而面板在道具不足时禁用喂食/洗澡按钮（PetPanel.vue:75,78），该分支实为竞态防御分支 ⇒ 列入"未验证项"，不计缺陷。
- 结论：四 kind + 不足拒绝的回包、动画行号、气泡文案与 2.6s 消失全部符合 spec/design。
- 截图：`07-bubble-on.png`、`08-bubble-off.png`、`04-hover-panel.png`（面板三按钮）。

### ⑧ 停用即回收 —— 调试态无 UI 入口，如实记录 + 替代路径验证

- 事实：扩展管理器详情页对 `source==='debug'` 的扩展**不渲染停用/启用/卸载按钮**（`src/renderer/src/extensions/ext-manager/ExtensionManagerView.vue:361` 的 `v-if="selected.source !== 'debug'"`）。实测详情页仅有「← 返回列表」，状态行「Source 调试中 / 状态 运行中」。故"经管理器停用 pet"在调试态**不可触发**（比 guides-user.md:180 的"已激活扩展停用标需重启"更前置：连入口都没有）。
- 替代路径（扩展缺席对照）：
  1. 关 dev，**不带** `--debug-extension` 重启（dev2.log）：`[debug] 未提供 --debug-extension（仅加载内置/已安装扩展）`；`/json` 仅主窗口；dev2.log 无任何 `[overlay]` 行；状态栏无「宠物」项；设置树「扩展」下无「宠物」子节点 ⇒ 窗体/状态栏项/设置页随扩展缺席全部回收
  2. 再**带** `--debug-extension` 重启（dev3.log）：`[overlay] 已创建 … @(2316,908)`，overlay target 回归 ⇒ 激活↔窗体绑定成立（"再启用⇒恢复"等价证据）
- 回收链间接证据：overlay 销毁→target 消失→渲染进程退出→CPU 0.0ms/10s 已在 ④ 实测（与 cleanup 的 `api.overlay.destroy` 同一路径）；cleanup 其余三项（`timer.clearInterval`、`hub.drain`、`offMessage/offSettings.dispose`，index.js:386-397）为代码级核对。
- "pet-tick 不再产生结算日志"口径：`onTick` 设计即静默（仅 warnings 才打日志），**不存在**逐 tick 结算日志；可观测代理 = subscribe 的 rev 递增（overlay 关闭期间 settle 以 `overlayExists=false` 继续，rev 仍递增，符合"关窗暂停挂机但不暂停衰减"的 spec）。
- 结论：调试态停用路径不可达（UI 设计使然，记入缺陷清单 D-2 作"验证缺口/产品决策待确认"）；回收语义经缺席对照 + ④ 销毁链覆盖。

## 2. 附加记录

- **dev.log `[overlay]` 全量**（主会话，按序）：
  1. `已创建: pet/pet.overlay 220x460 anchor=bottom-right margin=24 transparent=true alwaysOnTop=true skipTaskbar=true @(2316,908) 默认鼠标穿透=true`
  2. `鼠标穿透=false: pet/pet.overlay`（悬停精灵）
  3. `鼠标穿透=true: pet/pet.overlay`（移出）
  4. `已销毁: pet/pet.overlay`（toggle 关 #1）
  5. `已创建 …@(2316,908)…`（toggle 开 #1）
  6. `已销毁: pet/pet.overlay`（toggle 关 #2）
  7. `已创建 …@(2316,908)…`（toggle 开 #2）
  - **未出现**"越权拒绝""拒绝非法 url"两类日志（正常路径本不该有）✓
- **长轮询健康度**：专用 30s 观察窗（t0=1792092007118，窗内无其它桥流量）：subscribe 往返 **2 次**（+14.05s、+29.05s，间隔=15s tick 节拍），rev **39→40** 单调递增；全会话回包日志见 `%TEMP%\pet-e2e\poll-final.json`（interact 回包与 subscribe 推送交替，rev 67→69… 连续）；控制台无"订阅失败…重试"warn。
- **状态栏/诊断位**：状态栏右组 `["应用(左)","扩展已就绪","宠物","Obox v1.0.15","Obox"]` ⇒ `pet.status` 常态文本「宠物」✓；设置页诊断行常态 `（无）` ✓（写盘失败场景不现实，仅验常态空）。

## 3. 缺陷清单

**实现级缺陷：0 项。** 以下为观察项（只记录，不修）：

- **D-1（口径/防御分支，非违反 spec）**：页面侧"道具不足坏气泡"分支（App.vue:330 `showBubble(error,…,'bad')`）在真实 UI 下几乎不可达——面板在 `fish<1`/`bubble<1` 时禁用对应按钮（PetPanel.vue:75,78），桥级调用又不经过页面 `interact()`。建议 dev 步决策：保留作竞态防御（现状，无害）或在 design 中注明其防御定位。复现：桥级发 `pet.interact{kind:'feed'}` 于 fish=0 ⇒ 回包 `{ok:false,error:'没有小鱼干了（挂机 20 分钟可得 1 条）'}` 但页面无气泡（本就不该有，见 ⑦ 口径注）。
- **D-2（验证缺口/产品决策待确认）**：调试态扩展在管理器无停用入口（ExtensionManagerView.vue:361），导致卡 11 ⑧ 的"停用即回收"无法在调试态实机触发；installed 态（.oix）停用又属"标需重启"路径。建议后续卡用 installed 态补一次 ⑧，或明确"调试扩展生命周期只由 CLI 控制"为产品决策并写入 guides-user.md。疑似落点：`src/renderer/src/extensions/ext-manager/ExtensionManagerView.vue:361`。

## 4. 需用户物理确认清单（真实鼠标，约 30 秒）

> 前置：dev 宿主已按本卡命令启动、右下角可见宠物。以下结论**不能**由注入输入代替。

1. **0-5s 悬停出面板**：把真鼠标移到宠物身上停住 ⇒ 面板 120ms 淡入（等级/库存/三属性/三按钮/✕）；移开 1s ⇒ 面板淡出、该处点击重新穿透桌面。
2. **5-12s 面板三按钮**：悬停状态下依次点「喂食」「洗澡」「玩耍」⇒ 各播对应动画 + 气泡（吃饱啦/洗干净啦/好开心），气泡约 2.6s 自灭；把鱼干喂到 0 后「喂食」应灰掉点不动。
3. **12-18s 摸头**：直接点宠物本体 ⇒ 挥手动画 + 「心情 +1」；1 分钟内再点 ⇒ 动画仍播但气泡为「再摸也不会更开心啦（还需 N 分钟）」。
4. **18-24s 穿透手感**：在宠物上方空白处按住左键拖桌面图标 / 右键 ⇒ 应直接操作到桌面（窗体不吃指针）；Esc 或 ✕ 关面板后焦点回宠物。
5. **24-30s toggle**：设置→扩展→宠物 关「显示宠物」⇒ 窗体立即消失；再开 ⇒ 回原位且三行数值不重置。

## 5. 未验证项

- 真实鼠标的悬停/点击/穿透手感（见第 4 节清单，注入输入不冒充）。
- 页面侧 `!ok` 坏气泡渲染（防御分支，UI 不可达，见 D-1）。
- installed 态（.oix）的"停用即回收/标需重启"全路径（本卡不装 .oix，见 D-2）；调试态以"扩展缺席对照 + ④ 销毁链"替代。
- 写盘失败诊断位（`宠物状态未能保存`）：无法在不改代码/不动磁盘权限的前提下制造，仅验常态空。
- 多显示器/非主显示器锚定、dpi≠1 缩放（本机单屏 dpr=1）。
- 存档损坏/版本不受支持的备份重建路径（属卡 10 单测覆盖范围，本卡不重复）。

## 6. 收尾确认

- 验收结束已关闭全部自启 dev 实例（npm 52980/52236/41388 及其 electron 子进程）；`Get-Process obox,electron` 为空、5173/9333 端口无监听。
- 本卡未改任何实现代码；仓库内唯一新增文件即本证据文件；截图与脚本均在 `%TEMP%\pet-e2e\`。

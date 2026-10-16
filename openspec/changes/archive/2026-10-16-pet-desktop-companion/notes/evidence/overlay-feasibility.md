# overlay-feasibility 实机证据（卡 01 · overlay-feasibility-probe）

> 本文件是卡 01 的实机验证证据。测量脚本、截图、日志全部在 `%TEMP%\pet-probe\`
> （`C:\Users\chenzhi\AppData\Local\Temp\pet-probe\`），**不进仓库**；除本文件外未改动任何仓库文件。
> 测量时段：2026-10-16 00:01:12 – 00:15:30（+08:00）／ UTC 2026-10-15T16:01–16:15Z。
> 执行方式：原生 Electron 44.6.0 最小脚本（`main.js` + `page.html`）+ PowerShell 驱动（`driver1/2/2b/2c/3.ps1`），
> 全程**未打开 DevTools**（`main.js` 对 `devtools-opened` 有防御性守卫并会写日志；`events.log` 中无该行）。

## 0. 环境

| 项 | 值 |
| --- | --- |
| OS（注册表） | `ProductName=Windows 10 Pro`（该字段未随大版本更新），`DisplayVersion=25H2`，`CurrentBuild=26200.9457`（Windows 11 25H2 内核线） |
| Electron | 44.6.0（chrome 152.0.7977.130、node 24.21.0、x64），`<ROOT>\node_modules\electron\dist\electron.exe` |
| 主显示器（electron `screen.getPrimaryDisplay()`） | `bounds={0,0,2560,1440}`，`workArea={0,0,2560,1392}`，`scaleFactor=1`，`displayCount=1` |
| 任务栏区域 | 底部，物理 y=1392..1440（高 48px） |
| 逻辑核心数 | 16 |
| 探测窗体实际 bounds | `{x:2316, y:908, width:220, height:460}`，与公式 `workArea - 尺寸 - 24` 预测**完全一致** |
| 取样点（物理像素） | A=(2336,928) 面板区左上；B=(2426,1028) 面板区中央；C=(2426,1264) 品红色块中心；D=(2322,1358) 窗内左下裸露桌面条 |
| 页面内容 | 192×208 品红矩形（left:14, top:252，贴底居中，模拟精灵）+ 持续 `requestAnimationFrame` 循环；其余区域全透明 |
| 环境干扰声明 | 本机装有 ToDesk（含虚拟显示设备）与 MuMu 虚拟显示适配器、动态壁纸类桌面叠层；测量期间有**真实人工操作**（见 §6）。注入式输入链路存在间歇性不稳定（见 §2 与 §6） |

窗体创建参数（`events.log` 的 `OPTIONS` 行，逐字）：
`{"width":220,"height":460,"x":2316,"y":908,"frame":false,"transparent":true,"backgroundColor":"#00000000","alwaysOnTop":true,"skipTaskbar":true,"hasShadow":false,"thickFrame":false,"roundedCorners":false,"resizable":false,"maximizable":false,"acceptFirstMouse":true,"show":false,...}` + `ready-to-show` 后 `show()`。

## 1. ① 透明像素判据 —— **通过**

**测量方法**：PowerShell `System.Drawing.Graphics.CopyFromScreen` 单像素取色（进程先 `SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)`，`GetSystemMetrics` 校核 2560×1440）；窗体创建前对 A/B/C 取基线（A 点间隔 1.5s 复取确认壁纸稳定），`ready-to-show` 显示后等 3s 再取同三点；另截整窗区域图目检四角与色块外区域。

**原始数值**（`driver1-out.txt`）：

```
[baseline-stability] A t0=#fdf5f4 A t+1.5s=#fdf5f4 stable=True
[baseline] A=#fdf5f4(R253,G245,B244) B=#ffffff(R255,G255,B255) C=#ffffff(R255,G255,B255)
[baseline-check] sample points NOT #1e1e1e/#ffffff: A=True B=False
[after-show] A=#fdf5f4 maxdiff=0 | B=#ffffff maxdiff=0 | C=#ff00ff maxdiff(vs baseline)=255
[verdict-transparent] A diff<=2/255: True ; B diff<=2/255: True
[verdict-sprite] C~=#ff00ff (sprite rendered, coords aligned): True
```

- 判据点 **A**：基线 `#fdf5f4`（≠`#1e1e1e`、≠`#ffffff`），显示窗体后同点 `#fdf5f4`，**maxdiff=0 ≤ 2/255** ⇒ 该点完全透出窗后内容。
- 辅助点 B：窗后内容本身为纯白（动态壁纸/桌面叠层的白色区域），diff 同样为 0；因等于 `#ffffff` 按判据不作主判据点，仅作辅证。
- C 点由壁纸色变为精确 `#ff00ff` ⇒ 色块渲染成功且物理坐标对齐（同时反证取色坐标换算正确）。
- 目检：`shown-window.png` 中窗体上部为壁纸渐变色（粉→白）、四角无白底/黑底矩形；`shown-windowregion.png` 与 `baseline-windowregion.png` 同区域背景一致、仅多出品红色块。

**截图（绝对路径）**：
- `C:\Users\chenzhi\AppData\Local\Temp\pet-probe\baseline-fullscreen.png`（无窗体全屏基线）
- `C:\Users\chenzhi\AppData\Local\Temp\pet-probe\baseline-windowregion.png`（窗位区域基线）
- `C:\Users\chenzhi\AppData\Local\Temp\pet-probe\shown-window.png`（显示后整窗 220×460）
- `C:\Users\chenzhi\AppData\Local\Temp\pet-probe\shown-windowregion.png`（显示后窗位+40px 边圈）
- `C:\Users\chenzhi\AppData\Local\Temp\pet-probe\shown-fullscreen.png`

**结论：通过**（A 点 diff=0 且非 `#1e1e1e`/`#ffffff`；反向对照见 §5 证明判据有区分力）。

## 2. ② 穿透与命中转发 —— **通过（附间歇性不稳定声明）**

**测量方法**：`win.setIgnoreMouseEvents(true,{forward:true})` 后由驱动脚本移动光标扫掠窗体，页面 `pointermove`/`mousemove` 计数经 console→主进程 IPC 写入 `events.log`；另加浏览器级 `webContents.on('input-event')` 的 mousemove 计数（`im`）区分"Chromium 收到"与"页面收到"。穿透落点用**合成右键 + 截图目检桌面菜单**与 **`WindowFromPoint` 命中测试**（Electron 源码注明 click-through 窗体对 `WindowFromPoint` 不可见，故其返回值即点击的真实接收者）双重判定。

**原始数值**：

forward（`driver2b-out.txt` 矩阵；`im`=浏览器级 mousemove，`pm`=页面 pointermove）：

```
[matrix a-unfocused-fast] imDelta(browser input mousemove)=11 pmDelta(page pointermove)=9  (im 0->11, pm 0->9)
[matrix b-focused-fast] imDelta(browser input mousemove)=89 pmDelta(page pointermove)=39  (im 16->105, pm 9->48)
[matrix c-focused-slow] imDelta=0 pmDelta=0
[matrix d-focused-jumpC] imDelta=0 pmDelta=0
[matrix e-focused-jumpA] imDelta=0 pmDelta=0
```

- 判据"pointermove 计数 > 0"：**满足**（a 组 pm+9、b 组 pm+39；页面 `PM_TICK`/`MM_TICK` 行见 `events.log` L316-317、L328-329）。
- 真实人工移动辅证：driver1 实例在 IGNORE_ON 期间（16:07:11Z）真实鼠标划过窗体，页面收到 `PM_TICK n=101`（`events.log` L214-216）⇒ forward 对真实鼠标正常。
- **间歇性不稳定（如实记录）**：c/d/e 三组注入式移动 im 与 pm 增量均为 0（钩子层就没收到），a/b 两组正常；根因未查明，怀疑与本机 ToDesk/虚拟显示输入栈对注入事件的间歇性干扰有关（见 §6）。

穿透落点（`driver2c-out.txt` / `driver2-out.txt`）：

```
[cursor] after SetCursorPos D=(2322,1358) readback=(2322,1358) match=True
[wfp IGNORE_ON] D: hwnd=65966 class=SysListView32 title=FolderView      <- 桌面
[wfp IGNORE_ON] A: hwnd=65966 class=SysListView32 title=FolderView
[wfp IGNORE_ON] C: hwnd=65966 class=SysListView32 title=FolderView
[wfp IGNORE_OFF] D: hwnd=394548 class=Chrome_RenderWidgetHostHWND title=Chrome Legacy Window   <- 本窗渲染子窗
[wfp IGNORE_OFF] C: hwnd=394548 class=Chrome_RenderWidgetHostHWND title=Chrome Legacy Window
[verdict-passthrough3] overlay-received count=0 (expect 0)
```

- 右键穿透正向证据：IGNORE_ON 下在窗内空白点 D 合成右键（光标读回断言通过），**Win11 桌面右键菜单弹出**（截图 `rightclick3-region.png` 可见"新建/显示设置/个性化/在终端中打开/显示更多选项"），且 overlay 页面 `POINTERDOWN/CONTEXTMENU` 计数=0 ⇒ 点击穿过 overlay 落到桌面。
- 命中测试级证据：IGNORE_ON 时窗内三点 `WindowFromPoint` = 桌面 `SysListView32/FolderView`；IGNORE_OFF 时 = 本窗 `Chrome_RenderWidgetHostHWND` ⇒ 穿透开关双向生效。
- 非穿透可点击：IGNORE_OFF 下左键色块中心 → `EVT POINTERDOWN n=3 ... target=sprite` + `EVT CLICK n=3 ... target=sprite`；左键空白点 → `CLICK n=4 target=body`（整窗捕获，即 design D-2 记录的已知取舍）。
- **前两次右键尝试未捕到菜单（如实记录）**：driver2 在 A 点、driver2b 在 D 点的右键截图（`rightclick-region.png`、`rightclick2-region.png`）均无菜单，overlay 页面计数亦为 0；未查明原因（与 c/d/e 同源怀疑注入链路间歇性问题），第三次加光标读回断言后成功。不编造解释。

**截图（绝对路径）**：
- `C:\Users\chenzhi\AppData\Local\Temp\pet-probe\rightclick3-region.png`（桌面右键菜单弹出，正向证据）
- `C:\Users\chenzhi\AppData\Local\Temp\pet-probe\rightclick3-fullscreen.png`
- `C:\Users\chenzhi\AppData\Local\Temp\pet-probe\rightclick-region.png`、`rightclick2-region.png`（前两次未捕到菜单的负记录）
- `C:\Users\chenzhi\AppData\Local\Temp\pet-probe\after-escape-fullscreen.png`、`after-escape2-fullscreen.png`（Esc 关菜单后）

**结论：通过**（forward 计数 >0 成立；穿透落桌面有菜单截图 + 命中测试双证据；附注入输入间歇性不稳定声明）。

## 3. ③ alwaysOnTop / skipTaskbar —— **通过（skipTaskbar 为截图证据）**

**测量方法 / 原始数值**：

- `alwaysOnTop`：API 断言 `win.isAlwaysOnTop()=True`（`state.json` 与 `events.log` 的 `SHOWN ... alwaysOnTop=true`，三次实例均如此）。视觉断言：同 app 创建一个**普通**窗体 decoy（400×500、白底、不置顶、不 skipTaskbar，bounds `{2136,888,400,500}` 完全盖住 pet 区域），截图 `decoy-windowregion.png` 中品红色块**浮在白色 decoy 之上** ⇒ 压在普通窗口之上。
- `skipTaskbar`：无 API 可读回，采用任务栏截图序列目检图标条目数（Win11 任务栏 y=1392..1440）：
  - `taskbar-baseline.png`（无 electron）：11 个条目图标
  - `taskbar-with-pet.png`（仅 pet 窗）：11 个（**无新增**）
  - `taskbar-with-decoy.png`（pet + 同 app 普通窗）：12 个（新增 1 个 Electron 图标 = decoy）
  - `taskbar-after-decoy-closed.png`：11 个
  ⇒ pet 窗不产生任务栏条目，而同 app 普通窗会 ⇒ skipTaskbar 生效。**此项为人工/截图证据，特此写明。**

**截图（绝对路径）**：
- `C:\Users\chenzhi\AppData\Local\Temp\pet-probe\decoy-windowregion.png`（置顶视觉证据）
- `C:\Users\chenzhi\AppData\Local\Temp\pet-probe\decoy-fullscreen.png`
- `C:\Users\chenzhi\AppData\Local\Temp\pet-probe\taskbar-baseline.png` / `taskbar-with-pet.png` / `taskbar-with-decoy.png` / `taskbar-after-decoy-closed.png`

**结论：通过**。

## 4. ④ 销毁窗体前后 CPU —— **通过**

**测量方法**：`Get-Process electron.exe`（按 `ExecutablePath` 过滤本探测实例）全部进程 `TotalProcessorTime` 差值求和，窗口 10s（Stopwatch 实测 10023ms / 10018ms）；并按 `Win32_Process.CommandLine` 的 `--type=` 拆分 main/gpu-process/utility/renderer 逐进程增量。Phase A = 窗体存活 + rAF 循环运行；`win.destroy()` 后等 2s 测 Phase B（主进程经 no-op `window-all-closed` 保活，口径一致）。

**原始数值**（`driver3-out.txt`）：

```
[cpuA] procs=4 elapsed=10023ms sumCpu=218.8ms => 0.136% of 16 logical cores; 2.18% single-core-equivalent
[cpuA] per-process: main +0.0ms | gpu-process +93.7ms | utility +0.0ms | renderer +140.6ms
[cpuA] rAF FPS = 60 (frames=480 / 8s)
[cpuB] procs=3 elapsed=10018ms sumCpu=0.0ms => 0.000% of 16 logical cores; 0.00% single-core-equivalent
[cpuB] per-process: main +0.0ms | gpu-process +0.0ms | utility +0.0ms（renderer 已随窗销毁消失）
[cpu-delta] A-B = 218.8 ms per 10s window; A/B ratio = B=0 (infinite)
```

**结论：通过**。rAF 窗体的 CPU 成本 ≈ 218.8ms/10s（单核当量 2.18%，其中 renderer 140.6ms + GPU 合成 93.7ms）；`destroy()` 后同口径 10s 为 **0.0ms** ⇒ "关窗省 CPU" 判据成立，且成本完全归因于窗体渲染/合成（toggle 应真 destroy 而非 hide，与 spec 一致）。

## 5. 反向对照（transparent:false）

| 运行 | 参数差异 | A 点取色 | vs 壁纸基线 `#fdf5f4` | 判定 |
| --- | --- | --- | --- | --- |
| 对照 1 | `transparent:false`，其余同参（`backgroundColor:'#00000000'`） | `#f3f3f3` (R243,G243,B243) | maxdiff=10（B 点 `#f3f3f3`，maxdiff=12） | 不透明 ⇒ 判据有区分力 |
| 对照 2 | `transparent:false` + `backgroundColor:'#1e1e1e'`（任务卡负向自检） | `#1e1e1e` (R30,G30,B30) 精确命中 | maxdiff=223 | 与卡上期望一致 |

两对照下 C 点仍为 `#ff00ff`（色块照常渲染，排除"页面没画"的混淆）。
截图：`C:\Users\chenzhi\AppData\Local\Temp\pet-probe\opaque-window.png`、`opaque-windowregion.png`、`opaque1e-window.png`、`opaque1e-windowregion.png`。

## 6. 局限与未验证项

1. **skipTaskbar 只有截图/目检证据**（无 API 读回）；条目计数为 AI 目检任务栏截图所得（11/11/12/11）。
2. **forward:true 对注入式光标移动间歇性不转发**：5 组合成扫掠中 2 组收到事件（pm+9、pm+39）、3 组为 0；真实人工移动在 IGNORE_ON 下正常收到（`events.log` L214-216）。根因未查明（怀疑本机 ToDesk/虚拟显示输入栈干扰注入事件）。**卡 11 实机联调须用真实鼠标复验 hover 命中**。
3. 前两次合成右键未捕到桌面菜单（负记录截图在 §2），第三次加光标读回断言后成功；不宣称已查明前两次失败根因。
4. `HWND` 读回命令因 `Buffer.readUIntLE` byteLength≤6 抛 RangeError（`events.log` L464），overlay 顶层 hwnd 数值未取得；命中测试证据改用 `WindowFromPoint` 的类名（`SysListView32/FolderView` vs `Chrome_RenderWidgetHostHWND`）。
5. 全屏独占应用场景未测；DWM 合成被关场景未测；多显示器/混合 DPI 未测（本机 electron 仅见 1 个显示器、scaleFactor=1）；透明窗不可 resize/Windows 下不可最大化仅引用官方文档，未主动复测；CSS blur 未测（design 已裁定不用）。
6. DevTools 变不透明一条仅做防御性守卫（未主动开 DevTools 复现），符合卡上 MUST NOT 约束。
7. B 取样点窗后内容本身为纯白，按判据不能作主判据点（主判据点为 A）。
8. 测量期间存在真实人工操作（`events.log` 16:01:47–49Z 人工移动并点击色块 2 次、16:07:11Z 人工划过窗体）；各判据均带对照（基线/反向/命中测试），不受其影响，但特此声明。
9. CPU 口径为进程 `TotalProcessorTime` 差值（不含系统级中断/DPC 归属误差）；10s 窗口单次测量，未做多次重复取中位。

## 7. 对卡 03（宿主 overlay 实现）的建议参数

实测有效、本机无异常的参数（原样列出，建议卡 03 照抄）：

```js
{
  width: 220, height: 460,
  x: workArea.x + workArea.width - 220 - 24,   // 实测 2316
  y: workArea.y + workArea.height - 460 - 24,  // 实测 908
  frame: false,
  transparent: true,
  backgroundColor: '#00000000',
  alwaysOnTop: true,
  skipTaskbar: true,
  hasShadow: false,
  thickFrame: false,
  roundedCorners: false,
  resizable: false,
  maximizable: false,
  acceptFirstMouse: true,
  show: false,                                  // + ready-to-show 后 show()
}
```

- **没有任何参数在本机导致异常**：`thickFrame:false`/`roundedCorners:false` 未引发边框残影或圆角缺口（四角截图干净），**建议保留**；`backgroundColor:'#00000000'` 必须与 `transparent:true` 同用（对照 1 证明单独把它留给不透明窗会得到 `#f3f3f3` 灰底）。
- 穿透默认 `setIgnoreMouseEvents(true,{forward:true})`，命中精灵/面板时切 `false`：双向均实测生效；注意切回 `false` 后**整窗**捕获点击（220×460 内空白区也捕获），为 design D-2 已记录的取舍。
- toggle 关闭请真 `destroy()`：rAF 窗体单核当量 ≈2.18%，destroy 后 0.0ms/10s。
- 验收/排障提示：透明验收**不得开 DevTools**；若 hover 命中测试在 CI/自动化（注入输入）环境偶发失灵，先用真实鼠标或 `WindowFromPoint` 命中测试复核，再怀疑宿主实现（本机注入输入间歇性不转发，见 §6-2）。

## 附：证据文件清单（均在 `%TEMP%\pet-probe\`）

脚本：`info.js`、`main.js`、`page.html`、`driver-lib.ps1`、`driver1.ps1`、`driver2.ps1`、`driver2b.ps1`、`driver2c.ps1`、`driver3.ps1`、`cleanup.ps1`
日志：`events.log`（主实例全量事件）、`events-opaque.log`、`electron-stdout*.log`、`driver*-out.txt`（各驱动完整 stdout）、`metrics.json`、`pixels.json`、`state.json`
截图：见 §1–§5 各节列出的绝对路径。

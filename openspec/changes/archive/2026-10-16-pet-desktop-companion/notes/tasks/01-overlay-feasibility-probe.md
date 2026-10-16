# 01 · overlay-feasibility-probe（前置实机验证：透明 + 穿透 + CPU）

| 字段 | 内容 |
| --- | --- |
| **目标** | 用**原生 Electron 最小脚本**（不进任何仓库产物）实测四件事并留下硬证据：① `transparent:true` + `backgroundColor:'#00000000'` 的窗体在本机 Windows 上**真的透明**（像素取色等于壁纸色）；② `setIgnoreMouseEvents(true,{forward:true})` 下页面仍收得到 `pointermove`（命中测试可行），且窗体空白区的点击**落到桌面**；③ `alwaysOnTop` + `skipTaskbar` 生效（任务栏无条目、压在普通窗口之上）；④ 窗体内跑 rAF 帧循环时，**销毁窗体前后**主/渲染进程 CPU 的差值（对应"关窗省 CPU"的验收判据）。 |
| **输入** | `design.md` D-1（窗体参数清单）、D-2（穿透与命中转发）、D-11（五处绘制点 + 官方文档复核第 1/2/4 条：无逐像素穿透、`resizable` 必须 false、**开 DevTools 会变不透明**）；`notes/validation.md` 第二轮 N6（用户裁定"接受风险并登记"⇒ 本卡即该登记项的落地）；官方文档 <https://www.electronjs.org/zh/docs/latest/tutorial/custom-window-styles>。 |
| **文件所有权** | `openspec/changes/pet-desktop-companion/notes/evidence/overlay-feasibility.md`（新建）。临时脚本与截图放 `%TEMP%`，**不进仓库**；不改任何 `src/**`、`extensions/**` 文件。 |
| **验收命令** | 无仓库门槛（脚本在 `%TEMP%` 跑）。验收 = 证据文件里四项各有可复核数据：① 取色点的 RGB 与壁纸取样一致（差值 ≤ 2/255，且**不是** `#1e1e1e`/`#ffffff`）；② `pointermove` 事件计数 > 0 且穿透时桌面图标可被点中；③ 任务栏条目数不变；④ 关窗前/后 CPU 占用各一个数值（任务管理器或 `Get-Counter`），并写明测量时长与负载条件。**测量透明度时 MUST NOT 打开 DevTools**（D-11 复核第 4 条）。 |
| **依赖与阻塞** | 无（不依赖宿主改动，用原生 Electron 直接验证）。**阻塞** 03（宿主 overlay 实现按本卡结论调参）与 11（实机联调的判据来自本卡）。 |
| **并行组** | 组 1 |

## 负向自检（不改实现）

- 反向验证"透明失败长什么样"：把同一脚本的 `transparent` 改为 `false` 再取同一点像素，应得到 `#1e1e1e`（不透明底色）⇒ 证明取色判据有区分力。此为**临时脚本参数**，不涉及仓库文件，无需授权与还原。

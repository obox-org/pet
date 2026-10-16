## ADDED Requirements

### Requirement: 本扩展 SHALL 是后台扩展：MUST NOT 注册 App 卡片，宠物窗体 MUST NOT 出现在启动器或导航区

扩展对外只有三处可见面：设置页「扩展-宠物」、overlay 宠物窗体、状态栏诊断文本。窗体只能由扩展经 `api.overlay.create` 创建、经 `api.overlay.destroy` 销毁；宿主停用/卸载扩展时 MUST 回收其 overlay 窗体（与入口 cleanup 一同生效，`docs/extension-api/api-reference.md:30`）。

#### Scenario: 启动器里没有宠物卡片

- **WHEN** 扩展已安装并启用
- **THEN** 启动器/应用列表与导航区都不出现"宠物"条目，宠物窗体仍按设置显示在主显示器右下角

#### Scenario: 停用或卸载即回收窗体

- **WHEN** 用户在扩展管理器停用或卸载本扩展
- **THEN** overlay 窗体被销毁，入口的定时器、消息处理器与设置订阅全部释放（cleanup 执行），不再产生结算与写盘

### Requirement: 宠物窗体 SHALL 在扩展激活且设置为显示时自动出现在主显示器工作区右下角，且为无边框、背景透明、置顶、不占任务栏

窗体由扩展经宿主新增的 **overlay 能力** `api.overlay.create({ id, url, width, height, anchor:'bottom-right', margin, transparent:true, alwaysOnTop:true, skipTaskbar:true })` 创建（宿主实现见 proposal `## Impact`：`src/main/appWindow.ts` 的窗体参数 + `AppWindow.vue` 的 overlay 模式）。overlay 模式下宿主 **MUST NOT** 绘制标题栏与任何窗体背景（`AppWindow.vue:202` 的 `<TitleBar>`、`:228`/`:233` 的 `var(--bg)` 背景、`:239` 的 `.app-frame{background:#ffffff}` 全部透明；`appWindow.ts:72` 的 `backgroundColor` 为 `'#00000000'`），否则"背景透明"不成立。定位基准为**主显示器**的工作区（不含任务栏区域），右下角留固定边距（design 定，默认 24px）。

#### Scenario: 安装并启用后自动出现

- **WHEN** 扩展首次激活且"显示宠物"设置为开
- **THEN** 主显示器工作区右下角出现宠物窗体，且该窗体无边框、背景透明、置顶、任务栏无对应条目

#### Scenario: 窗体空白区完全透出桌面（透明的可验收判据）

- **WHEN** 宠物窗体显示在一张彩色壁纸上，截取窗体矩形内**精灵与面板之外**的一点
- **THEN** 该点像素颜色等于其下方壁纸的颜色（不是 `#1e1e1e`、也不是 `#ffffff`），即宿主外壳、iframe 底色与全局 `body` 背景均未绘制

#### Scenario: 多显示器环境定位在主显示器

- **WHEN** 系统接有多个显示器且扩展激活
- **THEN** 窗体出现在**主显示器**的工作区右下角（不是扩展窗口所在显示器、不是坐标原点显示器）

### Requirement: 设置 toggle 关闭 SHALL 销毁窗体而非隐藏，重新打开 SHALL 重建且状态不丢

销毁 MUST 同时停止该窗体驱动的动画循环（rAF / 帧定时器），使 CPU 占用回落（grill Q2 用户硬约束："隐藏就是关闭窗体，而不是隐藏窗体，降低cpu使用率"）。属性/库存/成长值等权威状态保存在扩展入口与 data 目录（`docs/extension-api/api-reference.md:561-577`），不随窗体销毁而丢失。

#### Scenario: 关窗即停动画循环

- **WHEN** 用户把"显示宠物"从开切到关
- **THEN** 窗体被销毁、驱动动画的 rAF/定时器停止、扩展入口的结算时钟不受影响

#### Scenario: 开窗恢复且状态连续

- **WHEN** 用户把"显示宠物"从关切到开
- **THEN** 窗体重新创建，显示的属性/库存/成长值与关窗前经结算后的值一致

### Requirement: 宠物窗体 MUST 不可调整大小、不可最大化

窗体尺寸固定（默认值由 design 定），避免透明窗体被拉伸后精灵与命中区错位。

#### Scenario: 用户尝试拉伸

- **WHEN** 用户在窗体边缘拖拽或双击标题区（无标题区）
- **THEN** 窗体尺寸不变

### Requirement: 拖拽精灵 SHALL 移动 overlay 窗体，松手 SHALL 把钳位后的位置持久化，且拖动期间 MUST 与踱步互斥

移动经宿主 `api.overlay.setPosition(id, x, y)`（与既有 overlay 方法同作用域约束）；坐标 MUST 钳在主显示器工作区内（不越界、不盖任务栏）。无存档位置时 SHALL 用 `anchor` 默认值；启动读档时若存档位置完全落在当前工作区外 SHALL 钳回工作区内（不丢弃存档），非法值（NaN 等）回退默认值并 warn。拖动期间（pointerdown→pointerup）MUST 抑制 `trot` 触发与 `sleep` 判定推进、MUST NOT 弹气泡。

#### Scenario: 拖动后重启回到存档位置

- **WHEN** 用户把宠物拖到工作区左上区域后重启 obox
- **THEN** 窗体出现在存档位置（而非右下角默认锚点）

#### Scenario: 拖出工作区被钳回

- **WHEN** 用户把精灵往屏幕外拖（例如向右下拖过任务栏）
- **THEN** 窗体被钳在工作区内（右/下边与工作区边重合），松手持久化的是钳后坐标

#### Scenario: 拖动中不踱步不入睡

- **WHEN** 拖动持续超过 `trot` 的随机间隔或 10 分钟
- **THEN** 不触发原地小跑、`sleep` 判定不推进（松手后按当前条件重新判定）


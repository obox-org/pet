## ADDED Requirements

### Requirement: 设置页「扩展-宠物」SHALL 含一个"显示宠物"开关（boolean）：开 = 创建宠物窗体，关 = 销毁宠物窗体

开关经 `api.settings.register` 声明、经 `api.settings.set/get/onChanged` 读写（`docs/extension-api/api-reference.md:250,291-332`）；扩展入口订阅变更并驱动窗体创建/销毁（与 `pet-window` 的销毁语义一致）。

#### Scenario: 在设置页关掉开关

- **WHEN** 用户在 设置 → 扩展 → 宠物 把"显示宠物"切到关
- **THEN** 宠物窗体被销毁（不是隐藏），设置值持久化；重新打开 obox 后仍为关

#### Scenario: 写后设置页当帧刷新

- **WHEN** 扩展因其它路径改写该键（例如首次安装写入默认值）
- **THEN** 已打开的设置页不需要重进即显示新值（`api-reference.md:312`）

### Requirement: 设置页 SHALL 以三行进度条呈现饥饿度 / 清洁度 / 心情，每行右侧显示 `{cur}/100`，且 MUST NOT 带描述文字

三行使用宿主新增的 `progress` 设置字段类型（值 = 0..100 的数字，由扩展经 `api.settings.set` 写入，与 `status` 同属"扩展写、宿主只读渲染"语义，`docs/extension-api/api-reference.md:299,310-318`）。每属性一行，顺序固定为饥饿度、清洁度、心情。

**显示口径（validation N3 的修复）**：右侧 `{cur}` = `Math.floor(cur)`，且 `cur` 钳制在 `[0, 100]`；内部保留小数以避免长期漂移（design D-5），但进度条宽度用**未取整**的真实比例 `cur/100`（不得用取整后的值算宽度，否则条与数字会不一致）。

#### Scenario: 三行进度条与数值

- **WHEN** 用户打开 设置 → 扩展 → 宠物
- **THEN** 看到三行进度条，右侧分别为 `饥饿度当前值/100`、`清洁度当前值/100`、`心情当前值/100`，且三行均无描述文字

#### Scenario: 属性变化后进度条跟随

- **WHEN** 扩展结算后写入新的属性值
- **THEN** 已打开的设置页进度条与 `{cur}/100` 同步更新（不需要重进页面）

### Requirement: 本扩展 SHALL 声明宿主 `apiVersion` 门槛，使不具备三项新能力（窗体选项 / 扩展自创建销毁窗体 / `progress` 字段）的老宿主拒绝加载

机制为宿主既有门槛：`apiVersion` 高于 obox 当前 API 版本时校验 error、拒绝加载（`docs/extension-api/manifest-reference.md:20,300`）。宿主在引入三项能力时递增根 `package.json` 的 `apiVersion`，本扩展 manifest 声明同一值。

#### Scenario: 老宿主安装

- **WHEN** 在不具备三项新能力的 obox 版本上安装本扩展 `.oix`
- **THEN** 宿主按 apiVersion 门槛拒绝加载并给出"需要 obox API vN 或更高"类明确提示（不出现半残窗体或空白设置页）

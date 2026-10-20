## ADDED Requirements

### Requirement: 设置页 MUST 展示开关、成长值、好感（进度条 + 精确值）、等级名与诊断，且三属性行 MUST 被删除

设置页（`pet.settings`）MUST 包含（共 **6 个字段 / 5 个逻辑行**）：①「显示宠物」开关（boolean，语义不变：开=创建浮层窗、关=销毁浮层窗）；② **成长值**（`status`，只读文本，展示精确整数）；③ **好感值**（`progress`，`max = 650`，只读进度条）；④ **好感（精确值）**（键 `pet.favorExact`，`status`，只读文本，展示**不钳制**的真实好感值——宿主会把 `progress` 的 `cur` 钳到 `[0,max]`，故精确值必须单独一行，见 `SettingsView.vue` 的 `progress` 渲染逻辑）；⑤ **等级**（`status`，只读文本，展示当前等级名）；⑥ 诊断（`status`）。MUST NOT 再出现「饥饿度」「清洁度」「心情」三行，也不得残留这三个设置键（`pet.hunger`/`pet.clean`/`pet.mood`）。

#### Scenario: 设置页行集合

- **WHEN** 打开 设置 → 扩展 → 宠物
- **THEN** 依次可见：显示宠物（开关）、成长值（数字）、好感（进度条，按 650 封顶）、好感（精确值，真值）、等级（等级名）、诊断；不存在三个属性行

#### Scenario: 好感超过进度条上限

- **WHEN** 好感值大于 650（满级后继续累加，如 651）
- **THEN** 进度条显示为满格（650/650），而「好感（精确值）」行显示 `651`——精确数字 MUST NOT 被吞掉

### Requirement: 设置字段 MUST NOT 带描述文案，且 MUST 只使用宿主既有的字段类型

三行展示 MUST 只使用既有字段类型（`boolean` / `progress` / `status`），MUST NOT 引入新字段类型（避免把 `apiVersion` 抬到 3）。每个字段 MUST NOT 声明 `description`（沿用 v1 的"无描述"口径：`progress` 本身不渲染描述，其它字段写了也不该出现）。字段与宿主字段契约见 `docs/extension-api/manifest-reference.md` 的 `contributes.settings` 小节与 `docs/extension-api/themes-settings.md` 的字段类型说明。

#### Scenario: 无描述

- **WHEN** 渲染设置页三行
- **THEN** 每行只有名称与值/控件，没有描述文字

#### Scenario: 只用既有类型

- **WHEN** 校验 `manifest.json` 的 `contributes.settings.fields`
- **THEN** 所有 `type` 都属于 `text|number|boolean|select|directory|status|progress`

### Requirement: 关闭「显示宠物」MUST 销毁浮层窗口（非隐藏），开启 MUST 重建并回到存档位置

开关语义 MUST 与 v1 一致：关闭 = **销毁**窗口（渲染进程与浮层都被回收，CPU 归零），MUST NOT 只是隐藏；开启 = 重建窗口并应用存档位置与当前数值（数值 MUST 连续，不倒回初始值）。

#### Scenario: 关闭销毁

- **WHEN** 把「显示宠物」关掉
- **THEN** 浮层窗口与页面都被销毁（宿主侧不再有该 overlay），CPU 占用回落到零附近

#### Scenario: 开启恢复

- **WHEN** 再次打开开关
- **THEN** 浮层按存档位置重建，成长值/好感值/道具数量与关闭前连续

## ADDED Requirements

### Requirement: 成长值 SHALL 以 +2/小时累积；心情每低于满分 5 点（向下取整档）⇒ 该小时速率 -0.1；速率下限为 0（不为负）

即 `rate = max(0, 2 - 0.1 * floor((100 - 心情) / 5))` /小时。结算与属性同用惰性时间差（grill Q4）。

#### Scenario: 满心情一小时

- **WHEN** 心情恒为 100 且运行满 1 小时
- **THEN** 成长值 +2

#### Scenario: 心情 80 一小时

- **WHEN** 心情恒为 80（缺 20 ⇒ 4 档）且运行满 1 小时
- **THEN** 成长值 +1.6

#### Scenario: 心情 0 不扣成负

- **WHEN** 心情恒为 0 且运行满 1 小时
- **THEN** 成长值不变（速率被钳到 0）

### Requirement: 成长值与等级名 SHALL 在悬停面板呈现（数值 + 等级名），等级阈值划分由 design 定稿

悬停面板的其余内容（库存、三属性简值）见 `pet-interaction`。

#### Scenario: 悬停可见成长信息

- **WHEN** 鼠标悬停在宠物上
- **THEN** 面板显示成长值数值与对应等级名

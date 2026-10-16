## ADDED Requirements

### Requirement: 挂机（obox 运行且宠物窗体存在）每满 20 分钟 SHALL +1 小鱼干与 +1 沐浴泡泡；两种道具库存上限各为 20，满则不再累加

挂机时长与属性结算共用同一时钟（grill Q4/Q5）。窗体被销毁期间挂机计时 MUST 暂停。

#### Scenario: 挂机满 20 分钟

- **WHEN** 窗体连续存在满 20 分钟
- **THEN** 小鱼干 +1 且沐浴泡泡 +1

#### Scenario: 库存到顶

- **WHEN** 小鱼干已为 20 且再挂机满 20 分钟
- **THEN** 小鱼干保持 20（沐浴泡泡若未满则照常 +1）

#### Scenario: 关窗暂停挂机

- **WHEN** 窗体被 toggle 销毁 30 分钟后重新创建
- **THEN** 该 30 分钟不产生任何道具

### Requirement: 喂食 SHALL 消耗 1 小鱼干、洗澡 SHALL 消耗 1 沐浴泡泡、玩耍 MUST NOT 消耗道具；道具不足时该互动 MUST 不可用并给出可见提示

不做负库存、不做赊账（grill Q6）。

#### Scenario: 无小鱼干时喂食

- **WHEN** 小鱼干 = 0 且用户触发喂食
- **THEN** 饥饿度不变、小鱼干不变，并出现"没有小鱼干了"类提示（气泡或面板文案，design 定）

#### Scenario: 有道具时洗澡

- **WHEN** 沐浴泡泡 ≥ 1 且用户触发洗澡
- **THEN** 沐浴泡泡 -1 且清洁度 +15（受 pet-vitals 上限约束）

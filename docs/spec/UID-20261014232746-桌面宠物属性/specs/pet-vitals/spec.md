## ADDED Requirements

### Requirement: 状态存档 SHALL 带 `schemaVersion`；版本不受支持或无法解析时 MUST 备份后按初始值重建

存档 `state.json` 落在扩展自己的 data 目录（`docs/extension-api/api-reference.md:561-577`），顶层 MUST 含 `schemaVersion: 1`。读到**高于**当前实现支持的版本、或 JSON 解析失败时，MUST 先把原文件备份为 `state.json.bad`，再按初始值重建（三属性 100、成长 0、小鱼干/沐浴泡泡各 3），并在日志写明原因；MUST NOT 静默丢弃用户存档而不留痕。写入 MUST 原子（先写 `state.json.tmp` 再 rename）。

#### Scenario: 存档版本不受支持

- **WHEN** 存档 `schemaVersion` 为 2 而当前实现只支持 1
- **THEN** 原文件被备份为 `state.json.bad`，宠物按初始值重新开始，日志出现 `[pet] 存档版本不受支持，已备份并重建`

#### Scenario: 正常恢复且不追算离线

- **WHEN** 存档 `schemaVersion` 为 1 且字段完整，obox 关闭 3 天后重新启动
- **THEN** 按存档恢复三属性/库存/成长值，且 `lastSettledAt` 被重置为当前时刻（关闭期间不衰减、不挂机）

### Requirement: 三属性 SHALL 以 100 为满分、0 为下限，并按固定速率衰减：饥饿度 -1/分钟、清洁度 -10/小时、心情 -5/小时

衰减在结算时按时间差一次性计算（见惰性结算 requirement），不依赖"每分钟触发一次"的实时扣减。

#### Scenario: 运行满一分钟

- **WHEN** obox 运行且窗体存在满 60 秒（无其它交互）
- **THEN** 饥饿度较结算前 -1，清洁度与心情按各自速率同比变化（清洁度 -10/小时 ≈ -0.1667/分钟）

#### Scenario: 下限钳制

- **WHEN** 某属性已为 0 且继续结算
- **THEN** 该属性保持 0，不出现负数

### Requirement: 属性联动 SHALL 满足：饥饿度每累计下降 10 点 ⇒ 心情 -1；清洁度每累计下降 10 点 ⇒ 心情 -1；饥饿度或清洁度每累计恢复 10 点 ⇒ 心情 +1，且经"恢复"途径的心情上限为 95

"累计"指自上次触发联动以来的净变化量，跨结算周期连续记账（不因结算批次而丢失零头）。

#### Scenario: 饥饿联动扣分

- **WHEN** 饥饿度自 80 累计降到 70
- **THEN** 心情 -1（且该 10 点不重复计分）

#### Scenario: 恢复联动不超 95

- **WHEN** 心情已为 95 且饥饿度恢复满 10 点
- **THEN** 心情保持 95（恢复途径不把它推到 96 及以上）

### Requirement: 结算 SHALL 惰性进行（按 `now - lastSettledAt` 一次性补算），且仅计 obox 运行期间；启动时 MUST 将 `lastSettledAt` 重置为当前时刻

系统休眠或主线程卡顿期间定时器不触发，恢复后 MUST 补算该段且**只补一次**（幂等）。obox 完全关闭的那段时间 MUST NOT 被追算（grill Q4）。

#### Scenario: 休眠后补算一次

- **WHEN** 系统休眠 10 分钟后恢复，期间 obox 进程存活
- **THEN** 该 10 分钟的衰减与挂机收益被补算恰好一次

#### Scenario: 关闭三天不追算

- **WHEN** obox 关闭 3 天后重新启动
- **THEN** 三属性与关闭时刻持久化的值一致（不追算离线 3 天）

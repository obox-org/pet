## ADDED Requirements

### Requirement: 自发随机动作 MUST 每 60 秒触发一次，每次只播一轮，随机集 MUST 为 7 项

随机集 MUST 为 `eating` / `bathing` / `petted` / `playing` / `trot` / `run-left` / `run-right` 七项（用户裁定：保持 7 项不变，接受 `playing` 与 `trot` 同取 row7 的重复）。每次触发 MUST 只播放**一轮**动画（约 1.4–1.8 秒），播完 MUST 回落到当前基础状态；MUST NOT 消耗道具、MUST NOT 改变任何数值、MUST NOT 弹出气泡、MUST NOT 推进 `lastInteractAt` 或挂机计时以外的任何状态。

#### Scenario: 一分钟一轮

- **WHEN** 扩展连续运行且无互动
- **THEN** 每 60 秒从 7 项里抽一条播一轮

#### Scenario: 无副作用

- **WHEN** 一轮随机动作播放完毕
- **THEN** 成长值、好感值、道具数量、气泡内容全部与播放前一致

#### Scenario: 互动可抢占

- **WHEN** 随机动作播放中玩家喂食/洗澡/点击
- **THEN** 立刻切到该互动的动画，随机动作被抢占且不补播

### Requirement: 宠物 MUST NOT 进入睡眠状态，也 MUST NOT 有睡眠相关的任何表现

v1 的"连续 600 秒无交互即打盹"机制 MUST 整体移除：MUST NOT 存在睡眠状态、MUST NOT 显示"打盹中"类文本、MUST NOT 在长时间无交互时暂停随机动作、MUST NOT 对待机动画做 1.5 倍慢放。长时间无交互时，宠物 MUST 保持正常待机与正常节拍。

#### Scenario: 长时间无交互仍活跃

- **WHEN** 连续 2 小时无任何互动
- **THEN** 随机动作仍按每 60 秒一轮播放，待机动画按原速，且不出现任何"打盹"文本

#### Scenario: 旧睡眠门控不再存在

- **WHEN** 检查入口逻辑与页面逻辑
- **THEN** 不存在"睡眠时跳过随机动作"的分支，也不存在 `SLEEP_AFTER_MS` 常量

### Requirement: 每个瞬时动作播完 MUST 回落到当前基础状态，回落 MUST 不依赖入口下一次推送

瞬时动画（互动与随机动作）播完一轮后 MUST 立刻回落；回落 SHOULD 在该轮时长 + 1 秒内完成，且 MUST NOT 等待其它节拍（如 15 秒结算或 60 秒随机动作）才能恢复。该行为 MUST 区分"自发表演"与"真实互动"两个来源，避免把玩家刚点的动作提前掐断。

#### Scenario: 互动播完回落

- **WHEN** 喂食动画播完一轮
- **THEN** 精灵回到待机，气泡按 4 秒规则独立消失

#### Scenario: 自发表演播完回落

- **WHEN** 随机动作播完一轮
- **THEN** 精灵回到待机，MUST NOT 一直停在表演姿态

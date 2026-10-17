## ADDED Requirements

### Requirement: 图集几何 SHALL 由随图集分发的 `pet.json` 声明，渲染不得硬编码行列数；内置图集为 dsh-pet 的「鲸鱼娘」

`pet.json` MUST 声明：`id`、`displayName`、`spritesheetPath`、每行帧数 `frames`、以及可选的 `cell`（格子宽高）、`columns`（列数）、`tracks`（每条动画轨的逐帧时长）。缺省值：`cell` = 192×208、`columns` = 8。内置图集实测值（上游 `packages/dsh-pet/assets/whale/pet.json`）：8 列 × 9 行、每格 192×208、整图 **1536×1872**、`frames = [6, 8, 8, 4, 5, 8, 6, 6, 6]`、行名与轨名依次为 `idle`(6 帧) / `running-right`(8) / `running-left`(8) / `waving`(4) / `jumping`(5) / `failed`(8) / `waiting`(6) / `running`(6) / `review`(6)。图集 MUST 为透明背景（窗体透明，不得出现白底方块）。

帧时长 SHALL 取 `tracks[<轨名>].durations` 的逐帧值；某轨未声明 durations 时回退默认 **250ms/帧**。

#### Scenario: 按声明的几何裁剪

- **WHEN** 扩展加载内置鲸鱼娘图集
- **THEN** 按 192×208 的格子、8 列布局裁剪，第 r 行第 c 帧取自 `(c*192, r*208)`，且背景保持透明

#### Scenario: 帧时长取自 tracks

- **WHEN** 播放 `idle` 轨
- **THEN** 六帧依次按 400/400/500/400/400/500 毫秒显示（不是等间隔），一轮约 2600ms

#### Scenario: 缺帧容错

- **WHEN** 某行实际可用帧数少于列数（如 `waving` 只有 4 帧而列数为 8）
- **THEN** 按 `frames` 声明的该行帧数取模循环，MUST NOT 越界采样到相邻行的像素

### Requirement: 状态 → 动画轨的映射 SHALL 固定，且同时命中多个状态时 MUST 按固定优先级取唯一一轨

映射（本轮使用上游鲸鱼娘图集，故为**语义就近的临时映射**；AI 自制图集到位后按 1:1 行序替换，见 design D-4/R3）：

| 扩展状态 | 上游动画轨（行号） | 说明 |
| --- | --- | --- |
| `idle` 待机 | `idle`(0) | 默认 |
| `eating` 喂食 | `jumping`(4) | 开心地吃 |
| `bathing` 洗澡 | `waving`(3) | 摆动手臂 ≈ 擦洗 |
| `playing` 玩耍 | `running`(7) | 原地跑动 |
| `petted` 摸头 | `waving`(3) | 与洗澡共用一轨，靠气泡文案区分 |
| `hungry` 饥饿 | `waiting`(6) | 等待投喂 |
| `dirty` 脏 | `review`(8) | 就近映射（上游无"脏"轨） |
| `sad` 心情低 | `failed`(5) | 低落 |
| `sleep` 打盹 | `idle`(0)，帧时长 ×1.5 | 上游无 sleep 轨；"Zzz" 由气泡/面板文字表达 |

优先级（同时命中取唯一）：瞬时互动（`eating`/`bathing`/`playing`/`petted`，播放中不可打断）> `hungry` > `dirty` > `sad` > `sleep` > `idle`。上游的 `running-left`(2) / `running-right`(1) 两轨本轮**不使用**（宠物不位移，见 design Non-Goals）。

#### Scenario: 属性过低优先于待机

- **WHEN** 饥饿度低于阈值且无瞬时互动
- **THEN** 播放 `waiting` 轨而非 `idle` 轨

#### Scenario: 瞬时互动优先且播完回落

- **WHEN** 属性过低的同时用户触发喂食
- **THEN** 先播放 `jumping` 轨一轮（不可被打断），结束后回落到按属性判定的轨

#### Scenario: 打盹为慢放 idle

- **WHEN** 连续 10 分钟无任何交互
- **THEN** 播放 `idle` 轨且每帧时长为其 `durations` 的 1.5 倍，面板/气泡显示"打盹中"

### Requirement: 帧动画 SHALL 在窗体销毁时停止（rAF / 帧定时器 MUST 被清理），重建时从 `idle` 轨第一帧恢复

与 `pet-window` 的"关窗省 CPU"约束一致；清理发生在子窗口卸载路径（子窗口无 api 对象，生命周期由窗体本身决定，`docs/extension-api/api-reference.md:27`）。

#### Scenario: 关窗后无残留帧循环

- **WHEN** toggle 关闭销毁窗体
- **THEN** 该窗体的 rAF/帧定时器停止（CPU 回落），扩展入口的结算时钟继续运行


### Requirement: 状态机 SHALL 每 10 秒自发播放一次随机「表演型」动画；状态指示轨（hungry/dirty/sad/sleep）MUST NOT 参与随机

> **v1.0.2 修订（2026-10-16）**：周期由 **10 秒**改为 **1 分钟（60 秒）**——用户实机体验后**改判**（原话"间隔1min播放一次，而不是10s钟播放一次"），**只改周期**，其余语义不变。本条与下面 scenario 里的"10 秒"是**发版时的原始口径**，保留以存史；**实现以 v1.0.2 为准**，详见 `notes/hotfix-v1.0.2.md`（含两侧常量相等的新门禁与负向自检）。

随机集（单一来源 `lib/constants.js`）= `eating` / `bathing` / `petted` / `playing` / `trot` / `run-left` / `run-right` 七项；随机挑选后播放**一轮**（约 1.4–1.6s），播完回落到当前状态判定。**不消耗道具、MUST NOT 改变任何属性/库存/成长值、MUST NOT 弹气泡**。优先级低于真实互动（用户互动可随时打断），且 MUST NOT 推进或重置 `lastInteractAt`。`sleep`（连续 10 分钟无交互）期间 MUST NOT 触发。`running-left`(2) / `running-right`(1) 两轨 SHALL 只做**原地**播放——MUST NOT 移动窗体、MUST NOT 改变窗体位置。

#### Scenario: 每 10 秒随机表演一轮

- **WHEN** 宠物处于非 sleep 的可表演状态且距上次随机表演满 10 秒
- **THEN** 从随机集里抽一条播一轮（约 1.4–1.6s）后回落判定；期间道具/属性/库存/成长值一个字节不变、不出气泡

#### Scenario: 真实互动可打断随机表演

- **WHEN** 随机表演播放中用户点击/喂食/洗澡/玩耍
- **THEN** 立即切到该互动对应的动画（随机表演被抢占），互动的数值效果照常生效

#### Scenario: 打盹期间不表演

- **WHEN** 连续 10 分钟无任何交互（`sleep`）
- **THEN** 不触发随机表演（保持慢放 idle + 打盹气泡），直到任一交互发生

#### Scenario: 侧跑轨不位移

- **WHEN** 随机抽到 `run-left`(2) 或 `run-right`(1)
- **THEN** 只在窗体内原地播放该轨（帧循环），窗体位置 MUST NOT 改变（无 `setPosition` 调用）

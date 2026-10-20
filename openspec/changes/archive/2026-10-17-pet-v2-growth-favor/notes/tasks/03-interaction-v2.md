# 03 · interaction-v2（喂食 / 洗澡 / 点击）

| 字段 | 内容 |
| --- | --- |
| **目标** | 互动收敛为喂食 + 洗澡（各 +1 成长 +1 好感、耗对应道具、共享 10 分钟冷却）与点击（1 小时 1 次 +1 好感、冷却期仍播动画并显示冷却文本）；`play` 及未知互动按拒绝处理 |
| **输入** | `specs/pet-interaction/spec.md` 的 6 条 requirement（含新增的"面板显示等级名"——本卡只负责入口把 `levelName` 放进视图所需的数据来源）；`specs/pet-economy/spec.md` 的消耗与拒绝规则；`design.md` 的 D-4（判定顺序）、D-9（错误文案）；`lib/texts.js` 的取样 API |
| **文件所有权** | `lib/interact.js`、`test/interaction-v2.test.js`（新建） |
| **验收命令** | ① `npm test -- test/interaction-v2.test.js` 全绿；② 覆盖判定顺序（冷却 → 库存 → 结算）与"拒绝零副作用"（逐字段断言前后一致）；③ 覆盖共享冷却（喂食后立刻洗澡被拒）与跨重启（用持久化的 `lastInteractAt`）；④ 覆盖点击冷却期"数值不变 + 仍返回动画 + 返回冷却文本"；⑤ 覆盖 `play`/`summon`/`hide`/未知 kind 一律拒绝且状态零变化 |
| **依赖与阻塞** | 依赖**卡 1**（常量与 `levelOf`）与**卡 2**（`pickCoolingText`）；阻塞卡 4 |
| **并行组** | G2 |

## 要点

1. `KINDS = ['feed', 'bathe', 'pet']`；`interact(state, kind, now)` 纯函数、不改入参。
2. 判定顺序固定：`now - lastInteractAt < INTERACT_COOLDOWN_MS` ⇒ 拒绝（`reason: 'cooling'`，文案取"再等等"类）；否则道具 < 1 ⇒ 拒绝（`reason: 'no-item'`）；否则结算（道具 -1、growth +1、favor +1、`lastInteractAt = now`、`lastAfkAt = now`）。
3. 点击：`now - lastPetAt < PET_COOLDOWN_MS` ⇒ **不结算但返回** `{ ok: false, reason: 'pet-cooling', anim: 'petted', text: pickCoolingText(last) }`；否则结算 favor +1、`lastPetAt = now`、`lastAfkAt = now`、`anim: 'petted'` + 成功文本。
4. 时间戳非法（NaN/负数/未来）⇒ 视为已到期；`now` 回拨同样视为到期。
5. 返回值形状供卡 4 的视图与气泡消费，需与 `design.md` D-9 的错误码一一对应（`cooling` / `no-item` / `pet-cooling` / `unknown-kind`）。

## 负向自检（不改实现）

- 喂食成功后再喂食（0 秒后）⇒ `cooling`，且 `fish/growth/favor/lastInteractAt` 全部不变；
- `fish = 0` 且不在冷却 ⇒ `no-item`，`bubble` 不变；
- `kind: 'play'` ⇒ `unknown-kind`，状态零变化；
- 点击 2 次（间隔 1 秒）⇒ 第一次 `ok: true`、第二次 `ok: false` 且**仍返回 `anim: 'petted'`** 与冷却文本；
- 时钟回拨（`now` 小于 `lastInteractAt`）⇒ 视为已到期（可互动）。

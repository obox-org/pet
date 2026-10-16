# 07 · ext-core（扩展：入口 + 纯函数状态机 + 单测，覆盖 N7）

| 字段 | 内容 |
| --- | --- |
| **目标** | 实现扩展入口与全部业务逻辑，并把可纯函数化的部分**逐 scenario 建测**（这是 `validation.md` N7 的落地）：惰性结算（三属性衰减 + 联动记账 + 挂机产出 + 成长值）、道具消耗与冷却、状态→动画轨映射与优先级、存档读写（`schemaVersion` + 原子写 + 损坏/超版本备份重建）、overlay 生命周期（创建/销毁/`setMouseThrough`）、长轮询订阅（`pet.subscribe` hold/唤醒/超时/清理）、设置键写入（toggle + 三属性 + 诊断位）。同时删掉脚手架 demo（`greet()` 与其测试）。 |
| **输入** | `specs/pet-vitals/spec.md`（4 条 requirement：衰减速率 / 联动与 95 上限 / 惰性结算仅计运行期间 / 存档 `schemaVersion`）、`specs/pet-economy/spec.md`（挂机 20 分钟、上限 20、喂食洗澡消耗、不足则不可用）、`specs/pet-growth/spec.md`（`rate = max(0, 2 - 0.1*floor((100-mood)/5))`、面板呈现）、`specs/pet-interaction/spec.md`（点击 5 分钟冷却、悬停面板内容、三互动增量）、`specs/pet-sprites/spec.md`（映射表与优先级、`tracks` 帧时长、缺帧取模）、`specs/pet-window/spec.md`（toggle 销毁而非隐藏、停用即回收）；`design.md` D-3（通道表与 `PetStateView` 形状、长轮询）、D-4（状态表 + 优先级 + 帧时长 + 缺帧容错）、D-5（结算七步 + 时间回拨钳 0 + 启动重置 `lastSettledAt`）、D-7（阈值常量：初始库存 3/3、过低 30、入睡 10 分钟、冷却 300s、气泡 2.6s、等级 50/200/500）、D-8（边界与并发）、D-9（错误文案表）、D-12（后台扩展、删卡片）；锚点：`docs/extension-api/api-reference.md:27`（副作用必须放插件函数）、`:30`（停用执行 cleanup）、`:187,203-214`（消息桥与 reply 形状）、`:405-414`（`api.timer`，秒）、`:561-577`（`api.fs` 仅 data 目录）、`:250,290-332`（`api.settings`）。 |
| **文件所有权** | `extensions/pet/index.js`、`extensions/pet/lib/**`（`settle.js` / `vitals.js` / `items.js` / `growth.js` / `mapping.js` / `persist.js` / `bridge.js` 等，按需）、`extensions/pet/test/**`。**不含** `manifest.json`（卡 09）、`app/**`（卡 08）、`README.md`/`scripts/pack.mjs`/`package.json`（卡 10）、`assets/**`（卡 06）。 |
| **验收命令** | 在 `extensions/pet`：① `npm test`（`node --test`）全绿，且**逐条覆盖** spec 的 scenario：衰减一分钟、下限钳 0、饥饿/清洁每降 10 点心情 -1、恢复途径心情不超 95、休眠补算一次、关闭三天不追算、挂机 20 分钟 +1/+1、库存到顶、关窗暂停挂机、无鱼干喂食不生效、玩耍不耗道具、点击冷却内外差异、成长 2/1.6/0 三档、时间回拨钳 0、存档超版本备份重建、映射优先级（瞬时 > hungry > dirty > sad > sleep > idle）、缺帧取模；② `node scripts/validate-manifest.mjs manifest.json` 通过（manifest 由卡 09 提供，若未完成则本卡用最小 stub 跑逻辑测试，**不改 manifest.json**）；③ 入口顶层**零副作用**（`node --test` 能直接 import 而不触 DOM/IPC）。 |
| **依赖与阻塞** | 依赖 **02**（`api.overlay` 类型面）；实现期可与 08 并行（契约由 design 固定）。**阻塞** 10、11。 |
| **并行组** | 组 3 |

## 负向自检（不改实现）

- 全部用**喂非法/越界输入**表达：`settle(-1000)`（时间回拨）⇒ dt 钳 0 且不产生负衰减；库存 0 时喂食 ⇒ 返回 `{ok:false,error:'没有小鱼干了（挂机 20 分钟可得 1 条）'}` 且属性不变；冷却内点击 ⇒ 心情不变但返回反馈文案；存档 JSON 截断/`schemaVersion:99` ⇒ 备份 `state.json.bad` 并重建；`mood` 传 `NaN`/字符串 ⇒ 钳制或拒绝，不得污染状态。**不采用**"临时改坏实现再跑一遍"。

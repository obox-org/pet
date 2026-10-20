# validation — pet-v2-growth-favor

校验对象：`specs/*/spec.md`（22 条新增 requirement + 4 条 REMOVED、53 个 scenario）与 `design.md`（七节、10 条决策）、上游 `proposal.md` 与 `notes/grill.md`。
校验性质：**只读**（本步未改任何 spec/design 内容）。

## 结论摘要

| 档位 | 条数 |
| --- | --- |
| 严重问题 | **1** |
| 普通问题 | **7** |
| 一般建议 | **4** |
| 证据不足（归入普通问题） | **1 类**（全部 53 scenario 尚无自动化测试——实现阶段才可能补） |

**未跑官方校验（缺 `openspec` CLI）**：`openspec validate --strict pet-v2-growth-favor` 未执行。

## 严重问题（会导致实现错误或数据语义分叉）

### S1 · 关闭「显示宠物」期间是否计入成长值，spec 与 design 都没有裁定

- **锚点**：`specs/pet-values/spec.md` 的 Requirement 1（"连续运行每满 3600 秒 +1"、"重开时按存档里的上次结算时间补算"）；`design.md` 的 D-3（`pet-tick` 在"销毁窗体时清（不改数值）"）。
- **问题**：用户在设置页关掉宠物（窗体销毁、入口仍存活但 tick 被清）时，这段时间算不算"连续运行"？两种实现都符合当前字面：① 算（重开时按 `lastGrowthAt` 补算）② 不算（销毁时把 `lastGrowthAt` 推到 now）。这直接影响"关掉宠物三天再打开会不会一次涨 72 点"。
- **影响**：实现分叉；迁移与测试期望不同；用户观感差异大（保守者会觉得"关掉还涨"是 bug）。
- **修复意见**：在 `pet-values` R1 补一句判定，例如"关闭显示期间 MUST 同样计入（`lastGrowthAt` 不因窗体销毁而推进）"或反之，二者择一；`design.md` D-3 同步。

### S2 ·（降档为 P0）冷却文本是否参与"相邻去重"未定义

> 本条第 1 版被我判为严重，复核后**降档为普通**：它不会导致实现错误或数据丢失，只是观感上的小歧义，且有明显默认（去重更好）。内容保留在下方 P0。

## 普通问题

| # | 问题 | 锚点 | 修复意见 |
| --- | --- | --- | --- |
| P0 | 冷却文本是否参与"相邻去重"未定义（连续两次点击可能同一句） | `specs/pet-favor/spec.md` R1（去重只覆盖等级文本）vs R3（冷却集合"随机取一条"） | 推荐在 R3 补"同样相邻去重"（观感更好）；亦可明确"不去重" |
| P1 | **全部 53 个 scenario 无自动化测试**（证据不足：缺"可执行断言"，实现阶段补） | `specs/*/spec.md` | 第 7 步按 scenario 逐条落测试；本步登记风险 |
| P2 | 挂机奖励的"互动重置计时"在 spec 有、design 的 tick 决策里没提 | `specs/pet-economy/spec.md` R2 vs `design.md` D-3 | design D-3 补一句"互动时把 `lastAfkAt` 推到 now" |
| P3 | 面板是否显示好感等级悬而未决（Q13 口径 = 不显示） | `design.md` D-8 与 `## Open Questions` Q-1 | 保持不显示；若用户要，改 D-8 一处 |
| P4 | "软萌治愈 + 偶尔小俏皮"没有可验收判据（风格靠人工） | `specs/pet-favor/spec.md` R4 只约束数字/时间/属性名 | 接受：硬约束已可测，风格由人工抽检 |
| P5 | 100 条文本在满级后约 300 分钟开始重复 | `notes/texts.md`、`design.md` R2 | 接受并登记；后续可扩池（结构支持任意条数） |
| P6 | `pet-vitals` 的 4 条 REMOVED 不带 scenario（官方格式允许，但严格校验器可能报"requirement 缺 scenario"） | `specs/pet-vitals/spec.md` | 保持现状（REMOVED 只写标题与理由），若将来 CLI 报错再补"删除后行为"的 scenario |

## 一般建议

| # | 建议 |
| --- | --- |
| A1 | 阈值表（0/20/50/90/140/200/280/380/500/650）建议实现时抽成单一常量数组 + 名称数组，便于一次性调整（design D-5 已如此描述） |
| A2 | 冷却文本 6 条在 1 小时冷却下"每天都会重复看到"，可考虑扩到 8–10 条（不阻塞） |
| A3 | 迁移时建议把"三属性被丢弃"写进诊断位一次（可观测性），design D-7 已提"记录一条诊断"，实现时落实 |
| A4 | `notes/texts.md` 的 106 条建议在实现时以 JSON/TS 常量注入，并由测试直接引用同一份数据（避免"测试里抄一遍文本"） |

## 九个维度逐条结论

| 维度 | 结论 |
| --- | --- |
| 互相冲突 | **有 1 处**（S1：关窗期是否计成长，spec 与 design 均未裁定，属"共同缺口"而非互相矛盾）；其余无冲突 |
| 需求遗漏 | **有 2 处**（S2 冷却文本去重；P2 挂机计时的互动重置在 design 缺失） |
| 不可验收 | 无（所有数值/时长/阈值均可写成断言；风格项 P4 已单列） |
| 与宿主不符 | **无**——design 只用到 `api.settings`（`set`/`get`）、`api.timer`（整数秒 `setInterval`/`setTimeout`）、`progress` 的 `max`、`status`，均在 `docs/extension-api/api-reference.md` 与 `manifest-reference.md` 的 `contributes.settings` 小节内；未越权、未新增字段类型 |
| 权限与安全 | **无**——扩展是受信代码（ADR-0015），不联网、不读凭据；唯一落盘是本地存档 |
| 数据语义与迁移 | **有 1 处需补**（S1 的时间语义）；字段可空性、越界归一、损坏存档降级已在 `pet-values` R4 与 `design.md` D-7 覆盖 |
| 行为冲突 | **无**——不占命令 id、不占导航位、不注册 App 卡片（沿用 v1 的"后台扩展"定位） |
| 兼容与异常 | **有 1 处**（P6 REMOVED 无 scenario 的格式风险）；平台差异不涉及（Windows 单平台浮层，沿用 v1） |
| 可维护性 | **无阻塞**——不新增运行期依赖（运行时零依赖），写法与 v1 及 rdp/webapp 基线一致 |

## 已核对的 API / 字段章节

| 引用 | 核对结论 |
| --- | --- |
| `api.settings.get` / `api.settings.set` | `docs/extension-api/api-reference.md` 的 `api.settings` 小节存在，签名一致 |
| `api.timer.setInterval` / `setTimeout` / `clear*`（整数秒 1–86400） | `docs/extension-api/api-reference.md` 的 `api.timer` 小节存在；`api.timer` 只收整数秒的限制与 design D-3 的 `ceil(轮长/1000)` 一致 |
| `contributes.settings.fields`（`boolean`/`progress`/`status`）与 `progress.max` | `docs/extension-api/manifest-reference.md` 的 `contributes.settings` 小节 + `docs/extension-api/themes-settings.md` 的字段类型说明；`progress` 会把 `cur` 钳到 `[0,max]` 且不渲染 description ⇒ design D-8 的"另用 `status` 行展示精确好感"是必要的 |
| `api.overlay`（create/destroy/setPosition） | 仅沿用 v1 行为，本次不改；`docs/extension-api/api-reference.md` 的 `api.overlay` 小节存在 |
| 主题 token（`--bg-panel`/`--fg`/`--fg-dim`/`--fg-bright`/`--border`/`--hover-bg`/`--font-size`/`--font-size-sm`） | 全部在 `docs/extension-api/themes-settings.md` §「Token 全量参考」的 25 个 token 内 |
| 白色描边/白色焦点环 | 属 v1 用户明确裁定（Q17 + R53），非新造 token；`docs/extension-api/themes-settings.md` 允许"图标描边"这类扩展自有视觉需求 |

## 未决项

| # | 内容 | 谁回答 | 阻塞 |
| --- | --- | --- | --- |
| 1 | S1：关闭显示期间是否计入成长值 | 用户（本步门禁一并定） | 阻塞实现（**必须**定） |
| 2 | S2：冷却文本是否相邻去重 | 用户（可默认"去重"） | 阻塞实现（轻度） |
| 3 | P3：面板是否显示好感等级 | 用户 | 不阻塞 |

## 本步之后的修订记录（用户裁定后已落回 spec/design）

| 项 | 用户裁定 | 落点 |
| --- | --- | --- |
| S1 关闭显示期间是否计成长 | **不算**（销毁窗口时把上次结算时间推到当时） | `specs/pet-values/spec.md` R1 补句 + 新增 scenario「关闭显示期间不涨」；`design.md` D-3 补两条细节 |
| P0 冷却文本是否相邻去重 | **去重**（与等级文本一致） | `specs/pet-favor/spec.md` R3 补句 |
| P2 互动重置挂机计时 | **要**（design 侧原本缺失） | `design.md` D-3 补两条细节 |
| P3 面板是否显示等级名 | **显示等级名**（仍不显示数字） | 新增 `specs/pet-interaction` 的「面板 MUST 显示当前好感等级名」requirement（+2 scenario）；`design.md` D-8 与 UX 流程同步改写 |
| P5 文本重复 | **每级扩到 12 条（共 120 条）** | `notes/texts.md` 重写为 10×12 + 冷却 8 条；`specs/pet-favor` R1 的数量口径同步 |
| A2 冷却文本条数 | **扩到 8 条** | `notes/texts.md` 冷却集合 8 条；`specs/pet-favor` R3 同步 |
| R4 时间词正则 | 发现原口径误把"天"当时间词（"今天/明天"会被误杀）⇒ 改为只禁 `分钟/小时/秒`，并显式允许"今天/明天/每天" | `specs/pet-favor` R4 与其 scenario 的正则同步 |

**修订后规格规模**：新增 requirement **25 条**、删除 4 条、scenario **57 个**；文本池 **120 + 8 = 128 条**。

**证据不足项（已由用户裁定接受）**：57 个 scenario 暂无自动化测试，作为已知项带入第 6/7 步，由开发阶段按 scenario 逐条落实（见 P1）。

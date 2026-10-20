# 交付归档索引 · UID-20261017104500-宠物成长与好感

| 项 | 值 |
| --- | --- |
| UID | `UID-20261017104500-宠物成长与好感` |
| change-id | `pet-v2-growth-favor` |
| 扩展 | `pet`（displayName：宠物；author：chenzhi） |
| 版本 | **2.0.0**（v1.0.2 → v2.0.0，数据模型破坏性变更） |
| 归档时间 | 2026-10-17 |
| 当前阶段 | **九步链已完成**（init → grill → proposal → design → validation → task → dev → check → ship） |
| 交付物 | `out/pet-2.0.0.oix`（18 条目，1,661,747 B，SHA-256 `DF05BC9739D66D2361F3C07842AA7ACDABA611843FDFBAA5F080CFFDBE5F83C2`） |
| 依赖宿主 | `apiVersion >= 2` ⇒ obox v1.0.16 起（本次未改宿主 API 面） |
| 发布 | 扩展仓 `obox-org/pet`：tag **v2.0.0** + release |
| 归档方式 | 工具归档为**手工移动**（`openspec` CLI 未安装）⇒ `openspec/changes/archive/2026-10-17-pet-v2-growth-favor/` |

**双向映射（三方一致）**：`.openspec.yaml` 的 `uid: UID-20261017104500-宠物成长与好感` ↔ 本目录名 ↔ `change-id: pet-v2-growth-favor`（归档目录名 `2026-10-17-pet-v2-growth-favor`）。

## 本次改了什么（一句话）

去掉会掉值的三属性（饥饿/清洁/心情），换成**只涨不跌的成长值 + 好感值**：喂食/洗澡各 +1 成长 +1 好感并**共享 10 分钟冷却**、点击 1 小时 1 次 +1 好感、成长每小时 +1；好感 **10 级**（初次见面 0 → 命定相伴 650，满级后继续累加不封顶）、每级 **12 条**文本共 **120 条** + 8 条冷却文本，**每 5 分钟**说一句且只能看到"当前等级及以下"；**取消打盹**；面板从三枚图标改为**两枚 + 一行只读等级名**（不显示数字）；设置页 6 字段 / 5 逻辑行（含**好感精确值**单独一行——宿主会把进度条钳到 650）。

## 三档结论摘要（`notes/check.md`）

| 档位 | 计数 | 关键条目 |
| --- | --- | --- |
| **严重** | **0**（第 1 轮 1 条，第 2 轮已关闭） | S-1：好感 >650 后设置页看不到真实值 —— 已由修复卡 07 补 `pet.favorExact` status 行 + spec 同步 + 2 条新测试关闭 |
| **普通** | **12** | P-1/P-2/P-3（计数口径笔误，随第 2 轮 spec 修正解决）｜P-4/P-5（spec 内部两处措辞：冷却文本 6 vs 8、`playing` 轨与"删玩耍状态条目"的表述）｜P-6（`pet-vitals` 的 REMOVED 标题与 v1 归档不逐字对应；v1 另有 2 条与 `pet-growth` capability 未在 delta 中处置）｜P-7/P-10/P-11（**证据不足**：manifest 校验已部分补上；无实机验证；无组件挂载级测试——用户已裁定接受登记）｜P-8（`PetBubble.vue` 5 处写死色值，不在本次改动面）｜P-9/P-12（tasks.md 未同步 R58 的跨卡改动） |
| **一般建议** | **8** | 全部登记不外理（含"5 个局部常量可搬进 constants.js"等 v2.0.1 级别的可选清理） |

## 本归档内容

`index.md`（本文件）+ `proposal.md` / `design.md` / `tasks.md` / `specs/**`（7 个 capability，23 条新增 + 4 条 REMOVED、56 scenario）/ `notes/{grill,validation,dev,check,texts,ship}.md` + `notes/tasks/01..07`（6 张实现卡 + 1 张修复卡）。

**`notes/dev.md` 是门槛原始输出的唯一留存**（7 张卡的回执与四项门槛的复跑输出都在里面）；`notes/check.md` 是两轮验收的完整判定（含 83 行逐条判定与第 2 轮复验）。

## 未实机验证的项（如实登记，随发版后由用户验收）

1. v2 的数值/文本/面板未在真机跑过（自动化测试 286 条覆盖逻辑与页面源码断言）。
2. 无组件挂载级测试（`PetPanel`/`App` 只有源码断言，没有真正 mount 渲染）。
3. 满级（命中 650 与更久）后的长周期行为未观察（需要真实使用时间）。

# 02 · host-api-surface（宿主：overlay API 面 + progress 字段类型 + apiVersion）

| 字段 | 内容 |
| --- | --- |
| **目标** | 在宿主把**类型面**一次定死：新增 `api.overlay` 命名空间（`create` / `destroy` / `setMouseThrough`，且**按扩展 id 限定作用域**）、设置字段类型增加 `progress`（含 `max`，默认 100）、overlay 请求/响应的共享类型、根 `package.json` 的 `apiVersion` 递增（使老宿主按既有门槛拒绝加载本扩展）。 |
| **输入** | `proposal.md` `## What Changes` 第 8 条（overlay 能力六小条，含作用域安全约束）与 `## Impact` 宿主第 3 条；`design.md` D-1（`api.overlay.create` 参数）、D-2（`setMouseThrough` + 作用域安全）、D-12（后台扩展、不注册卡片）；`specs/pet-window/spec.md` Requirement 1 与「本扩展 SHALL 是后台扩展」；`specs/pet-settings/spec.md` Requirement 2/3；锚点：`src/api/types.ts:163-170`（`api.app` 现仅 `register`/`onMessage`）、`src/api/contributions.ts:97-137`（字段类型与 `SettingsPage`）、`docs/extension-api/manifest-reference.md:20,300`（`apiVersion` 门槛）。 |
| **文件所有权** | `src/api/types.ts`、`src/api/contributions.ts`、`src/shared/types.ts`、`package.json`（宿主根，仅 `apiVersion`）、`test/host-api-surface.test.ts`（新建）。**不含** `src/main/**`、`AppWindow.vue`、`SettingsView.vue`、`scripts/validate-manifest.mjs`（分属 03/04）。 |
| **验收命令** | 宿主根：`npm run typecheck`（0 error）、`npm run lint`（0 error）、`npm test`（全绿，含新测试）；新测试须断言：① `progress` 是合法字段类型且 `max` 可缺省为 100；② `api.overlay` 三方法的类型签名与"只能操作自己创建的 overlay"的作用域校验入口存在；③ `apiVersion` 已递增（与 `package.json` 一致）。 |
| **依赖与阻塞** | 无（组 1 起点）。**阻塞** 03、04、05、07、09（都要按本卡定下的类型面实现/声明）。 |
| **并行组** | 组 1 |

## 负向自检（不改实现）

- 用非法参数喂类型/校验函数并断言被拒（`assert.throws` 或返回错误）：`api.overlay.create` 缺 `id`/`url`、`width|height` ≤ 0、`anchor` 非枚举值、`progress` 字段的 `max` ≤ 0 或非数字。**不采用**"临时把校验改坏再跑"的写法。

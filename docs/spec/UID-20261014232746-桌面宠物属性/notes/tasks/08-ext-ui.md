# 08 · ext-ui（扩展：Vue 子应用——精灵渲染 / 悬停面板 / 气泡 / 命中测试）

| 字段 | 内容 |
| --- | --- |
| **目标** | 实现宠物窗体内的页面：按 `pet.json` 的几何与 `tracks` 逐帧渲染精灵（CSS `background-position`）、按 D-4 映射与优先级切轨、悬停面板（成长值 + 等级名 + 库存 + 三属性小条 + 喂食/洗澡/玩耍三按钮）、气泡反馈、指针命中测试并上报 `pet.hit`、长轮询订阅 `pet.subscribe` 保持状态同步；页面自身 `html,body{background:transparent}`；**不接主题桥**（删除脚手架 `app/theme.js` 与 `style.css` 里的 `var(--token)` 残留）。 |
| **输入** | `specs/pet-sprites/spec.md`（几何/`tracks`/缺帧取模/销毁即停帧循环）、`specs/pet-interaction/spec.md`（悬停面板内容、点击冷却文案、三互动增量）、`specs/pet-window/spec.md`（空白区完全透出桌面的像素判据、不可 resize）；`design.md` D-1（220×460、精灵区 192×208 贴底居中、面板预留区 240px）、D-3（通道表与 `PetStateView`、长轮询重订阅）、D-4（状态表/优先级/帧时长/`sleep` = idle×1.5）、D-6（面板配色与密度）、D-11（**禁用 `backdrop-filter`**、透明五处、开 DevTools 会变不透明）、`## UI 视觉规范`（色值表、布局、七条硬约束落实句、`prefers-reduced-motion`）、`## UX 与交互流程`（键盘可达性：Tab 顺序、焦点落点与归还、Esc 只关面板）；锚点：`docs/extension-api/api-reference.md:176-187`（iframe 只能 `parent.postMessage`、**不要用内联 onclick**（CSP 会拦）、页面内无 `api` 对象）、`:27`（子窗口会重跑入口顶层代码）。 |
| **文件所有权** | `extensions/pet/app/**`（`App.vue`、`main.ts`、`index.html`、`style.css`、`components/**`；**删除** `app/theme.js`）、`extensions/pet/vite.config.ts`、`extensions/pet/tsconfig*.json`（如需）。**不含** `index.js`/`lib/**`/`test/**`（卡 07）、`assets/**`（卡 06）。 |
| **验收命令** | 在 `extensions/pet`：① `npm run build`（`vite build`）成功且产物落 `dist/`；② `npm run typecheck`（若脚手架提供）0 error；③ 构建产物 grep 断言：**不含** `backdrop-filter`、**不含** `installThemeBridge`、**不含**内联 `onclick=`；④ `dist/index.html` 引用的 JS/CSS 均为相对路径（`app://` 下可加载）；⑤ 页面级样式含 `html,body{background:transparent}`；⑥ 帧循环在 `beforeunload`/`unmount` 时 `cancelAnimationFrame`（代码审查 + 构建产物含对应调用）。实机观感与像素判据归 **卡 11**（本卡不做实机验收）。 |
| **依赖与阻塞** | 依赖 **06**（图集与 `pet.json`）与 **07** 的消息契约（design 已固定，可并行开发；联调在卡 11）。**阻塞** 10、11。 |
| **并行组** | 组 3 |

## 负向自检（不改实现）

- 用**非法/缺失输入**断言页面不崩：`pet.json` 缺 `tracks`（回退 250ms）、`frames` 缺项或为 0（按 1 帧处理不越界）、`PetStateView` 字段缺失或为 `NaN`（按 0 渲染）、图集 404（显示 D-9 的"图集加载失败"占位而不是白屏）。以上用构建期可静态检查的断言 + 卡 11 的实机复核，**不临时改坏实现**。

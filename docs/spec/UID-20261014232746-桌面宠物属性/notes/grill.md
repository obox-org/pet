# grill — 桌面宠物扩展 `pet`（右下角无边框透明窗体 + 饥饿度/清洁度/心情养成）

> 本文件按 `obox-ext-grill` 的固定结构维护：**每问一次就地追加**，不攒到最后补写。
> 关闭方式三种：`用户答复` / `代理查得事实`（附出处）/ `显式延后`（写明延后到哪一步、谁承担风险）。
> 结构说明：Q1–Q8 为首轮；**Q9–Q11 为增补轮**（R29：用户实机反馈后把拖动/踱步/隐藏召唤并入本轮）。

## 逐条问答摘要

### Q1（数据来源与语义 · 动画状态由什么驱动）

- 问题：参照仓库（`dsh-pet`）的 9 态动画由"模型会话活动（turn/step/tool 事件）"驱动，而 obox 扩展拿不到 LLM 会话事件（已查 `src/api/types.ts`，无 session/turn/tool 类事件）。这只宠物的动画状态由什么驱动？
- 结论：**A 纯生活模拟驱动**（用户答复）。状态只由"三属性 + 交互"决定：正常时 idle 循环；喂食/洗澡/玩耍播放对应动画；饥饿度或清洁度过低 → 用 waiting/failed 类形态表达"需要照顾"；心情低 → 低落态；点击 → 反馈动画。**不接任何会话事件**，也不需要为此新增宿主事件能力。

### Q2（范围 / 权限与安全 · 宿主能力做几项）

- 问题：需求绕不开宿主改动。三项能力（① 透明置顶窗体、② 扩展自显隐窗体、③ `progress` 进度条字段）做几项？
- 结论：**A 三项全做**（用户答复），并追加一条硬约束：**"隐藏"就是关闭（销毁）窗体，而不是 `hide()`**，目的是**降低 CPU 占用**——即 toggle 关 ⇒ 销毁 `BrowserWindow`（连带停掉该窗口的渲染与动画帧循环），toggle 开 ⇒ 重新创建。用户原话："A，隐藏就是关闭窗体，而不是隐藏窗体，降低cpu使用率"。
- 对实现的约束（写进后续 proposal/design）：
  - 宿主侧的窗体能力必须支持**销毁后重建**且状态不丢（宠物属性状态由扩展入口持有/持久化，不能只活在窗口里）；
  - 窗体关闭时，**驱动动画的 rAF/定时器必须随窗口一起停**（这是"省 CPU"的判据，可实测：关窗后主进程/渲染进程 CPU 回落）；
  - 扩展侧不得用"窗口常驻 + 内容隐藏"的折中方案。

### Q3（数据来源 · 形象素材与许可证处置）

- 问题：宠物形象用哪一套？（参照仓库自带鲸鱼娘图集 1.47 MB，但其许可证信息初看自相矛盾：LICENSE 文件 BSD-3 / package.json Apache-2.0 / README BSD-3）
- 结论：**用户用第三方 AI 工具自制**（用户答复，原话："告诉我怎么使用第三方AI工具来制作，主体的形象和动作、状态都需要分别提供一个prompt"）。**不取参照仓库图集**，许可证矛盾随之规避。
- 图集契约（本问一并定下，prompts 见附录 A）：**9 行 × 6 列**、每格 **192×208**、整图 **1152×1872**、**透明背景**、角色在每格位置与比例一致；行序 = 0 idle / 1 eating / 2 bathing / 3 playing / 4 petted / 5 hungry / 6 dirty / 7 sad / 8 sleep。
- 制作流程（用户执行，代理在 dev 步提供切格/拼网格脚本）：一次出一条 6 帧横条（主体 prompt 逐字重复以锁一致性）→ 去背 → 脚本切 6 等份 → 按行序拼成网格。
- 风险登记：AI 出图的角色一致性不保证，若 9 条 strip 之间角色漂移，需要在 design 步决定"降级为更少状态"或"重出图"；该风险由用户承担（素材由用户产出）。

#### Q3 修订（design 步门禁时用户改判）

- 用户裁定："**宠物先用 dsh-pets 里的**"。即：**本轮内置素材改为直接采用上游 dsh-pet 的鲸鱼娘图集**（`packages/dsh-pet/assets/whale/spritesheet.webp` 1,544,154 B + `pet.json` 838 B），AI 自制**延后为可选替换**（附录 A 的契约与 prompts 保留备用）。
- 由此产生的连锁修订（均已回写产物）：
  1. **图集几何改为 manifest 驱动**：上游是 **8 列 × 9 行、每格 192×208、整图 1536×1872、`frames=[6,8,8,4,5,8,6,6,6]`**，与本问原定的"9×6 / 1152×1872"不同 ⇒ `specs/pet-sprites/spec.md` 的 Requirement 1 已重写为"几何由 `pet.json` 声明、渲染不得硬编码"。
  2. **状态→动画轨改为语义就近的临时映射**（上游行名是 idle/running-right/running-left/waving/jumping/failed/waiting/running/review，没有 eating/bathing/playing/sleep）：eating→jumping、bathing→waving、playing→running、petted→waving、hungry→waiting、dirty→review、sad→failed、sleep→idle 慢放 ×1.5；`running-left/right` 本轮不用（宠物不位移）。
  3. **帧时长以 `tracks` 为准**（idle 400/400/500/400/400/500ms 等），原 design 的"默认 120ms/帧"降级为"某轨未声明 durations 时的回退值 250ms"。
  4. **新增许可证义务**：上游 `LICENSE` 是 BSD-3-Clause（© 2026 zhu1090093659），但其 `package.json`/npm 元数据写 Apache-2.0 ⇒ 按**较严的 BSD-3** 履行：随附 `assets/whale/LICENSE` 原文 + README 写明出处与"未获背书"。已写为 `pet-sprites` 的一条 requirement。
- 原 Q3 结论（AI 自制）保留在上文作为历史记录，**以本修订为准**。
- 许可证"自相矛盾"后经卡 06 查证为**分层声明**（仓库根 Apache-2.0 / 包级 BSD-3 / 素材自身声明 BSD-3），见 `assets/whale/PROVENANCE.md` §7 与 dev.md R3。

### Q4（数据来源与语义 · 结算时机）

- 问题：饥饿度/清洁度/心情的衰减与"挂机收益"在什么时候结算？
- 结论：**A 惰性结算，仅计 obox 运行期间**（用户答复）。实现口径：
  - 持久化记 `lastSettledAt`（上次结算时刻）；每次 tick / 每次读取时按 `now - lastSettledAt` **一次性补算**衰减与挂机收益，再把 `lastSettledAt` 推进到 `now`；
  - **系统休眠 / 主线程卡顿**期间定时器不触发 ⇒ 靠时间差补上（这是选惰性而非纯定时器的理由）；
  - **obox 完全关闭的那段不算**：启动时把 `lastSettledAt` 重置为当前时刻（不追算离线时长）；
  - 衰减与挂机收益用**同一个结算时钟**，避免两套时间源漂移。

### Q5（数据来源与语义 · 挂机定义）

- 问题："每挂机 20 分钟 +1 小鱼干 +1 沐浴泡泡"里的"挂机"怎么算？
- 结论：**A 运行 + 窗体开启才算挂机**（用户答复）。即挂机时长 = obox 运行且宠物窗体存在的连续时长，与 Q4 同一结算时钟；窗体被 toggle 销毁期间不累计。

### Q6（数据来源与语义 · 道具经济）

- 问题：喂食/洗澡/玩耍是否消耗小鱼干/沐浴泡泡？
- 结论：**A 喂食消耗 1 小鱼干、洗澡消耗 1 沐浴泡泡、玩耍不消耗**（用户答复）。道具不足时该互动**不可用**（按钮置灰 + 气泡提示），不做"负库存"或"赊账"。库存上限沿用参照仓库思路（小鱼干 20），沐浴泡泡上限同 20（design 步可复核，若用户另说从其说）。

### Q7（前端与后端交互 · 成长值呈现）

- 问题：成长值/等级在哪里给用户看？（设置页已限定只有 toggle + 三行属性）
- 结论：**A 悬停面板**（用户答复）。鼠标悬停宠物时弹出小面板：成长值（数值 + 等级名）+ 小鱼干/沐浴泡泡库存 + 三属性简值。面板的视觉与布局归 `obox-ext-design`。
- 消息通道（代理查得事实，一并关闭"前端与后端交互"维度）：子窗口（宠物窗体）里的页面**没有 api 对象**，与扩展入口的通信走 `api.app.onMessage` + `postMessage` 消息桥（F8）；属性/库存/成长值的**权威状态在扩展入口**（主窗口插件函数内），子窗口只做渲染与把交互事件回传。

### Q8（交付与分发 / 兼容与迁移）

- 问题：怎么交付？老宿主（没有三项新能力）怎么办？
- 结论：**A `.oix` 分发 + 老宿主拒绝安装**（用户答复）。流程与 `rdp` / `webapp` 一致：commit → tag → release（附 `.oix`）；README 与 manifest 写明**最低宿主版本**（= 带三项新能力的 obox 版本，宿主发版后回填具体号）。老宿主上**不做运行时降级**，直接拒绝安装/激活并给明确提示。

### Q9（增补轮 · 范围 / 前端与后端交互 · 拖动换位）

- 问题：拖动的范围与持久化怎么定？（事实：页面不能自移窗体 ⇒ 宿主需新增 `api.overlay.setPosition(id,x,y)`；位置存扩展 `state.json`；`anchor` 退化为无存档时的默认值）
- 结论：**A 任意位置 + 持久化 + 钳主显示器工作区**（用户答复）。不越界、不盖任务栏；**不加"重置位置"按钮**（想回右下角就拖回去）；多显示器只支持主显示器（副屏为 Non-Goal）。

### Q10（增补轮 · 数据来源与语义 · 踱步形态）

- 问题：`running-left/right` 两条轨怎么用？（事实：窗体 220 宽、精灵格 192 宽 ⇒ 窗体内仅 28px 位移；真"来回走"只能加宽窗体或移窗体）
- 结论：**C 原地踏步**（用户答复）。新增**自发"原地小跑"状态**：idle 且指针不在窗体内、非拖拽、非隐藏时，随机间隔来一段 `running` 轨的 1–2 秒 burst；**`running-left/right` 本轮不使用**，在 spec 里显式写明（避免后人误以为漏做）。

### Q11（增补轮 · 前端与后端交互 · 隐藏/召唤）

- 问题：隐藏后的形态与持久化怎么定？
- 结论：**A 同窗体小召唤按钮 + 隐藏态持久化**（用户答复）。面板加"隐藏"按钮 ⇒ 窗体**不销毁**，只渲染约 96×36 的"召唤"胶囊（原位置右下角），**停掉 rAF**（CPU≈0；结算时钟照跑），其余区域继续穿透；点胶囊 ⇒ 恢复。隐藏态写 `state.json`（重启仍隐藏）；**设置页 toggle 关→开 清除隐藏态**（设置优先，避免"toggle 开着却找不到宠物"）。**零宿主改动**。

### Q12（增补轮 · 数据来源与语义 · 反馈文案口径）

- 问题：用户要求"点击宠物的文本要和 dsh-pet 保持一致，且禁止显示任何有关时间的文本（例：过 5 分钟再触摸）"。边界在哪？
- 结论：**A 只禁带数字/时间单位的文本**（用户答复）。dsh-pet 原文中无数字的口语（"晚点再喂～""多陪我工作一会儿吧～"）保留（"逐字一致"优先）。定稿文案表：
  | 情形 | 文案 | 来源 |
  | --- | --- | --- |
  | 摸头成功 | `咕噜咕噜～被摸摸好舒服！` | 上游 `affinity.ts` 逐字 |
  | 摸头冷却 | `摸过头啦，让鲸鱼娘歇口气～` | 上游逐字（本就无时间） |
  | 喂食成功 | `呜哇！小鱼干好好吃！` | 上游逐字 |
  | 喂食冷却 | `吃饱啦，晚点再喂～` | 上游逐字 |
  | 无小鱼干 | `没有小鱼干了，多陪我工作一会儿吧～` | 上游 `ledger.ts` 逐字 |
  | 无沐浴泡泡 | `没有沐浴泡泡了，多陪我工作一会儿吧～` | 仿上游句式（上游无洗澡），无数字时间 |
  | 洗澡/玩耍成功 | `洗干净啦（清洁度 +15）` / `好开心（心情 +5）` | 保留本轮原文（无时间文本；数字为属性增量非时间） |
  | 打盹提示 | `打盹中（Zzz）` | 保留（无时间文本） |
- 连带废止：本轮原冷却文案「再摸也不会更开心啦（还需 X 分钟）」与「没有小鱼干了（挂机 20 分钟可得 1 条）」**含数字时间 ⇒ 全部作废**，涉及 design D-9、`lib/constants.js` 的 TEXT、卡 07 测试断言、卡 08 页面文案表、README 引用处，均在增补轮一并改。

### Q13（增补轮 · 前端与后端交互 / 数据来源 · 面板内容与文案数字）

- 问题：用户追加两条约束：① "心情加多少类似的文本也不能有"（反馈文案禁属性增量数字）；② "鼠标悬停在宠物上的面板，不显示心情等属性"。
- 结论（用户答复，直接生效）：
  1. **文案禁数字**：所有用户可见文案 MUST NOT 含「数字 + 时间单位」（Q12）与「属性增量数字」（`+5`/`+15`/`-1` 等，Q13）。洗澡/玩耍成功文案因此改为无数字自拟句（`泡泡好舒服～洗干净啦！` / `玩得好开心！`）；摸头/喂食五句 + 无鱼干句仍与上游逐字一致（它们本就无数字）。
  2. **面板不显示三属性**：悬停面板只渲染 成长值 + 等级名 + 库存（小鱼干/沐浴泡泡）+ 四按钮（喂食/洗澡/玩耍/隐藏）；**三属性只在设置页**以进度条 + `{cur}/100` 呈现。设置页的 `{cur}/100` 是用户最初明确要求的**值显示**，不属"反馈文案"，不受禁令影响。
- 连带修订：`specs/pet-interaction` 的面板 requirement 去掉"三属性简值"并加" MUST NOT 显示三属性"；新增文案 requirement（含全量正则扫描 scenario）；design 的 UI 视觉规范删掉面板属性小条色值行与属性行布局；Q7 的结论（面板含三属性简值）**被本问取代**。

### Q15（增补轮二 · 前端与后端交互 · 面板图标化与隐藏入口）

- 问题：用户追加"喂食洗澡玩耍使用 icon 替代，取消面板里的隐藏，三个 icon 放在一行"。取消面板隐藏按钮后，Q11 的隐藏态与召唤胶囊就失去入口（设置页 toggle 是"销毁窗体"，不是隐藏）⇒ 隐藏功能何去何从需要用户裁定。
- 结论：**B 彻底取消隐藏功能**（用户答复）。三个连带裁定：
  1. **面板互动按钮改图标**：喂食/洗澡/玩耍 = **三枚内联 SVG 图标、横向同一行**（不用文字标签、不用 emoji、不用图标字体——运行时零依赖）；每枚有 `aria-label` + `title` 中文动作名；道具不足 = `opacity .45` + `aria-disabled`。
  2. **移除隐藏/召唤全部实现与规格**：`state.json` 的 `hidden` 字段、`PetStateView.hidden`、`pet.interact` 的 `summon`/`hide` 两个 kind、召唤胶囊渲染与样式、隐藏态 hit-test 分支与 rAF 停摆、`TEXT.summon`/`TEXT.hiddenBlocked`、设置 toggle 关→开清隐藏态的跳变逻辑，以及 `test/actions-hidden.test.js` 的 11 条用例（改为"断言这些通道/字段已不存在"的负向用例）。**Q11 的结论被本问取代**（其"同窗体胶囊"方案与两个被否决备选作为历史保留在 design D-15 的撤销说明里）。
  3. **隐藏语义回到 Q2 原意**：只由设置页 toggle 承担 = **销毁窗体**（真省 CPU）；不再有中间态。
- 向后兼容：旧存档可能已写入 `hidden:true` ⇒ `deserialize` MUST 忽略该废字段（不报错、不触发备份重建）。

### Q16（增补轮三 · 数据来源与语义 · 每 10 秒随机表演）

- 问题：用户要求"每间隔 10 秒钟播放一次动画，随机动作播放"。随机范围怎么定？（它牵动刚验收的 trot 机制与状态指示语义）
- 结论：**A 只随机"表演型"动作，状态型不参与**（用户答复）。落定口径：
  1. **随机集**（"表演型"，7 项）= `eating`(row4 跳) / `bathing`(row3 挥手) / `petted`(row3 挥手) / `playing`(row7 原地跑) / `trot`(row7 原地跑) / **`run-left`(row2)** / **`run-right`(row1)**；
     理由：`hungry`(row6) / `dirty`(row8) / `sad`(row5) 与 `sleep` 是**状态指示**，随机出现会与真实数值脱节、稀释"看一眼就知道它需要什么"的设计 ⇒ 排除。
  2. **两轨终于用上**：`running-left/right` 此前因"不做位移"而空置；本次纳入随机集，**原地播放（不位移、不动窗体）**——它们只是"侧向跑的帧"，不改变 Non-Goal（仍不做沿屏行走/窗体内平移）。若实机观感别扭，移除它们只需从随机集里删两项（可逆）。
  3. **节奏**：每 **10 秒**触发一次，随机挑一条播**一轮**（约 1.4–1.6s），播完回落到当前状态判定；**不消耗道具、不改变任何数值、不弹气泡**。
  4. **trot 机制并入**：删除 Q10/Q14 的独立 trot 定时器（2–5 分钟那一套）——它已被 10 秒机制完全覆盖；`trot` 作为一个**状态条目**保留（就是"原地跑一轮"），由随机集调用。R40 的 `TROT_MAX_SEC < SLEEP_AFTER_SEC` 关系断言随之退役（10s ≪ 10 分钟，天然成立）。
  5. **打盹期间不播**（父代理默认口径，用户未反对）：`sleep`（连续 10 分钟无交互）时随机表演暂停，保持"睡着就该安静"；其余状态照播（含饥饿/脏/难过——它们的**姿态**偶发被表演动作短暂覆盖 1.5s，播完即回该姿态）。
  6. **优先级**：随机表演是**低优先级瞬时动作**（低于真实互动 eating/bathing/playing/petted）⇒ 用户互动可随时打断它；它不推进也不重置 `lastInteractAt`（不是用户交互，不能把 sleep 推后）。

### Q17（增补轮三 · 前端与后端交互 · 图标样式与面板开合）

- 问题：用户要求"面板里的 icon 使用 icon 按钮，背景色透明，白色线条，鼠标悬浮显示名称"+"面板在鼠标悬停或者鼠标在面板的时候显示，其他时候都会立刻关掉"。
- 结论（用户答复，四条一并生效）：
  1. **按钮底透明**：`.act` 不用底色（当前是 `linear-gradient(180deg,#7dd3fc,#38bdf8)` 青色渐变底）⇒ 改 `background: transparent`（`:focus-visible` 仍给焦点环，`:hover` 给极淡的白色叠加以示可点）。
  2. **线条白色**：图标 `stroke` 由 `currentColor`（当前解析为深色 `rgb(15,23,42)`）改为**白色**（`#ffffff`），在深色玻璃面板上可读。
  3. **悬浮显示名称**：把原生 `title`（约 1s 延迟、样式随系统）换成**即时浮层提示**（hover/focus 即显，内容 = 中文动作名，位于图标上方，玻璃底 + 白字）；`aria-label` **保留**（读屏可达性不变）。
  4. **面板开合**：显示条件 = **指针在宠物命中区 或 指针在面板上**；其它情况**立刻关闭**（无延迟、无淡出等待）。当前实现已基本满足（命中矩形含面板、`closePanel()` 即时），本次补齐两点：命中矩形在面板开启时**必须**含面板（保持）、关闭路径**不得**引入延迟（核掉可能的 CSS 过渡/延迟关面板）。
- 连带：面板不再有"隐藏"入口（Q15=B 已定）；本次不改面板信息结构（等级行 + 库存行 + 三图标行 + ✕）。

## 已查明的事实（供后续维度直接引用，不重复提问）

| # | 事实 | 出处 |
| --- | --- | --- |
| F1 | 扩展的 App 卡片是**运行时注册**的：`api.app.register({ id, name, version, author, description, icon, url, multiOpen, width, height })`；卡片被点开时由**宿主**调 `window.api.openAppWindow` → IPC `app:open-window` → `openChildWindow` | `extensions/pet/index.js:57-70`、`src/renderer/src/extensions/app/AppView.vue:52`、`src/preload/index.ts:25`、`src/main/appWindow.ts:45-94,122-124` |
| F2 | App 卡窗口**本来就是无边框**（`frame: false`），但**没有** `transparent` / `alwaysOnTop` / `skipTaskbar` / 初始坐标 | `src/main/appWindow.ts:64-80` |
| F3 | 扩展 API **没有**开/关自己 App 窗口的能力 | `src/api/types.ts`（`api.app` 仅 `register`/`onMessage`） |
| F4 | 设置页只能声明字段、**扩展不能自定义渲染**；字段类型仅 `text/number/boolean/select/directory/status`（+ `status` 上的 `modal`） | `src/api/contributions.ts:97-137`、`api-reference.md:299,310-318` |
| F5 | 持久化可用：`api.fs` 只读写**扩展自己的 data 目录**（相对路径、自动建目录、可 `watch`） | `api-reference.md:530,561-577` |
| F6 | 定时能力可用且以**秒**为单位：`api.timer.setInterval('tick', 60, cb)` | `api-reference.md:405-414` |
| F7 | 设置项可读写与订阅：`api.settings.register/get/set/onChanged`；写后设置页**当帧刷新** | `api-reference.md:250,290-332` |
| F8 | **子窗口里的页面没有 `api` 对象**，入口顶层代码会在每个子窗口重跑 ⇒ 副作用必须放进插件函数；子窗口交互走 `api.app.onMessage` + postMessage 消息桥 | `api-reference.md:27,183`、`guides-user.md:131-145` |
| F9 | 扩展形态已定：后台扩展（无卡片）+ overlay 窗体 + Vue 子应用 + 设置页 | `obox-ext-init` 第 3 步回执 + design D-12 |
| F10 | 上游宠物契约：一只宠物 = 目录 + `pet.json` + 图集（8 列 × 9 行，默认 192×208 格；行序 0 idle / 1 running-right / 2 running-left / 3 waving / 4 jumping / 5 failed / 6 waiting / 7 running / 8 review）；鲸鱼娘图集 `spritesheet.webp` 1536×1872 | 上游 `README.zh.md`「宠物契约」节 + 卡 06 实测 |
| F11 | 上游许可证初看"自相矛盾"，**后经卡 06 查证为分层声明**（仓库根 Apache-2.0 / 包级 BSD-3-Clause / 素材自身声明 BSD-3） | 上游 `LICENSE`、npm 元数据、`assets/whale/PROVENANCE.md` §7（见 Q3 修订） |
| F12 | 消息桥按 **`appId`（卡片 id）** 找扩展 handler；单次请求 **60s 超时**；iframe sandbox **无 `allow-modals`** | `core/host.ts:788-794`（现 `resolveMessageExtId`）、`main/appWindow.ts` 60s 超时、`AppWindow.vue` sandbox |
| F13 | 窗体 220×460、精灵格 192×208 ⇒ 窗体内横向仅 28px 位移空间（Q10 的硬约束） | design D-1 + 卡 06 实测几何 |

## 已关闭

| 维度 | 关闭方式 | 结论 | 依据 |
| --- | --- | --- | --- |
| 用户与场景 | 用户答复 | 单人自用（author `chenzhi`）；装完 obox 后宠物常驻主屏幕右下角；典型路径 = 装扩展 → 右下角出现宠物 → 悬停看面板 → 喂食/洗澡/玩耍 → 设置页看三条属性 | 用户原始需求 + `manifest.author` |
| 痛点与现状 | 用户答复 | obox 无陪伴/养成类反馈；参照仓库 dsh-pet 是 DSH 插件模型（`__ModuleLoader__` + cordis bundle），与 obox 的 `.oix` 模型不通 ⇒ 按 obox 模型重做 | 用户"仿照我刚刚发你的仓库" + 对 dsh-pet 的分析 |
| 成功标准 | 用户答复 | ① 安装后右下角出现无边框透明窗体；② 点击/悬停有反馈；③ 三属性按给定速率衰减与恢复（上限 100，心情恢复上限 95）；④ 喂食 +5 饥饿、洗澡 +15 清洁、玩耍 +5 心情；⑤ 挂机 20 分钟 +1 小鱼干 +1 沐浴泡泡；⑥ 每 5 分钟点击一次 +1 心情；⑦ 成长值 +2/小时，心情每低 5 点则 -0.1/小时；⑧ 设置页 toggle + 三行进度条（`{cur}/100`、无描述）；**增补**：⑨ 拖宠物可换位且持久化；⑩ idle 时有自发原地小跑；⑪ 面板可隐藏、胶囊可召唤 | 用户原话逐条 + Q9/Q10/Q11 |
| 范围 | 用户答复 | 宿主能力：透明/置顶/不占任务栏/右下角窗体 + 扩展自创建/销毁窗体 + `progress` 字段 + **`setPosition`（增补 Q9）**；扩展侧：生活模拟状态机（Q1）、惰性结算（Q4）、道具经济（Q6）、悬停面板（Q7）、**拖动换位（Q9）、原地小跑（Q10）、隐藏/召唤（Q11）** | Q1/Q2/Q4/Q6/Q7/Q9/Q10/Q11 |
| 数据来源与语义 | 用户答复 | 动画由三属性 + 交互驱动（Q1）；结算 = 惰性、仅计运行期间（Q4）；挂机 = 运行 + 窗体开启（Q5）；喂食/洗澡消耗对应道具、玩耍不耗（Q6）；权威状态在扩展入口（F8）；**增补**：窗体位置 `{x,y}` 与隐藏态布尔持久化到 `state.json`，优先级 = 设置 toggle > 隐藏态 > 状态机（Q9/Q11）；原地小跑仅在 idle 且指针不在窗体内、非拖拽、非隐藏时触发（Q10） | Q1/Q4/Q5/Q6/Q9/Q10/Q11 + F8 |
| 权限与安全 | 代理查得事实 | 只需：自己的 data 目录读写（F5）、`api.timer`（F6）、设置读写（F7）、消息桥（F8）、宿主 overlay 四方法（create/destroy/setMouseThrough/**setPosition**，均按扩展 id 限定作用域）；不需凭据、不碰外部路径、不起子进程。失败隔离：扩展激活失败只标自身 `activationError` | F1/F5–F8 + Q2/Q9 |
| 前端与后端交互 | 用户答复 + 代理查得事实 | 界面 = overlay 窗体（宠物 + 悬停面板 + **隐藏态召唤胶囊**）+ 设置页（toggle + 三行 progress + 诊断位）；通道 = `api.app.onMessage` + postMessage（F8/F12）；成长值/等级/库存在悬停面板呈现（Q7）；**拖动经既有桥发 `setPosition` 请求，不新增通道**（Q9） | Q7/Q9/Q11 + F8/F12 |
| 兼容与迁移 | 代理查得事实 + 用户答复 | 新扩展**无存量数据可迁移**；`state.json` 带 `schemaVersion`，增补字段（位置/隐藏态）属 v1 内的加法（缺字段按默认值）；唯一兼容约束 = 依赖宿主 overlay 能力 ⇒ 声明 `apiVersion: 2`，老宿主拒绝加载（Q8） | Q8 + F2/F3/F4 |
| 可观测性 | 代理查得事实 | 控制台日志前缀 `[pet]`；状态栏项 `pet.status` 作一句话状态与诊断位 | `api-reference.md:299-318` + 仓库既有实践 |
| 交付与分发 | 用户答复 | `.oix` 分发 + commit → tag → release（附 `.oix`）；README/manifest 写最低宿主版本；不跟随宿主自动更新 | Q8 |

## 显式延后

| 维度 | 延后到 | 理由与承担者 |
| --- | --- | --- |
| 异常与重试 | `obox-ext-design` | 窗体打不开 / 持久化失败 / 结算越界的**用户可见表现与降级策略**属交互与文案设计；实现侧的幂等与重试口径随设计定稿。**增补**：拖动与踱步/隐藏的互斥、显示器变化后存档位置失效的回退，也在 design 增补段定。风险承担者：用户（不接受可在门禁回退本步补问） |
| 非目标 | `obox-ext-proposal` | 非目标清单随各问结论在 proposal 的 scope 节写死（见下）。风险承担者：用户（proposal 门禁可否决） |

**非目标清单（增补轮后定稿）**：不做副屏放置、不做窗体内平移/沿屏行走（`running-left/right` 空着）、不做面板改名（已被洗澡替换）、不做"重置位置"按钮、不做多宠物注册表、不做 Live2D/骨骼动画、不做离线（关闭期间）衰减与收益、不做声音、不做宠物跟随鼠标。

## 未决项

（空。12 个维度全部归入"已关闭"或"显式延后"。）

## 附录 A · AI 出图契约与 prompts（Q3 交付物）

> **状态：备用契约，本轮不采用。** 用户在 design 步改判"宠物先用 dsh-pets 里的"（见上文「Q3 修订」），本轮内置素材为上游鲸鱼娘图集（8 列 × 9 行 / 192×208 / 1536×1872）。以下 9×6 契约与 prompts 仅在**将来替换为 AI 自制图集**时启用（design OQ4）；启用时须同步把 `specs/pet-sprites/spec.md` 的几何与映射改回 1:1 行序，并按 D-10 删除上游 LICENSE 与出处声明。

**契约**：9 行 × 6 列、每格 192×208、整图 1152×1872、透明背景、角色每格位置与比例一致。
行序：0 idle / 1 eating / 2 bathing / 3 playing / 4 petted / 5 hungry / 6 dirty / 7 sad / 8 sleep。

**主体形象 prompt（每条状态 prompt 逐字带上以锁一致性）**：

```
A cute chibi whale-girl mascot, soft rounded shapes, big sparkling eyes, tiny flippers,
pastel blue-and-white palette with a small pink bow, clean simple lineart, flat cel shading,
full-body front view, centered, consistent proportions and scale, transparent background,
game sprite style, no text, no watermark, no background elements
```

**九个状态各自的追加 prompt**（每条要求"一行 6 个等宽格子"，出 strip 后用脚本切格拼网格）：

| 行 | 追加 prompt |
| --- | --- |
| 0 idle | `sprite strip of exactly 6 equal frames in one horizontal row: subtle breathing and blinking loop, gentle bobbing, same pose and scale in every frame` |
| 1 eating | `…6 equal frames: happily eating a small fish, mouth opens then chews then satisfied smile, tiny sparkles` |
| 2 bathing | `…6 equal frames: taking a bath with soap bubbles, scrubbing then rinsing then shaking off water droplets` |
| 3 playing | `…6 equal frames: playful jumping and spinning with a small ball, joyful open-mouth expression` |
| 4 petted | `…6 equal frames: being petted on the head, eyes close happily, tail wags, one small heart above` |
| 5 hungry | `…6 equal frames: feeling hungry, rubbing its tummy, droopy expression, an empty fish bone beside it` |
| 6 dirty | `…6 equal frames: feeling dirty and itchy, dust motes, scratching itself, slightly messy look` |
| 7 sad | `…6 equal frames: feeling low, drooping posture, a tiny sigh, small grey cloud above its head` |
| 8 sleep | `…6 equal frames: dozing off, eyes closed, floating Zzz letters, slow breathing` |

**工具建议**：一致性用 Midjourney `--cref` + `--cw 100`（或 SDXL IP-Adapter / InstantID；DALL·E 3 靠逐字重复主体 prompt）；透明背景用 remove.bg / Photoshop / SD LayerDiffuse（SDXL+LayerDiffuse 可原生透明）；切格与拼网格由代理在 dev 步提供零依赖脚本。

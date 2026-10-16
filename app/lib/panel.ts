/**
 * 悬停面板"该不该开"的纯判定（design UX 第 9 步 + design D-13 互斥；卡 17 修实机缺陷 D-2）。
 *
 * **为什么单独一个纯函数**：判定只有一行，但它是实机缺陷 D-2 的落点——
 * 卡 16 实机观察到"拖动中途面板弹出来了"（窗体 bounds 到 (280,283) 时 `hasPanel=true`），
 * 根因就是面板开合没有排除"正在拖动"。把它抽成纯函数后：
 * 1. `node --test` 能**直接跑**这个判定（Node 24 的类型剥离，不需要 jsdom / @vue/test-utils，
 *    也就不会破坏本扩展"运行时/测试期零依赖"的既有约束）；
 * 2. 判定只有一处，页面组件只负责把三个布尔喂进来，不会出现"组件里又各判一次"的分叉。
 *
 * **取舍（任务卡要求二选一并说明）**：这里选的是"面板开合显式排除 dragging"
 * （任务卡方案 A：`panelOpen` 加 `&& !dragging`），而不是"拖动开始时 `closePanel()` 并抑制 hover"。
 * 理由：方案 B 需要额外记住"拖动前面板是不是开着的"才能还原，且抑制 hover 会污染
 * `hovered` 这个纯粹的几何事实；方案 A 让 `hovered` 继续如实反映"指针在不在精灵上"，
 * 拖动结束（`dragging` 翻回 false）后面板**自动**按当前几何恢复——这正是任务卡
 * "拖完面板必须还能正常出来"的要求，不需要任何补偿代码。
 *
 * `dragging` 的口径是**按下到抬起**（design D-13 的会话边界）：因此普通点击在按住的那一瞬间
 * 也会让面板短暂收起（松手即回）。这是方案 A 的已知代价：对"拖动中弹面板"这个缺陷而言，
 * 宁可让"可能开始拖动"就收起，也不要靠位移阈值去猜用户意图（那会让慢速拖动的前几帧漏判）。
 */
export function panelShouldOpen(hovered: boolean, focusOpened: boolean, dragging: boolean): boolean {
  return !dragging && (hovered || focusOpened)
}

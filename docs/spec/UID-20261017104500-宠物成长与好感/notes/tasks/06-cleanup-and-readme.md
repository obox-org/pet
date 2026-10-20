# 06 · cleanup-and-readme（旧测试清理 / README v2）

| 字段 | 内容 |
| --- | --- |
| **目标** | 删除或改写所有引用三属性、睡眠、`play`、旧设置键的既有测试；`npm test` 全绿；README 全面更新到 v2（玩法、数值、文本、设置、版本号） |
| **输入** | 当前 `test/**`（v1 的 197 条基线）；`specs/**`（新口径）；`design.md` 的 D-10（取消打盹的连带清理） |
| **文件所有权** | `test/**`（**除**五个新文件：`test/values.test.js`、`test/texts.test.js`、`test/interaction-v2.test.js`、`test/timers-v2.test.js`、`test/view-v2.test.js`）、`README.md` |
| **验收命令** | ① `npm test` 全绿（用例数 = 五个新文件 + 改写后既有用例）；② `git grep -n "hunger\|clean\|mood\|SLEEP_AFTER\|打盹\|'play'" -- test/ README.md` 的命中**只剩历史说明**，且逐条列明；③ `npm run pack` ⇒ `out/pet-2.0.0.oix`（18 条目，回读自检通过）；④ README 的版本号、玩法表、数值段、文本段、设置行与 `manifest.json` 一致 |
| **依赖与阻塞** | 依赖卡 1–5 全部落地；**最后一卡** |
| **并行组** | G5 |

## 要点

1. 删除/改写：`test/vitals*.test.js`（三属性速率与联动）、`test/actions-*.test.js`（睡眠、play、旧冷却）、`test/extension.test.js` 与 `test/bridge.test.js` 里与视图字段相关的断言、`test/window.test.js` 里的 sleep 注释与断言、`test/settings-*.test.js` 里三行进度条的断言。
2. 新增的反向断言：长时间无交互仍活跃（无 sleep）、两枚图标、共享冷却、每小时成长、点击 1 小时。
3. README：玩法表（喂食/洗澡 +1/+1、点击 1 小时 +1、两枚图标）、数值段（成长/好感、10 级阈值表）、文本段（120 + 8、每 5 分钟一条、等级揭示）、设置段（4 行）、版本 2.0.0、测试条数。

## 负向自检（不改实现）

- 全仓（`test/` + `README.md`）对旧口径的命中逐条列出并说明为何保留（历史沿革段落）；
- `npm test` 若不绿，**不得**靠删断言过关：必须每条删改都指向一个已删除的能力。

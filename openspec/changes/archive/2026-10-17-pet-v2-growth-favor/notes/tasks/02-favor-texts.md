# 02 · favor-texts（128 条文本与取样）

| 字段 | 内容 |
| --- | --- |
| **目标** | 120 条等级文本 + 8 条冷却文本落成数据模块，并实现"只从 1..当前等级并集取样、均匀随机、相邻去重"的取样；128 条全部通过内容正则 |
| **输入** | `specs/pet-favor/spec.md` 的 4 条 requirement（R1 的 12 条/级与揭示规则、R2 的 300 秒节拍归属、R3 的 8 条冷却集合与去重、R4 的正则口径）；`notes/texts.md`（唯一文本来源）；`design.md` 的 D-5（取样公式）、D-6（丢弃策略） |
| **文件所有权** | `lib/texts.js`（新建）、`test/texts.test.js`（新建） |
| **验收命令** | ① `npm test -- test/texts.test.js` 全绿；② 测试内含**逐条**正则扫描（`\d`、`分钟|小时|秒`、`饥饿|清洁|心情`、功能承诺词表）且有断言"共 128 条 / 10 组各 12 / 冷却 8"；③ 测试内含等级揭示断言（第 N 级不出现 N+1 组）；④ `node -e "import('./lib/texts.js')"` 可加载（纯数据 + 纯函数，零依赖、无副作用） |
| **依赖与阻塞** | 无（G1，与卡 1 并行；**不依赖** `constants.js`——文本与阈值解耦，取样只接收 `level` 数字） |
| **并行组** | G1 |

## 要点

1. 导出 `LEVEL_TEXTS: string[][]`（10×12）、`COOLING_TEXTS: string[]`（8）、`TEXT_TOTAL = 128`。
2. 导出 `pickFavorText(level, last)`：候选 = `LEVEL_TEXTS.slice(0, level).flat()`，均匀随机，结果 ≠ `last`；`level` 非法（<1、>10、非整数）⇒ 钳到 `[1,10]`。
3. 导出 `pickCoolingText(last)`：8 条里均匀随机，≠ `last`。
4. 零 import（纯模块），保证 `node --test` 可直接跑、页面侧也能复用（页面不重复抄文本）。

## 负向自检（不改实现）

- `pickFavorText(1, x)` 的结果**必属于** L1 的 12 条；`pickFavorText(10, x)` 可命中任意一组；
- 连续两次调用（把第一次结果当 `last`）**必不相等**；
- `pickFavorText(0, x)` / `pickFavorText(11, x)` / `pickFavorText(undefined, x)` ⇒ 分别钳到 1 / 10 / 1；
- 全 128 条正则命中 0；条数断言（10 组 × 12 + 8）。

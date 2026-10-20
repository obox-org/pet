/**
 * pet-sprites · 状态→动画轨映射、优先级与帧几何契约（specs/pet-sprites；design D-2 / D-10）。
 *
 * ⚠️ 本文件是 v1 用例的改写：v1 钉着的 `hungry` / `dirty` / `sad` / `sleep` 四条状态
 * （三属性过低的负面表情 + 连续无交互的打盹、以及打盹的唯一一处 1.5× 慢放）已随
 * `specs/pet-vitals` 的 4 条 REMOVED 与 design D-10 **整体删除**，因此那些断言改为
 * **反向断言**：状态表里只剩 `idle` + 七条表演轨，`resolveStatus` 只有"未到期的 transient"
 * 与 `idle` 两个来源，`speed` 一律 1（不再有任何慢放）。
 *
 * 帧几何用**真实的** `assets/whale/pet.json` 核对（声明驱动、只读），顺带钉住
 * `TRANSIENT_MS` 常量与图集的一轮总时长未漂移。
 * （"按声明的几何裁剪""关窗后无残留帧循环"是页面渲染行为，归 app/** 与实机验收。）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TRANSIENT_MS } from '../lib/constants.js'
import {
  FALLBACK_FRAME_MS,
  STATUS_LABEL,
  STATUS_PRIORITY,
  STATUS_TRACK,
  animOf,
  frameDurations,
  isTransient,
  resolveStatus,
  trackTotalMs,
  wrapFrame
} from '../lib/mapping.js'
import { initialState } from '../lib/settle.js'

const T0 = 1_700_000_000_000

/** 真实图集声明（assets 只读） */
const petJson = JSON.parse(readFileSync(new URL('../assets/whale/pet.json', import.meta.url), 'utf8'))

function st(overrides = {}) {
  return { ...initialState(T0), ...overrides }
}

/** v2 保留下来的八个状态（= idle + 七条表演轨）与它们的图集行号 */
const EXPECT_ROWS = {
  idle: 0,
  eating: 4,
  bathing: 3,
  playing: 7,
  petted: 3,
  trot: 7,
  'run-left': 2,
  'run-right': 1
}

test('pet-sprites · 状态→行号映射表（D-2）：八个状态逐行，且三条表演轨与上游轨名对得上', () => {
  for (const [status, row] of Object.entries(EXPECT_ROWS)) {
    assert.equal(STATUS_TRACK[status].row, row, `${status} 行号`)
    assert.equal(animOf(status).row, row, `animOf(${status}).row`)
  }
  // label = 中文状态名（跨卡契约；页面用 row 渲染、面板用 label 展示）
  assert.deepEqual(
    Object.fromEntries(Object.keys(EXPECT_ROWS).map((s) => [s, animOf(s).label])),
    {
      idle: '待机',
      eating: '喂食',
      bathing: '洗澡',
      playing: '玩耍',
      petted: '摸头',
      trot: '原地小跑',
      'run-left': '向左小跑',
      'run-right': '向右小跑'
    }
  )
  // 映射轨与 pet.json 的轨名对得上（行号 ↔ 轨名互为兜底，防上游换图集时静默错位）
  assert.equal(STATUS_TRACK.eating.track, 'jumping')
  assert.equal(STATUS_TRACK.bathing.track, 'waving')
  assert.equal(STATUS_TRACK.playing.track, 'running')
  assert.equal(STATUS_TRACK.trot.track, 'running')
  assert.equal(STATUS_TRACK['run-left'].track, 'running-left')
  assert.equal(STATUS_TRACK['run-right'].track, 'running-right')
})

test('pet-sprites · 状态表只剩八个键：四条状态指示轨/打盹已从表里物理删除（specs/pet-vitals REMOVED）', () => {
  assert.deepEqual(Object.keys(STATUS_TRACK).sort(), Object.keys(EXPECT_ROWS).sort())
  assert.deepEqual(Object.keys(STATUS_LABEL).sort(), Object.keys(EXPECT_ROWS).sort())
  // 反向断言：v1 的四个键名一个都不在（改动表就会红）
  for (const gone of ['hungry', 'dirty', 'sad', 'sleep']) {
    assert.equal(Object.hasOwn(STATUS_TRACK, gone), false, `STATUS_TRACK 不应含 ${gone}`)
    assert.equal(Object.hasOwn(STATUS_LABEL, gone), false, `STATUS_LABEL 不应含 ${gone}`)
    assert.equal(Object.hasOwn(STATUS_PRIORITY, gone), false, `STATUS_PRIORITY 不应含 ${gone}`)
    assert.equal(isTransient(gone), false, `${gone} 不是瞬时状态`)
  }
  // 唯一一处慢放（打盹的 1.5×）已删除：八条状态的 speed 全是 1（"待机动画按原速"）
  for (const [status, spec] of Object.entries(STATUS_TRACK)) {
    assert.equal(spec.speed, 1, `${status} 的速度倍率必须是 1（没有打盹慢放了）`)
  }
})

test('pet-sprites · resolveStatus：只有「未到期的 transient」与 idle 两个来源，长时间无交互仍是 idle', () => {
  // 无 transient ⇒ idle（不依赖任何数值阈值，也不依赖"多久没交互"）
  assert.equal(resolveStatus(st(), T0), 'idle')
  assert.equal(resolveStatus(st({ lastInteractAt: T0 - 10 * 86_400_000 }), T0), 'idle', '十天无交互仍是待机')
  // 七条瞬时轨都认（否则表演会被当场顶掉）
  for (const status of Object.keys(EXPECT_ROWS)) {
    if (status === 'idle') continue
    const performing = st({ transient: { status, until: T0 + 1600 } })
    assert.equal(resolveStatus(performing, T0), status, `${status} 播放中`)
    assert.equal(resolveStatus(performing, T0 + 1600), 'idle', `${status} 到期 ⇒ 回落 idle`)
  }
  // 畸形 transient（未知状态 / 非对象 / until 非法）一律 idle
  assert.equal(resolveStatus(st({ transient: { status: 'hungry', until: T0 + 1600 } }), T0), 'idle', '表外状态 ⇒ idle')
  assert.equal(resolveStatus(st({ transient: 'eating' }), T0), 'idle')
  assert.equal(resolveStatus(st({ transient: { status: 'eating', until: 'x' } }), T0), 'idle')
})

test('pet-sprites · 优先级：瞬时互动 > 表演轨（同档）> idle；表里没有属性轨/打盹档位', () => {
  for (const status of ['eating', 'bathing', 'petted', 'playing']) {
    assert.equal(STATUS_PRIORITY[status], 9, `${status} 是瞬时互动档`)
  }
  for (const status of ['trot', 'run-left', 'run-right']) {
    assert.equal(STATUS_PRIORITY[status], 2, `${status} 与 trot 同档（表演轨）`)
    assert.ok(STATUS_PRIORITY[status] > STATUS_PRIORITY.idle, `${status} > idle`)
    assert.ok(STATUS_PRIORITY.eating > STATUS_PRIORITY[status], `瞬时互动 > ${status}`)
  }
  assert.equal(STATUS_PRIORITY.idle, 1)
  assert.equal(Object.keys(STATUS_PRIORITY).length, 8, '优先级表与状态表同规模（没有多余档位）')
})

test('pet-sprites · 帧时长取自 tracks：不等间隔逐帧值（idle 一轮约 2600ms）', () => {
  assert.deepEqual(frameDurations(petJson, 'idle'), petJson.tracks.idle.durations)
  assert.equal(trackTotalMs(petJson, 'idle'), 2600)
  assert.deepEqual(frameDurations(petJson, 'eating'), [300, 300, 300, 350, 350], 'eating → jumping 轨')
  assert.deepEqual(frameDurations(petJson, 'bathing'), [350, 350, 350, 350], 'bathing → waving 轨')
  assert.deepEqual(frameDurations(petJson, 'playing'), [250, 250, 250, 250, 250, 250], 'playing → running 轨')
  assert.deepEqual(frameDurations(petJson, 'run-left'), Array(8).fill(225), 'run-left → running-left 轨')
})

test('pet-sprites · 缺 durations 的轨回退 250ms/帧（specs/pet-sprites 缺省值）', () => {
  const bare = { frames: [6, 8, 8, 4, 5, 8, 6, 6, 6] } // 无 tracks
  assert.equal(FALLBACK_FRAME_MS, 250, '回退值逐字 250ms')
  assert.deepEqual(frameDurations(bare, 'idle'), Array(6).fill(250))
  // 部分帧缺值：只补缺的那帧
  const partial = { frames: [3], tracks: { idle: { durations: [400] } } }
  assert.deepEqual(frameDurations(partial, 'idle'), [400, 250, 250])
  // 没有慢放 ⇒ 回退值也不再被 ×1.5
  assert.deepEqual(frameDurations(bare, 'eating'), Array(5).fill(250))
})

test('pet-sprites · 缺帧容错：waving 只有 4 帧（列数 8），索引取模循环、MUST NOT 越界到相邻行', () => {
  assert.equal(petJson.frames[3], 4, '真实图集 waving 行帧数')
  assert.equal(wrapFrame(petJson.frames, 3, 0), 0)
  assert.equal(wrapFrame(petJson.frames, 3, 3), 3)
  assert.equal(wrapFrame(petJson.frames, 3, 4), 0, '第 5 帧回卷到 0（不采到第 4 列之后的空白/邻行像素）')
  assert.equal(wrapFrame(petJson.frames, 3, 9), 1)
  for (let i = -12; i < 64; i++) {
    const w = wrapFrame(petJson.frames, 3, i)
    assert.ok(w >= 0 && w < 4, `wrapFrame(3, ${i}) = ${w} 越界`)
  }
  // 脏帧数（缺失/0/负数）⇒ 按 1 帧处理，不除零不越界
  assert.equal(wrapFrame([0], 0, 7), 0)
  assert.equal(wrapFrame(undefined, 3, 7), 0)
  assert.equal(wrapFrame([-2], 0, 7), 0)
})

test('pet-sprites · TRANSIENT_MS 与真实 pet.json 的一轮总时长一致（常量未与图集漂移）', () => {
  for (const status of ['eating', 'bathing', 'playing', 'petted', 'trot', 'run-left', 'run-right']) {
    assert.equal(TRANSIENT_MS[status], trackTotalMs(petJson, status), `${status} 一轮 = 该轨帧时长之和`)
  }
  assert.deepEqual(Object.keys(TRANSIENT_MS).sort(), [
    'bathing',
    'eating',
    'petted',
    'playing',
    'run-left',
    'run-right',
    'trot'
  ])
})

test('pet-sprites · 八个状态 label 全为中文且互不相同（面板 aria/诊断可读）', () => {
  const labels = Object.values(STATUS_LABEL)
  assert.equal(labels.length, 8)
  assert.equal(new Set(labels).size, 8)
  for (const l of labels) assert.match(l, /[\u4e00-\u9fff]/)
  assert.equal(STATUS_LABEL.trot, '原地小跑')
  assert.equal(STATUS_LABEL['run-left'], '向左小跑')
  assert.equal(STATUS_LABEL['run-right'], '向右小跑')
})

test('卡12 · anim.status = 机器可读英文 key（∈ STATUS_TRACK 八键，单一来源），未知状态回退 idle', () => {
  for (const [status, row] of Object.entries(EXPECT_ROWS)) {
    const anim = animOf(status)
    assert.equal(anim.status, status, `animOf(${status}).status 回传同名英文 key`)
    assert.ok(Object.hasOwn(STATUS_TRACK, anim.status), `status '${anim.status}' ∈ STATUS_TRACK 键（不新造映射表）`)
    assert.equal(anim.row, row, `animOf(${status}).row 与 status 映射自洽`)
    // label 仍为中文（显示用），与 status 并存互不替代
    assert.equal(anim.label, STATUS_LABEL[status])
    assert.match(anim.label, /[\u4e00-\u9fff]/)
  }
  // 未知状态回退 idle（status/row/label 三者同口径，不给页面漏非法 key）
  assert.deepEqual(animOf('bogus'), animOf('idle'))
  assert.equal(animOf(undefined).status, 'idle')
  assert.equal(animOf('hungry').status, 'idle', '被删除的旧状态同样回退 idle（不留非法 key）')
})

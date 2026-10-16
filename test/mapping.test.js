/**
 * pet-sprites · 状态→动画轨映射、优先级与帧几何契约（specs/pet-sprites；design D-4）。
 *
 * 对应任务卡验收清单：映射与优先级（瞬时互动 > hungry > dirty > sad > sleep > idle）；
 * 缺帧取模（waving 4 帧不越界到相邻行）；sleep = idle 行且帧时长 ×1.5。
 * 帧几何用**真实的** assets/whale/pet.json（声明驱动，卡 06 产物，只读）核对，
 * 顺带钉住 TRANSIENT_MS 常量与 pet.json 的一轮总时长未漂移。
 * （"按声明的几何裁剪""关窗后无残留帧循环"是页面渲染行为，归卡 08/卡 11 实机验收。）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  STATUS_LABEL,
  STATUS_PRIORITY,
  STATUS_TRACK,
  TRANSIENT_MS,
  animOf,
  frameDurations,
  resolveStatus,
  trackTotalMs,
  wrapFrame
} from '../lib/mapping.js'
import { initialState } from '../lib/settle.js'

const T0 = 1_700_000_000_000

/** 真实图集声明（assets 归卡 06，本测试只读） */
const petJson = JSON.parse(readFileSync(new URL('../assets/whale/pet.json', import.meta.url), 'utf8'))

function st(overrides = {}) {
  return { ...initialState(T0), ...overrides }
}

test('pet-sprites · 状态→行号映射表（D-4）：idle→0 eating→4 bathing→3 playing→7 petted→3 hungry→6 dirty→8 sad→5 sleep→0', () => {
  const expectRows = {
    idle: 0,
    eating: 4,
    bathing: 3,
    playing: 7,
    petted: 3,
    hungry: 6,
    dirty: 8,
    sad: 5,
    sleep: 0
  }
  for (const [status, row] of Object.entries(expectRows)) {
    assert.equal(STATUS_TRACK[status].row, row, `${status} 行号`)
    assert.equal(animOf(status).row, row, `animOf(${status}).row`)
  }
  // label = 中文状态名（跨卡契约；页面用 row 渲染、面板用 label 展示）
  assert.deepEqual(
    Object.fromEntries(Object.keys(expectRows).map((s) => [s, animOf(s).label])),
    {
      idle: '待机',
      eating: '喂食',
      bathing: '洗澡',
      playing: '玩耍',
      petted: '摸头',
      hungry: '饥饿',
      dirty: '脏',
      sad: '心情低',
      sleep: '打盹'
    }
  )
  // 映射轨与 pet.json 的轨名对得上（行号 ↔ 轨名互为兜底，防上游换图集时静默错位）
  assert.equal(STATUS_TRACK.eating.track, 'jumping')
  assert.equal(STATUS_TRACK.bathing.track, 'waving')
  assert.equal(STATUS_TRACK.playing.track, 'running')
  assert.equal(STATUS_TRACK.hungry.track, 'waiting')
  assert.equal(STATUS_TRACK.dirty.track, 'review')
  assert.equal(STATUS_TRACK.sad.track, 'failed')
})

test('pet-sprites · 属性过低优先于待机：饥饿 <30 ⇒ hungry（waiting 行 6），清洁/心情同理', () => {
  assert.equal(resolveStatus(st({ hunger: 29.9 }), T0), 'hungry')
  assert.equal(resolveStatus(st({ hunger: 30 }), T0), 'idle', '阈值是严格小于 30')
  assert.equal(resolveStatus(st({ clean: 10 }), T0), 'dirty')
  assert.equal(resolveStatus(st({ mood: 0 }), T0), 'sad')
  assert.equal(animOf(resolveStatus(st({ hunger: 10 }), T0)).row, 6)
})

test('pet-sprites · 优先级：瞬时互动 > hungry > dirty > sad > sleep > idle（同时命中取唯一一轨）', () => {
  // 三属性同时过低 ⇒ hungry 胜出（次级 dirty/sad 被压住）
  const all = st({ hunger: 10, clean: 10, mood: 10, lastInteractAt: T0 - 600_001 })
  assert.equal(resolveStatus(all, T0), 'hungry')
  // 瞬时互动压过一切属性状态（播放中不可被打断）
  const eating = st({ hunger: 10, clean: 10, mood: 10, transient: { status: 'eating', until: T0 + 1600 } })
  assert.equal(resolveStatus(eating, T0), 'eating')
  // hungry > dirty > sad 逐级验证
  assert.equal(resolveStatus(st({ hunger: 10, clean: 10 }), T0), 'hungry')
  assert.equal(resolveStatus(st({ clean: 10, mood: 10 }), T0), 'dirty')
  // sad > sleep：心情过低压过打盹
  assert.equal(resolveStatus(st({ mood: 10, lastInteractAt: T0 - 600_001 }), T0), 'sad')
  // sleep > idle
  assert.equal(resolveStatus(st({ lastInteractAt: T0 - 600_000 }), T0), 'sleep')
  assert.equal(resolveStatus(st({ lastInteractAt: T0 - 599_999 }), T0), 'idle')
  // 优先级数值表与判定顺序一致（防止两处定义漂移）
  assert.ok(STATUS_PRIORITY.eating > STATUS_PRIORITY.hungry)
  assert.ok(STATUS_PRIORITY.hungry > STATUS_PRIORITY.dirty)
  assert.ok(STATUS_PRIORITY.dirty > STATUS_PRIORITY.sad)
  assert.ok(STATUS_PRIORITY.sad > STATUS_PRIORITY.sleep)
  // 卡 15（D-4 优先级段）：trot 插在 sleep 之后、idle 之前；卡 18（Q16）把两条侧跑轨并列到同档
  assert.ok(STATUS_PRIORITY.sleep > STATUS_PRIORITY.trot, 'sleep > trot（睡着不踱步）')
  assert.ok(STATUS_PRIORITY.trot > STATUS_PRIORITY.idle, 'trot > idle')
  assert.ok(STATUS_PRIORITY.sleep > STATUS_PRIORITY.idle)
  assert.equal(STATUS_PRIORITY['run-left'], STATUS_PRIORITY.trot, 'run-left 与 trot 同档')
  assert.equal(STATUS_PRIORITY['run-right'], STATUS_PRIORITY.trot, 'run-right 与 trot 同档')
  assert.ok(STATUS_PRIORITY.sad > STATUS_PRIORITY['run-left'], '状态指示轨高于表演轨')
  // 瞬时互动到期后自动失效（transient 过期 ⇒ 回落属性判定）
  const expired = st({ transient: { status: 'eating', until: T0 } })
  assert.equal(resolveStatus(expired, T0), 'idle')
})

test('pet-sprites · 打盹为慢放 idle：连续 10 分钟无交互 ⇒ sleep = idle 行且帧时长 ×1.5', () => {
  assert.equal(resolveStatus(st({ lastInteractAt: T0 - 600_000 }), T0), 'sleep')
  assert.equal(animOf('sleep').row, 0, 'sleep 用 idle 行（上游没有 sleep 轨）')
  assert.equal(STATUS_TRACK.sleep.speed, 1.5)
  // 真实 pet.json：idle durations = 400/400/500/400/400/500 ⇒ sleep = ×1.5
  assert.deepEqual(frameDurations(petJson, 'idle'), [400, 400, 500, 400, 400, 500])
  assert.deepEqual(frameDurations(petJson, 'sleep'), [600, 600, 750, 600, 600, 750])
  assert.equal(animOf('sleep').label, '打盹')
})

test('pet-sprites · 帧时长取自 tracks：不等间隔逐帧值（idle 一轮约 2600ms）', () => {
  assert.deepEqual(frameDurations(petJson, 'idle'), petJson.tracks.idle.durations)
  assert.equal(trackTotalMs(petJson, 'idle'), 2600)
  assert.deepEqual(frameDurations(petJson, 'eating'), [300, 300, 300, 350, 350], 'eating → jumping 轨')
  assert.deepEqual(frameDurations(petJson, 'bathing'), [350, 350, 350, 350], 'bathing → waving 轨')
  assert.deepEqual(frameDurations(petJson, 'playing'), [250, 250, 250, 250, 250, 250], 'playing → running 轨')
})

test('pet-sprites · 缺 durations 的轨回退 250ms/帧（specs/pet-sprites 缺省值）', () => {
  const bare = { frames: [6, 8, 8, 4, 5, 8, 6, 6, 6] } // 无 tracks
  assert.deepEqual(frameDurations(bare, 'idle'), [250, 250, 250, 250, 250, 250])
  // sleep 的回退值同样 ×1.5
  assert.deepEqual(frameDurations(bare, 'sleep'), [375, 375, 375, 375, 375, 375])
  // 部分帧缺值：只补缺的那帧
  const partial = { frames: [3], tracks: { idle: { durations: [400] } } }
  assert.deepEqual(frameDurations(partial, 'idle'), [400, 250, 250])
})

test('pet-sprites · 缺帧容错：waving 只有 4 帧（列数 8），索引取模循环、MUST NOT 越界到相邻行', () => {
  assert.equal(petJson.frames[3], 4, '真实图集 waving 行帧数')
  assert.equal(wrapFrame(petJson.frames, 3, 0), 0)
  assert.equal(wrapFrame(petJson.frames, 3, 3), 3)
  assert.equal(wrapFrame(petJson.frames, 3, 4), 0, '第 5 帧回卷到 0（不采到第 4 列之后的空白/邻行像素）')
  assert.equal(wrapFrame(petJson.frames, 3, 9), 1)
  // 任意大索引都在 [0, frames[row]) 内（越界采样 = 画面串行的根因）
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
  assert.equal(TRANSIENT_MS.eating, trackTotalMs(petJson, 'eating'), 'eating = jumping 一轮 1600ms')
  assert.equal(TRANSIENT_MS.bathing, trackTotalMs(petJson, 'bathing'), 'bathing = waving 一轮 1400ms')
  assert.equal(TRANSIENT_MS.playing, trackTotalMs(petJson, 'playing'), 'playing = running 一轮 1500ms')
  assert.equal(TRANSIENT_MS.petted, trackTotalMs(petJson, 'petted'), 'petted = waving 一轮 1400ms')
})

test('pet-sprites · 十二个状态 label 全为中文且互不相同（面板 aria/诊断可读；卡 15 增补 trot、卡 18 增补侧跑两轨）', () => {
  const labels = Object.values(STATUS_LABEL)
  assert.equal(labels.length, 12, '卡 15 增补 trot、卡 18 增补 run-left/run-right ⇒ 十个状态变十二个')
  assert.equal(new Set(labels).size, 12)
  for (const l of labels) assert.match(l, /[\u4e00-\u9fff]/)
  assert.equal(STATUS_LABEL.trot, '原地小跑')
  assert.equal(STATUS_LABEL['run-left'], '向左小跑')
  assert.equal(STATUS_LABEL['run-right'], '向右小跑')
})

test('卡12 · anim.status = 机器可读英文 key（∈ STATUS_TRACK 九键，单一来源）且与 row 映射自洽', () => {
  const expectRows = {
    idle: 0,
    eating: 4,
    bathing: 3,
    playing: 7,
    petted: 3,
    hungry: 6,
    dirty: 8,
    sad: 5,
    sleep: 0
  }
  for (const [status, row] of Object.entries(expectRows)) {
    const anim = animOf(status)
    assert.equal(anim.status, status, `animOf(${status}).status 回传同名英文 key`)
    assert.ok(Object.hasOwn(STATUS_TRACK, anim.status), `status '${anim.status}' ∈ STATUS_TRACK 键（不新造映射表）`)
    assert.equal(anim.row, row, `animOf(${status}).row 与 status 映射自洽`)
    // label 仍为中文（显示用，卡 07 契约不变），与 status 并存互不替代
    assert.equal(anim.label, STATUS_LABEL[status])
    assert.match(anim.label, /[\u4e00-\u9fff]/)
  }
  // 未知状态回退 idle（status/row/label 三者同口径，不给页面漏非法 key）
  assert.deepEqual(animOf('bogus'), animOf('idle'))
  assert.equal(animOf(undefined).status, 'idle')
})

test('卡12 · 区分度：sleep 与 idle 同为 row 0 但 status 不同（页面慢放/Zzz 气泡全靠 status 辨识）', () => {
  const sleep = animOf('sleep')
  const idle = animOf('idle')
  // row 相同（sleep 就是 idle 行的慢放，上游没有 sleep 轨）
  assert.equal(sleep.row, 0)
  assert.equal(idle.row, 0)
  assert.equal(sleep.row, idle.row, 'sleep 与 idle 同为 row 0')
  // 但 status 不同 —— 这正是本次修正要保住的区分度（label 中文页面读不懂，status 是机器可读契约）
  assert.equal(sleep.status, 'sleep')
  assert.equal(idle.status, 'idle')
  assert.notEqual(sleep.status, idle.status, '同 row 0 下 status 必须能区分 sleep/idle')
  // label 语义不变：仍是中文显示名
  assert.equal(sleep.label, '打盹')
  assert.equal(idle.label, '待机')
})

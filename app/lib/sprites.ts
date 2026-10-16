/**
 * 图集元数据（`pet.json`）的加载与归一化。
 *
 * 契约见 specs/pet-sprites/spec.md：几何**由随图集分发的 `pet.json` 声明驱动，渲染不得硬编码行列数**；
 * `cell`（格子宽高）与 `columns`（列数）可缺省，缺省值 192×208 / 8；帧时长取 `tracks[轨名].durations`
 * 的逐帧值，**某轨未声明 durations 时回退 250ms/帧**。
 *
 * 这个模块的全部函数都按"输入可能是垃圾"来写：`pet.json` 缺失、字段为 0/负数/字符串/NaN、
 * `frames` 短于行数，统统降级成"能渲染、不越界、不抛错"，而不是白屏（design D-9）。
 */

/** 规范给出的缺省几何（specs/pet-sprites：`cell` = 192×208、`columns` = 8） */
export const DEFAULT_CELL_W = 192
export const DEFAULT_CELL_H = 208
export const DEFAULT_COLUMNS = 8
/** 某轨未声明 durations 时的回退帧时长（specs/pet-sprites） */
export const FALLBACK_FRAME_MS = 250
/** 单帧时长下限：0ms 会让帧循环在一个 tick 内空转，钳到一帧刷新的量级 */
const MIN_FRAME_MS = 16

export interface SpriteMeta {
  /** 每格宽（CSS px） */
  cellW: number
  /** 每格高（CSS px） */
  cellH: number
  /** 列数（只用于推导格子宽，不用于取模；取模一律按 `frames[row]`） */
  columns: number
  /** 每行**声明的**帧数，已归一化为 ≥1；行数即数组长度 */
  frames: number[]
  /** 行号 → 轨名（`pet.json` 里 `tracks` 的键序，规范声明"行名与轨名依次对应"） */
  rowTrackNames: string[]
  /** 轨名 → 逐帧时长（已归一化；缺声明的轨不在表里，取值时回退 250ms） */
  durations: Record<string, number[]>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return NaN
}

/** 正整数：非有限/≤0/非数字 → fallback */
function positiveInt(value: unknown, fallback: number): number {
  const n = toNumber(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

/** 单帧时长归一化：非法值回退 250ms，合法值钳到 ≥16ms（避免 0ms 帧把循环打满） */
function frameMs(value: unknown): number {
  const n = toNumber(value)
  if (!Number.isFinite(n) || n <= 0) return FALLBACK_FRAME_MS
  return Math.max(MIN_FRAME_MS, Math.round(n))
}

/** `cell` 的三种可能写法都认：`{width,height}` / `{w,h}` / `[w,h]`（上游只保证"可选"，没保证形状） */
function readCell(value: unknown): { w: number; h: number } | null {
  if (Array.isArray(value)) {
    const w = positiveInt(value[0], 0)
    const h = positiveInt(value[1], 0)
    return w > 0 && h > 0 ? { w, h } : null
  }
  if (!isRecord(value)) return null
  const w = positiveInt(value.width ?? value.w, 0)
  const h = positiveInt(value.height ?? value.h, 0)
  return w > 0 && h > 0 ? { w, h } : null
}

/**
 * 读图集本体。返回 `null` 表示加载/解码失败 ⇒ 调用方显示 design D-9 的占位（灰色圆 + 「图集加载失败」），
 * 而不是白屏；交互按钮仍然可用（只是没有动画）。
 */
export function loadImageElement(url: string, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    let settled = false
    const done = (value: HTMLImageElement | null): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(value)
    }
    // 兜底超时：协议返回 204 / 空响应时 load 与 error 都可能不触发，不能把首屏挂死
    const timer = window.setTimeout(() => done(null), timeoutMs)
    img.onload = () => done(img)
    img.onerror = () => done(null)
    img.src = url
  })
}

/** 取 `pet.json` 原文；失败返回 `null`（不抛错，交给 normalizeMeta 降级） */
export async function fetchMetaJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn('[pet] 图集元数据读取失败，按最小契约降级：HTTP ' + res.status)
      return null
    }
    return await res.json()
  } catch (err) {
    console.warn('[pet] 图集元数据不可用，按最小契约降级：' + String(err))
    return null
  }
}

/**
 * 把原始 JSON 归一化成渲染可直接用的几何表。
 *
 * 降级规则（逐条对应任务卡的负向自检）：
 * - 缺 `tracks` ⇒ `durations` 为空表 ⇒ 所有轨回退 250ms/帧；
 * - `frames` 缺项 / 为 0 / 为负 / 不是数字 ⇒ 该行按 **1 帧**处理（取模后恒为第 0 列，绝不越界）；
 * - `frames` 整个缺失 ⇒ 退化成"单格静态"（1 行 1 帧），**不猜行数**（猜错就会采到别的行的像素）；
 * - 未声明 `cell` 时，先看图集实际像素能否被列数/行数整除（比盲套默认值更贴近真实图集），否则用 192×208。
 */
export function normalizeMeta(raw: unknown, img: HTMLImageElement | null): SpriteMeta {
  const obj = isRecord(raw) ? raw : {}
  const columns = positiveInt(obj.columns, DEFAULT_COLUMNS)

  const declaredFrames = Array.isArray(obj.frames) && obj.frames.length > 0
  const frames = declaredFrames
    ? (obj.frames as unknown[]).map((f) => positiveInt(f, 1))
    : [1]

  const declared = readCell(obj.cell)
  let cellW = declared?.w ?? 0
  let cellH = declared?.h ?? 0
  if (cellW <= 0) {
    const derived = img && img.naturalWidth > 0 ? Math.floor(img.naturalWidth / columns) : 0
    cellW = derived > 0 ? derived : DEFAULT_CELL_W
  }
  if (cellH <= 0) {
    // 只有 `frames` 真的声明了行数才敢用图高推格子高，否则会把整张图当成一格
    const derived =
      declaredFrames && img && img.naturalHeight > 0 ? Math.floor(img.naturalHeight / frames.length) : 0
    cellH = derived > 0 ? derived : DEFAULT_CELL_H
  }

  const rowTrackNames: string[] = []
  const durations: Record<string, number[]> = {}
  if (isRecord(obj.tracks)) {
    for (const [name, track] of Object.entries(obj.tracks)) {
      rowTrackNames.push(name)
      const list = isRecord(track) && Array.isArray(track.durations) ? track.durations.map(frameMs) : []
      if (list.length > 0) durations[name] = list
    }
  }

  return { cellW, cellH, columns, frames, rowTrackNames, durations }
}

/**
 * 取某轨第 `index` 帧的时长。
 * `durations` 比该行帧数短时按声明长度取模（上游每条轨都是一一对应，这里只是防御），
 * 完全没声明则回退 250ms（specs/pet-sprites）。
 */
export function frameDuration(meta: SpriteMeta, trackName: string, index: number): number {
  const list = meta.durations[trackName]
  if (!list || list.length === 0) return FALLBACK_FRAME_MS
  const i = ((index % list.length) + list.length) % list.length
  const value = list[i]
  return Number.isFinite(value) && value > 0 ? value : FALLBACK_FRAME_MS
}

/** 行号钳制：越界/非整数一律回第 0 行（idle），绝不采到图集外 */
export function clampRow(meta: SpriteMeta, row: unknown): number {
  const n = toNumber(row)
  if (!Number.isInteger(n) || n < 0 || n >= meta.frames.length) return 0
  return n
}

/** 该行声明的帧数（缺项按 1，配合取模保证不越界） */
export function frameCountOf(meta: SpriteMeta, row: number): number {
  const n = meta.frames[row]
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

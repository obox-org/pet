#!/usr/bin/env node
/**
 * 打包 .oix：把扩展分发文件 zip 成 out/<name>-<version>.oix。
 *
 * .oix 就是普通 zip，**根目录**必须放 manifest.json + 入口文件（manifest.main）+ 静态资源：
 * 安装器按根 manifest.json 读 id/version/main 并检查入口在包内（src/main/oixCore.ts:198-222）。
 *
 * 包内只放**运行时产物**：manifest.json + 入口 index.js + lib/（纯函数模块）+ dist/（Vue 子应用
 * 构建产物）+ assets/（精灵图集与许可证/出处）。源码与规格目录（openspec/、docs/、test/、app/）
 * 以及 data/、node_modules/、out/、.git/ 一律不进包 —— 其中 **data/ 是硬性拒收项**：它是扩展
 * 运行时数据目录（覆盖安装时由宿主保留），含 data/ 的包会被安装器以 forbidden-entry 直接拒收
 * （见 docs/extension-api/guides-user.md 第 6 节）。
 *
 * 打完有**回读自检**（verify）：解析产物的 zip 中央目录，断言必需条目齐全（含 9 个 lib/*.js ——
 * 入口 `import './lib/…'`，缺任何一个都会加载失败）、无禁止前缀、manifest.json 是根条目、
 * 路径全为正斜杠、条目 ≤10000、解压总量 ≤512MB；任何一条不过就删除产物并以非 0 退出。
 *
 * 零依赖：只用 node:zlib 自己写 zip —— 用户扩展不引入任何 npm 依赖。
 * 用法：npm run pack
 */
import { deflateRawSync } from 'node:zlib'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 打进包根的单个文件（不存在就跳过）；新增静态资源时加到这里 */
const FILES = [
  'manifest.json',
  'index.js',
  'page.html',
  'page.js',
  'theme.js',
  'icon.svg',
  'icon.png',
  'LICENSE'
]
/**
 * 打进包的目录（递归）：dist/ 是 Vue 子应用构建产物，assets/ 是精灵图集与许可证/出处，
 * lib/ 是运行时纯函数模块 —— 入口 `import './lib/…'`，**漏掉 lib/ 则包内入口的导入全部
 * 失败**（扩展激活即报错；回读自检对 9 个 lib/*.js 逐一断言）。
 */
const DIRS = ['dist', 'assets', 'lib']

/**
 * 永不进包的目录名（任意层级）：
 * - data/：扩展运行时数据目录 —— 宿主升级时保留它，且安装器对含 data/ 的包直接报
 *   forbidden-entry 拒收（docs/extension-api/guides-user.md 第 6 节）；
 * - node_modules/ / out/：构建期依赖与打包中间产物（宿主限额：条目 ≤10000、解压 ≤512MB）；
 * - .git/：仓库元数据；
 * - openspec/ / docs/ / test/ / app/：规格文档、源码与测试 —— 包内只要运行时产物。
 */
const SKIP_DIRS = new Set(['data', 'out', 'node_modules', '.git', 'openspec', 'docs', 'test', 'app'])

/**
 * 禁止前缀兜底（条目顶层匹配）：即使有人把这些目录写进 FILES/DIRS，也在写盘前拒绝（throw），
 * 避免产出装不上或含源码的 .oix。与 SKIP_DIRS 分工：SKIP_DIRS 管"递归时跳过"，这份管"落盘前终检"。
 */
const FORBIDDEN_PREFIXES = ['data', 'node_modules', 'out', 'openspec', 'docs', 'test', 'app']

/** 目录下所有文件（zip 内路径用 / 分隔） */
function walk(dir, prefix) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    const name = prefix ? prefix + '/' + entry.name : entry.name
    if (entry.isDirectory()) out.push(...walk(full, name))
    else out.push({ name, data: readFileSync(full) })
  }
  return out
}

function collect() {
  const entries = []
  for (const file of FILES) {
    if (existsSync(join(root, file))) {
      entries.push({ name: file, data: readFileSync(join(root, file)) })
    }
  }
  for (const dir of DIRS) {
    const full = join(root, dir)
    if (existsSync(full) && statSync(full).isDirectory()) entries.push(...walk(full, dir))
  }
  // 兜底：即使有人把禁止目录写进 FILES/DIRS，也在写盘前拒绝，避免产出装不上的 .oix
  const forbidden = entries.filter((entry) =>
    FORBIDDEN_PREFIXES.some((prefix) => entry.name === prefix || entry.name.startsWith(prefix + '/'))
  )
  if (forbidden.length > 0) {
    throw new Error(
      '包内含禁止条目 —— data/ 会被宿主安装器以 forbidden-entry 拒收；' +
        '源码/依赖/中间目录（node_modules、out、openspec、docs、test、app）不得进包：' +
        forbidden.map((entry) => entry.name).join(', ')
    )
  }
  return entries
}

/** CRC-32（zip 需要） */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** 最小 zip 写入器：local header + 中央目录 + EOCD（文本走 deflate，压不小就 store） */
function zip(entries) {
  const parts = []
  const central = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const raw = entry.data
    const deflated = deflateRawSync(raw)
    const useDeflate = deflated.length < raw.length
    const body = useDeflate ? deflated : raw
    const method = useDeflate ? 8 : 0
    const crc = crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // 文件名 UTF-8
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(0x21, 12) // date = 1980-01-01
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // extra
    parts.push(local, name, body)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4) // version made by
    cd.writeUInt16LE(20, 6) // version needed
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt16LE(method, 10)
    cd.writeUInt16LE(0, 12)
    cd.writeUInt16LE(0x21, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(body.length, 20)
    cd.writeUInt32LE(raw.length, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt16LE(0, 30) // extra
    cd.writeUInt16LE(0, 32) // comment
    cd.writeUInt16LE(0, 34) // disk
    cd.writeUInt16LE(0, 36) // internal attrs
    cd.writeUInt32LE(0, 38) // external attrs
    cd.writeUInt32LE(offset, 42)
    central.push(cd, name)

    offset += local.length + name.length + body.length
  }

  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20) // comment
  return Buffer.concat([...parts, centralBuf, eocd])
}

// ————— 回读自检：解析刚写出的 .oix 的 zip 中央目录，逐条断言；失败即删除产物并 exit(1) —————

/** 解析 zip 中央目录（零依赖）：从文件尾反向扫 EOCD，读出全部条目名与解压后大小 */
function readZipCentralDirectory(buf) {
  // 本脚本不写 comment，EOCD 应恰在 buf.length-22；反向扫描兼容带 comment 的一般 zip（comment ≤ 65535）
  let eocd = -1
  const lowest = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('回读校验失败：.oix 中找不到 zip EOCD 签名（不是有效 zip）')
  const count = buf.readUInt16LE(eocd + 10) // 本盘条目总数
  const cdOffset = buf.readUInt32LE(eocd + 16) // 中央目录起始偏移
  const out = []
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error('回读校验失败：中央目录第 ' + i + ' 条签名不符（偏移 ' + p + '）')
    }
    const uncompressed = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    out.push({ name: buf.toString('utf8', p + 46, p + 46 + nameLen), uncompressed })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/**
 * 回读校验（guides-user.md 第 6 节"打完自检" + 任务卡验收③/R15）：
 * 必需条目齐全、禁止前缀不存在、manifest.json 为根条目、路径全正斜杠、限额达标。
 * 任何一条不过 ⇒ 打印全部违规、删除产物、exit(1)。
 */
function verify(outPath) {
  const buf = readFileSync(outPath)
  const cd = readZipCentralDirectory(buf)
  const names = cd.map((entry) => entry.name)
  const has = (name) => names.includes(name)
  const errors = []

  // ① 必需条目：manifest.json 必须是 zip 根条目（精确名，无目录前缀、无 ./）；index.js 是 manifest.main 入口
  const required = [
    'manifest.json',
    'index.js',
    'dist/index.html',
    'assets/whale/spritesheet.webp',
    'assets/whale/pet.json',
    'assets/whale/LICENSE', // pet-sprites Requirement 4：包内含上游许可证原文
    'assets/whale/PROVENANCE.md' // 出处记录（字节级校验与许可证分层口径）
  ]
  for (const name of required) if (!has(name)) errors.push('缺少必需条目: ' + name)

  // lib/ 的 9 个纯函数模块必须全部在包内：入口 `import './lib/…'`，缺任何一个都会加载失败（任务卡 R15）
  const libFiles = readdirSync(join(root, 'lib'))
    .filter((f) => f.endsWith('.js'))
    .sort()
  if (libFiles.length !== 9) {
    errors.push('lib/ 下应有 9 个 .js，实际 ' + libFiles.length + ' 个: ' + libFiles.join(', '))
  }
  for (const f of libFiles) if (!has('lib/' + f)) errors.push('缺少必需条目: lib/' + f)

  // dist/assets/：vite 构建的 css 与 js 产物至少各一
  if (!names.some((n) => n.startsWith('dist/assets/') && n.endsWith('.css'))) errors.push('缺少 dist/assets/*.css 构建产物')
  if (!names.some((n) => n.startsWith('dist/assets/') && n.endsWith('.js'))) errors.push('缺少 dist/assets/*.js 构建产物')

  // ② 禁止前缀：data/（安装器 forbidden-entry 硬性拒收）与源码/依赖/中间目录
  for (const prefix of FORBIDDEN_PREFIXES) {
    const hit = names.filter((n) => n === prefix || n.startsWith(prefix + '/'))
    if (hit.length > 0) errors.push('出现禁止条目（' + prefix + '/）: ' + hit.join(', '))
  }

  // ③ 路径规则（guides-user.md 第 6 节）：全正斜杠；无反斜杠、无绝对路径、无 ..、无空段、无 ./ 前缀
  for (const n of names) {
    if (n.includes('\\')) errors.push('条目含反斜杠: ' + n)
    if (n.startsWith('./') || n.startsWith('/')) errors.push('条目带 ./ 或绝对路径前缀: ' + n)
    if (n.split('/').some((seg) => seg === '' || seg === '..')) errors.push('条目含空段或 ..: ' + n)
  }

  // ④ 宿主限额（main/oixCore.ts 默认值）：条目 ≤10000、解压总量 ≤512MB
  if (names.length > 10000) errors.push('条目数 ' + names.length + ' 超过限额 10000')
  const totalUncompressed = cd.reduce((sum, entry) => sum + entry.uncompressed, 0)
  if (totalUncompressed > 512 * 1024 * 1024) errors.push('解压总量 ' + totalUncompressed + ' B 超过限额 512MB')

  if (errors.length > 0) {
    rmSync(outPath, { force: true }) // 不留坏包
    console.error('[pack] 回读校验失败（' + errors.length + ' 条），已删除 ' + outPath + '：')
    for (const e of errors) console.error('  - ' + e)
    process.exit(1)
  }

  console.log(
    '[pack] 回读校验通过：' + names.length + ' 个条目，解压总量 ' + totalUncompressed + ' B，包文件 ' + buf.length + ' B'
  )
  for (const entry of cd) console.log('  ' + entry.name + ' (' + entry.uncompressed + ' B)')
}

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
const entries = collect()
const main = String(manifest.main || '').replace(/^\.\//, '')
if (!entries.some((entry) => entry.name === main)) {
  throw new Error('缺少入口文件 ' + main + '（manifest.main 指向它，必须在包根）')
}
if (!entries.some((entry) => entry.name === 'manifest.json')) {
  throw new Error('缺少 manifest.json')
}

const outDir = join(root, 'out')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, manifest.name + '-' + manifest.version + '.oix')
writeFileSync(outPath, zip(entries))
console.log('[pack] 已打包 ' + outPath + '（' + entries.length + ' 个条目，' + statSync(outPath).size + ' B）')
verify(outPath)

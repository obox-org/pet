import { fileURLToPath } from 'node:url'
import { resolve, sep } from 'node:path'
import { createReadStream, existsSync } from 'node:fs'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const root = fileURLToPath(new URL('.', import.meta.url))
const assetsDir = resolve(root, 'assets')

/**
 * **只服务 `npm run dev`** 的静态转接。
 *
 * 页面用相对路径 `../assets/whale/*` 引图集与 pet.json（安装态是
 * `app://extensions/<安装目录>/dist/index.html`，同级就有 `../assets/`）。dev 下文档是
 * `http://localhost:5173/index.html`，浏览器会把 `..` 钳在根上变成 `/assets/whale/*`，
 * 而 vite root 是 `app/`（里面没有 assets）⇒ 不做转接就会 404，页面只显示"图集加载失败"占位，
 * 极易被误判成素材坏了。构建产物不经过这里，行为不受影响。
 */
function devAssetsPlugin(): Plugin {
  return {
    name: 'pet-dev-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/assets/')) return next()
        const rel = decodeURIComponent(url.split('?')[0]).slice('/assets/'.length)
        const file = resolve(assetsDir, rel)
        // 目录穿越防护：解析后必须仍在扩展的 assets/ 之下（与宿主 app:// 协议同一条规则）
        // 注意用平台分隔符比较：Windows 上 resolve() 出来的是反斜杠路径
        if (file !== assetsDir && !file.startsWith(assetsDir + sep)) return next()
        if (!existsSync(file)) {
          res.statusCode = 404
          res.end('not found')
          return
        }
        const type = file.endsWith('.json')
          ? 'application/json; charset=utf-8'
          : file.endsWith('.webp')
            ? 'image/webp'
            : 'application/octet-stream'
        res.setHeader('Content-Type', type)
        createReadStream(file).pipe(res)
      })
    }
  }
}

/**
 * Vue 子应用（宠物窗体页面）构建配置。
 * 产物进 dist/（.oix 只收 dist/，源码 app/ 不进包）；base: './' 让 app:// 下的相对路径可用
 * ——**不能改**：绝对路径 `/xxx.js` 会解析到 `app://extensions/xxx.js`，丢掉扩展目录
 * （docs/extension-api/guides-user.md:65-77）。
 * 这些是**构建期**依赖；扩展运行时入口 index.js 与页面产物都零裸模块依赖（产物是自包含的）。
 */
export default defineConfig({
  root: resolve(root, 'app'),
  base: './',
  plugins: [vue(), devAssetsPlugin()],
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true
  }
})

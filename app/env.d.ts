/**
 * `.vue` 单文件组件的模块声明。
 *
 * vue-tsc 能直接解析 `.vue`，这份声明是给"只跑 tsc 的编辑器/工具"兜底的，
 * 否则 `import App from './App.vue'` 会被判成找不到模块。
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

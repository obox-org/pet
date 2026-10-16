import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

/**
 * 宠物窗体页面的入口。
 *
 * 这里**不安装任何主题接收桥**：宠物窗体是桌面上的 artwork 覆盖层，用户裁定"不使用任何主题"
 * （design D-6，`## UI 视觉规范` 硬约束 1/2 的有意豁免）。整个 `app/` 目录零主题 token 引用，
 * 配色是 design 色值表里的固定值，写在各组件的 scoped 样式里；窗体透明由 style.css 的三条
 * `background:transparent` 与宿主 overlay 模式的五处改动共同保证（design D-11）。
 *
 * 帧循环、长轮询订阅与消息桥的清理都挂在 App.vue 的生命周期上（specs/pet-sprites：销毁即停帧循环）。
 */
createApp(App).mount('#app')

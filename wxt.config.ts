import { defineConfig } from 'wxt'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  browser: 'chrome',
  dev: {
    server: {
      port: 3005,
    },
  },
  modules: [],
  vite: () => ({
    plugins: [vue(), tailwindcss()],
    customLogger: {
      info(msg) { console.info(msg) },
      warn(msg) {
        if (msg.includes('INVALID_ANNOTATION')) return
        console.warn(msg)
      },
      warnOnce(msg) {
        if (msg.includes('INVALID_ANNOTATION')) return
        console.warn(msg)
      },
      error(msg) { console.error(msg) },
      clearScreen() {},
      hasErrorLogged(error) { return false },
      hasWarned: false,
    },
  }),
  manifest: (env) => ({
    name: 'oh-my-x',
    description: 'X/Twitter 界面定制、评论垃圾过滤、爆款雷达与效率辅助工具。',
    permissions: ['storage', 'cookies', 'alarms', 'downloads'],
    host_permissions: [
      'https://twitter.com/*',
      'https://mobile.twitter.com/*',
      'https://x.com/*',
      'https://pro.x.com/*',
      'https://*/*',
      'http://*/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ],
    action: {
      default_title: 'oh-my-x',
      default_popup: 'popup.html',
    },
  }),
})

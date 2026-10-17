import { defineConfig } from 'wxt'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  browser: 'chrome',
  // 输出到 build/（不用默认的 .output）：点开头的文件夹在访达和「加载已解压的扩展程序」选择框里默认隐藏，用户找不到
  outDir: 'build',
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
    // scripting：插件更新后已打开的页面收不到弹窗消息，博主活动度扫描要把抓取请求直接注入页面
    permissions: ['storage', 'cookies', 'alarms', 'downloads', 'scripting'],
    host_permissions: [
      'https://twitter.com/*',
      'https://mobile.twitter.com/*',
      'https://x.com/*',
      'https://pro.x.com/*',
      'https://abs.twimg.com/*',
    ],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: {
      default_title: 'oh-my-x',
      default_popup: 'popup.html',
    },
  }),
})

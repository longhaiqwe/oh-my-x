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
    // 描述按浏览器语言显示，文字在 public/_locales/<语言>/messages.json；其他语言的浏览器显示英文
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // scripting：插件更新后已打开的页面收不到弹窗消息，博主活动度扫描要把抓取请求直接注入页面
    // contextMenus + activeTab：右键「存为 X 草稿」；点菜单项后只在当前页面读一次选中的文字
    permissions: ['storage', 'cookies', 'alarms', 'downloads', 'scripting', 'contextMenus', 'activeTab'],
    host_permissions: [
      'https://twitter.com/*',
      'https://mobile.twitter.com/*',
      'https://x.com/*',
      'https://pro.x.com/*',
      'https://abs.twimg.com/*',
    ],
    // AI 服务地址：远程只允许 HTTPS，HTTP 只给本机服务（见 shared/ai-request.ts）
    optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
    action: {
      default_title: 'oh-my-x',
      default_popup: 'popup.html',
    },
  }),
})

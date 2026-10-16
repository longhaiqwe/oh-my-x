import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // 覆盖高风险边界：纯逻辑 / 存储 / background RPC / content 编排。
      // 暂未设置 thresholds——background、content 编排与 Vue 组件尚未充分纳入测试，
      // 建议随测试补充逐步启用（如 lines: 80）作为质量门禁。
      include: [
        'shared/**/*.ts',
        'content-scripts/utilities/**/*.ts',
        'entrypoints/background.ts',
      ],
    },
  },
})

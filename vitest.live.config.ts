import { defineConfig } from 'vitest/config'

// 用真实模型接口跑的验证，会产生费用：只在本地手动运行 npm run test:live，不进 npm run check
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/live/**/*.live.ts'],
    testTimeout: 120_000,
    // 直接打印对照表，不让 Vitest 收起通过用例的输出
    disableConsoleIntercept: true,
  },
})

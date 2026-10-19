// 测试环境初始化：jsdom 默认会暴露 window/document，但 chrome/browser 全局 API
// 需要在这里 mock 掉，否则 import spam-logger 时会炸

;(globalThis as any).browser = {
  storage: {
    local: {
      get: async (_keys: any) => ({}),
      set: async (_data: any) => {},
      remove: async (_keys: any) => {},
    },
  },
  runtime: {
    onMessage: {
      addListener: () => {},
    },
  },
  // 测试默认按中文界面跑；要测英文时把语言设置设为 en
  i18n: {
    getUILanguage: () => 'zh-CN',
  },
}

// 有些测试会换掉 browser（没有 i18n），语言判断会退回 navigator.language；也设成中文
Object.defineProperty(globalThis.navigator, 'language', { value: 'zh-CN', configurable: true })

// Mock WXT auto-imported defineContentScript macro in test environment
if (typeof (globalThis as any).defineContentScript === 'undefined') {
  ;(globalThis as any).defineContentScript = (config: any) => config
}

// 允许测试用例重新赋值 document/window（如使用独立 JSDOM 实例）
if (typeof (globalThis as any).document !== 'undefined') {
  Object.defineProperty(globalThis, 'document', {
    value: (globalThis as any).document,
    configurable: true,
    writable: true,
  })
}
if (typeof (globalThis as any).window !== 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: (globalThis as any).window,
    configurable: true,
    writable: true,
  })
}

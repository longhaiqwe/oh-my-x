# oh-my-x — 浏览器扩展开发指南

X/Twitter 界面定制 + 评论垃圾过滤 + 爆款雷达 + 排期全景浏览器扩展。

> 本文件是「架构地图」，不是事实的唯一来源。具体 key/默认值/规则/选择器等会随代码演进，
> 一律以下列源文件为准：`storage-keys.ts`、`shared/settings.ts`、`shared/spam-types.ts`、
> `content-scripts/selectors.ts`。**尽量少在这里硬编码会变的数字。**

## 技术栈

| 领域 | 选型 |
|------|------|
| 框架 | [WXT](https://wxt.dev/) + Vite（版本见 `package.json`） |
| UI | Vue 3 + reka-ui（无头组件）+ Tailwind CSS |
| 构建 | `wxt build` → `.output/chrome-mv3/` |
| 扩展 API | Chrome MV3（`storage` / `cookies` / `alarms` / `downloads`） |
| 类型 | TypeScript（严格模式；版本见 `package.json`） |
| 测试 | Vitest + jsdom（见 `vitest.config.ts`） |

## 开发命令

```bash
npm run dev           # 开发模式（HMR，需终端保持运行）
npm run build         # 生产构建
npm run zip           # 构建 + 打包 ZIP
npm run clean         # 删除 .output/
npm test              # 运行单元测试
npm run test:watch    # 监听模式
npm run test:coverage # 测试 + 覆盖率报告
npm run typecheck     # vue-tsc --noEmit（含 Vue 模板）
npm run check         # 类型检查 + 全量测试 + 生产构建
```

Chrome 加载：`chrome://extensions` → 开发者模式 → 加载已解压的扩展 → 选 `.output/chrome-mv3/`

> ⚠️ 不要加载 `.output/chrome-mv3-dev/`，除非你在同时运行 `npm run dev`。

## 目录结构

```
oh-my-x/
├── storage-keys.ts              # 所有 storage key + 默认值 + 默认词库 + 相关 key 集合
├── wxt.config.ts                # WXT 构建配置 + manifest 权限
├── vitest.config.ts             # Vitest 配置 + coverage 范围
├── AGENT.md / README.md         # 开发指南 / 用户文档
│
├── shared/                      # 跨上下文共享逻辑（纯逻辑为主，可单测）
│   ├── settings.ts              # 设置归一化（toggle/数值 clamp/枚举/跨字段约束/旧键迁移）
│   ├── spam-rules.ts            # 评分规则 + evaluateSpam + parseKeywordList
│   ├── spam-types.ts            # spam 类型 + 规则元数据 + 分类标签
│   ├── spam-logger.ts           # 拦截日志/统计（串行化写入）
│   ├── parse-tweet.ts           # 从 article DOM 提取文本/昵称/handle
│   ├── detect-language.ts       # 独立语言识别 + 排除引用推文逻辑
│   ├── navItems.ts              # 导航项注册表（id/storageKey/label/selector）
│   ├── feature-registry.ts      # 功能清单：5 个模块、每个功能的归属/名称/说明/存储项
│   └── viral-radar-parser.ts    # 流速数值解析 + 分类
│
├── content-scripts/             # 注入到 x.com 页面的脚本（isolated world）
│   ├── initialize.ts            # 初始化 + 全局 MutationObserver（按 scope 分派）
│   ├── selectors.ts             # X.com DOM 选择器
│   │
│   ├── features/
│   │   ├── static.ts            # 一次性 CSS 注入 + 按变更 key 分组增量应用
│   │   ├── dynamic.ts           # 运行时动态功能（按 scope 调度 + pending 合并）
│   │   ├── viral-radar.ts       # 爆款雷达：流速计算 + 标签/高亮
│   │   └── article-toc.ts       # 文章目录导航
│   │
│   ├── options/
│   │   ├── timeline.ts          # 时间线宽度 / 推广隐藏 / 话题隐藏 / 媒体下载
│   │   ├── navigation.ts        # 侧边栏按钮显隐 + 导航标签模式
│   │   ├── interface.ts         # Tweet 按钮显隐
│   │   ├── composer.ts          # 编辑器插入链接按钮
│   │   ├── precompose.ts        # 发帖前保存当前 URL
│   │   ├── stat-ratio.ts        # 粉丝比/互动比徽章
│   │   ├── profile-activity.ts  # 账号活动统计
│   │   └── scheduled-time.ts    # 排期全景显示 + 接收 MAIN world 桥接数据
│   │
│   ├── spam/
│   │   ├── scanner.ts           # 扫描编排：配置、article 遍历、按钮注入触发
│   │   ├── config.ts            # spam 配置加载（带 TTL 缓存）
│   │   ├── article-state.ts     # article 处理状态/指纹
│   │   ├── debug-bar.ts         # 评分 debug 条
│   │   ├── placeholder.ts       # 隐藏占位块
│   │   ├── keyword-segment.ts   # 选词分词（CJK 逐字 + 非CJK 按空白）
│   │   ├── keyword-picker/      # 推文操作按钮注入（选词/名单）
│   │   ├── dom-attrs.ts         # 注入元素的数据属性常量
│   │   └── types.ts
│   │
│   └── utilities/
│       ├── storage.ts           # browser.storage.local 封装（默认值回退 + 写入结果）
│       ├── constructNewData.ts  # storage changes → newValue map
│       ├── addStyles.ts / addStyleSheet.ts / removeElement.ts
│       ├── colors.ts / navIcons.ts / sidebar.ts
│       ├── debounce.ts / throttle.ts
│       └── isMutationSkippable.ts
│
├── entrypoints/
│   ├── content.ts               # isolated content script 入口（storage.onChanged、总开关）
│   ├── interceptor.content.ts   # MAIN world 脚本：hook fetch/XHR 拦截排期 API
│   ├── background.ts            # Service Worker：版本化默认词库同步
│   └── popup/                   # 设置面板（Vue 3 SPA，5 个模块标签，只挂载当前模块）
│       ├── App.vue / main.ts / style.css / index.html
│       ├── composables/         # useStorageKey
│       └── components/           # sections / ui / controls
│
├── public/                      # 图标 + css/main.css
└── test/                        # setup.ts + unit/ + integration/ + samples/
```

## 架构总览

扩展在 x.com 上运行**两个 content script**（不同 world）+ 一个 background + 一个 popup：

### 1. Isolated Content Script（`entrypoints/content.ts`）
- 匹配 `twitter.com` / `x.com` / `pro.x.com`，`document_end` 运行。
- **总开关**：读 `KeyExtensionStatus`，为 `off` 则不初始化；切换该 key 会 `location.reload()`。
- **storage.onChanged**：只处理 setting key 变更，合并到 `currentSettings` 后调用 `applyChangedStaticFeatures`（按 key 分组增量应用），避免任意存储写入都重跑全部静态功能。
- spam 相关 key 变更触发 `invalidateSpamConfig()` + `runScan()`；viral 相关 key 变更触发对应刷新。

### 2. MAIN World Interceptor（`entrypoints/interceptor.content.ts`）
- `world: 'MAIN'`、`document_start` 运行，**无 `browser.storage` 访问**。
- hook `window.fetch` / `XMLHttpRequest`，命中排期 API 时 clone+解析响应，通过 `postMessage` 桥接给 isolated world（`scheduled-time.ts` 消费），并写一份结构化快照到 `sessionStorage` 作 fallback。
- 只在 URL 命中时才解析，异常不影响宿主请求。

### 3. Background Worker（`entrypoints/background.ts`）
- `onInstalled` 时做版本化默认词库同步。
- 负责本地帖子库 RPC、同步唤醒、Lists/媒体请求、创作者奖励定时刷新，以及可取消的 AI 请求与权限检查。

### 4. Popup（`entrypoints/popup/`）
- Vue 3 SPA，5 个模块标签（界面 / 过滤 / 数据 / 创作 / 互动），只挂载当前模块页。

## 内容脚本编排

### 动态调度（`features/dynamic.ts` + `initialize.ts`）
- 一个全局 `MutationObserver` 观察整棵 document 树。
- `getDynamicFeatureScopes(mutations)` 把变更归类为 scope：`tweet | composer | scheduled | navigation`；SPA 路由切换追加 `all`。
- `general(scopes)` 按 scope 只跑相关功能；单飞期间到达的新 scope 合并进 `pendingScopes`，本轮结束后补跑，避免漏掉最后一次变更。
- `runDynamicFeatures` 50ms 节流。

### 静态增量应用（`features/static.ts`）
- `applyStaticFeatures(data)`：初始化时全量应用（timeline / navigation / sidebar）。
- `applyChangedStaticFeatures(data, changedKeys)`：仅当变更 key 落入某分组时重跑该组，缩小副作用面。

## 爆款雷达（`features/viral-radar.ts` + `shared/viral-radar-parser.ts`）
- 按流速（浏览量 ÷ 发布时长（小时））分三级：normal / potential / viral。
- 可配置：阈值（双滑块，强制 potential < viral）、展示哪些级别、标签开关、高亮样式（边框/背景）。
- 配置解析收敛在 `settings.ts` 的 `parseViral*` 函数（含旧键迁移）。

## 评论垃圾过滤子系统

### 配置（`spam/config.ts`）
- `getSpamConfig()` 带 TTL 缓存；`KeySpamFilterEnabled !== 'on'` 时返回 `null`，扫描器据此跳过并清理已注入工件。

### 扫描（`spam/scanner.ts`）
- `runScan()` 只在「对话」里给评论评分：`/username/status/:id` 详情页整页按主贴/评论切分；`/i/decks/:id`（X Pro）只扫对话栏，时间线栏不评分。其它页面（如 `/home`）完全不评分并清掉残留隐藏状态。
- 对话栏靠 DOM 识别（`Timeline: Conversation` / `时间线：对话`、栏头返回按钮、行内回复框），不依赖 URL 里有没有 `/status/`。
- 命中后：黑名单→强制隐藏；白名单→放行；否则 `evaluateSpam()` 评分，达阈值隐藏并记日志。debug 模式只显示评分条。
- 每条推文操作按钮（选词/名单）的注入在扫描循环中触发（幂等）。
- 自身 mutation 检测避免反馈循环。

### 规则引擎（`shared/spam-rules.ts` + `spam-types.ts`）
- 可叠加评分规则（具体规则与分数见 `spam-types.ts` 规则元数据）。分类优先级 `porn_spam > marketing > bot > low_quality > normal`。
- `evaluateSpam({ text, authorName, authorHandle, keywords, enabledRules })`：空 `keywords` 数组表示用户明确清空，不回退默认词库。

### 日志/统计（`shared/spam-logger.ts`）
- `recordIntercept()` 用串行化队列避免单上下文并发丢写（注意：仅串行化当前 JS realm，跨标签页仍可能丢写）。

## 存储 Keys 与设置归一化

- 所有 key、默认值集中在 `storage-keys.ts`（`defaultPreferences`）。
- `shared/settings.ts` 的 `normalizeSettings` 是设置入口：
  - toggle/枚举按白名单归一化；
  - 数值按业务范围 clamp（对齐各 UI 滑块），并保证 `potential < viral` 跨字段约束，非法组合回退默认；
  - 字符串保留「present-but-empty」语义（用户主动清空不回退默认）。
- 旧键迁移：爆款雷达的 `parseViral*` 仅在**新键真正缺失**时读旧键。

## Popup 布局

- 标签来自 `shared/feature-registry.ts` 的 `FEATURE_MODULES`，顺序为 界面、过滤、数据、创作、互动，默认 `layout`。
- 每个模块页在 `components/modules/*Module.vue`，页头 `ModuleHeader` 显示模块标题和说明；功能卡片在 `components/sections`，通用控件在 `components/ui`、`components/controls`。
- 功能卡片统一用 `ui/FeatureCard.vue`：名称 + 右侧控件 / 说明、补充说明、「在哪用」（都取自功能清单）/ 分隔线下状态行 + 展开详细设置。详细设置用 `v-show` 收起，内容保持挂载。
- 多个简单功能共用一张卡片时，用 `FeatureList` 包住若干 `FeatureCard variant="row"`；从属设置用 `SubRow` 缩进；分组标题用 `GroupLabel`。
- 开关一律正向命名（打开 = 开启或显示）。直接绑定存储的开关用 `FeatureSwitch`；存储值与开关含义相反时传 `invert`（如 `sidebarColumn` 存 'on' 表示隐藏）。自己管理状态的卡片用 `SwitchToggle`，多选项用 `SegmentedControl` / `ToggleGroupControl`。
- 界面文案用白描：写动作和结果，不拟人、不比喻、不用夸张的形容词和副词。
- 过滤页分两层（`modules/FilterModule.vue`）：第一层四张卡片用 `FeatureCard details-as="page"`，点击后切到第二层；第二层用 `ui/SubPage.vue`（返回按钮 + 「内容过滤 / 功能名」）。进入时记录 `#app` 的滚动位置并回到顶部，返回时恢复位置并把焦点放回入口按钮（`data-details-for`）。
- 第一层状态行不挂载第二层组件，直接用 `composables/useStorageSnapshot.ts` 读取相关存储项并监听 `storage.onChanged`；第二层的防抖保存在卸载时立即写入，保证返回后数字是新的。
- 新增设置项时，必须在功能清单里归到一个功能（或列入 `GLOBAL_STORAGE_KEYS` / `UNLISTED_STORAGE_KEYS`），`test/unit/feature-registry.test.ts` 会检查每个设置项恰好有一个归属。
- 上次打开的模块存在 `popupActiveTab`；旧版标签 id（view/overview/viral/rules/keywords/lists/log）由 `resolvePopupModule` 映射到新模块。

## 工具函数（`content-scripts/utilities/`）

| 工具 | 功能 |
|------|------|
| `addStyles/removeStyles` | 按 ID 管理 `<style>` |
| `getStorage(key/keys)` | storage.get，缺失 key 回退默认值 |
| `setStorage(kv)` | storage.set，返回 `Promise<boolean>` 让调用方可感知失败 |
| `constructNewData(changes)` | storage changes → newValue map |
| `extractNavItems()` / `getNavIconSvg(id)` | 导航项扫描 + SVG 提取 |

## 测试

Vitest 覆盖纯逻辑（规则、解析、归一化、缓存、scope 分派）与 DOM 行为（debug bar、占位、替换）。覆盖率范围见 `vitest.config.ts`（含 `shared/`、`content-scripts/utilities/`、`background.ts`）。

```bash
npm test            # 运行
npm run typecheck   # 类型检查（vue-tsc --noEmit，含 Vue SFC 脚本和模板）
```

> TypeScript 固定在 6.0.x，配合 `vue-tsc` 检查模板；升级至 7.x 前需确认 Vue 工具链支持（[上游兼容性记录](https://github.com/vuejs/language-tools/issues/6124)）。

> GitHub Actions 在 push / pull request / workflow_dispatch 时运行 `npm ci` 和 `npm run check`，并保存生产构建产物。

## 构建 + 权限

```bash
npm run build     # → .output/chrome-mv3/
npm run zip       # 构建 + 打包
```

Manifest 权限（`wxt.config.ts`）：`storage`、`cookies`、`alarms`、`downloads`。默认主机权限仅 X 域名与 `abs.twimg.com`；AI 主机从 `optional_host_permissions` 按需授权。`permissions.request` 必须直接从 popup 点击事件调用，不能在前面插入异步操作。

AI 请求通过 `shared/ai-request.ts` 的一次性 runtime Port 发送，后台检查主机授权；请求 25 秒超时，Port 断开中止 AbortController。内容面板关闭、移除或 popup 卸载须断开连接，迟到响应不得重建界面。原文补全也使用相同生命周期。外部 AI 请求 `credentials: omit`、拒绝重定向，不转发 X Cookie。

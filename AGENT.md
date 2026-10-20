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
| 构建 | `wxt build` → `build/chrome-mv3/`（`wxt.config.ts` 的 `outDir`，不用默认的 `.output`，方便用户找到） |
| 扩展 API | Chrome MV3（`storage` / `cookies` / `alarms` / `downloads`） |
| 类型 | TypeScript（严格模式；版本见 `package.json`） |
| 测试 | Vitest + jsdom（见 `vitest.config.ts`） |

## 开发命令

```bash
npm run dev           # 开发模式（HMR，需终端保持运行）
npm run build         # 生产构建
npm run zip           # 构建 + 打包 ZIP
npm run clean         # 删除 build/（以及旧版的 .output/）
npm test              # 运行单元测试
npm run test:watch    # 监听模式
npm run test:coverage # 测试 + 覆盖率报告
npm run test:live     # 用真实模型接口跑 AI 打分样例集（需 AI_API_KEY 等环境变量，会产生费用）
npm run typecheck     # vue-tsc --noEmit（含 Vue 模板）
npm run check         # 类型检查 + 全量测试 + 生产构建
```

Chrome 加载：`chrome://extensions` → 开发者模式 → 加载已解压的扩展 → 选 `build/chrome-mv3/`

> ⚠️ 不要加载 `build/chrome-mv3-dev/`，除非你在同时运行 `npm run dev`。

## 目录结构

```
oh-my-x/
├── storage-keys.ts              # 所有 storage key + 默认值 + 默认词库 + 相关 key 集合
├── wxt.config.ts                # WXT 构建配置 + manifest 权限
├── vitest.config.ts             # Vitest 配置 + coverage 范围
├── AGENT.md / README.md         # 开发指南 / 用户文档（英文版 README.en.md）
│
├── shared/                      # 跨上下文共享逻辑（纯逻辑为主，可单测）
│   ├── settings.ts              # 设置归一化（toggle/数值 clamp/枚举/跨字段约束/旧键迁移）
│   ├── spam-rules.ts            # 评分规则 + evaluateSpam + parseKeywordList
│   ├── spam-types.ts            # spam 类型 + 规则元数据 + 分类标签
│   ├── spam-logger.ts           # 拦截日志/统计（串行化写入）
│   ├── parse-tweet.ts           # 从 article DOM 提取文本/昵称/handle
│   ├── detect-language.ts       # 独立语言识别 + 排除引用推文逻辑
│   ├── navItems.ts              # 导航项注册表（id/storageKey/label/selector）
│   ├── staticNavIcons.ts        # 弹窗「导航栏按钮」里列出的 10 个按钮
│   ├── feature-registry.ts      # 功能清单：5 个模块、每个功能的归属/名称/说明/存储项
│   ├── i18n/                    # 界面语言：zh-CN.ts / en.ts 文案表 + t() 取文案、语言设置读取
│   ├── tweet-filter-rules.ts    # 正文关键词过滤规则
│   ├── tweet-media.ts           # 从推文 DOM 和接口数据提取图片/视频地址（下载用）
│   ├── own-post-library*.ts     # 帖子库：IndexedDB 存储 + 同步调度
│   ├── ai-repost.ts             # AI 转发提示词：通用规则 + 用户的转发风格
│   ├── ai-request.ts            # AI 请求的 Port 生命周期与超时
│   ├── viral-radar-parser.ts    # 流速数值解析 + 分类
│   ├── composer-media.ts        # 发帖框多图排序：两边共用的事件名、属性名和纯计算
│   └── composer-media-bridge.ts # 发帖框多图排序的 MAIN world 部分：读 X 图片数据、改图片顺序
│
├── content-scripts/             # 注入到 x.com 页面的脚本（isolated world）
│   ├── initialize.ts            # 初始化 + 全局 MutationObserver（按 scope 分派）
│   ├── selectors.ts             # X.com DOM 选择器
│   │
│   ├── features/
│   │   ├── static.ts            # 一次性 CSS 注入 + 按变更 key 分组增量应用
│   │   ├── dynamic.ts           # 运行时动态功能（按 scope 调度 + pending 合并）
│   │   ├── viral-radar.ts       # 爆款雷达：流速计算 + 标签/高亮
│   │   ├── article-toc.ts       # 文章目录导航
│   │   ├── tweet-filter.ts      # 正文关键词过滤（折叠/隐藏）
│   │   ├── user-followers.ts    # 用户粉丝数徽章
│   │   ├── bookmark-counter.ts  # 收藏量
│   │   ├── creator-rewards.ts   # 原创内容奖励计划数据
│   │   ├── ai-repost.ts         # AI 总结转发面板
│   │   ├── quick-interaction.ts # 快捷键 1-4 + 底部悬浮条
│   │   ├── reply-assistant.ts   # 直达回复区胶囊（可拖动，位置存 jumpRepliesPosition）
│   │   ├── auto-like-reply.ts   # 回复后自动点赞
│   │   ├── quick-list.ts        # Lists：资料卡「+ List」+ 导航栏「我的列表」入口
│   │   └── scheduled-sidebar.ts # 右侧栏搜索框下的排期面板（按天分组、刷新、收起）
│   │
│   ├── options/
│   │   ├── timeline.ts          # 时间线宽度（时间线和右侧栏优先，左栏只占导航宽度，放不下时自动收窄到最窄 600px）+ 媒体下载（复制 X 原生菜单项，只换图标和文字）
│   │   ├── navigation.ts        # 侧边栏按钮显隐 + 导航标签模式 + 导航栏宽度（只在窗口 ≥1265px、显示文字时生效）
│   │   ├── more-menu.ts         # 被收进「更多」菜单的导航入口，在菜单打开时同步隐藏
│   │   ├── interface.ts         # 发帖按钮、右侧边栏、长文目录、排期全景开关
│   │   ├── composer.ts          # 编辑器插入链接按钮 + Markdown 格式化
│   │   ├── composer-media.ts    # 发帖框多图两列排版 + 拖动排序（isolated world）
│   │   ├── own-post-picker.ts   # 编辑器里的「引用我的帖子」搜索面板
│   │   ├── own-post-library-client.ts # 帖子库同步（分批翻页、断点）
│   │   ├── precompose.ts        # 发帖前保存当前 URL
│   │   ├── radar.ts             # X Radar 页宽度
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
│   ├── background.ts            # Service Worker：默认词库同步、帖子库、Lists/媒体请求、创作者奖励、AI 请求
│   ├── popup/                   # 设置面板（Vue 3 SPA，5 个模块标签，只挂载当前模块）
│   └── options/                 # 完整设置页（新标签页整页打开，复用 popup 的模块页）
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
- 匹配 `twitter.com` / `mobile.twitter.com` / `x.com` / `pro.x.com`，`document_end` 运行。
- **总开关**：读 `KeyExtensionStatus`，为 `off` 则不初始化；切换该 key 会 `location.reload()`。
- **storage.onChanged**：只处理 setting key 变更，合并到 `currentSettings` 后调用 `applyChangedStaticFeatures`（按 key 分组增量应用），避免任意存储写入都重跑全部静态功能。
- spam 相关 key 变更触发 `invalidateSpamConfig()` + `runScan()`；viral 相关 key 变更触发对应刷新。

### 2. MAIN World Interceptor（`entrypoints/interceptor.content.ts`）
- `world: 'MAIN'`、`document_start` 运行，**无 `browser.storage` 访问**。
- hook `window.fetch` / `XMLHttpRequest`，命中排期 API 时 clone+解析响应，通过 `postMessage` 桥接给 isolated world（`scheduled-time.ts` 消费），并写一份结构化快照到 `sessionStorage` 作 fallback。
- 记下 X 自己请求排期列表时的接口编号（存页面 `localStorage`），收到右侧栏面板的刷新请求或拦截到新建/修改/删除定时帖后，用 `shared/scheduled-fetcher.ts` 主动重读一次排期列表。
- 只在 URL 命中时才解析，异常不影响宿主请求。

### 3. Background Worker（`entrypoints/background.ts`）
- `onInstalled` 时做版本化默认词库同步。
- 负责本地帖子库 RPC、同步唤醒、Lists/媒体请求、创作者奖励定时刷新，以及可取消的 AI 请求与权限检查。

### 4. Popup（`entrypoints/popup/`）
- Vue 3 SPA，5 个模块标签（界面 / 过滤 / 数据 / 创作 / 互动），只挂载当前模块页。

## 发帖框多图排版与排序（`options/composer-media.ts` + `shared/composer-media-bridge.ts`）

- X 发帖框的图片显示顺序和发帖时 `media_ids` 的顺序都取自 Redux `mediaUpload` 数组的顺序；发帖框自己的 `mediaIds` 只用来筛选，改它不会换顺序。X 自带的拖动排序（react-beautiful-dnd）只在图文混排（`inline_media`）编辑器里启用。
- 重排在 MAIN world 做：从附件区的 React 节点往上找到 Redux store，先派发普通动作 `rweb/mediaUpload/REMOVE_MEDIA`（只过滤数组，不取消上传、不释放文件），再派发 `rweb/mediaUpload/ADD_MEDIA` 按新顺序加回同一批对象。发帖框里的图片对象和 store 里的是同一批引用，按引用确认找对了 store。
- 两边只通过 DOM 交流：isolated world 在 `[data-testid="attachments"]` 上派发 `xf-composer-media-sync`，MAIN world 同步写回每张图的 `data-xf-media-id / index / image`；重排时先写 `data-xf-media-reorder`（编号列表）再派发 `xf-composer-media-reorder`，读 `data-xf-media-reorder-result`。
- 排版只改 CSS 和 data 属性：把 X 的「列」设成 `display: contents`，外层改成两列 grid，用 `order` 按发帖顺序排；隐藏 16:9 占位块。X 的 2 / 3 / 4 张图分别是 [0,1]、[0,[1,2]]、[[0,2],[1,3]] 两层结构，更深的层级（混合媒体轮播）不处理。
- X 重排后会重新创建图片格子（附件区本身不变），所以每个附件区挂一个 MutationObserver，在同一轮微任务里重新标记，避免闪出原来的排版。
- 读不到 X 数据、有视频或 GIF、少于 2 张时保持 X 原样。开关 `composerMediaGrid`。

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

### AI 打分（试验，方案见 `docs/plans/ai-reply-scoring.md`）
- 「AI 判断」打开后，规则没隐藏的回复送给「AI 总结转发」配置的模型打 AI 嫌疑分（0–100）；分数达到阈值的回复折叠成一行（`HIDDEN_BY_ATTR` 记成 `ai`，规则隐藏记成 `rule`），没到的在操作栏末尾显示分数标签。调试模式只在调试条上多一行 AI 结果，不折叠。
- 提示词、请求内容、返回解析：`shared/ai-reply-score.ts`（改提示词要把 `REPLY_SCORE_PROMPT_VERSION` 加 1，旧缓存作废）。样例集：`shared/ai-reply-samples.json` + `ai-reply-samples.ts`。
- 页面侧：`content-scripts/spam/ai-scorer.ts`（查缓存 → 攒批 → 送后台，暂停原因、手动判断），`ai-badge.ts`（分数标签、折叠条、帖子页标题栏上的 AI 按钮）。扫描器按详情页记住主帖和上级推文 ID，主帖滚出页面后也能分清回复。
- 后台：`XF_SCORE_REPLIES`（打分，结果缓存在 IndexedDB `oh-my-x-reply-scores`，7 天、5000 条）、`XF_LOOKUP_REPLY_SCORES`（只查缓存）、`XF_TEST_REPLY_SCORE_SAMPLES`（设置页跑样例集，不写缓存不计用量）；当天用量在 `spamAiUsage`，每 5 秒合并写一次。
- `npm run test:live`：用真实接口跑样例集（key 从环境变量读，会产生费用，不进 `npm run check`）。

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
- 开关打开 = 开启或显示；例外：X 默认显示的界面元素（右侧边栏、发帖按钮）写成「隐藏…」，打开 = 隐藏，开关关着就等于 X 原样。直接绑定存储的开关用 `FeatureSwitch`；存储值与开关含义相反时传 `invert`（如「隐藏发帖按钮」：`tweetButton` 存 'off' 表示隐藏）。自己管理状态的卡片用 `SwitchToggle`，多选项用 `SegmentedControl` / `ToggleGroupControl`。
- 界面文案用白描：写动作和结果，不拟人、不比喻、不用夸张的形容词和副词。
- 视觉规范见 `docs/design/DESIGN.md`：配色来自 `docs/design/design-tokens.json`（refactoring-ui 色阶算法生成，参考图为深蓝 + 米白 + 橙色）。组件只用 `theme.css` 里的语义变量（`body-bg`、`card-bg`、`sunken-bg`、`text`、`secondary-text`、`muted-text`、`accent`、`accent-text` 等），字号只用 12/14/16/18/20，字重只用 400/600，间距用 4 的倍数；`test/unit/popup-design-tokens.test.ts` 会拦截不合规的写法。
- 过滤页分两层（`modules/FilterModule.vue`）：第一层四张卡片用 `FeatureCard details-as="page"`，点击后切到第二层；第二层用 `ui/SubPage.vue`（返回按钮 + 「内容过滤 / 功能名」）。进入时记录 `#app` 的滚动位置并回到顶部，返回时恢复位置并把焦点放回入口按钮（`data-details-for`）。
- 第一层状态行不挂载第二层组件，直接用 `composables/useStorageSnapshot.ts` 读取相关存储项并监听 `storage.onChanged`；第二层的防抖保存在卸载时立即写入，保证返回后数字是新的。
- 完整设置页（`entrypoints/options/`）与弹窗共用 `popup/modules.ts` 的模块对照表和 `popup/theme.css` 的配色；左侧导航切换模块，地址 `#模块 id` 与当前模块同步（旧版标签 id 同样经 `resolvePopupModule` 映射）。页面通过 `SettingsSurfaceKey` 注入 `'options'`，依赖“当前标签页”的功能（博主活动度扫描）据此只显示提示。滚动容器用 `getScrollContainer()`：弹窗是 `#app`，设置页是整个页面。
- 新增扩展页面后若 `vue-tsc` 报 `PublicPath` 类型错误，先运行 `npx wxt prepare` 重新生成路径类型（`npm ci` 的 postinstall 会自动执行）。
- 新增设置项时，必须在功能清单里归到一个功能（或列入 `GLOBAL_STORAGE_KEYS` / `UNLISTED_STORAGE_KEYS`），`test/unit/feature-registry.test.ts` 会检查每个设置项恰好有一个归属。
- 上次打开的模块存在 `popupActiveTab`；旧版标签 id（view/overview/viral/rules/keywords/lists/log）由 `resolvePopupModule` 映射到新模块。

## 界面语言（`shared/i18n/`）

- 语言设置存在 `uiLanguage`：`auto`（跟随浏览器，`zh` 开头用中文，其余用英文）/ `zh-CN` / `en`，弹窗顶部和完整设置页侧栏的地球按钮（`ui/LanguageMenu.vue`）切换。
- 文案写在 `shared/i18n/zh-CN.ts`（标准条目）和 `en.ts`，两份条目一一对应；`{name}` 是参数。类型检查和 `test/unit/i18n.test.ts` 检查条目、参数一致，以及英文里没有漏翻的中文。英文文案同样白描。
- 取文案：普通脚本用 `t(key, params)`；弹窗和设置页组件用 `composables/useI18n.ts` 的 `t`，切换语言时自动重新渲染。弹窗和设置页用 localStorage 缓存语言设置，首屏直接按缓存的语言渲染。
- 功能清单只存结构，模块和功能的文字按 id 写在文案表：`module.<id>.tab|title|description`、`feature.<id>.label|description|note|where`（note、where 可以不写），组件里用 `useI18n()` 的 `moduleText()` / `featureText()` 取。垃圾规则名、分类名用 `spamRuleLabel()` / `spamCategoryLabel()`，导航按钮显示名用 `navItemName()`；`STATIC_NAV_ITEMS` 的 `label` 是匹配 X 中文菜单用的数据，不要翻译。
- 英文按钮和分段选项比中文宽：按钮文字加 `whitespace-nowrap`，和它并排的文字允许换行；`SubRow` 的文字至少占 160px，控件放不下时换到下一行。`test/unit/popup-english.test.ts` 在英文下渲染弹窗和设置页的所有页面，页面上不能有中文（默认词库等用户数据除外）。
- X 页面脚本（`content.ts`）和后台在启动时调用 `initI18n()`。X 页面上已经插入的界面不会随语言切换重绘，刷新页面后换成新语言；之后新插入的界面直接用新语言。
- 插在 X 自己菜单里的选项（分享菜单的媒体下载）跟 X 菜单的语言，不跟插件语言，避免同一个菜单里中英混排。
- 匹配 X 页面文字的字符串（`aria-label*="正在关注"`、「将于」「安排表」、数字单位「万 / 亿」的解析等）是匹配数据，不翻译；改代码时不要用界面文案去匹配，也不要用文案内容做判断（如按提示文字开头决定颜色），改用状态或代号。
- 报错跨上下文传递时用错误代号：`shared/coded-error.ts`（`CodedError`、`errorPayload`、`toTransferable`，不依赖文案表，页面拦截器、`executeScript` 注入的函数、页面内的抓取逻辑用它）和 `shared/errors.ts`（再加 `AppError`、`errorText`、`fromTransferable`）。代号就是文案表里的 `error.*` 条目；后台、拦截器只传 `{ code, params }`，显示的一方用 `errorText()` 按语言翻译。浏览器、网络、X 和 AI 服务给的报错原文照样以字符串传。帖子库把上次同步的报错存成代号，限流判断按代号（旧数据的中文字符串仍按原文判断）。
- 页面拦截器（`interceptor.content.ts`）和被它引用的模块（`*-interceptor.ts`、`*-fetcher.ts`）不能引入 `shared/i18n`，否则整张文案表会打进每个 X 页面；需要语言相关的格式（数字单位、提示文字）时，加一个参数由调用方传入。
- 拦截命中项除了生成时拼好的 `label`，还存语言无关的 `detail`；显示时用 `formatRuleHit()` / `ruleHitText()` 按当前语言重拼。旧记录没有 `detail`，中文界面照原样显示，其他语言只显示规则名。
- 插件在扩展列表和商店的描述在 `public/_locales/{en,zh_CN}/messages.json`，manifest 用 `__MSG_extDescription__`，默认英文。这部分只跟浏览器语言，不跟插件里的语言设置。
- 测试默认按中文跑（`test/setup.ts` 里 `getUILanguage` 和 `navigator.language` 都是 `zh-CN`）。`test/unit/page-i18n.test.ts` 检查错误代号、命中说明和几块 X 页面界面的英文。
- 默认垃圾词库和推文屏蔽词按插件界面语言：`storage-keys.ts` 的 `getDefaultSpamKeywords(locale)` / `getDefaultTweetFilterKeywords(locale)`（中文 `defaultSpamKeywords`，英文 `defaultSpamKeywordsEn`）。首次安装时 `migrateSpamStorage` 按当时的插件语言写入；老用户的词库不自动换语言，弹窗里「补充默认词」「恢复默认」按当前界面语言。存储兜底的 `defaultPreferences` 仍是中文。词会先去掉空格和标点再匹配，英文默认词不要收太短的词。
- 打分规则：「评论过短」对含中日韩文字或纯 emoji、符号的回复按 8 个字符算，其他回复按词数算（少于 2 个词）；「矩阵引流」的前缀包括英文 visit @ / go to @。
- 进度：设置弹窗、完整设置页、X 页面上注入的界面、后台和拦截器的报错、AI 转发提示词、英文默认词库和打分规则都已接入。README 英文版（`README.en.md`）、双语发布说明、GitHub 仓库简介和标签已完成。还没做：英文截图、Chrome 商店英文资料，清单见 `docs/english-launch-checklist.md`。改了功能或文案时，`README.md` 和 `README.en.md` 要一起改。

## 工具函数（`content-scripts/utilities/`）

| 工具 | 功能 |
|------|------|
| `addStyles/removeStyles` | 按 ID 管理 `<style>` |
| `getStorage(key/keys)` | storage.get，缺失 key 回退默认值 |
| `setStorage(kv)` | storage.set，返回 `Promise<boolean>` 让调用方可感知失败 |
| `constructNewData(changes)` | storage changes → newValue map |
| `extractNavItems()` / `getNavIconSvg(id)` | 导航项扫描 + SVG 提取 |
| `ACCENT` / `accentAlpha(a)` / `ACCENT_TEXT`（`colors.ts`） | 注入页面的界面用的强调色，跟随 X 设置；`syncXAccentColor()` 在启动和每轮动态循环里读取并写入 `--xf-accent` / `--xf-accent-rgb` / `--xf-accent-text`，读不到用 X 默认蓝。纯 CSS 文件直接写 `var(--xf-accent, rgb(29, 155, 240))`。表示含义的颜色（评级、档位、X 操作按钮的固定色）不用它，`test/unit/x-accent.test.ts` 记着保留清单 |

## 测试

Vitest 覆盖纯逻辑（规则、解析、归一化、缓存、scope 分派）与 DOM 行为（debug bar、占位、替换）。覆盖率范围见 `vitest.config.ts`（含 `shared/`、`content-scripts/utilities/`、`background.ts`）。

```bash
npm test            # 运行
npm run typecheck   # 类型检查（vue-tsc --noEmit，含 Vue SFC 脚本和模板）
```

> TypeScript 固定在 6.0.x，配合 `vue-tsc` 检查模板；升级至 7.x 前需确认 Vue 工具链支持（[上游兼容性记录](https://github.com/vuejs/language-tools/issues/6124)）。

> GitHub Actions 在 push / pull request / workflow_dispatch 时运行 `npm ci` 和 `npm run check`，并保存生产构建产物。
>
> 推送 `v*` 标签时 `release.yml` 发布版本：标签必须等于 `v` + `package.json` 的 `version`，跑完 `npm run check` 后把 `build/chrome-mv3/` 打包成 `oh-my-x-chrome-mv3.zip`（压缩包顶层是 `chrome-mv3/`）发到 Releases。README 和对外文章都指向这个文件名，改名要同步。

## 构建 + 权限

```bash
npm run build     # → build/chrome-mv3/
npm run zip       # 构建 + 打包
```

Manifest 权限（`wxt.config.ts`）：`storage`、`cookies`、`alarms`、`downloads`。默认主机权限仅 X 域名与 `abs.twimg.com`；AI 主机从 `optional_host_permissions` 按需授权。`permissions.request` 必须直接从 popup 点击事件调用，不能在前面插入异步操作。

AI 请求通过 `shared/ai-request.ts` 的一次性 runtime Port 发送，后台检查主机授权；请求 25 秒超时，Port 断开中止 AbortController。内容面板关闭、移除或 popup 卸载须断开连接，迟到响应不得重建界面。原文补全也使用相同生命周期。外部 AI 请求 `credentials: omit`、拒绝重定向，不转发 X Cookie。

转发提示词由 `shared/ai-repost.ts` 的 `buildRepostSystemPrompt` 生成：通用规则 + 用户在弹窗填写的风格描述（`aiRepostStylePrompt`）和参考样本（`aiRepostStyleSamples`，用单独一行 `---` 分隔，最多 5 条）；两项留空时用默认风格。转发文案按插件界面语言生成：X 页面的 AI 面板在请求里带上 `locale`，后台按它选中文或英文的提示词、默认风格（`DEFAULT_REPOST_STYLE` / `DEFAULT_REPOST_STYLE_EN`）和禁用词替换表；请求没带语言时按后台读到的插件语言。中英两套提示词结构保持一致，改一套时同步改另一套。提示词里不要写入具体某个人的人设或账号。

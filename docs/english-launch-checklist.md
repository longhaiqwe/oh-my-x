# 英文版上线清单

更新：2026-10-19。插件界面的中英文已经做完（见 [AGENT.md](../AGENT.md)「界面语言」一节）。本文列出对外资料：已改的、待你确认的、要准备的。

## 一、已改好的文件

| 文件 | 改了什么 |
|------|---------|
| `README.en.md` | 英文版，和中文版逐节对应。暂时不放截图（2026-10-19 去掉，只保留顶部 logo），顶部有提示，欢迎英文用户按 `docs/images/en/` 同名文件提交截图 |
| `README.md` | 顶部加 English 链接；「简体中文界面」改为「中文 / English 界面」；补界面语言切换说明；「评论过短」「矩阵引流」两条规则按现在的判断写；补默认词库按界面语言、AI 草稿按界面语言 |
| `.github/workflows/release.yml` | 发布说明的安装和升级步骤改成中文、英文两段 |
| `PRIVACY.md` | 补 `scripting` 权限的用途；补 localStorage 里存了什么；AI 授权入口改成英文界面的名字（附中文名）；更新日期改为 2026-10-19 |
| `ProfileActivityCard.vue` | 注入扫描前检查当前页是不是 X 域名，和隐私政策里写的一致 |

发布说明的局限：`--generate-notes` 追加的改动列表来自提交标题，是中文，不会翻译。需要英文更新摘要时，发版后在 Release 页面手动补一段。

## 二、GitHub 仓库简介和标签（2026-10-19 已改）

原来的简介：「oh-my-x：X/Twitter 瑞士军刀，界面定制、评论过滤、爆款雷达与创作辅助。」，没有标签，主页网址为空。

现在的简介（中英各一句，共 172 个字符，GitHub 上限 350）：

> Adds missing features to X (Twitter) on the web: layout options, spam reply filter, data badges, writing tools, quick actions. 给 X 网页端补上常用但缺失的功能：页面布局、垃圾回复过滤、数据标注、创作辅助、快捷互动。

现在的标签：`chrome-extension` `edge-extension` `browser-extension` `twitter` `x` `manifest-v3` `wxt` `vue3` `spam-filter` `productivity`

主页网址：商店审核通过后填商店链接。

执行过的命令：

```bash
gh repo edit longhaiqwe/oh-my-x --description "Adds missing features to X (Twitter) on the web: layout options, spam reply filter, data badges, writing tools, quick actions. 给 X 网页端补上常用但缺失的功能：页面布局、垃圾回复过滤、数据标注、创作辅助、快捷互动。" --add-topic chrome-extension,edge-extension,browser-extension,twitter,x,manifest-v3,wxt,vue3,spam-filter,productivity
```

## 三、README 截图（`docs/images`，共 38 张）

前提：X 页面截图要 X 本身也是英文界面。需要把 X 账号的显示语言改成 English，或用一个英文测试账号，这一步由你来做。

英文 README 现在不放截图。英文图准备好后放 `docs/images/en/`，文件名和中文图相同，再按中文 README 里的位置加回 `README.en.md`。

中文图也有一张要重截：`engage-lists-nav.webp` 上还是「我的 Lists」，2026-10-19 已改名为「我的列表」。

下面的分类按文件名、尺寸和 README 里的用途推断，没有逐张看图。

### 设计图（2 张，要重做）

| 文件 | 尺寸 | 要处理的 |
|------|------|---------|
| `hero.webp` | 1536×1024 | 生成图，10 个中文标注。仓库里没有源文件，英文版要重新生成或在图上改字。造型是瑞士军刀（比喻），是否保留由你定 |
| `modules.webp` | 1600×286 | 5 个模块名。图上是「噪音过滤 / 数据分析 / 创作辅助 / 互动增强」，现在界面上是「内容过滤 / 数据洞察 / 创作与发布 / 互动与列表」，中文版也要改。英文名：Layout & Reading / Content Filter / Insights / Create & Publish / Engage & Lists |

### 只有插件界面（12 张，切到 English 后重截，不依赖 X 的语言）

`module-layout` `module-filter` `module-insight` `module-create` `module-engage` `popup-header` `options-page` `filter-rules` `filter-log` `insight-creator-rewards` `insight-profile-activity` `create-ai-repost-style`

### X 页面 + 插件界面（24 张，X 和插件都要英文）

| 模块 | 文件 |
|------|------|
| 界面与阅读 | `layout-timeline-width` `layout-hide-sidebar` `layout-nav-buttons` `layout-article-toc` |
| 内容过滤 | `filter-pick-words` `filter-account-lists` `filter-tweet-collapse` |
| 数据洞察 | `insight-viral-radar` `insight-stat-ratio` `insight-follower-count` `insight-bookmark-count` |
| 创作与发布 | `create-own-posts-button` `create-own-posts-search` `create-ai-repost-button` `create-ai-repost-drafts` `create-schedule-popup` `create-schedule-drafts` |
| 互动与列表 | `engage-dock` `engage-jump-replies` `engage-auto-like` `engage-media-download` `engage-non-followers` `engage-lists-nav` `engage-lists-card` |

截这些图时要注意：
- 帖子内容换成英文帖子和英文账号，例如过滤截图用英文垃圾回复，爆款雷达用英文信息流。
- `create-ai-repost-drafts`：英文界面会生成英文草稿，要选一条英文原帖。
- `filter-pick-words`、`filter-rules`：英文界面新装时默认是英文词库。已有数据的账号要先点「Reset to default」才会显示英文词。

## 四、Chrome 应用商店英文资料

### 现状

- 正在审核的包：描述是写死的中文，没有 `_locales` 目录。
- 新包：加了 `_locales/en` 和 `_locales/zh_CN`，`default_locale` 是 `en`。商店的简短说明会按用户语言显示，其他语言默认显示英文。
- 正在审核时上传新包怎么处理（等通过后再提交，还是撤回重交），我没有查证，需要你在开发者后台确认。

### 字段

要求一栏来自 Chrome 官方文档（developer.chrome.com，2026-10-19 查阅）。

| 字段 | 在哪里填 | 要求 | 英文版状态 |
|------|---------|------|-----------|
| 名称 | manifest `name` | — | oh-my-x，不改 |
| 简短说明 | manifest `description`，按 `_locales` 取 | 纯文本，不超过 132 个字符 | 英文 89 个字符、中文 34 个字，已写好 |
| 详细说明 | 后台「商品详情」，顶部下拉选语言，每种语言一份 | 官方页没写字数上限，提示遵守关键词堆砌政策 | 英文草稿见第五节 |
| 截图 | 后台「Localized screenshots」可按语言上传 | 1280×800（推荐）或 640×400，至少 1 张，最多 5 张，直角、不留白边 | 现有 README 截图都不是这个比例，要另截 |
| 小宣传图 | 后台 | 440×280，必填，PNG 或 JPEG，不能按语言区分 | 所有语言共用一张，图上最好不放文字，或中英文都放 |
| 大宣传图 | 后台 | 1400×560，选填，不能按语言区分 | 同上 |
| 宣传视频 | 后台，可按语言 | 选填，YouTube 链接 | — |
| 图标 | 包内 | 128×128 PNG | 已有 |
| 类别、语言 | 后台 | — | — |
| 主页网址 / 支持网址 | 后台 | 选填 | 仓库首页 / Issues 页 |
| 隐私标签页 | 后台 | 单一用途说明、每个权限的用途、是否用远程代码、数据使用声明、隐私政策网址 | 权限用途可直接用 `PRIVACY.md` 第 4 节的表（已补 `scripting`）；隐私政策网址：`https://github.com/longhaiqwe/oh-my-x/blob/main/PRIVACY.md` |

### 建议的 5 张商店截图（1280×800，英文 X + 英文插件）

1. 帖子页：垃圾回复被隐藏，旁边是弹窗的 Filter 页
2. 信息流：爆款雷达的 Rising / Viral 标记
3. 编辑器：Quote my posts 搜索面板
4. 引用编辑器：AI quote drafts 生成的两条英文草稿
5. 右侧栏排期面板，加排期弹窗里的间隔显示

中文截图可以另截一套，在后台选中文后上传。

### 繁体中文浏览器

浏览器语言是 zh-TW 或 zh-HK 时：插件界面按「zh 开头用中文」显示简体中文；商店和 `chrome://extensions` 里的简短说明找不到 `zh_TW`，按 Chrome 的规则退到默认语言，显示英文（推论，未实测）。如果要一致，可以加一份 `_locales/zh_TW`。

## 五、商店英文详细说明草稿

纯文本，商店不渲染 Markdown。

```text
oh-my-x adds everyday features that X (Twitter) on the web does not have. Each feature has its own switch, and settings stay on your device.

Layout & Reading
- Set the timeline width between 600 and 800 pixels
- Hide the right sidebar, the Post button, and any of 10 navigation buttons
- Article outline: jump between headings in long posts and articles

Content Filter
- Spam reply filter: scores replies on post pages with 9 rules and a spam word list, and hides replies that reach your threshold
- Allowlist and blocklist by @handle
- Block log of the latest 50 hidden replies
- Keyword filter: collapse or hide timeline posts that contain muted words

Insights
- Original Content Rewards: Verified Home Timeline impressions over the last 90 days out of 500K, plus impressions counted toward rewards per day
- Account activity: posts and replies per day over the last 7 days
- Viral radar: marks rising and viral posts by views per hour
- Ratio badges, follower counts, and bookmark counts on the page

Create & Publish
- Quote my posts: search your own posts and articles from the editor and insert a link
- AI quote drafts: two quote-post drafts from an OpenAI-compatible service you set up with your own API key
- Schedule overview: every scheduled post with its time and the gap to the previous one, plus a schedule panel in the right sidebar

Engage & Lists
- Number keys on post pages: 1 reply, 2 quote, 3 like, 4 bookmark
- Jump to replies on articles and long posts
- Like a post after you reply to it
- Download images, GIFs, and videos from the share menu
- Mark accounts in your Following list that don't follow you back
- Add an account to an X List from the profile hover card

Language
English and Simplified Chinese. The extension follows your browser language; switch it with the globe button in the popup.

Privacy
Settings, word lists, the block log, and the post library are stored on your device. Requests to X use your existing signed-in session. The developer collects no data and runs no analytics. AI requests are sent only when you click generate or test, and only to the service address you authorize.

oh-my-x is not affiliated with X Corp.

Source code: https://github.com/longhaiqwe/oh-my-x
Privacy policy: https://github.com/longhaiqwe/oh-my-x/blob/main/PRIVACY.md
```

## 六、待你决定的事

1. GitHub 首页先显示英文还是中文。现在 `README.md` 是中文，`README.en.md` 是英文，两边互相链接。
2. `hero.webp` 是否保留瑞士军刀造型。
3. 英文截图用哪个账号：改现有 X 账号的显示语言，还是用英文测试号。
4. 是否加 `_locales/zh_TW`。

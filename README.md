<p align="center">
  <img src="assets/logo.png" width="96" height="96" alt="oh-my-x Logo" />
</p>

<h1 align="center">oh-my-x</h1>

<p align="center">
  <strong>给 X（Twitter）网页端补上常用但缺失的功能。</strong><br>
  页面布局、垃圾回复过滤、数据标注、创作辅助、快捷互动，每一项都能单独开关。
</p>

<p align="center">
  <a href="https://github.com/longhaiqwe/oh-my-x/releases/latest"><strong>下载最新版</strong></a> ·
  <a href="#安装">安装</a> ·
  <a href="#功能详解">功能详解</a> ·
  <a href="PRIVACY.md">隐私政策</a>
</p>

<p align="center">
  <img src="docs/images/hero.webp" width="640" alt="oh-my-x 的功能分类：界面定制、评论与内容过滤、爆款雷达、数据与收益分析、用户与列表管理、发帖排期、目录与回复导航、AI 转发总结、链接与媒体工具、快捷互动" />
</p>

<p align="center">
  <sub>简体中文界面 · Chrome / Edge（Manifest V3） · 设置和数据只存在本机 · AI 功能可选，使用你自己配置的服务</sub>
</p>

---

## 为什么做这个

X 网页端有不少操作要绕路，比如：

- 长文和帖子下面混着大量塞满 emoji 的引流号、色情引流号回复；
- 在几千字的长文下面回复，要往下滚好几屏才到输入框；
- 想在新帖里引用自己以前的帖子或长文，要另开一个标签页去找链接；
- 在自己的「正在关注」列表里看不出谁没回关，只能一个个点进主页确认。

oh-my-x 在星川（[@star_flow_ai](https://x.com/star_flow_ai)）的 [X Focus](https://x.com/star_flow_ai/status/2097583620936585339) 基础上开发，加入了作者自己和 X 上朋友们提出的需求。用不上的功能都可以在设置里关掉。

## 功能一览

<p align="center">
  <img src="docs/images/modules.webp" width="850" alt="五个功能模块" />
</p>

设置弹窗按五个模块分标签，下表和后文的名称与弹窗一致：

| 模块 | 功能 |
|------|------|
| [01 界面与阅读](#01-界面与阅读) | 时间线宽度、隐藏右侧边栏和发帖按钮、导航栏按钮与文字、长文目录 |
| [02 内容过滤](#02-内容过滤) | 垃圾回复过滤（9 条规则 + 垃圾词库）、账号例外、拦截记录、正文关键词过滤 |
| [03 数据洞察](#03-数据洞察) | 原创内容奖励计划、博主活动度、爆款雷达、数据比例徽章、用户粉丝数、收藏量 |
| [04 创作与发布](#04-创作与发布) | 引用我的帖子、AI 总结转发、排期全景 |
| [05 互动与列表](#05-互动与列表) | 快捷键与底部悬浮条、直达回复区、回复自动点赞、媒体下载、未互关标记、X Lists |

---

## 安装

### 方式一：下载发行包（推荐，不需要开发环境）

1. 在 [Releases 页面](https://github.com/longhaiqwe/oh-my-x/releases/latest) 下载 `oh-my-x-chrome-mv3.zip`
2. 解压，得到 `chrome-mv3` 文件夹。把它放在一个固定位置，以后不要挪动
3. 打开 `chrome://extensions`（Edge 同样适用），开启右上角的「开发者模式」
4. 点「加载已解压的扩展程序」，选择 `chrome-mv3` 文件夹

**升级**：解压新版本，用里面的文件覆盖原来的 `chrome-mv3` 文件夹，再到 `chrome://extensions` 点 oh-my-x 卡片上的刷新按钮。

> [!WARNING]
> 换文件夹位置，或点「移除」后重新加载，Chrome 会当成一个新扩展，设置、词库和拦截记录都会清空。

### 方式二：从源码构建

需要 Node.js 24（自带 npm）。

```bash
git clone https://github.com/longhaiqwe/oh-my-x.git
cd oh-my-x
npm install
npm run build
```

然后在 `chrome://extensions` 开启「开发者模式」，点「加载已解压的扩展程序」，选择 `oh-my-x/build/chrome-mv3/`。

### 方式三：Chrome 网上应用店

> 审核中，通过后补上安装链接。

---

## 功能详解

### 01 界面与阅读

<p align="center">
  <img src="docs/images/module-layout.webp" width="420" alt="设置弹窗的「界面」标签" />
</p>

#### 时间线宽度

在 600 到 800 像素之间调整主时间线的宽度，也就是下图箭头标出的那一段。

<p align="center">
  <img src="docs/images/layout-timeline-width.webp" width="850" alt="时间线宽度示意" />
</p>

#### 隐藏右侧边栏、隐藏发帖按钮

两个开关，打开即隐藏。右侧边栏包括搜索、推荐关注和趋势；发帖按钮隐藏后可以按 `N` 发帖，搜索可以从左侧「探索」进入。屏幕较小时隐藏这两块，时间线能占更多空间。

<p align="center">
  <img src="docs/images/layout-hide-sidebar.webp" width="850" alt="隐藏右侧边栏和发帖按钮后的页面" />
</p>

#### 导航栏按钮与文字

探索、通知、聊天、Grok、Premium、历史、文章、个人资料、更多、X Money 共 10 个按钮可以分别隐藏。被 X 收进「更多」菜单的入口，也会在菜单里一起隐藏。导航文字可设为从不、悬停或始终显示。

<p align="center">
  <img src="docs/images/layout-nav-buttons.webp" width="850" alt="设置里的导航栏按钮（❶）和页面左侧导航栏（❷）一一对应" /><br>
  <sub>设置里的按钮（❶）和页面左侧导航栏（❷）一一对应</sub>
</p>

#### 长文目录

在长推文、长文阅读页和长文编辑器侧边，提取一级和二级标题生成目录，点击跳到对应位置。能识别 Markdown 标题（`#`、`##`）、「一、」「第一章」这类中文序号、「1.」「(1)」这类数字序号，以及整段加粗的段落。

<p align="center">
  <img src="docs/images/layout-article-toc.webp" width="850" alt="长文页右侧的目录" />
</p>

### 02 内容过滤

<p align="center">
  <img src="docs/images/module-filter.webp" width="420" alt="设置弹窗的「过滤」标签" />
</p>

#### 垃圾回复过滤

按规则给推文详情页里的回复打分，得分达到隐藏阈值（默认 55，可在 20 到 150 之间调整）的回复会被隐藏。只处理推文详情页的对话，首页等时间线不处理。

**9 条检测规则**，可逐条开关：

| 规则 | 检测内容 | 默认分 |
|------|---------|--------|
| 营销昵称 | 昵称含「点击主页 / 同城 / 约会 / 固炮」等词 | +40 |
| Emoji 占比 | 回复中 emoji 超过文字的一半 | +20 |
| 评论过短 | 正文少于 8 个字符 | +10 |
| 随机用户名 | 用户名像随机的字母加数字组合（特征明显时最高 +25） | +10 |
| 垃圾词库 | 回复命中词库中的词（多词累加，最高 65） | +35 |
| 纯 Emoji 评论 | 去掉 emoji 后内容为空 | +40 |
| 装饰昵称 | 昵称含 2 个以上 emoji | +15 |
| 重复字符 | 同一字符连续重复 4 次以上（如「哈哈哈哈」） | +20 |
| 矩阵引流 | 回复中 @ 其他账号，并带随机字符或表情 | +20 |

- **垃圾词库**：第一个命中的词 +35，每多命中 1 个不同的词再加 15，最高 65。和正文屏蔽词分开管理。
- **选词**：推文右上角「更多」按钮旁的选词按钮，可以从昵称和回复内容里点选词语加入词库。
- **调试模式**：在每条回复下显示得分和命中的规则，用来调整阈值和词库。

<p align="center">
  <img src="docs/images/filter-rules.webp" width="49%" alt="检测规则设置" />
  <img src="docs/images/filter-pick-words.webp" width="49%" alt="从回复中选词加入垃圾词库" /><br>
  <sub>左：检测规则；右：从回复里选词加入垃圾词库</sub>
</p>

#### 账号例外

按 `@handle` 设置白名单和黑名单：白名单作者的回复不隐藏，黑名单作者的回复全部隐藏。推文右上角「更多」按钮旁的名单按钮可以直接把作者加入名单。

<p align="center">
  <img src="docs/images/filter-account-lists.webp" width="640" alt="在回复上直接加入白名单或黑名单" />
</p>

#### 拦截记录

本机保存最近 50 条被隐藏的回复，记下命中的规则和得分，并按分类统计每天的数量。「过滤」页显示今日拦截总数和最近几条记录，点「全部记录」查看详情。

<p align="center">
  <img src="docs/images/filter-log.webp" width="420" alt="拦截记录详情" />
</p>

#### 正文关键词过滤

信息流中正文含屏蔽词的推文，可以折叠成一行提示（点击展开，可再收起），也可以直接隐藏。

<p align="center">
  <img src="docs/images/filter-tweet-collapse.webp" width="850" alt="命中屏蔽词的推文被折叠为一行提示" />
</p>

### 03 数据洞察

<p align="center">
  <img src="docs/images/module-insight.webp" width="420" alt="设置弹窗的「数据」标签" />
</p>

#### 原创内容奖励计划

在弹窗里显示创作者奖励计划的曝光进度和各项准入条件，不用在 X 里点好几层去找。

<p align="center">
  <img src="docs/images/insight-creator-rewards.webp" width="420" alt="原创内容奖励计划的曝光进度和准入条件" />
</p>

#### 博主活动度

在博主主页点「扫描近 7 天」，统计这位博主近 7 天每天的帖子数和回复数，可以看出对方主要在发帖，还是常在评论区互动。X 接口有调用频率限制，短时间扫描太多次会提示稍后再试。

<p align="center">
  <img src="docs/images/insight-profile-activity.webp" width="420" alt="博主近 7 天的帖子数和回复数" />
</p>

#### 爆款雷达

按每小时浏览量（浏览量 ÷ 发布时长）把推文分为普通、潜力和爆款（默认分界线为每小时 1000 和 10000 次浏览），在信息流中加标签，可选边框、背景或两者一起高亮。

<p align="center">
  <img src="docs/images/insight-viral-radar.webp" width="640" alt="信息流中被标为潜力或爆款的推文" />
</p>

#### 数据比例徽章

在博主主页的推文下，给浏览、回复、转帖、喜欢各加一个徽章，显示这个数和作者粉丝数的比值，并按评级标准分为差、普通、良好、优秀、爆火五档。

<p align="center">
  <img src="docs/images/insight-stat-ratio.webp" width="640" alt="推文下的数据比例徽章" />
</p>

#### 用户粉丝数

在推文作者旁和关注、粉丝、搜索等用户列表中显示粉丝数（如「12.5万 粉丝」），悬停查看精确的粉丝数和关注数。可选「全部」（默认，推文作者和用户列表都显示）、「仅列表」或「关闭」。

<p align="center">
  <img src="docs/images/insight-follower-count.webp" width="850" alt="回复者昵称旁显示的粉丝数" />
</p>

#### 收藏量

在推文的书签按钮旁显示收藏数。可以在「数据 → 页面标注」关闭，关闭后已显示的数字会立即移除。

<p align="center">
  <img src="docs/images/insight-bookmark-count.webp" width="640" alt="书签按钮旁显示的收藏数" />
</p>

### 04 创作与发布

<p align="center">
  <img src="docs/images/module-create.webp" width="420" alt="设置弹窗的「创作」标签" />
</p>

#### 引用我的帖子

在发帖、引用和回复编辑器里多一个按钮，搜索自己发过的帖子和长文，点击结果把链接插入草稿，不用另开标签页去找。

- 帖子正文、长文标题、日期和链接按账号分开，存在扩展本地的 IndexedDB（浏览器内置的数据库）里。
- 打开已登录的 X 后自动分批同步历史帖子（每批最多 20 页、每页间隔 2.5 秒，断点会保存，关掉页面下次打开接着同步），之后约每 30 分钟检查一次新帖。多个标签页共用一把同步锁，可以暂停和继续。
- 可以在「创作 → 引用我的帖子」关闭「打开 X 时自动同步」，关闭后已有缓存仍可搜索，也可以手动同步。
- 受 X 接口返回范围限制，不保证能拿到全部历史；本地副本可能保留已删除或修改前的内容。不会自动发帖。

<p align="center">
  <img src="docs/images/create-own-posts-button.webp" width="640" alt="发帖编辑器工具栏里的「引用我的帖子」按钮" />
</p>
<p align="center">
  <img src="docs/images/create-own-posts-search.webp" width="480" alt="搜索自己的帖子和长文" />
</p>

#### AI 总结转发

在发帖和引用编辑器里，点「每个人」右侧的「AI 总结」按钮，读取被引用推文的全文，用你配置的模型生成两条转发草稿。选一条填进编辑器，再自己修改。

- 支持 OpenAI 兼容接口。在「创作 → AI 总结转发」填写接口地址、API Key 和模型名称，点「授权并测试连接」。扩展只申请这个服务地址的访问权限，拒绝授权就不会发请求。
- 转发风格可以自己设：「风格描述」写一段想要的风格，「参考样本」贴 2 到 5 条自己写过的转发，每条之间用单独一行 `---` 隔开。两项都不填时用默认的平实风格。
- 生成时会把原文、作者信息、文章标题、转发风格和补充要求发给你配置的服务，连接测试只发送测试文本。每次请求 25 秒超时；点取消或关闭面板会中止请求，但服务商可能已经处理并计费。远程服务建议用 HTTPS。

<p align="center">
  <img src="docs/images/create-ai-repost-button.webp" width="49%" alt="引用编辑器里的「AI 总结」按钮" />
  <img src="docs/images/create-ai-repost-drafts.webp" width="49%" alt="生成的两条转发草稿" /><br>
  <sub>左：引用编辑器里的「AI 总结」按钮；右：生成的两条转发草稿</sub>
</p>
<p align="center">
  <img src="docs/images/create-ai-repost-style.webp" width="420" alt="转发风格设置" />
</p>

#### 排期全景

在定时发布弹窗和草稿箱里，列出所有定时帖的发布时间、距离现在多久，以及相邻两条之间的间隔。间隔按小于 2 小时、2 到 8 小时、8 到 24 小时、24 小时以上分色显示，小于 2 小时时提示间隔过密。

<p align="center">
  <img src="docs/images/create-schedule-popup.webp" width="640" alt="定时发布弹窗里的排期全景" /><br>
  <sub>定时发布弹窗</sub>
</p>
<p align="center">
  <img src="docs/images/create-schedule-drafts.webp" width="640" alt="草稿箱里的排期全景" /><br>
  <sub>草稿箱</sub>
</p>

右侧栏搜索框下面还有一个排期面板：按天列出待发布的定时帖，每条显示发布时间和正文开头，相邻两条之间标出间隔，跨天的间隔写在日期那一行。点刷新按钮会直接向 X 重新读取排期，不用打开草稿箱；新建、修改、删除定时帖后也会自动重新读取。面板可以收起，不需要时在设置弹窗「创作 → 排期全景 → 右侧栏面板」里关掉。

### 05 互动与列表

<p align="center">
  <img src="docs/images/module-engage.webp" width="420" alt="设置弹窗的「互动」标签" />
</p>

#### 快捷键与底部悬浮条

在推文详情页按数字键操作：`1` 回复、`2` 引用、`3` 点赞、`4` 收藏。页面底部还会显示这四个操作的按钮条，可以单独关闭。

<p align="center">
  <img src="docs/images/engage-dock.webp" width="640" alt="推文详情页底部的悬浮操作条" />
</p>

#### 直达回复区

在长文和长推文页右下角显示一个按钮，点击跳到评论区和回复框；到达评论区后按钮变成「回到正文」，再点一次回到正文。按钮挡住内容时，可以按住拖到别的位置，松开后位置会记住。

<p align="center">
  <img src="docs/images/engage-jump-replies.webp" width="640" alt="长文页右下角的直达回复区按钮" />
</p>

#### 回复自动点赞

回复别人的推文后，给这条推文点赞。点赞前随机等待 0.3 到 0.7 秒；已赞过的推文和自己的推文不点。

<p align="center">
  <img src="docs/images/engage-auto-like.webp" width="640" alt="回复后自动点赞" />
</p>

#### 媒体下载

在推文的分享菜单里加入下载图片、GIF 和视频（MP4）的选项，样式和菜单里的其他选项一致。你自己发的视频，X 菜单里已有「下载视频」，这时不再重复加入。

<p align="center">
  <img src="docs/images/engage-media-download.webp" width="480" alt="分享菜单里的下载视频选项" />
</p>

#### 未互关标记

在你的「正在关注」列表里，把没有关注你的账号标红。

<p align="center">
  <img src="docs/images/engage-non-followers.webp" width="640" alt="「正在关注」列表中未回关的账号被标红" />
</p>

#### X Lists

- 左侧导航栏加入「我的 Lists」入口，点击展开全部列表；位置可选「Home 上方」或「列表区」，切换后立即生效。
- 鼠标悬停在头像或用户名上时，资料卡里出现「+ List」按钮，点击后选择列表加入，不用进对方主页。
- 在设置里同步当前账号已有的 Lists，或通过链接、ID 手动添加。

<p align="center">
  <img src="docs/images/engage-lists-nav.webp" width="49%" alt="左侧导航栏的「我的 Lists」入口" />
  <img src="docs/images/engage-lists-card.webp" width="49%" alt="资料卡里的「+ List」按钮" /><br>
  <sub>左：导航栏的「我的 Lists」；右：资料卡里的「+ List」</sub>
</p>

---

## 设置弹窗与完整设置页

点浏览器工具栏里的 oh-my-x 图标打开设置弹窗（400 像素宽），按 5 个模块分标签（模块归属定义在 `shared/feature-registry.ts`）：

| 标签（模块） | 功能 |
|------|------|
| **界面**（界面与阅读） | 时间线宽度、右侧边栏、发帖按钮、导航栏按钮与文字、长文目录 |
| **过滤**（内容过滤） | 垃圾回复过滤（今日拦截、隐藏阈值、调试模式、9 条检测规则、垃圾词库）、正文关键词过滤与屏蔽词、账号例外（白名单 / 黑名单）、拦截记录 |
| **数据**（数据洞察） | 看板：原创内容奖励计划、博主活动度；页面标注：爆款雷达、数据比例徽章、用户粉丝数、收藏量 |
| **创作**（创作与发布） | 引用我的帖子、AI 总结转发、排期全景 |
| **互动**（互动与列表） | 快捷键与底部悬浮条、直达回复区、回复自动点赞、媒体下载、未互关标记、X Lists |

「过滤」页分两层：第一层显示每个功能的开关和当前状态，点卡片右下角的「详细设置」「管理屏蔽词」「管理名单」「全部记录」进入第二层，左上角返回。

**完整设置页**：点弹窗右上角的「完整设置」按钮，会在新标签页整页打开设置，并定位到弹窗当前所在的模块；也可以在 `chrome://extensions` 的扩展详情里点「扩展程序选项」打开。设置页和弹窗内容相同、设置共用，适合编辑词库、名单和 AI 服务配置。地址末尾的 `#layout`、`#filter`、`#insight`、`#create`、`#engage` 对应五个模块。

<p align="center">
  <img src="docs/images/popup-header.webp" width="420" alt="弹窗右上角的「完整设置」按钮" />
</p>
<p align="center">
  <img src="docs/images/options-page.webp" width="850" alt="在新标签页打开的完整设置页" />
</p>

---

## 隐私

- **本地保存**：设置、关键词、拦截日志及 AI API Key 保存在 `browser.storage.local`，帖子库保存在扩展本地 IndexedDB。API Key 未由扩展加密，界面遮罩仅用于隐藏显示。
- **X 请求**：帖子同步、Lists、用户指标、创作者奖励和互动辅助会使用已有登录会话与 X 通信。开发者不接收这些数据，也不收集遥测。
- **可选 AI 请求**：只有用户主动生成或测试时，才向已授权的服务地址发送相应内容；该服务商的数据和计费条款适用。AI 请求不携带浏览器 Cookie。
- **权限**：使用 `storage`、`cookies`、`alarms`、`downloads`、`scripting`；默认主机权限限于 X 相关域名和 `abs.twimg.com`。自定义 AI 主机通过可选权限按需授权，可在 Chrome 扩展设置中管理。
- **脚本运行范围**：仅在 `twitter.com`、`mobile.twitter.com`、`x.com`、`pro.x.com` 注入页面脚本。

详见 [隐私政策](PRIVACY.md)。

---

## 反馈与交流

- 遇到问题或有新需求，欢迎提 [Issue](https://github.com/longhaiqwe/oh-my-x/issues) 或 Pull Request，也欢迎基于源码自己改。
- X 用户群：[点此加入](https://x.com/i/chat/group_join/g2111364237507670445/ElRmy78U7D)，使用建议在这里反馈，和现有功能不冲突的会尽量实现。
- 作者：龙海 [@longhaiqwe123](https://x.com/longhaiqwe123)

## 致谢

- 星川（[@star_flow_ai](https://x.com/star_flow_ai)）的 [X Focus](https://x.com/star_flow_ai/status/2097583620936585339)：oh-my-x 在它的基础上开发。
- 在 X 上提出需求和建议的朋友们。

---

## 开发

```bash
npm install
npm run dev        # 开发模式（HMR）
npm run build      # 生产构建
npm test           # 运行单元、DOM 与集成测试
npm run typecheck  # 检查 TypeScript 与 Vue 脚本、模板
npm run check      # 类型检查 + 全量测试 + 生产构建
npm run zip        # 构建 + 打包 ZIP
npm run clean      # 清理构建产物
```

GitHub Actions 会在 push、pull request 和手动触发时执行 `npm ci` 与 `npm run check`，通过后保存 Chrome 扩展构建产物 7 天。

**发布新版本**：先把 `package.json` 的 `version` 改成新版本号并提交，再推送同名标签（如 `git tag v2.0.0 && git push origin v2.0.0`）。`release.yml` 会检查标签与版本号一致，跑完 `npm run check` 后把 `oh-my-x-chrome-mv3.zip` 发到 Releases 页面。CI 使用 Node.js 24；本地建议使用 Node.js 24.15 或更新的 24.x。

### 技术栈

| 领域 | 选型 |
|------|------|
| 扩展框架 | WXT + Vite |
| UI | Vue 3 + reka-ui |
| 样式 | Tailwind CSS 4 |
| 类型 | TypeScript |
| 测试 | Vitest + jsdom |

### 项目结构

```
oh-my-x/
├── entrypoints/
│   ├── content.ts       # 注入 x.com 的内容脚本（isolated world）
│   ├── interceptor.content.ts # MAIN world 数据拦截器（排期接口拦截）
│   ├── background.ts    # Service Worker（默认词库同步、帖子库、Lists 与媒体请求、创作者奖励、AI 请求）
│   ├── popup/           # 设置弹窗（Vue 3 SPA，5 个模块标签）
│   └── options/         # 完整设置页（新标签页打开，复用弹窗的模块页）
├── content-scripts/     # DOM 操作和功能实现
│   ├── features/        # 页面功能（爆款雷达、长文目录、Lists、快捷互动、AI 转发等）
│   ├── spam/            # 垃圾评论扫描引擎与规则检测
│   ├── options/         # 各功能选项（时间线、导航、编辑器、数据比例等）
│   └── utilities/       # 工具函数与 Storage 封装
├── shared/              # 跨环境共享逻辑（功能清单、规则引擎、AI 提示词、数据类型）
├── docs/images/         # README 插图
├── test/                # Vitest 测试套件（单元、集成与样本测试）
└── storage-keys.ts      # 全部 storage key + 默认值
```

---

## License

MIT

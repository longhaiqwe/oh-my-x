# Chrome 应用商店提交资料

后续发布默认按 [Chrome 原生界面送审流程](chrome-native-review-workflow.md) 操作（2026-11-12 用户确认）。本文保留历次提交记录；旧版本的字段模板不作为当前填写依据。

## 2026-11-13：3.1.0 已提交审核

- 提交前在后台核实 3.0.0 已发布；本次以 3.0.0 → 3.1.0 整理中英文更新。
- 主要新增 2–20 张图片排序、总览／大图切换、按编号移到首尾及边缘滚动；修复裁剪页编辑按钮、通知缩放布局和跨标签页切换。
- 1598 项测试、类型检查、干净生产构建通过；本地首次英文弹窗测试超时，单独复测和降低并发后的全量测试均通过。GitHub Check 和 Release 默认检查均通过。
- 上传包 `build/oh-my-x-3.1.0-chrome.zip`，45 个文件、2,116,706 字节，权限与 3.0.0 相同。
- 2026-11-13 15:29（北京时间），后台显示「已将您的扩展程序提交送审」及「待审核」，保留审核通过后自动发布。更新中英文介绍与 438 字符测试说明，沿用现有图片和隐私声明。
- [GitHub 3.1.0](https://github.com/longhaiqwe/oh-my-x/releases/tag/v3.1.0) 已发布；详见 [3.1.0 发布与送审记录](releases/v3.1.0-store.md)。

## 2026-11-12：3.0.0 已提交审核

- 对外更新说明以 2.9.0 为比较基线，合并 2.10.0 尚未在 Chrome 商店发布的改动。2.10.0 的 GitHub 发布记录保留，不作为商店已发布版本。
- 累计新增粉丝与关注分析（含认证粉丝）、奖励历史看板及图片导出、AI 转发风格、编辑器列表、通知筛选与回复入口、收藏头像，并修复名单采集、通知已读同步、界面布局和图片文字识别问题。
- 本次类型检查、131 个测试文件中的 1585 项测试、生产构建通过。12 组奖励看板、8 组粉丝面板布局、三类名单的扩展集成及 7 轮真实图片识别检查通过。浏览器检查使用合成数据，不操作真实 X 账号。
- 商店包为 `build/oh-my-x-3.0.0-chrome.zip`；权限与 2.9.0 相同。
- 2026-11-12 14:10（北京时间）通过 Chrome 原生界面完成上传和提交。后台显示「已将您的扩展程序提交送审」及「待审核」，保留通过审核后自动发布；提交前已确认线上版本为 2.9.0。
- 浏览器扩展控制工具此前导航后台返回 `Not allowed`，原因未知；商店脚本当时缺少授权凭据。两者都不是本次成功送审使用的方式。
- 送审资料见 [3.0.0 送审说明](releases/v3.0.0-store.md)。


## 2026-11-12：2.10.0 发布准备，送审受阻

- 相比 GitHub 2.9.0，新增粉丝与关注分析、转发风格库、编辑器列表按钮，并改进通知卡片、收藏头像。
- 类型检查、129 个测试文件中的 1564 项测试和生产构建通过。另通过 6 种粉丝面板布局、生产扩展合成数据集成检查，以及通知卡片三种主题和三档宽度的布局检查；未调用真实 AI 服务或在真实 X 账号上执行互动。
- 商店包为 `build/oh-my-x-2.10.0-chrome.zip`。新包的权限与 2.9.0 相同；若商店仍为 2.8.0，还需补充 2.9.0 引入的 `offscreen` 和图片识别说明。
- 本次商店脚本仍缺少 clientId、clientSecret、refreshToken；浏览器工具打开开发者后台返回 `Not allowed`。未上传、未提交审核；商店当前版本待确认。
- 本次送审用文字见 [2.10.0 送审说明](releases/v2.10.0-store.md)。下面保留历史资料，涉及新增功能的数据申报应以最新说明和当前代码为准。


## 2026-11-10：2.9.0 发布准备，尚未送审

- 新增回看、本地图片文字识别及通知用户卡片，代码与标签已推送 GitHub。
- 本地类型检查、118 个测试文件中的 1398 项测试和生产构建通过；GitHub Check 与 Release 工作流通过。
- 后台实测线上版本为 2.8.0；README 中“审核中”的过期安装说明已替换为商店链接。
- 商店包：`build/oh-my-x-2.9.0-chrome.zip`，41 个文件，manifest 版本 2.9.0。
- 商店包 SHA-256：`bf00fc72cf9ca98a29ace5d26de88bedd96ca037277bbac60864c6e79e2a41bc`。
- 尚未上传或提交审核：浏览器自动化明确禁止当前网址并终止会话；发布脚本缺少 clientId、clientSecret、refreshToken。没有撤回或更改既有线上版本。
- 后续提交时须补充 offscreen 权限理由（在扩展离屏文档中运行随包 OCR worker），更新 alarms 理由以包含 OCR 任务恢复，说明可选图片与语言数据来源权限；下载的是语言数据，运行代码与 WASM 随扩展打包。

文档与实现差异：早期回看设计建议独立 OCR 表及复合时间索引；实际采用账号索引，并将 OCR 文本保存在媒体记录中，验收记录已说明。保留实际代码结构。


更新：2026-11-09，2.8.0 已提交审核，设置为审核通过后自动发布；提交前商店线上版本已核对为 2.7.0。历史提交记录保留原日期与状态。

规则来自 developer.chrome.com（2026-10-19 查阅）：[注册](https://developer.chrome.com/docs/webstore/register)、[商品详情](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)、[隐私权规范](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)、[用户数据常见问题](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)、[审核流程](https://developer.chrome.com/docs/webstore/review-process)。

商店英文资料（英文详细说明、截图建议）在 [english-launch-checklist.md](english-launch-checklist.md) 第四、五节，本文不重复。

## 一、上传的包

```bash
npm run zip
```

生成 `build/oh-my-x-<版本号>-chrome.zip`，`manifest.json` 在压缩包根目录。工作目录里有未提交的改动时，改在只含已推送提交的干净目录里打包。

2.3.1 和 GitHub Releases 的 2.3.0 相比，只多了 AI 服务地址的 HTTPS 限制（见第五节）。

GitHub Releases 里的 `oh-my-x-chrome-mv3.zip` 顶层多一层 `chrome-mv3/` 文件夹，不能传商店。

## 二、开发者账号（只能本人操作）

| 步骤 | 说明 |
|------|------|
| 打开后台 | https://chrome.google.com/webstore/devconsole ，首次进入是注册页 |
| 开发者邮箱 | 注册后不能改。官方建议用一个专门发布用、常看的邮箱 |
| 注册费 | 一次性。官方注册页没写金额，其他资料写的是 5 美元 |
| 两步验证 | Google 账号要开两步验证，否则不能发布和更新（来自第三方资料，官方注册页没写） |
| 地区 | 支持列表 73 个国家和地区，含中国、香港、台湾（列表页 2024-02-13 更新） |
| 交易者声明 | 按欧盟《数字服务法》选「交易者」或「非交易者」。Google 不替开发者判断 |

## 三、商品详情（Store listing）

| 字段 | 填什么 |
|------|-------|
| 详细说明（英文） | english-launch-checklist.md 第五节 |
| 详细说明（中文） | 本文第六节 |
| 类别 | 已选「社交」（后台值 CATEGORY_SOCIAL_NETWORKING，在「生活风尚」分组下） |
| 语言 | 英文；另加简体中文 |
| 商店图标 | 128×128，包里已有 `icons/128.png` |
| 截图 | 1280×800，至少 1 张，最多 5 张。已做 5 张，在 `docs/store-assets/screenshot-*.png`，中文说明（`zh-`）和英文说明（`en-`）各一套，按文件名序号上传。第 1 张「多图排版与排序」用的是你 2026-10-19 提供的截图，第 2 到 5 张取自 README 配图（2026-10-18 提交）。截图里的界面都是中文 |
| 小宣传图 | 440×280，PNG 或 JPEG，必填，所有语言共用。已做：`docs/store-assets/promo-small-440x280.png` |
| 大宣传图 | 1400×560，选填。已做：`docs/store-assets/promo-marquee-1400x560.png` |
| 宣传视频 | YouTube 链接。官方页写在「必须提供的宣传图片和视频」下，旧资料写的是选填，以后台是否标红为准 |
| 主页网址 | https://github.com/longhaiqwe/oh-my-x |
| 支持网址 | https://github.com/longhaiqwe/oh-my-x/issues |

## 四、隐私权规范（Privacy practices）

以下为早期版本模板。3.0.0 已更新本地记录、图片识别及相关数据申报，见 [3.0.0 实际填写记录](releases/v3.0.0-store.md)；后续按当次代码和后台字段调整，不直接复制旧模板。

### 单一用途（Single purpose）

```text
oh-my-x adds layout, filtering, insight, writing, and interaction features to the X (Twitter) website. Its content scripts run only on x.com, twitter.com, mobile.twitter.com, and pro.x.com. On other pages it acts only when the user chooses "Save to X drafts" from the right-click menu, which saves the selected text to the user's X drafts.
```

2.5.0 起用上面这段。2.3.1 用的是「It runs only on x.com, twitter.com, mobile.twitter.com, and pro.x.com.」，加了右键存草稿后和实际不符，2026-10-26 提交 2.5.0 时改掉。

### 权限理由（Permission justification）

storage

```text
Stores the user's settings, word lists, allow and block lists, block log, own-post library, and cached X data (Lists, Creator Rewards numbers) on the device.
```

cookies

```text
Reads the X cookies ct0 (CSRF token) and twid (signed-in account ID) to send requests to X with the user's existing session and to keep data separate for each X account. Only X cookies are read.
```

alarms

```text
Schedules periodic tasks: syncing the user's own-post library in open X tabs, and refreshing Creator Rewards numbers.
```

downloads

```text
Saves images, GIFs, and videos from a post when the user clicks Download in the post's share menu.
```

scripting

```text
When the user clicks "Scan last 7 days" in the popup on an X profile page and the page's content script does not respond (for example right after an extension update), the extension injects its own bundled scan function into that X tab. Used only on the active X tab and only after that click. It is also used with activeTab to read the selected text once after the user clicks "Save to X drafts" in the right-click menu.
```

2.4.0 新增下面两项（右键存草稿）。商店跳过了 2.4.0，2026-10-26 提交 2.5.0 时在后台填上了这两项理由，scripting 理由也换成了上面这段：

contextMenus

```text
Adds one item, "Save to X drafts", to the right-click menu when text is selected. Clicking it saves the selected text and the page link as a draft in the user's X account. The user can turn the item off in the popup.
```

activeTab

```text
After the user clicks "Save to X drafts" in the right-click menu, the extension reads the selected text in that tab once so line breaks are kept. No other access to the tab is used.
```

主机权限（Host permission）

```text
x.com, twitter.com, mobile.twitter.com, pro.x.com: content scripts change the page layout, hide spam replies, and add badges and tools on X pages; the extension calls X's web API on these hosts with the user's session.
video.twimg.com: fetch the selected post’s MP4 for local GIF conversion in an extension page, only after the user chooses Export GIF. No media is sent to an external conversion service.
abs.twimg.com: the background script downloads X's public web client script as text and reads the current GraphQL query ID from it. The script is not executed.
Optional hosts (https://*/*, http://localhost/*, http://127.0.0.1/*): requested at runtime only for the AI service address the user enters, after the user clicks "Authorize and test connection". Remote AI services must use HTTPS; HTTP is accepted only for local services on localhost and 127.0.0.1. No access to other sites is requested at install.
```

### 远程代码（Remote code）

选「No, I am not using remote code」。

依据：`entrypoints/background.ts` 和 `entrypoints/interceptor.content.ts` 下载 X 的脚本后只做 `.text()` 和正则匹配；代码里没有 `eval` 或 `new Function`（2026-10-19 对 2.3.0 的源码和打包后的 `build/chrome-mv3` 搜索确认）。

### 数据使用（Data usage）

官方常见问题写明：只在本机处理和保存的数据也要申报。

| 类别 | 勾选 | 依据 |
|------|------|------|
| 个人身份信息 | 勾 | 帖子库按 X 账号 ID 保存数据 |
| 健康信息 | 不勾 | |
| 财务和付款信息 | 不勾 | |
| 身份验证信息 | 勾 | 读取 X 的 `ct0`、`twid` Cookie；保存用户填的 AI API Key |
| 个人通讯 | 不勾 | 不读私信 |
| 位置 | 不勾 | |
| 网络浏览记录 | 不勾 | 只在 X 页面运行，不记录浏览过的网址 |
| 用户活动 | 不勾（待你判断） | 拦截器读取 X 页面的接口返回内容做过滤，不记录点击、按键、滚动。是否算「网络监控」没有查到明确说明 |
| 网站内容 | 勾 | 保存自己的帖子文字；点生成时把所选帖子正文发到用户配置的 AI 服务 |

下方三条承诺（不出售给第三方、不用于与单一用途无关的目的、不用于信用评估）都符合，全部勾选。

### 隐私政策网址

```text
https://github.com/longhaiqwe/oh-my-x/blob/main/PRIVACY.md
```

## 五、可能被审核追问或拒绝的点

以下是对照政策的推论，没有审核结果佐证。

1. **AI 服务地址的 HTTP**：2.3.1 起远程地址只接受 `https://`，`http://` 只对 `localhost`、`127.0.0.1` 放行（`shared/ai-request.ts`）。2.3.0 及以前远程地址也能填 `http://`。
2. **可选主机权限是 `https://*/*`、`http://localhost/*`、`http://127.0.0.1/*`**（2.3.1 起，之前是 `https://*/*` 和 `http://*/*`）。官方说申请大范围主机权限的扩展审核时间更长。这里是运行时按地址申请，不是安装时申请。
3. **功能多**。单一用途要「窄且容易理解」，单一用途说明按「增强 X 网页端」写。内容脚本只在 X 页面运行；2.4.0 起多了右键存草稿，在其他网页选中文字后存到 X 草稿箱，单一用途说明里单独写明了这一项。
4. **新开发者、新扩展**审核更严，一般几天，可能几周；超过三周可以联系开发者支持。

## 六、商店中文详细说明草稿

以下保留早期中文草稿，未覆盖当前所有功能。后续先按原生界面流程准备本次完整介绍；商店字段使用纯文本。

```text
oh-my-x 给 X（Twitter）网页端补上常用但缺失的功能。每项功能单独开关，设置保存在你的设备上。

界面与阅读
- 时间线宽度可在 600 到 800 像素之间调整
- 隐藏右侧边栏、发帖按钮，以及 10 个导航按钮中的任意几个
- 长文目录：在长帖和文章里按标题跳转

内容过滤
- 垃圾回复过滤：在帖子详情页用 9 条规则和垃圾词库给回复打分，达到阈值的回复隐藏
- 账号例外：按 @用户名 设白名单和黑名单
- 拦截记录：最近 50 条被隐藏的回复
- 正文关键词过滤：时间线里含屏蔽词的帖子折叠或隐藏

数据洞察
- 原创内容奖励计划：近 90 天已验证首页时间线曝光进度（目标 50 万），以及每日奖励进度净变化；支持近 90 天历史看板与本地图片导出
- 博主活动度：近 7 天每天的发帖数和回复数
- 爆款雷达：按每小时浏览量标出潜力帖和爆款帖
- 页面上显示数据比例徽章、用户粉丝数、收藏量

创作与发布
- 引用我的帖子：在编辑器里搜索自己的帖子和文章，插入链接
- 多图排版与排序：支持 2 到 20 张图片排序，4 张以内保留两列；多图可切换总览和大图，支持拖动时边缘滚动，也可直接移到开头或末尾
- AI 总结转发：用你自己的 API Key 和 OpenAI 兼容服务，生成两条引用转发草稿
- 排期全景：列出所有定时帖的发布时间和相邻间隔，右侧栏也有排期面板

互动与列表
- 帖子页数字键：1 回复、2 引用、3 点赞、4 收藏
- 文章和长帖可直达回复区
- 回复后自动点赞该帖
- 从分享菜单下载图片、GIF 和视频
- 在「正在关注」列表里标出没有回关你的账号
- 在资料卡里把账号加入 X 列表

语言
支持英文和简体中文，默认跟随浏览器语言，可在弹窗的地球按钮里切换。

隐私
设置、词库、拦截记录和帖子库保存在你的设备上。对 X 的请求使用你已登录的会话。开发者不收集数据，不做统计。AI 请求只在你点击生成或测试时发出，只发到你授权的服务地址。

oh-my-x 与 X Corp. 无关联。

源代码：https://github.com/longhaiqwe/oh-my-x
隐私政策：https://github.com/longhaiqwe/oh-my-x/blob/main/PRIVACY.md
```

## 七、老用户换商店版

商店版的扩展编号由商店分配，和「加载已解压」的编号不同，Chrome 当成两个扩展。现在插件没有导出、导入设置的功能，从解压版换到商店版后，设置、词库、拦截记录、帖子库都要重新来。

两个版本可以同时装；两边都开着时，同一功能可能在 X 页面上生效两次（推论，未实测）。

## 八、提交前未解决的事

2026-10-19 查的，查的范围是本仓库代码、分支和提交记录。

| 事项 | 状态 | 依据 |
|------|------|------|
| AI 服务地址允许远程 HTTP | 已改，未提交 | 2.3.1：远程只接受 HTTPS，HTTP 只放行 localhost、127.0.0.1；可选主机权限同步收窄。PRIVACY.md 也改了，要推到 GitHub main 后再提交审核 |
| 设置导出、导入 | 没有这个功能 | 代码里搜不到导出、导入、备份设置的功能；没有相关分支或提交 |
| README 写着商店「审核中」 | 未改 | `README.md` 第 88 行「审核中，通过后补上安装链接」，`README.en.md` 第 83 行「Under review」。这句由 2026-10-17 的提交 10bee4b 写入，之前是「即将上线」。2026-10-19 查 longhaiqwe@gmail.com 的开发者后台，当时没有 oh-my-x 的条目 |
| 1280×800 截图 | 已做 5 张 | 见第三节。都是 24 位 PNG，不带透明通道 |
| 440×280 小宣传图 | 已做 | 1400×560 大宣传图也已做。均为 24 位 PNG，不带透明通道 |
| 数据使用「用户活动」是否勾选 | 待你判断 | 见第四节 |
| 开发者账号 | 已有（2026-10-19 你告知） | 两步验证、交易者声明的状态未确认 |

## 九、后台填写进度（2026-10-19）

开发者账号 longhaiqwe@gmail.com 下新建了条目 oh-my-x，ID `ehnedndgpdkclhddhgdkdadhbiafaend`，状态是草稿，还没有提交审核。账号下已发布 2 个扩展，上限 3 个，这是第 3 个。

| 页面 | 已填 |
|------|------|
| 文件包 | 先传了 2.3.0，后换成 `build/oh-my-x-2.3.1-chrome.zip`，后台识别为 2.3.1，语言英语、中文（中国） |
| 商品详情（英语，默认） | 英文说明（本文所引第五节原文）、类别「社交」、商店图标 `public/icons/128.png`、全球通用截图 5 张（`en-`）、小宣传图、大宣传图、首页网址、支持网址 |
| 商品详情（中文） | 中文说明（第六节原文）、本语言截图 5 张（`zh-`） |
| 隐私权 | 单一用途、6 项权限理由（第四节原文，主机权限理由已换成 2.3.1 的写法）；远程代码选「不」；数据使用勾个人身份信息、身份验证信息、网站内容；三条承诺全勾；隐私政策网址。「用户活动」没勾 |
| 分发 | 默认值：免费、公开、所有地区，没改 |
| 测试说明 | 没存上：填进「其他说明」后「保存更改」按钮一直是灰的，原因没查到。要填的话手动粘贴下面这段 |

填完后「我为何无法提交？」的问题列表为空，「提请审核」按钮可点。

测试说明「其他说明」（2026-11-13 更新为 3.1.0 模板，438 字符，上限 500）：

```text
No test account is provided. Sign in to x.com. Toggle features in the extension popup. Image ordering: attach 2–20 images if your X account permits; drag to reorder. Above 4 images, test Overview/Large views, edge scrolling and move to start/end. Open a post with replies to test spam filtering. AI drafts require your own OpenAI-compatible API key; no AI requests are sent without one. No posting is required to inspect the image layout.
```

## 十、2.5.0 提交（2026-10-26）

提交前商店线上和草稿都是 2.3.1，2.3.2 到 2.4.0 没有传过商店。

| 页面 | 改动 |
|------|------|
| 文件包 | 上传 `build/oh-my-x-2.5.0-chrome.zip`（在提交 `1aacb8b` 的干净目录里打包），后台识别为 2.5.0，权限多了 contextMenus、activeTab |
| 隐私权 | 单一用途换成第四节的新写法；scripting 理由换成第四节的新写法；新填 contextMenus、activeTab 理由（第四节原文）；远程代码仍选「不」 |
| 其他页面 | 没改 |

提交时勾选「通过审核后自动发布」。提交后状态「待审核」，线上版本仍是 2.3.1。

操作方法：日常 Chrome（155 版）已开启远程调试，Chrome 资料目录里的 `DevToolsActivePort` 文件写着端口 9222 和浏览器连接路径，HTTP 的 `/json` 接口返回 404，只能用这个路径连 WebSocket。连上后新开后台标签页，用调试接口的 `DOM.setFileInputFiles` 传包、`Input.insertText` 填文字，全程只连一次。Chrome 不允许扩展操作商店页面，所以 Claude in Chrome 用不了。

## 十一、用接口发版（备选，需另行配置）

默认使用 [Chrome 原生界面送审流程](chrome-native-review-workflow.md)。以下仅为脚本已配置并验证可用时的备选操作；没有接口凭据不妨碍通过原生界面送审。

脚本：`scripts/chrome-web-store.mjs`（`npm run store -- <命令>`），调用 Chrome Web Store API v2 的 `upload`、`publish`、`fetchStatus`。不用登录后台。2026-10-28 只用模拟的网络请求测过，还没连真实商店跑过。

### 一次性配置

1. Google Cloud 控制台：新建或选一个项目，启用 Chrome Web Store API。
2. OAuth 同意屏幕：用户类型选「外部」，把 longhaiqwe@gmail.com 加进测试用户。发布状态停在「测试」时，refresh token 7 天后失效（Google OAuth 的规则）；要长期用就改成「正式」。
3. 凭据 → 创建 OAuth 客户端 ID，类型选「桌面应用」。脚本的 `auth` 命令用本机 `127.0.0.1` 回调，只有桌面应用类型可以不登记回调地址。官方文档用的是「Web 应用」+ OAuth Playground，那样拿到的 refresh token 也能用，手动写进配置文件即可。
4. 发布者 ID：开发者后台「发布者 → 设置」里有。
5. 写配置文件 `~/.config/oh-my-x/chrome-web-store.json`（不在仓库里，脚本写入时权限设为 600）：

   ```json
   {
     "clientId": "…",
     "clientSecret": "…",
     "publisherId": "…"
   }
   ```

   也可以用环境变量 `CWS_CLIENT_ID`、`CWS_CLIENT_SECRET`、`CWS_REFRESH_TOKEN`、`CWS_PUBLISHER_ID`；`CWS_CONFIG` 可以换配置文件路径。
6. 跑 `npm run store -- auth`，浏览器里用发布扩展的账号同意授权，refresh token 自动写进配置文件。
7. 跑 `npm run store -- status`，能看到线上版本就说明配好了。

### 接口已配置时的发版步骤

1. 同步更新 package.json、package-lock.json 和中英文 CHANGELOG，验证后提交并推送匹配版本的 v* 标签（GitHub Release 由 .github/workflows/release.yml 发布）。
2. 在干净目录打包：主目录常有没提交的改动，要在只含发版提交的目录里跑 `npm run zip`。
3. `npm run store -- release <包路径>`：上传并提交审核，审核通过后上线。加 `--staged` 则通过后先暂存，再到后台手动发布。
4. `npm run store -- wait`：默认每 10 分钟查一次，审核有结果后退出；被拒时退出码为 2。

### 还要进后台的情况

- 改商店页、截图、隐私权页或可见性。
- 新增权限：先在隐私权页填好理由，再用脚本提交。
- 审核被拒或收到政策警告（`status` 会显示警告），要看具体原因。

按比例放量要求 7 天活跃用户超过 1 万（官方文档），目前用不了。

## 十二、2.6.0 提交（2026-11-06）

商店线上版本与上一个 GitHub Release 均为 2.5.1。本次发布标签 `v2.6.0` 对应提交 `5438afaabb61536b3ecaa3ca5894c18b88cf8dc6`，相较 `v2.5.1` 共 18 个提交、66 个文件变更。主要包括博主收藏及拖拽排序、本地 GIF 导出和复制、推文指标展示，以及 AI 总结和奖励统计修正。

| 项目 | 结果 |
|------|------|
| 本地验证 | 在发版提交的干净目录运行 `npm ci`、`npm run check`、`npm run zip`；107 个测试文件、1305 项测试、类型检查和生产构建全部通过 |
| GitHub | `main` 与 `v2.6.0` 已推送到 `longhaiqwe/oh-my-x`；Check 和 Release 工作流成功；[GitHub Release](https://github.com/longhaiqwe/oh-my-x/releases/tag/v2.6.0) 已发布 |
| 商店安装包 | `build/oh-my-x-2.6.0-chrome.zip`，590119 字节，manifest 位于 ZIP 根目录；后台识别版本为 2.6.0 |
| SHA-256 | `e9054820e095447be54b7c516e637c7e29c7c28881d0a0d0973893cc57858b5a` |
| 商品详情 | 中英文说明均已保存，补充收藏排序、本地 GIF 导出与复制，修正可选 AI 请求的触发方式；保留原有图片 |
| 隐私权 | 更新 storage 与主机权限理由，说明收藏及顺序保存在本机，以及 `https://video.twimg.com/` 用于获取媒体并在本地转换 GIF；原有 7 项 API 权限不变 |
| 审核提交 | 已勾选“通过审核后自动发布”；点击提交后后台显示“已将您的扩展程序提交送审” |

本次通过开发者后台完成提交。浏览器扩展接口无法操作商店域名，改用 Chrome 原生界面操作；未使用远程调试。商店 API 凭据尚未配置，本次没有通过发布脚本调用真实商店 API。

审核提交成功不代表已上架；2.6.0 将在审核通过后自动发布。


## 十三、2.7.0 提交（2026-11-09）

本次新增 XChat 引用我的帖子：点击输入框旁的图标，或在空输入框按 `/`，打开居中的帖子选择器。选中帖子后在光标处插入链接，保留原有草稿，不自动发送。适配 XChat 的 Shadow DOM，并修复点击闪退和弹层偏出屏幕的问题。

| 项目 | 结果 |
|------|------|
| 发布提交 | `44717a5d1e0f2bbf0adf47b1a3384125f242dbf0`，功能提交 `4dd39e5`；`main` 与 `v2.7.0` 已推送 |
| 本地验证 | 独立干净 worktree 运行 `npm ci`、`npm run check`、`npm run zip`；108 个测试文件、1319 项测试、类型检查与生产构建通过 |
| GitHub | Check、Release 工作流成功；[v2.7.0 Release](https://github.com/longhaiqwe/oh-my-x/releases/tag/v2.7.0) 已发布 |
| 商店安装包 | `build/oh-my-x-2.7.0-chrome.zip`，591655 字节，manifest 位于 ZIP 根目录 |
| SHA-256 | `c43b75542434cf4ce3836d930fb4b9b2f3813aa49b90eb39e731b9c103b7d1ce` |
| 权限 | 与 2.6.0 比对，7 项 API 权限、6 项主机权限均未增加 |
| 审核提交 | 2026-11-09 提交，勾选“通过审核后自动发布”；后台明确显示“已将您的扩展程序提交送审” |

本次继续通过 Chrome 原生界面的开发者后台提交，商店 API 凭据仍未配置。商店原有 GitHub 链接校验出现连接超时，已改为同一仓库的可访问入口：主页 `https://github.com/longhaiqwe/oh-my-x/`，支持页为该主页的“反馈与交流”章节，隐私政策为 `https://raw.githubusercontent.com/longhaiqwe/oh-my-x/main/PRIVACY.md`。隐私政策正文、权限声明及商店图片未变。

送审成功不代表已经上架；2.7.0 将在审核通过后自动发布。上传包使用独立发布目录构建，未包含工作区其他未提交功能。

发版文档现直接列出 package.json 与 release.yml 对应的实际操作步骤；仓库中也保留 `AGENT.md` 开发指南。


## 十四、2.8.0 提交（2026-11-09）

提交前在开发者后台确认 2.7.0 已发布。本次主要新增收藏按昵称查找，统一主页、资料卡和侧栏面板的字体及操作，并修复重复 Premium 入口和账号每日分析请求。

| 项目 | 结果 |
|------|------|
| 发布提交 | `19e4a886864f354e2b692202030415ae183ab803`；`main` 与 `v2.8.0` 已推送；相较 `v2.7.0` 共 5 个提交、29 个文件变更 |
| 本地验证 | 从发布提交导出的干净目录运行 `npm ci`、`npm run check`、`npm run zip`；110 个测试文件、1350 项测试、类型检查与生产构建全部通过 |
| 商店安装包 | `build/oh-my-x-2.8.0-chrome.zip`，594139 字节，manifest 位于 ZIP 根目录；后台识别草稿版本 2.8.0，线上版本 2.7.0 |
| 商店包 SHA-256 | `c545825e64c1a11b6c81ec389514697aab029a9eadc54cfa9b5ce7f989aa466d` |
| GitHub | [v2.8.0 Release](https://github.com/longhaiqwe/oh-my-x/releases/tag/v2.8.0) 使用已通过本地完整验证的同一构建，顶层增加 `chrome-mv3/` 目录；逐文件比较确认 30 个文件内容与商店包一致 |
| GitHub 包 SHA-256 | `098e640ed685946729bd5d72838b521fda989e5a485cbdd3adc3f9497e0bf495`，595716 字节 |
| 权限与隐私 | 与 2.7.0 比对，API 权限、主机权限及可选主机权限均未变化；隐私政策补充昵称查询使用既有 X 会话，选定账号保存在本机 |
| 商品详情 | 中英文说明均已保存，补充按昵称查找收藏及 XChat 引用帖子；保留原有图片和链接 |
| 审核提交 | 已勾选“通过审核后自动发布”；后台显示“已将您的扩展程序提交送审” |

GitHub 标签的 Check 与 Release 工作流在 `npm ci` 阶段遇到第三方镜像站错误：下载 `xmlchars-2.2.0.tgz` 返回 HTTP 500（镜像站数据库缺表）。同一依赖的 npm 官方地址返回 HTTP 200。已通过后续提交 `9e2dab5` 将锁文件中 94 个镜像下载地址改为 npm 官方源，依赖版本与完整性校验值均未改变；保留已发布标签，未移动标签。GitHub Release 由本次已验证构建直接上传。修复后的 [Check 工作流](https://github.com/longhaiqwe/oh-my-x/actions/runs/42644104580) 已成功完成，依赖安装、类型检查、测试和构建均通过。

本次通过 Chrome 原生界面的开发者后台完成送审。提交审核成功不代表已经上架；2.8.0 将在审核通过后自动发布。

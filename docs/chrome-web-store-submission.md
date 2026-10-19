# Chrome 应用商店提交资料

更新：2026-10-19，对应版本 2.3.1。

规则来自 developer.chrome.com（2026-10-19 查阅）：[注册](https://developer.chrome.com/docs/webstore/register)、[商品详情](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)、[隐私权规范](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)、[用户数据常见问题](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)、[审核流程](https://developer.chrome.com/docs/webstore/review-process)。

商店英文资料（英文详细说明、截图建议）在 [english-launch-checklist.md](english-launch-checklist.md) 第四、五节，本文不重复。

## 一、上传的包

```bash
npm run zip
```

生成 `build/oh-my-x-2.3.1-chrome.zip`，`manifest.json` 在压缩包根目录。

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

以下英文可直接粘贴。

### 单一用途（Single purpose）

```text
oh-my-x adds layout, filtering, insight, writing, and interaction features to the X (Twitter) website. It runs only on x.com, twitter.com, mobile.twitter.com, and pro.x.com.
```

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
When the user clicks "Scan last 7 days" in the popup on an X profile page and the page's content script does not respond (for example right after an extension update), the extension injects its own bundled scan function into that X tab. Used only on the active X tab and only after that click.
```

主机权限（Host permission）

```text
x.com, twitter.com, mobile.twitter.com, pro.x.com: content scripts change the page layout, hide spam replies, and add badges and tools on X pages; the extension calls X's web API on these hosts with the user's session.
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
3. **功能多**。单一用途要「窄且容易理解」，单一用途说明按「增强 X 网页端」写，所有功能只在 X 页面生效。
4. **新开发者、新扩展**审核更严，一般几天，可能几周；超过三周可以联系开发者支持。

## 六、商店中文详细说明草稿

纯文本，商店不渲染 Markdown。功能名和插件中文界面一致。

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
- 原创内容奖励计划：近 90 天已验证首页时间线曝光进度（目标 50 万），以及每天计入奖励的曝光
- 博主活动度：近 7 天每天的发帖数和回复数
- 爆款雷达：按每小时浏览量标出潜力帖和爆款帖
- 页面上显示数据比例徽章、用户粉丝数、收藏量

创作与发布
- 引用我的帖子：在编辑器里搜索自己的帖子和文章，插入链接
- 多图排版与排序：发帖时 2 到 4 张图排成两列，按发帖顺序标序号，图片完整显示；拖动图片可调整顺序，发出的帖子、定时帖和草稿都按调整后的顺序
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

测试说明「其他说明」原文（452 字符，上限 500）：

```text
No test account is provided. Sign in to x.com with any X account. The extension runs only on x.com, twitter.com, mobile.twitter.com, and pro.x.com. Use the toolbar popup to turn each feature on or off. Spam reply filter: open a post page that has replies. Image grid and ordering: attach 2 to 4 images in the post editor. AI quote drafts need your own OpenAI-compatible API key; without one, no AI requests are sent. Other features need no extra setup.
```

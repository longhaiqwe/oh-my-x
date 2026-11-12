# XHunt 能力调研与 oh-my-x 接入评估

调研日期：2026-11-07。oh-my-x 基线：`62922f6`，版本 `2.6.0`。XHunt 公开源码基线：`ff9d54fe87d9560d57f883aaa69fb44e55ebb909`。

## 结论

建议增加“账号研究”能力，先实现本地备注与标签，再扩展近期内容分析，最后增加本地资料变更记录。入口接在现有博主主页和头像悬浮资料卡中，分析结果放入“数据洞察”，备注管理复用“收藏”。

XHunt 的参考价值在于把账号、内容、关系和历史资料集中呈现。但全站影响力排名、历史删帖和关系网络依赖页面外的数据；公开插件源码不足以复现这些能力。首期采用独立实现、用户手动触发、数据本地保存、AI 服务沿用用户配置的方式。

本轮完成公开资料与源码核查，没有安装运行 XHunt、登录其会员服务或实测 API，没有修改 oh-my-x 产品代码。以下将宣传描述、源码证据与建议方案分别说明，源码存在不代表商店版对应功能已通过运行验证。

## 当前产品与证据

[Chrome 商店](https://chromewebstore.google.com/detail/xhunt/gonmfafjcdkngkbhcpmcphlgfhabkeji?hl=zh-CN) 当日页面显示：版本 0.4.6，2026-11-04 更新，10,000 用户，4.4 分、32 个评分。搜索引擎中仍有 0.4.0 等旧快照，本报告采用直接读取的商店页面。

商店定位偏向 KOL（关键意见领袖）影响力、项目研究、营销和交易。公开代码还包含通用账号分析、备注、社交圈及内容过滤。具体如下。

| 能力 | 核查结果 | 对我们的价值与限制 |
| --- | --- | --- |
| KOL 排名、粉丝构成、头像排名徽章 | README 列出；有 `KolFollowersSection`、`AvatarRankBadge` 等组件 | 可借鉴呈现方式；粉丝数不能替代粉丝质量，全站排名需要统一账号样本和算法 |
| 账号质量分析 | `SoulDensity.tsx` 呈现账号资料、内容、互动、XHunt 排名、KOL 互动五个维度及原因 | 可以做近期内容分析；原始评分计算未在该组件中实现，不能照搬分值 |
| 能力雷达、MBTI | README 列出；有能力图组件 | 主题分类有用；MBTI 与我们的运营任务关联较弱，不进入首期 |
| 账号 AI 问答 | `KolAiChatDialog.tsx` 调用 `fetchKolChat`，保存对话并支持中止 | 可以基于已取得的帖子回答，并附原帖链接；不能推断未取得的数据 |
| 私人备注、标签及公开评价 | `NotesSection.tsx` 使用账号 token，调用读取、保存备注服务；README 说明评价系统 | 本地备注和标签优先；不把私人笔记与公开评分混在一起 |
| 用户名、简介、头像、横幅等变更 | `ProfileChangesPanel.tsx` 对传入历史记录逐项展示差异 | 可以独立做“自本机开始记录后的变化”，不能提供安装前历史 |
| 删帖、编辑历史 | 有 `DeletedTweetsSection`、`EditedTweetsSection`；代码与文案有 VIP 限制 | 需要历史采集；当前列表未出现某帖不等于该帖已删除 |
| 社交圈、关注关系变化 | 有社交圈组件；文案描述近 30 天双向互动、每日查看额度 | 可后续做“样本中的互动账号”；全网、双向和完整关系不能由单个主页推导 |
| 项目及代币研究 | README 列出代币识别、提及表现、融资关系、项目成员、讨论热度 | 偏加密领域，数据依赖多，首期优先级低 |
| 趋势与实时订阅 | 有热点组件、`RealTimeSubscription`；会员文案列出资讯推送 | 我们已有按浏览量与时间计算的爆款雷达；跨账号趋势另需持续数据源 |
| 信息流过滤、不活跃关注检测 | 有 cleaner 规则与界面；文案包含不活跃阈值 | 内容过滤与现有功能重合；不活跃关注检测可另立需求，需核实最近活动数据 |
| 对外 API 入口 | `ApiAccessSection.tsx` 显示 API Key、credits，并链接 XClaw 文档和控制台 | 存在接入线索，但未确认排名、历史等所需接口是否开放，也未核实价格及转授权条件 |

功能说明见 [XHunt README](https://github.com/AlphaHunt3/tweet-hunt-extension/blob/ff9d54fe87d9560d57f883aaa69fb44e55ebb909/README.md)；更具体的实现证据见文末链接。

## 关键技术边界

### 公开源码不是完整的数据服务

`src/contents/utils/api.ts` 明确注明实际请求传输、签名、代理和端点白名单位于私有构建。公开的 `secureFetch` 和 `secureFetchInContent` 直接返回 `undefined`。后台请求文件也为占位实现。此外，多个组件导入的 `src/contents/services/api`、`notes.ts` 不在该提交的完整文件树中。

这意味着可以检查界面及数据使用方式，但不能从公开仓库获得完整请求实现、服务端算法和历史数据库。不能将“组件存在”解释为“复制后即可运行”。

### API 接入只能列为后续候选

公开组件链接到 [XClaw API 文档](https://pro.xclaw.info/) 和 [控制台](https://apidashboard.xclaw.info/dashboard)。本次文档页未返回可读的接口定义，因此不假设它支持 XHunt 全部功能，也不填写未经验证的价格。

若以后接入，应先取得所需接口的字段、鉴权方式、配额、计费、缓存与展示许可，再确定方案。通过后台调用、按需授权服务域名，密钥不进入网页上下文；服务不可用时保留本地功能。不要复用 XHunt 的私有签名或内部登录令牌。

### 本地统计不等同于全站画像

近期帖子可以支持发帖频率、内容主题、样本互动统计和代表作分析，但不足以可靠确定真实粉丝比例、刷量比例、人格类型或全站影响力百分位。AI 文本分析也不能恢复不存在于输入中的历史。

## 与现有代码的对应关系

| 现有实现 | 能复用什么 | 必须补充什么 |
| --- | --- | --- |
| `shared/favorite-bloggers.ts` | 收藏解析、后台串行写入、跨标签页更新模式 | 现有数据只有 handle/name；备注、标签、稳定 userId、迁移及导入导出都需新增 |
| `content-scripts/utilities/profileActions.ts`、收藏与 Lists 入口 | 主页和头像悬浮卡上的操作入口 | 统一“账号研究/备注”入口，避免继续堆叠按钮 |
| `shared/profile-activity*.ts`、MAIN world 拦截器 | 近期活动请求、分页解析、原创与回复区分、置顶处理 | 当前活动条目主要保留 ID、日期、类型；不含完整正文和互动指标，不能直接交给模型生成内容报告 |
| `shared/user-metrics-interceptor.ts` | screenName、name、粉丝数、关注数及可选 restId | 简介、头像、横幅及来源时间需要显式提取；稳定 ID 缺失时不能自动合并历史 |
| `shared/graphql-tweet.ts`、AI 转发原文处理 | GraphQL 节点解包、作者与原文处理经验 | 专用于账号分析的受限样本结构、正文缺失标记及来源校验 |
| `content-scripts/options/stat-ratio.ts`、爆款雷达 | 单帖指标解析、比例和流速计算 | 汇总指标的分母、缺失值、样本范围与采集时间必须明确 |
| `shared/ai-request.ts`、`entrypoints/background.ts` | 用户自配 AI、授权校验、Port 生命周期与取消机制 | 新增账号分析请求类型、输入限制、结构化输出、引用验证及缓存版本 |
| `shared/feature-registry.ts`、`storage-keys.ts`、i18n | 独立开关、设置归属和双语界面 | 新设置与存储项按现有规范登记，界面文案中英文同步 |

实现继续采用 WXT、Vue 和当前内容脚本调度机制，不引入 XHunt 的 React/Plasmo 组件体系。

## 建议分期

### 第一阶段：账号备注与标签

解决“收藏后记不清为何关注、适合在哪类话题互动”的问题。

1. 在主页和悬浮资料卡打开备注面板，填写备注、自定义标签和关注原因。
2. 收藏列表支持按备注、标签检索；数据保存在本机，并支持导入导出。
3. 数据模型优先以 X 稳定 userId 为主键，保存当前 handle 与已确认的别名。无法取得 ID 时标记为待确认，不凭相同用户名自动合并。
4. 沿用后台串行写入，处理多标签页同时修改。切换 X 登录账号时，明确使用浏览器共享笔记或按登录账号隔离；建议默认隔离并保留旧收藏迁移入口。

这部分不需要新增第三方服务或必选主机权限；需复核已有用户信息桥接字段及本地存储迁移。

### 第二阶段：近期内容分析

在现有活动度面板增加“分析近期内容”，面向选题和互动准备。以下数字是设计上限与验收建议，不是性能实测结果。

1. 默认分析近 7 天，最多 50 条符合条件的已获取帖子，用户手动触发；样本不足时展示实际数量。
2. 先在本地计算发帖/回复数量、样本中位浏览量、互动量等。转推、引用、回复与原创分开处理，置顶旧帖不改变时间边界。
3. 分析面板显示采集时间、实际覆盖日期、是否分页完成、正文是否完整；缺失指标显示“未知”，不以 0 代替。
4. AI 只输出主要主题、代表帖摘要、可讨论的问题及相应帖子 ID。引用必须属于输入样本，链接由扩展生成。帖子内容作为待分析材料，不执行其中夹带的指令。
5. 请求前明确展示发送的数据范围，沿用已配置的 AI 服务；备注默认不发送。面板关闭或路由切换后中止请求，迟到结果不能写到另一账号。
6. 缓存按 userId、样本摘要、模型和提示词版本区分，提供手动刷新。仅增加账号分析提示词不能完成此阶段，数据提取是必要前置工作。

首期不要给出“真人概率”“可信度总分”或“全站排名”。如果后续需要评分，先建立有标注的验证样本，再报告误差与适用范围。

### 第三阶段：本地资料变更记录

仅为用户收藏或主动开启记录的账号保存观察快照。比较稳定 ID 对应的 handle、昵称、简介、头像地址等字段，展示前后值和观察时间。

“11 月 7 日发现变更”与“11 月 7 日发生变更”不同：只能确定两次观察之间有变化。首次记录应显示“开始记录”，不能显示“从未改名”。缺少字段不能被记为删除，用户名被另一账号使用时不能继承原账号历史。头像 URL 的变化也不能直接等同于图片内容变化。

不承诺浏览器关闭时持续监测，不补造安装前历史，不把访问失败判为删帖或账号注销。

### 暂缓范围

- 全站影响力榜、真实粉丝率、完整关系图谱：缺少全局数据与可验证算法。
- 安装前改名、历史删帖、实时全站提醒：缺少持续采集服务。
- 代币收益、交易执行、项目融资数据库：与当前通用 X 增强工具的首期目标距离较远。
- MBTI 和不透明的账号总分：对当前操作任务帮助有限，结论不易验证。

暂不估算人日；先验证正文提取与稳定 userId 覆盖，再给开发工期。第三方数据费用未核实，AI 费用沿用用户服务的实际计费。

## 后续实现验收条件

- 备注在刷新、多标签页并发修改、导入导出后保持一致；改名和用户名复用样例不能串号。
- 活动样本对置顶、回复上下文、纯转推、重复分页和缺失正文均有明确处理；不把分页失败标成完整 7 天。
- 每条 AI 引用都能对应输入帖子；输入没有的信息必须明确缺失，未知指标不显示为零。
- 默认分析在 50 条上限停止；取消后停止后续请求，跨账号切页后不显示旧账号结果。
- 本地备注和本地快照不产生第三方请求；AI 模式仅发送界面说明的字段，不发送 X Cookie 或默认私密备注。
- 对已有收藏、活动度、AI 转发、回复评分执行回归检查，再运行项目要求的 `npm run check`。

这些是未来实现的验收标准。本次仅新增调研文档，没有运行产品测试，也没有性能、准确率或费用实测数据。

## 文档与代码不一致

本次发现以下四项，技术判断均以代码为准。

1. **XHunt“完全开源”与实际公开范围不符。** 商店称完全开源，但网络请求文件明确说明真实实现位于私有构建，公开函数返回 `undefined`，部分导入的服务模块也未出现在文件树中。公开仓库适合作为研究资料，不能视为完整可运行实现。
2. **XHunt 许可说明不一致。** README 声称 MIT 并链接 LICENSE，但固定提交的文件树没有 LICENSE，读取该路径返回 404；同一 README 服务条款又限制未经许可的商业二次包装。本报告不据此作法律结论，但不把该仓库当作已核实授权的代码来源，建议独立实现。
3. **XHunt 构建说明与脚本不同。** README 使用 Yarn 4 与 `yarn build`；package.json 的 packageManager 为 pnpm 10.11.0，scripts 中没有 `build`，有 `build:dev` 和 `build:analyze`。本次没有安装构建，不能声称按 README 可重现商店包。
4. **oh-my-x 比例徽章文档覆盖范围落后。** README 的“数据比例徽章”只描述博主主页；`addStatRatioBadges()` 同时支持主页和帖子详情页，并在详情页按作者取粉丝数缓存。能力对照按两种页面计算，本次未顺带修改 README。

## 核查链接

- [XHunt 固定提交文件树](https://github.com/AlphaHunt3/tweet-hunt-extension/tree/ff9d54fe87d9560d57f883aaa69fb44e55ebb909)
- [公开网络请求占位实现](https://github.com/AlphaHunt3/tweet-hunt-extension/blob/ff9d54fe87d9560d57f883aaa69fb44e55ebb909/src/contents/utils/api.ts)
- [后台网络请求占位实现](https://github.com/AlphaHunt3/tweet-hunt-extension/blob/ff9d54fe87d9560d57f883aaa69fb44e55ebb909/src/background/utils/secure-fetch.ts)
- [账号质量分析组件](https://github.com/AlphaHunt3/tweet-hunt-extension/blob/ff9d54fe87d9560d57f883aaa69fb44e55ebb909/src/compontents/SoulDensity.tsx)
- [账号问答组件](https://github.com/AlphaHunt3/tweet-hunt-extension/blob/ff9d54fe87d9560d57f883aaa69fb44e55ebb909/src/compontents/KolAiChatDialog.tsx)
- [备注组件](https://github.com/AlphaHunt3/tweet-hunt-extension/blob/ff9d54fe87d9560d57f883aaa69fb44e55ebb909/src/compontents/NotesSection.tsx)
- [资料变更组件](https://github.com/AlphaHunt3/tweet-hunt-extension/blob/ff9d54fe87d9560d57f883aaa69fb44e55ebb909/src/compontents/ProfileChangesPanel.tsx)
- [删帖组件](https://github.com/AlphaHunt3/tweet-hunt-extension/blob/ff9d54fe87d9560d57f883aaa69fb44e55ebb909/src/compontents/DeletedTweetsSection.tsx)
- [API 接入界面](https://github.com/AlphaHunt3/tweet-hunt-extension/blob/ff9d54fe87d9560d57f883aaa69fb44e55ebb909/src/compontents/ApiAccessSection.tsx)
- [会员与功能界面文案](https://github.com/AlphaHunt3/tweet-hunt-extension/blob/ff9d54fe87d9560d57f883aaa69fb44e55ebb909/src/locales/zh.json)
- [包配置与构建脚本](https://github.com/AlphaHunt3/tweet-hunt-extension/blob/ff9d54fe87d9560d57f883aaa69fb44e55ebb909/package.json)

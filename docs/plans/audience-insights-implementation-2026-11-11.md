# 粉丝与关注分析：实现与验证

北京时间 2026-11-11。基于已确认的第二版设计实现；截图均为实际组件使用合成名单渲染，不是用户的真实粉丝数据。

## 入口与行为

- 扩展「数据 → 看板 → 粉丝与关注分析」，默认关闭。完整设置详情地址为 `options.html#insight/audience`。
- 开启后，在普通 `/{handle}/followers` 与 `/{handle}/following` 页的原生标签栏下显示入口。认证粉丝、共同关注、推荐模块不进入名单。
- 只读取 X 自身发出的列表响应。没有自动滚动、额外 X 请求、取关操作或付费 API。
- 原始列表已加载、但监听尚未就绪的响应不补抓；界面提示继续滚动或刷新。分析窗口固定打开时的样本，关闭后重新打开才显示新增记录。
- 粉丝构成提供六档分布、三个累计门槛、搜索、分档筛选和每页 12 个账号。关注分析提供明确关系、账号属性筛选与两种排序。CSV 导出覆盖全部筛选结果。
- 缺失粉丝数不计为零，关系缺失不计为未关注；第三方关注名单不提供与登录账号的关系筛选。关注数为零时比值显示「—」。
- 本地名单按登录账号、目标账号、列表类型隔离。关闭采集后仍可查看、导出和清除；无 X 标签页也可读取。
- 每账号最多 3 个目标；每目标粉丝 2 万条、关注 1 万条；全库 10 万条或约 30 MiB 的 UTF-8 记录内容。达到上限停止新增，不驱逐旧名单。该字节数为估计内容大小，不是浏览器数据库实际占用。
- 跨天或间隔超过 24 小时停止合并；「开始新记录」需确认替换。清除递增账号代次，清除前的迟到写入不能恢复名单。

## 实现位置

| 文件 | 职责 |
| --- | --- |
| `shared/audience.ts` | 严格名单解析、字段校验、按字段时间合并、统计、筛选、CSV |
| `shared/audience-interceptor.ts` | MAIN world（页面脚本环境）旁路监听；请求发出时绑定路径、身份与采集代次 |
| `shared/audience-background.ts` | 后台消息来源、登录身份、路由、开关与字段校验 |
| `shared/audience-db.ts` | 扩展源 IndexedDB（浏览器本地数据库）事务、容量与清除 |
| `content-scripts/features/audience.ts` | 页面入口、生命周期、临时记录与采集队列 |
| `shared/components/AudiencePanel.vue` | 两类分析共用窗口、窄屏视图、筛选与分页 |
| `shared/audience-panel.ts` | 样式隔离、主题、模态背景、滚动恢复、Esc 与焦点循环 |
| `AudienceCard.vue` / `AudienceDetail.vue` | 设置卡片、本地名单管理、确认清除 |

列表响应可能不携带目标账号的 `rest_id`。解析器以已绑定页面上下文中的请求 `variables.userId` 为目标 ID；若响应同时给出 ID 或用户名，必须匹配。该兼容路径参考了公开的 [twitter-cli 测试样例](https://github.com/public-clis/twitter-cli/blob/main/tests/fixtures/followers_page.json)，并在本仓库使用自行构造的夹具验证。未把第三方样例或合成数据称为当前真实 X 响应。

## 自动化验证

- `test/unit/audience.test.ts`：10 项，覆盖新旧字段、名单来源限制、分档边界、未知值、字段合并、排序筛选和 CSV 注入防护。
- `test/unit/audience-db.test.ts`：6 项，覆盖并发写入、去重、身份隔离、清除代次、跨天与容量限制。
- `test/unit/audience-background.test.ts`：4 项，覆盖消息来源、开关、登录身份、第三方关系剥离及无 X 标签页读取。
- `test/unit/audience-interceptor.test.ts`：2 项，覆盖默认不采集、无额外请求、导航与关闭后的迟到响应。
- `scripts/test-audience-layout.mjs`：使用生产 Vue 组件，验证 6 种桌面／窄屏／明暗／英文布局、分页、搜索、关系筛选、导出全部结果、焦点循环、Esc 与滚动恢复。
- `scripts/test-audience-extension.mjs`：使用生产构建和独立 Chromium 配置，替换 X 响应为合成数据，验证 MAIN → 内容脚本 → 后台 → 数据库 → 窗口的完整流程，以及清除竞态、关闭采集、没有 X 标签页时查看本地记录。未使用用户浏览器配置或真实凭据。

浏览器检查脚本支持 `AUDIENCE_PLAYWRIGHT_MODULE` 和 `AUDIENCE_CHROMIUM` 环境变量，指向已安装的 Playwright 模块与 Chromium 可执行文件。运行扩展联调前先 `npm run build`。

## 真实账号待验证

1. 在 Chrome 重新加载 `build/chrome-mv3`，开启「数据 → 粉丝与关注分析」。
2. 刷新普通粉丝或关注列表，手动向下加载；核对已记录人数随加载增加。
3. 在自己的关注名单核对几位明确关注／未关注自己的账号，再查看第三方关注名单，确认没有关系筛选。

真实 X 响应字段和生产站点兼容性仍待该步骤验证。自动化验证证明的是合成响应下的实际扩展行为。

## 修正的文档差异

1. 中英文 README 把活动度扫描写成主页按钮，实际入口在扩展弹窗的「数据 → 博主活动度」。已改为准确路径。
2. README 把旧「未回关标记」限定为本人关注列表，代码只检查 `/following` 路径及页面标识，未验证名单所属账号。已说明现有行为，新分析使用独立的明确关系字段。
3. AGENT.md 的权限列表遗漏 `offscreen`，实际 manifest 配置已包含。已补齐文档，没有新增权限。
4. 英文 README 写「five tabs」，实际为五个功能标签加 Settings。已修正文案。

## 界面记录

实际组件截图存放在 `docs/design/audience-insights/implementation/`，与同目录下的早期静态设计原型分开保存。

## 最终验证结果

北京时间 2026-11-11，本轮最终验证：

- `npm run typecheck`：通过。
- `npm test -- --maxWorkers=2 --testTimeout=15000`：128 个测试文件、1528 项测试全部通过，耗时约 64 秒。之前默认 5 秒超时下，通知卡片和强调色用例曾超时；没有修改它们的断言或仓库默认测试配置，最终降低并发并给单项测试 15 秒执行时间。
- `npm run build`：通过，生成 `build/chrome-mv3/`。
- 生产组件的 6 种 Chromium 布局检查：通过；增加了 Tab／Shift+Tab 首尾循环检查，并修正原生 dialog 可把焦点移出窗口的情况。
- 实际扩展的合成响应联调：通过；验证了保存、设置详情深链、清除前的迟到响应、关闭采集和无 X 标签页读取。
- `git diff --check`：通过。

未提交或发布扩展；用户工作区中原有通知卡片、编辑器、AI 转发等改动保留。

# oh-my-x 2.8.0 功能演示素材

这是一组基于 v2.8.0 源码核对、用 StageShow 制作的界面模拟演示，不是真实录屏。画面内账号、头像、关注状态、列表与帖子均为演示数据，没有搜索或修改真实 X 账号，也未发布任何内容。

## 两张动图

1. 昵称查找收藏：打开收藏 → 输入中文昵称 → 点击候选 → 收藏成功 → 输入英文昵称 → 显示候选和明确的「按用户名收藏」入口 → ↓ + 回车选择候选 → 保留收藏结果。
2. 按钮与面板交互：主页紧凑收藏按钮 → 在导航中查看 → Esc 关闭并恢复入口焦点 → 我的列表再次点击入口关闭 → 点外部关闭。末尾再次取消示例收藏，使循环回到起点。

GIF 为 840×737，15fps；MP4 为 1050×922，20fps。两张分别约 14.5 秒和 14.2 秒。推荐 X 上传 MP4，文档内使用 GIF。PNG 为完整封面。

## 版本边界

本版新增昵称查找；收藏本身在 2.6.0 已有。「引用我的帖子到 XChat」在 2.7.0 新增，不属于本组 2.8.0 演示。

依据：CHANGELOG.zh-CN.md 的 2.8.0 段，以及 content-scripts/features/favorite-blogger-lookup.ts、favorite-bloggers.ts、quick-list.ts、content-scripts/utilities/profileActions.ts。界面布局为宣传展示做了取舍，文案和操作逻辑按实际实现。

## 编辑与导出

解压源码后用 Node 20.19+：npm install；npm run dev。预览 /?scene=lookup 与 /?scene=panels。

npm run typecheck 和 npm run build 检查源文件。scripts/export-demo.mjs 使用 StageShow 时钟输出 PNG 帧（20fps），需要本机 Chrome；scripts/posters.mjs 输出封面。可用 ffmpeg 将帧序列转 GIF / MP4。

正式交付只包含横版。源码中的 358px 紧凑试排未通过构图检查，不作为发布版；请勿将其当成已验证的手机产品界面。

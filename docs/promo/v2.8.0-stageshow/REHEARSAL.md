# Rehearsal: oh-my-x 2.8.0

Gold: share。复制其结构并保留 Stage、Window、Popover、Field、Row、Collapse、按 data-target 测量的鼠标行为，改为 oh-my-x 的 X 主页、收藏候选和我的列表。

Beats: 昵称查找 14.5 秒；按钮与面板 14.15 秒。标题、版本号和模拟标识在舞台外，导出包含整幅画面。首次 GIF 用中文鼠标选择、英文方向键与回车选择；第二张按真实规则展示 Esc 还焦点、入口切换及点外部关闭。

Captured: 840px wide 的全循环与各标记状态；390px compact 的状态表；reduced-motion 完整海报；最终 20fps PNG 帧与 15fps GIF / MP4 文件参数。light look only。

Film: lookup-wide-final.json 和 panels-wide-final.json 的 layout gate 均输出 rehearsal passed。完整 motion report 为 inconclusive，因为捕获存在超过 27ms 的采样间隙；不把自动报告当成逐帧保证。字段逐字输入的宽度变化是输入的预期行为；候选进入时的裁边和行移动在对应导出帧另行查看。

Review: 独立复查发现并修复英文候选退出时错换成中文候选、候选与搜索框叠字、循环光标跳回。最终复查 lookup 0104–0110、0199–0205、首末，以及 panels 关键七帧，无新增阻断问题。两张全部导出帧的头部像素一致；panels 首末完全相同，lookup 首末仅极小抗锯齿差（54个颜色分量，差值不超过6）。

Assumptions: 虚构演示账号，不改变真实 X 的关注、收藏、列表或发布状态。字体为 macOS 系统字体；未声称真实扩展端到端测试。

Unresolved: compact 的 desktop crop 构图 gate 未通过，正式交付仅横版。自动 motion coverage 有采样间隙。状态图和源代码随包留存，便于后续编辑。

Not checked: 其他操作系统字体、真实手机触摸、所有帧的人工视觉检查、复杂暂停恢复与移出视口的全部组合。最终导出已核对尺寸、帧率、时长、开头、候选、结果与结尾。

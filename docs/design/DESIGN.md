# oh-my-x 设置界面设计规范

适用范围：插件弹窗（`entrypoints/popup`）和完整设置页（`entrypoints/options`）。注入到 x.com 页面上的徽章、面板不在范围内，它们跟随 X 自身的样式。

运行时的主题文件是 `entrypoints/popup/theme.css`。本目录的 `design-tokens.json` 是配色来源，`theme.css`、`tokens.css`、`preview.html` 由 refactoring-ui skill 的脚本从它导出，`preview.html` 可以直接在浏览器里打开看色板。

## 1. 风格定位

参考图是「工位身体重置手册」封面：深蓝底、米白字、橙色强调，右上角有赤陶到梅紫的光晕。

| 维度 | 选择 | 对应的做法 |
|---|---|---|
| 严肃 ↔ 活泼 | 偏严肃 | 卡片 12px 圆角、控件 8px 圆角，不用大圆角和夸张装饰 |
| 经典 ↔ 现代 | 偏现代 | 系统无衬线字体；背景冷色（墨色），文字暖色（纸色） |
| 紧凑 ↔ 宽松 | 适中 | 卡片内边距 16px，卡片之间 16px，弹窗宽度固定 400px |

## 2. 颜色

### 2.1 原始色阶

用 skill 的 `generate_palette.py` 按书中算法生成，不手调色值。

| 色阶 | 用途 | 来源 |
|---|---|---|
| `primary` | 强调色（开关、按钮、链接、选中态） | 封面的橙色 `#d5874e` 作为 500 |
| `ink` | 冷色中性：暗色模式的背景，亮色模式的文字 | 封面深蓝，950 = `#0b101a` |
| `paper` | 暖色中性：亮色模式的背景，暗色模式的文字 | 封面米白，100 = `#fbf1df` |
| `plum` | 只用于装饰光晕 | 封面右侧梅紫 |
| `danger` / `warning` / `success` | 状态 | 与主色协调的红、琥珀、绿 |

### 2.2 语义变量（组件只能用这些）

| 变量 | 亮色 | 暗色 | 什么时候用 |
|---|---|---|---|
| `body-bg` | paper-100 | ink-950 | 页面底色 |
| `card-bg` | paper-50 | ink-900 | 卡片。比页面亮一档，表示浮起 |
| `sunken-bg` | paper-100 | ink-950 | 卡片里的凹槽：输入框、列表项、统计框 |
| `text` | ink-900 | paper-100 | 第一档文字：标题、名称、数值 |
| `secondary-text` | ink-700 | paper-300 | 第二档文字：说明 |
| `muted-text` | ink-600 | ink-400 | 第三档文字：状态行、补充说明、空状态 |
| `border` / `border-strong` | paper-200 / 300 | ink-800 / 700 | 分隔线 / 输入框边框、虚线框 |
| `accent` / `accent-hover` | primary-700 / 800 | primary-500 / 400 | 实心按钮、开关打开、进度条 |
| `on-accent` | 白 | ink-950 | 实心按钮上的文字 |
| `accent-text` | primary-700 | primary-400 | 可点击的文字链接、「详细设置 ›」 |
| `accent-subtle` / `accent-subtle-text` | primary-200 / 800 | ink-800 / primary-300 | 选中的标签、筛选、已置顶 |
| `switch-off` | ink-400 | ink-500 | 开关关闭 |
| `icon-muted` | ink-400 | ink-500 | 「在哪用」前的小图标，比文字浅一档 |
| `chart-muted` | paper-500 | ink-500 | 图表里未选中的柱子；选中的用 `accent`。对卡片底色约 3:1 |
| `tooltip-bg` / `tooltip-text` / `tooltip-muted` | ink-900 / paper-50 / ink-300 | paper-100 / ink-900 / ink-600 | 悬停提示框（`HintTooltip`），与页面明暗相反。弹窗里不显示浏览器自带的 `title` 提示 |
| `danger` / `warning` / `success` | 各 700 | 各 400 | 删除类文字、提醒文字、成功提示 |

**对比度**：`design-tokens.json` 里声明了 32 组文字与背景的搭配，全部达到 4.5:1；开关等控件对背景达到 3:1。改颜色后运行：

```bash
python3 ~/.agents/skills/refactoring-ui/scripts/check_contrast.py --matrix docs/design/design-tokens.json
```

### 2.3 例外：数据编码色

爆款雷达的三级（`level-normal / potential / viral`）和比例徽章的五档（`rating-*`）必须和 x.com 页面上注入的徽章同色，所以单独定义、不随主题变化。界面上它们只以色条、色点出现，旁边一定有文字，不单靠颜色传达。

### 2.4 例外：光晕

`.app-glow` 在页面右上角叠两层径向光晕（暖橙、梅紫），对应参考图。书中建议渐变的色相跨度不超过 30°，这两种颜色相差约 40°。因为是参考图本身的特征，且只是背景装饰、不承载信息，保留。

## 3. 文字

| 刻度 | 字号 | 用途 |
|---|---|---|
| `text-xs` | 12px | 说明、状态、标签、胶囊。界面最小字号，不再使用 9–11px |
| `text-sm` | 14px | 卡片名称、标签栏、正文 |
| `text-base` | 16px | 模块标题、页内统计数字 |
| `text-lg` | 18px | 弹窗和设置页顶部的产品名 |
| `text-xl` | 20px | 奖励进度这类大数字 |

- **字重只有两档**：400（常规）和 600（强调）。不用 500、700、800。
- **文字颜色只有三档**：`text`、`secondary-text`、`muted-text`。强调色和状态色只用在有含义的地方，比如可点击、成功、失败，不拿来「让文字显眼」。
- 不给文字加透明度；需要更弱，就换下一档颜色。
- 数字和文字在同一行时按基线对齐（`items-baseline`）。

## 4. 间距与尺寸

- 间距只用 4 的倍数：4 / 8 / 12 / 16 / 24 / 32。胶囊内部上下 2px 是唯一例外。
- **组外间距大于组内间距**：卡片之间 16px > 卡片内各块 12px > 名称与说明 4px；分组标题离下方卡片 8px，离上一组 20px。
- 点击区域不小于 24×24px；输入框和主要按钮高 32px。
- 圆角三档：`rounded-card`（12px）、`rounded-control`（8px）、`rounded-full`（开关、胶囊）。

## 5. 层次

- 卡片比页面亮一档；输入框、列表项比卡片暗一档。暗色下主要靠明暗表达层次。
- 阴影只用书中五级（`shadow-sm` 到 `shadow-xl`），不写自定义阴影。目前只有开关圆钮、滑块、选中的标签用 `shadow-sm`。
- 同一个元素不同时用「边框 + 底色 + 阴影」。凹槽只用底色；输入框保留边框，表示「可以输入」。

## 6. 操作的主次

- **每屏一个实心主按钮**（`bg-accent`）。数据页是「获取数据」，创作页是「授权并测试连接」，Lists 管理区是「添加」。
- 次要操作用描边按钮（`border-border-strong` + `text-accent-text`）。
- 第三级操作用文字按钮，比如「恢复默认」「清空」。删除类只用 `text-danger`，不做成大红按钮。
- 所有可交互元素都要有键盘焦点框：`focus-visible:ring-2 focus-visible:ring-accent-ring`。

## 7. 缺东西时怎么办

- 需要的颜色、字号、间距不在上面的表里：**先在 `design-tokens.json` 和 `theme.css` 里加一个变量**，再在组件里用，不在组件里写任意值。
- 可以微调已有色阶的某一档；**不要新增色阶档位**，增加档位会让体系失去约束。
- `test/unit/popup-design-tokens.test.ts` 会检查组件里有没有 Tailwind 调色板颜色、原始色阶、十六进制色值、颜色透明度、任意字号和多余的字重。

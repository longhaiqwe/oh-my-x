# Changelog

## Unreleased

### Documentation

- 2026-11-12: Record the native Chrome review-submission workflow as the user-requested default, including file-picker recovery, so future releases do not depend on unconfigured API credentials.

## 3.1.0 - 2026-11-13

### Features

- Extend image reordering to 2–20 images. Keep the two-column layout for up to four images; default to an overview for 5–20 images with an optional two-column detail view.
- Move a selected image to the start or end by its number, and auto-scroll near the edges while dragging in detail view. Match X fonts and theme colors.

### Fixes and improvements

- Support nested carousel attachment wrappers and hide native carousel arrows while the grid is active. Reject duplicate media IDs before updating the order.
- Restrict editor controls to actual post composers, avoiding extra buttons in image-cropping and nested media dialogs.
- Use fractional widths for notification-card column calculations at browser zoom boundaries. Restore avatar positions and clear stale status when another tab switches to the original list.

### Permissions and limitations

- No new extension permissions compared with 3.0.0. X still determines how many images an account can upload; the extension arranges images already attached.
- Preserve the native layout for incomplete media data, videos, or GIFs. No automatic posting. Ordering after publishing, scheduling, or saving drafts has not been fully verified on live X.

## 3.0.0 - 2026-11-12

Compared with 2.9.0, including the 2.10.0 changes released on GitHub but not published in the Chrome Web Store.

### Features

- Add opt-in audience insights for ordinary followers, verified followers, and following lists already loaded by X: follower-count bins, search, sorting, relationship filters, and complete filtered CSV export. List types and accounts remain separate, and saved lists remain accessible after capture is disabled.
- Add a dedicated Creator Rewards history dashboard with calendar weeks, months, the last 90 days, custom ranges, daily/weekly trends, complete-period comparisons, and daily details. Export the current view as a local PNG with optional attribution.
- Configure each AI repost draft independently with detailed or short summaries/extensions, or saved custom styles with instructions and samples. Defaults are a detailed summary and a short summary.
- Add bullet and numbered list controls to post, quote, and reply composers while preserving selection, bold, italic, and links. Button colors follow the X theme.
- Add unviewed/replies-only notification filters, mark-all-read for the current filter, direct reply navigation, native profile previews, and separate new-post alerts.
- Display saved-blogger avatars and fill missing avatars for existing favorites.

### Fixes and improvements

- Preserve viewing receipts across grouped notifications, native-list clicks, tabs, and delayed responses. Restore filter preferences and navigate replies to the in-page composer in the current tab.
- Improve notification hierarchy, narrow layouts, expanded details, and row heights during view switches. Viewed new-post alerts remain hidden until a newer alert arrives.
- Avoid restoring removed favorites or overwriting newer data when avatar lookups finish late.
- Authorize audience capture against the current browser-tab URL after X navigates within the page. Place the entry below the full navigation to avoid clipping and inherit X fonts and accent colors.
- Distinguish unfinished dates, missing records, and zero values in rewards history. Show observed totals with coverage counts and support negative changes. Retain up to 120 daily account-analytics records and request 90-day history on demand.
- Clarify that daily differences in the rolling 90-day rewards total are net changes, including expirations and platform adjustments, rather than newly eligible daily impressions. Statistics retain UTC date boundaries.
- Prevent malformed language-file requests during image-recognition initialization by disabling implicit sublanguage loading before the worker initializes. Explicitly selected languages are unchanged.
- Keep promotional demos in their own TypeScript project so clean extension builds do not require demo-only dependencies.
- Expand unit, layout, extension integration, and real OCR regression checks, and update bilingual guides, privacy disclosures, design files, store images, and promotional deliverables.

### Permissions and data

- No new extension permissions compared with 2.9.0. Audience capture is opt-in, observes already-loaded data, and does not scroll, make extra list requests, or send lists to AI services or the developer.
- Daily rewards history depends on locally recorded totals and cannot be reconstructed from the current cumulative value. Image export stays on the device and does not publish anything.
- Document the existing offscreen permission, local audience lists, favorite avatars, and notification preferences.

## 2.10.0 - 2026-11-12

### Features

- Add opt-in audience insights for ordinary Followers and Following lists already loaded by X: follower-count bins, search, sorting, relationship filters, and complete filtered CSV export. Lists stay on the device and can be viewed or cleared after capture is disabled.
- Configure each AI repost draft independently with detailed or short summaries, detailed or short extensions, or saved custom styles with instructions and samples. Defaults are a detailed summary and a short summary.
- Add bullet and numbered list controls to post, quote, and reply composers while preserving selection, bold, italic, and links. Button colors follow the X theme.

### Fixes and improvements

- Add unviewed/replies-only notification filters, mark-all-read for the current filter, reply navigation, native profile previews, and separate new-post alerts.
- Preserve viewing receipts across grouped notifications, native-list clicks, tabs, and delayed responses. Restore filter preferences and navigate replies to the in-page composer in the current tab.
- Improve notification hierarchy, narrow layouts, expanded details, and row heights during view switches.
- Display saved-blogger avatars and fill missing avatars without restoring removed entries or overwriting newer data.
- Add regression coverage, audience design files, store images, and promotional demo sources and deliverables.
- Keep promotional demos in their own TypeScript project so clean extension builds do not require demo-only dependencies.

### Permissions and privacy

- No new permissions compared with 2.9.0. Audience insights does not scroll automatically, make extra list API requests, or send lists to AI services or the developer.
- Update bilingual documentation and the privacy policy for the existing offscreen permission, local audience lists, favorite avatars, and notification preferences.

## 2.9.0 - 2026-11-10

### 新增

- 回看：首页可见推文按账号保存在本地，支持正文、作者、引用搜索及媒体类型筛选，每账号最多 3000 条、约 20 MB；自动记录默认关闭。
- 可选本地图片文字识别，支持图片、视频封面及链接缩略图，中英文混排搜索与筛选记忆；识别引擎随扩展打包。
- 通知用户卡片：将已加载通知按用户整理，展开查看互动，保留原始列表切换；本地查看标记按账号隔离，不改变 X 官方已读状态。

### 修复与权限

- 扩展重载后清理失效回看任务与界面；处理 OCR 单张图片失败、账号暂未就绪及语言数据兼容性。
- 新增 offscreen 权限供本地 OCR 使用；首次启用 OCR 时申请图片和语言数据来源访问权限。回看正文与识别结果不上传。
- 补充第三方许可证与隐私说明。

## 2.8.0 - 2026-11-09

### Features

- Find bloggers by Chinese or English display name in Favorites using the existing Mention by Name X lookup. Candidates show avatars, names, usernames, and follow status; click a result or use arrow keys and Enter to save.
- Keep direct entry of @usernames and profile links. Unprefixed English input shows candidates plus an explicit Save by username option, avoiding accidental saves of a handle that happens to match a display name.

### Fixes and improvements

- Use compact, softly filled Add to List and Save buttons beside profile and hover-card names; size to the text and close gaps when either feature is disabled.
- Read fonts from X's native text for profile actions, navigation entries, and Lists/Favorites panels instead of inheriting an unrelated body font.
- Align Favorites and My Lists dismissal: outside click, toggling the entry, or Escape. Remove the separate Favorites close button and restore entry focus on Escape.
- Preserve localized native Premium navigation entries and remove duplicate extension entries.
- Update the account daily analytics query ID and include the required include_previous variable to avoid HTTP 422 responses.

### Permissions and privacy

- No additional extension permissions. Name lookup uses the existing X session and endpoint; favorites remain local and do not change X follows or Lists.

## 2.7.0 - 2026-11-09

### Features

- Add a Quote my posts icon to XChat. Press `/` in an empty message to search and select your own posts and articles.
- Insert the selected link at the cursor while preserving surrounding text; send the message using XChat's normal controls.

### Fixes and validation

- Support XChat's Shadow DOM, delayed mounting, and replacement inputs; dispose stale bindings when conversations change.
- Open the picker as a centered native dialog so the composer's CSS translation cannot push it outside the viewport.
- Cover IME input, selection replacement, closing and reopening, with a browser layout fixture for regression checks.

### Permissions and privacy

- Reuse the local post library without adding extension permissions or automatically sending messages.

## 2.6.0 - 2026-11-06

Compared with v2.5.1:

### Features

- Save bloggers beside their names on profiles and hover cards. Search, open, remove, and reorder favorites from the navigation panel; order is saved locally.
- Export post GIFs or short videos as GIF files locally, with preview, cancellation, download, and copy/paste into X’s composer.
- Show ratio and velocity badges on the main post in detail views.

### Fixes and improvements

- Align Add to List and Save buttons on profiles and hover cards, without leaving space for disabled features.
- Keep Favorites aligned with native navigation when labels expand or collapse.
- Use the original post’s timestamp for quoted-post velocity and improve detail-view impression parsing.
- Remove the extension-imposed timeout for repost generation while keeping cancellation and timeouts for other AI requests.
- Avoid assigning early rewards updates to the wrong day; retry missing daily data at ten-minute intervals.
- Report media download failures correctly and allow GIF media detected as video to download.
- Consolidate tweet parsing, keyword parsing, and log cleanup, with additional regression coverage.

### Permissions and privacy

- Add `video.twimg.com` host access solely to fetch media for local GIF conversion.
- Favorites and their order stay on the device. GIF copying needs no clipboard-read permission and never publishes a post automatically.

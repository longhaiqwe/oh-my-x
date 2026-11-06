# Changelog

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

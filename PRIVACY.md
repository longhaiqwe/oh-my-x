# Privacy Policy for oh-my-x

Last updated: October 21, 2026

**oh-my-x** customizes X/Twitter, filters comments, and provides optional creator tools. This document describes local storage, requests to X, and user-triggered AI requests.

## 1. Local storage and developer access

- Settings, keyword lists, allow/block lists, interception logs and statistics, Lists metadata, creator rewards data, and AI configuration (including your API key) are stored in `chrome.storage.local`. The API key is not encrypted by the extension; password masking in the settings is only a display feature.
- The popup and settings page also keep copies of a few settings (interface language, the last opened tab, the spam word list, collapsed sections) in the extension's own `localStorage`, so they open without waiting for `chrome.storage.local`. On X pages, the schedule panel saves the query ID and query parameters of X's scheduled-posts request in that page's `localStorage` so it can refresh the list; it does not save cookies or credentials there.
- The own-post library stores account IDs, post IDs and text, article titles/previews, X-hosted thumbnail URLs, dates, and synchronization checkpoints in extension-local IndexedDB. It does not store session cookies or credentials in this database.
- Cached posts may remain after editing or deletion on X. You can pause synchronization or disable automatic synchronization in settings. Removing the extension removes its local storage and database.
- The extension has no developer telemetry, advertising trackers, or analytics service. The developer does not receive your post library, API key, X credentials, or browsing history.

## 2. Requests to X

- With an X page open and automatic synchronization enabled, the extension uses your existing X session to synchronize your own posts. Other features request Lists, post content/media, profile activity, and creator rewards data from X. Creator rewards may refresh in the background while you are signed in.
- The extension reads X cookies such as `ct0` (CSRF token) and `twid` (account identification) for authenticated X requests and account isolation. X session credentials are not sent to AI services.
- The extension can load X's public client script from `abs.twimg.com` to resolve current API identifiers. Post thumbnails load from X's image CDN; the database stores their URLs, not image files.
- Mention by name: when you type a name containing non-English characters after @ in a post, quote, or reply editor, that name (up to 30 characters) is sent with your X session to X's user search, the same endpoint X's editor uses for @ suggestions. The results (names, usernames, profile image URLs, and whether you follow the account) are kept in the page's memory and discarded when the page is closed or reloaded.
- User actions can add a member to an X List, download media, or use interaction helpers. If enabled, the reply helper can like a post after a successful reply. These actions communicate with X or its media CDN.

## 3. Optional AI service

- AI generation and connection testing run only when you click their controls. Before contacting a configured AI host, the extension checks its site permission. Grant access in **Settings → Create → AI quote drafts → Authorize and test connection** (Chinese interface: 创作 → AI 总结转发 → 授权并测试连接). Declining permission prevents the request. Changing to a different host requires permission for that host.
- Generating repost options sends the selected source text (up to 12,000 characters, plus a truncation marker if necessary), available author name/handle and article title, your repost style (style description and sample posts, if you filled them in), your additional instructions, the extension's writing instructions, and model name to the configured OpenAI-compatible service. The API key is sent in the authorization header. Connection testing sends a short test message and model name with the API key, not the selected post.
- This is an external transfer to the service you configure, unless you choose a local service. That service's retention, processing, and billing terms apply. Generated options are shown for you to choose; the AI feature does not publish posts automatically.
- AI requests omit browser cookies and reject redirects. Each request has a 25-second timeout. Canceling or closing the requesting panel aborts the extension's request and discards late results. A provider may already have received or processed it; cancellation does not guarantee that provider-side processing or billing stops.
- Remote services must use HTTPS. HTTP is accepted only for local services at localhost and 127.0.0.1, so text and API keys sent over HTTP stay on this computer.

## 4. Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Store settings, configuration, caches, and local statistics. |
| `cookies` | Read X session/account cookies for X requests and account isolation. The code does not read AI-provider cookies. |
| `alarms` | Schedule post-library checks in eligible open X tabs and creator rewards refresh checks. |
| `downloads` | Save media when you select a download action. |
| `scripting` | When you click Scan last 7 days in the popup on an X profile page and the page's content script does not respond (for example, after the extension was updated), run the extension's own scan function in that X tab, so the page does not need a reload. It is used only on the active X tab and only after that click. |
| Required host access | `x.com`, `pro.x.com`, `twitter.com`, `mobile.twitter.com` for X features; `abs.twimg.com` for X's public client script. |
| Optional host access | The HTTPS host of your chosen AI service, or http://localhost / http://127.0.0.1 for a local service, requested at runtime for the configured host. No blanket access to all websites is requested at installation. |

Chrome site grants apply to a host and scheme rather than an individual API path or port. Previous grants can remain when you change an AI address; review or revoke site access in Chrome's extension settings. An upgrade does not promise to remove previously granted access.

Content scripts run only on `x.com`, `pro.x.com`, `twitter.com`, and `mobile.twitter.com`. Granting an AI host does not inject content scripts there.

## 5. Changes and contact

Updates to this policy are published in this repository. For questions, open an issue in the project's GitHub repository.

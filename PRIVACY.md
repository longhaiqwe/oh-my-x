# Privacy Policy for oh-my-x

Last updated: November 12, 2026

**oh-my-x** customizes X/Twitter, filters comments, and provides optional creator tools. This document describes local storage, requests to X, and optional AI requests.

## 1. Local storage and developer access

- Settings, keyword lists, allow/block lists, interception logs and statistics, Lists metadata, saved bloggers, their X-hosted avatar URLs and display order, creator rewards data, and AI configuration (including your API key) are stored in `chrome.storage.local`. The API key is not encrypted by the extension; password masking in the settings is only a display feature.
- The popup and settings page also keep copies of a few settings (interface language, the last opened tab, the spam word list, collapsed sections) in the extension's own `localStorage`, so they open without waiting for `chrome.storage.local`. On X pages, the schedule panel saves the query ID and query parameters of X's scheduled-posts request in that page's `localStorage` so it can refresh the list; it does not save cookies or credentials there.
- The own-post library stores account IDs, post IDs and text, article titles/previews, X-hosted thumbnail URLs, dates, and synchronization checkpoints in extension-local IndexedDB. It does not store session cookies or credentials in this database.
- AI reply scores are cached in extension-local IndexedDB for up to 7 days, with a maximum of 5,000 entries. Manual bot/human labels, including the reply and its context, remain until removed and can be exported as JSONL. Marked bot accounts and daily AI usage counters are stored in `chrome.storage.local`.
- Cached posts may remain after editing or deletion on X. You can pause synchronization or disable automatic synchronization in settings. Removing the extension removes its local storage and database.
- The extension has no developer telemetry, advertising trackers, or analytics service. The developer does not receive your post library, API key, X credentials, or browsing history.

### Rewind history and image text

Rewind recording is off by default. When enabled, it records visible Home posts: account and post IDs, author snapshots, text, quotes, repost context, first-seen/publication dates, and X-hosted media URLs. Records stay in extension-local IndexedDB, isolated by account, with a limit of 3,000 posts and approximately 20 MB per account. Oldest records are removed at the limit. Pausing does not delete history. Clearing removes the current account’s records and associated OCR text; other accounts and the own-post library are not affected. Remote images may become unavailable, and saved text can outlive a deleted original.

Optional OCR runs locally in a bundled Tesseract worker. It downloads versioned language data from `cdn.jsdelivr.net` and images from `pbs.twimg.com` without credentials. These providers receive ordinary network request metadata, including the IP address; the extension does not send saved post text or recognition output to them or to an AI service. Language data remains cached locally after history is cleared. Turning OCR off stops work and excludes cached image text from search. Removing the extension removes the databases and language cache. Browser local storage holds feature switches, the last selected Rewind filter, progress and an invalidation marker; temporary pending-open state uses session storage.

## 2. Requests to X

- With an X page open and automatic synchronization enabled, the extension uses your existing X session to synchronize your own posts. Other features request Lists, post content/media, profile activity, and creator rewards data from X. Creator rewards may refresh in the background while you are signed in.
- Favorites name lookup: typing a display name in the add-blogger field sends the query (up to 30 characters) to the same X user-search endpoint using your existing X session. Candidate names, usernames, and X-hosted avatars are displayed for selection; only the chosen name and username are saved locally. Entering an explicit @username or profile link can add a favorite without this search.
- The extension reads X cookies such as `ct0` (CSRF token) and `twid` (account identification) for authenticated X requests and account isolation. X session credentials are not sent to AI services.
- The extension can load X's public client script from `abs.twimg.com` to resolve current API identifiers. Post thumbnails load from X's image CDN; the database stores their URLs, not image files.
- Mention by name: when you type a name containing non-English characters after @ in a post, quote, or reply editor, that name (up to 30 characters) is sent with your X session to X's user search, the same endpoint X's editor uses for @ suggestions. The results (names, usernames, profile image URLs, and whether you follow the account) are kept in the page's memory and discarded when the page is closed or reloaded.
- Save selection to drafts: when you choose "Save to X drafts" from the right-click menu, the extension reads the selected text on that page once and sends it, followed by the page's link (http and https pages only), to X with your X session to create a draft in your account. If that fails, it opens `x.com/intent/post` with the same text in the address so you can save the draft yourself. Nothing is read or sent before you click the menu item.
- GIF export downloads the selected post’s MP4 from `video.twimg.com` without cookies and converts it to GIF locally in an extension page. The extension does not upload media to a conversion service. Clicking Copy GIF writes the animation to the clipboard as HTML. When you paste this marked content into X’s editor, the extension restores it as a GIF attachment for X to upload; it does not publish the post. It does not request clipboard-read permission or read the clipboard in the background.
- User actions can add a member to an X List, download media, or use interaction helpers. If enabled, the reply helper can like a post after a successful reply. These actions communicate with X or its media CDN.

Opening Favorites can look up saved usernames through the existing X user-search endpoint to fill missing avatars. Only still-saved entries without an avatar are updated; names and order are preserved.

## 3. Optional AI service

- AI generation and connection testing run only when you click their controls. Before contacting a configured AI host, the extension checks its site permission. Grant access in **Settings → AI service → Authorize and test connection** (Chinese interface: 设置 → AI 服务 → 授权并测试连接). Declining permission prevents the request. Changing to a different host requires permission for that host.
- Generating repost options sends the selected source text (up to 12,000 characters, plus a truncation marker if necessary), available author name/handle and article title, your repost style (style description and sample posts, if you filled them in), your additional instructions, the extension's writing instructions, and model name to the configured OpenAI-compatible service. The API key is sent in the authorization header. Connection testing sends a short test message and model name with the API key, not the selected post.
- Optional AI reply checks run manually or automatically within the scope you enable. They send the original post, queued replies, the replied-to comment when available, author information, reply timing, available follower counts and verification status, scoring instructions, and model name to your configured service. The API key is sent in the authorization header. The sample test sends the bundled sample set. Scores and manual labels control local folding; they do not block accounts on X.
- Turning search text into search operators runs only when you click that item in X's search box dropdown. It sends the text in the search box (up to 300 characters), today's date and a few nearby dates in your local time, the extension's instructions, and model name to your configured service, with the API key in the authorization header. The returned search query is opened with X's own search.
- This is an external transfer to the service you configure, unless you choose a local service. That service's retention, processing, and billing terms apply. Generated options are shown for you to choose; the AI feature does not publish posts automatically.
- AI requests omit browser cookies and reject redirects. Repost generation has no extension-imposed waiting limit; network, browser, or provider limits may still end it. Other AI requests allow 25 seconds for the first data, 15 seconds of subsequent inactivity, and 90 seconds overall. Canceling or closing the requesting panel aborts the extension's request and discards late results. A provider may already have received or processed it; cancellation does not guarantee that provider-side processing or billing stops.
- Remote services must use HTTPS. HTTP is accepted only for local services at localhost and 127.0.0.1, so text and API keys sent over HTTP stay on this computer.

## 4. Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Store settings, configuration, caches, and local statistics. |
| `cookies` | Read X session/account cookies for X requests and account isolation. The code does not read AI-provider cookies. |
| `alarms` | Schedule post-library checks, creator rewards refresh checks, and resumable local OCR work. |
| `offscreen` | Run the bundled OCR worker in an extension-owned document without opening a tab. |
| `downloads` | Save media when you select a download action. |
| `scripting` | When you click Scan last 7 days in the popup on an X profile page and the page's content script does not respond (for example, after the extension was updated), run the extension's own scan function in that X tab, so the page does not need a reload. It is used only on the active X tab and only after that click. It also reads the selected text after you choose Save to X drafts (see `activeTab`). |
| `contextMenus` | Show the Save to X drafts item in the right-click menu when text is selected. |
| `activeTab` | After you choose Save to X drafts, read the selected text in that tab once, keeping line breaks. It gives no access to other tabs, and no access to that tab before the click. |
| Required host access | `x.com`, `pro.x.com`, `twitter.com`, `mobile.twitter.com` for X features; `abs.twimg.com` for X's public client script; `video.twimg.com` to fetch media for local GIF export. |
| Optional host access | The HTTPS host of your chosen AI service, or http://localhost / http://127.0.0.1 for a local service, requested at runtime for the configured host. OCR separately requests `https://pbs.twimg.com/*` and `https://cdn.jsdelivr.net/*` when enabled. No blanket access to all websites is requested at installation. |

Chrome site grants apply to a host and scheme rather than an individual API path or port. Previous grants can remain when you change an AI address; review or revoke site access in Chrome's extension settings. An upgrade does not promise to remove previously granted access.

Content scripts run only on `x.com`, `pro.x.com`, `twitter.com`, and `mobile.twitter.com`. Granting an AI host does not inject content scripts there. Save to X drafts runs a function that returns the current selection once on the page where you chose it; it does not add a content script to that site.

## Notification cards

Notification cards read already-rendered notifications on X and group them locally. Notification text and avatar URLs stay in the current page's memory (up to 500 entries per notification category). They are not sent to an AI service or an extension server. The extension stores an account-specific first-use timestamp, hashed notification identifiers, participant handles, viewing timestamps, new-post alert viewing times, the selected view, and unviewed/replies-only filter preferences in `browser.storage.local` to maintain local unviewed badges across visits. Viewing receipts are limited to 20 accounts and 2000 receipts per account. Viewing receipts are separate from X's official read state. Entering or returning to the notification tab can activate the current native notification category to refresh it; the extension does not call a separate notification API. Reply navigation temporarily stores the target post and account in the current tab's session storage for up to 15 seconds and clears it after positioning the composer; reply text is not stored.

## Audience insights

Audience insights is off by default. When enabled, it passively reads ordinary Followers and Following responses already requested by X. It does not automatically scroll, make extra list API requests, or send records to AI or extension servers. Stored fields include signed-in and target account IDs, list type, user IDs, handles, names, X avatar URLs, follower/following counts, account creation dates, explicit relationship flags, and observation times. Records use the extension’s own IndexedDB, not X page storage. Avatar images may be requested from X’s image host when displayed.

Records are separated by account and list. Limits are 3 targets per signed-in account, 20,000 followers or 10,000 following per list, and 100,000 entries or approximately 30 MiB of record content globally. Records stop merging across days; new entries stop at capacity without eviction. Disabling capture keeps saved lists. Settings can view, export or delete them without an open X tab. Clearing a list also invalidates writes that were already in progress. If sign-in identity cannot be confirmed, entries are held only in current-page memory and discarded on navigation. CSV exports are user-initiated local files.

## 5. Changes and contact

Updates to this policy are published in this repository. For questions, open an issue in the project's GitHub repository.

<p align="center">
  <img src="assets/logo.png" width="96" height="96" alt="oh-my-x Logo" />
</p>

<h1 align="center">oh-my-x</h1>

<p align="center">
  <strong>Adds the missing everyday features to X (Twitter) on the web.</strong><br>
  Page layout, spam reply filtering, data badges, writing tools, and quick actions. Each one has its own on/off switch.
</p>

<p align="center">
  <a href="https://github.com/longhaiqwe/oh-my-x/releases/latest"><strong>Download the latest release</strong></a> ·
  <a href="#install">Install</a> ·
  <a href="#features-in-detail">Features</a> ·
  <a href="PRIVACY.md">Privacy policy</a> ·
  <a href="README.md">中文</a>
</p>

<p align="center">
  <sub>English and Simplified Chinese interface · Chrome / Edge (Manifest V3) · Settings and data stay on your device · AI features are optional and use your own service</sub>
</p>

> [!NOTE]
> This README has no screenshots yet. If you use oh-my-x with the English interface, screenshots are welcome: save them in `docs/images/en/` with the same file names as the Chinese ones in `docs/images/`, and open a pull request. [README.md](README.md) shows where each image goes.

---

## Why

Several common tasks on X's web app take a detour, for example:

- Replies under posts and articles are mixed with emoji-stuffed promo and adult spam accounts;
- To reply under a long article, you scroll several screens to reach the reply box;
- To quote one of your older posts or articles, you open another tab to find the link;
- Your Following list does not show who doesn't follow you back, so you check profiles one by one.

oh-my-x is built on [X Focus](https://x.com/star_flow_ai/status/2097583620936585339) by [@star_flow_ai](https://x.com/star_flow_ai), with features requested by the author and friends on X. Turn off anything you don't need in the settings.

## Features at a glance

The settings popup has five tabs. The names below match the popup:

| Module | Features |
|------|------|
| [01 Layout & Reading](#01-layout--reading) | Timeline width, hide the right sidebar and Post button, navigation buttons and labels, article outline |
| [02 Content Filter](#02-content-filter) | Spam reply filter (9 rules + spam words), account exceptions, block log, keyword filter |
| [03 Insights](#03-insights) | Original Content Rewards, account activity, viral radar, ratio badges, follower counts, bookmark counts |
| [04 Create & Publish](#04-create--publish) | Quote my posts, image grid and ordering, AI quote drafts, schedule overview |
| [05 Engage & Lists](#05-engage--lists) | Keyboard shortcuts and bottom bar, jump to replies, like when replying, media download, non-follower marker, X Lists |

---

## Install

### Option 1: Download the release package (recommended, no development setup)

1. Download `oh-my-x-chrome-mv3.zip` from the [Releases page](https://github.com/longhaiqwe/oh-my-x/releases/latest)
2. Unzip it to get the `chrome-mv3` folder. Keep it in a fixed place and don't move it later
3. Open `chrome://extensions` (Edge works the same way) and turn on Developer mode at the top right
4. Click Load unpacked and select the `chrome-mv3` folder

**Update**: unzip the new version, overwrite the files in your existing `chrome-mv3` folder, then click the reload button on the oh-my-x card in `chrome://extensions`.

> [!WARNING]
> If you move the folder, or click Remove and load it again, Chrome treats it as a new extension and clears your settings, word lists, and block log.

### Option 2: Build from source

Requires Node.js 24 (includes npm).

```bash
git clone https://github.com/longhaiqwe/oh-my-x.git
cd oh-my-x
npm install
npm run build
```

Then turn on Developer mode in `chrome://extensions`, click Load unpacked, and select `oh-my-x/build/chrome-mv3/`.

### Option 3: Chrome Web Store

> Under review. The install link will be added after approval.

---

## Features in detail

### 01 Layout & Reading

#### Timeline width

Set the width of the main timeline column between 600 and 800 pixels.

#### Hide right sidebar, hide Post button

Two switches; on means hidden. The right sidebar includes search, Who to follow, and Trends. With the Post button hidden, press `N` to post; search is still available from Explore on the left. On a small screen, hiding both gives the timeline more room.

#### Navigation buttons and labels

Hide any of these 10 buttons: Explore, Notifications, Chat, Grok, Premium, History, Articles, Profile, More, and X Money. Items that X moves into the More menu are hidden there too. Navigation labels can be shown never, on hover, or always.

#### Article outline

On long posts, article pages, and the article editor, builds an outline from level 1 and 2 headings in a side panel. Click a heading to jump to it. It recognizes Markdown headings (`#`, `##`), Chinese numbering such as 「一、」 and 「第一章」, number prefixes such as "1." and "(1)", and paragraphs that are entirely bold.

### 02 Content Filter

#### Spam reply filter

Scores replies on post pages by rules. Replies that reach the hide threshold (55 by default, adjustable from 20 to 150) are hidden. Only replies in post conversations are scored; Home and other timelines are not.

**9 detection rules**, each with its own switch:

| Rule | What it checks | Default score |
|------|---------|--------|
| Promo display name | The display name contains a word from the spam word list | +40 |
| Emoji ratio | Emoji make up more than half of the reply | +20 |
| Too short | Under 2 words (under 8 characters for Chinese, Japanese, and Korean) | +10 |
| Random username | The username looks like a random mix of letters and digits (up to +25 when the pattern is strong) | +10 |
| Spam words | The reply contains words from the spam word list (adds up for several words, up to 65) | +35 |
| Emoji only | Nothing is left after removing emoji | +40 |
| Decorated display name | The display name contains 2 or more emoji | +15 |
| Repeated characters | The same character repeats 4 or more times in a row | +20 |
| Mention referral | The reply points to another account with a prefix such as "visit @", "go to @", or "👉@", or ends with an @mention followed by a few random characters or emoji | +20 |

- **Spam words**: +35 for the first matched word and +15 for each additional different word, up to 65. Managed separately from muted words. New installs with an English interface start with an English list (phrases such as "check my bio", "dm me", "onlyfans"); Add default words and Reset to default use the current interface language.
- **Word picker**: the word picker button next to More at the top right of a reply lets you pick words from the display name and reply text and add them to the list.
- **Debug mode**: shows the score and matched rules under each reply, to help tune the threshold and word list.

#### Account exceptions

Set an allowlist and a blocklist by `@handle`. Replies from allowlisted authors are never hidden; all replies from blocklisted authors are hidden. The list button next to More at the top right of a reply adds the author to a list directly.

#### Block log

Keeps the latest 50 hidden replies on your device, with the matched rules and score, and counts each day's blocks by category. The Filter tab shows today's total and the latest few records; click All records for details.

#### Keyword filter

Posts in your timeline that contain muted words can be collapsed into a one-line notice (click to expand, and collapse again), or hidden. New installs with an English interface start with "hot take", "unpopular opinion", "controversial take", and "spicy take".

### 03 Insights

#### Original Content Rewards

Shows your progress toward the creator rewards program in the popup: Verified Home Timeline impressions over the last 90 days / 500K.

Below it is one day's impression conversion: all impressions, verified impressions (from X account analytics), impressions counted toward rewards, and the share of verified in all impressions and of counted in verified impressions. Under that is a 7-day bar chart of counted impressions; click a bar to switch the day. The program only reports a running total, so the extension records it once a day after 02:30 UTC, and counted = today's total minus the previous day's. It appears from the second recorded day. Dates are in UTC.

#### Account activity

On a profile page, click Scan last 7 days to count that account's posts and replies for each of the last 7 days, to see whether it mostly posts or mostly replies. X limits how often its API can be called; scanning too often in a short time shows a message to try again later.

#### Viral radar

Sorts posts into normal, rising, and viral by views per hour (views ÷ hours since posting; the default cutoffs are 1,000 and 10,000 views per hour), adds a badge in the timeline, and can highlight posts with a border, background, or both.

#### Ratio badges

Under posts on profile pages, adds a badge to views, replies, reposts, and likes showing each number relative to the author's follower count, rated Poor, Fair, Good, Great, or Top.

#### Follower counts

Shows follower counts next to post authors and in user lists such as Following, Followers, and search (for example "125K followers"). Hover to see the exact follower and following counts. Choose All (default; post authors and user lists), Lists only, or Off.

#### Bookmark counts

Shows the bookmark count next to a post's Bookmark button. Turn it off under Insights → Page badges; numbers already shown are removed right away.

### 04 Create & Publish

#### Quote my posts

Adds a button to the post, quote, and reply editors. Search your own posts and articles and click a result to insert its link into the draft, without opening another tab.

- Post text, article titles, dates, and links are stored per account in the extension's local IndexedDB (a database built into the browser).
- When you open X while signed in, older posts sync in batches (up to 20 pages per batch, 2.5 seconds between pages; progress is saved, so closing the page resumes next time), then new posts are checked about every 30 minutes. Tabs share one sync lock, and sync can be paused and resumed.
- Turn off Sync while X is open under Create → Quote my posts. Cached posts stay searchable, and you can still sync manually.
- X's API does not always return the full history; the local copy may keep deleted posts or earlier versions of edited posts. It never posts anything automatically.

#### Image grid and ordering

When you attach 2 to 4 images, they are shown in two columns of equal tiles, left to right and top to bottom in posting order, with the order number in the bottom-right corner. Landscape and portrait images are shown uncropped. Drag an image to another tile and release; the post, scheduled post, or draft uses the new order, with no need to remove and upload again.

- A single click on an image opens X's Edit media as before. Press Esc while dragging to cancel.
- It changes the image order that X's editor keeps; post requests are not intercepted or modified. If X's data can't be read, X's layout is kept, and a failed drag shows a message.
- With a video or GIF, X's layout is kept. Turn it off under Create → Image grid and ordering.

#### AI quote drafts

In the post and quote editors, click the AI draft button to the right of Everyone. The extension reads the full text of the quoted post and uses your model to write two drafts. Pick one to put in the editor, then edit it yourself. Drafts are written in the interface language: English with the English interface, Chinese with the Chinese interface.

- Works with OpenAI-compatible APIs. Under Create → AI quote drafts, enter the base URL, API key, and model name, then click Authorize and test connection. The extension asks for access to that service address only; if you decline, no request is sent.
- Set your own writing style: describe it under Style description, and paste 2 to 5 quote posts you wrote under Sample posts, separated by a line containing only `---`. If both are empty, a plain default style is used.
- Generating sends the original post, author info, article title, writing style, and extra instructions to your service; the connection test sends only a short test message. Each request times out after 25 seconds. Canceling or closing the panel stops the request, but the provider may already have processed and billed it. Use HTTPS for remote services.

#### Schedule overview

In the schedule dialog and drafts, lists every scheduled post with its time, how long until it goes out, and the gap to the previous one. Gaps are colored by under 2 hours, 2 to 8 hours, 8 to 24 hours, and over 24 hours; gaps under 2 hours are flagged as too close.

There is also a schedule panel below the search box in the right sidebar. It lists upcoming scheduled posts by day, with each post's time and opening text, the gap between neighboring posts, and gaps across days on the date line. The refresh button reads the schedule from X again without opening drafts; it also reloads after you create, edit, or delete a scheduled post. The panel can be collapsed, or turned off under Create → Schedule overview → Sidebar panel.

### 05 Engage & Lists

#### Keyboard shortcuts and bottom bar

On a post page, use number keys: `1` reply, `2` quote, `3` like, `4` bookmark. A bar with these four buttons also appears at the bottom of the page and can be turned off separately.

#### Jump to replies

Shows a button at the bottom right of articles and long posts. Click it to jump to the replies and reply box; once there, it changes to Back to post, and another click returns to the text. If it covers content, drag it somewhere else; the position is remembered.

#### Like when replying

After you reply to someone's post, likes that post. It waits a random 0.3 to 0.7 seconds first, and skips posts you already liked and your own posts.

#### Media download

Adds options to download images, GIFs, and videos (MP4) to a post's share menu, styled like the other menu items and in the same language as X's menu. For your own videos, X's menu already has Download video, so no duplicate is added.

#### Non-follower marker

In your Following list, marks accounts that don't follow you in red.

#### X Lists

- Adds a My Lists entry to the left navigation that opens all your Lists. Put it Above Home or In Lists; the change applies right away.
- When you hover over an avatar or username, the profile hover card shows a "+ List" button. Click it and pick a List, without opening the profile.
- Sync your account's existing Lists in the settings, or add one by link or ID.

---

## Settings popup and full settings page

Click the oh-my-x icon in the browser toolbar to open the settings popup (400 pixels wide). It has 5 tabs (modules are defined in `shared/feature-registry.ts`):

| Tab (module) | Features |
|------|------|
| **Layout** (Layout & Reading) | Timeline width, right sidebar, Post button, navigation buttons and labels, article outline |
| **Filter** (Content Filter) | Spam reply filter (blocked today, hide threshold, debug mode, 9 detection rules, spam words), keyword filter and muted words, account exceptions (allowlist / blocklist), block log |
| **Insights** (Insights) | Dashboards: Original Content Rewards, account activity; page badges: viral radar, ratio badges, follower counts, bookmark counts |
| **Create** (Create & Publish) | Quote my posts, image grid and ordering, AI quote drafts, schedule overview |
| **Engage** (Engage & Lists) | Keyboard shortcuts and bottom bar, jump to replies, like when replying, media download, non-follower marker, X Lists |

The Filter tab has two levels: the first shows each feature's switch and status; click Settings, Manage muted words, Manage lists, or All records at the bottom right of a card to open the second level, and use the back button at the top left to return.

**Language**: the globe button at the top of the popup (at the top of the sidebar on the full settings page) switches between Browser default, 中文, and English. Browser default uses Chinese when the browser language starts with zh and English otherwise. Extension UI already shown on an open X page switches language after you reload that page.

**Full settings page**: the Full settings button at the top right of the popup opens the settings in a new tab, at the module the popup was showing. You can also open it from Extension options in the extension's details at `chrome://extensions`. It has the same content as the popup and shares the same settings, with more room for word lists, account lists, and AI service settings. `#layout`, `#filter`, `#insight`, `#create`, and `#engage` at the end of the address open the five modules.

---

## Privacy

- **Stored locally**: settings, word lists, the block log, and your AI API key are stored in `browser.storage.local`; the post library is stored in the extension's local IndexedDB. The extension does not encrypt the API key; masking in the settings only hides it on screen.
- **Requests to X**: post sync, Lists, user metrics, creator rewards, and interaction helpers use your existing signed-in session to talk to X. The developer does not receive this data and collects no telemetry.
- **Optional AI requests**: content is sent only when you generate or test, and only to a service address you authorized; that provider's data and billing terms apply. AI requests carry no browser cookies.
- **Permissions**: `storage`, `cookies`, `alarms`, `downloads`, `scripting`; default host access is limited to X domains and `abs.twimg.com`. Your AI host is granted on demand through optional permissions and can be managed in Chrome's extension settings.
- **Where scripts run**: page scripts are injected only on `twitter.com`, `mobile.twitter.com`, `x.com`, and `pro.x.com`.

See the [privacy policy](PRIVACY.md).

---

## Feedback

- Report problems or request features with an [Issue](https://github.com/longhaiqwe/oh-my-x/issues) or a pull request. You are also welcome to modify the source yourself.
- Screenshots of the English interface for this README are welcome; see the note at the top.
- X user group (Chinese-speaking): [join here](https://x.com/i/chat/group_join/g2111364237507670445/ElRmy78U7D). English feedback is easiest through GitHub Issues.
- Author: [@longhaiqwe123](https://x.com/longhaiqwe123)

## Thanks

- [X Focus](https://x.com/star_flow_ai/status/2097583620936585339) by [@star_flow_ai](https://x.com/star_flow_ai): oh-my-x is built on it.
- Friends on X who suggested features.

---

## Development

```bash
npm install
npm run dev        # development mode (HMR)
npm run build      # production build
npm test           # unit, DOM, and integration tests
npm run typecheck  # type-check TypeScript and Vue scripts and templates
npm run check      # type check + all tests + production build
npm run zip        # build + ZIP package
npm run clean      # remove build output
```

GitHub Actions runs `npm ci` and `npm run check` on push, pull request, and manual runs, and keeps the Chrome extension build for 7 days.

**Releasing**: change `version` in `package.json` and commit, then push a tag with the same version (for example `git tag v2.0.0 && git push origin v2.0.0`). `release.yml` checks that the tag matches the version, runs `npm run check`, and publishes `oh-my-x-chrome-mv3.zip` to the Releases page. CI uses Node.js 24; locally, use Node.js 24.15 or a later 24.x.

Interface text lives in `shared/i18n/zh-CN.ts` and `shared/i18n/en.ts`; see the "界面语言" section of [AGENT.md](AGENT.md) for the rules.

### Tech stack

| Area | Choice |
|------|------|
| Extension framework | WXT + Vite |
| UI | Vue 3 + reka-ui |
| Styles | Tailwind CSS 4 |
| Types | TypeScript |
| Tests | Vitest + jsdom |

### Project structure

```
oh-my-x/
├── entrypoints/
│   ├── content.ts       # Content script injected into x.com (isolated world)
│   ├── interceptor.content.ts # MAIN world data interceptor (scheduled posts API)
│   ├── background.ts    # Service worker (default word list sync, post library, Lists and media requests, creator rewards, AI requests)
│   ├── popup/           # Settings popup (Vue 3 SPA, 5 module tabs)
│   └── options/         # Full settings page (opens in a new tab, reuses the popup's module pages)
├── content-scripts/     # DOM work and feature implementations
│   ├── features/        # Page features (viral radar, article outline, Lists, quick actions, AI drafts, and more)
│   ├── spam/            # Spam reply scanning and rule checks
│   ├── options/         # Per-feature options (timeline, navigation, editor, ratio badges, and more)
│   └── utilities/       # Helpers and storage wrapper
├── shared/              # Logic shared across contexts (feature list, rule engine, AI prompts, i18n, data types)
├── docs/images/         # README images
├── test/                # Vitest suites (unit, integration, and sample tests)
└── storage-keys.ts      # All storage keys + defaults
```

---

## License

MIT

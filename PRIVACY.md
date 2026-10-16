# Privacy Policy for oh-my-x

Last updated: October 2026

**oh-my-x** ("the Extension") is committed to protecting your privacy. This Privacy Policy explains how our extension handles your data.

## 1. No Developer Telemetry

- **No Post Cache Sent to the Developer**: Your local post library and synchronization records remain on your device. The developer does not receive or sell this cache, account credentials, or browsing history across other websites.
- **No Remote Telemetry or Tracking**: The extension does not include any third-party tracking scripts, advertising trackers, or analytics services (e.g., Google Analytics).

## 2. Local-Only Storage

- All user settings, custom keyword lists, whitelist/blacklist configurations, and spam interception logs are stored exclusively in your browser's local storage (`chrome.storage.local`).
- The own-post picker stores your X account ID, post IDs, text, article titles/previews, X-hosted thumbnail URLs, dates, and synchronization checkpoints in extension-local IndexedDB. This enables local keyword search across previously synchronized posts. It does not store session cookies or credentials in the database. Synchronization uses your existing X session while an X tab is open and can be paused in the picker or disabled in settings. Thumbnail images are loaded from X’s image CDN when displayed; the database stores their URLs rather than image files. Cached copies can remain after a post is edited or deleted on X; removing the extension removes its local database.
- This data remains on your device and is never uploaded or synchronized to any external servers operated by us or any third party.

## 3. Permissions Used

The extension strictly follows the principle of least privilege:
- **`alarms`**: Wakes eligible open X tabs to check whether local post-library synchronization is due; it does not send posts to external services.
- **`storage`**: Used to save your display preferences, custom spam filter keywords, whitelist, blacklist, and local filter statistics on your local device.

The extension runs content scripts strictly on `x.com`, `pro.x.com` and `twitter.com` to provide UI customization (e.g. adjusting timeline width, displaying table of contents) and client-side comment filtering.

## 4. Third-Party Disclosures

We do not sell, trade, or transfer your information to any third parties.

## 5. Changes to This Policy

We may update this Privacy Policy from time to time. Any changes will be posted in this repository.

## 6. Contact

If you have any questions about this Privacy Policy or the practices of this Extension, please open an issue in the project's GitHub repository.

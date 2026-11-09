# Changelog

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

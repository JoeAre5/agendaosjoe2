# Admin-only duplicate profile badges

## Verified findings
- The hamburger already displays a combined red pending-item badge. Ventas displays pending-payment and duplicate-payment counts.
- Clientes and its top duplicates icon currently have no duplicate-profile badge.
- The existing duplicate-profile checker already finds possible matches by email, phone and name, and restricts access to owners or super-admins. A match is a suggestion, not proof of identity.
- The existing pending badge's `duplicate_count` means duplicate **payments**, not duplicate profiles. Keep these counts separate.

## Proposed minimum change
1. Reuse the existing duplicate-profile checker, without adding tables or a second matching system.
2. Share one admin-only duplicate-profile count across the hamburger, the Clientes menu entry and the top duplicates icon. Use the existing red pending-payment badge appearance. Show the same count beside the existing Duplicados menu shortcut and desktop Clientes entry.
3. Count the review groups shown by the existing duplicates page, not every profile inside them. The same profiles may appear under more than one matching criterion, just as on that page today. Add that count once to the hamburger's existing total. Keep Ventas and its payment counts unchanged; do not add client alerts to the desktop inbox badge.
4. Refresh when profiles are created, updated or deleted, after a manual merge attempt (including partial success), and when returning to the app. Reuse the existing 800 ms debounce and shared caching so three badges do not make three separate requests. Confirm live-update availability and use a lightweight periodic refresh only if needed, without changing live database configuration.
5. Keep the badge until the possible match is resolved. Opening the list alone does not clear it. Existing unresolved groups also appear initially; this is a pending-review badge, not an unread-notification inbox.
6. Keep all merges manual, with the existing review and confirmation. Do not modify matching criteria, merge behavior, client records, email placeholders or Acuity.

## Impact and risks
- **Verified:** no database change is needed for the minimum version. Existing authorization remains the server-side boundary, and non-admin sessions must not fetch or display the new count.
- **Proposed:** a session-scoped shared count prevents stale badges across sign-out and avoids duplicated reads.
- **Verified limitation:** same-name groups can include relatives or different people. The notification must say “possible duplicates,” never imply that merging is required.
- **Not verified yet:** delivery of live client-change events and current matching scope across multiple shops. Do not broaden access or alter permissions to make the badge work.
- Separate payments, accounting, payroll, scheduling, PWA signup, Clients/VIP recognition and authentication behavior remain untouched.

## Alternatives deferred
- A separate unread-notification inbox would require stored notification/read state and is unnecessary for the requested pending-payment protocol.
- Ignoring legitimate same-name matches would require its own reviewed dismissal rule. Do not add it in this change.

## Validation before completion
- Add tests for admin-only fetching/display, zero counts, group counting, adding the count only once to the hamburger, and preserving payment totals.
- Test profile creation and manual-merge refresh with browser-only intercepted responses, never create or merge production clients for testing.
- Verify the real admin's existing groups read back through all three badges and the duplicates page on mobile and desktop.
- Check a non-admin session, session changes, refresh, app return, query errors and cleanup. Failed requests must not be presented as a confirmed zero.
- No production database changes, no drafts and no publishing as part of this task.

## Authorization
Approve this minimum badge-only approach before implementation. Badge clearing means the match is resolved, not merely viewed.
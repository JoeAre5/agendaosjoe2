---
name: Unified Auth Entry Point
description: Single login page (/login) for all roles. Routes /admin/login, /pros/login, /client/login redirect here. Role-based redirect post-auth.
type: feature
---

All roles (owner, barber, client) sign in through a single page: `src/pages/ClientLogin.tsx` mounted at `/login`.

Legacy redirect routes still live in `App.tsx` so old bookmarks keep working:
- `/admin/login` → `/login`
- `/pros/login` → `/login`
- `/client/login` → `/login`
- `/app/cliente/login` → `/login`

After Supabase authenticates, `RoleGuard` reads the role from `user_roles` and routes the user:
- `client` → `/app/cliente`
- `owner` / `barber` → `/admin`

The pill above the logo on the login page reads "Clientes / Clients" because that is the canonical entry, but staff use the same page.

`Login.tsx` and `ProsLogin.tsx` were deleted as dead code. If separate branded login pages are ever wanted again, recreate them and point the corresponding routes back at the new components.

Idle-logout (`useIdleLogout`) and AppShell now redirect signed-out staff to `/login` (not `/admin/login` or `/pros/login`).

## Session persistence (all roles)

Sessions persist indefinitely across full app close/reopen for **every** role:
- Supabase client uses `localStorage` + `persistSession: true` + `autoRefreshToken: true` (see `src/integrations/supabase/client.ts`).
- Refresh tokens are valid for 90 days and silently rotate on every API call.
- `useIdleLogout` is **disabled** in `AppShell` (`enabled: false`) — staff stay signed in like clients. The hook itself is still wired so it can be re-enabled by flipping the flag if security posture changes.
- The only ways to sign out: tap "Cerrar sesión", clear browser data, or refresh-token expiry after 90 days of zero use.

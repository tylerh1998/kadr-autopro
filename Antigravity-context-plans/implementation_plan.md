# Implementation Plan: UI Lock for `autopro_access_lvl = no_access`

Implement a full-screen UI lock in AutoPro that blocks access to all application routes, navigation sidebars, and page components whenever an authenticated user has `autopro_access_lvl = 'no_access'` (or no matching Employee record). This is enforced strictly at the frontend routing layer without altering Database Row-Level Security (RLS).

## User Review Required

> [!IMPORTANT]
> - **Fallback behavior**: If an authenticated user has no matching row in the `Employee` table or `autopro_access_lvl` is explicitly `'no_access'`, the UI Lock will trigger by default.
> - **Pure UI Enforcement**: As requested, this plan alters only frontend context, routing, and layout guards. No database tables or RLS policies will be modified.

## Open Questions

> [!NOTE]
> - Should `autopro_access_lvl === null` or `undefined` also trigger the UI Lock, or fall back to standard access? *(Current plan defaults to locking access whenever `autopro_access_lvl === 'no_access'` or when an employee record is missing).*

## Proposed Changes

### Auth & Security Context

#### [MODIFY] [AuthContext.jsx](file:///C:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/lib/AuthContext.jsx)
- Expose `hasNoAccess` boolean flag and `autoproAccessLvl` string helper in `AuthContext`.
- Compute `hasNoAccess = !employee || employee?.autopro_access_lvl === 'no_access'`.

---

### UI Components

#### [NEW] [AccessDeniedLock.jsx](file:///C:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/lib/AccessDeniedLock.jsx)
- Create a full-screen UI lock screen featuring:
  - Shield/Lock icon badge with dark mode compatibility (`dark:bg-amber-950/40`, `dark:border-amber-800`).
  - Clear heading: **Access Restricted**.
  - Informative text: "Your employee account currently has no access permissions granted for AutoPro (`autopro_access_lvl = no_access`)."
  - Summary details card showing User Name, Email, Employee ID, and Access Level status.
  - Action button: **Sign Out / Switch Account** (calls `logout()` from `useAuth()`).
  - Link: **Go to myKADR Account** (`https://my.kensauto.ca`).

---

### Core Application Router

#### [MODIFY] [App.jsx](file:///C:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/App.jsx)
- Update `AuthenticatedApp`:
  - Check `hasNoAccess` after `isLoadingAuth` completes.
  - If `true`, render `<AccessDeniedLock />` instead of `<Routes>` and `<LayoutWrapper>`.
  - Ensures no sub-routes, pages, or background data-fetching hooks can be executed.

---

### Layout & Badges

#### [MODIFY] [Layout.jsx](file:///C:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/Layout.jsx)
- Update profile access level badge text (lines 936–940) to explicitly handle `'no_access'` ("Access Disabled").
- Add secondary guard in `LayoutWrapper` to render `<AccessDeniedLock />` if `autopro_access_lvl === 'no_access'`.

---

## Verification Plan

### Manual Verification
1. **Testing `no_access` Lock**:
   - Set an employee's `autopro_access_lvl = 'no_access'` in Supabase `Employee` table.
   - Refresh the AutoPro application.
   - Verify that `<AccessDeniedLock />` renders full-screen immediately.
   - Verify that sidebar navigation, headers, routes, and data calls are completely blocked.
   - Verify clicking **Sign Out** cleanly logs the user out to myKADR SSO.
2. **Testing Valid Access (`lvl1_user`, `lvl2_user`, `lvl3_user`)**:
   - Verify that employees with valid access levels load the application normally.
3. **Dark Mode Verification**:
   - Verify that the lock screen supports both light mode and dark mode palettes.

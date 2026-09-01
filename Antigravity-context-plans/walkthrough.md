# Walkthrough: UI Lock for `autopro_access_lvl = no_access`

Added a full-screen UI lock in AutoPro that blocks access to all application routes, sidebars, headers, and page components whenever an authenticated user has `autopro_access_lvl = 'no_access'` (or lacks a matching Employee record).

## Changes Made

### Auth Context
- **[AuthContext.jsx](file:///C:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/lib/AuthContext.jsx)**
  - Added `hasNoAccess` boolean flag and `autoproAccessLvl` string helper to `AuthContext`.
  - Computes `hasNoAccess = isAuthenticated && (!employee || employee?.autopro_access_lvl === 'no_access')`.

### UI Lock Component
- **[NEW] [AccessDeniedLock.jsx](file:///C:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/lib/AccessDeniedLock.jsx)**
  - Full-screen, dark-mode compatible UI lock component.
  - Displays amber warning badge, **Access Restricted** title, and clear error explanation.
  - Summarizes user details (Name, Email, Employee ID, Access Level).
  - Provides **Sign Out** button (calls `logout()`) and **myKADR Account** link.

### Routing & Guard
- **[App.jsx](file:///C:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/App.jsx)**
  - Top-level guard in `AuthenticatedApp`: if `isAuthenticated && hasNoAccess`, renders `<AccessDeniedLock />` immediately.
  - Completely prevents routing, layout rendering, and background data fetching for restricted accounts.

### Layout Badge
- **[Layout.jsx](file:///C:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/Layout.jsx)**
  - Updated profile dropdown badge text to display `"Access Disabled"` when `autopro_access_lvl === 'no_access'`.

---

## Verification Results

1. **`no_access` Account Lock**:
   - Authenticated users with `autopro_access_lvl = 'no_access'` (or missing Employee records) are immediately greeted with the full-screen `<AccessDeniedLock />` UI.
   - All navigation controls, sidebar links, header actions, and background data queries are blocked.
   - Clicking **Sign Out** redirects cleanly to the SSO login endpoint.
2. **Valid Access Accounts**:
   - Accounts with `'lvl1_user'`, `'lvl2_user'`, or `'lvl3_user'` continue to access AutoPro normally.

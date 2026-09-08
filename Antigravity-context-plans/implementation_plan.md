# Implementation Plan: Clean Up & Centralize `@no-reply.base44.com` Audit String Checks

Refactor and centralize scattered `@no-reply.base44.com` string checks into a single shared utility helper (`formatAuditUserDisplay`), and provide a database cleanup script to sanitize legacy audit records in Supabase.

## User Review Required

> [!IMPORTANT]
> - **Two-Part Resolution**:
>   1. **Frontend Refactor**: Centralizes user display logic into a single helper (`src/utils/userDisplayUtils.js`) and updates all 4 components (`InventoryHistoryModal`, `WorkOrderHeaderInfo`, `WorkOrderViewHeaderInfo`, `WorkOrderHistoryModal`).
>   2. **Database Data Sanitization**: A SQL update script is provided to sanitize existing legacy rows in Supabase (`InventoryAuditLog`, `WorkOrder`, `WorkOrderHistory`), converting legacy `@no-reply.base44.com` emails directly to `'System'`.

## Proposed Changes

### Shared Utilities

#### [NEW] [userDisplayUtils.js](file:///C:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/utils/userDisplayUtils.js)
- Create a centralized audit user display helper function:
  ```javascript
  export function formatAuditUserDisplay(emailOrName, employees = []) {
    if (!emailOrName) return 'System';
    if (emailOrName === 'System' || emailOrName.endsWith('@no-reply.base44.com')) return 'System';
    if (employees && employees.length > 0) {
      const match = employees.find(e => e.email === emailOrName);
      if (match) return match.full_name || `${match.first_name || ''} ${match.last_name || ''}`.trim() || emailOrName;
    }
    return emailOrName;
  }
  ```

---

### Component Refactored Files

#### [MODIFY] [InventoryHistoryModal.jsx](file:///C:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/components/inventory/InventoryHistoryModal.jsx)
- Replace local inline `getCreatedByDisplay` function with `formatAuditUserDisplay`.

#### [MODIFY] [WorkOrderHeaderInfo.jsx](file:///C:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/components/work-orders/form/WorkOrderHeaderInfo.jsx)
- Replace local `getUserDisplayName` logic with `formatAuditUserDisplay`.

#### [MODIFY] [WorkOrderViewHeaderInfo.jsx](file:///C:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/components/work-orders/form/WorkOrderViewHeaderInfo.jsx)
- Replace local `getUserDisplayName` logic with `formatAuditUserDisplay`.

#### [MODIFY] [WorkOrderHistoryModal.jsx](file:///C:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/components/work-orders/history/WorkOrderHistoryModal.jsx)
- Replace local `resolveUserName` logic with `formatAuditUserDisplay`.

---

### Database Data Sanitization Script

Provide the following SQL script to execute in the Supabase SQL Editor:

```sql
-- Sanitize legacy Base44 system audit emails to 'System'
UPDATE "InventoryAuditLog"
SET created_by = 'System'
WHERE created_by LIKE '%@no-reply.base44.com%';

UPDATE "WorkOrder"
SET created_by = 'System'
WHERE created_by LIKE '%@no-reply.base44.com%';

UPDATE "WorkOrder"
SET last_updated_by = 'System'
WHERE last_updated_by LIKE '%@no-reply.base44.com%';

UPDATE "WorkOrder"
SET completed_by = 'System'
WHERE completed_by LIKE '%@no-reply.base44.com%';

UPDATE "WorkOrderHistory"
SET created_by = 'System'
WHERE created_by LIKE '%@no-reply.base44.com%';
```

---

## Verification Plan

### Automated / Syntax Check
- Verify clean imports and zero linting/build errors (`npm run build`).

### Manual Verification
- Open **Inventory History Modal** on an item and verify transaction creator displays `"System"` or employee name correctly.
- Open **Work Order Header Info** and **Work Order History Modal** and verify creator/updater display names render cleanly.

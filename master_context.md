# AutoPro Master System Context

## 1) Purpose Statement
The all-in-one management solution for automotive repair shops, streamlining work orders, inventory, scheduling, payroll, and financials for efficient business operations.

## 2) Module Context & Architecture
*   **Sales & Work Management:** Work orders, estimates, invoices, notes, and WorkPro integrations.
*   **Scheduling:** Appointments, WO/WorkPro calendar integrations, reminders.
*   **Inventory Management:** Inventory items, returns, history, parts entry, cores, levies, sales classes.
*   **Customer Management:** Customer CRUD, history, Accounts Receivable (AR), email logging.
*   **Vehicle Management:** Vehicle CRUD and service history.
*   **Accounts Payable:** Supplier CRUD, transactions (charges/payments), Lines of Credit (charges, credits, payments).
*   **Banking:** Cash drawer, bank accounts, transactions, reconciliations, transfers, cash flow tracking.
*   **Accounting:** Chart of accounts, balance sheet, P&L, financial dashboard, GL ledger, GST/taxes, journal entries, fiscal periods.
*   **Payroll:** Payroll transactions and ledger entries.
*   **Setup:** Global system settings and configurations.

## 3) Global Technical Rules & Conventions
*   **Supabase Edge Functions:** 
    * Must always use the `autopro-[functionname]` naming format.
    * **Error Handling:** Edge Functions must return a `200 OK` status with an `{ error: "message" }` JSON payload instead of throwing raw 4xx/5xx HTTP errors. The Supabase JS client (`FunctionsHttpError`) intercepts non-2xx codes and swallows the JSON response body, hiding the actual error message from the frontend.
    * **Payloads:** Deno edge functions typically require payloads to be wrapped as `{ body: { ... } }` when invoking from the frontend via the Supabase client.
*   **Base44 API & Authentication:**
    * **API Key Limitations:** While the Base44 LLM Instructions suggest using an `api_key` header, this key *only* grants read access to generic entities (e.g., `/entities/User/me`). It **does not** work for executing custom Base44 Functions (e.g., `getworkorderlist`) via proxy.
    * **Proxy Authentication:** When using `X-Act-As-User` to execute functions on behalf of other users, the proxy *must* send a valid JWT via the `Authorization: Bearer <JWT>` header. Using an `api_key` in this scenario will result in an unhelpful `500 Internal Server Error` ("This app is private, You do not have access to this app") from the Base44 backend.
    * **System Tokens:** The `BASE44_ACCESS_TOKEN` used in Edge Functions should be a long-lived JWT obtained from a valid admin session (e.g., from the `base44_access_token` browser cookie), not an API key.
*   **Data Models & Schemas:** 
    * **Postgres Triggers:** Updating rows directly via the Supabase client can conflict with Postgres triggers. For example, updating `InventoryItem.quantity_on_hand` fires `trg_inventory_audit`. To pass context to these triggers, you *must* use a dedicated RPC (e.g., `update_inventory_with_audit`) that sets Postgres session variables (`set_config`) before running the update. Mixing direct `.update()` calls with manual log `.insert()` calls leads to duplicate and corrupted records.
    * **Data Types:** Always strictly cast variables (e.g., `Number()` or `parseFloat()`) before saving to the database. JS string concatenation bugs (e.g., `"5" + "1" = "51"`) caused severe data corruption in the legacy database.
    * **Native Over Legacy:** Always prefer direct `supabase.from()` calls or native RPCs over the legacy `base44.functions.invoke('SupabaseProxy')` wrapper.
*   **UI/UX Standards:** 
    * Use accessible, soft UI patterns (Tailwind CSS, Radix primitives via `shadcn/ui`).
    * Implement robust error boundaries, loading skeletons, and graceful degradation.

## 4) Key Area Nuggets & Inner Workings
*   *Sales/AR Integration:* Invoice posting mechanics trigger synchronous dual-entry GL transactions. When an RO converts to an Invoice, `autopro-handleInvoiceConversionGL` orchestrates moving funds from WIP/Inventory accounts to COGS, recognizing Revenue, tracking Tax liabilities, and debiting AR.
*   *Inventory, Cores & Levies:* 
    * **Audit Log:** The legacy `InventoryTxs` table is deprecated. All inventory history is managed natively by `InventoryAuditLog`. Reads and writes MUST hit this table.
    * **Returns:** Core and warranty returns hit `WarrantyReturnModal` and `InventoryPartsReturnModal`, communicating directly with supplier credit endpoints.
*   *Edge Function Architecture:* 
    * `autopro-processInventoryReceipt`: Generates supplier invoice lines, maps GL entries for Accounts Payable, and augments inventory QOH/QOO.
    * `autopro-mergeInventoryItems`: Merges duplicate parts seamlessly, automatically cascading the new ID through historical `InventoryAuditLog` and `SupplierInvoiceLine` references to preserve history.

## 5) Long-Term Architectural Roadmap
*   **Base44 Deprecation (Phase 3):** Clean up all frontend references to `InventoryTxs` and delete the legacy `inventoryUpdate` Edge Function.
*   **Supabase Proxy Migration:** Migrate all remaining modules away from `base44.functions.invoke('SupabaseProxy')` directly to the `supabase` JS client for maximum performance and strict typing.
*   **Complete Decommission of Base44:** Move all remaining business logic off the legacy API and sunset the server.

## 6) User Preferences & Constraints
*   **Data Integrity First:** Double-entry accounting rules and exact inventory quantities are sacred. Prioritize backend constraints (RPCs, triggers) to guarantee data safety.
*   **Consistency:** Keep UI styling consistent with existing modal and table patterns. Do not introduce major UI changes unless requested.
*   **Transparency:** Provide verbose `console.log` and `console.error` outputs in complex operations (especially GL and Inventory syncing) to aid in frontend debugging.
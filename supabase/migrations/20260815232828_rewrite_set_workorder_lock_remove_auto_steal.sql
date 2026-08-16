-- Rewrites set_workorder_lock (originally created by
-- 20260815161500_create_set_workorder_lock_rpc.sql) as part of the Work Order
-- Locking Remediation plan (Plans and Context/implementation_plan_wo_locking.md,
-- Phase 1). This was applied live to the dev project (sitihbdnuxifwibontcm) via
-- apply_migration during that phase with no matching migration file committed at
-- the time -- this file closes that gap and is the version promoted to production.
--
-- Behavior changes from the original:
--   * 'apply' no longer does a second, stale-timestamp-gated UPDATE that silently
--     hands the lock to a new caller after 120 minutes. A contested lock now just
--     reports the current holder back to the caller every time - no auto-steal.
--   * Two new actions, 'force_apply' and 'force_release', are added as explicit,
--     unconditional overrides. Both MUST only be invoked from a call site that has
--     already gated the action behind a real, interactive user confirmation - the
--     RPC itself has no way to verify that. Callers: 'force_apply' from the "Save
--     anyway" confirm in useDocumentEditorSave.jsx; 'force_release' from the
--     single-Work-Order "Clear Lock" confirm in WorkOrders.jsx.
--   * Return type changes from jsonb to the "WorkOrder" row type itself, so callers
--     read LockedByUser/locked_timestamp directly instead of a
--     {success, locked_by_user, locked_timestamp} wrapper. Postgres won't let
--     CREATE OR REPLACE change a function's return type, so the old jsonb-returning
--     version must be dropped first.
drop function if exists public.set_workorder_lock(text, text, text);

create or replace function public.set_workorder_lock(
  p_ro_number text,
  p_action text,       -- 'apply' | 'release' | 'force_apply' | 'force_release'
  p_locked_by_user text
) returns "WorkOrder"
language plpgsql as $function$
declare
  v_row "WorkOrder"%rowtype;
begin
  if p_action = 'apply' then
    -- Race-safe acquire: single statement, only succeeds if unlocked or already owned by caller.
    update "WorkOrder"
      set "LockedByUser" = p_locked_by_user, locked_timestamp = now()
      where ro_number = p_ro_number
        and ("LockedByUser" is null or "LockedByUser" = '' or "LockedByUser" = p_locked_by_user)
      returning * into v_row;

    if v_row.id is null then
      -- Someone else holds it. No auto-steal on staleness (removed 2026-08-15) - just report
      -- the current state so the caller can show an explicit "X holds this" prompt.
      select * into v_row from "WorkOrder" where ro_number = p_ro_number;
    end if;

  elsif p_action = 'force_apply' then
    -- Explicit, human-confirmed override only (e.g. "Save anyway" after a warning dialog).
    -- Unconditional - callers MUST gate this behind a real user confirmation; the RPC itself
    -- has no way to verify that.
    update "WorkOrder"
      set "LockedByUser" = p_locked_by_user, locked_timestamp = now()
      where ro_number = p_ro_number
      returning * into v_row;

  elsif p_action = 'release' then
    update "WorkOrder"
      set "LockedByUser" = null, locked_timestamp = null
      where ro_number = p_ro_number
        and ("LockedByUser" is null or "LockedByUser" = p_locked_by_user)
      returning * into v_row;

  elsif p_action = 'force_release' then
    -- Manual "Clear Lock" action only (WorkOrderList.jsx / WorkOrderTable.jsx context menu).
    -- Unconditional - callers MUST gate this behind a real user confirmation.
    update "WorkOrder"
      set "LockedByUser" = null, locked_timestamp = null
      where ro_number = p_ro_number
      returning * into v_row;
  end if;

  return v_row;
end;
$function$;

grant execute on function public.set_workorder_lock(text, text, text) to anon, authenticated, service_role;

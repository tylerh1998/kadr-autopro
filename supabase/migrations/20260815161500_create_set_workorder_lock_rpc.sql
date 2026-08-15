-- set_workorder_lock is called from src/components/work-orders/DocumentEditor.jsx
-- and src/components/work-orders/hooks/useDocumentEditorSave.jsx to acquire/release
-- the edit lock on a work order, but was never created in the database. The RPC
-- error was being swallowed (console.error only), so the UI proceeded to show the
-- lock as "acquired" even though nothing was written -- two users could silently
-- overwrite each other's edits on the same RO.
create or replace function public.set_workorder_lock(
  p_ro_number text,
  p_action text,
  p_locked_by_user text
)
returns jsonb
language plpgsql
as $function$
declare
  v_row public."WorkOrder"%rowtype;
begin
  if p_action = 'apply' then
    update public."WorkOrder"
    set "LockedByUser" = p_locked_by_user,
        locked_timestamp = now()
    where ro_number = p_ro_number
      and ("LockedByUser" is null or "LockedByUser" = p_locked_by_user)
    returning * into v_row;

    if not found then
      select * into v_row from public."WorkOrder" where ro_number = p_ro_number;
      return jsonb_build_object(
        'success', false,
        'locked_by_user', v_row."LockedByUser",
        'locked_timestamp', v_row.locked_timestamp
      );
    end if;

    return jsonb_build_object(
      'success', true,
      'locked_by_user', v_row."LockedByUser",
      'locked_timestamp', v_row.locked_timestamp
    );

  elsif p_action = 'release' then
    update public."WorkOrder"
    set "LockedByUser" = null,
        locked_timestamp = null
    where ro_number = p_ro_number
      and "LockedByUser" = p_locked_by_user
    returning * into v_row;

    return jsonb_build_object(
      'success', found,
      'locked_by_user', null,
      'locked_timestamp', null
    );

  else
    raise exception 'Invalid p_action: %, expected apply or release', p_action;
  end if;
end;
$function$;

grant execute on function public.set_workorder_lock(text, text, text) to anon, authenticated, service_role;

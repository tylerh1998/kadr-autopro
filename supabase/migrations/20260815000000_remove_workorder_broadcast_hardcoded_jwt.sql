-- Removes the hardcoded anon-key JWT from the WorkOrder_Broadcast webhook trigger.
-- The called function (WorkOrder-Broadcast) never reads the Authorization header --
-- it authenticates internally via the auto-injected SUPABASE_SERVICE_ROLE_KEY --
-- so the header was doing nothing except carrying a plaintext credential-shaped
-- string in a DB object. Requires the edge function's verify_jwt to already be
-- false (done via a prior deploy_edge_function call, dev only) before applying,
-- otherwise the gateway would reject the now-header-less call with 401.
--
-- Must stay ONE trigger covering all three events, not three separate
-- CREATE OR REPLACE TRIGGER statements sharing the same name -- trigger names
-- are unique per table in Postgres, so three same-named statements just
-- overwrite each other, leaving only the last event live (caught live on dev
-- during this migration's first attempt: INSERT/UPDATE silently stopped
-- broadcasting, only DELETE survived, fixed same session).
--
-- See: Plans and Context/workorder_broadcast_update_plan.md

create or replace trigger "WorkOrder_Broadcast"
after insert or update or delete on "WorkOrder"
for each row execute function supabase_functions.http_request(
  'https://sitihbdnuxifwibontcm.supabase.co/functions/v1/WorkOrder-Broadcast',
  'POST',
  '{"Content-Type":"application/json"}',
  '{}',
  '5000'
);

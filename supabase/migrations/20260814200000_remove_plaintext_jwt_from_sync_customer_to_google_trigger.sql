-- Removes the plaintext service-role JWT hardcoded in the sync_customer_to_google
-- trigger's Authorization header. Same anti-pattern already fixed on the sibling
-- WorkOrder_Broadcast trigger (see that fix's history), except this one exposed a
-- service-role key rather than the public anon key -- more sensitive.
--
-- Safe because Google-Contacts-Sync's own code never reads the incoming
-- Authorization header (confirmed by pulling its deployed source directly --
-- it authenticates its own outgoing calls independently via a fresh Google OAuth
-- token + its own SUPABASE_SERVICE_ROLE_KEY env var). The function was redeployed
-- with verify_jwt: false immediately before this migration so the platform gateway
-- stops requiring a JWT at all, matching WorkOrder_Broadcast's own configuration.
--
-- Production-only fix -- this integration has no dev-branch equivalent (Customer
-- has zero triggers on dev) and must not be replicated there, since dev/test
-- customer data would sync into the shop's real Google Contacts.
--
-- Pre_go-live_plan.md P2. Verified 2026-08-14 via a direct, no-auth-header
-- invocation of the redeployed function (payload deliberately missing `record`,
-- failed the function's own validation before ever reaching Google's API --
-- proves the new auth model works with zero side effects on real Google Contacts).
--
-- Separate, out-of-band follow-up not covered by this migration: the now-removed
-- service-role JWT was readable via schema access and should be treated as
-- compromised -- rotate it via the Supabase dashboard.
DROP TRIGGER sync_customer_to_google ON "Customer";
CREATE TRIGGER sync_customer_to_google AFTER INSERT OR UPDATE ON public."Customer"
  FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(
    'https://hbcrwkmgsazqrvsrmxyr.supabase.co/functions/v1/Google-Contacts-Sync',
    'POST',
    '{"Content-type":"application/json"}',
    '{}',
    '5000'
  );

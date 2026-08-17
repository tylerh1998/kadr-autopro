// One-off verification script for the staff_strong_auth() RLS migration -
// runs §5 steps 2 and 4 from rls_strong_auth_policy_plan.md against dev.
// Fully non-interactive: step 2 uses a throwaway signup (no MFA ever
// completed = a real AAL1-only session, no existing credential needed);
// step 4 uses only the public anon key. Nothing here needs a password.
//
// Run from the repo root: node scripts/verify-rls-checks.mjs

import { createClient } from '@supabase/supabase-js';

const DEV_URL = 'https://sitihbdnuxifwibontcm.supabase.co';
const DEV_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpdGloYmRudXhpZndpYm9udGNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2OTQ1OTEsImV4cCI6MjEwMTI3MDU5MX0.fwO_cp6m7DOvpOWPAIwJ7_ijDPD9nB118Sf73JYHL7Y';

async function restGet(path, token) {
  const res = await fetch(`${DEV_URL}/rest/v1/${path}`, {
    headers: { apikey: DEV_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, rows: Array.isArray(body) ? body.length : body };
}

function report(label, result, expectation) {
  console.log(`${label}\n  status=${result.status} rows=${JSON.stringify(result.rows)}  (expected: ${expectation})\n`);
}

async function main() {
  const supabase = createClient(DEV_URL, DEV_ANON_KEY);

  console.log('=== Step 4: anon key, no session at all ===\n');
  report('anon -> CustomerPortalStatement (2 real rows exist)', await restGet('CustomerPortalStatement?select=id&limit=5', DEV_ANON_KEY), '0 rows (denied)');
  report('anon -> CustomerPortalAudit (51 real rows exist)', await restGet('CustomerPortalAudit?select=id&limit=5', DEV_ANON_KEY), '0 rows (denied)');
  report('anon -> Customer (1461 real rows exist, bonus check)', await restGet('Customer?select=id&limit=5', DEV_ANON_KEY), '0 rows (denied - role tightened off public)');

  console.log('=== Step 2: fresh signup, AAL1-only, zero MFA ever completed ===\n');
  const testEmail = `rls-verify-${Date.now()}@kensauto.ca`;
  const testPassword = `Verify-${Math.random().toString(36).slice(2)}-${Date.now()}!`;
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  });
  if (signUpError) {
    console.log('signUp failed:', signUpError.message);
    return;
  }
  if (!signUpData.session) {
    console.log('signUp succeeded but returned no session (email confirmation likely required on this project) - cannot complete step 2 this way.');
    return;
  }
  console.log(`Created throwaway test account ${testEmail} (aal: real session, no MFA factor ever enrolled - permanently aal1). Safe to delete later, it's unused otherwise.\n`);
  const aal1Token = signUpData.session.access_token;
  report('AAL1 -> Customer (1461 real rows exist)', await restGet('Customer?select=id&limit=5', aal1Token), '0 rows (denied - no factor, no aal2)');
  report('AAL1 -> Employee (9 real rows exist)', await restGet('Employee?select=id&limit=5', aal1Token), '0 rows for the all-rows policy (denied); own-record carve-out returns nothing either since this account has no Employee row at all');
}

main().catch((err) => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});

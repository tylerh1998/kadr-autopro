// One-off verification script for the staff_strong_auth() RLS migration -
// runs §5 steps 2 and 4 from rls_strong_auth_policy_plan.md against dev.
// Fully non-interactive: step 2 uses a throwaway signup (no MFA ever
// completed = a real AAL1-only session, no existing credential needed);
// step 4 uses only the public anon key. Nothing here needs a real password.
//
// 2026-08-18 update: the original Employee check here was a blind spot, not
// a real test. The throwaway signup account has no Employee row, so "carve-out
// works" and "carve-out is broken" both predicted the same result (0 rows) -
// it passed without ever exercising what it claimed to verify. See O1 in
// "Plans and Context/phase_1_implementation_plan.md" and the fix migration
// 20260818050000_fix_employee_bootstrap_carveout_and_column_grants.sql.
//
// The linked-employee check below needs service-role privileges (to attach
// the throwaway auth user to a scratch Employee row and clean it up
// afterward) - optional, via SUPABASE_SERVICE_ROLE_KEY. Without it, this
// script says so explicitly rather than passing a check it didn't run.
//
// Run from the repo root:
//   node scripts/verify-rls-checks.mjs
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-rls-checks.mjs   (full coverage)

import { createClient } from '@supabase/supabase-js';

const DEV_URL = 'https://sitihbdnuxifwibontcm.supabase.co';
const DEV_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpdGloYmRudXhpZndpYm9udGNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2OTQ1OTEsImV4cCI6MjEwMTI3MDU5MX0.fwO_cp6m7DOvpOWPAIwJ7_ijDPD9nB118Sf73JYHL7Y';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

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
  report('anon -> Employee (9 real rows exist)', await restGet('Employee?select=id&limit=5', DEV_ANON_KEY), '0 rows (denied - no permissive policy grants anon anything)');

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
  const testUserId = signUpData.user.id;
  console.log(`Created throwaway test account ${testEmail} (aal: real session, no MFA factor ever enrolled - permanently aal1). Safe to delete later, it's unused otherwise.\n`);
  const aal1Token = signUpData.session.access_token;
  report('AAL1 -> Customer (1461 real rows exist)', await restGet('Customer?select=id&limit=5', aal1Token), '0 rows (denied - no factor, no aal2)');
  report('AAL1, unlinked account -> Employee (9 real rows exist)', await restGet('Employee?select=id&limit=5', aal1Token), '0 rows (denied - proves nothing about the own-record carve-out, this account has no Employee row to carve out access to)');

  if (!SERVICE_ROLE_KEY) {
    console.log(
      'SUPABASE_SERVICE_ROLE_KEY not set - skipping the real own-record carve-out check.\n' +
      'The check above only proves an *unlinked* AAL1 session sees nothing; it does not\n' +
      'prove a genuinely linked new-hire account can read its own row. Re-run with\n' +
      'SUPABASE_SERVICE_ROLE_KEY set for full coverage.\n'
    );
    return;
  }

  console.log('=== Step 2b (service-role assisted): AAL1 session linked to its own Employee row ===\n');
  const admin = createClient(DEV_URL, SERVICE_ROLE_KEY);
  const { data: scratchRow, error: insertError } = await admin
    .from('Employee')
    .insert({
      mykadr_user_id: testUserId,
      first_name: 'RLS-Verify',
      last_name: 'Scratch',
      employee_type: 'scratch-test',
    })
    .select('id')
    .single();

  if (insertError) {
    console.log('Could not create scratch Employee row via service role:', insertError.message);
    return;
  }

  try {
    report(
      'AAL1, linked account -> own Employee row',
      await restGet(`Employee?select=id&mykadr_user_id=eq.${testUserId}`, aal1Token),
      '1 row (own-record carve-out working - this is the actual bootstrap escape hatch)'
    );
    report(
      'AAL1, linked account -> Employee, no filter (9 real rows + 1 scratch = 10 exist)',
      await restGet('Employee?select=id&limit=20', aal1Token),
      '1 row (only the caller\'s own row - the wide-open all-rows policy stays gated)'
    );
  } finally {
    const { error: deleteError } = await admin.from('Employee').delete().eq('id', scratchRow.id);
    if (deleteError) {
      console.log(`WARNING: failed to clean up scratch Employee row id=${scratchRow.id}:`, deleteError.message);
    } else {
      console.log(`Cleaned up scratch Employee row id=${scratchRow.id}.\n`);
    }
  }
}

main().catch((err) => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});

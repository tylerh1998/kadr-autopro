// Runs §5 steps 2, 4, and 5 from rls_strong_auth_policy_plan.md against
// PRODUCTION - the same technique already proven on dev. Fully
// non-interactive: uses throwaway signups (no existing credential needed),
// self-computed TOTP codes for the AAL2 case, and the plain anon key for
// the anon case. Creates 2 unused throwaway accounts on production, easily
// deleted afterward from the Auth users list if desired.
//
// Run from the repo root: node scripts/verify-rls-checks-prod.mjs

import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';

const PROD_URL = 'https://hbcrwkmgsazqrvsrmxyr.supabase.co';
const PROD_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiY3J3a21nc2F6cXJ2c3JteHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzQwNzYsImV4cCI6MjA4ODk1MDA3Nn0.gM3QF4igxy6IH_x4Otd1wvKUUyScNVpYIuGqoc411jU';

function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32.replace(/=+$/, '').toUpperCase()) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secretBase32) {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

async function restGet(path, token) {
  const res = await fetch(`${PROD_URL}/rest/v1/${path}`, {
    headers: { apikey: PROD_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, rows: Array.isArray(body) ? body.length : body };
}

function report(label, result, expectation) {
  console.log(`${label}\n  status=${result.status} rows=${JSON.stringify(result.rows)}  (expected: ${expectation})\n`);
}

async function makeAal2Session(supabase, email, password) {
  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) throw signUpError;
  const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  if (enrollError) throw enrollError;
  const { id: factorId, totp: { secret } } = enrollData;
  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) throw challengeError;
  const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
    factorId, challengeId: challengeData.id, code: totp(secret),
  });
  if (verifyError) throw verifyError;
  return verifyData.access_token;
}

async function main() {
  const supabase = createClient(PROD_URL, PROD_ANON_KEY);
  const stamp = Date.now();

  console.log('=== Step 4: anon key, no session at all ===\n');
  report('anon -> CustomerPortalStatement (332 real rows exist)', await restGet('CustomerPortalStatement?select=id&limit=5', PROD_ANON_KEY), '0 rows (denied)');
  report('anon -> CustomerPortalAudit (1 real row exists)', await restGet('CustomerPortalAudit?select=id&limit=5', PROD_ANON_KEY), '0 rows (denied)');
  report('anon -> Customer (1463 real rows exist, bonus check)', await restGet('Customer?select=id&limit=5', PROD_ANON_KEY), '0 rows (denied - role tightened off public)');

  console.log('=== Step 2: fresh signup, AAL1-only, zero MFA ever completed ===\n');
  const aal1Email = `rls-verify-prod-${stamp}@kensauto.ca`;
  const aal1Password = `Verify-${Math.random().toString(36).slice(2)}-${stamp}!`;
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: aal1Email, password: aal1Password,
  });
  if (signUpError) {
    console.log('signUp failed:', signUpError.message);
  } else if (!signUpData.session) {
    console.log('signUp succeeded but returned no session (email confirmation likely required) - cannot complete step 2 this way.');
  } else {
    console.log(`Created throwaway test account ${aal1Email} (permanently aal1, no MFA factor ever enrolled). Safe to delete later.\n`);
    const aal1Token = signUpData.session.access_token;
    report('AAL1 -> Customer (1463 real rows exist)', await restGet('Customer?select=id&limit=5', aal1Token), '0 rows (denied - no factor, no aal2)');
  }

  console.log('=== Step 5: strongly-authenticated (AAL2) session -> FiscalPeriod (Finding F1 fix) ===\n');
  const aal2Email = `rls-verify-prod-aal2-${stamp}@kensauto.ca`;
  const aal2Password = `Verify-${Math.random().toString(36).slice(2)}-${stamp}!`;
  const aal2Token = await makeAal2Session(supabase, aal2Email, aal2Password);
  console.log(`Created throwaway test account ${aal2Email}, enrolled + verified TOTP -> real aal2 session. Safe to delete later.\n`);
  report('AAL2 -> FiscalPeriod (6 real rows exist - was 0 policies before this migration, Finding F1)', await restGet('FiscalPeriod?select=id&limit=5', aal2Token), '5 rows returned (real data, not empty - confirms the fix)');
}

main().catch((err) => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});

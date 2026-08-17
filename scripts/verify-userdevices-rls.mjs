// Verifies §5 step 6 from rls_strong_auth_policy_plan.md against dev,
// without needing the myKADR UI or production: does a fresh device
// registration insert succeed from a real AAL2 session, and does
// verify_device_access() (SECURITY DEFINER, anon-callable) still work.
// Also checks that an AAL1-only session is correctly denied the insert.
//
// Fully non-interactive - uses throwaway signups + self-computed TOTP
// codes, no existing credential needed. Run from repo root:
// node scripts/verify-userdevices-rls.mjs

import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';

const DEV_URL = 'https://sitihbdnuxifwibontcm.supabase.co';
const DEV_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpdGloYmRudXhpZndpYm9udGNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2OTQ1OTEsImV4cCI6MjEwMTI3MDU5MX0.fwO_cp6m7DOvpOWPAIwJ7_ijDPD9nB118Sf73JYHL7Y';

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

async function restInsert(path, token, body) {
  const res = await fetch(`${DEV_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: DEV_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function restRpc(fnName, token, body) {
  const res = await fetch(`${DEV_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: DEV_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
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
  const supabase = createClient(DEV_URL, DEV_ANON_KEY);
  const stamp = Date.now();

  console.log('=== AAL2 session: device registration insert ===\n');
  const aal2Email = `rls-verify-devices-${stamp}@kensauto.ca`;
  const aal2Password = `Verify-${Math.random().toString(36).slice(2)}-${stamp}!`;
  const aal2Token = await makeAal2Session(supabase, aal2Email, aal2Password);
  console.log(`AAL2 session established for ${aal2Email}.\n`);

  const deviceUuid = randomUUID();
  const { data: userData } = await supabase.auth.getUser(aal2Token);
  const insertResult = await restInsert('UserDevices', aal2Token, {
    user_id: userData.user.id,
    device_uuid: deviceUuid,
    device_name: 'rls-verify-script',
  });
  console.log('AAL2 -> insert UserDevices:', insertResult.status, JSON.stringify(insertResult.json), '\n  (expected: 201/success)\n');

  console.log('=== verify_device_access RPC, anon key only, no session ===\n');
  const rpcResult = await restRpc('verify_device_access', DEV_ANON_KEY, { p_device_uuid: deviceUuid });
  console.log('anon -> verify_device_access(newly-created device):', rpcResult.status, JSON.stringify(rpcResult.json), '\n  (expected: true - SECURITY DEFINER, bypasses RLS, unaffected by this migration)\n');

  console.log('=== AAL1-only session: device registration insert should be denied ===\n');
  const aal1Email = `rls-verify-devices-aal1-${stamp}@kensauto.ca`;
  const aal1Password = `Verify-${Math.random().toString(36).slice(2)}-${stamp}!`;
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: aal1Email, password: aal1Password,
  });
  if (signUpError) throw signUpError;
  const aal1Token = signUpData.session.access_token;
  const deniedInsertResult = await restInsert('UserDevices', aal1Token, {
    user_id: signUpData.user.id,
    device_uuid: randomUUID(),
    device_name: 'rls-verify-should-be-denied',
  });
  console.log('AAL1 -> insert UserDevices:', deniedInsertResult.status, JSON.stringify(deniedInsertResult.json), '\n  (expected: denied/empty - closes the "sudo mode is fake" gap)\n');
}

main().catch((err) => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});

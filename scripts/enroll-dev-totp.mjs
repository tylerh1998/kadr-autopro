// One-off dev utility: enrolls + verifies a TOTP MFA factor for a dev-branch
// Supabase Auth account entirely via the Auth API - no my.kensauto.ca UI,
// no authenticator app needed (the code is computed from the returned secret
// using a plain RFC 6238 implementation, no new dependency).
//
// Only ever targets the DEV project (sitihbdnuxifwibontcm) - hardcoded below,
// on purpose, so this can never accidentally be pointed at production.
//
// Run from the repo root: node scripts/enroll-dev-totp.mjs
// (needs @supabase/supabase-js from the existing node_modules - no install)
//
// Safe to delete once dev has the TOTP factor it needs for RLS testing.

import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

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
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secretBase32, stepOffset = 0) {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30) + stepOffset;
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  const email =
    (await rl.question('Dev account email [test@kensauto.ca]: ')) || 'test@kensauto.ca';
  const password = await rl.question('Password: ');
  rl.close();

  const supabase = createClient(DEV_URL, DEV_ANON_KEY);

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  console.log('Signed in as', signInData.user.email);

  const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
  });
  if (enrollError) throw enrollError;
  const {
    id: factorId,
    totp: { secret },
  } = enrollData;
  console.log('Enrolled factor', factorId);
  console.log('TOTP secret (save this - also works in a real authenticator app):', secret);

  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  });
  if (challengeError) throw challengeError;

  const code = totp(secret);
  console.log('Computed code:', code);

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challengeData.id,
    code,
  });
  if (verifyError) throw verifyError;

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  console.log('Done. Current AAL:', aal.currentLevel, '/ Next AAL:', aal.nextLevel);
}

main().catch((err) => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});

// Prints a fresh 6-digit TOTP code for a given base32 secret, right now.
// Usage: node scripts/totp-code.mjs <secret>

import { createHmac } from 'node:crypto';

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

function totp(secretBase32) {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const secondsLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
  return { code: String(code % 1_000_000).padStart(6, '0'), secondsLeft };
}

const secret = process.argv[2];
if (!secret) {
  console.error('Usage: node scripts/totp-code.mjs <secret>');
  process.exit(1);
}
const { code, secondsLeft } = totp(secret);
console.log(`${code}  (valid ~${secondsLeft}s)`);

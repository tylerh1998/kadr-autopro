export async function deriveKey(pin, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt), // Use user email as salt
      iterations: 200000, // Strong enough against offline brute force for a shared device
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptToken(pin, email, token) {
  const key = await deriveKey(pin, email);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  
  const cipher = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(token)
  );
  
  // Combine IV and cipher into a single base64 string
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  
  return btoa(String.fromCharCode.apply(null, combined));
}

export async function decryptToken(pin, email, encryptedBase64) {
  const key = await deriveKey(pin, email);
  
  const raw = atob(encryptedBase64);
  const combined = new Uint8Array(new ArrayBuffer(raw.length));
  for(let i = 0; i < raw.length; i++) {
    combined[i] = raw.charCodeAt(i);
  }
  
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    cipher
  );
  
  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

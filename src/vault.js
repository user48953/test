// Password encryption for game accounts. Pure Web Crypto: runs in the
// browser and under `node --test`.
//
// A password-protected account's data is encrypted before it is saved
// anywhere: AES-256-GCM with a key derived from the password by PBKDF2
// (SHA-256). The password itself is never stored. What is stored with the
// account is its lock: the salt, the iteration count, and a known value
// encrypted with the key, which tells a right password from a wrong one.
// Without the password the data can't be read, and a forgotten password
// can't be recovered.

export const KDF_ITERATIONS = 310_000;
const CHECK = "lastz-research-sim";

export function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export const isSealed = (value) => Boolean(value && value.enc === 1 && typeof value.iv === "string" && typeof value.ct === "string");

// Encrypt any JSON value.
export async function seal(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { enc: 1, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

// Decrypt what `seal` produced. Rejects for the wrong key or altered data.
export async function unseal(key, sealed) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(sealed.iv) }, key, fromB64(sealed.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

// A new lock for `password`, and the key it opens.
export async function makeLock(password, iterations = KDF_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, iterations);
  return { key, lock: { salt: toB64(salt), iterations, check: await seal(key, CHECK) } };
}

// The key for `password` if it opens `lock`, else null.
export async function openLock(lock, password) {
  const key = await deriveKey(password, fromB64(lock.salt), lock.iterations);
  try {
    return (await unseal(key, lock.check)) === CHECK ? key : null;
  } catch {
    return null;
  }
}

export function isLock(lock) {
  return Boolean(lock && typeof lock.salt === "string" && Number.isInteger(lock.iterations) && lock.iterations > 0 && isSealed(lock.check));
}

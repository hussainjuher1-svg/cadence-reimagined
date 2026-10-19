import { promisify } from 'node:util';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
const scryptAsync = promisify(scrypt);
export const tokenHash = value => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const id = () => randomUUID();

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return `scrypt$N=32768,r=8,p=3$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}
export async function verifyPassword(password, encoded) {
  try {
    const parts = String(encoded).split('$');
    if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== 'N=32768,r=8,p=3') return false;
    const salt = Buffer.from(parts[2], 'base64url');
    const expected = Buffer.from(parts[3], 'base64url');
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = Buffer.from(await scryptAsync(password, salt, expected.length, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }));
    return timingSafeEqual(actual, expected);
  } catch { return false; }
}
export function timingSafeTextEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

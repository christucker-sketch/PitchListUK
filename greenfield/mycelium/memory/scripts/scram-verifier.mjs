// SCRAM-SHA-256 verifier (RFC 5802 / RFC 7677, PostgreSQL's stored format) so a login password never leaves the machine
// that generated it: only this one-way verifier is sent to the database (`CREATE ROLE ... PASSWORD '<verifier>'`).
//   node scripts/scram-verifier.mjs < password-file      prints SCRAM-SHA-256$4096:<salt>$<StoredKey>:<ServerKey>
import { createHmac, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const VERIFIER_RE = /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/;
const hmac = (key, msg) => createHmac('sha256', key).update(msg).digest();

export function scramKeys(password, salt, iterations = 4096) {
  // Restricted to printable ASCII so SASLprep is the identity (generated passwords are base64).
  if (typeof password !== 'string' || !/^[\x21-\x7e]{24,256}$/.test(password)) throw new Error('Password must be 24-256 printable ASCII characters.');
  return deriveKeys(password, salt, iterations);
}
// RFC 5802 key derivation, unchecked (exported for the RFC 7677 test vector).
export function deriveKeys(password, salt, iterations = 4096) {
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = hmac(salted, 'Client Key');
  return { clientKey, storedKey: createHash('sha256').update(clientKey).digest(), serverKey: hmac(salted, 'Server Key') };
}

export function scramVerifier(password, salt = randomBytes(16)) {
  const { storedKey, serverKey } = scramKeys(password, salt);
  return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const chunks = []; for await (const c of process.stdin) chunks.push(c);
    console.log(scramVerifier(Buffer.concat(chunks).toString('utf8').trim()));
  } catch { console.error('Verifier refused (password must be 24-256 printable ASCII characters). Nothing printed.'); process.exitCode = 1; }
}

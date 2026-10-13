import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt cost N=16384, r=8, p=1 uses 16 MiB, inside Node's 32 MiB default maxmem.
const PARAMS: ScryptOptions = { N: 16384, r: 8, p: 1 };
const KEY_BYTES = 64;
const SALT_BYTES = 16;

function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, keylen, PARAMS, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** `scrypt$<salt base64>$<hash base64>` with a fresh 16-byte salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(password, salt, KEY_BYTES);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Constant-time comparison against a stored hash; false for any malformed hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64, ...rest] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64 || rest.length > 0) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = await scrypt(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/**
 * Burn the same scrypt work as a real check when the email is unknown, so the
 * response time does not reveal whether an account exists.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHash);
  return false;
}

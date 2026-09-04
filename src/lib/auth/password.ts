import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
const KEY_LENGTH = 32;
const N = 16384;
const R = 8;
const P = 1;

function encode(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): Buffer | undefined {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return undefined;
  }
}

function derive(
  password: string,
  salt: Uint8Array,
  length: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string, salt = randomBytes(16)): Promise<string> {
  const derived = await derive(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${encode(salt)}$${encode(derived)}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, nValue, rValue, pValue, saltValue, hashValue, ...extra] =
    encodedHash.split("$");
  if (algorithm !== "scrypt" || extra.length > 0) return false;

  const n = Number(nValue);
  const r = Number(rValue);
  const p = Number(pValue);
  const salt = decode(saltValue);
  const expected = decode(hashValue);
  if (
    !Number.isSafeInteger(n) ||
    !Number.isSafeInteger(r) ||
    !Number.isSafeInteger(p) ||
    n < 2 ||
    n > 1_048_576 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 16 ||
    !salt ||
    salt.length < 16 ||
    !expected ||
    expected.length !== KEY_LENGTH
  ) {
    return false;
  }

  try {
    const actual = await derive(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: 128 * n * r + 1024 * 1024,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Password hashing for local email/password auth.
//
// Uses Node's built-in scrypt (a memory-hard KDF, same family as bcrypt/argon2)
// instead of a plain HMAC — no extra dependency required. Never store or
// compare raw passwords.

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

// Stored format: "<salt-hex>:<derived-key-hex>"
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, KEY_LENGTH);
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  try {
    const derivedKey = await scrypt(password, salt, KEY_LENGTH);
    const storedBuffer = Buffer.from(hashHex, "hex");
    if (storedBuffer.length !== derivedKey.length) return false;
    return timingSafeEqual(storedBuffer, derivedKey);
  } catch {
    return false;
  }
}

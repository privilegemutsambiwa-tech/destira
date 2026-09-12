// AES-256-GCM at rest for admin TOTP secrets. Never store a TOTP secret in
// plaintext — the DB is the highest-value target in the whole app (it's also
// where the private twin chats live), so a DB dump alone must not be enough
// to mint valid 2FA codes for an admin account.
import crypto from "crypto";

const KEY_ENV = "ADMIN_TOTP_ENC_KEY";

function getKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (raw && raw.length >= 32) {
    return crypto.createHash("sha256").update(raw).digest();
  }
  if (process.env.NODE_ENV === "production") {
    console.warn(
      `[SECURITY] ${KEY_ENV} is not set (or too short) in production. Set a strong random ` +
        `32+ char value before any admin enrolls 2FA — until then, secrets are encrypted with ` +
        `an insecure local-dev default and MUST be treated as compromised.`,
    );
  }
  // Same shape as the SESSION_SECRET dev-default in replitAuth.ts: a stable,
  // clearly-insecure fallback so local dev works without extra setup.
  return crypto.createHash("sha256").update("local-dev-insecure-admin-totp-key").digest();
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, encB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !encB64) throw new Error("Malformed encrypted TOTP secret");
  const key = getKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]);
  return dec.toString("utf8");
}

// Invite tokens and recovery codes are high-entropy and machine-generated
// (never user-chosen), so unlike passwords there's no low-entropy guessable
// space to defend against with a slow hash — a plain SHA-256 of the raw
// value is the right tool: fast, and the DB never holds anything that works
// on its own.
export function generateOpaqueToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: hashOpaqueToken(raw) };
}
export function hashOpaqueToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Recovery codes: shorter, grouped for readability when read off a screen —
// XXXX-XXXX, drawn from an unambiguous alphabet (no 0/O/1/I/L).
const RECOVERY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function generateRecoveryCode(): string {
  const chars = Array.from({ length: 8 }, () => RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

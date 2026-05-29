import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function normalizeKey(secret: Buffer) {
  if (secret.length >= 32) return secret.subarray(0, 32);
  return Buffer.concat([secret, Buffer.alloc(32 - secret.length)]).subarray(0, 32);
}

export function encryptText(plainText: string, secret: Buffer) {
  if (!plainText) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, normalizeKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptText(cipherText: string | undefined | null, secret: Buffer) {
  if (!cipherText) return "";
  const payload = Buffer.from(cipherText, "base64");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, normalizeKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

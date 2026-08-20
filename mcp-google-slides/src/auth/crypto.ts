import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "../lib/errors.js";

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM recomendado
const KEY_LEN = 32; // 256 bits

/**
 * Deriva una clave de 32 bytes desde la env `TOKEN_ENCRYPTION_KEY`.
 * Acepta hex (64 chars) o base64. Falla ruidosamente si no alcanza 32 bytes,
 * para evitar cifrar con material débil.
 */
export function loadKey(raw: string): Buffer {
  if (!raw) {
    throw new AppError(
      "CONFIG_ERROR",
      "TOKEN_ENCRYPTION_KEY no configurada. Generá una con: " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== KEY_LEN) {
    throw new AppError(
      "CONFIG_ERROR",
      `TOKEN_ENCRYPTION_KEY debe representar 32 bytes (recibidos ${key.length}). ` +
        "Usá 64 chars hex o 44 chars base64.",
    );
  }
  return key;
}

export interface SealedPayload {
  v: 1;
  iv: string; // base64
  tag: string; // base64
  data: string; // base64 ciphertext
}

/** Cifra un objeto JSON serializable → SealedPayload (AES-256-GCM). */
export function seal(key: Buffer, plaintextObj: unknown): SealedPayload {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const json = Buffer.from(JSON.stringify(plaintextObj), "utf8");
  const ciphertext = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64"),
  };
}

/** Descifra un SealedPayload → objeto original. Lanza si el tag no valida. */
export function open<T = unknown>(key: Buffer, sealed: SealedPayload): T {
  if (!sealed || sealed.v !== 1) {
    throw new AppError("CONFIG_ERROR", "Payload cifrado con formato/version desconocida");
  }
  const iv = Buffer.from(sealed.iv, "base64");
  const tag = Buffer.from(sealed.tag, "base64");
  const data = Buffer.from(sealed.data, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

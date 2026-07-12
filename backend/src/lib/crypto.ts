import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"
import { logger } from "./logger.js"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const DEV_KEY_WARNING = "dev-encryption-key-change-in-production-32chr"

function deriveKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY

  if (!secret) {
    logger.warn("ENCRYPTION_KEY not set, using unsafe dev fallback. Set ENCRYPTION_KEY in production.")
    return createHash("sha256").update(DEV_KEY_WARNING).digest()
  }

  if (secret === DEV_KEY_WARNING) {
    logger.warn("ENCRYPTION_KEY is still the default dev value — change it for production.")
  }

  return createHash("sha256").update(secret).digest()
}

/**
 * Encrypts plaintext with AES-256-GCM.
 * Returns a colon-delimited hex string: iv:authTag:ciphertext
 */
export function encrypt(text: string): string {
  const key = deriveKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")

  const tag = cipher.getAuthTag().toString("hex")
  return `${iv.toString("hex")}:${tag}:${encrypted}`
}

/**
 * Decrypts a value produced by encrypt().
 * Expects format: iv:authTag:ciphertext (all hex).
 */
export function decrypt(encryptedText: string): string {
  const key = deriveKey()

  // Split only the first two ':' — ciphertext hex never contains ':', but
  // this is safer than a full split+join.
  const firstColon = encryptedText.indexOf(":")
  const secondColon = encryptedText.indexOf(":", firstColon + 1)

  if (firstColon < 0 || secondColon < 0) {
    throw new Error("Invalid encrypted format: expected iv:tag:ciphertext")
  }

  const iv = Buffer.from(encryptedText.slice(0, firstColon), "hex")
  const tag = Buffer.from(encryptedText.slice(firstColon + 1, secondColon), "hex")
  const encrypted = encryptedText.slice(secondColon + 1)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(encrypted, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

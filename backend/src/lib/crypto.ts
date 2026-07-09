import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const TAG_LENGTH = 16

function deriveKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY ?? "dev-encryption-key-change-in-production-32chr"
  return createHash("sha256").update(secret).digest()
}

export function encrypt(text: string): string {
  const key = deriveKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  const tag = cipher.getAuthTag().toString("hex")
  return `${iv.toString("hex")}:${tag}:${encrypted}`
}

export function decrypt(encryptedText: string): string {
  const key = deriveKey()
  const parts = encryptedText.split(":")
  if (parts.length < 3) throw new Error("Invalid encrypted format")
  const iv = Buffer.from(parts[0], "hex")
  const tag = Buffer.from(parts[1], "hex")
  const encrypted = parts.slice(2).join(":")
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encrypted, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

import { createHmac, timingSafeEqual } from "node:crypto"
import { dbConfig } from "@/lib/db-config"

const SESSION_VERSION = "v1"
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24

function getSessionSecret(): string {
  return process.env.AUTH_SESSION_SECRET || String(dbConfig.password)
}

function signSessionPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url")
}

export function createSessionToken(
  userId: string,
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS
): string {
  if (!/^\d+$/.test(userId)) {
    throw new Error("Session user ID must be numeric")
  }

  const expiresAt = Date.now() + maxAgeSeconds * 1000
  const payload = `${SESSION_VERSION}.${userId}.${expiresAt}`
  return `${payload}.${signSessionPayload(payload)}`
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) {
    return null
  }

  const parts = token.split(".")
  if (parts.length !== 4) {
    return null
  }

  const [version, userId, expiresAtText, signature] = parts
  if (version !== SESSION_VERSION || !/^\d+$/.test(userId)) {
    return null
  }

  const expiresAt = Number(expiresAtText)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
    return null
  }

  const payload = `${version}.${userId}.${expiresAtText}`
  const expectedSignature = signSessionPayload(payload)
  const providedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null
  }

  return userId
}

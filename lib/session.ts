import { createHmac, timingSafeEqual } from "node:crypto"

const SESSION_VERSION = "v2"
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24

function getSessionSecret(): string {
  const urlPassword = process.env.DATABASE_URL?.split(";")
    .find((option) => option.toLowerCase().startsWith("password="))?.slice("password=".length)
  const secret = process.env.AUTH_SESSION_SECRET || process.env.DB_PASSWORD ||
    (urlPassword ? decodeURIComponent(urlPassword) : undefined)
  if (!secret) throw new Error("A session signing secret is required")
  return secret
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url")
}

function equalSignature(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function credentialVersion(passwordHash: string): string {
  // HMAC keeps the stored password hash out of the cookie. Replacing that hash
  // revokes every previous session without a database migration.
  return sign(`credential:${passwordHash}`)
}

export function createSessionToken(
  userId: string,
  passwordHash: string,
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS
): string {
  if (!/^\d+$/.test(userId) || !passwordHash || !Number.isSafeInteger(maxAgeSeconds)) {
    throw new Error("Invalid session parameters")
  }
  const expiresAt = Date.now() + maxAgeSeconds * 1000
  const payload = `${SESSION_VERSION}.${userId}.${expiresAt}.${credentialVersion(passwordHash)}`
  return `${payload}.${sign(payload)}`
}

function readSignedSession(token: string | undefined): { userId: string; credential: string } | null {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 5) return null
  const [version, userId, expiresAtText, credential, signature] = parts
  if (version !== SESSION_VERSION || !/^\d+$/.test(userId)) return null
  const expiresAt = Number(expiresAtText)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return null
  if (!equalSignature(signature, sign(parts.slice(0, 4).join(".")))) return null
  return { userId, credential }
}

/** Only locates the account; authentication must also verify its current password hash. */
export function getSessionUserId(token: string | undefined): string | null {
  return readSignedSession(token)?.userId ?? null
}

export function verifySessionToken(token: string | undefined, currentPasswordHash: string): string | null {
  const session = readSignedSession(token)
  if (!session || !currentPasswordHash) return null
  return equalSignature(session.credential, credentialVersion(currentPasswordHash)) ? session.userId : null
}

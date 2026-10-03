import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { createSessionToken, getSessionUserId, verifySessionToken } from "../session"

const passwordHash = "$2a$10$first-hash-test-fixture"
const previousSecret = process.env.AUTH_SESSION_SECRET
before(() => { process.env.AUTH_SESSION_SECRET = "session-regression-test-secret" })
after(() => {
  if (previousSecret === undefined) delete process.env.AUTH_SESSION_SECRET
  else process.env.AUTH_SESSION_SECRET = previousSecret
})

describe("signed sessions bound to current credentials", () => {
  it("authenticates the account without putting its stored password hash in the cookie", () => {
    const token = createSessionToken("42", passwordHash)
    assert.equal(getSessionUserId(token), "42")
    assert.equal(verifySessionToken(token, passwordHash), "42")
    assert.equal(token.includes(passwordHash), false)
  })
  it("revokes a copied token as soon as a password reset replaces the stored hash", () => {
    const copiedToken = createSessionToken("42", passwordHash)
    assert.equal(verifySessionToken(copiedToken, "$2a$10$new-hash-after-reset"), null)
    assert.equal(verifySessionToken(createSessionToken("42", "new-hash"), "new-hash"), "42")
  })
  it("rejects an altered identity, credential version, or signature", () => {
    const token = createSessionToken("42", passwordHash)
    assert.equal(verifySessionToken(token.replace("v2.42.", "v2.1."), passwordHash), null)
    const parts = token.split(".")
    parts[3] = "another-credential"
    assert.equal(verifySessionToken(parts.join("."), passwordHash), null)
    const altered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`
    assert.equal(verifySessionToken(altered, passwordHash), null)
  })
  it("rejects expired and legacy sessions", () => {
    assert.equal(verifySessionToken(createSessionToken("42", passwordHash, -1), passwordHash), null)
    assert.equal(getSessionUserId(`v1.42.${Date.now() + 60000}.legacy`), null)
    assert.equal(getSessionUserId(undefined), null)
  })
  it("requires a numeric identity and current credentials", () => {
    assert.throws(() => createSessionToken("admin", passwordHash))
    assert.throws(() => createSessionToken("42", ""))
    assert.equal(verifySessionToken(createSessionToken("42", passwordHash), ""), null)
  })
})

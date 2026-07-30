import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createSessionToken, verifySessionToken } from "../session"

describe("signed session tokens", () => {
  it("accepts a valid signed token", () => {
    const token = createSessionToken("42")
    assert.equal(verifySessionToken(token), "42")
  })

  it("rejects an altered user ID", () => {
    const token = createSessionToken("42")
    const alteredToken = token.replace("v1.42.", "v1.1.")
    assert.equal(verifySessionToken(alteredToken), null)
  })

  it("rejects an altered signature", () => {
    const token = createSessionToken("42")
    const alteredToken = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`
    assert.equal(verifySessionToken(alteredToken), null)
  })

  it("rejects expired tokens", () => {
    const token = createSessionToken("42", -1)
    assert.equal(verifySessionToken(token), null)
  })

  it("rejects non-numeric user IDs", () => {
    assert.throws(() => createSessionToken("admin"))
  })
})

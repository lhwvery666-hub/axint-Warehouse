import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
const require = createRequire(import.meta.url)
const { migrateUploads } = require("../../scripts/migrate-uploads.cjs") as {
  migrateUploads: (source: string, target: string, copy?: boolean) => { files: number; copied: number }
}

test("attachment migration previews, verifies copies and never overwrites different contents", () => {
  const root = mkdtempSync(join(tmpdir(), "repair-migration-test-"))
  const source = join(root, "old")
  const target = join(root, "persistent")
  mkdirSync(source)
  writeFileSync(join(source, "signature.png"), "existing-company-signature")
  try {
    assert.deepEqual(migrateUploads(source, target).copied, 0)
    assert.equal(migrateUploads(source, target, true).copied, 1)
    assert.equal(readFileSync(join(source, "signature.png"), "utf8"), "existing-company-signature")
    assert.equal(migrateUploads(source, target, true).copied, 0)
    writeFileSync(join(target, "signature.png"), "different-file")
    assert.throws(() => migrateUploads(source, target, true), /未覆盖/)
    assert.equal(readFileSync(join(target, "signature.png"), "utf8"), "different-file")
    assert.throws(() => migrateUploads(source, join(source, "nested"), true), /子目录/)
  } finally {
    // Exact, freshly created temporary test root.
    rmSync(root, { recursive: true })
  }
})

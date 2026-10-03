import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { getUploadDirectory } from "../storage/upload-directory"
import { GET } from "../../app/uploads/[...path]/route"

test("standalone and source builds use the same persistent attachment directory", () => {
  const root = join(tmpdir(), "repair-app")
  assert.equal(getUploadDirectory(root, ""), getUploadDirectory(join(root, ".next", "standalone"), ""))
  assert.equal(getUploadDirectory(root, "shared/photos"), join(root, "shared", "photos"))
})

test("known attachment links stay public while listing, executable files and path traversal are blocked", async () => {
  const root = await mkdtemp(join(tmpdir(), "repair-upload-test-"))
  const previous = process.env.UPLOAD_DIR
  process.env.UPLOAD_DIR = root
  try {
    await mkdir(join(root, "photos"))
    await writeFile(join(root, "photos", "sample.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    await writeFile(join(root, "unsafe.html"), "<script>test</script>")
    const request = new Request("http://localhost/uploads/photos/sample.png")
    const response = await GET(request, { params: Promise.resolve({ path: ["photos", "sample.png"] }) })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("Content-Type"), "image/png")
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff")
    assert.equal(response.headers.get("Content-Security-Policy"), "sandbox; default-src 'none'")
    for (const parts of [["unsafe.html"], ["..", "sample.png"], ["%2e%2e", "sample.png"], []]) {
      assert.equal((await GET(request, { params: Promise.resolve({ path: parts }) })).status, 400)
    }
    assert.equal((await GET(request, { params: Promise.resolve({ path: ["missing.png"] }) })).status, 404)
  } finally {
    if (previous === undefined) delete process.env.UPLOAD_DIR
    else process.env.UPLOAD_DIR = previous
    // This temporary test directory is the exact path returned by mkdtemp.
    await rm(root, { recursive: true })
  }
})

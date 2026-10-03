import assert from "node:assert/strict"
import test from "node:test"
import { collectDevicePhotoUrls, requirePhotoSaveSuccess } from "../device-photo-save"

test("removing the final photo produces an explicit empty array", async () => {
  assert.deepEqual(await collectDevicePhotoUrls([], [], async () => "unused"), [])
  assert.equal(JSON.stringify({ deviceImages: await collectDevicePhotoUrls([], [], async () => "unused") }), '{"deviceImages":[]}')
})
test("one failed upload fails the save rather than dropping evidence silently", async () => {
  await assert.rejects(() => collectDevicePhotoUrls(["/saved.png"], ["good", "bad"], async file => {
    if (file === "bad") throw new Error("upload failed")
    return "/good.png"
  }), /upload failed/)
})
test("successful uploads preserve existing URLs and replace previews with persisted URLs", async () => {
  assert.deepEqual(await collectDevicePhotoUrls(["/saved.png", "blob:local"], ["new"], async () => "/new.png"), ["/saved.png", "/new.png"])
})
test("HTTP and business failures reject metadata saves", async () => {
  for (const [ok, body] of [[false, { success: true }], [true, { success: false }], [true, null]] as const) {
    await assert.rejects(() => requirePhotoSaveSuccess({ ok, json: async () => body }))
  }
  assert.equal((await requirePhotoSaveSuccess({ ok: true, json: async () => ({ success: true }) })).success, true)
})

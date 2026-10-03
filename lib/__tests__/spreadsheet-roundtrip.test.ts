import assert from "node:assert/strict"
import test from "node:test"
import * as XLSX from "xlsx"

test("updated SheetJS preserves Chinese device identity, quantities and prices across an xlsx round trip", () => {
  const rows = [{ 序列号: "SN-001", 产品型号: "控制器一型", 数量: 10, 维修费用: 123.45 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "设备")
  const buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  const parsed = XLSX.read(buffer, { type: "buffer" })
  assert.deepEqual(XLSX.utils.sheet_to_json(parsed.Sheets["设备"]), rows)
})

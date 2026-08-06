import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_DEVICE_IMPORT_PURPOSE,
  DeviceImportValidationError,
  getImportPurposeFromLegacyDefaultStatus,
  getNewDeviceStatusForImportPurpose,
  isRecordOnlyDeviceImport,
  parseDeviceImportRows,
  validateDeviceImportFile,
} from "../device-import"

test("仅建档模式不生成库存状态且作为默认导入方式", () => {
  assert.equal(DEFAULT_DEVICE_IMPORT_PURPOSE, "record_only")
  assert.equal(getNewDeviceStatusForImportPurpose("record_only"), null)
  assert.equal(isRecordOnlyDeviceImport("record_only"), true)
})

test("库存导入方式仍能映射在库和出库状态", () => {
  assert.equal(getNewDeviceStatusForImportPurpose("in_stock"), "在库")
  assert.equal(getNewDeviceStatusForImportPurpose("out_stock"), "出库")
  assert.equal(getImportPurposeFromLegacyDefaultStatus("在库"), "in_stock")
  assert.equal(getImportPurposeFromLegacyDefaultStatus("出库"), "out_stock")
})

test("四列表格可以解析且缺少状态/库位时保持为 null", () => {
  const result = parseDeviceImportRows([
    ["物料代码", "序列号", "物料名称", "规格型号"],
    ["C.1", "SN-001", "控制板", "MODEL-A"],
  ])

  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].status, null)
  assert.equal(result.records[0].location, null)
  assert.equal(result.hasStatusColumn, false)
  assert.equal(result.hasLocationColumn, false)
})

test("相同序列号但资料冲突时返回冲突且不静默覆盖", () => {
  const result = parseDeviceImportRows([
    ["物料代码", "序列号", "物料名称", "规格型号"],
    ["C.1", "SN-001", "控制板", "MODEL-A"],
    ["C.2", "sn-001", "控制板-常用", "MODEL-B"],
  ])

  assert.equal(result.records.length, 1)
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.conflicts[0].firstExcelRow, 2)
  assert.equal(result.conflicts[0].conflictingExcelRow, 3)
})

test("完全相同的重复行会去重并计数", () => {
  const result = parseDeviceImportRows([
    ["物料代码", "序列号", "物料名称", "规格型号"],
    ["C.1", "SN-001", "控制板", "MODEL-A"],
    ["C.1", "SN-001", "控制板", "MODEL-A"],
  ])

  assert.equal(result.records.length, 1)
  assert.equal(result.identicalDuplicateRows, 1)
  assert.equal(result.conflicts.length, 0)
})

test("可按中文表头读取可选库位和状态", () => {
  const result = parseDeviceImportRows([
    ["序列号", "状态", "规格型号", "库位", "物料名称", "物料代码"],
    ["SN-002", "出库", "MODEL-B", "A-01", "读卡器", "C.2"],
  ])

  assert.equal(result.records[0].status, "出库")
  assert.equal(result.records[0].location, "A-01")
})

test("兼容运行库历史下划线英文状态", () => {
  const result = parseDeviceImportRows([
    ["物料代码", "序列号", "物料名称", "规格型号", "状态"],
    ["C.3", "SN-003", "控制板", "MODEL-C", "In_Stock"],
  ])

  assert.equal(result.records[0].status, "In_Stock")
})

test("缺少必需表头会阻止导入", () => {
  assert.throws(
    () => parseDeviceImportRows([["序列号", "物料名称"], ["SN-001", "控制板"]]),
    DeviceImportValidationError
  )
})

test("大写 XLS 扩展名配合 OLE 文件签名可以通过", () => {
  const signature = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  assert.doesNotThrow(() => validateDeviceImportFile(
    "维修系统序列号8.1.XLS",
    "application/vnd.ms-excel",
    signature
  ))
})

test("扩展名与文件签名不匹配时拒绝", () => {
  const zipSignature = Uint8Array.from([0x50, 0x4b, 0x03, 0x04])
  assert.throws(
    () => validateDeviceImportFile("设备.xls", "application/vnd.ms-excel", zipSignature),
    DeviceImportValidationError
  )
})

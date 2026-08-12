import assert from "node:assert/strict"
import test from "node:test"

import {
  encodeDailyBatchSequence,
  formatSequentialBatchId,
  getCSTDateKeys,
  isSequentialBatchId,
  MAX_DAILY_BATCH_SEQUENCE,
} from "@/lib/batch-number-format"

test("按 UTC+8 生成完整日期键和兼容的内部日期键", () => {
  assert.deepEqual(getCSTDateKeys(new Date("2026-08-09T16:00:00.000Z")), {
    displayDateKey: "20260810",
    sequenceDateKey: "260810",
  })
})

test("1 到 999 使用三位纯数字编码", () => {
  assert.equal(encodeDailyBatchSequence(1), "001")
  assert.equal(encodeDailyBatchSequence(9), "009")
  assert.equal(encodeDailyBatchSequence(10), "010")
  assert.equal(encodeDailyBatchSequence(100), "100")
  assert.equal(encodeDailyBatchSequence(999), "999")
})

test("超过 999 后按小写字母分配每组 100 个编号", () => {
  assert.equal(encodeDailyBatchSequence(1000), "a00")
  assert.equal(encodeDailyBatchSequence(1001), "a01")
  assert.equal(encodeDailyBatchSequence(1099), "a99")
  assert.equal(encodeDailyBatchSequence(1100), "b00")
  assert.equal(encodeDailyBatchSequence(MAX_DAILY_BATCH_SEQUENCE), "z99")
})

test("拒绝无效或超过每日容量的序号", () => {
  for (const invalidSequence of [0, -1, 1.5, MAX_DAILY_BATCH_SEQUENCE + 1]) {
    assert.throws(
      () => encodeDailyBatchSequence(invalidSequence),
      RangeError,
    )
  }
})

test("生成最终工单号并校验日期格式", () => {
  assert.equal(formatSequentialBatchId("20260810", 1), "20260810001")
  assert.equal(formatSequentialBatchId("20260810", 1000), "20260810a00")
  assert.throws(() => formatSequentialBatchId("260810", 1))
})

test("识别新旧批次工单号并拒绝错误格式", () => {
  assert.equal(isSequentialBatchId("20260810001"), true)
  assert.equal(isSequentialBatchId("20260810a00"), true)
  assert.equal(isSequentialBatchId("20260810z99"), true)
  assert.equal(isSequentialBatchId("WO2608100001"), true)
  assert.equal(isSequentialBatchId("20260810A00"), false)
  assert.equal(isSequentialBatchId("2026081000a"), false)
  assert.equal(isSequentialBatchId("123"), false)
})

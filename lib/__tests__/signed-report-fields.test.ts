import assert from "node:assert/strict"
import test from "node:test"
import { changesSignedReport } from "../signed-report-fields"

test("signed report data is immutable but operational invoice/logistics updates remain allowed", () => {
  const signed = { SignedReportPhoto: "/uploads/signature.png", RepairCost: 100, ModelName: "M1" }
  assert.equal(changesSignedReport(signed, { RepairCost: 200 }), true)
  assert.equal(changesSignedReport(signed, { ModelName: "M2" }), true)
  assert.equal(changesSignedReport(signed, { RepairCost: "100", ModelName: "M1" }), false)
  assert.equal(changesSignedReport(signed, { IsInvoiced: true, ReturnTrackingNum: "new-number" }), false)
  assert.equal(changesSignedReport({ ...signed, SignedReportPhoto: null }, { RepairCost: 200 }), false)
  assert.equal(changesSignedReport({ ReporterConfirmedAt: new Date(), RepairCost: 100 }, { RepairCost: 200 }), true)
})

import * as sql from "mssql"

import {
  formatSequentialBatchId,
  getCSTDateKeys,
} from "@/lib/batch-number-format"

/**
 * 生成并发安全的每日顺序工单号。
 *
 * 对外格式：YYYYMMDD + 三位每日序号，例如 20260810001。
 * 超过 999 单后，序号依次使用 a00-a99、b00-b99，最大为 z99。
 *
 * 数据库仍使用 YYMMDD 作为内部日期键，兼容现有
 * Batch_Number_Sequence 表及当天已经分配过的旧格式编号。
 */
export async function generateSequentialBatchId(pool: sql.ConnectionPool): Promise<string> {
  const { displayDateKey, sequenceDateKey } = getCSTDateKeys()
  let transaction: sql.Transaction | null = new sql.Transaction(pool)

  try {
    await transaction.begin()
    const activeTransaction = transaction

    const lockRequest = activeTransaction.request()
    lockRequest.input("Resource", sql.NVarChar(255), `BatchNumberLock_${sequenceDateKey}`)
    lockRequest.input("LockMode", sql.VarChar(32), "Exclusive")
    lockRequest.input("LockOwner", sql.VarChar(32), "Transaction")
    lockRequest.input("LockTimeout", sql.Int, 10000)
    const lockExecResult = await lockRequest.execute("sp_getapplock")

    const lockCode = lockExecResult.returnValue
    if (typeof lockCode !== "number" || lockCode < 0) {
      throw new Error(`获取工单号生成锁失败（sp_getapplock 返回码 ${lockCode}）`)
    }

    await activeTransaction.request()
      .input("dateKey", sql.NVarChar(6), sequenceDateKey)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM Batch_Number_Sequence WHERE DateKey = @dateKey)
          INSERT INTO Batch_Number_Sequence (DateKey, CurrentValue) VALUES (@dateKey, 0)
      `)

    const updateResult = await activeTransaction.request()
      .input("dateKey", sql.NVarChar(6), sequenceDateKey)
      .query<{ NextValue: number }>(`
        UPDATE Batch_Number_Sequence
        SET CurrentValue = CurrentValue + 1, UpdatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.CurrentValue AS NextValue
        WHERE DateKey = @dateKey
      `)

    const nextValue = updateResult.recordset[0]?.NextValue
    if (typeof nextValue !== "number") {
      throw new Error("工单号序列自增失败：未获取到 NextValue")
    }

    const batchId = formatSequentialBatchId(displayDateKey, nextValue)

    await activeTransaction.commit()
    transaction = null
    return batchId
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback()
      } catch {
        // 事务可能尚未成功开启或已经失效，此处保留原始业务错误。
      } finally {
        transaction = null
      }
    }
    throw error
  }
}

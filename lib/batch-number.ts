import * as sql from "mssql"

// ────────────────────────────────────────────────────────────────────────────
// 顺序批次号生成器（并发安全）
//
// 格式：WO + YYMMDD（东八区日期） + 4位流水号，每天从 0001 重新计数，例如 WO2607140001。
//
// 并发安全设计：
//   - 用独立的 Batch_Number_Sequence 表按日期分片记录当天已发出的最大序号；
//   - 用 SQL Server 的 sp_getapplock 应用级排他锁（@LockOwner='Transaction'）序列化
//     同一天内的并发请求，锁随事务 COMMIT/ROLLBACK 自动释放，无需手动 releaseapplock；
//   - "若无当日行则插入 + 原子 +1" 全程在持锁的事务内完成，用 OUTPUT 子句一次性拿到新值，
//     不存在"先查询最大值再+1"的竞态窗口。
//   - 锁只在这个几毫秒的短事务内持有，不会拖慢后续批量插入设备的主事务。
//
// 权衡：编号保证绝对不重复、按创建顺序递增，但不保证零缺口（若拿到编号后建单失败，
// 该编号会被跳过不再使用）——这是发票/工单编号系统的标准做法（保证序不保证连续）。
// ────────────────────────────────────────────────────────────────────────────

/**
 * 计算东八区（CST）日期键 YYMMDD。
 * 不依赖服务器进程本地时区设置，统一用 UTC 时间 +8 小时换算，
 * 与项目里其它 CST 格式化逻辑（如 export-excel 的 formatDateCST）保持一致。
 */
function getCSTDateKey(date: Date = new Date()): string {
  const cst = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const yy = cst.getUTCFullYear() % 100
  const mm = cst.getUTCMonth() + 1
  const dd = cst.getUTCDate()
  return `${String(yy).padStart(2, "0")}${String(mm).padStart(2, "0")}${String(dd).padStart(2, "0")}`
}

/**
 * 确保 Batch_Number_Sequence 表存在（内联自动迁移，沿用项目里 API 内自愈迁移的惯例）。
 */
async function ensureSequenceTable(pool: sql.ConnectionPool): Promise<void> {
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Batch_Number_Sequence'
    )
      CREATE TABLE Batch_Number_Sequence (
        DateKey      NVARCHAR(6)  NOT NULL PRIMARY KEY,
        CurrentValue INT          NOT NULL DEFAULT 0,
        UpdatedAt    DATETIME     NOT NULL DEFAULT GETUTCDATE()
      )
  `)
}

/**
 * 生成一个并发安全的顺序批次号，格式 WO+YYMMDD+0001。
 *
 * @param pool 数据库连接池
 * @throws 若加锁超时/失败或序列自增异常，抛出错误（上层应让整个建单请求失败，
 *         绝不能吞掉错误继续用空号/兜底号，那样会破坏编号唯一性保证）
 */
export async function generateSequentialBatchId(pool: sql.ConnectionPool): Promise<string> {
  await ensureSequenceTable(pool)

  const dateKey = getCSTDateKey()
  const transaction = new sql.Transaction(pool)
  await transaction.begin()

  try {
    // ── 应用级排他锁：同一天内的并发请求在此排队，逐一处理 ──────────────────────
    const lockRequest = transaction.request()
    lockRequest.input("Resource", sql.NVarChar(255), `BatchNumberLock_${dateKey}`)
    lockRequest.input("LockMode", sql.VarChar(32), "Exclusive")
    lockRequest.input("LockOwner", sql.VarChar(32), "Transaction")
    lockRequest.input("LockTimeout", sql.Int, 10000)
    const lockExecResult = await lockRequest.execute("sp_getapplock")

    // sp_getapplock 返回值：0=立即获得，1=等待后获得，<0=失败（超时/取消/死锁/参数错误）
    const lockCode = lockExecResult.returnValue
    if (typeof lockCode !== "number" || lockCode < 0) {
      throw new Error(`获取批次号生成锁失败（sp_getapplock 返回码 ${lockCode}）`)
    }

    // ── 若当天序列行不存在则先插入（此时已持有排他锁，不存在插入竞态） ──────────
    await transaction.request()
      .input("dateKey", sql.NVarChar(6), dateKey)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM Batch_Number_Sequence WHERE DateKey = @dateKey)
          INSERT INTO Batch_Number_Sequence (DateKey, CurrentValue) VALUES (@dateKey, 0)
      `)

    // ── 原子 +1 并用 OUTPUT 一次性拿到新值 ──────────────────────────────────────
    const updateResult = await transaction.request()
      .input("dateKey", sql.NVarChar(6), dateKey)
      .query(`
        UPDATE Batch_Number_Sequence
        SET CurrentValue = CurrentValue + 1, UpdatedAt = GETUTCDATE()
        OUTPUT INSERTED.CurrentValue AS NextValue
        WHERE DateKey = @dateKey
      `)

    const nextValue = updateResult.recordset[0]?.NextValue as number | undefined
    if (typeof nextValue !== "number") {
      throw new Error("批次号序列自增失败：未获取到 NextValue")
    }

    await transaction.commit()

    return `WO${dateKey}${String(nextValue).padStart(4, "0")}`
  } catch (err) {
    try {
      await transaction.rollback()
    } catch {
      // 事务已失效，回滚失败可忽略
    }
    throw err
  }
}

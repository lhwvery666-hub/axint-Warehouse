import { getDbConnection } from '../lib/db-config'

const protectedTables = [
  'Users',
  'Device_Inventory',
  'Product_Catalog',
  'Customer',
  'Project',
  'System_Config',
] as const

const clearedTables = [
  'TicketMessage',
  'Repair_Ticket_History',
  'Repair_Tickets_New',
  'Repair_Tickets',
  'Batch',
  'Customer_History',
] as const

async function getCounts(
  requestFactory: () => ReturnType<Awaited<ReturnType<typeof getDbConnection>>['request']>,
  tables: readonly string[],
) {
  const counts: Record<string, number> = {}

  for (const table of tables) {
    const result = await requestFactory().query(`SELECT COUNT(*) AS count FROM [dbo].[${table}]`)
    counts[table] = Number(result.recordset[0]?.count ?? 0)
  }

  return counts
}

async function clearTestDataSafe() {
  const pool = await getDbConnection()
  const protectedBefore = await getCounts(() => pool.request(), protectedTables)
  const clearedBefore = await getCounts(() => pool.request(), clearedTables)
  const transaction = pool.transaction()
  let transactionOpen = false

  try {
    await transaction.begin()
    transactionOpen = true

    for (const table of clearedTables) {
      await transaction.request().query(`DELETE FROM [dbo].[${table}]`)
    }

    for (const table of [
      'TicketMessage',
      'Repair_Ticket_History',
      'Repair_Tickets_New',
      'Repair_Tickets',
      'Customer_History',
    ]) {
      await transaction.request().query(`DBCC CHECKIDENT ('[dbo].[${table}]', RESEED, 0)`)
    }

    await transaction.request().query(`DELETE FROM [dbo].[Batch_Number_Sequence]`)
    await transaction.request().query(`
      UPDATE [dbo].[Ticket_Sequence]
      SET CurrentValue = 0, UpdatedAt = GETUTCDATE()
      WHERE SequenceType = 'WorkOrder'
    `)

    const clearedInsideTransaction = await getCounts(() => transaction.request(), clearedTables)
    const notEmpty = Object.entries(clearedInsideTransaction).filter(([, count]) => count !== 0)
    if (notEmpty.length > 0) {
      throw new Error(`清理后仍有数据：${JSON.stringify(notEmpty)}`)
    }

    await transaction.commit()
    transactionOpen = false

    const protectedAfter = await getCounts(() => pool.request(), protectedTables)
    const clearedAfter = await getCounts(() => pool.request(), clearedTables)
    const sequenceState = await pool.request().query(`
      SELECT
        batchSequenceRows = (SELECT COUNT(*) FROM [dbo].[Batch_Number_Sequence]),
        legacyCurrentValue = COALESCE((
          SELECT CurrentValue FROM [dbo].[Ticket_Sequence] WHERE SequenceType = 'WorkOrder'
        ), 0)
    `)

    if (JSON.stringify(protectedBefore) !== JSON.stringify(protectedAfter)) {
      throw new Error('基础数据数量在清理过程中发生变化，请立即检查数据库')
    }

    console.log(JSON.stringify({
      deleted: clearedBefore,
      remaining: clearedAfter,
      preserved: protectedAfter,
      sequenceState: sequenceState.recordset[0],
    }, null, 2))
  } catch (error) {
    if (transactionOpen) {
      try {
        await transaction.rollback()
      } catch {
        // SQL Server may already have aborted the transaction.
      }
    }
    throw error
  } finally {
    await pool.close()
  }
}

clearTestDataSafe().catch((error) => {
  console.error(error)
  process.exit(1)
})

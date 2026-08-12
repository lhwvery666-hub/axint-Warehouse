const NUMERIC_SEQUENCE_LIMIT = 999
const LETTER_BLOCK_SIZE = 100
const LETTER_BLOCK_COUNT = 26

export const MAX_DAILY_BATCH_SEQUENCE =
  NUMERIC_SEQUENCE_LIMIT + LETTER_BLOCK_SIZE * LETTER_BLOCK_COUNT

export interface CSTDateKeys {
  /** 用于最终工单号展示的 YYYYMMDD。 */
  displayDateKey: string
  /** 兼容现有数据库序列表的 YYMMDD 内部键。 */
  sequenceDateKey: string
}

/**
 * 按 UTC+8 计算日期，不依赖服务器操作系统所在时区。
 */
export function getCSTDateKeys(date: Date = new Date()): CSTDateKeys {
  const cst = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const yyyy = String(cst.getUTCFullYear()).padStart(4, "0")
  const mm = String(cst.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(cst.getUTCDate()).padStart(2, "0")

  return {
    displayDateKey: `${yyyy}${mm}${dd}`,
    sequenceDateKey: `${yyyy.slice(-2)}${mm}${dd}`,
  }
}

/**
 * 把每日流水值编码为固定三位：001-999、a00-a99、...、z00-z99。
 */
export function encodeDailyBatchSequence(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_DAILY_BATCH_SEQUENCE) {
    throw new RangeError(
      `每日工单序号必须是 1-${MAX_DAILY_BATCH_SEQUENCE} 之间的整数`,
    )
  }

  if (sequence <= NUMERIC_SEQUENCE_LIMIT) {
    return String(sequence).padStart(3, "0")
  }

  const letterOffset = sequence - (NUMERIC_SEQUENCE_LIMIT + 1)
  const letterIndex = Math.floor(letterOffset / LETTER_BLOCK_SIZE)
  const numericPart = letterOffset % LETTER_BLOCK_SIZE
  const letter = String.fromCharCode("a".charCodeAt(0) + letterIndex)

  return `${letter}${String(numericPart).padStart(2, "0")}`
}

export function formatSequentialBatchId(displayDateKey: string, sequence: number): string {
  if (!/^\d{8}$/.test(displayDateKey)) {
    throw new Error("工单日期键必须使用 YYYYMMDD 格式")
  }

  return `${displayDateKey}${encodeDailyBatchSequence(sequence)}`
}

const CURRENT_BATCH_ID_PATTERN = /^\d{8}(?:\d{3}|[a-z]\d{2})$/
const LEGACY_BATCH_ID_PATTERN = /^WO\d{6,}$/i

/**
 * 识别当前及历史批次工单号，保证旧工单仍能正常进入详情与报告页面。
 */
export function isSequentialBatchId(value: string): boolean {
  return CURRENT_BATCH_ID_PATTERN.test(value) || LEGACY_BATCH_ID_PATTERN.test(value)
}

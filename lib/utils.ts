import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 解析时间字符串为 Date 对象，供 date-fns format 使用。
 * date-fns format 会自动按浏览器本地时区（CST = UTC+8）显示，
 * 无需手动加 8 小时，否则会导致双重偏移（显示比实际早8小时）。
 */
export function toBeijingTime(utcTimeString: string | Date | null | undefined): Date {
  if (!utcTimeString) {
    return new Date()
  }
  if (utcTimeString instanceof Date) {
    return utcTimeString
  }
  const date = new Date(utcTimeString)
  if (isNaN(date.getTime())) {
    console.warn(`Invalid date string: ${utcTimeString}`)
    return new Date()
  }
  return date
}

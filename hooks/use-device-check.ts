import { useEffect, useState } from "react"

export interface DeviceCheckResult {
  serialNumber: string
  modelName?: string | null
  deviceName?: string | null
  location?: string | null
  materialCode?: string | null
  status?: string | null
  warehouse?: string | null
}

interface UseDeviceCheckResult {
  exists: boolean | null
  data: DeviceCheckResult | null
  loading: boolean
  error: string | null
  warning: string | null
}

// 通用 Hook：根据序列号检查设备是否存在（带防抖，调用 /api/device/check）
export function useDeviceCheck(sn: string, delay: number = 500): UseDeviceCheckResult {
  const [debouncedSn, setDebouncedSn] = useState("")
  const [exists, setExists] = useState<boolean | null>(null)
  const [data, setData] = useState<DeviceCheckResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  // 防抖处理输入的序列号
  useEffect(() => {
    if (!sn) {
      setDebouncedSn("")
      setExists(null)
      setData(null)
      setError(null)
      setWarning(null)
      return
    }

    const timer = setTimeout(() => {
      setDebouncedSn(sn.trim())
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [sn, delay])

  useEffect(() => {
    const check = async () => {
      if (!debouncedSn) return

      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/device/check?sn=${encodeURIComponent(debouncedSn)}`)
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.message || "查询设备信息失败")
        }

        const json = await res.json()
        if (json.exists) {
          setExists(true)
          setData(json.data as DeviceCheckResult)
          setWarning(json.warning || null)
        } else {
          setExists(false)
          setData(null)
          setWarning(null)
        }
      } catch (err: any) {
        console.error("设备校验失败", err)
        setError(err?.message || "设备校验失败")
        setExists(null)
        setData(null)
        setWarning(null)
      } finally {
        setLoading(false)
      }
    }

    check()
  }, [debouncedSn])

  return { exists, data, loading, error, warning }
}


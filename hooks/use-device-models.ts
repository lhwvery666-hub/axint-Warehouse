import { useEffect, useState } from "react"

export interface DeviceModelOption {
  id?: string | number
  code?: string | null
  name: string
  // 新增：用于三级联动的分类信息（可选）
  category?: string | null
  subCategory?: string | null
  fullSpec?: string | null
}

interface UseDeviceModelsResult {
  models: DeviceModelOption[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

// 通用 Hook：获取设备型号列表（来自 /api/models）
export function useDeviceModels(): UseDeviceModelsResult {
  const [models, setModels] = useState<DeviceModelOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchModels = async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch("/api/models")
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || "获取设备型号失败")
      }

      const data = await res.json()
      const list: DeviceModelOption[] = Array.isArray(data.data) ? data.data : []
      setModels(list)
    } catch (err: any) {
      console.error("加载设备型号失败", err)
      setError(err?.message || "加载设备型号失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 初次加载
    fetchModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { models, loading, error, refresh: fetchModels }
}


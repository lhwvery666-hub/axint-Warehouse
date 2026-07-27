"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import BatchWorkOrderDetail from "@/components/batch-work-order-detail";

// 首页和维修工单列表都会跳转到本页面，均带上 from 参数标记来源标签页
const VALID_RETURN_TABS = ["home", "repair"] as const;

export default function BatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchId = params.id as string;
  const from = searchParams.get("from");

  const handleBack = () => {
    // 如果知道来源标签页，直接跳回对应标签页，而不是依赖浏览器历史记录
    // 这样无论是从首页还是维修工单列表进入，"返回"都能回到原来的位置
    if ((VALID_RETURN_TABS as readonly string[]).includes(from || "")) {
      router.push(`/?tab=${from}`);
    } else {
      router.back();
    }
  };

  return (
    <BatchWorkOrderDetail 
      batchId={batchId} 
      onBack={handleBack} 
    />
  );
}

"use client";

import { useParams, useRouter } from "next/navigation";
import BatchWorkOrderDetail from "@/components/batch-work-order-detail";

export default function BatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = params.id as string;

  return (
    <BatchWorkOrderDetail 
      batchId={batchId} 
      onBack={() => router.back()} 
    />
  );
}

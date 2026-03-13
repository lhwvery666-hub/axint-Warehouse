'use client';

// 强制动态渲染，禁用 Next.js 页面级缓存，确保工单详情始终为最新数据
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { useParams, useRouter } from 'next/navigation';
import RepairDetailWrapper from '@/components/repair-detail-wrapper';

export default function RepairDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  const handleBack = () => {
    // 返回到维修工单列表页面
    router.back();
  };

  return (
    <RepairDetailWrapper taskId={taskId} onBack={handleBack} />
  );
}

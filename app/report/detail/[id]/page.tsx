'use client';

import { useParams, useRouter } from 'next/navigation';
import RepairDetailWrapper from '@/components/repair-detail-wrapper';

export default function RepairDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  const handleBack = () => {
    router.push('/report');
  };

  return (
    <RepairDetailWrapper taskId={taskId} onBack={handleBack} />
  );
}

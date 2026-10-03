'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Save, Send, Edit, Lock, Info } from 'lucide-react';
import { WorkflowSteps } from '@/components/workflow-steps';
import { UserRole, TicketStatus, normalizeTicketStatus } from '@/lib/enums';
import { TicketAction } from '@/lib/ticket-workflow-actions';
import { isSequentialBatchId } from '@/lib/batch-number-format';

// 已发送给现场人员的状态（锁定编辑）
const SENT_STATUSES = new Set([
  TicketStatus.PENDING_REPORTER_CONFIRM,
  TicketStatus.TECHNICIAN_REPAIRING,
  TicketStatus.BUSINESS_REVIEW,
  TicketStatus.WAREHOUSE_SHIPPING,
  TicketStatus.COMPLETED,
]);

interface RepairItem {
  deviceModel: string;
  quantity: number;
  serialNumber: string;
  repairContent: string;
  repairCost: number;
  improvements: string;
}

interface BatchDevice {
  id: string;
  deviceSerialNumber: string;
  modelName: string;
  deviceName: string;
  materialCode: string;
  fullSpec: string;
  quantity: number;
  repairCost: number;
  repairContent: string;
  improvements: string;
}

interface BatchInfo {
  status: string;
  workOrderNumber: string;
  receiveDate: string;
  projectName: string;
  projectLocation: string;
  customerAddress: string;
  contactInfo: string;
}

interface SingleTicketInfo {
  repairNumber: string;
  receiveDate: string;
  customerName: string;
  projectName: string;
  isOutOfWarranty: string;
  contactInfo: string;
}

interface ApiResponse {
  success?: boolean;
  message?: string;
}

export default function EditRepairReportPage() {
  const params = useParams();
  const router = useRouter();
  const { user, status } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isEmbedMode, setIsEmbedMode] = useState(false);
  // 单设备模式
  const [ticketInfo, setTicketInfo] = useState<SingleTicketInfo | null>(null);
  const [items, setItems] = useState<RepairItem[]>([]);
  // 批次模式
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null);
  const [devices, setDevices] = useState<BatchDevice[]>([]);
  const [remarks, setRemarks] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState('');

  // 签字前允许保存覆盖，签字后报告锁定；已发送状态仅防止重复推进。
  // isSentToReporter: 状态已超过 IN_REPAIR（流程已发出）
  const [isSentToReporter, setIsSentToReporter] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  // isEditingAfterSend: 维修人员显式点击"修改报告"后进入修改模式
  const [isEditingAfterSend, setIsEditingAfterSend] = useState(false);

  // 检测嵌入模式
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setIsEmbedMode(searchParams.get('embed') === 'true');
  }, []);

  // 权限检查
  useEffect(() => {
    if (status === 'loading') return;
    if (!user || (user.role !== UserRole.TECHNICIAN && user.role !== UserRole.ADMIN)) {
      if (!isEmbedMode) {
        alert('权限不足：只有维修人员和管理员可以编辑维修报告');
        router.push('/');
      }
    }
  }, [user, status, router, isEmbedMode]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const id = params.id as string;
        const isBatch = isSequentialBatchId(id);
        setIsBatchMode(isBatch);

        if (isBatch) {
          const response = await fetch(`/api/tickets/batch-repair-report/${id}`);
          const result = await response.json();
          if (result.success && result.data) {
            const loadedDevices = result.data.devices as BatchDevice[];
            const loadedRemarks = String(result.data.remarks || '');
            setBatchInfo(result.data.batchInfo as BatchInfo);
            setIsSigned(Boolean(result.data.batchInfo?.reportLocked || result.data.batchInfo?.signedReportPhoto));
            setDevices(loadedDevices);
            setRemarks(loadedRemarks);
            setSavedSnapshot(JSON.stringify({ devices: loadedDevices, remarks: loadedRemarks }));
            // 判断是否已发送（状态超过 IN_REPAIR）
            const ns = normalizeTicketStatus(result.data.batchInfo?.status || '');
            setIsSentToReporter(ns !== null && SENT_STATUSES.has(ns));
          }
        } else {
          const response = await fetch(`/api/tickets/${id}/repair-report`);
          const result = await response.json();
          if (result.success && result.data) {
            const loadedItems = Array.isArray(result.data.items) ? result.data.items as RepairItem[] : [];
            const loadedRemarks = String(result.data.remarks || '');
            setTicketInfo(result.data as SingleTicketInfo);
            setIsSigned(Boolean(result.data.reportLocked || result.data.signedReportPhoto));
            setItems(loadedItems);
            setRemarks(loadedRemarks);
            setSavedSnapshot(JSON.stringify({ items: loadedItems, remarks: loadedRemarks }));
          }
        }
      } catch (error) {
        console.error('获取数据失败:', error);
      } finally {
        setLoading(false);
      }
    };

    if (params.id) fetchData();
  }, [params.id]);

  const handleItemChange = <K extends keyof RepairItem>(index: number, field: K, value: RepairItem[K]) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleDeviceChange = <K extends keyof BatchDevice>(index: number, field: K, value: BatchDevice[K]) => {
    const newDevices = [...devices];
    newDevices[index] = { ...newDevices[index], [field]: value };
    setDevices(newDevices);
  };

  const handleAddItem = () => {
    setItems([...items, {
      deviceModel: '', quantity: 1, serialNumber: '',
      repairContent: '', repairCost: 0, improvements: '',
    }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    try {
      if (isBatchMode) {
        const response = await fetch(`/api/tickets/batch-repair-report/${params.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ devices, remarks }),
        });

        const result = await response.json() as ApiResponse;
        if (result.success) {
          setSavedSnapshot(JSON.stringify({ devices, remarks }));
          setIsEditingAfterSend(false);
          alert(result.message || '信息已保存，流程状态未改变');
          return true;
        } else {
          alert('保存失败：' + (result.message || '未知错误'));
        }
      } else {
        // 单设备模式
        const totalCost = items.reduce((sum, item) => sum + (Number(item.repairCost) || 0), 0);
        const response = await fetch(`/api/tickets/${params.id}/repair-report`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, remarks, totalCost }),
        });
        const result = await response.json() as ApiResponse;
        if (result.success) {
          setSavedSnapshot(JSON.stringify({ items, remarks }));
          setIsEditingAfterSend(false);
          alert('信息已保存，流程状态未改变');
          return true;
        } else {
          alert('保存失败：' + result.message);
        }
      }
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
    return false;
  };

  const handleSendFlow = async () => {
    const currentSnapshot = isBatchMode
      ? JSON.stringify({ devices, remarks })
      : JSON.stringify({ items, remarks });
    if (savedSnapshot !== currentSnapshot) {
      alert('当前有未保存的信息，请先点击“保存信息”，再发送流程');
      return;
    }
    const allReportsComplete = isBatchMode
      ? devices.every((device) => device.repairContent.trim().length > 0)
      : items.length > 0 && items.every((item) => item.repairContent.trim().length > 0);
    if (!allReportsComplete) {
      alert('请先完整填写并保存所有设备的维修内容');
      return;
    }

    const anchorId = isBatchMode ? devices[0]?.id : String(params.id);
    if (!anchorId) {
      alert('未找到可发送的工单设备');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/tickets/${anchorId}/workflow-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: TicketAction.SEND_REPORT_FOR_SIGN }),
      });
      const result = await response.json() as ApiResponse;
      if (!result.success) {
        alert('发送失败：' + (result.message || '未知错误'));
        return;
      }
      setIsSentToReporter(true);
      setIsEditingAfterSend(false);
      alert(result.message || '流程已发送至现场确认');
      if (isEmbedMode) {
        window.parent.postMessage({ type: 'REPAIR_REPORT_SAVED' }, window.location.origin);
        setTimeout(() => {
          window.parent.postMessage({ type: 'CLOSE_EDIT_AND_OPEN_PRINT' }, window.location.origin);
        }, 500);
      } else {
        router.push(`/repairs/print/${params.id}`);
      }
    } catch (error) {
      console.error('发送流程失败:', error);
      alert('发送流程失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // 权限检查中
  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">加载中...</div>
      </div>
    );
  }

  if (!user || (user.role !== UserRole.TECHNICIAN && user.role !== UserRole.ADMIN)) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-semibold">权限不足</p>
              <p>只有维修人员可以编辑维修报告。</p>
              <Button variant="outline" onClick={() => router.push('/')} className="mt-2">
                返回首页
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const totalCost = isBatchMode
    ? devices.reduce((sum, d) => sum + (Number(d.repairCost) || 0), 0)
    : items.reduce((sum, item) => sum + (Number(item.repairCost) || 0), 0);
  const currentSnapshot = isBatchMode
    ? JSON.stringify({ devices, remarks })
    : JSON.stringify({ items, remarks });
  const hasUnsavedChanges = savedSnapshot !== '' && savedSnapshot !== currentSnapshot;

  // 表单是否锁定：已发送且未进入修改模式
  const isFormLocked = isSigned;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* 流程进度指示器 */}
      <WorkflowSteps currentStep={1} />

      {/* ── 状态提示 Banner ── */}
      {isFormLocked ? (
        <Alert className="mb-6 border-amber-300 bg-amber-50">
          <Lock className="h-4 w-4 text-amber-600" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div>
                <strong className="text-amber-900">维修报告已签字确认</strong>
                <p className="text-amber-700 text-sm mt-1">
                  签字后的报告、报价及建议均已锁定，后续维修处置和发货仍可正常办理。
                </p>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      ) : isEditingAfterSend ? (
        <Alert className="mb-6 border-orange-300 bg-orange-50">
          <Edit className="h-4 w-4 text-orange-600" />
          <AlertDescription>
            <strong className="text-orange-900">修改模式：正在修改已发送的报告</strong>
            <p className="text-orange-700 text-sm mt-1">
              点击“保存信息”只记录本次修改，不会改变流程状态。如确需重新发起签字，
              应通过独立的流程操作处理。
            </p>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="mb-6 border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription>
            <strong className="text-blue-900">维修人员操作提示：</strong>
            <span className="text-blue-700 ml-2">
              先在维修工作台保存诊断信息，再填写本报告内容。
              全部完成后点击“<strong>发送流程</strong>”——流程将流转至现场人员签字确认，
              签字后报告将被锁定。
            </span>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          ← 返回
        </Button>
        <h1 className="text-2xl font-bold">
          {isBatchMode ? `批次维修报告 - ${params.id}` : '步骤1：填写维修内容'}
        </h1>
      </div>

      {/* 批次工单基础信息 */}
      {isBatchMode && batchInfo && (
        <Card className="mb-6">
          <CardHeader><CardTitle>工单基础信息</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-semibold">工单号：</span>{batchInfo.workOrderNumber}</div>
              <div><span className="font-semibold">收货日期：</span>{batchInfo.receiveDate}</div>
              <div><span className="font-semibold">客户名称：</span>{batchInfo.projectName || "未填写"}</div>
              <div><span className="font-semibold">项目名称：</span>{batchInfo.projectLocation || "未填写"}</div>
              <div><span className="font-semibold">客户地址：</span>{batchInfo.customerAddress || "未填写"}</div>
              <div><span className="font-semibold">联系方式：</span>{batchInfo.contactInfo}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 单设备工单信息 */}
      {!isBatchMode && ticketInfo && (
        <Card className="mb-6">
          <CardHeader><CardTitle>工单信息</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-semibold">维修单号：</span>{ticketInfo.repairNumber}</div>
              <div><span className="font-semibold">收货日期：</span>{ticketInfo.receiveDate}</div>
              <div><span className="font-semibold">客户名称：</span>{ticketInfo.customerName}</div>
              <div><span className="font-semibold">项目名称：</span>{ticketInfo.projectName}</div>
              <div><span className="font-semibold">是否过保：</span>{ticketInfo.isOutOfWarranty}</div>
              <div><span className="font-semibold">联系方式：</span>{ticketInfo.contactInfo}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 批次模式：设备维修列表 */}
      {isBatchMode && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>设备维修项目（每个设备独立编辑）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {devices.map((device, index) => (
                <div
                  key={device.id}
                  className={`border-2 rounded-lg p-4 ${isFormLocked ? 'bg-muted/40 opacity-80' : 'bg-muted/20'}`}
                >
                  <div className="font-semibold mb-3 text-lg flex items-center justify-between">
                    <span>设备 #{index + 1} - {device.deviceSerialNumber}</span>
                    <span className="text-sm text-muted-foreground">{device.modelName}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">完整规格</label>
                      <div className="text-sm text-muted-foreground">{device.fullSpec || '-'}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">物料名称</label>
                      <div className="text-sm text-muted-foreground">{device.deviceName || '-'}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">维修内容</label>
                      <Textarea
                        value={device.repairContent}
                        onChange={(e) => handleDeviceChange(index, 'repairContent', e.target.value)}
                        placeholder="描述维修的具体内容..."
                        rows={3}
                        disabled={isFormLocked}
                        className={isFormLocked ? 'cursor-not-allowed' : ''}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">改进措施/建议</label>
                      <Textarea
                        value={device.improvements}
                        onChange={(e) => handleDeviceChange(index, 'improvements', e.target.value)}
                        placeholder="填写改进措施或建议..."
                        rows={2}
                        disabled={isFormLocked}
                        className={isFormLocked ? 'cursor-not-allowed' : ''}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          维修费用（元）
                          {isEditingAfterSend && (
                            <span className="ml-1 text-xs text-orange-600 font-normal">
                              修改金额将被记录
                            </span>
                          )}
                        </label>
                        <Input
                          type="number"
                          value={device.repairCost}
                          onChange={(e) => handleDeviceChange(index, 'repairCost', Number(e.target.value))}
                          min="0"
                          step="0.01"
                          disabled={isFormLocked}
                          className={isFormLocked ? 'cursor-not-allowed' : ''}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 单设备模式：维修项目列表 */}
      {!isBatchMode && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>维修项目</CardTitle>
              {!isFormLocked && (
                <Button onClick={handleAddItem} variant="outline" size="sm">+ 添加项目</Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className={`border rounded-lg p-4 relative ${isFormLocked ? 'opacity-80' : ''}`}>
                  {!isFormLocked && (
                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="absolute top-2 right-2 text-red-600 hover:text-red-800"
                    >✕</button>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">设备型号</label>
                      <Input value={item.deviceModel} onChange={(e) => handleItemChange(index, 'deviceModel', e.target.value)} placeholder="输入设备型号" disabled={isFormLocked} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">数量</label>
                      <Input type="number" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))} min="1" disabled={isFormLocked} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">产品序列号</label>
                      <Input value={item.serialNumber} onChange={(e) => handleItemChange(index, 'serialNumber', e.target.value)} placeholder="输入序列号（可选）" disabled={isFormLocked} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">维修费用（元）</label>
                      <Input type="number" value={item.repairCost} onChange={(e) => handleItemChange(index, 'repairCost', Number(e.target.value))} min="0" step="0.01" disabled={isFormLocked} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1">维修主要内容</label>
                      <Textarea value={item.repairContent} onChange={(e) => handleItemChange(index, 'repairContent', e.target.value)} placeholder="描述维修内容" rows={2} disabled={isFormLocked} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1">改善意见</label>
                      <Textarea value={item.improvements} onChange={(e) => handleItemChange(index, 'improvements', e.target.value)} placeholder="填写改善建议" rows={2} disabled={isFormLocked} />
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-center py-8 text-gray-500">暂无维修项目，请点击“添加项目”按钮</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 费用合计 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex justify-between items-center text-lg font-bold">
            <span>维修费用合计：</span>
            <span className="text-2xl text-blue-600">¥{totalCost.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      {/* 备注 */}
      <Card className="mb-6">
        <CardHeader><CardTitle>备注</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="填写备注信息"
            rows={4}
            disabled={isFormLocked}
            className={isFormLocked ? 'cursor-not-allowed' : ''}
          />
        </CardContent>
      </Card>

      {/* 底部操作按钮 */}
      <div className="flex justify-between items-center pt-6 border-t">
        <Button variant="outline" onClick={() => router.back()}>取消</Button>
        <div className="flex gap-2">
          {/* 锁定状态下不显示任何保存按钮 */}
          {!isFormLocked && (
            <>
                  {/* 修改模式：只保存资料，不隐式回退状态 */}
              {isEditingAfterSend ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditingAfterSend(false)}
                    disabled={saving}
                  >
                    取消修改
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    variant="outline"
                    size="lg"
                    className="border-orange-400 text-orange-700 hover:bg-orange-50"
                  >
                    {saving ? (
                      <><Save className="w-4 h-4 mr-2 animate-pulse" />保存中...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" />保存信息</>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  {/* 普通模式：保存 + 发送流程 */}
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    variant="outline"
                    size="lg"
                  >
                    {saving ? (
                      <><Save className="w-4 h-4 mr-2 animate-pulse" />保存中...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" />保存信息</>
                    )}
                  </Button>
                  <Button
                    onClick={handleSendFlow}
                    disabled={saving || hasUnsavedChanges || isSentToReporter}
                    title={hasUnsavedChanges ? '请先保存当前修改' : '将已保存的报告发送至现场确认'}
                    size="lg"
                    className="bg-primary hover:bg-primary/90"
                  >
                    {saving ? (
                      <><Send className="w-4 h-4 mr-2 animate-pulse" />发送中...</>
                    ) : (
                      <><Send className="w-4 h-4 mr-2" />发送流程</>
                    )}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PrintButton } from '@/components/print-button';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { UserRole } from '@/lib/enums';
import { X, ArrowLeft } from 'lucide-react';
import { WorkflowSteps } from '@/components/workflow-steps';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { getCompanyName, COMPANY_CONFIG } from '@/lib/company-config';
import { format } from 'date-fns';
import '@/styles/print.css';

interface BatchDevice {
  id: number;
  deviceSerialNumber: string;
  modelName: string;
  quantity: number;
  repairCost: number;
  repairContent: string;
  improvements: string;
  willReturn?: boolean;        // 是否回寄（现场人员控制）
  isCompleted?: boolean;       // 是否完成维修（维修人员控制）
  warrantyStatus?: string;     // 保修状态 (InWarranty/OutOfWarranty)
  repairAction?: string | null;      // 维修动作枚举原始值
  repairActionLabel?: string | null; // 维修动作中文标签
  repairNotes?: string;        // 处理说明
}

interface BatchReportData {
  batchInfo: {
    batchId: string;
    workOrderNumber: string;
    projectName: string;
    contactInfo: string;
    customerName: string;
    customerAddress: string;
    receiveDate: string;
    signedReportPhoto?: string | null;
    isChargeable?: boolean;  // 是否收费
    status?: string;  // 工单状态
    signedPhotoViewedBy?: string | null;  // 查看人ID
    signedPhotoViewedAt?: string | null;  // 查看时间
    signedPhotoModifyRequest?: string | null;  // 修改申请（JSON）
  };
  devices: BatchDevice[];
  totalQuantity: number;
  totalCost: number;
  remarks: string;
}

/**
 * 对现场人员（Reporter）屏蔽返厂信息：
 * - 将 RMA 动作标签替换为"维修"
 * - repairNotes（含快递单号等内部信息）对 RMA 设备完全隐藏
 */
function getMaskedRepairActionLabel(
  label: string | null | undefined,
  rawAction: string | null | undefined,
  isReporter: boolean
): string | null {
  if (!label) return null;
  if (isReporter && rawAction === "RMA") return "维修";
  return label;
}

/** 对现场人员隐藏 RMA 设备的 repairNotes（包含快递单号等内部物流信息） */
function getMaskedRepairNotes(
  notes: string | null | undefined,
  rawAction: string | null | undefined,
  isReporter: boolean
): string | null {
  if (!notes) return null;
  // RMA 设备的处理说明含返厂物流单号，现场人员不得看到
  if (isReporter && rawAction === "RMA") return null;
  return notes;
}

export default function RepairReportPrintPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<BatchReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // 检测是否在新窗口打开（没有历史记录）
  const [isNewWindow, setIsNewWindow] = useState(false);
  
  // 签字报告照片
  const [signedPhoto, setSignedPhoto] = useState<string | null>(null);
  const [signedPhotoFile, setSignedPhotoFile] = useState<File | null>(null);
  const signedPhotoInputRef = useRef<HTMLInputElement>(null);
  
  // 追踪是否有修改（用于提示用户保存）
  const [hasChanges, setHasChanges] = useState(false);
  
  // 申请修改对话框
  const [isModifyRequestDialogOpen, setIsModifyRequestDialogOpen] = useState(false);
  const [modifyReason, setModifyReason] = useState('');
  
  // 检测嵌入模式
  const [isEmbedMode, setIsEmbedMode] = useState(false);
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setIsEmbedMode(searchParams.get('embed') === 'true');
  }, []);

  // 检测是否是在新窗口中打开
  useEffect(() => {
    // 如果历史记录只有1条，说明是新打开的窗口
    setIsNewWindow(window.history.length <= 1);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const id = params.id as string;
        
        // 调用批次维修报告API
        const response = await fetch(`/api/tickets/batch-repair-report/${id}`);
        const result = await response.json();
        
        if (result.success && result.data) {
          setReportData(result.data);
          
          // 调试：打印签字照片信息
          console.log('[打印报告] 签字照片路径:', result.data.batchInfo.signedReportPhoto);
          
          // 如果是维修人员且有签字照片且未被查看过，自动记录查看
          if (
            user?.role === UserRole.TECHNICIAN && 
            result.data.batchInfo.signedReportPhoto && 
            !result.data.batchInfo.signedPhotoViewedBy
          ) {
            // 延迟2秒后记录查看（给用户时间看到照片）
            setTimeout(async () => {
              try {
                const viewResponse = await fetch(`/api/tickets/signed-photo/${id}`, {
                  method: 'POST',
                });
                const viewResult = await viewResponse.json();
                if (viewResult.success) {
                  console.log('✅ 已记录查看，照片已锁定');
                  // 重新加载数据以更新查看状态
                  const refreshResponse = await fetch(`/api/tickets/batch-repair-report/${id}`);
                  const refreshResult = await refreshResponse.json();
                  if (refreshResult.success && refreshResult.data) {
                    setReportData(refreshResult.data);
                  }
                }
              } catch (error) {
                console.error('记录查看失败:', error);
              }
            }, 2000);
          }
        } else {
          setError(result.message || '获取维修报告失败');
        }
      } catch (err: any) {
        console.error('获取维修报告失败:', err);
        setError(err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchData();
    }
  }, [params.id, user]);

  // 处理签字照片上传
  const handleSignedPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      toast({
        title: '文件类型错误',
        description: '请上传图片文件',
        variant: 'destructive',
      });
      return;
    }

    // 验证文件大小（最大 5MB）
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: '文件过大',
        description: '图片大小不能超过 5MB',
        variant: 'destructive',
      });
      return;
    }

    setSignedPhotoFile(file);
    setSignedPhoto(URL.createObjectURL(file));
    setHasChanges(true);
  };
  
  // 删除签字照片（仅未被查看时可用）
  const handleDeletePhoto = async () => {
    if (!reportData) return;
    
    const confirmed = window.confirm('确定要删除签字照片吗？删除后需要重新上传。');
    if (!confirmed) return;
    
    try {
      const response = await fetch(`/api/tickets/signed-photo/${params.id}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: '删除成功',
          description: '签字照片已删除',
        });
        
        // 重新加载数据
        const fetchResponse = await fetch(`/api/tickets/batch-repair-report/${params.id}`);
        const fetchResult = await fetchResponse.json();
        if (fetchResult.success && fetchResult.data) {
          setReportData(fetchResult.data);
        }
      } else {
        toast({
          title: '删除失败',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('删除照片失败:', error);
      toast({
        title: '删除失败',
        description: error.message || '请稍后重试',
        variant: 'destructive',
      });
    }
  };
  
  // 申请修改签字照片
  const handleRequestModify = async () => {
    if (!modifyReason.trim()) {
      toast({
        title: '请填写修改原因',
        description: '申请修改需要说明原因',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      const response = await fetch(`/api/tickets/signed-photo/${params.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: modifyReason.trim(),
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: '申请已提交',
          description: '修改申请已提交，等待管理员审批',
        });
        
        setIsModifyRequestDialogOpen(false);
        setModifyReason('');
        
        // 重新加载数据
        const fetchResponse = await fetch(`/api/tickets/batch-repair-report/${params.id}`);
        const fetchResult = await fetchResponse.json();
        if (fetchResult.success && fetchResult.data) {
          setReportData(fetchResult.data);
        }
      } else {
        toast({
          title: '提交失败',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('提交申请失败:', error);
      toast({
        title: '提交失败',
        description: error.message || '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  // 处理签字照片上传
  const handlePhotoUpload = async () => {
    if (!reportData) return;
    
    // 收费情况下，必须上传签字照片
    if (user?.role === UserRole.REPORTER) {
      if (isChargeable && !signedPhotoFile) {
        toast({
          title: '请上传签字照片',
          description: '本次维修需要收费（¥' + totalCost.toFixed(2) + '），必须上传客户签字的报告照片',
          variant: 'destructive',
        });
        return;
      }
      
      // 非收费情况：如果没有上传签字照片，给予友好提示（但不阻止提交）
      if (!isChargeable && !signedPhotoFile) {
        const confirmed = window.confirm('您还没有上传签字照片，确定要继续提交吗？\n\n建议：打印报告后签字并拍照上传。');
        if (!confirmed) {
          return;
        }
      }
    }

    try {
      setSubmitting(true);
      
      // 使用 FormData 上传文件
      const formData = new FormData();
      
      // 添加签字照片
      if (signedPhotoFile) {
        formData.append('signedPhoto', signedPhotoFile);
      }

      const response = await fetch(`/api/tickets/reporter-confirm/${params.id}`, {
        method: 'PUT',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: '上传成功',
          description: result.message || '签字照片已保存',
        });
        
        // 重置修改标记
        setHasChanges(false);
        
        // 重新加载数据
        const fetchResponse = await fetch(`/api/tickets/batch-repair-report/${params.id}`);
        const fetchResult = await fetchResponse.json();
        if (fetchResult.success && fetchResult.data) {
          setReportData(fetchResult.data);
        }
        
        // 如果在嵌入模式，通知父窗口
        if (isEmbedMode) {
          window.parent.postMessage({ type: 'REPAIR_REPORT_CONFIRMED' }, window.location.origin);
        }
      } else {
        throw new Error(result.message || '提交失败');
      }
    } catch (err: any) {
      console.error('提交确认失败:', err);
      toast({
        title: '提交失败',
        description: err.message || '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg">加载中...</p>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-lg text-red-600">{error || '未找到维修报告数据'}</p>
        {isNewWindow ? (
          <Button onClick={() => window.close()}>关闭窗口</Button>
        ) : (
          <Button onClick={() => router.back()}>返回</Button>
        )}
      </div>
    );
  }

  const { batchInfo, devices, totalQuantity, totalCost, remarks } = reportData;

  // 判断当前用户角色
  const isReporter = user?.role === UserRole.REPORTER;
  const isTechnician = user?.role === UserRole.TECHNICIAN;
  
  // 判断是否收费
  const isChargeable = batchInfo.isChargeable || false;
  const isPendingReporterConfirm = batchInfo.status === 'Pending_Reporter_Confirm' || batchInfo.status === 'pending_reporter_confirm';
  
  // ⚠️ 现场人员只能在工作状态为 PENDING_REPORTER_CONFIRM 时上传签字
  const canUploadSignature = isReporter && isPendingReporterConfirm;

  return (
    <div className="print-container">
      {/* 顶部操作栏 - 简洁版 */}
      <div className="no-print print:hidden mb-6 bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="p-4 flex items-center justify-between">
          {/* 左侧：返回按钮 + 标题 */}
          <div className="flex items-center gap-4">
            {!isNewWindow && (
              <Button variant="ghost" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回
              </Button>
            )}
            <div>
              <h1 className="text-lg font-semibold">维修报告</h1>
              <p className="text-xs text-muted-foreground">工单号：{batchInfo.batchId}</p>
            </div>
          </div>
          
          {/* 右侧：操作按钮 */}
          <div className="flex gap-2 items-center">
            {isChargeable && isReporter && (
              <Badge className="bg-orange-600 text-white">
                需收费 ¥{totalCost.toFixed(2)}
              </Badge>
            )}
            {/* 下载PDF：修改文档标题后打印，浏览器保存对话框将以工单号命名文件 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const originalTitle = document.title;
                document.title = `维修报告-${batchInfo.workOrderNumber || batchInfo.batchId}`;
                window.print();
                setTimeout(() => { document.title = originalTitle; }, 1000);
              }}
              className="border-blue-600 text-blue-700 hover:bg-blue-50"
            >
              下载PDF
            </Button>
            {/* 打印报告：调用浏览器原生打印功能 */}
            <PrintButton />
          </div>
        </div>
      </div>

      {/* 流程步骤 - 紧凑版 */}
      <div className="no-print mb-4">
        <WorkflowSteps currentStep={2} />
      </div>

      {/* 现场人员操作区域 */}
      {isReporter && (
        <div className="no-print mb-6">
          {/* ⚠️ 状态检查：只有维修人员发送报告后（状态为 PENDING_REPORTER_CONFIRM）才能上传签字。
               已有签字照片时不显示此提示（上传成功后状态已推进，不需要再提示"无法上传"）。 */}
          {!isPendingReporterConfirm && !batchInfo.signedReportPhoto && !signedPhoto && (
            <Alert className="mb-4 border-red-300 bg-red-50">
              <AlertDescription>
                <div className="flex items-start gap-3">
                  <Badge className="bg-red-600 text-white shrink-0 mt-0.5">无法上传</Badge>
                  <div className="flex-1">
                    <p className="font-semibold text-red-900">当前工单状态不允许上传签字</p>
                    <p className="text-sm text-red-700 mt-1">
                      只有维修人员保存并发送维修报告后（状态为"待现场确认"），您才能上传签字照片。请等待维修人员发送报告。
                    </p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          {/* 关键提示：收费情况 */}
          {isChargeable && isPendingReporterConfirm && (
            <Alert className="mb-4 border-orange-300 bg-orange-50">
              <AlertDescription>
                <div className="flex items-start gap-3">
                  <Badge className="bg-orange-600 text-white shrink-0 mt-0.5">收费项目</Badge>
                  <div className="flex-1">
                    <p className="font-semibold text-orange-900">总费用：¥{totalCost.toFixed(2)}</p>
                    <p className="text-sm text-orange-700 mt-1">
                      请与客户确认费用后，打印报告让客户签字，拍照上传
                    </p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          {/* 签字照片上传卡片 - 简化版 */}
          <div className={cn(
            "p-4 border rounded-lg",
            isChargeable ? "bg-orange-50/50 border-orange-200" : "bg-blue-50/50 border-blue-200"
          )}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">客户签字照片</h3>
              {isChargeable && !batchInfo.signedReportPhoto && (
                <Badge variant="destructive" className="text-xs">必须上传</Badge>
              )}
            </div>
          
            {/* 已上传的签字照片 */}
          {(batchInfo.signedReportPhoto || (isReporter && signedPhoto)) && (
            <div className="mb-3">
              {/* 锁定状态提示 - 简化版 */}
              {batchInfo.signedPhotoViewedBy && (
                <div className="mb-2 px-3 py-2 bg-orange-100 border border-orange-200 rounded-md">
                  <p className="text-xs text-orange-900">
                    <strong>🔒 已锁定</strong> - 维修人员已查看，如需修改请申请
                  </p>
                </div>
              )}
              
              {!batchInfo.signedReportPhoto && signedPhoto && (
                <div className="mb-2 px-3 py-2 bg-blue-100 border border-blue-200 rounded-md">
                  <p className="text-xs text-blue-900">
                    照片已选择，点击下方"确认提交"按钮保存
                  </p>
                </div>
              )}
              <div className="relative w-full max-w-2xl">
                <img
                  src={batchInfo.signedReportPhoto ? batchInfo.signedReportPhoto : signedPhoto!}
                  alt="签字报告照片"
                  className="w-full rounded-md border-2 border-green-200 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
                  onError={(e) => {
                    console.error('图片加载失败:', {
                      src: e.currentTarget.src,
                      signedReportPhoto: batchInfo.signedReportPhoto,
                      signedPhoto: signedPhoto
                    });
                  }}
                  onClick={() => {
                    const imgSrc = batchInfo.signedReportPhoto || signedPhoto!;
                    window.open(imgSrc, '_blank');
                  }}
                />
                <div className="mt-2 flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const imgSrc = batchInfo.signedReportPhoto || signedPhoto!;
                      window.open(imgSrc, '_blank');
                    }}
                  >
                    查看大图
                  </Button>
                  {batchInfo.signedReportPhoto && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = batchInfo.signedReportPhoto;
                        link.download = `签字报告-${batchInfo.batchId}.jpg`;
                        link.click();
                      }}
                    >
                      下载照片
                    </Button>
                  )}
                  
                  {/* 现场人员的操作按钮 */}
                  {isReporter && batchInfo.signedReportPhoto && (
                    <>
                      {!batchInfo.signedPhotoViewedBy ? (
                        // 未被查看：可以直接删除
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleDeletePhoto}
                        >
                          删除照片
                        </Button>
                      ) : (
                        // 已被查看：需要申请修改
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-orange-500 text-orange-700 hover:bg-orange-50"
                          onClick={() => setIsModifyRequestDialogOpen(true)}
                        >
                          申请修改
                        </Button>
                      )}
                    </>
                  )}
                  
                  {isReporter && !batchInfo.signedReportPhoto && signedPhoto && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSignedPhoto(null);
                        setSignedPhotoFile(null);
                        setHasChanges(false);
                      }}
                    >
                      重新选择
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-green-600 mt-3 text-center">
                点击图片可查看大图 | 此照片可作为客户签字确认的凭证
              </p>
            </div>
          )}
          
            {/* 签字照片上传按钮 - 简化版 */}
            {isReporter && !batchInfo.signedReportPhoto && !signedPhoto && canUploadSignature && (
              <div className="text-center">
                <input
                  ref={signedPhotoInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={handleSignedPhotoChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  onClick={() => signedPhotoInputRef.current?.click()}
                  variant="outline"
                  className={cn(
                    "w-full max-w-md",
                    isChargeable && "border-orange-500 text-orange-700 hover:bg-orange-50"
                  )}
                >
                  点击上传客户签字照片
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  支持 JPG、PNG 格式，最大 5MB
                </p>
              </div>
            )}
            
            {/* 提交按钮 - 简化版 */}
            {hasChanges && canUploadSignature && (
              <div className="mt-4 flex justify-center">
                <Button 
                  onClick={handlePhotoUpload}
                  disabled={submitting}
                  size="lg"
                  className="bg-orange-600 hover:bg-orange-700 text-white min-w-[200px]"
                >
                  {submitting ? (
                    <>上传中...</>
                  ) : (
                    <>
                      上传照片
                      {hasChanges && <Badge className="ml-2 bg-white text-orange-600">!</Badge>}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="print-content">
        {/* 公司抬头 */}
        <div className="report-header">
          <div className="company-name">{getCompanyName()}</div>
          <div className="report-title">产品维修单</div>
        </div>

        {/* 基本信息表格 */}
        <table className="info-table">
          <tbody>
            <tr>
              <td className="label-cell" style={{ width: '12%' }}>收货日期</td>
              <td className="value-cell" style={{ width: '38%' }}>{batchInfo.receiveDate || '-'}</td>
              <td className="label-cell" style={{ width: '12%' }}>单据单号</td>
              <td className="value-cell" style={{ width: '38%' }}>{batchInfo.workOrderNumber || batchInfo.batchId}</td>
            </tr>
            <tr>
              <td className="label-cell">客户名称</td>
              <td className="value-cell">{batchInfo.projectName || '-'}</td>
              <td className="label-cell">项目名称</td>
              <td className="value-cell">{batchInfo.projectLocation || '-'}</td>
            </tr>
            <tr>
              <td className="label-cell">客户地址</td>
              <td className="value-cell">{batchInfo.customerAddress || '-'}</td>
              <td className="label-cell">联系人/电话</td>
              <td className="value-cell">{batchInfo.contactInfo || '-'}</td>
            </tr>
            <tr>
              <td className="label-cell">From</td>
              <td className="value-cell">-</td>
              <td className="label-cell">保修状态</td>
              <td className="value-cell">
                {devices.length > 1
                  ? "详见下表明细"
                  : devices[0]?.warrantyStatus === "InWarranty"
                    ? "保内"
                    : devices[0]?.warrantyStatus === "OutOfWarranty"
                      ? "保外"
                      : "待判定"}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 维修明细表 */}
        <div className="detail-table-container">
          <table className="detail-table">
            <thead>
              <tr>
                <th style={{ width: '8%' }}>设备型号</th>
                <th style={{ width: '6%' }}>数量</th>
                <th style={{ width: '13%' }}>产品序列号</th>
                <th style={{ width: '8%' }}>设备状态</th>
                <th style={{ width: '25%' }}>故障与处理记录</th>
                <th style={{ width: '10%' }}>维修费用<br/>(元)</th>
                <th style={{ width: '30%' }}>改善意见</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device, index) => (
                <tr key={index}>
                  <td>{device.modelName}</td>
                  <td>{device.quantity}</td>
                  <td>{device.deviceSerialNumber}</td>
                  <td>
                    {device.warrantyStatus === "InWarranty" ? "保内" : 
                     device.warrantyStatus === "OutOfWarranty" ? "保外" : "-"}
                  </td>
                  <td className="text-left">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div>
                        <strong>[故障]</strong>{' '}
                        {device.repairContent || '-'}
                      </div>
                      {(device.repairActionLabel || device.repairNotes) && (() => {
                        const isReporter = user?.role === UserRole.REPORTER;
                        const maskedLabel = getMaskedRepairActionLabel(
                          device.repairActionLabel,
                          device.repairAction,
                          isReporter
                        );
                        const maskedNotes = getMaskedRepairNotes(
                          device.repairNotes,
                          device.repairAction,
                          isReporter
                        );
                        const parts = [maskedLabel, maskedNotes].filter(Boolean);
                        return parts.length > 0 ? (
                          <div>
                            <strong>[处理]</strong>{' '}
                            {parts.join(' - ')}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </td>
                  <td className="text-right">{device.repairCost.toFixed(2)}</td>
                  <td className="text-left">{device.improvements || '-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row" style={{ borderTop: '1px solid #000' }}>
                <td colSpan={3} className="text-center" style={{ backgroundColor: '#f9f9f9', border: '1px solid #000', borderTop: '1px solid #000' }}>数量合计</td>
                <td colSpan={2} style={{ border: '1px solid #000', borderTop: '1px solid #000' }}>{totalQuantity}</td>
                <td className="text-right" style={{ backgroundColor: '#f9f9f9', border: '1px solid #000', borderTop: '1px solid #000' }}>维修费用合计：</td>
                <td className="text-right" style={{ border: '1px solid #000', borderTop: '1px solid #000' }}>{totalCost.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 备注区域 */}
        <div className="remarks-section">
          <div className="remarks-title">备  注</div>
          <div className="remarks-content" style={{ minHeight: '100px' }}>{remarks || ''}</div>
        </div>

        {/* 请确认是否维修区域 */}
        <div className="confirm-repair-section">
          <div className="confirm-repair-title">请确认是否维修：</div>
          <div className="confirm-repair-options">
            <div className="confirm-option">
              <span>☐ 同意维修</span>
            </div>
            <div className="confirm-option">
              <span>☐ 不维修，请寄回</span>
            </div>
            <div className="confirm-option">
              <span>☐ 不维修，无需寄回</span>
            </div>
          </div>
        </div>

        {/* 客户确认和日期区域 */}
        <div className="customer-signature-area">
          <div className="signature-row-flex">
            <div className="signature-item-large">
              <div className="signature-label-top">客户确认：（盖章）</div>
              <div className="signature-space">
                <div style={{ minHeight: '80px' }}></div>
              </div>
            </div>
            <div className="signature-item-large">
              <div className="signature-label-top">日  期：</div>
              <div className="signature-space"></div>
            </div>
          </div>
        </div>

        {/* 提示文字 */}
        <div className="note-section">
          <p>（备注：请在3个工作日内回复确认是否维修，逾期视以不同意维修处理）</p>
        </div>

        {/* 联系信息 */}
        <div className="contact-footer-inline">
          <span><strong>联系人：</strong>{COMPANY_CONFIG.repairDept.contact}</span>
          <span style={{ marginLeft: '30px' }}><strong>电话：</strong>{COMPANY_CONFIG.repairDept.phone}</span>
        </div>
        <div className="contact-footer-address">
          <strong>维修部地址：</strong>{COMPANY_CONFIG.repairDept.address}
        </div>
      </div>
      
      {/* 申请修改签字照片对话框 */}
      <Dialog open={isModifyRequestDialogOpen} onOpenChange={setIsModifyRequestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>申请修改签字照片</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-700 mb-2">
                签字照片已被维修人员查看并锁定，无法直接修改。
              </p>
              <p className="text-sm text-orange-700 mb-4">
                如需修改，请说明原因并提交申请，等待管理员审批。
              </p>
            </div>
            <div>
              <Label htmlFor="modifyReason">修改原因 *</Label>
              <Textarea
                id="modifyReason"
                placeholder="请详细说明需要修改签字照片的原因..."
                value={modifyReason}
                onChange={(e) => setModifyReason(e.target.value)}
                rows={4}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsModifyRequestDialogOpen(false);
                setModifyReason('');
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleRequestModify}
              disabled={!modifyReason.trim()}
            >
              提交申请
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";
import { TicketStatus, TICKET_STATUS_LABELS } from "@/lib/enums";

interface TimelineStep {
  key: TicketStatus;
  label: string;
  description?: string;
}

interface RepairStatusTimelineProps {
  currentStatus: TicketStatus | string;
  className?: string;
}

/**
 * 维修工单状态时间线组件
 * 类似大学申请流程的可视化展示
 */
export function RepairStatusTimeline({ currentStatus, className }: RepairStatusTimelineProps) {
  // 定义维修工单的主要流程步骤（完整的9步流程）
  const steps: TimelineStep[] = [
    {
      key: TicketStatus.CREATED,
      label: "工单创建",
      description: "现场人员提交"
    },
    {
      key: TicketStatus.WAREHOUSE_CONFIRMING,
      label: "仓库确认",
      description: "确认设备信息"
    },
    {
      key: TicketStatus.WAREHOUSE_CONFIRMED,
      label: "待维修检查",
      description: "出厂日期已填"
    },
    {
      key: TicketStatus.IN_REPAIR,
      label: "维修检查",
      description: "检查并填报告"
    },
    {
      key: TicketStatus.PENDING_REPORTER_CONFIRM,
      label: "现场签字",
      description: "等待签字回传"
    },
    {
      key: TicketStatus.TECHNICIAN_REPAIRING,
      label: "维修中",
      description: "维修人员维修"
    },
    {
      key: TicketStatus.BUSINESS_REVIEW,
      label: "商务审核",
      description: "收款和开票"
    },
    {
      key: TicketStatus.WAREHOUSE_SHIPPING,
      label: "仓库发货",
      description: "出库或入库"
    },
    {
      key: TicketStatus.COMPLETED,
      label: "已完成",
      description: "流程结束"
    },
  ];

  // 标准化当前状态
  const normalizeStatus = (status: string): TicketStatus => {
    const normalized = status.toLowerCase().replace(/-/g, '_');
    const statusMap: Record<string, TicketStatus> = {
      // 正常流程状态
      'created': TicketStatus.CREATED,
      'pending': TicketStatus.CREATED,
      'warehouse_confirming': TicketStatus.WAREHOUSE_CONFIRMING,
      'warehouse_received': TicketStatus.WAREHOUSE_CONFIRMING,
      'warehouse_confirmed': TicketStatus.WAREHOUSE_CONFIRMED,
      'in_repair': TicketStatus.IN_REPAIR,
      'in_warranty_repair': TicketStatus.IN_REPAIR,
      'out_warranty_repair': TicketStatus.IN_REPAIR,
      'processing': TicketStatus.IN_REPAIR,
      'warranty_checking': TicketStatus.IN_REPAIR,
      'in_warranty_replace': TicketStatus.IN_REPAIR,
      'out_warranty_report': TicketStatus.IN_REPAIR,
      'pending_factory': TicketStatus.IN_REPAIR,
      'factory_finished': TicketStatus.IN_REPAIR,
      'customer_confirm': TicketStatus.PENDING_REPORTER_CONFIRM,
      'pending_reporter_confirm': TicketStatus.PENDING_REPORTER_CONFIRM,
      'technician_repairing': TicketStatus.TECHNICIAN_REPAIRING,
      'business_review': TicketStatus.BUSINESS_REVIEW,
      'admin_review': TicketStatus.BUSINESS_REVIEW,
      'pending_payment': TicketStatus.BUSINESS_REVIEW,
      'warehouse_shipping': TicketStatus.WAREHOUSE_SHIPPING,
      'pending_shipment': TicketStatus.WAREHOUSE_SHIPPING,
      'completed': TicketStatus.COMPLETED,
      // 终态状态：流程已结束（显示为"已完成"节点）
      'return_unrepaired': TicketStatus.COMPLETED,
      'returnunrepaired': TicketStatus.COMPLETED,
      'scrapped': TicketStatus.COMPLETED,
      'unrepairable': TicketStatus.COMPLETED,
      'rejected_no_return': TicketStatus.COMPLETED,
      'rejectednoreturn': TicketStatus.COMPLETED,
      // 异常/取消状态：流程中止，保留在当前节点（用Created作为fallback会误导，用CREATED但实际上不显示高亮）
      'cancelled': TicketStatus.CREATED,
      'deleted': TicketStatus.CREATED,
      'delayed': TicketStatus.TECHNICIAN_REPAIRING,
    };
    return statusMap[normalized] || TicketStatus.CREATED;
  };

  const current = normalizeStatus(currentStatus);
  const currentIndex = steps.findIndex(step => step.key === current);

  // 判断是否为终止态（非正常完成）
  const TERMINAL_LABELS: Record<string, string> = {
    'return_unrepaired': '已寄回（无需维修）',
    'returnunrepaired': '已寄回（无需维修）',
    'scrapped': '已入库处理',
    'unrepairable': '无法维修',
    'rejected_no_return': '已拒绝（不退回）',
    'rejectednoreturn': '已拒绝（不退回）',
  };
  const rawNormalized = (currentStatus || '').toLowerCase().replace(/-/g, '_');
  const terminalLabel = TERMINAL_LABELS[rawNormalized] || null;

  // 判断步骤状态
  const getStepStatus = (index: number): 'completed' | 'current' | 'upcoming' => {
    if (index < currentIndex) return 'completed';
    if (index === currentIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div className={cn("w-full py-6 md:py-8", className)}>
      {/* 终止态特殊提示 */}
      {terminalLabel && (
        <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 font-medium flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
          最终结果：{terminalLabel}
        </div>
      )}
      {/* 时间线容器 */}
      <div className="relative">
        {/* 桌面端：横向滚动容器 */}
        <div className="hidden md:block overflow-x-auto pb-4">
          <div className="relative min-w-max px-4">
            {/* 连接线 */}
            <div className="absolute top-4 left-0 right-0 h-0.5 bg-muted">
              {/* 已完成部分的高亮线 */}
              <div
                className="absolute h-full bg-primary transition-all duration-500"
                style={{
                  width: currentIndex > 0 ? `${(currentIndex / (steps.length - 1)) * 100}%` : '0%'
                }}
              />
            </div>

            {/* 步骤节点 */}
            <div className="relative flex justify-between items-center gap-8">
              {steps.map((step, index) => {
                const status = getStepStatus(index);
                
                return (
                  <div
                    key={step.key}
                    className="flex flex-col items-center gap-2 min-w-[100px]"
                  >
                    {/* 圆圈节点 */}
                    <div
                      className={cn(
                        "relative z-10 flex items-center justify-center rounded-full transition-all duration-300",
                        "w-8 h-8 flex-shrink-0",
                        status === 'completed' && "bg-primary shadow-md shadow-primary/30",
                        status === 'current' && "bg-primary ring-4 ring-primary/20 shadow-lg shadow-primary/40 scale-110",
                        status === 'upcoming' && "bg-muted border-2 border-border"
                      )}
                    >
                      {status === 'completed' ? (
                        <svg
                          className="w-4 h-4 text-primary-foreground"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : status === 'current' ? (
                        <div className="w-3 h-3 rounded-full bg-primary-foreground" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                      )}
                    </div>

                    {/* 文字信息 */}
                    <div className="text-center">
                      <div
                        className={cn(
                          "font-semibold text-xs transition-colors leading-tight whitespace-nowrap",
                          status === 'completed' && "text-primary",
                          status === 'current' && "text-primary font-bold",
                          status === 'upcoming' && "text-muted-foreground"
                        )}
                      >
                        {step.label}
                      </div>
                      {step.description && (
                        <div
                          className={cn(
                            "text-[10px] mt-0.5 transition-colors whitespace-nowrap",
                            status === 'upcoming' ? "text-muted-foreground/60" : "text-muted-foreground"
                          )}
                        >
                          {step.description}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 移动端：垂直布局 */}
        <div className="md:hidden">
          <div className="space-y-4">
            {steps.map((step, index) => {
              const status = getStepStatus(index);
              
              return (
                <div key={step.key} className="relative flex items-start gap-3">
                  {/* 垂直连接线 */}
                  {index < steps.length - 1 && (
                    <div className="absolute left-4 top-8 w-0.5 h-full bg-muted">
                      <div
                        className={cn(
                          "w-full transition-all duration-500",
                          status === 'completed' ? 'h-full bg-primary' : 'h-0'
                        )}
                      />
                    </div>
                  )}

                  {/* 圆圈节点 */}
                  <div
                    className={cn(
                      "relative z-10 flex items-center justify-center rounded-full transition-all duration-300 flex-shrink-0",
                      "w-8 h-8",
                      status === 'completed' && "bg-primary shadow-md shadow-primary/30",
                      status === 'current' && "bg-primary ring-4 ring-primary/20 shadow-lg shadow-primary/40",
                      status === 'upcoming' && "bg-muted border-2 border-border"
                    )}
                  >
                    {status === 'completed' ? (
                      <svg
                        className="w-4 h-4 text-primary-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : status === 'current' ? (
                      <div className="w-3 h-3 rounded-full bg-primary-foreground" />
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                    )}
                  </div>

                  {/* 文字信息 */}
                  <div className="flex-1 pt-0.5">
                    <div
                      className={cn(
                        "font-semibold text-sm transition-colors leading-tight",
                        status === 'completed' && "text-primary",
                        status === 'current' && "text-primary font-bold",
                        status === 'upcoming' && "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </div>
                    {step.description && (
                      <div
                        className={cn(
                          "text-xs mt-0.5 transition-colors",
                          status === 'upcoming' ? "text-muted-foreground/60" : "text-muted-foreground"
                        )}
                      >
                        {step.description}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

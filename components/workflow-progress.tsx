"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, AlertCircle, ArrowRight } from "lucide-react";
import { calculateProgress, getCurrentStep, getNextStep, type TicketProgress } from "@/lib/workflow-utils";
import { cn } from "@/lib/utils";

interface WorkflowProgressProps {
  ticket: any;
  showDetails?: boolean;
}

export default function WorkflowProgress({ ticket, showDetails = true }: WorkflowProgressProps) {
  const currentStep = getCurrentStep(ticket.status || "Created");
  const progress = calculateProgress(ticket, currentStep);

  if (!currentStep) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-primary" />
            填写进度
          </CardTitle>
          <Badge variant={progress.canProceed ? "default" : "secondary"}>
            {progress.completionRate}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 进度条 */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">完成度</span>
            <span className="font-medium">{progress.completionRate}%</span>
          </div>
          <Progress value={progress.completionRate} className="h-2" />
        </div>

        {/* 当前步骤信息 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">当前步骤：</span>
            <Badge variant="outline">{currentStep.label}</Badge>
          </div>
          {progress.nextStep && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">下一步：</span>
              <Badge variant="secondary">{progress.nextStep.label}</Badge>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* 字段填写状态 */}
        {showDetails && (
          <div className="space-y-2 pt-2 border-t">
            <div className="text-sm font-medium text-muted-foreground mb-2">必填字段：</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {progress.fields
                .filter(f => f.required)
                .map((field) => (
                  <div
                    key={field.field}
                    className={cn(
                      "flex items-center gap-2 text-sm p-2 rounded-md",
                      field.filled
                        ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                        : "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
                    )}
                  >
                    {field.filled ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                    <span>{field.label}</span>
                  </div>
                ))}
            </div>
            
            {progress.fields.filter(f => !f.required && f.filled).length > 0 && (
              <>
                <div className="text-sm font-medium text-muted-foreground mb-2 mt-4">已填写的可选字段：</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {progress.fields
                    .filter(f => !f.required && f.filled)
                    .map((field) => (
                      <div
                        key={field.field}
                        className="flex items-center gap-2 text-sm p-2 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      >
                        <CheckCircle className="h-4 w-4" />
                        <span>{field.label}</span>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 提示信息 */}
        {!progress.canProceed && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              ⚠️ 请完成所有必填字段后才能流转到下一步
            </p>
          </div>
        )}
        {progress.canProceed && progress.nextStep && (
          <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
            <p className="text-sm text-green-700 dark:text-green-300">
              ✅ 所有必填字段已填写完成，可以流转到下一步：{progress.nextStep.label}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

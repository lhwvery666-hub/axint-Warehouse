import { ChevronRight, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowStepsProps {
  currentStep: 1 | 2;
  totalSteps?: number;
}

export function WorkflowSteps({ currentStep, totalSteps = 2 }: WorkflowStepsProps) {
  const steps = [
    { number: 1, title: "编辑维修内容", description: "填写维修信息" },
    { number: 2, title: "确认和打印", description: "确认回寄和签字" },
  ];

  return (
    <div className="flex items-center justify-center gap-2 md:gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
      {steps.map((step, index) => (
        <div key={step.number} className="flex items-center gap-2 md:gap-4">
          <div className="flex items-center gap-2 md:gap-3">
            <div
              className={cn(
                "w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-semibold transition-all",
                currentStep === step.number
                  ? "bg-primary text-primary-foreground shadow-lg scale-110"
                  : currentStep > step.number
                  ? "bg-green-500 text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {currentStep > step.number ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                step.number
              )}
            </div>
            <div className="hidden md:block">
              <div
                className={cn(
                  "font-semibold text-sm",
                  currentStep === step.number
                    ? "text-primary"
                    : currentStep > step.number
                    ? "text-green-600"
                    : "text-muted-foreground"
                )}
              >
                {step.title}
              </div>
              <div className="text-xs text-muted-foreground">
                {step.description}
              </div>
            </div>
            {/* 移动端显示 */}
            <div className="md:hidden">
              <div
                className={cn(
                  "font-semibold text-xs",
                  currentStep === step.number
                    ? "text-primary"
                    : currentStep > step.number
                    ? "text-green-600"
                    : "text-muted-foreground"
                )}
              >
                步骤{step.number}
              </div>
            </div>
          </div>

          {index < steps.length - 1 && (
            <ChevronRight
              className={cn(
                "w-5 h-5 flex-shrink-0",
                currentStep > step.number
                  ? "text-green-500"
                  : "text-muted-foreground"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

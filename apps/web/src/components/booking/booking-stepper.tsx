import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BookingStepperProps {
  currentStep: 1 | 2 | 3 | 4;
  className?: string;
}

const STEPS = [
  { step: 1, label: "Chọn suất" },
  { step: 2, label: "Chọn ghế" },
  { step: 3, label: "Xác nhận" },
  { step: 4, label: "Thanh toán" },
] as const;

export function BookingStepper({ currentStep, className }: Readonly<BookingStepperProps>) {
  const currentStepInfo = STEPS.find((s) => s.step === currentStep) ?? STEPS[0];

  return (
    <nav
      aria-label={`Tiến trình đặt vé: Bước ${currentStep} trên 4: ${currentStepInfo.label}`}
      className={cn("w-full py-4", className)}
    >
      <ol className="flex items-center justify-between gap-2 sm:gap-4">
        {STEPS.map((item, index) => {
          const isPassed = item.step < currentStep;
          const isCurrent = item.step === currentStep;
          const isUpcoming = item.step > currentStep;

          return (
            <li
              key={item.step}
              className="flex flex-1 items-center"
              aria-current={isCurrent ? "step" : undefined}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <span
                  className={cn(
                    "flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-pill text-caption font-semibold transition-colors",
                    isCurrent && "bg-brand text-fg-on-brand ring-2 ring-brand ring-offset-2 ring-offset-bg",
                    isPassed && "bg-success-soft text-success",
                    isUpcoming && "bg-surface-control text-fg-muted",
                  )}
                >
                  {isPassed ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <span>{item.step}</span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-caption sm:text-body-sm transition-colors",
                    isCurrent && "font-semibold text-fg",
                    isPassed && "font-medium text-fg-secondary",
                    isUpcoming && "text-fg-muted",
                  )}
                >
                  {item.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  aria-hidden="true"
                  className={cn(
                    "ml-2 sm:ml-4 h-0.5 flex-1 transition-colors",
                    item.step < currentStep ? "bg-success-line" : "bg-border-subtle",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

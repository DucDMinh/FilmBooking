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

/** 4 đoạn thanh 3px: đã qua = success, hiện tại = brand, chưa tới = border; overline hud "BƯỚC n / 4". */
export function BookingStepper({ currentStep, className }: Readonly<BookingStepperProps>) {
  const currentStepInfo = STEPS.find((s) => s.step === currentStep) ?? STEPS[0];

  return (
    <nav
      aria-label={`Tiến trình đặt vé: Bước ${currentStep} trên 4: ${currentStepInfo.label}`}
      className={cn("w-full py-4", className)}
    >
      <p className="hud hud-brand mb-2" aria-hidden="true">
        Bước {currentStep} / 4
      </p>
      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((item) => {
          const isPassed = item.step < currentStep;
          const isCurrent = item.step === currentStep;
          const isUpcoming = item.step > currentStep;

          return (
            <li key={item.step} className="flex min-w-0 flex-col gap-2" aria-current={isCurrent ? "step" : undefined}>
              <div
                aria-hidden="true"
                className={cn(
                  "h-[3px] w-full transition-colors",
                  isPassed && "bg-success",
                  isCurrent && "bg-brand",
                  isUpcoming && "bg-border",
                )}
              />
              <span
                className={cn(
                  "flex items-center gap-1 truncate font-heading text-caption uppercase tracking-wide transition-colors sm:text-body-sm",
                  isCurrent && "font-bold text-fg",
                  isPassed && "text-fg-secondary",
                  isUpcoming && "text-fg-muted",
                )}
              >
                {isPassed ? <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" /> : null}
                <span className="truncate">{item.label}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

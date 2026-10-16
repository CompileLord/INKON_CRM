import { useTranslation } from "react-i18next";

interface PeriodStepperProps {
  graded: number;
  total: number;
}

const MAXIMUM_DOTS: number = 12;

export function PeriodStepper({ graded, total }: PeriodStepperProps) {
  const { t } = useTranslation("student");
  const label: string = t("periodsCount", { graded, total });

  return (
    <div className="flex items-center gap-2" data-testid="period-stepper">
      {total > 0 && total <= MAXIMUM_DOTS && (
        <span aria-hidden="true" className="flex items-center gap-1">
          {Array.from({ length: total }, (_, index) => (
            <span
              key={index}
              data-filled={index < graded}
              className={`h-2 w-2 rounded-full ${index < graded ? "bg-maroon dark:bg-accent" : "bg-border-warm"}`}
            />
          ))}
        </span>
      )}
      <span className="text-xs tabular-nums text-muted">{label}</span>
    </div>
  );
}

import { ChevronLeft, ChevronRight } from "lucide-react";

interface ChartStepperProps {
  label: string;
  previousLabel: string;
  nextLabel: string;
  previousDisabled: boolean;
  nextDisabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
  testId: string;
}

const STEP_BUTTON_CLASS: string =
  "inline-flex size-8 items-center justify-center rounded-[10px] border border-border bg-card text-ink transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-strip active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ChartStepper({ label, previousLabel, nextLabel, previousDisabled, nextDisabled, onPrevious, onNext, testId }: ChartStepperProps) {
  return (
    <div data-testid={testId} className="flex items-center gap-2">
      <button type="button" aria-label={previousLabel} disabled={previousDisabled} onClick={onPrevious} className={STEP_BUTTON_CLASS}>
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <span aria-live="polite" className="min-w-0 text-center text-sm tabular-nums text-muted">{label}</span>
      <button type="button" aria-label={nextLabel} disabled={nextDisabled} onClick={onNext} className={STEP_BUTTON_CLASS}>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

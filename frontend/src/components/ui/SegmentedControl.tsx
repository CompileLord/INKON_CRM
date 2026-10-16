import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: ReactNode;
  title?: string;
}

interface SegmentedControlProps {
  ariaLabel: string;
  options: readonly SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
}

export function SegmentedControl({ ariaLabel, options, value, onChange }: SegmentedControlProps) {
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const moveSelection = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last: number = options.length - 1;
    const target: number | null =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (target === null) return;
    event.preventDefault();
    onChange(options[target].value);
    optionRefs.current[target]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex max-w-full rounded-[10px] border border-control-border bg-strip p-1">
      {options.map((option, index) => {
        const selected: boolean = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => { optionRefs.current[index] = element; }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            title={option.title}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => moveSelection(event, index)}
            className={[
              "inline-flex min-h-11 min-w-11 flex-1 items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-medium",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "motion-safe:transition-[background-color,color,box-shadow,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]",
              selected ? "bg-card text-ink shadow-xs" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

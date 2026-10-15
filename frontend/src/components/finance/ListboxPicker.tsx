import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { Check, ChevronDown } from "lucide-react";

export interface ListboxOption {
  value: string;
  label: string;
  muted?: boolean;
  title?: string;
}

interface ListboxPickerProps {
  label: string;
  icon: ReactNode;
  options: readonly ListboxOption[];
  value: string;
  onChange: (value: string) => void;
  layout?: "chip" | "field";
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

const CHIP_TRIGGER_CLASSES: string =
  "inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-control-border bg-card px-3 text-sm text-ink hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]";
const FIELD_TRIGGER_CLASSES: string =
  "flex min-h-12 w-full items-center gap-2 rounded-[10px] border bg-card px-3 py-2 text-left text-base text-ink hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-strip disabled:text-muted motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]";

export function ListboxPicker({ label, icon, options, value, onChange, layout = "chip", placeholder, id, disabled = false, invalid = false, describedBy }: ListboxPickerProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isField: boolean = layout === "field";
  const selected: ListboxOption | undefined = options.find((option) => option.value === value) ?? (placeholder === undefined ? options[0] : undefined);

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current: number = optionRefs.current.findIndex((element) => element === document.activeElement);
    const last: number = options.length - 1;
    const target: number | null =
      event.key === "ArrowDown" ? Math.min(last, current + 1)
      : event.key === "ArrowUp" ? Math.max(0, current - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (target === null) return;
    event.preventDefault();
    optionRefs.current[target]?.focus();
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={isField ? `${FIELD_TRIGGER_CLASSES} ${invalid ? "border-destructive" : "border-control-border"}` : CHIP_TRIGGER_CLASSES}
      >
        <span className="shrink-0 text-muted" aria-hidden="true">{icon}</span>
        {isField ? (
          <span title={selected?.title} className={`min-w-0 flex-1 break-words ${selected && !selected.muted ? "" : "text-muted"}`}>{selected?.label ?? placeholder}</span>
        ) : (
          <>
            <span className="text-label">{label}</span>
            <span className="font-medium tabular-nums">{selected?.label}</span>
          </>
        )}
        <ChevronDown size={14} aria-hidden="true" className="shrink-0 text-muted" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={16} className="z-70">
          <Popover.Popup
            initialFocus={() => optionRefs.current[Math.max(0, options.findIndex((option) => option.value === selected?.value))]}
            className={`${isField ? "w-[var(--anchor-width)] max-w-[calc(100vw-32px)]" : "w-[min(16rem,calc(100vw-32px))]"} origin-[var(--transform-origin)] rounded-2xl border border-border-warm bg-card p-1 shadow-lg transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none motion-safe:transition-[opacity,transform] data-[starting-style]:opacity-0 motion-safe:data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:duration-100 motion-safe:data-[ending-style]:scale-[0.96]`}
          >
            <div role="listbox" aria-label={label} onKeyDown={moveFocus}>
              {options.map((option, index) => {
                const isSelected: boolean = option.value === selected?.value;
                return (
                  <button
                    key={option.value}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    type="button"
                    title={option.title}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[10px] px-3 text-left text-sm text-ink hover:bg-row-hover focus-visible:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className={`${isField ? "min-w-0 break-words" : "tabular-nums"} ${option.muted ? "text-muted" : ""}`}>{option.label}</span>
                    {isSelected && <Check size={16} aria-hidden="true" className="text-maroon" />}
                  </button>
                );
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

import { useRef, useState, type KeyboardEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/formatters";

interface PageSizeListboxProps {
  options: readonly number[];
  value: number;
  onChange: (value: number) => void;
}

export function PageSizeListbox({ options, value, onChange }: PageSizeListboxProps) {
  const { t, i18n } = useTranslation("students");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const label: string = t("table.rowsPerPage");

  const formatOption = (size: number): string => t("table.perPage", { size: formatNumber(size, i18n.language) });

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
        aria-haspopup="listbox"
        aria-label={`${label}: ${formatOption(value)}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-sm text-muted tabular-nums hover:bg-strip hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        <span>{formatOption(value)}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={6} collisionPadding={16} className="z-70">
          <Popover.Popup
            initialFocus={() => optionRefs.current[Math.max(0, options.indexOf(value))]}
            className="w-[min(14rem,calc(100vw-32px))] origin-[var(--transform-origin)] rounded-2xl border border-border-warm bg-card p-1 shadow-lg transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none motion-safe:transition-[opacity,transform] data-[starting-style]:opacity-0 motion-safe:data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:duration-100 motion-safe:data-[ending-style]:scale-[0.96]"
          >
            <div role="listbox" aria-label={label} onKeyDown={moveFocus}>
              {options.map((size, index) => {
                const isSelected: boolean = size === value;
                return (
                  <button
                    key={size}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(size);
                      setIsOpen(false);
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[10px] px-3 text-left text-sm text-ink hover:bg-row-hover focus-visible:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="tabular-nums">{formatOption(size)}</span>
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

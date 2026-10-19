import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { JournalAnchoredOverlay } from "./JournalAnchoredOverlay";

class PickerWidths {
  static readonly FINE_POINTER_PX: number = 236;
  static readonly COARSE_POINTER_PX: number = 300;

  static forPointer(): number {
    const isCoarse: boolean = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches === true;
    return isCoarse ? PickerWidths.COARSE_POINTER_PX : PickerWidths.FINE_POINTER_PX;
  }
}

export type ScorePickerCloseReason = "escape" | "outside" | "choose";

const SCORE_OPTIONS: readonly number[] = [1, 2, 3, 4, 5];

interface JournalScoreChoicesProps {
  ariaLabel: string;
  score: number;
  size: "compact" | "touch";
  focusOnMount: boolean;
  onChoose: (score: number) => void;
  onClear: () => void;
  onEscape: () => void;
}

export const JournalScoreChoices: React.FC<JournalScoreChoicesProps> = ({
  ariaLabel,
  score,
  size,
  focusOnMount,
  onChoose,
  onClear,
  onEscape,
}) => {
  const { t } = useTranslation("journals");
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (focusOnMount) optionRefs.current[Math.max(score - 1, 0)]?.focus();
  }, [focusOnMount, score]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const currentIndex: number = optionRefs.current.findIndex((node) => node === document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      onClear();
      return;
    }
    if (event.key.length === 1 && event.key >= "1" && event.key <= "5") {
      event.preventDefault();
      onChoose(Number(event.key));
      return;
    }
    if (currentIndex === -1) return;
    const lastIndex: number = SCORE_OPTIONS.length - 1;
    let nextIndex: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = Math.min(currentIndex + 1, lastIndex);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = Math.max(currentIndex - 1, 0);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = lastIndex;
    else return;
    event.preventDefault();
    event.stopPropagation();
    optionRefs.current[nextIndex]?.focus();
  };

  const sizeClass: string = size === "touch" ? "h-11 min-w-11 text-base" : "h-8 min-w-8 text-sm pointer-coarse:h-11 pointer-coarse:min-w-11";

  return (
    <div role="menu" aria-label={ariaLabel} onKeyDown={handleKeyDown} className="flex items-center gap-1">
      <div className="flex gap-0.5 rounded-full bg-strip p-0.5">
        {SCORE_OPTIONS.map((option, index) => {
          const isSelected: boolean = score === option;
          return (
            <button
              key={option}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={isSelected}
              onClick={() => onChoose(option)}
              className={`flex shrink-0 items-center justify-center rounded-full font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] ${sizeClass} ${
                isSelected ? "bg-maroon text-on-primary" : "text-ink hover:bg-row-hover"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        role="menuitem"
        data-control="clear-score"
        onClick={onClear}
        className="flex h-8 shrink-0 items-center justify-center rounded-full px-2 text-xs font-medium text-muted hover:bg-row-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11 motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        {t("picker.clear")}
      </button>
    </div>
  );
};

interface JournalScorePickerProps {
  studentName: string;
  formattedDate: string;
  score: number;
  anchorRef: React.RefObject<HTMLElement | null>;
  onChoose: (score: number) => void;
  onClose: (reason: ScorePickerCloseReason) => void;
}

export const JournalScorePicker: React.FC<JournalScorePickerProps> = ({
  studentName,
  formattedDate,
  score,
  anchorRef,
  onChoose,
  onClose,
}) => {
  const { t } = useTranslation("journals");
  return (
    <JournalAnchoredOverlay
      anchorRef={anchorRef}
      width={PickerWidths.forPointer()}
      role="none"
      className="p-1"
      onClose={(reason) => onClose(reason)}
    >
      <JournalScoreChoices
        ariaLabel={t("picker.title", { name: studentName, date: formattedDate })}
        score={score}
        size="compact"
        focusOnMount
        onChoose={(chosen) => {
          onChoose(chosen);
          onClose("choose");
        }}
        onClear={() => {
          onChoose(0);
          onClose("choose");
        }}
        onEscape={() => onClose("escape")}
      />
    </JournalAnchoredOverlay>
  );
};

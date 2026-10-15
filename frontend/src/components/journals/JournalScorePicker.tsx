import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { JournalAnchoredOverlay } from "./JournalAnchoredOverlay";

export type ScorePickerCloseReason = "escape" | "outside" | "choose";

const SCORE_OPTIONS: readonly number[] = [0, 1, 2, 3, 4, 5];

interface JournalScoreChoicesProps {
  ariaLabel: string;
  score: number;
  size: "compact" | "touch";
  focusOnMount: boolean;
  onChoose: (score: number) => void;
  onEscape: () => void;
}

export const JournalScoreChoices: React.FC<JournalScoreChoicesProps> = ({
  ariaLabel,
  score,
  size,
  focusOnMount,
  onChoose,
  onEscape,
}) => {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (focusOnMount) optionRefs.current[score]?.focus();
  }, [focusOnMount, score]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const currentIndex: number = optionRefs.current.findIndex((node) => node === document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key.length === 1 && event.key >= "0" && event.key <= "5") {
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

  const sizeClass: string = size === "touch" ? "h-11 w-11 text-base" : "h-9 w-9 text-sm";

  return (
    <div role="menu" aria-label={ariaLabel} onKeyDown={handleKeyDown} className="flex gap-1">
      {SCORE_OPTIONS.map((option, index) => (
        <button
          key={option}
          ref={(node) => {
            optionRefs.current[index] = node;
          }}
          type="button"
          role="menuitemradio"
          aria-checked={score > 0 && score === option}
          onClick={() => onChoose(option)}
          className={`flex shrink-0 items-center justify-center rounded-[10px] border font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${sizeClass} ${
            score > 0 && score === option
              ? "border-maroon bg-maroon text-on-primary"
              : "border-control-border bg-card text-ink hover:bg-beige"
          }`}
        >
          {option}
        </button>
      ))}
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
      width={6 * 36 + 5 * 4 + 8}
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
        onEscape={() => onClose("escape")}
      />
    </JournalAnchoredOverlay>
  );
};

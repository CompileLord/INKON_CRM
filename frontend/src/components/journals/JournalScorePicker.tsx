import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { JournalAnchoredOverlay } from "./JournalAnchoredOverlay";
import { useDesktop } from "../shell/useDesktop";

export type ScorePickerCloseReason = "escape" | "outside" | "close" | "choose";

interface JournalScorePickerProps {
  studentName: string;
  formattedDate: string;
  score: number;
  attended: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onChoose: (score: number) => void;
  onClose: (reason: ScorePickerCloseReason) => void;
}

const SCORE_OPTIONS: readonly number[] = [0, 1, 2, 3, 4, 5];
const COLUMN_COUNT = 3;
const PICKER_WIDTH_PX = 320;

export const JournalScorePicker: React.FC<JournalScorePickerProps> = (props) => {
  const isDesktop: boolean = useDesktop();
  const selectedOptionRef = useRef<HTMLButtonElement>(null);

  if (isDesktop) {
    return (
      <JournalAnchoredOverlay
        anchorRef={props.anchorRef}
        width={PICKER_WIDTH_PX}
        role="none"
        initialFocusRef={selectedOptionRef}
        onClose={(reason) => props.onClose(reason)}
      >
        <PickerBody {...props} selectedOptionRef={selectedOptionRef} />
      </JournalAnchoredOverlay>
    );
  }

  return createPortal(
    <PhoneFrame onClose={props.onClose} selectedOptionRef={selectedOptionRef}>
      <PickerBody {...props} selectedOptionRef={selectedOptionRef} />
    </PhoneFrame>,
    document.body,
  );
};

interface PhoneFrameProps {
  onClose: (reason: ScorePickerCloseReason) => void;
  selectedOptionRef: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}

const PhoneFrame: React.FC<PhoneFrameProps> = ({ onClose, selectedOptionRef, children }) => {
  useEffect(() => {
    selectedOptionRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose("escape");
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, selectedOptionRef]);

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center bg-scrim p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose("outside");
      }}
    >
      <div
        style={{ width: `min(${PICKER_WIDTH_PX}px, calc(100vw - 32px))` }}
        className="max-h-[calc(100dvh-32px)] overflow-y-auto rounded-2xl border border-border bg-card text-ink shadow-lg"
      >
        {children}
      </div>
    </div>
  );
};

interface PickerBodyProps extends JournalScorePickerProps {
  selectedOptionRef: React.RefObject<HTMLButtonElement | null>;
}

const PickerBody: React.FC<PickerBodyProps> = ({
  studentName,
  formattedDate,
  score,
  attended,
  onChoose,
  onClose,
  selectedOptionRef,
}) => {
  const { t } = useTranslation(["journals", "common"]);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const currentIndex: number = optionRefs.current.findIndex((node) => node === document.activeElement);
    if (currentIndex === -1) return;
    const lastIndex: number = SCORE_OPTIONS.length - 1;
    let nextIndex: number;
    if (event.key === "ArrowRight") nextIndex = Math.min(currentIndex + 1, lastIndex);
    else if (event.key === "ArrowLeft") nextIndex = Math.max(currentIndex - 1, 0);
    else if (event.key === "ArrowDown") nextIndex = Math.min(currentIndex + COLUMN_COUNT, lastIndex);
    else if (event.key === "ArrowUp") nextIndex = Math.max(currentIndex - COLUMN_COUNT, 0);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = lastIndex;
    else return;
    event.preventDefault();
    event.stopPropagation();
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div role="dialog" aria-label={t("picker.title", { name: studentName, date: formattedDate })} className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-base font-semibold">{studentName}</p>
          <p className="text-sm tabular-nums text-muted">{formattedDate}</p>
          <p className="mt-1 text-sm">
            {t("picker.current", { value: score > 0 ? score : t("picker.none") })}
            {" · "}
            <span className="font-medium">{attended ? t("picker.present") : t("picker.absent")}</span>
          </p>
        </div>
        <button
          type="button"
          aria-label={t("common:close")}
          onClick={() => onClose("close")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div
        role="menu"
        aria-label={t("picker.choices")}
        onKeyDown={moveFocus}
        className="mt-3 grid grid-cols-3 gap-2"
      >
        {SCORE_OPTIONS.map((option, index) => (
          <button
            key={option}
            ref={(node) => {
              optionRefs.current[index] = node;
              if (option === score) selectedOptionRef.current = node;
            }}
            type="button"
            role="menuitemradio"
            aria-checked={score > 0 && score === option}
            onClick={() => {
              onChoose(option);
              onClose("choose");
            }}
            className={`flex h-11 min-w-11 items-center justify-center rounded-[10px] border text-base font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              score > 0 && score === option
                ? "border-maroon bg-maroon text-on-primary"
                : "border-control-border bg-card text-ink hover:bg-beige"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">{t("picker.hint")}</p>
    </div>
  );
};

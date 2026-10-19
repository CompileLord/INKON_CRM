import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { formatNumber, formatSchoolLessonDate } from "../../i18n/formatters";
import {
  JournalPeriodSettingsRules,
  type ExamMaximumVerdict,
  type PeriodSettingsFailure,
} from "../../lib/journals/JournalPeriodSettingsRules";
import type { JournalDrainResult } from "../../lib/journals/journalQueueTypes";

type SavePhase =
  | { kind: "idle" }
  | { kind: "draining" }
  | { kind: "blocked"; result: Exclude<JournalDrainResult, { kind: "acknowledged" }> }
  | { kind: "saving" }
  | { kind: "failed"; failure: PeriodSettingsFailure };

interface JournalPeriodSettingsDialogProps {
  open: boolean;
  suspended: boolean;
  courseTitle: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  currentMaximum: number;
  currentBonusMaximum: number;
  highestExamScore: number | null;
  highestBonusScore: number | null;
  drain: () => Promise<JournalDrainResult>;
  submit: (examMaximum: number, bonusMaximum: number) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onReview: () => void;
  onClose: () => void;
  returnFocusSelector: string;
}

const IDLE_PHASE: SavePhase = { kind: "idle" };

export const JournalPeriodSettingsDialog: React.FC<JournalPeriodSettingsDialogProps> = ({
  open,
  suspended,
  courseTitle,
  periodLabel,
  periodStart,
  periodEnd,
  currentMaximum,
  currentBonusMaximum,
  highestExamScore,
  highestBonusScore,
  drain,
  submit,
  onBusyChange,
  onReview,
  onClose,
  returnFocusSelector,
}) => {
  const { t } = useTranslation(["journalPeriodSettings", "journals", "common"]);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestInFlightRef = useRef<boolean>(false);
  const [wasOpen, setWasOpen] = useState<boolean>(open);
  const [editedText, setEditedText] = useState<string | null>(null);
  const [editedBonusText, setEditedBonusText] = useState<string | null>(null);
  const [phase, setPhase] = useState<SavePhase>(IDLE_PHASE);
  const [confirmingDiscard, setConfirmingDiscard] = useState<boolean>(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEditedText(null);
      setEditedBonusText(null);
      setPhase(IDLE_PHASE);
      setConfirmingDiscard(false);
    }
  }

  const rangeValues = {
    min: JournalPeriodSettingsRules.MINIMUM_EXAM_MAXIMUM,
    max: JournalPeriodSettingsRules.MAXIMUM_EXAM_MAXIMUM,
  };
  const text: string = editedText ?? String(currentMaximum);
  const verdict: ExamMaximumVerdict = JournalPeriodSettingsRules.judgeInput(text);
  const bonusText: string = editedBonusText ?? String(currentBonusMaximum);
  const bonusVerdict: ExamMaximumVerdict = JournalPeriodSettingsRules.judgeInput(bonusText);
  const isDirty: boolean = text !== String(currentMaximum) || bonusText !== String(currentBonusMaximum);
  const isPending: boolean = phase.kind === "draining" || phase.kind === "saving";
  const canSave: boolean = verdict.valid && bonusVerdict.valid && isDirty && !isPending;
  const inputMessage: string | null =
    !verdict.valid && editedText !== null ? t(`journalPeriodSettings:invalid.${verdict.reason}`, rangeValues) : null;
  const bonusInputMessage: string | null =
    !bonusVerdict.valid && editedBonusText !== null
      ? t(bonusVerdict.reason === "outOfRange" ? "journalPeriodSettings:invalid.bonusOutOfRange" : `journalPeriodSettings:invalid.${bonusVerdict.reason}`, rangeValues)
      : null;

  const requestDismiss = (): void => {
    if (isPending) return;
    if (!isDirty) {
      onClose();
      return;
    }
    setConfirmingDiscard(true);
  };

  const save = async (): Promise<void> => {
    if (!verdict.valid || !bonusVerdict.valid || !canSave || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    onBusyChange(true);
    setPhase({ kind: "draining" });
    try {
      const drainResult: JournalDrainResult = await drain();
      if (drainResult.kind !== "acknowledged") {
        setPhase({ kind: "blocked", result: drainResult });
        return;
      }
      setPhase({ kind: "saving" });
      try {
        await submit(verdict.value, bonusVerdict.value);
        setPhase(IDLE_PHASE);
        onClose();
      } catch (error: unknown) {
        setPhase({
          kind: "failed",
          failure: JournalPeriodSettingsRules.classifyFailure(
            error,
            verdict.value,
            highestExamScore,
            bonusVerdict.value,
            highestBonusScore,
          ),
        });
      }
    } finally {
      requestInFlightRef.current = false;
      onBusyChange(false);
    }
  };

  const reviewConflicts = (): void => {
    setPhase(IDLE_PHASE);
    onReview();
  };

  const alertMessage: string | null = (() => {
    if (phase.kind === "blocked") {
      return phase.result.kind === "conflict"
        ? t("journalPeriodSettings:blocked.conflict")
        : phase.result.kind === "unavailable"
          ? t("journalPeriodSettings:blocked.unavailable")
          : t("journalPeriodSettings:blocked.failed");
    }
    if (phase.kind === "failed") {
      const failure: PeriodSettingsFailure = phase.failure;
      return t(`journalPeriodSettings:errors.${failure.kind}`, {
        ...rangeValues,
        requested: failure.kind === "belowExistingBonus" ? bonusText : verdict.valid ? verdict.value : text,
        score:
          failure.kind === "belowExistingScore"
            ? formatNumber(failure.highestExamScore)
            : failure.kind === "belowExistingBonus"
              ? formatNumber(failure.highestBonusScore)
              : "",
      });
    }
    return null;
  })();

  const blockedByConflict: boolean = phase.kind === "blocked" && phase.result.kind === "conflict";

  const footer = confirmingDiscard ? (
    <div role="alert" className="flex flex-col gap-3">
      <p className="text-sm text-ink">{t("journalPeriodSettings:discardPrompt")}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setConfirmingDiscard(false)}>
          {t("journalPeriodSettings:continueEditing")}
        </Button>
        <Button type="button" variant="destructive" onClick={onClose}>
          {t("journalPeriodSettings:discard")}
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="secondary" onClick={requestDismiss} disabled={isPending}>
        {t("common:cancel")}
      </Button>
      {blockedByConflict ? (
        <Button type="button" onClick={reviewConflicts}>
          {t("journals:drain.review")}
        </Button>
      ) : phase.kind === "blocked" ? (
        <Button type="button" onClick={() => void save()}>
          {t("journals:drain.retry")}
        </Button>
      ) : (
        <Button type="submit" form="journal-period-settings-form" disabled={!canSave} loading={isPending}>
          {phase.kind === "draining" ? t("journalPeriodSettings:checking") : isPending ? t("journalPeriodSettings:saving") : t("journalPeriodSettings:save")}
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      open={open && !suspended}
      onClose={requestDismiss}
      closeDisabled={isPending}
      title={t("journalPeriodSettings:title")}
      maxWidthClassName="max-w-[480px]"
      initialFocus={inputRef}
      finalFocus={() => document.querySelector<HTMLElement>(returnFocusSelector)}
      footer={footer}
    >
      <form
        id="journal-period-settings-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="flex flex-col gap-4"
      >
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">{t("journalPeriodSettings:course")}</dt>
          <dd className="min-w-0 break-words font-medium text-ink">{courseTitle}</dd>
          <dt className="text-muted">{t("journalPeriodSettings:period")}</dt>
          <dd className="min-w-0 break-words font-medium text-ink">
            {periodLabel}
            <span className="block font-normal tabular-nums text-muted">
              {formatSchoolLessonDate(periodStart)} – {formatSchoolLessonDate(periodEnd)}
            </span>
          </dd>
          <dt className="text-muted">{t("journalPeriodSettings:currentMaximum")}</dt>
          <dd className="font-medium tabular-nums text-ink">{formatNumber(currentMaximum)}</dd>
        </dl>
        <p className="text-sm text-ink">{t("journalPeriodSettings:explanation")}</p>
        {highestExamScore !== null && (
          <p className="text-sm tabular-nums text-muted">
            {t("journalPeriodSettings:highestScore", { score: formatNumber(highestExamScore) })}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="journal-period-settings-input" className="text-sm font-medium text-ink">
            {t("journalPeriodSettings:inputLabel")}
          </label>
          <input
            id="journal-period-settings-input"
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={text}
            readOnly={isPending}
            onChange={(event) => {
              setEditedText(event.target.value);
              if (phase.kind === "failed") setPhase(IDLE_PHASE);
            }}
            aria-invalid={inputMessage !== null}
            aria-describedby="journal-period-settings-hint"
            className={`h-12 w-full rounded-[10px] border bg-card px-3 text-base tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-ring ${
              inputMessage !== null ? "border-destructive" : "border-control-border"
            }`}
          />
          <p
            id="journal-period-settings-hint"
            role={inputMessage !== null ? "alert" : undefined}
            className={`text-sm ${inputMessage !== null ? "font-medium text-destructive" : "text-muted"}`}
          >
            {inputMessage ?? t("journalPeriodSettings:range", rangeValues)}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="journal-period-settings-bonus-input" className="text-sm font-medium text-ink">
            {t("journalPeriodSettings:bonusInputLabel")}
          </label>
          <input
            id="journal-period-settings-bonus-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={bonusText}
            readOnly={isPending}
            onChange={(event) => {
              setEditedBonusText(event.target.value);
              if (phase.kind === "failed") setPhase(IDLE_PHASE);
            }}
            aria-invalid={bonusInputMessage !== null}
            aria-describedby="journal-period-settings-bonus-hint"
            className={`h-12 w-full rounded-[10px] border bg-card px-3 text-base tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-ring ${
              bonusInputMessage !== null ? "border-destructive" : "border-control-border"
            }`}
          />
          <p
            id="journal-period-settings-bonus-hint"
            role={bonusInputMessage !== null ? "alert" : undefined}
            className={`text-sm ${bonusInputMessage !== null ? "font-medium text-destructive" : "text-muted"}`}
          >
            {bonusInputMessage ??
              (highestBonusScore !== null
                ? t("journalPeriodSettings:highestBonus", { score: formatNumber(highestBonusScore) })
                : t("journalPeriodSettings:range", rangeValues))}
          </p>
        </div>
        {alertMessage !== null && (
          <p
            role="alert"
            data-testid="period-settings-alert"
            className="rounded-[10px] border border-destructive/40 bg-danger-surface p-3 text-sm text-destructive"
          >
            {alertMessage}
          </p>
        )}
        {isPending && (
          <p role="status" className="text-sm text-muted">
            {phase.kind === "draining" ? t("journalPeriodSettings:checking") : t("journalPeriodSettings:saving")}
          </p>
        )}
      </form>
    </Modal>
  );
};

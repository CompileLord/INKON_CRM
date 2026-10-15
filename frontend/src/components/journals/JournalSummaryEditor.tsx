import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { formatNumber } from "../../i18n/formatters";
import { JournalSummaryCommands, type SummaryInputVerdict } from "../../lib/journals/journalCommands";

export interface SummaryPairValues {
  bonus_score: number;
  exam_score: number;
}

interface JournalSummaryEditorProps {
  studentName: string;
  bonusScore: number;
  examScore: number;
  examMaximum: number;
  currentTotal: number;
  maximumTotal: number;
  onApply: (values: SummaryPairValues) => void;
  onClose: () => void;
  returnFocusSelector?: string;
}

interface EditedTexts {
  bonus?: string;
  exam?: string;
}

export const JournalSummaryEditor: React.FC<JournalSummaryEditorProps> = ({
  studentName,
  bonusScore,
  examScore,
  examMaximum,
  currentTotal,
  maximumTotal,
  onApply,
  onClose,
  returnFocusSelector,
}) => {
  const { t } = useTranslation("journals");
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [edited, setEdited] = useState<EditedTexts>({});
  const [confirmingDiscard, setConfirmingDiscard] = useState<boolean>(false);
  const [applied, setApplied] = useState<boolean>(false);

  const bonusText: string = edited.bonus ?? String(bonusScore);
  const examText: string = edited.exam ?? String(examScore);
  const verdict = JournalSummaryCommands.judgePair(bonusText, examText, examMaximum);
  const isDirty: boolean = bonusText !== String(bonusScore) || examText !== String(examScore);
  const canApply: boolean = verdict.isValid && isDirty && !applied;

  const requestDismiss = (): void => {
    if (!isDirty) {
      onClose();
      return;
    }
    setConfirmingDiscard(true);
  };

  const apply = (): void => {
    if (!canApply || !verdict.bonus.valid || !verdict.exam.valid) return;
    setApplied(true);
    onApply({ bonus_score: verdict.bonus.value, exam_score: verdict.exam.value });
    onClose();
  };

  const messageFor = (fieldVerdict: SummaryInputVerdict, touched: boolean): string | null => {
    if (fieldVerdict.valid || !touched) return null;
    if (fieldVerdict.reason === "aboveMaximum") return t("table.summaryInvalid.aboveMaximum", { n: fieldVerdict.maximum });
    return t("table.summaryInvalid.wholeNumber");
  };

  const renderField = (
    field: "bonus" | "exam",
    label: string,
    text: string,
    fieldVerdict: SummaryInputVerdict,
    maximum: number,
  ) => {
    const message: string | null = messageFor(fieldVerdict, edited[field] !== undefined);
    const inputId: string = `journal-summary-${field}`;
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
        </label>
        <input
          id={inputId}
          ref={field === "bonus" ? firstFieldRef : undefined}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(event) => setEdited((previous) => ({ ...previous, [field]: event.target.value }))}
          aria-invalid={message !== null}
          aria-describedby={`${inputId}-hint`}
          className={`h-12 w-full rounded-[10px] border bg-card px-3 text-base tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-ring ${
            message !== null ? "border-destructive" : "border-control-border"
          }`}
        />
        <p id={`${inputId}-hint`} className={`text-sm ${message !== null ? "font-medium text-destructive" : "text-muted"}`} role={message !== null ? "alert" : undefined}>
          {message ?? t("summaryEditor.range", { max: maximum })}
        </p>
      </div>
    );
  };

  const footer = confirmingDiscard ? (
    <div role="alert" className="flex flex-col gap-3">
      <p className="text-sm text-ink">{t("summaryEditor.discardPrompt")}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setConfirmingDiscard(false)}>
          {t("summaryEditor.continueEditing")}
        </Button>
        <Button type="button" variant="destructive" onClick={onClose}>
          {t("summaryEditor.discard")}
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="secondary" onClick={onClose}>
        {t("table.commentCancel")}
      </Button>
      <Button type="submit" form="journal-summary-form" disabled={!canApply}>
        {t("summaryEditor.apply")}
      </Button>
    </div>
  );

  return (
    <Modal
      open
      onClose={requestDismiss}
      title={t("summaryEditor.title", { name: studentName })}
      maxWidthClassName="max-w-[480px]"
      initialFocus={firstFieldRef}
      finalFocus={returnFocusSelector ? () => document.querySelector<HTMLElement>(returnFocusSelector) : undefined}
      footer={footer}
    >
      <form
        id="journal-summary-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-sm tabular-nums text-muted">
          {t("summaryEditor.currentTotal", { sum: formatNumber(currentTotal), max: formatNumber(maximumTotal) })}
        </p>
        {renderField("bonus", t("table.bonus"), bonusText, verdict.bonus, JournalSummaryCommands.MAXIMUM_BONUS_SCORE)}
        {renderField("exam", t("table.exam"), examText, verdict.exam, examMaximum)}
        <p className="text-xs text-muted">{t("summaryEditor.pairNote")}</p>
      </form>
    </Modal>
  );
};

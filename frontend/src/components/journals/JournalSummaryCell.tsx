import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { JournalSummaryCommands, type JournalSummaryField, type SummaryInputVerdict } from "../../lib/journals/journalCommands";

interface JournalSummaryCellProps {
  studentName: string;
  field: JournalSummaryField;
  value: number;
  examMaximum: number;
  bonusMaximum?: number;
  rejected?: boolean;
  editable: boolean;
  onCommit: (value: number) => void;
}

export const JournalSummaryCell: React.FC<JournalSummaryCellProps> = ({
  studentName,
  field,
  value,
  examMaximum,
  bonusMaximum,
  rejected = false,
  editable,
  onCommit,
}) => {
  const { t } = useTranslation("journals");
  const [draft, setDraft] = useState<string | null>(null);
  const label: string = t(field === "exam_score" ? "table.examCellLabel" : "table.bonusCellLabel", { name: studentName });

  if (!editable) {
    return (
      <span aria-label={label} className="tabular-nums text-ink">
        {value}
      </span>
    );
  }

  const invalidMessage = (failed: SummaryInputVerdict): string =>
    !failed.valid && failed.reason === "aboveMaximum"
      ? t("table.summaryInvalid.aboveMaximum", { n: failed.maximum })
      : t("table.summaryInvalid.wholeNumber");

  const text: string = draft ?? String(value);
  const verdict = JournalSummaryCommands.judgeInput(text, field, examMaximum, bonusMaximum);
  const invalid: boolean = (draft !== null && !verdict.valid) || rejected;
  const invalidTitle: string | undefined =
    draft !== null && !verdict.valid ? invalidMessage(verdict) : rejected ? t("table.summaryInvalid.rejected") : undefined;

  const commit = (): void => {
    if (draft === null) return;
    if (verdict.valid && verdict.value !== value) onCommit(verdict.value);
    if (verdict.valid) setDraft(null);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      data-control={field === "exam_score" ? "exam" : "bonus"}
      aria-label={label}
      aria-invalid={invalid}
      title={invalidTitle}
      value={text}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setDraft(null);
        }
      }}
      className={`h-8 w-16 rounded-full border bg-card px-2 text-center text-sm tabular-nums text-ink hover:bg-row-hover focus:outline-none focus:ring-2 focus:ring-ring pointer-coarse:h-11 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${
        invalid ? "border-destructive" : "border-control-border"
      }`}
    />
  );
};

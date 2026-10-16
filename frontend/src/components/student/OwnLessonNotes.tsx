import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, MessageSquare } from "lucide-react";
import { formatSchoolLessonDate, formatSchoolLessonWeekday } from "../../i18n/formatters";
import type { JournalEntryResponse } from "../../lib/journals/types";

interface OwnLessonNotesProps {
  entries: JournalEntryResponse[];
}

const LONG_COMMENT_LENGTH: number = 120;

function LessonNote({ entry }: { entry: JournalEntryResponse }) {
  const { t } = useTranslation("student");
  const [open, setOpen] = useState<boolean>(false);
  const textId: string = useId();
  const comment: string = entry.comment ?? "";
  const isLong: boolean = comment.length > LONG_COMMENT_LENGTH;

  return (
    <li className="flex flex-col gap-1 px-4 py-3" data-testid="own-note">
      <p className="text-xs tabular-nums text-muted">
        {formatSchoolLessonWeekday(entry.lesson_date)} {formatSchoolLessonDate(entry.lesson_date)}
      </p>
      <p id={textId} className={`select-text whitespace-pre-wrap break-words text-sm text-ink ${isLong && !open ? "line-clamp-2" : ""}`}>
        {comment}
      </p>
      {isLong && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={textId}
          onClick={() => setOpen((current) => !current)}
          className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-maroon hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-accent"
        >
          {open ? t("hideComment") : t("showComment")}
          <ChevronDown aria-hidden="true" className={`h-4 w-4 ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </li>
  );
}

export function OwnLessonNotes({ entries }: OwnLessonNotesProps) {
  const { t } = useTranslation("student");
  const commented: JournalEntryResponse[] = entries
    .filter((entry) => entry.comment !== null && entry.comment.trim().length > 0)
    .sort((first, second) => first.lesson_date.localeCompare(second.lesson_date));
  if (commented.length === 0) return null;

  return (
    <section aria-labelledby="own-notes-heading" className="flex flex-col gap-2">
      <h2 id="own-notes-heading" className="flex items-center gap-2 text-lg font-semibold leading-7 text-ink">
        <MessageSquare className="h-5 w-5 text-maroon dark:text-accent" aria-hidden="true" />
        {t("ownNotesTitle")}
      </h2>
      <ul className="divide-y divide-border rounded-2xl border border-border-warm bg-card">
        {commented.map((entry) => (
          <LessonNote key={entry.lesson_date} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

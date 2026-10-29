import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { formatDateTime, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import type { AuditEvent } from "../../lib/audit/api";
import { QUIET_ACTION_CLASSES } from "../finance/quietActionClasses";
import { SlideOver } from "../ui/SlideOver";
import { useHeldWhileClosing } from "../ui/usePresence";
import { AuditCategoryIcon } from "./AuditCategoryIcon";
import { AuditSentence } from "./AuditSentence";
import { useAuditLabels } from "./useAuditLabels";
import { useAuditInspectorRows, type AuditInspectorRow } from "./useAuditInspectorFields";

interface AuditInspectorProps {
  event: AuditEvent | null;
  onClose: () => void;
  onShowRecord: (event: AuditEvent) => void;
  returnFocusTo: () => HTMLElement | null;
}

interface ValueBlockProps {
  heading: string;
  text: string;
  isPlaceholder: boolean;
}

function ValueBlock({ heading, text, isPlaceholder }: ValueBlockProps) {
  return (
    <div className="min-w-0 rounded-[10px] bg-strip p-3">
      <dt className="text-xs font-medium text-label">{heading}</dt>
      <dd className={`mt-1 select-text whitespace-pre-wrap break-words text-base tabular-nums ${isPlaceholder ? "text-muted" : "text-ink"}`}>{text}</dd>
    </div>
  );
}

function InspectorRowValues({ row }: { row: AuditInspectorRow }) {
  const { t } = useTranslation("audit");
  if (row.layout === "single") {
    return (
      <dd className="mt-1 flex select-text flex-col gap-0.5 break-words text-base tabular-nums text-ink">
        {row.lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </dd>
    );
  }
  return (
    <dd className="mt-1">
      <dl className="grid grid-cols-1 gap-2 @[28rem]:grid-cols-2">
        <ValueBlock heading={t("inspector.before")} text={row.before} isPlaceholder={row.beforeIsPlaceholder} />
        <ValueBlock heading={t("inspector.after")} text={row.after} isPlaceholder={row.afterIsPlaceholder} />
      </dl>
    </dd>
  );
}

function InspectorFields({ event }: { event: AuditEvent }) {
  const { t } = useTranslation("audit");
  const rows: AuditInspectorRow[] = useAuditInspectorRows(event);
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="audit-inspector-fields">
      <h3 id="audit-inspector-fields" className="text-sm font-semibold text-ink">
        {t("inspector.fields")}
      </h3>
      <dl className="mt-2 flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.id}>
            <dt className="text-sm font-medium text-ink">{row.label}</dt>
            <InspectorRowValues row={row} />
          </div>
        ))}
      </dl>
    </section>
  );
}

export function AuditInspector({ event: currentEvent, onClose, onShowRecord, returnFocusTo }: AuditInspectorProps) {
  const event: AuditEvent | null = useHeldWhileClosing(currentEvent, currentEvent !== null);
  const { t, i18n } = useTranslation("audit");
  const labels = useAuditLabels();
  const language: string = i18n.language;

  return (
    <SlideOver open={currentEvent !== null} onClose={onClose} title={t("inspector.title")} variant="course" finalFocus={returnFocusTo}>
      {event !== null && (
        <div className="@container flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <AuditCategoryIcon event={event} />
            <p className="min-w-0 break-words text-base text-ink">
              <AuditSentence event={event} />
            </p>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-sm @[28rem]:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-label">{t("inspector.who")}</dt>
              <dd className="mt-0.5 break-words text-ink">{labels.actorName(event)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-label">{t("inspector.when")}</dt>
              <dd className="mt-0.5 text-ink tabular-nums">{formatDateTime(event.created_at, language, SCHOOL_TIMEZONE)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-label">{t("inspector.record")}</dt>
              <dd className="mt-0.5 break-words text-ink">
                {labels.entityLabel(event.entity_type)} · {event.entity_label ?? t("inspector.unknownRecord")}
              </dd>
            </div>
          </dl>
          <InspectorFields event={event} />
          <div className="flex flex-wrap gap-2">
            {event.student_id != null && (
              <Link to={`/students/${event.student_id}`} className={QUIET_ACTION_CLASSES}>
                {t("inspector.openStudent")}
              </Link>
            )}
            {event.course_id != null && (
              <Link to={`/courses/${event.course_id}`} className={QUIET_ACTION_CLASSES}>
                {t("inspector.openCourse")}
              </Link>
            )}
            <button type="button" onClick={() => onShowRecord(event)} className={QUIET_ACTION_CLASSES}>
              <Layers size={16} aria-hidden="true" />
              {t("inspector.showRecord")}
            </button>
          </div>
          <details className="rounded-[10px] border border-border">
            <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {t("inspector.technical")}
            </summary>
            <pre className="select-text overflow-x-auto whitespace-pre-wrap break-words border-t border-border bg-strip p-3 text-xs text-ink">
              {JSON.stringify(event, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </SlideOver>
  );
}

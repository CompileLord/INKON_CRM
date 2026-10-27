import { useTranslation } from "react-i18next";
import { formatExactMoney } from "../../lib/money";
import type { AuditChange, AuditEvent } from "../../lib/audit/api";
import { AuditPresentation, type AuditQueueMarker, type AuditScheduleChange } from "../../lib/audit/auditPresentation";
import { useAuditLabels, type AuditLabels } from "./useAuditLabels";

export type AuditSentenceVariant = { key: string; values: Record<string, string> };

export interface AuditEventText {
  sentence: AuditSentenceVariant;
  details: string | null;
  subtitle: string;
}

type Translate = ReturnType<typeof useTranslation>["t"];

const MAXIMUM_LISTED_DETAILS: number = 3;
const INLINE_DETAIL_ENTITIES: readonly string[] = ["user", "student", "course", "settings", "journal", "journal_entry", "enrollment", "student_telegram_link"];

function entityKeyOf(event: AuditEvent): string {
  if (event.entity_type !== "user") return event.entity_type;
  if (event.student_id != null) return "student";
  if (event.action !== "create") return "user";
  const role: string | null = event.changes.find((change) => change.field_name === "role")?.new_value ?? null;
  return role === "mentor" ? "mentor" : "user";
}

function summarizeChange(t: Translate, labels: AuditLabels, action: string, change: AuditChange): string {
  const field: string = labels.fieldLabel(change.field_name);
  const shape = AuditPresentation.changeShape(change.old_value, change.new_value);
  if (AuditPresentation.isReferenceField(change.field_name)) {
    return t(shape === "set" ? "change.referenceSet" : shape === "cleared" ? "change.referenceCleared" : "change.referenceChanged", { field });
  }
  if (shape === "set" || (action === "create" && shape !== "cleared")) return t("change.created", { field, value: labels.valueText(change.field_name, change.new_value) });
  if (shape === "cleared") return t("change.removed", { field, value: labels.valueText(change.field_name, change.old_value) });
  return t("change.updated", { field, from: labels.valueText(change.field_name, change.old_value), to: labels.valueText(change.field_name, change.new_value) });
}

function summarizeSchedule(t: Translate, labels: AuditLabels, schedule: AuditScheduleChange): string {
  const day: string = labels.weekdayName(schedule.weekday);
  if (schedule.start !== null && schedule.end !== null) {
    const range = (start: string | null, end: string | null): string => `${AuditPresentation.trimTime(start)}–${AuditPresentation.trimTime(end)}`;
    return t("change.scheduleTimes", {
      day,
      from: range(schedule.start.old_value, schedule.end.old_value),
      to: range(schedule.start.new_value, schedule.end.new_value),
    });
  }
  const single: AuditChange = (schedule.start ?? schedule.end) as AuditChange;
  return t(schedule.start !== null ? "change.scheduleStart" : "change.scheduleEnd", {
    day,
    from: AuditPresentation.trimTime(single.old_value),
    to: AuditPresentation.trimTime(single.new_value),
  });
}

export function useAuditEventText(event: AuditEvent): AuditEventText {
  const { t, i18n } = useTranslation("audit");
  const labels = useAuditLabels();
  const actor: string = labels.actorName(event);
  const entity: string = labels.entityLabel(event.entity_type).toLowerCase();
  const valueOf = (field: string): string | null => event.changes.find((change) => change.field_name === field)?.new_value ?? null;
  const rawAmount: string | null = event.amount ?? valueOf("amount") ?? valueOf("allocated");
  const amountText: string | null = rawAmount === null ? null : t("moneyAmount", { amount: formatExactMoney(rawAmount) });
  const { schedules, others } = AuditPresentation.splitScheduleChanges(event.changes);
  const { fieldNames: expandedFieldNames, listed } = AuditPresentation.expandChangedFields(others);
  const fieldNames: string[] = [...expandedFieldNames, ...schedules.map(() => "schedules")];
  const unnamed: string = t("sentence.unnamed");
  const periodYear: string | null = valueOf("year");
  const periodMonth: string | null = valueOf("month");
  const periodName: string | null = periodYear !== null && periodMonth !== null ? `${periodMonth.padStart(2, "0")}.${periodYear}` : null;
  const name: string = event.entity_label ?? (event.entity_type === "accounting_period" ? periodName : null) ?? event.course_title ?? unnamed;
  const queue: AuditQueueMarker | null = AuditPresentation.queueMarker(event.changes);

  const detailEntries: string[] = [
    ...schedules.map((schedule) => summarizeSchedule(t, labels, schedule)),
    ...(listed ? [] : others.map((change) => summarizeChange(t, labels, event.action, change))),
  ];
  const changeSummary: string =
    detailEntries.length > 0 && detailEntries.length <= MAXIMUM_LISTED_DETAILS
      ? detailEntries.join("; ")
      : fieldNames.length <= MAXIMUM_LISTED_DETAILS
        ? t("event.fieldsList", { fields: fieldNames.map((field) => (field === "schedules" ? t("fields.schedules") : labels.fieldLabel(field)).toLowerCase()).join(", ") })
        : t("event.fieldsChanged", { count: fieldNames.length });
  const genericSubtitle: string = [event.course_title !== event.entity_label ? event.course_title : null, event.entity_label, changeSummary]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  const generic: AuditEventText = {
    sentence: { key: labels.sentenceKey(event.action), values: { actor, entity } },
    details: null,
    subtitle: genericSubtitle,
  };

  if (queue !== null && ["initial", "reset"].includes(queue.reason) && i18n.exists(`audit:values.queueChannel.${queue.channel}`)) {
    const channel: string = t(`values.queueChannel.${queue.channel}`);
    return {
      sentence: { key: `statement.queue.${queue.kind === "password" || queue.reason === "reset" ? "reset" : "initial"}`, values: { actor, channel } },
      details: null,
      subtitle: event.entity_label ?? "",
    };
  }

  if (event.entity_type === "payment" && event.entity_label && amountText !== null && event.action === "void") {
    const reason: string | null = valueOf("reason_code");
    return {
      sentence: { key: "statement.payment.void.amount", values: { actor, amount: amountText, name: event.entity_label } },
      details: null,
      subtitle: reason === null ? genericSubtitle : t("event.reason", { reason: labels.valueText("reason_code", reason) }),
    };
  }

  const key: string | null = labels.statementKey(entityKeyOf(event), event.action, fieldNames, amountText !== null, event.entity_label !== null || event.course_title !== null, event.user_id == null);
  if (key === null) return generic;
  const values: Record<string, string> = { actor, name, amount: amountText ?? "", course: event.course_title ?? unnamed };
  const subtitleParts: (string | null)[] = [];
  if (event.entity_type === "payment" && event.action === "create" && amountText !== null) {
    const method: string | null = valueOf("method") === null ? null : labels.valueText("method", valueOf("method"));
    subtitleParts.push(method, event.course_title);
  } else if (event.entity_type === "journal_entry") {
    subtitleParts.push(event.course_title, event.entity_label);
  } else if (event.entity_type !== "course" && event.entity_type !== "enrollment" && event.course_title !== name) {
    subtitleParts.push(event.course_title);
  }
  const details: string | null =
    INLINE_DETAIL_ENTITIES.includes(event.entity_type) &&
    (event.action === "update" || event.entity_type === "journal_entry") &&
    !key.endsWith(`.${fieldNames[0]}`)
      ? changeSummary
      : null;
  const subtitle: string = subtitleParts.filter((part): part is string => Boolean(part)).join(" · ");
  return { sentence: { key, values }, details: details === "" ? null : details, subtitle: subtitle === "" && event.entity_type === "payment" ? genericSubtitle : subtitle };
}

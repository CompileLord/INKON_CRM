import { useTranslation } from "react-i18next";
import { formatTjs } from "../../lib/money";
import type { AuditChange, AuditEvent } from "../../lib/audit/api";
import { AuditPresentation } from "../../lib/audit/auditPresentation";
import { useAuditLabels, type AuditLabels } from "./useAuditLabels";

export type AuditInspectorRow =
  | { id: number; label: string; layout: "single"; lines: string[] }
  | { id: number; label: string; layout: "change"; before: string; after: string; beforeIsPlaceholder: boolean; afterIsPlaceholder: boolean };

const STUDENT_NAMED_ENTITIES: readonly string[] = ["payment", "enrollment", "student", "user"];
const TARGET_ENTRY_PATTERN: RegExp = /'?enrollment_id'?:\s*\d+,\s*'?amount'?:\s*'?"?(-?\d+(?:\.\d+)?)/g;

function isMoneyField(fieldName: string): boolean {
  return fieldName === "price" || fieldName === "amount" || fieldName === "allocated" || fieldName.endsWith("_amount");
}

function parseTargetAmounts(rawValue: string): string[] {
  const amounts: string[] = [];
  for (const match of rawValue.matchAll(TARGET_ENTRY_PATTERN)) amounts.push(match[1]);
  return amounts;
}

function referenceName(event: AuditEvent, fieldName: string, rawValue: string): string | null {
  if (fieldName === "student_id") {
    const matchesStudent: boolean = event.student_id !== null && String(event.student_id) === rawValue;
    return matchesStudent && STUDENT_NAMED_ENTITIES.includes(event.entity_type) ? event.entity_label : null;
  }
  if (fieldName === "course_id") {
    const matchesCourse: boolean = event.course_id !== null && String(event.course_id) === rawValue;
    return matchesCourse ? (event.course_title ?? (event.entity_type === "course" ? event.entity_label : null)) : null;
  }
  return null;
}

function displayValue(event: AuditEvent, labels: AuditLabels, language: string, fieldName: string, rawValue: string | null): string | null {
  if (rawValue === null || rawValue === "") return labels.valueText(fieldName, rawValue);
  if (AuditPresentation.isReferenceField(fieldName)) return referenceName(event, fieldName, rawValue);
  if (isMoneyField(fieldName)) return formatTjs(rawValue, { lng: language });
  if (!labels.isDisplayable(fieldName, rawValue) || (AuditPresentation.isTechnicalValue(rawValue) && fieldName !== "changed_fields")) return null;
  return labels.valueText(fieldName, rawValue);
}

export function buildInspectorRows(event: AuditEvent, labels: AuditLabels, language: string, allocationLine: (course: string, amount: string) => string): AuditInspectorRow[] {
  const rows: AuditInspectorRow[] = [];
  for (const change of event.changes as AuditChange[]) {
    const label: string = labels.fieldLabel(change.field_name);
    const isCreation: boolean = event.action === "create" && change.old_value === null;
    if (isCreation && change.field_name === "changed_fields") continue;
    if (change.field_name === "targets") {
      const rawValue: string | null = change.new_value ?? change.old_value;
      const amounts: string[] = rawValue === null ? [] : parseTargetAmounts(rawValue);
      if (amounts.length === 0) continue;
      const lines: string[] = amounts.map((amount) => {
        const formatted: string = formatTjs(amount, { lng: language });
        return event.course_title && amounts.length === 1 ? allocationLine(event.course_title, formatted) : formatted;
      });
      rows.push({ id: change.id, label, layout: "single", lines });
      continue;
    }
    const after: string | null = displayValue(event, labels, language, change.field_name, change.new_value);
    const before: string | null = displayValue(event, labels, language, change.field_name, change.old_value);
    if (before === null || after === null) continue;
    const isRemoval: boolean = event.action === "delete" && change.new_value === null;
    if (isCreation || isRemoval) {
      rows.push({ id: change.id, label, layout: "single", lines: [isCreation ? after : before] });
      continue;
    }
    rows.push({
      id: change.id,
      label,
      layout: "change",
      before,
      after,
      beforeIsPlaceholder: change.old_value === null || change.old_value === "",
      afterIsPlaceholder: change.new_value === null || change.new_value === "",
    });
  }
  return rows;
}

export function useAuditInspectorRows(event: AuditEvent): AuditInspectorRow[] {
  const { t, i18n } = useTranslation("audit");
  const labels: AuditLabels = useAuditLabels();
  return buildInspectorRows(event, labels, i18n.language, (course, amount) => t("inspector.allocationLine", { course, amount }));
}

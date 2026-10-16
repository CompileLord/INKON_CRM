import { useTranslation } from "react-i18next";
import { formatExactMoney } from "../../lib/money";
import type { AuditChange, AuditEvent } from "../../lib/audit/api";
import { AuditPresentation } from "../../lib/audit/auditPresentation";
import { useAuditLabels } from "./useAuditLabels";

export type AuditSentenceVariant = { key: string; values: Record<string, string> };

export interface AuditEventText {
  sentence: AuditSentenceVariant;
  subtitle: string;
}

export function useAuditEventText(event: AuditEvent): AuditEventText {
  const { t } = useTranslation("audit");
  const labels = useAuditLabels();
  const actor: string = labels.actorName(event);
  const entity: string = labels.entityLabel(event.entity_type).toLowerCase();
  const valueOf = (field: string): string | null => event.changes.find((change) => change.field_name === field)?.new_value ?? null;
  const amountText: string | null = (() => {
    const amount: string | null = event.amount ?? valueOf("amount");
    return amount === null ? null : t("moneyAmount", { amount: formatExactMoney(amount) });
  })();
  const singleChange: AuditChange | undefined = event.changes.length === 1 ? event.changes[0] : undefined;
  const genericSubtitle: string = [
    event.entity_label,
    singleChange ? summarizeChange(t, labels, event.action, singleChange) : t("event.fieldsChanged", { count: event.changes.length }),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  const generic: AuditEventText = { sentence: { key: labels.sentenceKey(event.action), values: { actor, entity } }, subtitle: genericSubtitle };

  if (event.entity_type === "payment" && event.entity_label && amountText !== null) {
    if (event.action === "create") {
      const method: string | null = valueOf("method") === null ? null : labels.valueText("method", valueOf("method"));
      const subtitle: string = [method, event.course_title].filter((part): part is string => Boolean(part)).join(" · ");
      return { sentence: { key: "event.paymentRecorded", values: { actor, amount: amountText, student: event.entity_label } }, subtitle: subtitle || genericSubtitle };
    }
    if (event.action === "void") {
      const reason: string | null = valueOf("reason_code");
      return {
        sentence: { key: "event.paymentVoided", values: { actor, amount: amountText, student: event.entity_label } },
        subtitle: reason === null ? genericSubtitle : t("event.reason", { reason: labels.valueText("reason_code", reason) }),
      };
    }
  }
  return generic;
}

function summarizeChange(
  t: ReturnType<typeof useTranslation>["t"],
  labels: ReturnType<typeof useAuditLabels>,
  action: string,
  change: AuditChange,
): string {
  const field: string = labels.fieldLabel(change.field_name);
  const shape = AuditPresentation.changeShape(change.old_value, change.new_value);
  if (AuditPresentation.isReferenceField(change.field_name)) {
    return t(shape === "set" ? "change.referenceSet" : shape === "cleared" ? "change.referenceCleared" : "change.referenceChanged", { field });
  }
  if (shape === "set" || (action === "create" && shape !== "cleared")) return t("change.created", { field, value: labels.valueText(change.field_name, change.new_value) });
  if (shape === "cleared") return t("change.removed", { field, value: labels.valueText(change.field_name, change.old_value) });
  return t("change.updated", { field, from: labels.valueText(change.field_name, change.old_value), to: labels.valueText(change.field_name, change.new_value) });
}

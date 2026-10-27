import { useTranslation } from "react-i18next";
import { formatDate, formatDateTime, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { AuditPresentation, type AuditValueDescriptor } from "../../lib/audit/auditPresentation";


export interface AuditLabels {
  actionLabel: (action: string) => string;
  entityLabel: (entityType: string) => string;
  fieldLabel: (fieldName: string) => string;
  valueText: (fieldName: string, value: string | null) => string;
  actorName: (subject: { actor_name?: string | null; user_id?: number | null }) => string;
  weekdayName: (weekday: number) => string;
  sentenceKey: (action: string) => string;
  statementKey: (entityKey: string, action: string, fieldNames: readonly string[], hasAmount: boolean, hasName: boolean, isSystem: boolean) => string | null;
}

const ISO_TIMESTAMP_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const CALENDAR_DATE_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;
const BOOLEAN_PATTERN: RegExp = /^(true|false)$/i;

export function useAuditLabels(): AuditLabels {
  const { t, i18n } = useTranslation("audit");
  const hasKey = (key: string): boolean => i18n.exists(`audit:${key}`);

  const entityLabel = (entityType: string): string =>
    hasKey(`entities.${entityType}`) ? t(`entities.${entityType}`) : AuditPresentation.humanizeIdentifier(entityType);
  const weekdayName = (weekday: number): string => t(`student:weekdays.${weekday}`);
  const fieldLabel = (fieldName: string): string => {
    const slot = AuditPresentation.scheduleSlot(fieldName);
    if (slot !== null) return t(slot.edge === "start" ? "fields.scheduleStart" : "fields.scheduleEnd", { day: weekdayName(slot.weekday) });
    return hasKey(`fields.${fieldName}`) ? t(`fields.${fieldName}`) : AuditPresentation.humanizeIdentifier(fieldName);
  };
  const valueText = (fieldName: string, value: string | null): string => {
    const descriptor: AuditValueDescriptor = AuditPresentation.describeValue(value);
    if (descriptor.kind === "none") return t("values.none");
    if (descriptor.kind === "empty") return t("values.empty");
    if (AuditPresentation.queueFields.includes(fieldName)) {
      const marker = AuditPresentation.queueMarker([{ id: 0, field_name: fieldName, old_value: null, new_value: descriptor.text }]);
      if (marker !== null && hasKey(`values.queueReason.${marker.reason}`) && hasKey(`values.queueChannel.${marker.channel}`)) {
        return `${t(`values.queueReason.${marker.reason}`)} ${t(`values.queueChannel.${marker.channel}`)}`;
      }
    }
    if (fieldName === "changed_fields") {
      const { fieldNames } = AuditPresentation.expandChangedFields([{ id: 0, field_name: fieldName, old_value: null, new_value: descriptor.text }]);
      return fieldNames.map((name) => fieldLabel(name).toLowerCase()).join(", ");
    }
    if (ISO_TIMESTAMP_PATTERN.test(descriptor.text)) return formatDateTime(descriptor.text, i18n.language, SCHOOL_TIMEZONE);
    if (CALENDAR_DATE_PATTERN.test(descriptor.text)) return formatDate(descriptor.text, i18n.language, SCHOOL_TIMEZONE);
    if (AuditPresentation.scheduleSlot(fieldName) !== null) return AuditPresentation.trimTime(descriptor.text);
    if (BOOLEAN_PATTERN.test(descriptor.text)) {
      const answer: string = descriptor.text.toLowerCase();
      return hasKey(`values.${fieldName}.${answer}`) ? t(`values.${fieldName}.${answer}`) : t(`values.boolean.${answer}`);
    }
    const translationKey: string = `values.${fieldName}.${AuditPresentation.enumLookupKey(descriptor.text)}`;
    if (hasKey(translationKey)) return t(translationKey);
    return AuditPresentation.isSnakeCaseIdentifier(descriptor.text) ? AuditPresentation.humanizeIdentifier(descriptor.text) : descriptor.text;
  };

  const statementKey = (entityKey: string, action: string, fieldNames: readonly string[], hasAmount: boolean, hasName: boolean, isSystem: boolean): string | null => {
    const base: string = `statement.${entityKey}.${action}`;
    const singleField: string | undefined = fieldNames.length === 1 ? fieldNames[0] : undefined;
    if (singleField !== undefined && hasKey(`${base}.${singleField}`)) return `${base}.${singleField}`;
    if (isSystem && hasKey(`${base}.system`)) return `${base}.system`;
    if (hasAmount && hasKey(`${base}.amount`)) return `${base}.amount`;
    if (!hasName && hasKey(`${base}.anyUnnamed`)) return `${base}.anyUnnamed`;
    if (hasKey(`${base}.any`)) return `${base}.any`;
    return null;
  };

  return {
    actionLabel: (action) => t(AuditPresentation.isKnownAction(action) ? `actions.${action}` : "actions.unknown"),
    entityLabel,
    fieldLabel,
    valueText,
    actorName: (subject) => subject.actor_name ?? (subject.user_id == null ? t("actor.system") : t("filters.actorUnavailable")),
    weekdayName,
    statementKey,
    sentenceKey: (action) => (AuditPresentation.isKnownAction(action) ? `sentence.${action}` : "sentence.unknown"),
  };
}

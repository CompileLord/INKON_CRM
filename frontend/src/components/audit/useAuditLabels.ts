import { useTranslation } from "react-i18next";
import { formatDateTime, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { AuditPresentation, type AuditValueDescriptor } from "../../lib/audit/auditPresentation";


export interface AuditLabels {
  actionLabel: (action: string) => string;
  entityLabel: (entityType: string) => string;
  fieldLabel: (fieldName: string) => string;
  valueText: (fieldName: string, value: string | null) => string;
  actorName: (subject: { actor_name?: string | null }) => string;
  sentenceKey: (action: string) => string;
  objectPhrase: (entityType: string, action: string, fieldNames: readonly string[]) => string | null;
}

const ISO_TIMESTAMP_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

export function useAuditLabels(): AuditLabels {
  const { t, i18n } = useTranslation("audit");
  const hasKey = (key: string): boolean => i18n.exists(`audit:${key}`);

  const entityLabel = (entityType: string): string =>
    hasKey(`entities.${entityType}`) ? t(`entities.${entityType}`) : AuditPresentation.humanizeIdentifier(entityType);
  const fieldLabel = (fieldName: string): string =>
    hasKey(`fields.${fieldName}`) ? t(`fields.${fieldName}`) : AuditPresentation.humanizeIdentifier(fieldName);
  const valueText = (fieldName: string, value: string | null): string => {
    const descriptor: AuditValueDescriptor = AuditPresentation.describeValue(value);
    if (descriptor.kind === "none") return t("values.none");
    if (descriptor.kind === "empty") return t("values.empty");
    if (ISO_TIMESTAMP_PATTERN.test(descriptor.text)) return formatDateTime(descriptor.text, i18n.language, SCHOOL_TIMEZONE);
    const translationKey: string = `values.${fieldName}.${AuditPresentation.enumLookupKey(descriptor.text)}`;
    if (hasKey(translationKey)) return t(translationKey);
    return AuditPresentation.isSnakeCaseIdentifier(descriptor.text) ? AuditPresentation.humanizeIdentifier(descriptor.text) : descriptor.text;
  };

  const objectPhrase = (entityType: string, action: string, fieldNames: readonly string[]): string | null => {
    const base: string = `objects.${entityType}.${action}`;
    const singleField: string | undefined = fieldNames.length === 1 ? fieldNames[0] : undefined;
    if (singleField !== undefined && hasKey(`${base}.${singleField}`)) return t(`${base}.${singleField}`);
    if (hasKey(`${base}.any`)) return t(`${base}.any`);
    return null;
  };

  return {
    actionLabel: (action) => t(AuditPresentation.isKnownAction(action) ? `actions.${action}` : "actions.unknown"),
    entityLabel,
    fieldLabel,
    valueText,
    actorName: (subject) => subject.actor_name ?? t("filters.actorUnavailable"),
    objectPhrase,
    sentenceKey: (action) => (AuditPresentation.isKnownAction(action) ? `sentence.${action}` : "sentence.unknown"),
  };
}

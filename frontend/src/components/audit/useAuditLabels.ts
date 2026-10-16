import { useTranslation } from "react-i18next";
import { AuditPresentation, type AuditValueDescriptor } from "../../lib/audit/auditPresentation";


export interface AuditLabels {
  actionLabel: (action: string) => string;
  entityLabel: (entityType: string) => string;
  fieldLabel: (fieldName: string) => string;
  valueText: (fieldName: string, value: string | null) => string;
  actorName: (subject: { actor_name?: string | null }) => string;
  sentenceKey: (action: string) => string;
}

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
    const translationKey: string = `values.${fieldName}.${AuditPresentation.enumLookupKey(descriptor.text)}`;
    if (hasKey(translationKey)) return t(translationKey);
    return AuditPresentation.isSnakeCaseIdentifier(descriptor.text) ? AuditPresentation.humanizeIdentifier(descriptor.text) : descriptor.text;
  };

  return {
    actionLabel: (action) => t(AuditPresentation.isKnownAction(action) ? `actions.${action}` : "actions.unknown"),
    entityLabel,
    fieldLabel,
    valueText,
    actorName: (subject) => subject.actor_name ?? t("filters.actorUnavailable"),
    sentenceKey: (action) => (AuditPresentation.isKnownAction(action) ? `sentence.${action}` : "sentence.unknown"),
  };
}

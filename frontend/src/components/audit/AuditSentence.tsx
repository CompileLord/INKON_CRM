import { Trans, useTranslation } from "react-i18next";
import type { AuditEvent } from "../../lib/audit/api";
import { useAuditEventText } from "./useAuditEventText";

interface AuditSentenceProps {
  event: AuditEvent;
}

export function AuditSentence({ event }: AuditSentenceProps) {
  const { t } = useTranslation("audit");
  const { sentence, details } = useAuditEventText(event);
  return (
    <>
      <Trans ns="audit" i18nKey={sentence.key} values={sentence.values} components={{ actor: <strong className="font-semibold text-ink" /> }} />
      {details !== null && t("event.detailsSuffix", { details })}
    </>
  );
}

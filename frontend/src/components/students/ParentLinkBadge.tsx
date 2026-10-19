import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ParentLinkBadgeProps {
  linked: boolean;
}

export function ParentLinkBadge({ linked }: ParentLinkBadgeProps) {
  const { t } = useTranslation("students");
  const label: string = linked ? t("parentLink.linked") : t("parentLink.notLinked");
  const toneClass: string = linked ? "bg-success-surface text-success" : "bg-strip text-muted";

  return (
    <span
      title={linked ? t("parentLink.linkedInfo") : t("parentLink.notLinkedInfo")}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}
    >
      <Send size={12} aria-hidden="true" className="shrink-0" />
      {label}
    </span>
  );
}

import { useTranslation } from "react-i18next";

export type BadgeStatus = "active" | "archived" | "paid" | "overdue" | "partial" | "pending" | "linked" | "notLinked" | "completed" | "draft";

interface BadgeProps {
  status: BadgeStatus;
}

const STATUS_CLASSES: Record<BadgeStatus, string> = {
  active: "bg-success-surface text-success",
  paid: "bg-success-surface text-success",
  linked: "bg-success-surface text-success",
  completed: "bg-success-surface text-success",
  overdue: "bg-danger-surface text-destructive",
  partial: "bg-warning-surface text-warning",
  pending: "bg-info-surface text-info",
  archived: "bg-strip text-muted",
  notLinked: "bg-strip text-muted",
  draft: "bg-strip text-muted",
};

export function Badge({ status }: BadgeProps) {
  const { t } = useTranslation("ui");
  return (
    <span data-badge-status={status} className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}>
      {t(`badge.${status}`)}
    </span>
  );
}

import { BookOpen, GraduationCap, NotebookPen, Settings2, Wallet, type LucideIcon } from "lucide-react";
import type { AuditEvent } from "../../lib/audit/api";
import { AuditPresentation } from "../../lib/audit/auditPresentation";
import type { AuditCategory } from "../../lib/audit/types";

export const AUDIT_CATEGORY_ICONS: Readonly<Record<AuditCategory, LucideIcon>> = {
  payments: Wallet,
  students: GraduationCap,
  courses: BookOpen,
  journal: NotebookPen,
  system: Settings2,
};

interface AuditCategoryIconProps {
  event: AuditEvent;
}

export function AuditCategoryIcon({ event }: AuditCategoryIconProps) {
  const category: AuditCategory = AuditPresentation.categoryOf(event.entity_type, event.changes);
  const Icon: LucideIcon = AUDIT_CATEGORY_ICONS[category];
  return (
    <span aria-hidden="true" data-audit-category={category} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-strip text-muted">
      <Icon size={18} />
    </span>
  );
}

import { Ban, CircleHelp, Lock, LockOpen, Pencil, Plus, Trash2, Undo2, type LucideIcon } from "lucide-react";
import type { AuditAction } from "../../lib/audit/api";

const ICONS: Readonly<Record<string, LucideIcon>> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  void: Ban,
  refund: Undo2,
  close_period: Lock,
  reopen_period: LockOpen,
};

interface AuditActionChipProps {
  action: AuditAction;
}

export function AuditActionChip({ action }: AuditActionChipProps) {
  const Icon: LucideIcon = ICONS[action] ?? CircleHelp;
  return (
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-strip text-muted">
      <Icon size={18} />
    </span>
  );
}

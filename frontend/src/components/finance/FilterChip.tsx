import { X } from "lucide-react";

interface FilterChipProps {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}

export function FilterChip({ label, removeLabel, onRemove }: FilterChipProps) {
  return (
    <span className="inline-flex min-h-11 items-center gap-1 rounded-[10px] bg-beige pl-3 text-sm text-ink">
      <span className="break-words tabular-nums">{label}</span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </span>
  );
}

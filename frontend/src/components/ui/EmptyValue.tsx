import { Tooltip } from "./Tooltip";

interface EmptyValueProps {
  reason: string;
  className?: string;
}

export function EmptyValue({ reason, className = "" }: EmptyValueProps) {
  return (
    <Tooltip content={reason} focusable>
      <span aria-label={reason} className={["cursor-help text-muted", className].join(" ")}>
        <span aria-hidden="true">—</span>
      </span>
    </Tooltip>
  );
}

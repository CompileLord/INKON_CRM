import { useId } from "react";
import { useTranslation } from "react-i18next";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  ariaLabel,
  disabled = false,
  id,
  className = "",
}: ToggleProps) {
  const { t } = useTranslation("common");
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const labelId = `${inputId}-label`;

  const handleToggle = () => {
    if (disabled) return;
    onChange(!checked);
  };

  return (
    <div
      className={[
        "inline-flex min-w-0 max-w-full items-center gap-3 select-none",
        disabled ? "cursor-not-allowed" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel ?? t("controls.toggle")}
        disabled={disabled}
        onClick={handleToggle}
        className={[
          "inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center p-2 rounded-full",
          "touch-manipulation",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          disabled ? "cursor-not-allowed pointer-events-none" : "cursor-pointer",
        ].join(" ")}
      >
        <span
          className={[
            "relative inline-flex h-6 w-11 shrink-0 rounded-full p-0.5 motion-safe:transition-[background-color,border-color] motion-safe:duration-150 motion-safe:ease-out",
            disabled
              ? "bg-beige border border-control-border"
              : checked
              ? "bg-maroon"
              : "bg-strip border border-control-border",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-5 w-5 rounded-full shadow-xs motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out",
              disabled
                ? `${checked ? "translate-x-5" : "translate-x-0"} bg-muted`
                : checked
                ? "translate-x-5 bg-on-primary"
                : "translate-x-0 bg-control-border dark:bg-muted",
            ].join(" ")}
          />
        </span>
      </button>

      {label && (
        <label
          htmlFor={inputId}
          id={labelId}
          className={[
            "min-w-0 break-words text-sm font-medium",
            disabled ? "text-muted" : "text-ink",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          ].join(" ")}
        >
          {label}
        </label>
      )}
    </div>
  );
}

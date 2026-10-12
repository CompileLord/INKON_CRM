import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftAddon?: ReactNode;
  rightAddon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    error,
    helperText,
    leftAddon,
    rightAddon,
    className = "",
    disabled,
    required,
    "aria-describedby": externalDescription,
    "aria-invalid": externalInvalid,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  const renderedError = Boolean(error);
  const renderedHelper = !renderedError && Boolean(helperText);

  const describedBy = [
    externalDescription,
    renderedError ? errorId : undefined,
    renderedHelper ? helperId : undefined,
  ]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-ink select-none break-words"
        >
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </label>
      )}

      <div className="relative flex w-full items-center">
        {leftAddon && (
          <div className="pointer-events-none absolute left-3 flex items-center text-muted">
            {leftAddon}
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          required={required}
          aria-invalid={renderedError ? "true" : externalInvalid}
          aria-describedby={describedBy}
          className={[
            "h-12 min-h-[48px] w-full rounded-[10px] bg-card px-3.5 text-base text-ink placeholder:text-muted",
            "border",
            renderedError
              ? "border-destructive focus-visible:ring-destructive"
              : "border-control-border focus-visible:ring-ring",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
            "motion-safe:transition-[border-color,box-shadow] motion-safe:duration-150 motion-safe:ease-out",
            "focus-visible:transition-none",
            "disabled:cursor-not-allowed disabled:bg-strip disabled:text-muted",
            leftAddon ? "pl-11" : "",
            rightAddon ? "pr-14" : "",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        />

        {rightAddon && (
          <div className="absolute right-1 flex items-center justify-center">
            {rightAddon}
          </div>
        )}
      </div>

      {renderedError ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive break-words">
          {error}
        </p>
      ) : renderedHelper ? (
        <p id={helperId} className="text-xs text-muted break-words">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});

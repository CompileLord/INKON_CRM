import type { ReactNode } from "react";

interface CourseFormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  errorId?: string;
  aside?: ReactNode;
  children: ReactNode;
}

export function CourseFormField({ id, label, required = false, error, errorId, aside, children }: CourseFormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </label>
        {aside}
      </div>
      {children}
      {error !== undefined && errorId !== undefined && (
        <p id={errorId} role="alert" className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

export class CourseFormErrorLocator {
  static firstErrorPath(errors: Record<string, unknown>, prefix: string = ""): string | null {
    for (const key of Object.keys(errors)) {
      const value: unknown = errors[key];
      const fullPath: string = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object") {
        if ("message" in value && typeof (value as { message: unknown }).message === "string") return fullPath;
        const nested: string | null = CourseFormErrorLocator.firstErrorPath(value as Record<string, unknown>, fullPath);
        if (nested) return nested;
      }
    }
    return null;
  }
}

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { StudentFormValues } from "../../lib/studentFormSchema";

interface StudentEmailFieldProps {
  register: UseFormRegister<StudentFormValues>;
  errors: FieldErrors<StudentFormValues>;
  inputClass: string;
  labelClass: string;
}

export function StudentEmailField({ register, errors, inputClass, labelClass }: StudentEmailFieldProps) {
  const { t } = useTranslation(["students", "common"]);
  const describedBy: string = errors.email ? "student-email-error" : "student-email-help";

  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
      <label htmlFor="student-email" className={labelClass}>
        {t("common:emailLabel")}
      </label>
      <input
        id="student-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        aria-invalid={Boolean(errors.email)}
        aria-describedby={describedBy}
        className={inputClass}
        {...register("email")}
      />
      <span id="student-email-help" className="text-xs text-muted">
        {t("form.emailHelp")}
      </span>
      {errors.email?.message && (
        <span id="student-email-error" role="alert" className="text-xs text-destructive">
          {errors.email.message}
        </span>
      )}
    </div>
  );
}

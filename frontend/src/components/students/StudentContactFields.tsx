import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { StudentFormValues } from "../../lib/studentFormSchema";

interface StudentFieldProps {
  register: UseFormRegister<StudentFormValues>;
  errors: FieldErrors<StudentFormValues>;
  inputClass: string;
  labelClass: string;
}

export function StudentPhoneField({ register, errors, inputClass, labelClass }: StudentFieldProps) {
  const { t } = useTranslation("students");

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor="student-phone" className={labelClass}>
        {t("form.phoneLabel")}
      </label>
      <input
        id="student-phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={t("form.phonePlaceholder")}
        aria-invalid={Boolean(errors.phone)}
        aria-describedby={errors.phone ? "student-phone-error" : undefined}
        className={inputClass}
        {...register("phone")}
      />
      {errors.phone?.message && (
        <span id="student-phone-error" role="alert" className="text-xs text-destructive">
          {errors.phone.message}
        </span>
      )}
    </div>
  );
}

export function StudentParentPhoneField({ register, errors, inputClass, labelClass }: StudentFieldProps) {
  const { t } = useTranslation("students");

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor="student-parentPhone" className={labelClass}>
        {t("form.parentPhoneLabel")}
      </label>
      <input
        id="student-parentPhone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        aria-invalid={Boolean(errors.parentPhone)}
        aria-describedby={errors.parentPhone ? "student-parentPhone-error" : undefined}
        className={inputClass}
        {...register("parentPhone")}
      />
      {errors.parentPhone?.message && (
        <span id="student-parentPhone-error" role="alert" className="text-xs text-destructive">
          {errors.parentPhone.message}
        </span>
      )}
    </div>
  );
}

export function StudentPaymentFields({ register, errors, inputClass, labelClass }: StudentFieldProps) {
  const { t } = useTranslation("students");

  return (
    <div className="flex flex-col gap-4">
      <h3 className="border-b border-border pb-2 text-base font-semibold text-ink">{t("form.sectionPayment")}</h3>
      <div className="flex flex-col gap-1.5 sm:max-w-[calc(50%-0.5rem)]">
        <label htmlFor="student-paymentDay" className={labelClass}>
          {t("form.paymentDayLabel")}
        </label>
        <input
          id="student-paymentDay"
          type="number"
          min={1}
          max={28}
          inputMode="numeric"
          placeholder="10"
          aria-invalid={Boolean(errors.paymentDay)}
          aria-describedby={errors.paymentDay ? "student-paymentDay-error" : "student-paymentDay-help"}
          className={inputClass}
          {...register("paymentDay")}
        />
        <span id="student-paymentDay-help" className="text-xs text-muted">
          {t("form.paymentDayHelp")}
        </span>
        {errors.paymentDay?.message && (
          <span id="student-paymentDay-error" role="alert" className="text-xs text-destructive">
            {errors.paymentDay.message}
          </span>
        )}
      </div>
    </div>
  );
}

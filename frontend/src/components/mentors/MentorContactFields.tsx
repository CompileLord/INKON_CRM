import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { MentorFormValues } from "../../lib/mentorFormSchema";

interface MentorContactFieldsProps {
  register: UseFormRegister<MentorFormValues>;
  errors: FieldErrors<MentorFormValues>;
}

const inputClass: string =
  "w-full min-h-12 rounded-[10px] border border-control-border bg-card px-3.5 py-2.5 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60";
const labelClass: string = "text-sm font-medium text-ink";

export function MentorContactFields({ register, errors }: MentorContactFieldsProps) {
  const { t } = useTranslation("mentors");
  const phoneReg = register("phone");

  return (
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-ink border-b border-border pb-2">
              {t("form.sectionContacts")}
            </h3>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="mentor-phone" className={labelClass}>
                  {t("form.phoneLabel")}
                </label>
                <span className="text-xs text-muted">
                  {t("form.phoneHelp")}
                </span>
              </div>
              <input
                id="mentor-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t("form.phonePlaceholder")}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={
                  errors.phone
                    ? "mentor-phone-error"
                    : "mentor-phone-help"
                }
                className={inputClass}
                {...phoneReg}
              />
              <span id="mentor-phone-help" className="sr-only">
                {t("form.phoneHelp")}
              </span>
              {errors.phone?.message && (
                <span id="mentor-phone-error" role="alert" className="text-xs text-destructive">
                  {errors.phone.message}
                </span>
              )}
            </div>
          </div>
  );
}

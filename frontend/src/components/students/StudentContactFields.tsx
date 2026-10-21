import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { InfoTooltip } from "../ui/InfoTooltip";
import type { StudentFormValues } from "../../lib/studentFormSchema";

interface StudentContactFieldsProps {
  register: UseFormRegister<StudentFormValues>;
  errors: FieldErrors<StudentFormValues>;
}

const inputClass: string =
  "w-full min-h-12 rounded-[10px] border border-control-border bg-card px-3.5 py-2.5 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60";
const labelClass: string = "text-sm font-medium text-ink";

export function StudentContactFields({ register, errors }: StudentContactFieldsProps) {
  const { t } = useTranslation("students");
  const phoneReg = register("phone");
  const parentPhoneReg = register("parentPhone");
  const parentTelegramChatIdReg = register("parentTelegramChatId");
  const paymentDayReg = register("paymentDay");

  return (
    <>
          <div className="flex flex-col gap-4">
            <h3 className="flex items-center gap-1 text-base font-semibold text-ink border-b border-border pb-2">
              {t("form.sectionContacts")}
              <InfoTooltip label={t("form.contactsInfoLabel")}>{t("form.contactsInfo")}</InfoTooltip>
            </h3>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="student-phone" className={labelClass}>
                  {t("form.phoneLabel")}
                </label>
                <span className="text-xs text-muted">
                  {t("form.phoneHelp")}
                </span>
              </div>
              <input
                id="student-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+992901234567"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={
                  errors.phone
                    ? "student-phone-error"
                    : "student-phone-help"
                }
                className={inputClass}
                {...phoneReg}
              />
              <span id="student-phone-help" className="sr-only">
                {t("form.phoneHelp")}
              </span>
              {errors.phone?.message && (
                <span id="student-phone-error" role="alert" className="text-xs text-destructive">
                  {errors.phone.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="student-parentPhone" className={labelClass}>
                {t("form.parentPhoneLabel")}
              </label>
              <input
                id="student-parentPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+992901234567"
                aria-invalid={Boolean(errors.parentPhone)}
                aria-describedby={errors.parentPhone ? "student-parentPhone-error" : undefined}
                className={inputClass}
                {...parentPhoneReg}
              />
              {errors.parentPhone?.message && (
                <span id="student-parentPhone-error" role="alert" className="text-xs text-destructive">
                  {errors.parentPhone.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="student-parentTelegramChatId" className={labelClass}>
                {t("form.telegramChatIdLabel")}
              </label>
              <input
                id="student-parentTelegramChatId"
                inputMode="numeric"
                placeholder="123456789"
                aria-invalid={Boolean(errors.parentTelegramChatId)}
                aria-describedby={
                  errors.parentTelegramChatId
                    ? "student-parentTelegramChatId-error"
                    : "student-parentTelegramChatId-help"
                }
                className={inputClass}
                {...parentTelegramChatIdReg}
              />
              <span id="student-parentTelegramChatId-help" className="text-xs text-muted">
                {t("form.telegramChatIdHelp")}
              </span>
              {errors.parentTelegramChatId?.message && (
                <span id="student-parentTelegramChatId-error" role="alert" className="text-xs text-destructive">
                  {errors.parentTelegramChatId.message}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-ink border-b border-border pb-2">
              {t("form.sectionPayment")}
            </h3>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="student-paymentDay" className={labelClass}>
                  {t("form.paymentDayLabel")}
                </label>
                <span className="text-xs text-muted">
                  {t("form.paymentDayHelp")}
                </span>
              </div>
              <input
                id="student-paymentDay"
                type="number"
                min={1}
                max={28}
                inputMode="numeric"
                placeholder="10"
                aria-invalid={Boolean(errors.paymentDay)}
                aria-describedby={
                  errors.paymentDay
                    ? "student-paymentDay-error"
                    : "student-paymentDay-help"
                }
                className={inputClass}
                {...paymentDayReg}
              />
              <span id="student-paymentDay-help" className="sr-only">
                {t("form.paymentDayHelp")}
              </span>
              {errors.paymentDay?.message && (
                <span id="student-paymentDay-error" role="alert" className="text-xs text-destructive">
                  {errors.paymentDay.message}
                </span>
              )}
            </div>
          </div>
    </>
  );
}

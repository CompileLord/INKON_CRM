import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PhoneInput } from "../ui/PhoneInput";
import type { MentorFormValues } from "../../lib/mentorFormSchema";

interface MentorContactFieldsProps {
  register: UseFormRegister<MentorFormValues>;
  errors: FieldErrors<MentorFormValues>;
}

export function MentorContactFields({ register, errors }: MentorContactFieldsProps) {
  const { t } = useTranslation("mentors");

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-ink border-b border-border pb-2">
        {t("form.sectionContacts")}
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PhoneInput
          id="mentor-phone"
          label={t("form.phoneLabel")}
          error={errors.phone?.message}
          {...register("phone")}
        />
      </div>
    </div>
  );
}

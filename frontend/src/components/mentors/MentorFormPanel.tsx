import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { SlideOver } from "../ui/SlideOver";
import { Button } from "../ui/Button";
import { AvatarUploadField } from "../ui/AvatarUploadField";
import { mentorFormSchema, type MentorFormValues } from "../../lib/mentorFormSchema";
import {
  applyFieldErrors,
  buildCreatePayload,
  buildUpdatePayload,
  buildUserFormValues,
  describeUserApiError,
  EMAIL_TAKEN_MESSAGE,
  isDuplicateEmailError,
} from "../../lib/users/formMapping";
import { useCreateUser, useUpdateUser } from "../../lib/users/hooks";
import { resolveMediaUrl } from "../../lib/users/media";
import { AuthApiError } from "../../lib/auth/errors";
import type { User } from "../../lib/users/types";

interface MentorFormPanelProps {
  open: boolean;
  mentor?: User;
  onClose: () => void;
  onSaved: (action: "created" | "updated") => void;
}

const inputClass =
  "w-full rounded-lg border border-border-warm bg-card px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-maroon/20";

const labelClass = "text-sm font-medium text-ink";

export function MentorFormPanel({ open, mentor, onClose, onSaved }: MentorFormPanelProps) {
  const { t } = useTranslation(["mentors", "common"]);
  const isEditing = Boolean(mentor);
  const formKey = open ? (mentor?.id ?? "new") : "closed";

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={isEditing ? t("form.editMentorTitle", "Редактировать ментора") : t("form.newMentorTitle", "Новый ментор")}
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common:cancel", "Отмена")}
          </Button>
          <Button type="submit" form="mentor-form" variant="accent">
            {isEditing ? t("common:save", "Сохранить") : t("common:create", "Создать")}
          </Button>
        </div>
      }
    >
      <MentorFormFields key={formKey} mentor={mentor} onClose={onClose} onSaved={onSaved} />
    </SlideOver>
  );
}

interface MentorFormFieldsProps {
  mentor?: User;
  onClose: () => void;
  onSaved: (action: "created" | "updated") => void;
}

function MentorFormFields({ mentor, onClose, onSaved }: MentorFormFieldsProps) {
  const { t } = useTranslation(["mentors", "common"]);
  const createUser = useCreateUser("mentor");
  const updateUser = useUpdateUser("mentor");
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, dirtyFields },
  } = useForm<MentorFormValues>({
    resolver: zodResolver(mentorFormSchema),
    defaultValues: buildUserFormValues(mentor),
  });

  const handleError = (err: unknown) => {
    if (isDuplicateEmailError(err)) {
      setError("email", { type: "server", message: EMAIL_TAKEN_MESSAGE });
      return;
    }
    if (err instanceof AuthApiError && err.status === 422) {
      const applied = applyFieldErrors(err.fieldErrors, setError);
      if (!applied) setFormError(err.message);
      return;
    }
    setFormError(describeUserApiError(err));
  };

  const onSubmit = (values: MentorFormValues) => {
    setFormError(undefined);

    if (mentor) {
      updateUser.mutate(
        { id: mentor.id, payload: buildUpdatePayload(values, dirtyFields) },
        {
          onSuccess: () => {
            onClose();
            onSaved("updated");
          },
          onError: handleError,
        },
      );
    } else {
      createUser.mutate(buildCreatePayload(values), {
        onSuccess: () => {
          onClose();
          onSaved("created");
        },
        onError: handleError,
      });
    }
  };

  const pending = createUser.isPending || updateUser.isPending;

  return (
    <form id="mentor-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {formError}
        </div>
      )}

      {mentor && (
        <AvatarUploadField
          userId={mentor.id}
          role="mentor"
          currentPhotoUrl={resolveMediaUrl(mentor.thumbnail_path ?? mentor.photo_path)}
          firstName={mentor.first_name}
          lastName={mentor.last_name}
          onUploaded={() => onSaved("updated")}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            {t("form.firstNameLabel", "Имя")} <span className="text-red-600">*</span>
          </label>
          <input className={`mt-1.5 ${inputClass}`} {...register("firstName")} />
          {errors.firstName && (
            <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p>
          )}
        </div>
        <div>
          <label className={labelClass}>
            {t("form.lastNameLabel", "Фамилия")} <span className="text-red-600">*</span>
          </label>
          <input className={`mt-1.5 ${inputClass}`} {...register("lastName")} />
          {errors.lastName && (
            <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p>
          )}
        </div>
      </div>

      <div>
        <label className={labelClass}>
          Email <span className="text-red-600">*</span>
        </label>
        <input
          type="email"
          placeholder="example@domain.com"
          className={`mt-1.5 ${inputClass}`}
          {...register("email")}
        />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>{t("form.phoneLabel", "Телефон")}</label>
          <input
            placeholder="+992901234567"
            className={`mt-1.5 ${inputClass}`}
            {...register("phone")}
          />
          {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
        </div>
        <div>
          <label className={labelClass}>{t("form.dobLabel", "Дата рождения")}</label>
          <input type="date" className={`mt-1.5 ${inputClass}`} {...register("birthDate")} />
        </div>
      </div>

      <div>
        <label className={labelClass}>{t("form.telegramChatIdLabel", "Telegram chat ID")}</label>
        <input
          placeholder="Напр. 123456789"
          className={`mt-1.5 ${inputClass}`}
          {...register("parentTelegramChatId")}
        />
        {errors.parentTelegramChatId && (
          <p className="mt-1 text-xs text-red-600">{errors.parentTelegramChatId.message}</p>
        )}
      </div>

      {pending && <p className="text-xs text-muted">{t("form.saving", "Сохранение…")}</p>}
    </form>
  );
}

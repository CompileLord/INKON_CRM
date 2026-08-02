import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { SlideOver } from "../ui/SlideOver";
import { Button } from "../ui/Button";
import { courseEditFormSchema, courseFormSchema, type CourseFormValues } from "../../lib/courseFormSchema";
import {
  applyCourseFieldErrors,
  buildCourseCreatePayload,
  buildCourseFormValues,
  buildCourseUpdatePayload,
  courseFormDefaults,
  describeCourseApiError,
} from "../../lib/courses/formMapping";
import { useCreateCourse, useUpdateCourse, useUploadCourseImage } from "../../lib/courses/hooks";
import { useMentors } from "../../lib/users/hooks";
import { AuthApiError } from "../../lib/auth/errors";
import { formatMoney } from "../../lib/money";
import { ScheduleEditor } from "./ScheduleEditor";
import { CourseImageUploadField } from "./CourseImageUploadField";
import type { CourseResponse } from "../../lib/courses/types";


interface CourseFormPanelProps {
  open: boolean;
  course?: CourseResponse;
  onClose: () => void;
  onSaved: (action: "created" | "updated", course: CourseResponse) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

const inputClass = `w-full rounded-lg border border-border-warm bg-card px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none ${FOCUS_RING}`;

const labelClass = "text-sm font-medium text-ink";

export function CourseFormPanel({ open, course, onClose, onSaved }: CourseFormPanelProps) {
  const { t } = useTranslation(["courses", "common"]);
  const isEditing = Boolean(course);
  const formKey = open ? (course?.id ?? "new") : "closed";

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={isEditing ? t("form.editCourseTitle", "Редактировать курс") : t("form.newCourseTitle", "Новый курс")}
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common:cancel", "Отмена")}
          </Button>
          <Button type="submit" form="course-form" variant="accent">
            {isEditing ? t("common:save", "Сохранить") : t("common:create", "Создать")}
          </Button>
        </div>
      }
    >
      <CourseFormFields key={formKey} course={course} onClose={onClose} onSaved={onSaved} />
    </SlideOver>
  );
}

interface CourseFormFieldsProps {
  course?: CourseResponse;
  onClose: () => void;
  onSaved: (action: "created" | "updated", course: CourseResponse) => void;
}

function CourseFormFields({ course, onClose, onSaved }: CourseFormFieldsProps) {
  const { t } = useTranslation(["courses", "common"]);
  const isEditing = Boolean(course);
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const uploadImage = useUploadCourseImage();
  const { data: mentorsPage, isLoading: mentorsLoading } = useMentors({ page_size: 100 });
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);

  const examTypeLabels: Record<CourseFormValues["exam_type"], string> = {
    weekly: t("common:enums.examType.weekly", "Еженедельный экзамен"),
    monthly: t("common:enums.examType.monthly", "Ежемесячный экзамен"),
  };

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, dirtyFields },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(isEditing ? courseEditFormSchema : courseFormSchema),
    defaultValues: course ? buildCourseFormValues(course) : courseFormDefaults,
  });

  const handleError = (err: unknown) => {
    if (err instanceof AuthApiError && err.status === 422) {
      const applied = applyCourseFieldErrors(err.fieldErrors, setError);
      if (!applied) setFormError(err.message);
      return;
    }
    setFormError(describeCourseApiError(err));
  };

  const onSubmit = (values: CourseFormValues) => {
    setFormError(undefined);

    if (course) {
      updateCourse.mutate(
        { id: course.id, payload: buildCourseUpdatePayload(values, dirtyFields) },
        {
          onSuccess: (updated) => {
            if (selectedImageFile) {
              uploadImage.mutate(
                { id: updated.id, file: selectedImageFile },
                {
                  onSuccess: (withPhoto) => {
                    onClose();
                    onSaved("updated", withPhoto);
                  },
                  onError: () => {
                    onClose();
                    onSaved("updated", updated);
                  },
                }
              );
            } else {
              onClose();
              onSaved("updated", updated);
            }
          },
          onError: handleError,
        },
      );
    } else {
      createCourse.mutate(buildCourseCreatePayload(values), {
        onSuccess: (created) => {
          if (selectedImageFile) {
            uploadImage.mutate(
              { id: created.id, file: selectedImageFile },
              {
                onSuccess: (withPhoto) => {
                  onClose();
                  onSaved("created", withPhoto);
                },
                onError: () => {
                  onClose();
                  onSaved("created", created);
                },
              }
            );
          } else {
            onClose();
            onSaved("created", created);
          }
        },
        onError: handleError,
      });
    }
  };

  const pending = createCourse.isPending || updateCourse.isPending || uploadImage.isPending;
  const mentors = mentorsPage?.items ?? [];

  return (
    <form id="course-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {formError}
        </div>
      )}

      <CourseImageUploadField
        courseId={course?.id}
        currentPhotoPath={course?.photo_path}
        onFileSelected={(file) => setSelectedImageFile(file)}
      />

      <div>
        <label className={labelClass}>
          {t("form.titleLabel", "Название")} <span className="text-red-600">*</span>
        </label>
        <input className={`mt-1.5 ${inputClass}`} {...register("title")} />
        {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
      </div>

      <div>
        <label className={labelClass}>
          {t("form.descriptionLabel", "Описание")} <span className="text-red-600">*</span>
        </label>
        <textarea rows={3} className={`mt-1.5 resize-none ${inputClass}`} {...register("description")} />
        {errors.description && (
          <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            {t("form.startDateLabel", "Дата начала")} <span className="text-red-600">*</span>
          </label>
          <input type="date" className={`mt-1.5 ${inputClass}`} {...register("start_date")} />
          {errors.start_date && (
            <p className="mt-1 text-xs text-red-600">{errors.start_date.message}</p>
          )}
        </div>
        <div>
          <label className={labelClass}>
            {t("form.endDateLabel", "Дата окончания")} <span className="text-red-600">*</span>
          </label>
          <input type="date" className={`mt-1.5 ${inputClass}`} {...register("end_date")} />
          {errors.end_date && (
            <p className="mt-1 text-xs text-red-600">{errors.end_date.message}</p>
          )}
        </div>
      </div>

      <div>
        <label className={labelClass}>
          {t("form.mentorLabel", "Ментор")} <span className="text-red-600">*</span>
        </label>
        <select className={`mt-1.5 ${inputClass}`} disabled={mentorsLoading} {...register("mentor_id")}>
          <option value="">{mentorsLoading ? t("common:loading", "Загрузка…") : t("form.selectMentor", "Выберите ментора")}</option>
          {mentors.map((mentor) => (
            <option key={mentor.id} value={mentor.id}>
              {mentor.first_name} {mentor.last_name}
            </option>
          ))}
        </select>
        {errors.mentor_id && (
          <p className="mt-1 text-xs text-red-600">{errors.mentor_id.message}</p>
        )}
      </div>

      {isEditing && (
        <div>
          <label className={labelClass}>{t("common:status", "Статус")}</label>
          <select className={`mt-1.5 ${inputClass}`} {...register("status")}>
            <option value="active">{t("common:enums.courseStatus.active", "Активен")}</option>
            <option value="archived">{t("common:enums.courseStatus.archived", "Архив")}</option>
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            {t("form.examTypeLabel", "Тип экзамена")} {!isEditing && <span className="text-red-600">*</span>}
          </label>
          {isEditing ? (
            <p className="mt-1.5 rounded-lg bg-strip px-3 py-2.5 text-sm text-nav">
              {examTypeLabels[course!.exam_type]}
            </p>
          ) : (
            <select className={`mt-1.5 ${inputClass}`} {...register("exam_type")}>
              <option value="weekly">{t("common:enums.examType.weekly", "Еженедельный")}</option>
              <option value="monthly">{t("common:enums.examType.monthly", "Ежемесячный")}</option>
            </select>
          )}
        </div>
        <div>
          <label className={labelClass}>
            {t("form.priceLabel", "Цена, TJS")} {!isEditing && <span className="text-red-600">*</span>}
          </label>
          {isEditing ? (
            <p className="mt-1.5 rounded-lg bg-strip px-3 py-2.5 text-sm font-medium tabular-nums text-nav">
              {formatMoney(course!.price)}
            </p>
          ) : (
            <>
              <input inputMode="decimal" placeholder="1500" className={`mt-1.5 ${inputClass}`} {...register("price")} />
              {errors.price && <p className="mt-1 text-xs text-red-600">{errors.price.message}</p>}
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <p className="text-xs text-muted">
          {t("form.immutableNotice", "Тип экзамена, цену и расписание нельзя изменить после создания курса.")}
        </p>
      ) : (
        <div>
          <label className={labelClass}>
            {t("form.scheduleLabel", "Расписание")} <span className="text-red-600">*</span>
          </label>
          <div className="mt-1.5">
            <ScheduleEditor control={control} errors={errors} />
          </div>
        </div>
      )}

      {pending && <p className="text-xs text-muted">{t("form.saving", "Сохранение…")}</p>}
    </form>
  );
}

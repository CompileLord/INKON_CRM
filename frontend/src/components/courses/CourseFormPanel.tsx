import { useState, useRef, useEffect, type ComponentProps, type FormEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { SlideOver } from "../ui/SlideOver";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { courseEditFormSchema, courseFormSchema, type CourseFormValues } from "../../lib/courseFormSchema";
import {
  applyCourseFieldErrors,
  buildCourseCreatePayload,
  buildCourseFormValues,
  buildCourseUpdatePayload,
  courseFormDefaults,
  describeCourseApiError,
} from "../../lib/courses/formMapping";
import {
  useCourseMentorHistory,
  useCourseSchedule,
  useCreateCourse,
  useUpdateCourse,
  useUploadCourseImage,
} from "../../lib/courses/hooks";
import { useMentors } from "../../lib/users/hooks";
import { AuthApiError } from "../../lib/auth/errors";
import { formatMoney } from "../../lib/money";
import { formatTime } from "../../i18n/formatters";
import { ScheduleEditor } from "./ScheduleEditor";
import { CourseImageUploadField } from "./CourseImageUploadField";
import type { CourseResponse } from "../../lib/courses/types";
import type { User } from "../../lib/users/types";
import { useAuthStore } from "../../store/authStore";

interface CourseFormPanelProps {
  open: boolean;
  course?: CourseResponse;
  onClose: () => void;
  onSaved: (action: "created" | "updated", course: CourseResponse) => void;
  finalFocus?: ComponentProps<typeof Dialog.Popup>["finalFocus"];
}

const inputClass =
  "w-full min-h-11 rounded-lg border border-border-warm bg-card px-3 py-2.5 text-base md:text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out disabled:pointer-events-none disabled:opacity-100 disabled:bg-strip disabled:cursor-not-allowed";

const labelClass = "text-sm font-medium text-ink";

function findFirstErrorPath(errors: Record<string, unknown>, prefix = ""): string | null {
  for (const key of Object.keys(errors)) {
    const val = errors[key];
    const fullPath = prefix ? (prefix.endsWith(".") ? `${prefix}${key}` : `${prefix}.${key}`) : key;
    if (val && typeof val === "object") {
      if ("message" in val && typeof (val as { message: unknown }).message === "string") {
        return fullPath;
      }
      const nested = findFirstErrorPath(val as Record<string, unknown>, fullPath);
      if (nested) return nested;
    }
  }
  return null;
}

interface PartialSuccessState {
  courseId: number;
  savedCourse: CourseResponse;
}

export function CourseFormPanel({ open, course, onClose, onSaved, finalFocus }: CourseFormPanelProps) {
  if (!open) {
    return null;
  }

  const isEditing = Boolean(course);
  return (
    <CourseFormPanelInner
      key={course?.id ?? "new"}
      open={open}
      course={course}
      isEditing={isEditing}
      onClose={onClose}
      onSaved={onSaved}
      finalFocus={finalFocus}
    />
  );
}

interface CourseFormPanelInnerProps {
  open: boolean;
  course?: CourseResponse;
  isEditing: boolean;
  onClose: () => void;
  onSaved: (action: "created" | "updated", course: CourseResponse) => void;
  finalFocus?: ComponentProps<typeof Dialog.Popup>["finalFocus"];
}

function CourseFormPanelInner({
  open,
  course,
  isEditing,
  onClose,
  onSaved,
  finalFocus,
}: CourseFormPanelInnerProps) {
  const { t } = useTranslation(["courses", "common"]);
  const role = useAuthStore((s) => s.role);
  const isSuperAdmin = role === "superadmin";
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const uploadImage = useUploadCourseImage();
  const formRef = useRef<HTMLFormElement>(null);
  const lastActiveFieldRef = useRef<HTMLElement | null>(null);
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [mentorPage, setMentorPage] = useState(1);
  const [loadedMentors, setLoadedMentors] = useState<User[]>([]);
  const [authoritativeMentorTotal, setAuthoritativeMentorTotal] = useState<number | null>(null);

  const {
    data: mentorsPage,
    isLoading: mentorsLoading,
    isFetching: mentorsFetching,
    isError: mentorsError,
    refetch: refetchMentors,
  } = useMentors({ page: mentorPage, page_size: 50 }, isSuperAdmin && open);

  const { data: mentorHistory } = useCourseMentorHistory(
    course?.id,
    isSuperAdmin && isEditing && open
  );
  const currentMentorHistoryItem = mentorHistory?.find((h) => h.mentor_id === course?.mentor_id);
  const currentMentorFallbackName = currentMentorHistoryItem
    ? `${currentMentorHistoryItem.mentor.first_name} ${currentMentorHistoryItem.mentor.last_name}`
    : undefined;

  useEffect(() => {
    if (mentorsPage?.total !== undefined) {
      setAuthoritativeMentorTotal(mentorsPage.total);
    }
    if (mentorsPage?.items) {
      setLoadedMentors((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const next = [...prev];
        for (const item of mentorsPage.items) {
          if (!existingIds.has(item.id)) {
            existingIds.add(item.id);
            next.push(item);
          }
        }
        return next;
      });
    }
  }, [mentorsPage?.total, mentorsPage?.items]);

  const totalMentors = authoritativeMentorTotal ?? mentorsPage?.total ?? null;
  const hasMoreMentors = totalMentors !== null ? loadedMentors.length < totalMentors : false;
  const isInitialMentorsLoading = mentorsLoading && loadedMentors.length === 0;

  const {
    data: scheduleList,
    isLoading: scheduleLoading,
    isError: scheduleError,
    refetch: refetchSchedule,
  } = useCourseSchedule(course?.id);

  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [partialSuccess, setPartialSuccess] = useState<PartialSuccessState | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    reset,
    formState: { errors, dirtyFields, isDirty },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(isEditing ? courseEditFormSchema : courseFormSchema),
    defaultValues: course ? buildCourseFormValues(course) : courseFormDefaults,
  });

  const isFormDirty = isDirty || Boolean(selectedImageFile);
  const isPending = createCourse.isPending || updateCourse.isPending || uploadImage.isPending;
  const isLocked = isPending || isSubmitting;
  const areCourseFieldsLocked = isLocked || Boolean(partialSuccess);
  const isSaveDisabled =
    isLocked ||
    (isEditing && !isDirty && !selectedImageFile && !partialSuccess);

  const handleAttemptClose = () => {
    if (isSubmittingRef.current || isLocked) return;
    if (partialSuccess) {
      onClose();
      onSaved(isEditing ? "updated" : "created", partialSuccess.savedCourse);
      return;
    }
    if (isFormDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const handleDiscardChanges = () => {
    if (isSubmittingRef.current || isLocked) return;
    setShowDiscardConfirm(false);
    reset();
    setSelectedImageFile(null);
    onClose();
  };

  const getFirstInvalidOrDirtyElement = (): HTMLElement | null => {
    if (!formRef.current) return null;
    const domInvalid = formRef.current.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (domInvalid) return domInvalid;

    const firstPath = findFirstErrorPath(errors as Record<string, unknown>);
    if (firstPath) {
      const el =
        formRef.current.querySelector<HTMLElement>(`[name="${firstPath}"]`) ||
        formRef.current.querySelector<HTMLElement>(`#${firstPath.replace(/\./g, "-")}`);
      if (el) return el;
    }

    const dirtyKeys = Object.keys(dirtyFields);
    if (dirtyKeys.length > 0) {
      const el = formRef.current.querySelector<HTMLElement>(`[name="${dirtyKeys[0]}"]`);
      if (el) return el;
    }
    return formRef.current.querySelector<HTMLElement>("input, textarea, select");
  };

  const handleKeepEditing = () => {
    if (isSubmittingRef.current || isLocked) return;
    setShowDiscardConfirm(false);
    requestAnimationFrame(() => {
      const target = lastActiveFieldRef.current ?? getFirstInvalidOrDirtyElement();
      if (target) {
        target.focus({ preventScroll: false });
        target.scrollIntoView?.({ block: "nearest" });
      }
    });
  };

  const handleError = (err: unknown) => {
    if (err instanceof AuthApiError && err.status === 422) {
      const applied = applyCourseFieldErrors(
        err.fieldErrors,
        (field, error) => setError(field as Parameters<typeof setError>[0], error),
        (k) => t(k),
      );
      if (!applied) setFormError(describeCourseApiError(err, (k) => t(k)));
      return;
    }
    setFormError(describeCourseApiError(err, (k) => t(k)));
  };

  const handleRetryImageUpload = async () => {
    if (!partialSuccess || !selectedImageFile || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setFormError(undefined);
    try {
      const withPhoto = await uploadImage.mutateAsync({
        id: partialSuccess.courseId,
        file: selectedImageFile,
      });
      onClose();
      onSaved(isEditing ? "updated" : "created", withPhoto);
    } catch (err) {
      setFormError(describeCourseApiError(err, (k) => t(k)));
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (values: CourseFormValues) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setFormError(undefined);

    try {
      if (partialSuccess) {
        await handleRetryImageUpload();
        return;
      }

      if (course) {
        const updatePayload = buildCourseUpdatePayload(values, dirtyFields);
        const hasCourseFieldChanges = Object.keys(updatePayload).length > 0;

        if (!hasCourseFieldChanges && selectedImageFile) {
          try {
            const withPhoto = await uploadImage.mutateAsync({
              id: course.id,
              file: selectedImageFile,
            });
            onClose();
            onSaved("updated", withPhoto);
          } catch (err) {
            handleError(err);
          }
          return;
        }

        try {
          const updated = await updateCourse.mutateAsync({
            id: course.id,
            payload: updatePayload,
          });

          if (selectedImageFile) {
            try {
              const withPhoto = await uploadImage.mutateAsync({
                id: updated.id,
                file: selectedImageFile,
              });
              onClose();
              onSaved("updated", withPhoto);
            } catch (imgErr) {
              setPartialSuccess({ courseId: updated.id, savedCourse: updated });
              setFormError(describeCourseApiError(imgErr, (k) => t(k)));
            }
          } else {
            onClose();
            onSaved("updated", updated);
          }
        } catch (err) {
          handleError(err);
        }
      } else {
        try {
          const created = await createCourse.mutateAsync(buildCourseCreatePayload(values));

          if (selectedImageFile) {
            try {
              const withPhoto = await uploadImage.mutateAsync({
                id: created.id,
                file: selectedImageFile,
              });
              onClose();
              onSaved("created", withPhoto);
            } catch (imgErr) {
              setPartialSuccess({ courseId: created.id, savedCourse: created });
              setFormError(describeCourseApiError(imgErr, (k) => t(k)));
            }
          } else {
            onClose();
            onSaved("created", created);
          }
        } catch (err) {
          handleError(err);
        }
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const onInvalidSubmit = (fieldErrors: FieldErrors<CourseFormValues>) => {
    if (!formRef.current) return;
    const domInvalid = formRef.current.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (domInvalid) {
      lastActiveFieldRef.current = domInvalid;
      domInvalid.focus({ preventScroll: false });
      domInvalid.scrollIntoView?.({ block: "nearest" });
      return;
    }

    const firstPath = findFirstErrorPath(fieldErrors as Record<string, unknown>);
    if (firstPath) {
      const target =
        formRef.current.querySelector<HTMLElement>(`[name="${firstPath}"]`) ||
        formRef.current.querySelector<HTMLElement>(`#${firstPath.replace(/\./g, "-")}`);
      if (target) {
        lastActiveFieldRef.current = target;
        target.focus({ preventScroll: false });
        target.scrollIntoView?.({ block: "nearest" });
        return;
      }
    }
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isSubmittingRef.current || isLocked) {
      return;
    }
    if (partialSuccess) {
      void handleRetryImageUpload();
      return;
    }
    void handleSubmit(onSubmit, onInvalidSubmit)(event);
  };

  const mentors = loadedMentors;

  const examTypeLabels: Record<CourseFormValues["exam_type"], string> = {
    weekly: t("common:enums.examType.weekly"),
    monthly: t("common:enums.examType.monthly"),
  };

  const getDayLabel = (dayNumber: number) => {
    const keys = ["monFull", "tueFull", "wedFull", "thuFull", "friFull", "satFull", "sunFull"];
    const key = keys[dayNumber] || "monFull";
    return t(`days.${key}` as const, String(dayNumber));
  };

  const titleText = isEditing ? t("form.editCourseTitle") : t("form.newCourseTitle");

  return (
    <>
      <SlideOver
        open={open}
        onClose={handleAttemptClose}
        variant="course"
        title={titleText}
        pending={isSubmittingRef.current || isLocked}
        closeDisabled={isSubmittingRef.current || isLocked || showDiscardConfirm}
        finalFocus={finalFocus}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleAttemptClose}
              disabled={isSubmittingRef.current || isLocked}
            >
              {partialSuccess ? t("form.closeSavedCourse") : t("common:cancel")}
            </Button>
            {partialSuccess ? (
              <Button
                type="button"
                variant="primary"
                onClick={handleRetryImageUpload}
                loading={uploadImage.isPending || isSubmitting}
                disabled={isLocked || !selectedImageFile}
              >
                {t("form.retryImage")}
              </Button>
            ) : (
              <Button
                type="submit"
                form="course-form"
                variant="primary"
                loading={isLocked}
                disabled={isSaveDisabled}
              >
                {isEditing
                  ? isLocked
                    ? t("form.saving")
                    : t("common:save")
                  : isLocked
                    ? t("form.creating")
                    : t("common:create")}
              </Button>
            )}
          </div>
        }
      >
        <form
          ref={formRef}
          id="course-form"
          onSubmit={handleFormSubmit}
          onFocusCapture={(e) => {
            if (
              e.target instanceof HTMLElement &&
              ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
            ) {
              lastActiveFieldRef.current = e.target;
            }
          }}
          noValidate
          className="flex flex-col gap-6"
        >
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/60 bg-destructive/10 p-3.5 text-sm text-destructive"
            >
              {formError}
            </div>
          )}

          {partialSuccess && (
            <div
              role="alert"
              className="rounded-lg border border-border-warm bg-strip p-4 text-sm text-ink flex flex-col gap-2"
            >
              <h3 className="font-semibold text-ink">{t("form.partialImageSuccessTitle")}</h3>
              <p className="text-muted text-xs leading-relaxed">
                {t("form.partialImageSuccessMessage")}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
              {t("form.identitySection")}
            </h3>

            <div>
              <label htmlFor="course-title-field" className={labelClass}>
                {t("form.titleLabel")} <span className="text-destructive">*</span>
              </label>
              <input
                id="course-title-field"
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? "course-title-error" : undefined}
                disabled={areCourseFieldsLocked}
                className={`mt-1.5 ${inputClass}`}
                {...register("title")}
              />
              {errors.title && (
                <p id="course-title-error" role="alert" className="mt-1 text-xs text-destructive">
                  {t(errors.title.message ?? "form.requiredFieldError")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="course-description-field" className={labelClass}>
                {t("form.descriptionLabel")} <span className="text-destructive">*</span>
              </label>
              <textarea
                id="course-description-field"
                rows={3}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={errors.description ? "course-description-error" : undefined}
                disabled={areCourseFieldsLocked}
                className={`mt-1.5 resize-none ${inputClass}`}
                {...register("description")}
              />
              {errors.description && (
                <p id="course-description-error" role="alert" className="mt-1 text-xs text-destructive">
                  {t(errors.description.message ?? "form.requiredFieldError")}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
              {t("form.mentorDatesSection")}
            </h3>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="course-mentor-field" className={labelClass}>
                  {t("form.mentorLabel")} <span className="text-destructive">*</span>
                </label>
                {totalMentors !== null && totalMentors > 0 && (
                  <span className="text-xs text-muted tabular-nums">
                    {t("form.mentorsCount", { loaded: mentors.length, total: totalMentors })}
                  </span>
                )}
              </div>

              {isInitialMentorsLoading ? (
                <div className="min-h-11 rounded-lg border border-border-warm bg-strip px-3 py-2.5 text-sm text-muted flex items-center">
                  {t("form.mentorsLoading")}
                </div>
              ) : mentorsError && mentors.length === 0 ? (
                <div className="flex items-center justify-between min-h-11 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <span>{t("form.mentorsLoadError")}</span>
                  <button
                    type="button"
                    onClick={() => refetchMentors()}
                    disabled={areCourseFieldsLocked}
                    className="min-h-11 inline-flex items-center text-xs font-semibold text-maroon dark:text-accent underline hover:no-underline motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
                  >
                    {t("common:retry")}
                  </button>
                </div>
              ) : mentors.length === 0 ? (
                <div className="min-h-11 rounded-lg border border-border-warm bg-strip px-3 py-2.5 text-sm text-muted flex items-center">
                  {t("form.mentorsEmpty")}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <select
                    id="course-mentor-field"
                    aria-invalid={Boolean(errors.mentor_id)}
                    aria-describedby={errors.mentor_id ? "course-mentor-error" : undefined}
                    disabled={areCourseFieldsLocked}
                    className={inputClass}
                    {...register("mentor_id")}
                  >
                    <option value="">{t("form.selectMentor")}</option>
                    {course?.mentor_id && !loadedMentors.some((m) => m.id === course.mentor_id) && (
                      <option value={String(course.mentor_id)}>
                        {currentMentorFallbackName || t("form.currentMentor", { id: course.mentor_id })}
                      </option>
                    )}
                    {mentors.map((mentor) => (
                      <option key={mentor.id} value={String(mentor.id)}>
                        {mentor.first_name} {mentor.last_name}
                      </option>
                    ))}
                  </select>

                  {mentorsError && loadedMentors.length > 0 && (
                    <div className="flex items-center justify-between min-h-11 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      <span>{t("form.mentorsPageLoadError", { page: mentorPage })}</span>
                      <button
                        type="button"
                        onClick={() => void refetchMentors()}
                        disabled={mentorsLoading || mentorsFetching || isSubmittingRef.current || isLocked}
                        className="min-h-11 inline-flex items-center text-xs font-semibold text-maroon dark:text-accent underline hover:no-underline disabled:opacity-50 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
                      >
                        {t("common:retry")}
                      </button>
                    </div>
                  )}

                  {hasMoreMentors && !mentorsError && (
                    <button
                      type="button"
                      onClick={() => setMentorPage((prev) => prev + 1)}
                      disabled={mentorsLoading || mentorsFetching || isSubmittingRef.current || isLocked}
                      className="min-h-11 inline-flex items-center text-xs font-semibold text-maroon dark:text-accent hover:underline self-start touch-manipulation disabled:opacity-50 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
                    >
                      {mentorsLoading || mentorsFetching ? t("form.mentorsLoading") : t("form.mentorsLoadMore")}
                    </button>
                  )}
                </div>
              )}

              {errors.mentor_id && (
                <p id="course-mentor-error" role="alert" className="mt-1 text-xs text-destructive">
                  {t(errors.mentor_id.message ?? "form.requiredFieldError")}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="course-start-date-field" className={labelClass}>
                  {t("form.startDateLabel")} <span className="text-destructive">*</span>
                </label>
                <input
                  id="course-start-date-field"
                  type="date"
                  aria-invalid={Boolean(errors.start_date)}
                  aria-describedby={errors.start_date ? "course-start-date-error" : undefined}
                  disabled={areCourseFieldsLocked}
                  className={`mt-1.5 ${inputClass}`}
                  {...register("start_date")}
                />
                {errors.start_date && (
                  <p id="course-start-date-error" role="alert" className="mt-1 text-xs text-destructive">
                    {t(errors.start_date.message ?? "form.requiredFieldError")}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="course-end-date-field" className={labelClass}>
                  {t("form.endDateLabel")} <span className="text-destructive">*</span>
                </label>
                <input
                  id="course-end-date-field"
                  type="date"
                  aria-invalid={Boolean(errors.end_date)}
                  aria-describedby={errors.end_date ? "course-end-date-error" : undefined}
                  disabled={areCourseFieldsLocked}
                  className={`mt-1.5 ${inputClass}`}
                  {...register("end_date")}
                />
                {errors.end_date && (
                  <p id="course-end-date-error" role="alert" className="mt-1 text-xs text-destructive">
                    {t(errors.end_date.message ?? "form.dateOrderError")}
                  </p>
                )}
              </div>
            </div>

            {isEditing && (
              <div>
                <label htmlFor="course-status-field" className={labelClass}>
                  {t("common:status")}
                </label>
                <select id="course-status-field" disabled={areCourseFieldsLocked} className={`mt-1.5 ${inputClass}`} {...register("status")}>
                  <option value="active">{t("common:enums.courseStatus.active")}</option>
                  <option value="archived">{t("common:enums.courseStatus.archived")}</option>
                </select>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="flex flex-col gap-4 rounded-xl border border-border-warm bg-strip/60 p-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  {t("form.courseTermsSection")}
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  {t("form.immutableNotice")}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-medium text-muted block mb-1">
                    {t("form.examTypeLabel")}
                  </span>
                  <span className="text-sm font-semibold text-ink">
                    {examTypeLabels[course!.exam_type]}
                  </span>
                </div>

                <div>
                  <span className="text-xs font-medium text-muted block mb-1">
                    {t("form.priceLabel")}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {formatMoney(course!.price)}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs font-medium text-muted block mb-1.5">
                  {t("form.scheduleLabel")}
                </span>

                {scheduleLoading ? (
                  <p className="text-xs text-muted">{t("form.scheduleLoading")}</p>
                ) : scheduleError ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-destructive">{t("form.scheduleLoadError")}</span>
                    <button
                      type="button"
                      onClick={() => refetchSchedule()}
                      disabled={areCourseFieldsLocked}
                      className="min-h-11 inline-flex items-center text-xs font-semibold text-maroon dark:text-accent underline motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
                    >
                      {t("form.scheduleRetry")}
                    </button>
                  </div>
                ) : scheduleList && scheduleList.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {scheduleList.map((item) => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border-warm text-xs font-medium text-ink"
                      >
                        <span className="font-semibold">{getDayLabel(item.day_of_week)}:</span>{" "}
                        <span className="tabular-nums">
                          {formatTime(item.time_start)}–{formatTime(item.time_end)}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted">{t("form.noScheduleData")}</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  {t("form.priceExamsSection")}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="course-price-field" className={labelClass}>
                      {t("form.priceLabel")} <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="course-price-field"
                      inputMode="decimal"
                      placeholder={t("form.pricePlaceholder")}
                      aria-invalid={Boolean(errors.price)}
                      aria-describedby={errors.price ? "course-price-error" : undefined}
                      disabled={areCourseFieldsLocked}
                      className={`mt-1.5 ${inputClass}`}
                      {...register("price")}
                    />
                    {errors.price && (
                      <p id="course-price-error" role="alert" className="mt-1 text-xs text-destructive">
                        {t(errors.price.message ?? "form.positivePriceError")}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="course-exam-type-field" className={labelClass}>
                      {t("form.examTypeLabel")} <span className="text-destructive">*</span>
                    </label>
                    <select
                      id="course-exam-type-field"
                      disabled={areCourseFieldsLocked}
                      className={`mt-1.5 ${inputClass}`}
                      {...register("exam_type")}
                    >
                      <option value="weekly">{t("common:enums.examType.weekly")}</option>
                      <option value="monthly">{t("common:enums.examType.monthly")}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  {t("form.scheduleSection")}
                </h3>
                <ScheduleEditor control={control} errors={errors} disabled={areCourseFieldsLocked} />
              </div>
            </>
          )}

          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
              {t("form.imageSection")}
            </h3>
            <CourseImageUploadField
              courseId={course?.id}
              currentPhotoPath={course?.photo_path}
              selectedFile={selectedImageFile}
              disabled={isLocked}
              onFileSelected={(file) => setSelectedImageFile(file)}
            />
          </div>
        </form>
      </SlideOver>

      <ConfirmDialog
        open={showDiscardConfirm}
        title={t("courses:form.discardTitle")}
        message={t("courses:form.discardMessage")}
        confirmLabel={t("courses:form.discard")}
        cancelLabel={t("courses:form.keepEditing")}
        confirmVariant="destructive"
        finalFocus={lastActiveFieldRef}
        onConfirm={handleDiscardChanges}
        onCancel={handleKeepEditing}
      />
    </>
  );
}

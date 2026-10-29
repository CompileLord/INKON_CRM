import { useState, useRef, type ComponentProps, type FormEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { SlideOver } from "../ui/SlideOver";
import { FORM_TEXTAREA_CLASS as textareaClass } from "../ui/formFieldClasses";
import { useHeldWhileClosing, usePresence } from "../ui/usePresence";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { courseEditFormSchema, courseFormSchema, type CourseFormValues } from "../../lib/courseFormSchema";
import {
  applyCourseFieldErrors,
  buildCourseCreatePayload,
  buildCourseFormValues,
  buildCourseUpdatePayload,
  courseFormDefaults,
  describeCourseApiError,
  hasScheduleTimeRangeViolation,
} from "../../lib/courses/formMapping";
import { useCreateCourse, useUpdateCourse, useUploadCourseImage } from "../../lib/courses/hooks";
import { AuthApiError } from "../../lib/auth/errors";
import { DatePicker } from "../ui/DatePicker";
import { Select } from "../ui/Select";
import { Input } from "../ui/Input";
import type { ListboxOption } from "../ui/ListboxPicker";
import { Controller } from "react-hook-form";
import { ScheduleEditor } from "./ScheduleEditor";
import { CourseImageUploadField } from "./CourseImageUploadField";
import { CourseFormErrorLocator, CourseFormField } from "./CourseFormField";
import { CourseMentorField } from "./CourseMentorField";
import { CourseFormFooter } from "./CourseFormFooter";
import { CourseEditTerms } from "./CourseEditTerms";
import { CourseFormBanners } from "./CourseFormBanners";
import { CourseReadOnlyDates } from "./CourseReadOnlyDates";
import { useCourseScheduleEdits } from "./useCourseScheduleEdits";
import type { CourseResponse } from "../../lib/courses/types";
import { useAuthStore } from "../../store/authStore";

interface CourseFormPanelProps {
  open: boolean;
  course?: CourseResponse;
  onClose: () => void;
  onSaved: (action: "created" | "updated", course: CourseResponse) => void;
  finalFocus?: ComponentProps<typeof Dialog.Popup>["finalFocus"];
}


interface PartialSuccessState {
  courseId: number;
  savedCourse: CourseResponse;
}

export function CourseFormPanel({ open, course: courseProp, onClose, onSaved, finalFocus }: CourseFormPanelProps) {
  const { present, onOpenChangeComplete } = usePresence(open);
  const course: CourseResponse | undefined = useHeldWhileClosing(courseProp, open);
  if (!present) {
    return null;
  }

  const isEditing = Boolean(course);
  return (
    <CourseFormPanelInner
      key={course?.id ?? "new"}
      open={open}
      onOpenChangeComplete={onOpenChangeComplete}
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
  onOpenChangeComplete: (open: boolean) => void;
  course?: CourseResponse;
  isEditing: boolean;
  onClose: () => void;
  onSaved: (action: "created" | "updated", course: CourseResponse) => void;
  finalFocus?: ComponentProps<typeof Dialog.Popup>["finalFocus"];
}

function CourseFormPanelInner({
  open,
  onOpenChangeComplete,
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
  const schedule = useCourseScheduleEdits(course?.id, isEditing);
  const formRef = useRef<HTMLFormElement>(null);
  const lastActiveFieldRef = useRef<HTMLElement | null>(null);
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const isFormDirty = isDirty || Boolean(selectedImageFile) || schedule.hasChanges;
  const isPending = createCourse.isPending || updateCourse.isPending || uploadImage.isPending;
  const isLocked = isPending || isSubmitting;
  const areCourseFieldsLocked = isLocked || Boolean(partialSuccess);
  const isSaveDisabled =
    isLocked ||
    (isEditing && !isDirty && !selectedImageFile && !schedule.hasChanges && !partialSuccess);

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

    const firstPath = CourseFormErrorLocator.firstErrorPath(errors as Record<string, unknown>);
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
    if (err instanceof AuthApiError && err.status === 422 && !hasScheduleTimeRangeViolation(err)) {
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
        if (schedule.hasChanges) {
          const schedulesPayload = schedule.buildPayloadIfValid();
          if (!schedulesPayload) return;
          updatePayload.schedules = schedulesPayload;
        }
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

    const firstPath = CourseFormErrorLocator.firstErrorPath(fieldErrors as Record<string, unknown>);
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

  const statusOptions: readonly ListboxOption[] = [
    { value: "active", label: t("common:enums.courseStatus.active") },
    { value: "archived", label: t("common:enums.courseStatus.archived") },
  ];
  const examTypeOptions: readonly ListboxOption[] = [
    { value: "weekly", label: t("common:enums.examType.weekly") },
    { value: "monthly", label: t("common:enums.examType.monthly") },
  ];
  const titleText: string = isEditing ? t("form.editCourseTitle") : t("form.newCourseTitle");
  const errorText = (error: { message?: string } | undefined, fallbackKey: string): string | undefined => (error ? t(error.message ?? fallbackKey) : undefined);

  return (
    <>
      <SlideOver
        open={open}
        onOpenChangeComplete={onOpenChangeComplete}
        onClose={handleAttemptClose}
        variant="course"
        title={titleText}
        pending={isSubmittingRef.current || isLocked}
        closeDisabled={isSubmittingRef.current || isLocked || showDiscardConfirm}
        finalFocus={finalFocus}
        footer={
          <CourseFormFooter
            isEditing={isEditing}
            isLocked={isLocked}
            isSubmitting={isSubmitting}
            isSaveDisabled={isSaveDisabled}
            isUploadingImage={uploadImage.isPending}
            hasPartialSuccess={Boolean(partialSuccess)}
            hasSelectedImage={Boolean(selectedImageFile)}
            onCancel={handleAttemptClose}
            onRetryImage={handleRetryImageUpload}
          />
        }
      >
        <form
          ref={formRef}
          id="course-form"
          onSubmit={handleFormSubmit}
          onFocusCapture={(e) => {
            if (
              e.target instanceof HTMLElement &&
              ["INPUT", "TEXTAREA"].includes(e.target.tagName) || e.target.getAttribute("aria-haspopup") === "listbox"
            ) {
              lastActiveFieldRef.current = e.target;
            }
          }}
          noValidate
          className="flex flex-col gap-6"
        >
          <CourseFormBanners formError={formError} hasPartialSuccess={Boolean(partialSuccess)} />

          <div className="flex flex-col gap-4">
            <CourseFormField id="course-title-field" label={t("form.titleLabel")} required error={errorText(errors.title, "form.requiredFieldError")} errorId="course-title-error">
              <Input
                id="course-title-field"
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? "course-title-error" : undefined}
                disabled={areCourseFieldsLocked}
                {...register("title")}
              />
            </CourseFormField>

            <CourseFormField id="course-description-field" label={t("form.descriptionLabel")}>
              <textarea
                id="course-description-field"
                rows={3}
                                                disabled={areCourseFieldsLocked}
                className={`${textareaClass} border-control-border`}
                {...register("description")}
              />
            </CourseFormField>
          </div>

          <div className="flex flex-col gap-4">
            <CourseMentorField control={control} errors={errors} course={course} isEditing={isEditing} isSuperAdmin={isSuperAdmin} open={open} disabled={areCourseFieldsLocked} />

            {isEditing ? (
              <CourseReadOnlyDates startDate={course!.start_date} endDate={course!.end_date} />
            ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <CourseFormField id="course-start-date-field" label={t("form.startDateLabel")} required error={errorText(errors.start_date, "form.requiredFieldError")} errorId="course-start-date-error">
                <Controller
                  control={control}
                  name="start_date"
                  render={({ field }) => (
                    <DatePicker id="course-start-date-field" label={t("form.startDateLabel")} value={field.value} onChange={field.onChange} disabled={areCourseFieldsLocked} invalid={Boolean(errors.start_date)} describedBy={errors.start_date ? "course-start-date-error" : undefined} />
                  )}
                />
              </CourseFormField>
              <CourseFormField id="course-end-date-field" label={t("form.endDateLabel")} required error={errorText(errors.end_date, "form.dateOrderError")} errorId="course-end-date-error">
                <Controller
                  control={control}
                  name="end_date"
                  render={({ field }) => (
                    <DatePicker id="course-end-date-field" label={t("form.endDateLabel")} value={field.value} onChange={field.onChange} disabled={areCourseFieldsLocked} invalid={Boolean(errors.end_date)} describedBy={errors.end_date ? "course-end-date-error" : undefined} />
                  )}
                />
              </CourseFormField>
            </div>
            )}

            {isEditing && (
              <CourseFormField id="course-status-field" label={t("common:status")}>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select id="course-status-field" label={t("common:status")} options={statusOptions} value={field.value} onChange={field.onChange} disabled={areCourseFieldsLocked} />
                  )}
                />
              </CourseFormField>
            )}
          </div>

          {isEditing ? (
            <CourseEditTerms course={course!} schedule={schedule} disabled={areCourseFieldsLocked} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <CourseFormField id="course-price-field" label={t("form.priceLabel")} required error={errorText(errors.price, "form.positivePriceError")} errorId="course-price-error">
                  <Input
                    id="course-price-field"
                    inputMode="decimal"
                    rightAddon={<span className="text-sm text-muted">{t("form.priceCurrency")}</span>}
                    aria-invalid={Boolean(errors.price)}
                    aria-describedby={errors.price ? "course-price-error" : undefined}
                    disabled={areCourseFieldsLocked}
                    {...register("price")}
                  />
                </CourseFormField>
                <CourseFormField id="course-exam-type-field" label={t("form.examTypeLabel")} required>
                  <Controller
                    control={control}
                    name="exam_type"
                    render={({ field }) => (
                      <Select id="course-exam-type-field" label={t("form.examTypeLabel")} options={examTypeOptions} value={field.value} onChange={field.onChange} disabled={areCourseFieldsLocked} />
                    )}
                  />
                </CourseFormField>
              </div>

              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-ink">{t("form.scheduleSection")}</h3>
                <ScheduleEditor control={control} errors={errors} disabled={areCourseFieldsLocked} />
              </div>
            </>
          )}

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-ink">{t("form.imageSection")}</h3>
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

import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";

interface CourseFormFooterProps {
  isEditing: boolean;
  isLocked: boolean;
  isSubmitting: boolean;
  isSaveDisabled: boolean;
  isUploadingImage: boolean;
  hasPartialSuccess: boolean;
  hasSelectedImage: boolean;
  onCancel: () => void;
  onRetryImage: () => void;
}

export function CourseFormFooter({ isEditing, isLocked, isSubmitting, isSaveDisabled, isUploadingImage, hasPartialSuccess, hasSelectedImage, onCancel, onRetryImage }: CourseFormFooterProps) {
  const { t } = useTranslation(["courses", "common"]);
  const submitLabel: string = isEditing
    ? (isLocked ? t("form.saving") : t("common:save"))
    : (isLocked ? t("form.creating") : t("common:create"));

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <Button type="button" variant="secondary" onClick={onCancel} disabled={isLocked}>
        {hasPartialSuccess ? t("form.closeSavedCourse") : t("common:cancel")}
      </Button>
      {hasPartialSuccess ? (
        <Button type="button" onClick={onRetryImage} loading={isUploadingImage || isSubmitting} disabled={isLocked || !hasSelectedImage}>
          {t("form.retryImage")}
        </Button>
      ) : (
        <Button type="submit" form="course-form" loading={isLocked} disabled={isSaveDisabled} disabledReason={t("common:disabledReason.noChanges")}>
          {submitLabel}
        </Button>
      )}
    </div>
  );
}

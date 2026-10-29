import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CourseFormPanel } from "./CourseFormPanel";
import type { CourseActions } from "./useCourseActions";
import type { CourseResponse } from "../../lib/courses/types";

interface CourseActionDialogsProps {
  course: CourseResponse;
  actions: CourseActions;
  finalFocus: () => HTMLElement | null;
  onUpdated: () => void;
}

export function CourseActionDialogs({ course, actions, finalFocus, onUpdated }: CourseActionDialogsProps) {
  const { t } = useTranslation("courseDetail");
  const { t: tCommon } = useTranslation("common");
  const generationAtOpen: number = actions.editGeneration();

  return (
    <>
      {actions.editOpen ? (
        <CourseFormPanel
          open={actions.editOpen}
          course={course}
          finalFocus={finalFocus}
          onClose={() => {
            if (!actions.isOperationLive(generationAtOpen)) return;
            actions.closeEdit();
            finalFocus()?.focus();
          }}
          onSaved={() => {
            if (!actions.isOperationLive(generationAtOpen)) return;
            actions.closeEdit();
            onUpdated();
            finalFocus()?.focus();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={actions.copyConfirmOpen}
        title={t("duplicate.title")}
        message={t("duplicate.message", { title: course.title })}
        confirmLabel={t("actions.duplicate")}
        cancelLabel={tCommon("cancel")}
        confirmVariant="primary"
        pending={actions.isCopyPending}
        errorMessage={actions.copyErrorMessage}
        finalFocus={finalFocus}
        onConfirm={actions.confirmDuplicate}
        onCancel={actions.cancelDuplicate}
      />

      <ConfirmDialog
        open={actions.deleteConfirmOpen}
        title={t("delete.title")}
        message={t("delete.message", { title: course.title })}
        confirmLabel={t("actions.delete")}
        cancelLabel={tCommon("cancel")}
        confirmVariant="destructive"
        pending={actions.isDeletePending}
        errorMessage={actions.deleteErrorMessage}
        finalFocus={finalFocus}
        onConfirm={actions.confirmDelete}
        onCancel={actions.cancelDelete}
      />
    </>
  );
}

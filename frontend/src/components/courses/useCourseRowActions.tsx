import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useCopyCourse, useDeleteCourse } from "../../lib/courses/hooks";
import { getCourseSchedule } from "../../lib/courses/endpoints";
import type { CourseCreate, CourseResponse, CourseScheduleResponse } from "../../lib/courses/types";

interface ToastState {
  message: string;
  visible: boolean;
  variant: "success" | "error";
}

interface UseCourseRowActionsOptions {
  searchInputRef: RefObject<HTMLInputElement | null>;
  onNavigateOut: () => void;
}

export interface CourseRowActions {
  startDelete: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
  startDuplicate: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
  showToast: (message: string, variant?: "success" | "error") => void;
  overlays: ReactNode;
}

export function useCourseRowActions({ searchInputRef, onNavigateOut }: UseCourseRowActionsOptions): CourseRowActions {
  const { t } = useTranslation(["courses", "common"]);
  const navigate = useNavigate();
  const deleteMutation = useDeleteCourse();
  const copyMutation = useCopyCourse();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [deleteTargetCourse, setDeleteTargetCourse] = useState<CourseResponse | undefined>(undefined);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | undefined>(undefined);
  const [copyConfirmOpen, setCopyConfirmOpen] = useState<boolean>(false);
  const [copyTargetCourse, setCopyTargetCourse] = useState<CourseResponse | undefined>(undefined);
  const [copyErrorMessage, setCopyErrorMessage] = useState<string | undefined>(undefined);
  const [isCopyPending, setIsCopyPending] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState>({ message: "", visible: false, variant: "success" });

  const toastTimeoutRef = useRef<number | undefined>(undefined);
  const deleteInvokerRef = useRef<HTMLElement | null>(null);
  const duplicateInvokerRef = useRef<HTMLElement | null>(null);
  const deleteSuccessRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const operationGenerationRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      operationGenerationRef.current++;
    };
  }, []);

  const showToast = (message: string, variant: "success" | "error" = "success"): void => {
    setToast({ message, visible: true, variant });
    window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToast((previous: ToastState) => ({ ...previous, visible: false })), 3000);
  };

  const connectedOrSearch = (invoker: HTMLElement | null): HTMLElement | null => (invoker && invoker.isConnected ? invoker : searchInputRef.current);
  const getDeleteFinalFocus = (): HTMLElement | null => (deleteSuccessRef.current ? searchInputRef.current : connectedOrSearch(deleteInvokerRef.current));
  const getDuplicateFinalFocus = (): HTMLElement | null => connectedOrSearch(duplicateInvokerRef.current);

  const startDuplicate = (course: CourseResponse, triggerElement?: HTMLElement | null): void => {
    duplicateInvokerRef.current = triggerElement ?? null;
    setCopyTargetCourse(course);
    setCopyErrorMessage(undefined);
    setCopyConfirmOpen(true);
  };

  const cancelDuplicate = (): void => {
    if (isCopyPending) return;
    operationGenerationRef.current++;
    setCopyConfirmOpen(false);
    setCopyErrorMessage(undefined);
  };

  const confirmCopy = async (): Promise<void> => {
    if (!copyTargetCourse || isCopyPending) return;
    const operationGeneration: number = ++operationGenerationRef.current;
    const isStale = (): boolean => !isMountedRef.current || operationGenerationRef.current !== operationGeneration;
    setCopyErrorMessage(undefined);
    setIsCopyPending(true);
    try {
      let schedule: CourseScheduleResponse[];
      try {
        schedule = await getCourseSchedule(copyTargetCourse.id);
      } catch {
        if (isStale()) return;
        setCopyErrorMessage(t("courseCopyError"));
        setIsCopyPending(false);
        return;
      }
      if (isStale()) return;
      if (!schedule || schedule.length === 0) {
        setCopyErrorMessage(t("courseCopyMissingSchedule"));
        setIsCopyPending(false);
        return;
      }
      const payload: CourseCreate = {
        title: `${copyTargetCourse.title} (${t("copySuffix")})`,
        description: copyTargetCourse.description ?? "",
        start_date: copyTargetCourse.start_date,
        end_date: copyTargetCourse.end_date,
        exam_type: copyTargetCourse.exam_type,
        price: copyTargetCourse.price,
        mentor_id: copyTargetCourse.mentor_id,
        schedules: schedule.map((entry: CourseScheduleResponse) => ({
          day_of_week: entry.day_of_week,
          time_start: entry.time_start,
          time_end: entry.time_end,
        })),
      };
      const created = await copyMutation.mutateAsync({ id: copyTargetCourse.id, payload });
      if (isStale()) return;
      setCopyConfirmOpen(false);
      setCopyTargetCourse(undefined);
      setCopyErrorMessage(undefined);
      showToast(t("courseCopied"));
      onNavigateOut();
      navigate(`/courses/${created.id}`);
    } catch {
      if (isStale()) return;
      setCopyErrorMessage(t("courseCopyError"));
    } finally {
      if (isMountedRef.current && operationGenerationRef.current === operationGeneration) setIsCopyPending(false);
    }
  };

  const startDelete = (course: CourseResponse, triggerElement?: HTMLElement | null): void => {
    deleteInvokerRef.current = triggerElement ?? null;
    deleteSuccessRef.current = false;
    setDeleteTargetCourse(course);
    setDeleteErrorMessage(undefined);
    setDeleteConfirmOpen(true);
  };

  const cancelDelete = (): void => {
    if (deleteMutation.isPending) return;
    operationGenerationRef.current++;
    setDeleteConfirmOpen(false);
    setDeleteErrorMessage(undefined);
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTargetCourse || deleteMutation.isPending) return;
    const operationGeneration: number = ++operationGenerationRef.current;
    setDeleteErrorMessage(undefined);
    try {
      await deleteMutation.mutateAsync(deleteTargetCourse.id);
      if (!isMountedRef.current || operationGenerationRef.current !== operationGeneration) return;
      deleteSuccessRef.current = true;
      setDeleteConfirmOpen(false);
      setDeleteErrorMessage(undefined);
      showToast(t("courseDeleted"));
    } catch {
      if (!isMountedRef.current || operationGenerationRef.current !== operationGeneration) return;
      setDeleteErrorMessage(t("courseDeleteError"));
    }
  };

  const overlays: ReactNode = (
    <>
      {toast.visible && (
        <div
          role="status"
          aria-live="polite"
          className={[
            "fixed bottom-[calc(var(--bottom-navigation-height,64px)+16px)] right-4 z-60 rounded-xl px-4 py-3 text-sm font-medium shadow-lg motion-safe:animate-[card-scale-in_200ms_ease-out] lg:bottom-6 lg:right-6",
            toast.variant === "success" ? "bg-maroon text-on-primary" : "bg-destructive text-on-destructive",
          ].join(" ")}
        >
          {toast.message}
        </div>
      )}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t("deleteTitle")}
        message={deleteTargetCourse ? t("deleteMsg", { title: deleteTargetCourse.title }) : ""}
        confirmLabel={t("delete")}
        cancelLabel={t("common:cancel")}
        pending={deleteMutation.isPending}
        errorMessage={deleteErrorMessage}
        finalFocus={getDeleteFinalFocus}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
      <ConfirmDialog
        open={copyConfirmOpen}
        title={t("duplicateTitle")}
        message={copyTargetCourse ? t("duplicateMsg", { title: copyTargetCourse.title }) : ""}
        confirmVariant="primary"
        confirmLabel={t("duplicate")}
        cancelLabel={t("common:cancel")}
        pending={isCopyPending}
        errorMessage={copyErrorMessage}
        finalFocus={getDuplicateFinalFocus}
        onConfirm={confirmCopy}
        onCancel={cancelDuplicate}
      />
    </>
  );

  return { startDelete, startDuplicate, showToast, overlays };
}

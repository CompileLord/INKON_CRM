import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCopyCourse, useDeleteCourse } from "../../lib/courses/hooks";
import { getCourseSchedule } from "../../lib/courses/endpoints";
import { getSafeCourseReturnUrl } from "../../lib/courses/returnContext";
import type { CourseCreate, CourseResponse, CourseScheduleCreate } from "../../lib/courses/types";

export interface CourseActions {
  editOpen: boolean;
  copyConfirmOpen: boolean;
  deleteConfirmOpen: boolean;
  isCopyPending: boolean;
  isDeletePending: boolean;
  copyErrorMessage: string | undefined;
  deleteErrorMessage: string | undefined;
  openEdit: () => void;
  closeEdit: () => void;
  openDuplicate: () => void;
  openDelete: () => void;
  confirmDuplicate: () => Promise<void>;
  cancelDuplicate: () => void;
  confirmDelete: () => Promise<void>;
  cancelDelete: () => void;
  isOperationLive: (generation: number) => boolean;
  editGeneration: () => number;
}

export function useCourseActions(course: CourseResponse | undefined): CourseActions {
  const { t } = useTranslation("courseDetail");
  const navigate = useNavigate();
  const copyMutation = useCopyCourse();
  const deleteMutation = useDeleteCourse();

  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [copyConfirmOpen, setCopyConfirmOpen] = useState<boolean>(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [isCopyPending, setIsCopyPending] = useState<boolean>(false);
  const [copyErrorMessage, setCopyErrorMessage] = useState<string | undefined>(undefined);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | undefined>(undefined);

  const isMountedRef = useRef<boolean>(true);
  const generationRef = useRef<number>(0);
  const editGenerationRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  const isOperationLive = (generation: number): boolean => isMountedRef.current && generationRef.current === generation;

  const loadScheduleForCopy = async (courseId: number): Promise<CourseScheduleCreate[] | null> => {
    try {
      const rawSchedule = await getCourseSchedule(courseId);
      if (!Array.isArray(rawSchedule)) return [];
      return rawSchedule.map((row) => ({ day_of_week: row.day_of_week, time_start: row.time_start, time_end: row.time_end }));
    } catch {
      return null;
    }
  };

  const confirmDuplicate = async (): Promise<void> => {
    if (!course || isCopyPending) return;
    const generation: number = generationRef.current;
    setIsCopyPending(true);
    setCopyErrorMessage(undefined);
    try {
      const schedules: CourseScheduleCreate[] | null = await loadScheduleForCopy(course.id);
      if (!isOperationLive(generation)) return;
      if (schedules === null) {
        setCopyErrorMessage(t("duplicate.error"));
        return;
      }
      if (schedules.length === 0) {
        setCopyErrorMessage(t("duplicate.missingSchedule"));
        return;
      }
      const payload: CourseCreate = {
        title: `${course.title} (${t("duplicate.suffix")})`,
        description: course.description ?? "",
        start_date: course.start_date,
        end_date: course.end_date,
        exam_type: course.exam_type,
        price: course.price,
        mentor_id: course.mentor_id,
        schedules,
      };
      const copied: CourseResponse = await copyMutation.mutateAsync({ id: course.id, payload });
      if (!isOperationLive(generation)) return;
      setCopyConfirmOpen(false);
      navigate(`/courses/${copied.id}`);
    } catch {
      if (isOperationLive(generation)) setCopyErrorMessage(t("duplicate.error"));
    } finally {
      if (isOperationLive(generation)) setIsCopyPending(false);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!course || deleteMutation.isPending) return;
    const generation: number = generationRef.current;
    setDeleteErrorMessage(undefined);
    try {
      await deleteMutation.mutateAsync(course.id);
      if (!isOperationLive(generation)) return;
      setDeleteConfirmOpen(false);
      navigate(getSafeCourseReturnUrl(), { replace: true });
    } catch {
      if (isOperationLive(generation)) setDeleteErrorMessage(t("delete.error"));
    }
  };

  return {
    editOpen,
    copyConfirmOpen,
    deleteConfirmOpen,
    isCopyPending,
    isDeletePending: deleteMutation.isPending,
    copyErrorMessage,
    deleteErrorMessage,
    openEdit: () => {
      editGenerationRef.current = generationRef.current;
      setEditOpen(true);
    },
    closeEdit: () => setEditOpen(false),
    openDuplicate: () => {
      setCopyErrorMessage(undefined);
      setCopyConfirmOpen(true);
    },
    openDelete: () => {
      setDeleteErrorMessage(undefined);
      setDeleteConfirmOpen(true);
    },
    confirmDuplicate,
    cancelDuplicate: () => {
      if (isCopyPending) return;
      setCopyConfirmOpen(false);
      setCopyErrorMessage(undefined);
    },
    confirmDelete,
    cancelDelete: () => {
      if (deleteMutation.isPending) return;
      setDeleteConfirmOpen(false);
      setDeleteErrorMessage(undefined);
    },
    isOperationLive,
    editGeneration: () => editGenerationRef.current,
  };
}

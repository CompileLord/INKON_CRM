import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { QueryObserverResult } from "@tanstack/react-query";
import { locateRosterStudent } from "../../lib/enrollments/endpoints";
import type { CourseRosterResponse, EnrollmentStatus } from "../../lib/enrollments/types";
import type { CourseRosterSortOption } from "./CourseRosterSection";

interface RosterEnrollFlowInput {
  courseId: number;
  sortOption: CourseRosterSortOption;
  rosterData: CourseRosterResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => Promise<QueryObserverResult<CourseRosterResponse, Error>>;
  onToast: (message: string, variant: "success" | "error") => void;
  onSearchQueryChange: (query: string) => void;
  onStatusFilterChange: (status: EnrollmentStatus | undefined) => void;
  onPageChange: (page: number) => void;
  focusEnrollButton: () => void;
}

export interface RosterEnrollFlow {
  enrollRefreshErrorStudentId: number | null;
  isRetryingEnrollRefresh: boolean;
  isLocating: boolean;
  showHiddenNotice: boolean;
  highlightedStudentId: number | null;
  registerStudentName: (studentId: number, element: HTMLElement | null) => void;
  handleEnrolled: (studentId: number) => Promise<void>;
  retryRefresh: () => Promise<void>;
  dismissRefreshError: () => void;
  locateEnrolledStudent: () => Promise<void>;
  dismissHiddenNotice: () => void;
}

export function useRosterEnrollFlow(input: RosterEnrollFlowInput): RosterEnrollFlow {
  const { t } = useTranslation("courseDetail");
  const { rosterData, isLoading, isFetching, isError } = input;
  const [newlyEnrolledStudentId, setNewlyEnrolledStudentId] = useState<number | null>(null);
  const [enrollRefreshErrorStudentId, setEnrollRefreshErrorStudentId] = useState<number | null>(null);
  const [isRetryingEnrollRefresh, setIsRetryingEnrollRefresh] = useState<boolean>(false);
  const [pendingRevealStudentId, setPendingRevealStudentId] = useState<number | null>(null);
  const [highlightedStudentId, setHighlightedStudentId] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const nameRefs = useRef<Map<number, HTMLElement>>(new Map());

  useEffect(() => {
    if (!rosterData || pendingRevealStudentId === null || isLoading || isFetching) return;
    if (!rosterData.items.some((item) => item.student_id === pendingRevealStudentId)) return;
    setHighlightedStudentId(pendingRevealStudentId);
    setPendingRevealStudentId(null);
    const target: HTMLElement | undefined = nameRefs.current.get(pendingRevealStudentId);
    (target?.closest("a") ?? target)?.focus();
  }, [rosterData, pendingRevealStudentId, isLoading, isFetching]);

  useEffect(() => {
    if (newlyEnrolledStudentId === null || !rosterData) return;
    if (rosterData.items.some((item) => item.student_id === newlyEnrolledStudentId)) setNewlyEnrolledStudentId(null);
  }, [newlyEnrolledStudentId, rosterData]);

  const settleAfterRefresh = (studentId: number, items: { student_id: number }[]): void => {
    setNewlyEnrolledStudentId(items.some((item) => item.student_id === studentId) ? null : studentId);
  };

  const handleEnrolled = async (studentId: number): Promise<void> => {
    input.onToast(t("students.enrolledToast"), "success");
    setEnrollRefreshErrorStudentId(null);
    try {
      const result = await input.refetch();
      if (result.isError || !result.data) {
        setNewlyEnrolledStudentId(null);
        setEnrollRefreshErrorStudentId(studentId);
      } else {
        settleAfterRefresh(studentId, result.data.items ?? []);
      }
    } catch {
      setNewlyEnrolledStudentId(null);
      setEnrollRefreshErrorStudentId(studentId);
    }
    input.focusEnrollButton();
  };

  const retryRefresh = async (): Promise<void> => {
    if (!enrollRefreshErrorStudentId || isRetryingEnrollRefresh) return;
    const targetStudentId: number = enrollRefreshErrorStudentId;
    setIsRetryingEnrollRefresh(true);
    try {
      const result = await input.refetch();
      if (result.isError || !result.data) {
        input.onToast(t("students.loadError"), "error");
      } else {
        setEnrollRefreshErrorStudentId(null);
        settleAfterRefresh(targetStudentId, result.data.items ?? []);
      }
    } catch {
      input.onToast(t("students.loadError"), "error");
    } finally {
      setIsRetryingEnrollRefresh(false);
    }
  };

  const locateEnrolledStudent = async (): Promise<void> => {
    if (!newlyEnrolledStudentId || isLocating) return;
    const targetId: number = newlyEnrolledStudentId;
    setIsLocating(true);
    try {
      const location = await locateRosterStudent(input.courseId, targetId, { page_size: 10, sort: input.sortOption });
      setPendingRevealStudentId(targetId);
      setNewlyEnrolledStudentId(null);
      input.onSearchQueryChange("");
      input.onStatusFilterChange(undefined);
      input.onPageChange(location.page);
    } catch {
      input.onToast(t("students.loadError"), "error");
    } finally {
      setIsLocating(false);
    }
  };

  return {
    enrollRefreshErrorStudentId,
    isRetryingEnrollRefresh,
    isLocating,
    showHiddenNotice:
      newlyEnrolledStudentId !== null &&
      enrollRefreshErrorStudentId === null &&
      !isError &&
      !isLoading &&
      !isFetching &&
      !rosterData?.items.some((item) => item.student_id === newlyEnrolledStudentId),
    highlightedStudentId,
    registerStudentName: (studentId: number, element: HTMLElement | null): void => {
      if (element) nameRefs.current.set(studentId, element);
      else nameRefs.current.delete(studentId);
    },
    handleEnrolled,
    retryRefresh,
    dismissRefreshError: () => {
      setEnrollRefreshErrorStudentId(null);
      input.focusEnrollButton();
    },
    locateEnrolledStudent,
    dismissHiddenNotice: () => {
      setNewlyEnrolledStudentId(null);
      input.focusEnrollButton();
    },
  };
}

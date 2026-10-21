import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDeleteUser } from "../../lib/users/hooks";
import { fetchFilteredEnrollments } from "../../lib/enrollments/hooks";
import { withdrawEnrollment } from "../../lib/enrollments/endpoints";
import type { User } from "../../lib/users/types";
import type { EnrollmentResponse } from "../../lib/enrollments/types";

interface StudentDeletionInput {
  isSuperAdmin: boolean;
  isLiveOwner: () => boolean;
  returnTarget: { to: string; state?: unknown };
}

export interface StudentDeletion {
  deleteTarget: User | null;
  deleteError: string | null;
  isDeleting: boolean;
  requestDelete: (student: User) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
  reset: (abandonOperation: boolean) => void;
  abandonOperations: () => void;
}

export function useStudentDeletion({ isSuperAdmin, isLiveOwner, returnTarget }: StudentDeletionInput): StudentDeletion {
  const { t } = useTranslation("students");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deleteUser = useDeleteUser("student");
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const deleteLockRef = useRef<boolean>(false);
  const deleteOperationRef = useRef<number>(0);

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget || deleteLockRef.current || !isLiveOwner() || !isSuperAdmin) return;
    const operationGeneration: number = ++deleteOperationRef.current;
    const targetStudentId: number = deleteTarget.id;
    const isCurrentOperationOwner = (): boolean => isLiveOwner() && deleteOperationRef.current === operationGeneration;
    const reconcileStudentState = (): void => {
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["users", "students", "profile", targetStudentId] });
    };
    deleteLockRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      let enrollments: EnrollmentResponse[] = [];
      try {
        enrollments = await fetchFilteredEnrollments({ student_id: targetStudentId });
      } catch {
        if (isCurrentOperationOwner()) setDeleteError(t("form.deleteWithdrawError"));
        return;
      }
      if (!isCurrentOperationOwner()) return;

      const activeEnrollmentIds: number[] = (enrollments ?? []).filter((enrollment: EnrollmentResponse) => enrollment.status === "active").map((enrollment: EnrollmentResponse) => enrollment.id);
      let withdrawnCount: number = 0;
      for (const enrollmentId of activeEnrollmentIds) {
        try {
          if (!isCurrentOperationOwner()) return;
          await withdrawEnrollment(enrollmentId);
          withdrawnCount++;
          if (!isCurrentOperationOwner()) {
            reconcileStudentState();
            return;
          }
        } catch {
          reconcileStudentState();
          if (isCurrentOperationOwner()) setDeleteError(withdrawnCount > 0 ? t("form.deleteFailedAfterWithdraw") : t("form.deleteWithdrawError"));
          return;
        }
      }

      try {
        if (!isCurrentOperationOwner()) return;
        await deleteUser.mutateAsync(targetStudentId);
        reconcileStudentState();
      } catch {
        reconcileStudentState();
        if (isCurrentOperationOwner()) setDeleteError(withdrawnCount > 0 ? t("form.deleteFailedAfterWithdraw") : t("form.deleteAccountError"));
        return;
      }
      if (!isCurrentOperationOwner()) return;

      setDeleteTarget(null);
      setDeleteError(null);
      navigate(returnTarget.to, { state: returnTarget.state });
    } finally {
      if (isCurrentOperationOwner()) {
        deleteLockRef.current = false;
        setIsDeleting(false);
      }
    }
  };

  return {
    deleteTarget,
    deleteError,
    isDeleting,
    requestDelete: (student: User) => setDeleteTarget(student),
    cancelDelete: () => {
      setDeleteTarget(null);
      setDeleteError(null);
    },
    confirmDelete,
    reset: (abandonOperation: boolean) => {
      if (abandonOperation) deleteOperationRef.current += 1;
      deleteLockRef.current = false;
      setIsDeleting(false);
      setDeleteTarget(null);
      setDeleteError(null);
    },
    abandonOperations: () => {
      deleteOperationRef.current += 1;
    },
  };
}

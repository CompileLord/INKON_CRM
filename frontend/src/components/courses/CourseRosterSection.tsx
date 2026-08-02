import { useState } from "react";
import { AlertCircle, UserPlus, Users } from "lucide-react";
import { PersonAvatar } from "../ui/PersonAvatar";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Button } from "../ui/Button";
import { EnrollmentStatusBadge } from "../enrollments/EnrollmentStatusBadge";
import { EnrollStudentModal } from "./EnrollStudentModal";
import { useCourseRoster, useEnrollStudent, useWithdrawEnrollment } from "../../lib/enrollments/hooks";
import { resolveMediaUrl } from "../../lib/users/media";
import { formatMoney } from "../../lib/money";
import type { CourseRosterRow } from "../../lib/enrollments/hooks";

import { useAuthStore } from "../../store/authStore";

interface CourseRosterSectionProps {
  courseId: number;
  onToast: (message: string, variant: "success" | "error") => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function CourseRosterSection({ courseId, onToast }: CourseRosterSectionProps) {
  const role = useAuthStore((s) => s.role);
  const isSuperAdmin = role === "superadmin";

  const { rows, unresolvedCount, isLoading, isError, refetch } = useCourseRoster(courseId);
  const enrollStudent = useEnrollStudent();
  const withdrawEnrollment = useWithdrawEnrollment();

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState<CourseRosterRow | null>(null);

  const handleEnroll = (studentId: number) => {
    enrollStudent.mutate(
      { student_id: studentId, course_id: courseId },
      {
        onSuccess: () => {
          setEnrollOpen(false);
          onToast("Студент записан на курс", "success");
        },
        onError: () => onToast("Не удалось записать студента", "error"),
      },
    );
  };

  const handleWithdraw = () => {
    if (!withdrawTarget) return;
    withdrawEnrollment.mutate(
      {
        id: withdrawTarget.enrollment.id,
        studentId: withdrawTarget.enrollment.student_id,
        courseId: withdrawTarget.enrollment.course_id,
      },
      {
        onSuccess: () => {
          setWithdrawTarget(null);
          onToast("Студент отчислился", "success");
        },
        onError: () => onToast("Не удалось отчислить студента", "error"),
      },
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border-warm bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-warm bg-strip px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-maroon" />
          <h3 className="text-[15px] font-semibold text-ink">Студенты курса</h3>
        </div>
        {isSuperAdmin && (
          <Button variant="secondary" onClick={() => setEnrollOpen(true)}>
            <UserPlus size={15} className="mr-1.5" />
            Записать студента
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2 p-5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-beige/60" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
          <AlertCircle size={20} className="text-red-600" />
          <p className="text-sm text-muted">Не удалось загрузить список студентов</p>
          <Button type="button" variant="secondary" onClick={() => refetch()}>
            Повторить
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">На курс пока никто не записан</p>
      ) : (
        <>
          {unresolvedCount > 0 && (
            <p className="border-b border-beige bg-strip px-5 py-2 text-xs text-muted">
              {unresolvedCount} {unresolvedCount === 1 ? "запись" : "записи"} не удалось сопоставить со
              студентом (возможно, студент был удалён) — скрыто из списка
            </p>
          )}
          <ul className="divide-y divide-beige">
          {rows.map(({ enrollment, student, avgScore }) => (
            <li
              key={enrollment.id}
              className="flex items-center gap-3 px-5 py-3"
              style={{ borderLeft: `3px solid ${enrollment.color_hex}` }}
            >
              <PersonAvatar
                firstName={student.first_name}
                lastName={student.last_name}
                photoUrl={resolveMediaUrl(student.thumbnail_path) ?? undefined}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {student.first_name} {student.last_name}
                </p>
                <p className="truncate text-xs text-muted">
                  {student.email} · Ср. балл {avgScore.toFixed(1)}
                </p>
              </div>
              <span className="hidden shrink-0 text-xs text-muted sm:block">
                Записан {formatDateTime(enrollment.enrolled_at)}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-maroon">
                {formatMoney(enrollment.price_at_enrollment)}
              </span>
              <EnrollmentStatusBadge status={enrollment.status} />
              {isSuperAdmin && enrollment.status === "active" && (
                <button
                  type="button"
                  onClick={() => setWithdrawTarget({ enrollment, student, avgScore })}
                  className="shrink-0 rounded-lg border border-border-warm bg-card px-2.5 py-1.5 text-xs font-medium text-nav transition-colors duration-150 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  Отчислить
                </button>
              )}
            </li>
          ))}
          </ul>
        </>
      )}

      <EnrollStudentModal
        open={enrollOpen}
        excludeIds={new Set(rows.filter((r) => r.enrollment.status === "active").map((r) => r.student.id))}
        pending={enrollStudent.isPending}
        onClose={() => setEnrollOpen(false)}
        onSelect={(student) => handleEnroll(student.id)}
      />

      <ConfirmDialog
        open={withdrawTarget !== null}
        title="Отчислить студента"
        message={
          withdrawTarget
            ? `Отчислить ${withdrawTarget.student.first_name} ${withdrawTarget.student.last_name} с курса? Это действие нельзя отменить.`
            : ""
        }
        confirmLabel="Отчислить"
        pending={withdrawEnrollment.isPending}
        onConfirm={handleWithdraw}
        onCancel={() => setWithdrawTarget(null)}
      />
    </div>
  );
}

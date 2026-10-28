import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { SectionCard } from "../ui/SectionCard";
import { EnrollNewStudentFlow } from "../students/EnrollNewStudentFlow";
import { StudentCourseCard } from "./StudentCourseCard";
import { useCourses } from "../../lib/courses/hooks";
import { useMentors } from "../../lib/users/hooks";
import { useStudentCourseBalances } from "../../lib/students/useStudentCourseBalances";
import type { CourseListItemResponse } from "../../lib/courses/types";
import type { StudentCourseProfile, User } from "../../lib/users/types";

interface StudentCoursesTabProps {
  courses: StudentCourseProfile[];
  student: User;
  role: string | null;
  currentUserId: number | null;
  onEnrolled?: () => void;
}

export function StudentCoursesTab({ courses, student, role, currentUserId, onEnrolled }: StudentCoursesTabProps) {
  const { t } = useTranslation(["studentProfile", "common"]);
  const isSuperAdmin: boolean = role === "superadmin";
  const [isEnrollOpen, setIsEnrollOpen] = useState<boolean>(false);
  const balances = useStudentCourseBalances(student.id, isSuperAdmin && courses.length > 0);
  const courseList = useCourses({ page_size: 100 });
  const mentors = useMentors({ page_size: 100 }, isSuperAdmin && courses.length > 0);

  const schedulesFor = (courseId: number) => (courseList.data?.items ?? []).find((course: CourseListItemResponse) => course.id === courseId)?.schedules ?? [];
  const mentorNameFor = (mentorId: number): string | null => {
    const mentor: User | undefined = mentors.data?.items.find((candidate: User) => candidate.id === mentorId);
    return mentor ? `${mentor.first_name} ${mentor.last_name}`.trim() : null;
  };

  const enrollButton = isSuperAdmin ? (
    <Button type="button" variant="secondary" onClick={() => setIsEnrollOpen(true)}>
      <Plus size={16} aria-hidden="true" />
      {t("courses.enroll")}
    </Button>
  ) : undefined;

  const flow = isSuperAdmin ? (
    <EnrollNewStudentFlow
      open={isEnrollOpen}
      student={student}
      isJustCreated={false}
      onFinish={() => {
        setIsEnrollOpen(false);
        onEnrolled?.();
      }}
    />
  ) : null;

  if (courses.length === 0) {
    return (
      <>
        <div className="rounded-2xl border border-border bg-card">
          <EmptyState title={t("courses.emptyTitle")} description={t(role === "student" ? "courses.emptyStudent" : "courses.empty")} action={enrollButton} />
        </div>
        {flow}
      </>
    );
  }

  return (
    <SectionCard title={t("tabs.courses")} actions={enrollButton}>
      <ul className="flex flex-col divide-y divide-border">
        {courses.map((item: StudentCourseProfile) => (
          <StudentCourseCard
            key={item.course.id}
            item={item}
            role={role}
            currentUserId={currentUserId}
            mentorName={mentorNameFor(item.course.mentor_id)}
            schedules={schedulesFor(item.course.id)}
            balance={balances.data?.get(item.course.id)}
          />
        ))}
      </ul>
      {flow}
    </SectionCard>
  );
}

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { ListboxPicker, type ListboxOption } from "../ui/ListboxPicker";
import { EnrollStudentModal } from "../courses/EnrollStudentModal";
import { useCourses } from "../../lib/courses/hooks";
import type { CourseListItemResponse } from "../../lib/courses/types";
import type { EligibleCandidateResponse } from "../../lib/enrollments/types";
import type { User } from "../../lib/users/types";

interface EnrollNewStudentFlowProps {
  open: boolean;
  student: User;
  isJustCreated?: boolean;
  onFinish: () => void;
}

export function EnrollNewStudentFlow({ open, student, isJustCreated = true, onFinish }: EnrollNewStudentFlowProps) {
  const { t } = useTranslation(["students", "common"]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [isEnrollOpen, setIsEnrollOpen] = useState<boolean>(false);
  const studentName: string = `${student.first_name} ${student.last_name}`;
  const initialStudent: EligibleCandidateResponse = useMemo(
    () => ({ id: student.id, first_name: student.first_name, last_name: student.last_name, email: student.email, phone: student.phone, photo_path: student.photo_path, thumbnail_path: student.thumbnail_path }),
    [student],
  );
  const courses = useCourses({ status: "active", page_size: 100 });

  const courseItems: readonly CourseListItemResponse[] = courses.data?.items ?? [];
  const options: readonly ListboxOption[] = useMemo(
    () => courseItems.map((course) => ({ value: String(course.id), label: course.title })),
    [courseItems],
  );
  const selectedCourse: CourseListItemResponse | undefined = courseItems.find((course) => String(course.id) === selectedCourseId);

  return (
    <>
      <Modal
        open={open && !isEnrollOpen}
        onClose={onFinish}
        title={t(isJustCreated ? "enrollPrompt.title" : "enrollPrompt.profileTitle")}
        footer={
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onFinish}>{t(isJustCreated ? "enrollPrompt.skip" : "common:cancel")}</Button>
            <Button type="button" disabled={selectedCourse === undefined} disabledReason={t("common:disabledReason.selectCourse")} onClick={() => setIsEnrollOpen(true)}>{t("enrollPrompt.continue")}</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {isJustCreated && <p className="text-sm text-muted">{t("enrollPrompt.description", { name: studentName })}</p>}
          <ListboxPicker
            layout="field"
            label={t("enrollPrompt.courseLabel")}
            ariaLabel={t("enrollPrompt.courseLabel")}
            icon={null}
            options={options}
            value={selectedCourseId}
            placeholder={t("enrollPrompt.coursePlaceholder")}
            onChange={setSelectedCourseId}
          />
        </div>
      </Modal>
      {selectedCourse !== undefined && (
        <EnrollStudentModal
          open={open && isEnrollOpen}
          courseId={selectedCourse.id}
          courseTitle={selectedCourse.title}
          coursePrice={selectedCourse.price}
          initialStudent={initialStudent}
          onClose={onFinish}
          onEnrolled={onFinish}
        />
      )}
    </>
  );
}

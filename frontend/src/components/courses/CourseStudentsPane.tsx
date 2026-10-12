import { CourseRosterSection } from "./CourseRosterSection";

interface CourseStudentsPaneProps {
  courseId: number;
  onToast: (message: string, variant: "success" | "error") => void;
  onReady?: () => void;
}

export function CourseStudentsPane({
  courseId,
  onToast,
  onReady,
}: CourseStudentsPaneProps) {
  return <CourseRosterSection courseId={courseId} onToast={onToast} onReady={onReady} />;
}

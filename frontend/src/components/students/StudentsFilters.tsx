import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { ListboxPicker, type ListboxOption } from "../ui/ListboxPicker";
import type { CourseListItemResponse } from "../../lib/courses/types";
import type { StudentPaymentStatus } from "../../lib/users/types";
import { ALL_FILTER_VALUE, PAYMENT_STATUSES } from "./studentFilterValues";

interface StudentsFiltersProps {
  courses: readonly CourseListItemResponse[];
  courseId: number | undefined;
  paymentStatus: StudentPaymentStatus | undefined;
  hasActiveFilters: boolean;
  onChange: (key: "course" | "payment", value: string) => void;
  onReset: () => void;
}

export function StudentsFilters({ courses, courseId, paymentStatus, hasActiveFilters, onChange, onReset }: StudentsFiltersProps) {
  const { t } = useTranslation("students");
  const courseOptions: readonly ListboxOption[] = [
    { value: ALL_FILTER_VALUE, label: t("filters.allCourses") },
    ...courses.map((course) => ({ value: String(course.id), label: course.title })),
  ];
  const paymentOptions: readonly ListboxOption[] = [
    { value: ALL_FILTER_VALUE, label: t("filters.all") },
    ...PAYMENT_STATUSES.map((status) => ({ value: status, label: t(`filters.${status}`) })),
  ];

  return (
    <>
      <ListboxPicker
        label={t("filters.course")}
        icon={null}
        options={courseOptions}
        value={courseId === undefined ? ALL_FILTER_VALUE : String(courseId)}
        onChange={(value: string) => onChange("course", value)}
      />
      <ListboxPicker
        label={t("filters.payment")}
        icon={null}
        options={paymentOptions}
        value={paymentStatus ?? ALL_FILTER_VALUE}
        onChange={(value: string) => onChange("payment", value)}
      />
      {hasActiveFilters && (
        <Button type="button" variant="secondary" onClick={onReset}>
          <RotateCcw size={14} aria-hidden="true" />
          {t("filters.reset")}
        </Button>
      )}
    </>
  );
}

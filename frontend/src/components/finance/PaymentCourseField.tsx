import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePayableCourses } from "../../lib/finance/hooks";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";
import { ListboxPicker, type ListboxOption } from "../ui/ListboxPicker";

export const PAYMENT_COURSE_TRIGGER_ID: string = "payment-course";

interface PaymentCourseFieldProps {
  studentId: number;
  courseId: number | null;
  invalid: boolean;
  describedBy?: string;
  onChange: (courseId: number) => void;
}

export function PaymentCourseField({ studentId, courseId, invalid, describedBy, onChange }: PaymentCourseFieldProps) {
  const { t } = useTranslation(["finance", "common"]);
  const courses = usePayableCourses(studentId);
  const options: ListboxOption[] =
    courses.data?.map((course) => ({
      value: String(course.courseId),
      label: course.title ?? t("finance:paymentModal.untitledCourse"),
      muted: course.title === null,
      title: course.title === null ? t("finance:analytics.courseNumber", { id: course.courseId }) : undefined,
    })) ?? [];

  return (
    <div>
      <div className="flex items-center gap-1">
        <label htmlFor={PAYMENT_COURSE_TRIGGER_ID} className="text-sm font-medium text-label">
          {t("finance:paymentModal.priorityCourse")}
        </label>
        <InfoTooltip label={t("finance:overview.aboutMetric", { label: t("finance:paymentModal.priorityCourse") })}>{t("finance:paymentModal.allocationHelp")}</InfoTooltip>
      </div>
      <div className="mt-1">
        {courses.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm text-destructive">
            <p>{t("finance:paymentModal.courseError")}</p>
            <Button variant="secondary" loading={courses.isFetching} onClick={() => void courses.refetch()}>
              {t("common:retry")}
            </Button>
          </div>
        ) : courses.isPending ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">{t("finance:paymentModal.loadingCourses")}</span>
            <div aria-hidden="true" className="h-12 rounded-[10px] bg-strip motion-safe:animate-pulse" />
          </div>
        ) : options.length === 0 ? (
          <p className="rounded-xl bg-strip p-3 text-sm text-muted">{t("finance:paymentModal.noCourses")}</p>
        ) : (
          <ListboxPicker
            layout="field"
            id={PAYMENT_COURSE_TRIGGER_ID}
            label={t("finance:paymentModal.priorityCourse")}
            icon={<BookOpen size={16} />}
            options={options}
            value={courseId === null ? "" : String(courseId)}
            placeholder={t("finance:paymentModal.selectCourse")}
            invalid={invalid}
            describedBy={describedBy}
            onChange={(value) => onChange(Number(value))}
          />
        )}
      </div>
    </div>
  );
}

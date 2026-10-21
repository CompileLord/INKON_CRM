import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { EnrollmentStatusBadge } from "../enrollments/EnrollmentStatusBadge";
import { ListRow } from "../ui/ListRow";
import { PersonAvatar } from "../ui/PersonAvatar";
import { formatDate } from "../../i18n/formatters";
import { formatMoney } from "../../lib/money";
import { resolveMediaUrl } from "../../lib/users/media";
import type { CourseRosterItem } from "../../lib/enrollments/types";

interface CourseRosterRowProps {
  item: CourseRosterItem;
  canOpenProfile: boolean;
  canWithdraw: boolean;
  isHighlighted: boolean;
  registerName: (studentId: number, element: HTMLElement | null) => void;
  onStudentOpen: () => void;
  onWithdraw: (item: CourseRosterItem) => void;
}

export function CourseRosterRow({ item, canOpenProfile, canWithdraw, isHighlighted, registerName, onStudentOpen, onWithdraw }: CourseRosterRowProps) {
  const { t } = useTranslation("courseDetail");
  const studentName: string = `${item.student.first_name} ${item.student.last_name}`.trim();
  const price: string = `${formatMoney(item.price_at_enrollment)} ${t("perMonth")}`;
  const enrolledOn: string = formatDate(item.enrolled_at);

  const content = (
    <span data-testid="student-identity" className="flex min-w-0 items-center gap-3">
      <PersonAvatar
        firstName={item.student.first_name}
        lastName={item.student.last_name}
        photoUrl={resolveMediaUrl(item.student.thumbnail_path ?? item.student.photo_path) ?? undefined}
        size={36}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span ref={(element: HTMLElement | null) => registerName(item.student_id, element)} className="truncate text-sm font-medium text-ink">{studentName}</span>
        <span className="truncate text-xs text-muted">{item.student.email}</span>
        <span className="text-xs tabular-nums text-muted sm:hidden">{price} · {enrolledOn}</span>
      </span>
      <span className="flex shrink-0 items-center gap-4">
        <EnrollmentStatusBadge status={item.status} />
        <span className="hidden flex-col items-end text-right sm:flex">
          <span className="text-sm font-medium tabular-nums text-ink">{price}</span>
          <span className="text-xs tabular-nums text-muted">{enrolledOn}</span>
        </span>
      </span>
    </span>
  );

  const rowClassName: string = isHighlighted ? "rounded-[10px] bg-row-hover ring-2 ring-ring" : "";

  if (!canOpenProfile) {
    return <div data-testid="roster-row" className={`px-3 py-3 ${rowClassName}`}>{content}</div>;
  }

  const recordDeparture = (event: MouseEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest("a") !== null) onStudentOpen();
  };

  return (
    <div data-testid="roster-row" className={rowClassName} onClick={recordDeparture}>
      <ListRow
        to={`/students/${item.student_id}`}
        menuItems={canWithdraw ? [{ key: "withdraw", label: t("students.withdraw"), onSelect: () => onWithdraw(item), destructive: true }] : undefined}
        menuLabel={`${t("students.actions")}: ${studentName}`}
      >
        {content}
      </ListRow>
    </div>
  );
}

export function CourseRosterSkeleton() {
  return (
    <div data-roster-state="loading" aria-busy="true" className="flex flex-col divide-y divide-border">
      {Array.from({ length: 5 }, (_unused: unknown, index: number) => (
        <div key={index} className="flex items-center gap-3 px-3 py-3 motion-safe:animate-pulse">
          <div className="size-9 shrink-0 rounded-full bg-strip" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="h-4 w-40 max-w-full rounded bg-strip" />
            <div className="h-3 w-56 max-w-full rounded bg-strip" />
          </div>
          <div className="h-5 w-16 shrink-0 rounded-full bg-strip" />
        </div>
      ))}
    </div>
  );
}

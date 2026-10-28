import { CanonicalPhone } from "../../lib/users/CanonicalPhone";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EnrollmentStatusBadge } from "../enrollments/EnrollmentStatusBadge";
import { GrantBadge } from "../enrollments/GrantBadge";
import { ListRow } from "../ui/ListRow";
import type { MenuItem } from "../ui/Menu";
import { PersonAvatar } from "../ui/PersonAvatar";
import { formatDate } from "../../i18n/formatters";
import { formatMoney } from "../../lib/money";
import { resolveMediaUrl } from "../../lib/users/media";
import type { CourseRosterItem } from "../../lib/enrollments/types";

interface CourseRosterRowProps {
  item: CourseRosterItem;
  canOpenProfile: boolean;
  canWithdraw: boolean;
  canSwitchBillingMode: boolean;
  isHighlighted: boolean;
  registerName: (studentId: number, element: HTMLElement | null) => void;
  onStudentOpen: () => void;
  onWithdraw: (item: CourseRosterItem) => void;
  onSwitchBillingMode: (item: CourseRosterItem) => void;
}

export function CourseRosterRow({ item, canOpenProfile, canWithdraw, canSwitchBillingMode, isHighlighted, registerName, onStudentOpen, onWithdraw, onSwitchBillingMode }: CourseRosterRowProps) {
  const { t } = useTranslation("courseDetail");
  const { t: tEnrollments } = useTranslation("enrollments");
  const studentName: string = `${item.student.first_name} ${item.student.last_name}`.trim();
  const price: string = `${formatMoney(item.price_at_enrollment)} ${t("perMonth")}`;
  const enrolledOn: string = formatDate(item.enrolled_at);

  const priceOrBadge: ReactNode = item.billing_mode === "grant" ? <GrantBadge billingMode={item.billing_mode} /> : price;

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
        <span className="truncate text-xs text-muted">{item.student.email ?? CanonicalPhone.prefill(item.student.phone)}</span>
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted sm:hidden">{priceOrBadge}<span>{item.billing_mode === "grant" ? enrolledOn : `· ${enrolledOn}`}</span></span>
      </span>
      <span className="flex shrink-0 items-center gap-4">
        <EnrollmentStatusBadge status={item.status} />
        <span className="hidden flex-col items-end text-right sm:flex">
          <span className="flex min-h-5 items-center text-sm font-medium tabular-nums text-ink">{priceOrBadge}</span>
          <span className="text-xs tabular-nums text-muted">{enrolledOn}</span>
        </span>
      </span>
    </span>
  );

  const menuItems: MenuItem[] = [];
  if (canSwitchBillingMode) {
    menuItems.push({
      key: "billing-mode",
      label: tEnrollments(item.billing_mode === "grant" ? "billing.switch.toPaid" : "billing.switch.toGrant"),
      onSelect: () => onSwitchBillingMode(item),
    });
  }
  if (canWithdraw) menuItems.push({ key: "withdraw", label: t("students.withdraw"), onSelect: () => onWithdraw(item), destructive: true });

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
        menuItems={menuItems.length > 0 ? menuItems : undefined}
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

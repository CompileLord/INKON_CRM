import type { MouseEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, Plus, RotateCcw, SearchX, UserX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "../ui/PersonAvatar";
import { Pagination } from "../ui/Pagination";
import { PageSizeListbox } from "../ui/PageSizeListbox";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Button } from "../ui/Button";
import { StudentRowMenu } from "./StudentRowMenu";
import { GuardianPhonePopover } from "./GuardianPhonePopover";
import { PaymentDayChip } from "./PaymentDayChip";
import { StudentStatusPill } from "./StudentStatusPill";
import { ParentLinkBadge } from "./ParentLinkBadge";
import { formatDate, formatNumber } from "../../i18n/formatters";
import { resolveMediaUrl } from "../../lib/users/media";
import type { User } from "../../lib/users/types";

const SKELETON_ROW_COUNT = 5;
const INTERACTIVE_ELEMENT_SELECTOR = "a, button, [role='menuitem'], [role='option']";
const ROW_CLASS =
  "cursor-pointer motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-row-hover";

interface StudentsTableProps {
  students: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  search: string;
  isLoading: boolean;
  isError: boolean;
  hasLoadedOnce?: boolean;
  pageSizeOptions: readonly number[];
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onEdit: (student: User, triggerElement?: HTMLElement | null) => void;
  onDeleteRequest: (student: User, triggerElement?: HTMLElement | null) => void;
  onAddStudent: () => void;
  onClearSearch: () => void;
  onStudentNavigate?: (student: User) => void;
}

export function StudentsTable({
  students,
  total,
  page,
  pageSize,
  totalPages,
  search,
  isLoading,
  isError,
  hasLoadedOnce,
  pageSizeOptions,
  onRetry,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onDeleteRequest,
  onAddStudent,
  onClearSearch,
  onStudentNavigate,
}: StudentsTableProps) {
  const { t, i18n } = useTranslation(["students", "common"]);
  const navigate = useNavigate();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const isSearchActive = search.trim().length > 0;
  const hasRows = students.length > 0;
  const loadedOnce = typeof hasLoadedOnce === "boolean" ? hasLoadedOnce : (hasRows || (!isLoading && !isError));
  const showInitialLoading = isLoading && !loadedOnce;
  const showInitialError = isError && !loadedOnce;
  const showInlineError = isError && loadedOnce;
  const showEmpty = !showInitialLoading && !showInitialError && !hasRows;

  const getStudentNavigationState = (studentId: number) => ({
    fromDirectory: {
      search,
      page,
      pageSize,
      studentId,
    },
    studentId,
  });

  const openStudentProfile = (student: User, event: MouseEvent<HTMLElement>): void => {
    const clickedElement: HTMLElement = event.target as HTMLElement;
    const isInsideRow: boolean = event.currentTarget.contains(clickedElement);
    if (!isInsideRow || clickedElement.closest(INTERACTIVE_ELEMENT_SELECTOR)) return;
    onStudentNavigate?.(student);
    navigate(`/students/${student.id}`, { state: getStudentNavigationState(student.id) });
  };

  const renderName = (student: User): ReactNode => {
    const fullName = `${student.first_name} ${student.last_name}`;
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Link
          to={`/students/${student.id}`}
          state={getStudentNavigationState(student.id)}
          onClick={() => onStudentNavigate?.(student)}
          title={fullName}
          className="min-w-0 truncate rounded text-sm font-semibold text-ink hover:text-maroon-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon"
        >
          {fullName}
        </Link>
        <StudentStatusPill isDeleted={student.is_deleted} />
        <ParentLinkBadge linked={student.parent_linked === true} />
      </div>
    );
  };

  const renderPhone = (student: User, showEmptyDash: boolean = true): ReactNode => (
    <div className="flex min-w-0 items-center gap-1">
      {student.phone ? (
        <a
          href={`tel:${student.phone}`}
          className="inline-flex min-h-11 items-center rounded text-sm font-medium tabular-nums text-ink hover:text-maroon-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon"
        >
          {student.phone}
        </a>
      ) : showEmptyDash ? (
        <span className="inline-flex min-h-11 items-center text-sm text-muted">—</span>
      ) : null}
      {student.parent_phone ? <GuardianPhonePopover guardianPhone={student.parent_phone} /> : null}
    </div>
  );

  const renderStateBody = (): ReactNode => {
    if (showInitialError) {
      return (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle size={24} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-ink">{t("table.error")}</h3>
            <p className="mt-1 text-sm text-muted">{t("table.errorDescription")}</p>
          </div>
          <Button type="button" variant="secondary" onClick={onRetry} className="mt-2 min-h-[44px]">
            <RotateCcw size={16} className="mr-1.5" />
            {t("common:retry")}
          </Button>
        </div>
      );
    }
    if (showEmpty) {
      return (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-strip text-muted">
            {isSearchActive ? <SearchX size={24} /> : <UserX size={24} />}
          </div>
          <div>
            <h3 className="text-base font-semibold text-ink">
              {isSearchActive ? t("emptyNoResultsTitle") : t("emptyNoStudentsTitle")}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {isSearchActive ? t("emptyNoResultsDescription") : t("emptyNoStudentsDescription")}
            </p>
          </div>
          {isSearchActive ? (
            <Button type="button" variant="secondary" onClick={onClearSearch} className="mt-2 min-h-[44px]">
              <RotateCcw size={16} className="mr-1.5" />
              {t("clearSearch")}
            </Button>
          ) : (
            <Button type="button" variant="primary" onClick={onAddStudent} className="mt-2 min-h-[44px]">
              <Plus size={16} className="mr-1.5" />
              {t("addStudent")}
            </Button>
          )}
        </div>
      );
    }
    return null;
  };

  const stateBody: ReactNode = renderStateBody();

  return (
    <div className="overflow-hidden rounded-xl border border-border-warm bg-card">
      {showInlineError ? (
        <div
          role="alert"
          className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 text-sm text-destructive"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={18} className="shrink-0 text-destructive" />
            <span className="font-medium break-words [overflow-wrap:anywhere]">
              {t("table.errorBanner")}
            </span>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={onRetry}
            className="min-h-[36px] py-1 px-3 text-xs shrink-0"
          >
            <RotateCcw size={14} className="mr-1.5" />
            {t("common:retry")}
          </Button>
        </div>
      ) : null}

      <div className="hidden lg:block">
        <table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col />
            <col className="w-[210px]" />
            <col className="w-[150px]" />
            <col className="w-[120px]" />
            <col className="w-[72px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-strip">
              <th className="px-5 py-3 text-sm font-semibold text-muted">{t("table.student")}</th>
              <th className="px-3 py-3 text-sm font-semibold text-muted">{t("table.phone")}</th>
              <th className="px-3 py-3 text-sm font-semibold text-muted">
                <span className="inline-flex items-center gap-2">
                  {t("table.paymentDay")}
                  <InfoTooltip label={t("table.paymentDay")}>{t("table.paymentDayInfo")}</InfoTooltip>
                </span>
              </th>
              <th className="px-3 py-3 text-sm font-semibold text-muted">{t("table.created")}</th>
              <th className="px-3 py-3">
                <span className="sr-only">{t("common:actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {showInitialLoading &&
              Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
                <tr key={rowIndex} className="h-[60px] border-b border-border/60 last:border-b-0" aria-hidden="true">
                  <td className="px-5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 shrink-0 rounded-full bg-beige motion-safe:animate-pulse" />
                      <div className="flex flex-col gap-1.5">
                        <div className="h-3.5 w-36 rounded bg-beige motion-safe:animate-pulse" />
                        <div className="h-3 w-44 rounded bg-beige motion-safe:animate-pulse" />
                      </div>
                    </div>
                  </td>
                  <td className="px-3"><div className="h-4 w-28 rounded bg-beige motion-safe:animate-pulse" /></td>
                  <td className="px-3"><div className="h-6 w-20 rounded-full bg-beige motion-safe:animate-pulse" /></td>
                  <td className="px-3"><div className="h-4 w-20 rounded bg-beige motion-safe:animate-pulse" /></td>
                  <td className="px-3"><div className="ml-auto h-8 w-8 rounded-lg bg-beige motion-safe:animate-pulse" /></td>
                </tr>
              ))}

            {hasRows &&
              students.map((student) => {
                const photoUrl = resolveMediaUrl(student.thumbnail_path ?? student.photo_path) ?? undefined;
                return (
                  <tr
                    key={student.id}
                    id={`student-row-${student.id}`}
                    onClick={(event) => openStudentProfile(student, event)}
                    className={`h-[60px] border-b border-border/60 last:border-b-0 ${ROW_CLASS}`}
                  >
                    <td className="px-5 py-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <PersonAvatar firstName={student.first_name} lastName={student.last_name} photoUrl={photoUrl} />
                        <div className="min-w-0 flex-1">
                          {renderName(student)}
                          <div className="truncate text-xs text-muted" title={student.email}>
                            {student.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">{renderPhone(student)}</td>
                    <td className="px-3 py-2">
                      <PaymentDayChip day={student.payment_day_of_month} />
                    </td>
                    <td className="px-3 py-2 text-sm text-muted tabular-nums">
                      {formatDate(student.created_at, i18n.language)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end">
                        <StudentRowMenu student={student} onEdit={onEdit} onDelete={onDeleteRequest} />
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {stateBody}
      </div>

      <div className="lg:hidden divide-y divide-border">
        {showInitialLoading &&
          Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2 p-4" aria-hidden="true">
              <div className="grid grid-cols-[32px_minmax(0,1fr)_44px] items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-beige motion-safe:animate-pulse" />
                <div className="flex flex-col gap-1.5">
                  <div className="h-4 w-32 rounded-md bg-beige motion-safe:animate-pulse" />
                  <div className="h-3 w-44 rounded-md bg-beige motion-safe:animate-pulse" />
                </div>
                <div className="h-8 w-8 rounded-lg bg-beige motion-safe:animate-pulse" />
              </div>
              <div className="flex items-center justify-between pl-11">
                <div className="h-4 w-28 rounded-md bg-beige motion-safe:animate-pulse" />
                <div className="h-6 w-20 rounded-full bg-beige motion-safe:animate-pulse" />
              </div>
            </div>
          ))}

        {stateBody}

        {hasRows &&
          students.map((student) => {
            const photoUrl = resolveMediaUrl(student.thumbnail_path ?? student.photo_path) ?? undefined;
            return (
              <div
                key={student.id}
                id={`student-card-${student.id}`}
                onClick={(event) => openStudentProfile(student, event)}
                className={`flex flex-col gap-1 px-4 py-3 ${ROW_CLASS}`}
              >
                <div className="grid grid-cols-[32px_minmax(0,1fr)_44px] items-center gap-3">
                  <PersonAvatar firstName={student.first_name} lastName={student.last_name} photoUrl={photoUrl} />
                  <div className="min-w-0">
                    {renderName(student)}
                    <div className="truncate text-xs text-muted" title={student.email}>
                      {student.email}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <StudentRowMenu student={student} onEdit={onEdit} onDelete={onDeleteRequest} />
                  </div>
                </div>
                {student.phone || student.parent_phone || student.payment_day_of_month ? (
                  <div className="flex min-h-11 items-center justify-between gap-3 pl-11">
                    {renderPhone(student, false)}
                    {student.payment_day_of_month ? <PaymentDayChip day={student.payment_day_of_month} /> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2">
        <span className="text-sm text-muted tabular-nums">
          {total === 0
            ? t("table.rangeEmpty")
            : t("table.range", {
                from: formatNumber(from, i18n.language),
                to: formatNumber(to, i18n.language),
                total: formatNumber(total, i18n.language),
              })}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <PageSizeListbox options={pageSizeOptions} value={pageSize} onChange={onPageSizeChange} />
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      </div>
    </div>
  );
}

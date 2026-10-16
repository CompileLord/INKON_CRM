import { Link } from "react-router-dom";
import { AlertCircle, Plus, RotateCcw, SearchX, UserX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "../ui/PersonAvatar";
import { UserStatusBadge } from "../ui/UserStatusBadge";
import { Pagination } from "../ui/Pagination";
import { TableSkeletonRows } from "../ui/TableSkeletonRows";
import { Button } from "../ui/Button";
import { StudentRowMenu } from "./StudentRowMenu";
import { formatDate, formatNumber } from "../../i18n/formatters";
import { resolveMediaUrl } from "../../lib/users/media";
import type { User } from "../../lib/users/types";

const COLUMN_COUNT = 6;

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
  onRetry: () => void;
  onPageChange: (page: number) => void;
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
  onRetry,
  onPageChange,
  onEdit,
  onDeleteRequest,
  onAddStudent,
  onClearSearch,
  onStudentNavigate,
}: StudentsTableProps) {
  const { t, i18n } = useTranslation(["students", "common"]);
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

      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-strip">
              <th className="px-5 py-3 text-sm font-semibold text-muted">{t("table.student")}</th>
              <th className="px-5 py-3 text-sm font-semibold text-muted">{t("table.phone")}</th>
              <th className="px-5 py-3 text-sm font-semibold text-muted">{t("table.paymentDay")}</th>
              <th className="px-5 py-3 text-sm font-semibold text-muted">{t("common:status")}</th>
              <th className="hidden xl:table-cell px-5 py-3 text-sm font-semibold text-muted">
                {t("table.created")}
              </th>
              <th className="px-5 py-3 text-right text-sm font-semibold text-muted">
                {t("common:actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {showInitialLoading && <TableSkeletonRows columns={COLUMN_COUNT} />}

            {showInitialError && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-5 py-12 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
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
                </td>
              </tr>
            )}

            {hasRows &&
              students.map((student) => {
                const fullName = `${student.first_name} ${student.last_name}`;
                const photoUrl = resolveMediaUrl(student.thumbnail_path ?? student.photo_path) ?? undefined;
                const formattedDate = formatDate(student.created_at, i18n.language);

                return (
                  <tr
                    key={student.id}
                    id={`student-row-${student.id}`}
                    className="min-h-[64px] border-b border-border/60 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out last:border-b-0 hover:bg-row-hover"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <PersonAvatar firstName={student.first_name} lastName={student.last_name} photoUrl={photoUrl} />
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/students/${student.id}`}
                            state={getStudentNavigationState(student.id)}
                            onClick={() => onStudentNavigate?.(student)}
                            className="min-h-[44px] inline-flex items-center text-sm font-semibold text-ink hover:text-maroon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon rounded break-words min-w-0 [overflow-wrap:anywhere]"
                          >
                            {fullName}
                          </Link>
                          <div className="text-sm text-muted break-words min-w-0 [overflow-wrap:anywhere]">
                            {student.email}
                          </div>
                          <div className="xl:hidden mt-0.5 text-sm text-muted tabular-nums">
                            {formattedDate}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-ink tabular-nums">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="min-w-0">
                          <span className="text-xs text-muted block">{t("table.studentPhone")}</span>
                          {student.phone ? (
                            <a
                              href={`tel:${student.phone}`}
                              className="min-h-[44px] inline-flex items-center font-medium text-ink hover:text-maroon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon rounded break-words min-w-0 [overflow-wrap:anywhere]"
                            >
                              {student.phone}
                            </a>
                          ) : (
                            <span className="min-h-[44px] inline-flex items-center text-muted">—</span>
                          )}
                        </div>
                        {student.parent_phone ? (
                          <div className="min-w-0">
                            <span className="text-xs text-muted block">{t("table.parentPhone")}</span>
                            <a
                              href={`tel:${student.parent_phone}`}
                              className="min-h-[44px] inline-flex items-center text-muted hover:text-maroon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon rounded break-words min-w-0 [overflow-wrap:anywhere]"
                            >
                              {student.parent_phone}
                            </a>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-ink tabular-nums">
                      {student.payment_day_of_month
                        ? formatNumber(student.payment_day_of_month, i18n.language)
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <UserStatusBadge isDeleted={student.is_deleted} />
                    </td>
                    <td className="hidden xl:table-cell px-5 py-3.5 text-sm text-ink tabular-nums">
                      {formattedDate}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end">
                        <StudentRowMenu student={student} onEdit={onEdit} onDelete={onDeleteRequest} />
                      </div>
                    </td>
                  </tr>
                );
              })}

            {showEmpty && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-5 py-12 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
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
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="lg:hidden divide-y divide-border">
        {showInitialLoading &&
          Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="p-4 flex flex-col gap-3">
              <div className="grid grid-cols-[40px_minmax(0,1fr)_44px] items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-beige motion-safe:animate-pulse" />
                <div className="flex flex-col gap-1.5">
                  <div className="h-4 w-32 rounded-md bg-beige motion-safe:animate-pulse" />
                  <div className="h-3 w-24 rounded-md bg-beige motion-safe:animate-pulse" />
                </div>
                <div className="h-10 w-10 rounded-lg bg-beige motion-safe:animate-pulse" />
              </div>
              <div className="flex justify-between pt-1">
                <div className="h-4 w-16 rounded-md bg-beige motion-safe:animate-pulse" />
                <div className="h-4 w-20 rounded-md bg-beige motion-safe:animate-pulse" />
              </div>
            </div>
          ))}

        {showInitialError && (
          <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle size={24} />
            </div>
            <p className="text-base font-semibold text-ink">{t("table.error")}</p>
            <p className="text-sm text-muted">{t("table.errorDescription")}</p>
            <Button type="button" variant="secondary" onClick={onRetry} className="min-h-[44px]">
              <RotateCcw size={16} className="mr-1.5" />
              {t("common:retry")}
            </Button>
          </div>
        )}

        {showEmpty && (
          <div className="py-12 px-4 text-center">
            <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
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
          </div>
        )}

        {hasRows &&
          students.map((student) => {
            const fullName = `${student.first_name} ${student.last_name}`;
            const photoUrl = resolveMediaUrl(student.thumbnail_path ?? student.photo_path) ?? undefined;

            return (
              <div
                key={student.id}
                id={`student-card-${student.id}`}
                className="p-4 flex flex-col gap-2.5 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-row-hover"
              >
                <div className="grid grid-cols-[40px_minmax(0,1fr)_44px] items-start gap-3">
                  <PersonAvatar firstName={student.first_name} lastName={student.last_name} photoUrl={photoUrl} />
                  <div className="min-w-0">
                    <Link
                      to={`/students/${student.id}`}
                      state={getStudentNavigationState(student.id)}
                      onClick={() => onStudentNavigate?.(student)}
                      className="min-h-[44px] inline-flex items-center text-base font-semibold text-ink hover:text-maroon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon rounded break-words min-w-0 [overflow-wrap:anywhere]"
                    >
                      {fullName}
                    </Link>
                    <div className="text-sm text-muted min-w-0">
                      {student.phone ? (
                        <a
                          href={`tel:${student.phone}`}
                          className="min-h-[44px] inline-flex items-center text-muted hover:text-maroon tabular-nums break-words min-w-0 [overflow-wrap:anywhere]"
                        >
                          {student.phone}
                        </a>
                      ) : (
                        <a
                          href={`mailto:${student.email}`}
                          className="min-h-[44px] inline-flex items-center text-muted hover:text-maroon break-words min-w-0 [overflow-wrap:anywhere]"
                        >
                          {student.email}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <StudentRowMenu student={student} onEdit={onEdit} onDelete={onDeleteRequest} />
                  </div>
                </div>

                <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-sm text-muted pt-2 border-t border-border/50">
                  <UserStatusBadge isDeleted={student.is_deleted} />
                  {student.payment_day_of_month ? (
                    <span className="tabular-nums">
                      {t("table.paymentDayShort", {
                        day: formatNumber(student.payment_day_of_month, i18n.language),
                      })}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
      </div>

      <div className="border-t border-border px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted tabular-nums">
          {total === 0
            ? t("table.rangeEmpty")
            : t("table.range", {
                from: formatNumber(from, i18n.language),
                to: formatNumber(to, i18n.language),
                total: formatNumber(total, i18n.language),
              })}
        </span>
        <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
      </div>
    </div>
  );
}

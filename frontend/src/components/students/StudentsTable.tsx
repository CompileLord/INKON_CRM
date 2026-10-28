import { useRef, type ReactNode } from "react";
import { RotateCcw, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyValue } from "../ui/EmptyValue";
import { PersonAvatar } from "../ui/PersonAvatar";
import { Pagination } from "../ui/Pagination";
import { PageSizeListbox } from "../ui/PageSizeListbox";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { ListRow } from "../ui/ListRow";
import type { MenuItem } from "../ui/Menu";
import { StudentStatusPill } from "./StudentStatusPill";
import { StudentBalanceCell } from "./StudentBalanceCell";
import { StudentCoursePills } from "./StudentCoursePills";
import { formatNumber, formatPhoneDisplay } from "../../i18n/formatters";
import { resolveMediaUrl } from "../../lib/users/media";
import type { StudentListItemResponse, User } from "../../lib/users/types";

const SKELETON_ROW_COUNT = 5;
const ROW_GRID = "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2.2fr)_9rem]";

interface StudentsTableProps {
  students: StudentListItemResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  search: string;
  hasActiveFilters: boolean;
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
  onClearFilters: () => void;
  onStudentNavigate?: (student: User) => void;
}

interface StudentRowProps {
  student: StudentListItemResponse;
  search: string;
  page: number;
  pageSize: number;
  onEdit: StudentsTableProps["onEdit"];
  onDeleteRequest: StudentsTableProps["onDeleteRequest"];
  onStudentNavigate?: (student: User) => void;
}

function StudentRow({ student, search, page, pageSize, onEdit, onDeleteRequest, onStudentNavigate }: StudentRowProps) {
  const { t } = useTranslation(["students", "common"]);
  const rootRef = useRef<HTMLLIElement | null>(null);
  const fullName: string = `${student.first_name} ${student.last_name}`;
  const photoUrl: string | undefined = resolveMediaUrl(student.thumbnail_path ?? student.photo_path) ?? undefined;
  const findTrigger = (): HTMLElement | null => rootRef.current?.querySelector<HTMLElement>('button[aria-haspopup="menu"]') ?? null;
  const menuItems: readonly MenuItem[] = [
    { key: "edit", label: t("common:edit"), onSelect: () => onEdit(student, findTrigger()) },
    { key: "delete", label: t("common:delete"), destructive: true, onSelect: () => onDeleteRequest(student, findTrigger()) },
  ];

  return (
    <li
      ref={rootRef}
      id={`student-row-${student.id}`}
      onClickCapture={(event) => { if ((event.target as HTMLElement).closest("a") !== null) onStudentNavigate?.(student); }}
    >
      <ListRow
        to={`/students/${student.id}`}
        linkState={{ fromDirectory: { search, page, pageSize, studentId: student.id }, studentId: student.id }}
        menuItems={menuItems}
        menuLabel={`${t("studentActions")}: ${fullName}`}
      >
        <span className={`grid items-center gap-x-4 gap-y-1.5 ${ROW_GRID}`}>
          <span className="flex min-w-0 items-center gap-3">
            <PersonAvatar firstName={student.first_name} lastName={student.last_name} photoUrl={photoUrl} />
            <span className="flex min-w-0 flex-col">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="min-w-0 break-words text-sm font-semibold text-ink">{fullName}</span>
                <StudentStatusPill isDeleted={student.is_deleted} />
                {student.parent_linked === true && (
                  <span role="img" title={t("table.telegramLinked")} aria-label={t("table.telegramLinked")} className="inline-flex shrink-0 text-success">
                    <Send size={14} aria-hidden="true" />
                  </span>
                )}
              </span>
              {student.email != null && <span className="truncate text-sm text-muted" title={student.email}>{student.email}</span>}
            </span>
          </span>
          <span className={`text-sm tabular-nums text-ink ${student.phone == null ? "hidden md:block" : ""}`}>{student.phone != null ? formatPhoneDisplay(student.phone) : <EmptyValue reason={t("common:empty.phone")} />}</span>
          <StudentCoursePills courses={student.courses} />
          <span className="md:text-right"><StudentBalanceCell paymentStatus={student.payment_status} debtAmount={student.debt_amount} /></span>
        </span>
      </ListRow>
    </li>
  );
}

export function StudentsTable({
  students, total, page, pageSize, totalPages, search, hasActiveFilters, isLoading, isError, hasLoadedOnce, pageSizeOptions,
  onRetry, onPageChange, onPageSizeChange, onEdit, onDeleteRequest, onAddStudent, onClearSearch, onClearFilters, onStudentNavigate,
}: StudentsTableProps) {
  const { t, i18n } = useTranslation(["students", "common"]);
  const from: number = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to: number = Math.min(page * pageSize, total);
  const isSearchActive: boolean = search.trim().length > 0;
  const hasRows: boolean = students.length > 0;
  const loadedOnce: boolean = typeof hasLoadedOnce === "boolean" ? hasLoadedOnce : (hasRows || (!isLoading && !isError));
  const showInitialLoading: boolean = isLoading && !loadedOnce;
  const showInitialError: boolean = isError && !loadedOnce;
  const showInlineError: boolean = isError && loadedOnce;
  const showEmpty: boolean = !showInitialLoading && !showInitialError && !hasRows;

  const renderBody = (): ReactNode => {
    if (showInitialLoading) {
      return (
        <ul aria-hidden="true">
          {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
            <li key={index} className="px-3 py-3 motion-safe:animate-pulse">
              <div className={`grid items-center gap-x-4 gap-y-2 ${ROW_GRID}`}>
                <div className="flex items-center gap-3">
                  <div className="size-10 shrink-0 rounded-full bg-border" />
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="h-4 w-36 max-w-full rounded bg-border" />
                    <div className="h-3 w-44 max-w-full rounded bg-border" />
                  </div>
                </div>
                <div className="hidden h-4 w-28 rounded bg-border md:block" />
                <div className="hidden h-5 w-32 rounded-full bg-border md:block" />
                <div className="hidden h-4 w-16 rounded bg-border md:ml-auto md:block" />
              </div>
            </li>
          ))}
        </ul>
      );
    }
    if (showInitialError) return <ErrorState title={t("table.error")} message={t("table.errorDescription")} onRetry={onRetry} />;
    if (showEmpty) {
      if (hasActiveFilters || isSearchActive) {
        return (
          <EmptyState
            title={hasActiveFilters ? t("table.emptyFilteredTitle") : t("emptyNoResultsTitle")}
            description={hasActiveFilters ? t("table.emptyFilteredDescription") : t("emptyNoResultsDescription")}
            action={
              <Button type="button" variant="secondary" onClick={hasActiveFilters ? onClearFilters : onClearSearch}>
                <RotateCcw size={16} aria-hidden="true" />
                {hasActiveFilters ? t("filters.reset") : t("clearSearch")}
              </Button>
            }
          />
        );
      }
      return (
        <EmptyState
          title={t("emptyNoStudentsTitle")}
          description={t("emptyNoStudentsDescription")}
          action={<Button type="button" onClick={onAddStudent}>{t("addStudent")}</Button>}
        />
      );
    }
    return (
      <ul>
        {students.map((student) => (
          <StudentRow key={student.id} student={student} search={search} page={page} pageSize={pageSize} onEdit={onEdit} onDeleteRequest={onDeleteRequest} onStudentNavigate={onStudentNavigate} />
        ))}
      </ul>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {showInlineError && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{t("table.errorBanner")}</span>
          <Button type="button" variant="secondary" onClick={onRetry}><RotateCcw size={14} aria-hidden="true" />{t("common:retry")}</Button>
        </div>
      )}
      <div className="rounded-2xl border border-border bg-card p-1">
        {hasRows && (
          <div aria-hidden="true" className={`hidden gap-x-4 py-2 pl-3 pr-[4.25rem] text-sm text-muted md:grid ${ROW_GRID}`}>
            <span className="pl-[3.25rem]">{t("table.student")}</span>
            <span>{t("table.phone")}</span>
            <span>{t("table.courses")}</span>
            <span className="text-right">{t("table.balance")}</span>
          </div>
        )}
        {renderBody()}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted tabular-nums">
          {total === 0
            ? t("table.rangeEmpty")
            : t("table.range", { from: formatNumber(from, i18n.language), to: formatNumber(to, i18n.language), total: formatNumber(total, i18n.language) })}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <PageSizeListbox options={pageSizeOptions} value={pageSize} onChange={onPageSizeChange} />
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      </div>
    </div>
  );
}

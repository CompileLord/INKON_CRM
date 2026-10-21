import { CanonicalPhone } from "../../lib/users/CanonicalPhone";
import { useRef, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "../ui/PersonAvatar";
import { Badge } from "../ui/Badge";
import { Pagination } from "../ui/Pagination";
import { PageSizeListbox } from "../ui/PageSizeListbox";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { ListRow } from "../ui/ListRow";
import type { MenuItem } from "../ui/Menu";
import { formatDate, formatNumber } from "../../i18n/formatters";
import { resolveMediaUrl } from "../../lib/users/media";
import type { User } from "../../lib/users/types";

const SKELETON_ROW_COUNT = 5;
const ROW_GRID = "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_6.5rem]";

interface MentorsTableProps {
  mentors: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  search: string;
  isLoading: boolean;
  isError: boolean;
  hasLoadedOnce?: boolean;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (pageSize: number) => void;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onEdit: (mentor: User, triggerElement?: HTMLElement | null) => void;
  onDeleteRequest: (mentor: User, triggerElement?: HTMLElement | null) => void;
  onAddMentor: () => void;
  onClearSearch: () => void;
  onMentorNavigate?: (mentor: User) => void;
}

interface MentorRowProps {
  mentor: User;
  search: string;
  page: number;
  pageSize: number;
  onEdit: MentorsTableProps["onEdit"];
  onDeleteRequest: MentorsTableProps["onDeleteRequest"];
  onMentorNavigate?: (mentor: User) => void;
}

function MentorRow({ mentor, search, page, pageSize, onEdit, onDeleteRequest, onMentorNavigate }: MentorRowProps) {
  const { t, i18n } = useTranslation(["mentors", "common"]);
  const rootRef = useRef<HTMLLIElement | null>(null);
  const fullName: string = `${mentor.first_name} ${mentor.last_name}`;
  const photoUrl: string | undefined = resolveMediaUrl(mentor.thumbnail_path ?? mentor.photo_path) ?? undefined;
  const findTrigger = (): HTMLElement | null => rootRef.current?.querySelector<HTMLElement>('button[aria-haspopup="menu"]') ?? null;
  const menuItems: readonly MenuItem[] = [
    { key: "edit", label: t("common:edit"), onSelect: () => onEdit(mentor, findTrigger()) },
    { key: "delete", label: t("common:delete"), destructive: true, onSelect: () => onDeleteRequest(mentor, findTrigger()) },
  ];

  return (
    <li
      ref={rootRef}
      id={`mentor-row-${mentor.id}`}
      onClickCapture={(event) => { if ((event.target as HTMLElement).closest("a") !== null) onMentorNavigate?.(mentor); }}
    >
      <ListRow
        to={`/mentors/${mentor.id}`}
        linkState={{ fromDirectory: { search, page, pageSize, mentorId: mentor.id }, mentorId: mentor.id }}
        menuItems={menuItems}
        menuLabel={`${t("mentorActions")}: ${fullName}`}
      >
        <span className={`grid items-center gap-x-4 gap-y-1 ${ROW_GRID}`}>
          <span className="flex min-w-0 items-center gap-3">
            <PersonAvatar firstName={mentor.first_name} lastName={mentor.last_name} photoUrl={photoUrl} />
            <span className="flex min-w-0 flex-col">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                <span className="min-w-0 break-words text-sm font-semibold text-ink [overflow-wrap:anywhere]">{fullName}</span>
                {mentor.is_deleted && <Badge status="archived" />}
              </span>
              <span className="break-words text-sm text-muted [overflow-wrap:anywhere]">{mentor.email}</span>
            </span>
          </span>
          <span className="text-sm tabular-nums text-ink">{mentor.phone != null ? CanonicalPhone.prefill(mentor.phone) : <span className="text-muted">—</span>}</span>
          <span className="text-sm tabular-nums text-muted">{formatDate(mentor.created_at, i18n.language)}</span>
        </span>
      </ListRow>
    </li>
  );
}

export function MentorsTable({
  mentors, total, page, pageSize, totalPages, search, isLoading, isError, hasLoadedOnce, pageSizeOptions, onPageSizeChange,
  onRetry, onPageChange, onEdit, onDeleteRequest, onAddMentor, onClearSearch, onMentorNavigate,
}: MentorsTableProps) {
  const { t, i18n } = useTranslation(["mentors", "common"]);
  const from: number = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to: number = Math.min(page * pageSize, total);
  const isSearchActive: boolean = search.trim().length > 0;
  const hasRows: boolean = mentors.length > 0;
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
            <li key={index} data-mentor-loading-row className="px-3 py-3 motion-safe:animate-pulse">
              <div className={`grid items-center gap-x-4 gap-y-2 ${ROW_GRID}`}>
                <div className="flex items-center gap-3">
                  <div className="size-10 shrink-0 rounded-full bg-border" />
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="h-4 w-36 max-w-full rounded bg-border" />
                    <div className="h-3 w-44 max-w-full rounded bg-border" />
                  </div>
                </div>
                <div className="hidden h-4 w-28 rounded bg-border md:block" />
                <div className="hidden h-4 w-20 rounded bg-border md:block" />
              </div>
            </li>
          ))}
        </ul>
      );
    }
    if (showInitialError) return <ErrorState title={t("table.error")} message={t("table.errorDescription")} onRetry={onRetry} />;
    if (showEmpty) {
      return (
        <EmptyState
          title={isSearchActive ? t("emptyNoResultsTitle") : t("emptyNoMentorsTitle")}
          description={isSearchActive ? t("emptyNoResultsDescription") : t("emptyNoMentorsDescription")}
          action={isSearchActive
            ? <Button type="button" variant="secondary" onClick={onClearSearch}><RotateCcw size={16} aria-hidden="true" />{t("clearSearch")}</Button>
            : <Button type="button" onClick={onAddMentor}>{t("addMentor")}</Button>}
        />
      );
    }
    return (
      <ul>
        {mentors.map((mentor) => (
          <MentorRow key={mentor.id} mentor={mentor} search={search} page={page} pageSize={pageSize} onEdit={onEdit} onDeleteRequest={onDeleteRequest} onMentorNavigate={onMentorNavigate} />
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
          <div aria-hidden="true" className={`hidden gap-x-4 py-2 pl-3 pr-14 text-sm text-muted md:grid ${ROW_GRID}`}>
            <span className="pl-[3.25rem]">{t("table.mentor")}</span>
            <span>{t("table.phone")}</span>
            <span>{t("table.created")}</span>
          </div>
        )}
        {renderBody()}
      </div>
      {loadedOnce && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted tabular-nums">
            {total === 0
              ? t("table.rangeEmpty")
              : t("table.range", { from: formatNumber(from, i18n.language), to: formatNumber(to, i18n.language), total: formatNumber(total, i18n.language) })}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {pageSizeOptions !== undefined && onPageSizeChange !== undefined && <PageSizeListbox options={pageSizeOptions} value={pageSize} onChange={onPageSizeChange} />}
            <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
          </div>
        </div>
      )}
    </div>
  );
}

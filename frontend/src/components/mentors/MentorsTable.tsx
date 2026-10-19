import { Link } from "react-router-dom";
import { AlertCircle, Plus, RotateCcw, SearchX, UserX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "../ui/PersonAvatar";
import { UserStatusBadge } from "../ui/UserStatusBadge";
import { Pagination } from "../ui/Pagination";
import { Button } from "../ui/Button";
import { MentorRowMenu } from "./MentorRowMenu";
import { formatDate, formatNumber } from "../../i18n/formatters";
import { resolveMediaUrl } from "../../lib/users/media";
import type { User } from "../../lib/users/types";

const COLUMN_COUNT = 5;

function MentorTableLoadingRows() {
  return Array.from({ length: 5 }, (_, rowIndex) => (
    <tr key={rowIndex} aria-hidden="true" className="border-b border-border last:border-b-0">
      {Array.from({ length: COLUMN_COUNT }, (_, columnIndex) => (
        <td key={columnIndex} className={`${columnIndex === 3 ? "hidden xl:table-cell " : ""}px-3 xl:px-5 py-3.5`}>
          {columnIndex === 0 ? (
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 shrink-0 rounded-full bg-beige motion-safe:animate-pulse" />
              <div className="min-w-0 flex-1">
                <div className="flex h-11 items-center"><div className="h-4 w-full max-w-32 rounded bg-beige motion-safe:animate-pulse" /></div>
                <div className="flex h-5 items-center"><div className="h-3 w-full max-w-40 rounded bg-beige motion-safe:animate-pulse" /></div>
                <div className="mt-0.5 h-4 w-20 rounded bg-beige motion-safe:animate-pulse xl:hidden" />
              </div>
            </div>
          ) : (
            <div className="h-4 w-full max-w-[160px] rounded bg-beige motion-safe:animate-pulse" />
          )}
        </td>
      ))}
    </tr>
  ));
}

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
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onEdit: (mentor: User, triggerElement?: HTMLElement | null) => void;
  onDeleteRequest: (mentor: User, triggerElement?: HTMLElement | null) => void;
  onAddMentor: () => void;
  onClearSearch: () => void;
  onMentorNavigate?: (mentor: User) => void;
}

export function MentorsTable({
  mentors,
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
  onAddMentor,
  onClearSearch,
  onMentorNavigate,
}: MentorsTableProps) {
  const { t, i18n } = useTranslation(["mentors", "common"]);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const isSearchActive = search.trim().length > 0;
  const hasRows = mentors.length > 0;
  const loadedOnce = typeof hasLoadedOnce === "boolean" ? hasLoadedOnce : (hasRows || (!isLoading && !isError));
  const showInitialLoading = isLoading && !loadedOnce;
  const showInitialError = isError && !loadedOnce;
  const showInlineError = isError && loadedOnce;
  const showEmpty = !showInitialLoading && !showInitialError && !hasRows;

  const getMentorNavigationState = (mentorId: number) => ({
    fromDirectory: {
      search,
      page,
      pageSize,
      mentorId,
    },
    mentorId,
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
            className="min-h-[44px] min-w-[44px] py-2 px-3.5 text-xs shrink-0"
          >
            <RotateCcw size={14} className="mr-1.5" />
            {t("common:retry")}
          </Button>
        </div>
      ) : null}

      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[46%] xl:w-[34%]" />
            <col className="w-[26%] xl:w-[22%]" />
            <col className="w-[16%] xl:w-[14%]" />
            <col className="hidden xl:table-column xl:w-[18%]" />
            <col className="w-[84px] xl:w-[96px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-strip">
              <th className="px-3 xl:px-5 py-3 text-sm font-semibold text-muted">{t("table.mentor")}</th>
              <th className="px-3 xl:px-5 py-3 text-sm font-semibold text-muted">{t("table.phone")}</th>
              <th className="px-3 xl:px-5 py-3 text-sm font-semibold text-muted">{t("common:status")}</th>
              <th className="hidden xl:table-cell px-3 xl:px-5 py-3 text-sm font-semibold text-muted">
                {t("table.created")}
              </th>
              <th className="px-3 xl:px-5 py-3 text-right text-sm font-semibold text-muted">
                {t("common:actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {showInitialLoading && <MentorTableLoadingRows />}

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
              mentors.map((mentor) => {
                const fullName = `${mentor.first_name} ${mentor.last_name}`;
                const photoUrl = resolveMediaUrl(mentor.thumbnail_path ?? mentor.photo_path) ?? undefined;
                const formattedDate = formatDate(mentor.created_at, i18n.language);

                return (
                  <tr
                    key={mentor.id}
                    id={`mentor-row-${mentor.id}`}
                    className="min-h-[64px] border-b border-border/60 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out last:border-b-0 hover:bg-row-hover"
                  >
                    <td className="px-3 xl:px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <PersonAvatar firstName={mentor.first_name} lastName={mentor.last_name} photoUrl={photoUrl} />
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/mentors/${mentor.id}`}
                            state={getMentorNavigationState(mentor.id)}
                            onClick={() => onMentorNavigate?.(mentor)}
                            className="min-h-[44px] inline-flex items-center text-sm font-semibold text-ink hover:text-maroon-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon rounded break-words min-w-0 [overflow-wrap:anywhere]"
                          >
                            {fullName}
                          </Link>
                          <div className="text-sm text-muted break-words min-w-0 [overflow-wrap:anywhere]">
                            {mentor.email}
                          </div>
                          <div className="xl:hidden mt-0.5 text-xs text-muted tabular-nums">
                            {formattedDate}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 xl:px-5 py-3.5 text-sm text-ink tabular-nums">
                      {mentor.phone ? (
                        <a
                          href={`tel:${mentor.phone}`}
                          className="min-h-[44px] inline-flex items-center font-medium text-ink hover:text-maroon-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon rounded break-words min-w-0 [overflow-wrap:anywhere]"
                        >
                          {mentor.phone}
                        </a>
                      ) : (
                        <span className="min-h-[44px] inline-flex items-center text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 xl:px-5 py-3.5">
                      <UserStatusBadge isDeleted={mentor.is_deleted} />
                    </td>
                    <td className="hidden xl:table-cell px-3 xl:px-5 py-3.5 text-sm text-ink tabular-nums">
                      {formattedDate}
                    </td>
                    <td className="px-3 xl:px-5 py-3.5 text-right">
                      <div className="flex justify-end">
                        <MentorRowMenu mentor={mentor} onEdit={onEdit} onDelete={onDeleteRequest} />
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
                        {isSearchActive ? t("emptyNoResultsTitle") : t("emptyNoMentorsTitle")}
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        {isSearchActive ? t("emptyNoResultsDescription") : t("emptyNoMentorsDescription")}
                      </p>
                    </div>
                    {isSearchActive ? (
                      <Button type="button" variant="secondary" onClick={onClearSearch} className="mt-2 min-h-[44px]">
                        <RotateCcw size={16} className="mr-1.5" />
                        {t("clearSearch")}
                      </Button>
                    ) : (
                      <Button type="button" variant="primary" onClick={onAddMentor} className="mt-2 min-h-[44px]">
                        <Plus size={16} className="mr-1.5" />
                        {t("addMentor")}
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
            <div key={index} data-mentor-loading-row="mobile" className="p-4 flex flex-col gap-2.5">
              <div className="grid grid-cols-[40px_minmax(0,1fr)_44px] items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-beige motion-safe:animate-pulse" />
                <div className="min-w-0">
                  <div className="flex h-11 items-center"><div className="h-4 w-full max-w-32 rounded bg-beige motion-safe:animate-pulse" /></div>
                  <div className="flex h-11 items-center"><div className="h-3 w-full max-w-24 rounded bg-beige motion-safe:animate-pulse" /></div>
                </div>
                <div className="h-10 w-10 rounded-lg bg-beige motion-safe:animate-pulse" />
              </div>
              <div className="mt-1 flex justify-between border-t border-border/50 pt-2">
                <div className="h-6 w-16 rounded-md bg-beige motion-safe:animate-pulse" />
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
                  {isSearchActive ? t("emptyNoResultsTitle") : t("emptyNoMentorsTitle")}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {isSearchActive ? t("emptyNoResultsDescription") : t("emptyNoMentorsDescription")}
                </p>
              </div>
              {isSearchActive ? (
                <Button type="button" variant="secondary" onClick={onClearSearch} className="mt-2 min-h-[44px]">
                  <RotateCcw size={16} className="mr-1.5" />
                  {t("clearSearch")}
                </Button>
              ) : (
                <Button type="button" variant="primary" onClick={onAddMentor} className="mt-2 min-h-[44px]">
                  <Plus size={16} className="mr-1.5" />
                  {t("addMentor")}
                </Button>
              )}
            </div>
          </div>
        )}

        {hasRows &&
          mentors.map((mentor) => {
            const fullName = `${mentor.first_name} ${mentor.last_name}`;
            const photoUrl = resolveMediaUrl(mentor.thumbnail_path ?? mentor.photo_path) ?? undefined;

            return (
              <div
                key={mentor.id}
                id={`mentor-card-${mentor.id}`}
                className="p-4 flex flex-col gap-2.5 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-row-hover"
              >
                <div className="grid grid-cols-[40px_minmax(0,1fr)_44px] items-start gap-3">
                  <PersonAvatar firstName={mentor.first_name} lastName={mentor.last_name} photoUrl={photoUrl} />
                  <div className="min-w-0">
                    <Link
                      to={`/mentors/${mentor.id}`}
                      state={getMentorNavigationState(mentor.id)}
                      onClick={() => onMentorNavigate?.(mentor)}
                      className="min-h-[44px] inline-flex items-center text-base font-semibold text-ink hover:text-maroon-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon rounded break-words min-w-0 [overflow-wrap:anywhere]"
                    >
                      {fullName}
                    </Link>
                    <div className="text-sm text-muted min-w-0">
                      {mentor.phone ? (
                        <a
                          href={`tel:${mentor.phone}`}
                          className="min-h-[44px] inline-flex items-center text-muted hover:text-maroon-text tabular-nums break-words min-w-0 [overflow-wrap:anywhere]"
                        >
                          {mentor.phone}
                        </a>
                      ) : (
                        <a
                          href={`mailto:${mentor.email}`}
                          className="min-h-[44px] inline-flex items-center text-muted hover:text-maroon-text break-words min-w-0 [overflow-wrap:anywhere]"
                        >
                          {mentor.email}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <MentorRowMenu mentor={mentor} onEdit={onEdit} onDelete={onDeleteRequest} />
                  </div>
                </div>

                <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-sm text-muted pt-2 border-t border-border/50">
                  <UserStatusBadge isDeleted={mentor.is_deleted} />
                </div>
              </div>
            );
          })}
      </div>

      {loadedOnce && (
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
      )}
    </div>
  );
}

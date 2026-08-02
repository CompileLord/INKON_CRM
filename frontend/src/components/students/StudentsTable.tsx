import { useNavigate } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "../ui/PersonAvatar";
import { UserStatusBadge } from "../ui/UserStatusBadge";
import { Pagination } from "../ui/Pagination";
import { TableSkeletonRows } from "../ui/TableSkeletonRows";
import { TableErrorState } from "../ui/TableErrorState";
import { resolveMediaUrl } from "../../lib/users/media";
import type { User } from "../../lib/users/types";

const COLUMN_COUNT = 6;

interface StudentsTableProps {
  students: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onEdit: (student: User) => void;
  onDeleteRequest: (student: User) => void;
}

function formatCreatedAt(iso: string, locale: string = "ru-RU") {
  return new Date(iso).toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function StudentsTable({
  students,
  total,
  page,
  pageSize,
  totalPages,
  isLoading,
  isError,
  onRetry,
  onPageChange,
  onEdit,
  onDeleteRequest,
}: StudentsTableProps) {
  const { t, i18n } = useTranslation(["students", "common"]);
  const navigate = useNavigate();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const showEmpty = !isLoading && !isError && students.length === 0;
  const showRows = !isLoading && !isError && students.length > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border-warm bg-card">
      {/* Table — md and up */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-180 border-collapse text-left">
          <thead>
            <tr className="border-b border-border-warm bg-strip">
              <th className="px-5 py-3 text-[13px] font-semibold text-nav">{t("table.student")}</th>
              <th className="px-5 py-3 text-[13px] font-semibold text-nav">{t("table.phone")}</th>
              <th className="px-5 py-3 text-[13px] font-semibold text-nav">{t("table.paymentDay")}</th>
              <th className="px-5 py-3 text-[13px] font-semibold text-nav">{t("common:status")}</th>
              <th className="px-5 py-3 text-[13px] font-semibold text-nav">{t("table.created")}</th>
              <th className="px-5 py-3 text-right text-[13px] font-semibold text-nav">
                {t("common:actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <TableSkeletonRows columns={COLUMN_COUNT} />}
            {!isLoading && isError && <TableErrorState columns={COLUMN_COUNT} onRetry={onRetry} />}

            {showRows &&
              students.map((student) => (
                <tr
                  key={student.id}
                  onClick={() => navigate(`/students/${student.id}`)}
                  className="border-b border-beige transition-colors duration-150 last:border-b-0 hover:bg-row-hover cursor-pointer"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <PersonAvatar
                        firstName={student.first_name}
                        lastName={student.last_name}
                        photoUrl={resolveMediaUrl(student.thumbnail_path) ?? undefined}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink hover:underline">
                          {student.first_name} {student.last_name}
                        </div>
                        <div className="truncate text-xs text-muted">{student.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-ink tabular-nums">
                    <div>{student.phone ?? "—"}</div>
                    {student.parent_phone && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5 tabular-nums">
                        Род: {student.parent_phone}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-ink tabular-nums">
                    {student.payment_day_of_month ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    <UserStatusBadge isDeleted={student.is_deleted} />
                  </td>
                  <td className="px-5 py-3 text-sm text-ink tabular-nums">
                    {formatCreatedAt(student.created_at, i18n.language)}
                  </td>
                  <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(student);
                        }}
                        aria-label={t("common:edit")}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-[background-color,transform] duration-150 ease-out active:scale-95 hover:bg-strip"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRequest(student);
                        }}
                        aria-label={t("common:delete")}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 transition-[background-color,transform] duration-150 ease-out active:scale-95 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

            {showEmpty && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-5 py-10 text-center text-sm text-muted">
                  {t("table.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Stacked cards — below md */}
      <div className="flex flex-col gap-3 p-3 md:hidden">
        {isLoading &&
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-beige" />
          ))}

        {!isLoading && isError && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted">{t("table.error")}</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-border-warm bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-strip active:scale-95 transition-transform"
            >
              {t("common:retry")}
            </button>
          </div>
        )}

        {showEmpty && <p className="px-2 py-6 text-center text-sm text-muted">{t("table.empty")}</p>}

        {showRows &&
          students.map((student) => (
            <div key={student.id} className="rounded-lg border border-border-warm p-3.5 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PersonAvatar
                    firstName={student.first_name}
                    lastName={student.last_name}
                    photoUrl={resolveMediaUrl(student.thumbnail_path) ?? undefined}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">
                      {student.first_name} {student.last_name}
                    </div>
                    <div className="truncate text-xs text-muted">{student.email}</div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(student)}
                    aria-label={t("common:edit")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-strip active:scale-95 transition-transform"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRequest(student)}
                    aria-label={t("common:delete")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 active:scale-95 transition-transform"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
                <div>
                  <dt>{t("table.phone")}</dt>
                  <dd className="text-ink tabular-nums">{student.phone ?? "—"}</dd>
                </div>
                <div>
                  <dt>{t("table.paymentDay")}</dt>
                  <dd className="text-ink tabular-nums">{student.payment_day_of_month ?? "—"}</dd>
                </div>
                <div>
                  <dt>{t("common:status")}</dt>
                  <dd>
                    <UserStatusBadge isDeleted={student.is_deleted} />
                  </dd>
                </div>
                <div>
                  <dt>{t("table.created")}</dt>
                  <dd className="text-ink tabular-nums">{formatCreatedAt(student.created_at, i18n.language)}</dd>
                </div>
              </dl>
            </div>
          ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-warm px-5 py-3.5">
        <p className="text-sm text-muted tabular-nums">
          {total > 0 ? `${t("common:showing")} ${from}–${to} ${t("common:of")} ${total}` : t("common:noData")}
        </p>
        <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
      </div>
    </div>
  );
}

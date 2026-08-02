import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StudentsTable } from "../components/students/StudentsTable";
import { StudentFormPanel } from "../components/students/StudentFormPanel";
import { Button } from "../components/ui/Button";
import { Toast } from "../components/ui/Toast";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useDeleteUser, useStudents } from "../lib/users/hooks";
import { withdrawEnrollment } from "../lib/enrollments/endpoints";
import { fetchFilteredEnrollments } from "../lib/enrollments/hooks";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import type { User } from "../lib/users/types";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type PanelState = { mode: "create" } | { mode: "edit"; student: User } | null;

export function Students() {
  const { t } = useTranslation(["students", "common"]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [panel, setPanel] = useState<PanelState>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    visible: boolean;
    variant: "success" | "error";
  }>({ message: "", visible: false, variant: "success" });
  const toastTimeoutRef = useRef<number | undefined>(undefined);

  const debouncedSearch = useDebouncedValue(search, 350);
  const { data, isLoading, isError, refetch } = useStudents({
    search: debouncedSearch || undefined,
    page,
    page_size: pageSize,
  });
  const deleteUser = useDeleteUser("student");
  const queryClient = useQueryClient();

  const showToast = (message: string, variant: "success" | "error" = "success") => {
    setToast({ message, visible: true, variant });
    window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(
      () => setToast((t) => ({ ...t, visible: false })),
      3000,
    );
  };

  const handleSaved = (action: "created" | "updated") => {
    if (action === "created") {
      setSearch("");
      setPage(1);
      showToast(t("common:success"));
    } else {
      showToast(t("common:success"));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const enrollments = await fetchFilteredEnrollments({ student_id: deleteTarget.id });
      await Promise.all(
        enrollments.filter((e) => e.status === "active").map((e) => withdrawEnrollment(e.id)),
      );
      await deleteUser.mutateAsync(deleteTarget.id);
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
      setDeleteTarget(null);
      showToast(t("common:success"));
    } catch {
      showToast(t("common:error"), "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-ink">{t("title")}</h1>
        {typeof data?.total === "number" && (
          <span className="text-sm text-muted">{t("common:total")}: {data.total}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t("searchPlaceholder")}
            className="w-64 rounded-full border border-border-warm bg-card py-2 pl-9 pr-4 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-maroon/20"
          />
        </div>

        <select
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
          className="rounded-lg border border-border-warm bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-maroon/20"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} / {t("common:page")}
            </option>
          ))}
        </select>

        <div className="ml-auto">
          <Button variant="accent" onClick={() => setPanel({ mode: "create" })}>
            <Plus size={16} className="mr-1.5" />
            {t("addStudent")}
          </Button>
        </div>
      </div>

      <StudentsTable
        students={data?.items ?? []}
        total={data?.total ?? 0}
        page={data?.page ?? page}
        pageSize={data?.page_size ?? pageSize}
        totalPages={data?.total_pages ?? 1}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        onPageChange={setPage}
        onEdit={(student) => setPanel({ mode: "edit", student })}
        onDeleteRequest={setDeleteTarget}
      />

      <StudentFormPanel
        open={panel !== null}
        student={panel?.mode === "edit" ? panel.student : undefined}
        onClose={() => setPanel(null)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("common:delete")}
        message={
          deleteTarget
            ? `${deleteTarget.first_name} ${deleteTarget.last_name}?`
            : ""
        }
        pending={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <Toast message={toast.message} show={toast.visible} variant={toast.variant} />
    </div>
  );
}

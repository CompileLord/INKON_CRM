import { useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MentorsTable } from "../components/mentors/MentorsTable";
import { MentorFormPanel } from "../components/mentors/MentorFormPanel";
import { Button } from "../components/ui/Button";
import { Toast } from "../components/ui/Toast";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useDeleteUser, useMentors } from "../lib/users/hooks";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import type { User } from "../lib/users/types";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type PanelState = { mode: "create" } | { mode: "edit"; mentor: User } | null;

export function Mentors() {
  const { t } = useTranslation(["mentors", "common"]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [panel, setPanel] = useState<PanelState>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    visible: boolean;
    variant: "success" | "error";
  }>({ message: "", visible: false, variant: "success" });
  const toastTimeoutRef = useRef<number | undefined>(undefined);

  const debouncedSearch = useDebouncedValue(search, 350);
  const { data, isLoading, isError, refetch } = useMentors({
    search: debouncedSearch || undefined,
    page,
    page_size: pageSize,
  });
  const deleteUser = useDeleteUser("mentor");

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

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteUser.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        showToast(t("common:success"));
      },
      onError: () => {
        showToast(t("common:error"), "error");
      },
    });
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
            {t("addMentor")}
          </Button>
        </div>
      </div>

      <MentorsTable
        mentors={data?.items ?? []}
        total={data?.total ?? 0}
        page={data?.page ?? page}
        pageSize={data?.page_size ?? pageSize}
        totalPages={data?.total_pages ?? 1}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        onPageChange={setPage}
        onEdit={(mentor) => setPanel({ mode: "edit", mentor })}
        onDeleteRequest={setDeleteTarget}
      />

      <MentorFormPanel
        open={panel !== null}
        mentor={panel?.mode === "edit" ? panel.mentor : undefined}
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
        pending={deleteUser.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <Toast message={toast.message} show={toast.visible} variant={toast.variant} />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StudentsTable } from "../components/students/StudentsTable";
import { StudentFormPanel } from "../components/students/StudentFormPanel";
import { Button } from "../components/ui/Button";
import { Toast } from "../components/ui/Toast";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { BrandActivityIndicator } from "../components/ui/BrandActivityIndicator";
import { useDeleteUser, useStudents } from "../lib/users/hooks";
import { withdrawEnrollment } from "../lib/enrollments/endpoints";
import { fetchFilteredEnrollments } from "../lib/enrollments/hooks";
import type { EnrollmentResponse } from "../lib/enrollments/types";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { formatNumber } from "../i18n/formatters";
import {
  clearSavedStudentsReturnContext,
  getSavedStudentsReturnContext,
  parseSafePageParam,
  parseSafePageSizeParam,
  recordStudentsNavigation,
  restoreStudentsScrollAndFocus,
} from "../lib/users/returnContext";
import { useAuthStore } from "../store/authStore";
import type { PaginatedUsers, User } from "../lib/users/types";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type PanelState = { mode: "create" } | { mode: "edit"; student: User } | null;

export function Students() {
  const { t, i18n } = useTranslation(["students", "common"]);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((state) => state.role);
  const userId = useAuthStore((state) => state.userId);

  const hasExplicitParams =
    searchParams.has("q") || searchParams.has("page") || searchParams.has("pageSize");
  const initialReturnCtx = !hasExplicitParams
    ? getSavedStudentsReturnContext(role ?? undefined, userId)
    : null;
  const initialReturnCtxRef = useRef(initialReturnCtx);

  const urlQuery = searchParams.get("q") ?? initialReturnCtx?.query ?? "";
  const page = searchParams.has("page")
    ? parseSafePageParam(searchParams.get("page"))
    : (initialReturnCtx?.page ?? 1);
  const pageSize = searchParams.has("pageSize")
    ? parseSafePageSizeParam(searchParams.get("pageSize"))
    : (initialReturnCtx?.pageSize ?? 20);

  const [searchInput, setSearchInput] = useState<string>(urlQuery);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const lastSynchronizedQueryRef = useRef<string>(urlQuery);

  const [panel, setPanel] = useState<PanelState>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const deleteLockRef = useRef(false);
  const deleteGenRef = useRef(0);
  const isMountedRef = useRef(true);
  const currentOwner = `${role ?? "anonymous"}:${userId ?? "none"}`;
  const ownerRef = useRef(currentOwner);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      deleteGenRef.current++;
    };
  }, []);

  useEffect(() => {
    if (ownerRef.current !== currentOwner) {
      ownerRef.current = currentOwner;
      deleteGenRef.current++;
    }
  }, [currentOwner]);

  const [toast, setToast] = useState<{
    message: string;
    visible: boolean;
    variant: "success" | "error";
  }>({ message: "", visible: false, variant: "success" });

  const toastTimeoutRef = useRef<number | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const addStudentTriggerRef = useRef<HTMLButtonElement | null>(null);
  const activeTriggerRef = useRef<HTMLElement | null>(null);

  const { data, isLoading, isFetching, isError, isPlaceholderData, refetch } = useStudents({
    search: debouncedSearch.trim() || undefined,
    page,
    page_size: pageSize,
  });

  const normalizedSearch = debouncedSearch.trim();

  const lastGoodResponseRef = useRef<{
    query: string;
    page: number;
    pageSize: number;
    data: PaginatedUsers;
  } | null>(null);

  if (data && !isError && !isPlaceholderData) {
    lastGoodResponseRef.current = {
      query: normalizedSearch,
      page,
      pageSize,
      data,
    };
  }

  const deleteUser = useDeleteUser("student");
  const queryClient = useQueryClient();

  useEffect(() => {
    const returnCtx =
      initialReturnCtxRef.current ?? getSavedStudentsReturnContext(role ?? undefined, userId);
    if (!returnCtx) return;

    if (!hasExplicitParams && (returnCtx.query || returnCtx.page > 1 || returnCtx.pageSize !== 20)) {
      const nextParams = new URLSearchParams();
      if (returnCtx.query) nextParams.set("q", returnCtx.query);
      if (returnCtx.page > 1) nextParams.set("page", String(returnCtx.page));
      if (returnCtx.pageSize !== 20) nextParams.set("pageSize", String(returnCtx.pageSize));
      lastSynchronizedQueryRef.current = returnCtx.query;
      setSearchParams(nextParams, { replace: true });
      setSearchInput(returnCtx.query);
    }
  }, [role, userId, searchParams, setSearchParams, hasExplicitParams]);

  useEffect(() => {
    if (initialReturnCtxRef.current) {
      if (searchParams.has("q") || searchParams.has("page")) {
        initialReturnCtxRef.current = null;
      }
      return;
    }
    const currentQ = searchParams.get("q") ?? "";
    if (currentQ !== lastSynchronizedQueryRef.current) {
      lastSynchronizedQueryRef.current = currentQ;
      setSearchInput(currentQ);
    }
  }, [searchParams]);

  useEffect(() => {
    const handleRefresh = () => {
      refetch();
    };
    window.addEventListener("imkon:refresh", handleRefresh);
    return () => {
      window.removeEventListener("imkon:refresh", handleRefresh);
    };
  }, [refetch]);

  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  useEffect(() => {
    const trimmed = debouncedSearch.trim();
    if (trimmed !== lastSynchronizedQueryRef.current) {
      lastSynchronizedQueryRef.current = trimmed;
      const nextParams = new URLSearchParams(searchParamsRef.current);
      if (trimmed) {
        nextParams.set("q", trimmed);
      } else {
        nextParams.delete("q");
      }
      nextParams.set("page", "1");
      setSearchParams(nextParams, { replace: true });
    }
  }, [debouncedSearch, setSearchParams]);

  useEffect(() => {
    if (
      !isLoading &&
      !isFetching &&
      data &&
      data.total_pages > 0 &&
      page > data.total_pages &&
      data.page === page
    ) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("page", String(data.total_pages));
      setSearchParams(nextParams, { replace: true });
    }
  }, [data, page, isLoading, isFetching, searchParams, setSearchParams]);

  useEffect(() => {
    const returnCtx = getSavedStudentsReturnContext(role ?? undefined, userId);
    const stateObj = location.state as
      | { fromDirectory?: { studentId?: number }; studentId?: number }
      | null
      | undefined;
    const targetId = stateObj?.fromDirectory?.studentId ?? stateObj?.studentId ?? returnCtx?.studentId;
    const targetScroll = returnCtx?.scrollY;

    if (targetId && data?.items && data.items.length > 0) {
      restoreStudentsScrollAndFocus(targetId, targetScroll);
      clearSavedStudentsReturnContext();
    } else if (typeof targetScroll === "number" && targetScroll > 0) {
      window.scrollTo({ top: targetScroll, behavior: "instant" });
    }
  }, [location.state, data?.items, role, userId]);

  const showToast = (message: string, variant: "success" | "error" = "success") => {
    setToast({ message, visible: true, variant });
    window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast((current) => ({ ...current, visible: false }));
    }, 3000);
  };

  const handlePageChange = (nextPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("page", String(nextPage));
    setSearchParams(nextParams);
  };

  const handlePageSizeChange = (nextSize: number) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("pageSize", String(nextSize));
    nextParams.set("page", "1");
    setSearchParams(nextParams);
  };

  const handleClearSearch = () => {
    lastSynchronizedQueryRef.current = "";
    setSearchInput("");
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("q");
    nextParams.set("page", "1");
    setSearchParams(nextParams, { replace: true });
    searchInputRef.current?.focus();
  };

  const handleStudentNavigate = (student: User) => {
    recordStudentsNavigation({
      query: searchInput,
      page,
      pageSize,
      scrollY: typeof window !== "undefined" ? (window.scrollY || window.pageYOffset || 0) : 0,
      studentId: student.id,
      role: role ?? "superadmin",
      userId,
    });
  };

  const handleSaved = (action: "created" | "updated", user?: User) => {
    if (!isMountedRef.current || ownerRef.current !== currentOwner) return;
    if (action === "created") {
      if (user?.id) {
        recordStudentsNavigation({
          query: searchInput,
          page,
          pageSize,
          studentId: user.id,
          role: role ?? "superadmin",
          userId,
        });
        navigate(`/students/${user.id}`, {
          state: {
            createdStudentId: user.id,
            fromDirectory: {
              search: searchInput,
              page,
              pageSize,
              studentId: user.id,
            },
          },
        });
      } else {
        showToast(t("form.createSuccess"));
      }
    } else {
      showToast(t("form.updateSuccess"));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleteLockRef.current) return;
    deleteLockRef.current = true;
    const currentGen = ++deleteGenRef.current;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      let enrollments: EnrollmentResponse[];
      try {
        enrollments = await fetchFilteredEnrollments({
          student_id: deleteTarget.id,
        });
      } catch {
        if (!isMountedRef.current || currentGen !== deleteGenRef.current || ownerRef.current !== currentOwner) return;
        setDeleteError(t("form.deleteWithdrawError"));
        return;
      }

      const activeEnrollments = (enrollments ?? [])
        .filter((e) => e.status === "active")
        .map((e) => e.id);

      let withdrawnCount = 0;
      for (const enrollmentId of activeEnrollments) {
        try {
          await withdrawEnrollment(enrollmentId);
          withdrawnCount++;
        } catch {
          if (!isMountedRef.current || currentGen !== deleteGenRef.current || ownerRef.current !== currentOwner) return;
          setDeleteError(t("form.deleteWithdrawError"));
          return;
        }
      }

      try {
        await deleteUser.mutateAsync(deleteTarget.id);
      } catch {
        if (!isMountedRef.current || currentGen !== deleteGenRef.current || ownerRef.current !== currentOwner) return;
        queryClient.invalidateQueries({ queryKey: ["enrollments"] });
        setDeleteError(
          withdrawnCount > 0
            ? t("form.deleteFailedAfterWithdraw")
            : t("form.deleteAccountError"),
        );
        return;
      }

      if (!isMountedRef.current || currentGen !== deleteGenRef.current || ownerRef.current !== currentOwner) return;

      setDeleteTarget(null);
      setDeleteError(null);
      showToast(t("form.deleteSuccess"));
      await refetch();
      restoreStudentsScrollAndFocus();
    } finally {
      deleteLockRef.current = false;
      if (isMountedRef.current && currentGen === deleteGenRef.current) {
        setIsDeleting(false);
      }
    }
  };

  const isCurrentParamsMatchingLastGood =
    lastGoodResponseRef.current !== null &&
    lastGoodResponseRef.current.query === normalizedSearch &&
    lastGoodResponseRef.current.page === page &&
    lastGoodResponseRef.current.pageSize === pageSize;

  const effectiveData = data ?? (isCurrentParamsMatchingLastGood ? lastGoodResponseRef.current?.data : null);
  const effectiveStudents = effectiveData?.items ?? [];
  const effectiveTotal = effectiveData?.total ?? 0;
  const effectiveTotalPages = effectiveData?.total_pages ?? 1;
  const hasLoadedOnce = isCurrentParamsMatchingLastGood || (data !== undefined && !isLoading);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-ink sm:text-[28px]">{t("title")}</h1>
          {isLoading && !isCurrentParamsMatchingLastGood ? (
            <div className="h-6 w-10 animate-pulse rounded-full bg-beige" />
          ) : typeof effectiveData?.total === "number" ? (
            <span
              title={t("table.total")}
              aria-label={`${t("table.total")}: ${formatNumber(effectiveData.total, i18n.language)}`}
              className="inline-flex min-h-6 items-center rounded-full bg-strip px-2.5 text-sm font-medium text-muted tabular-nums"
            >
              {formatNumber(effectiveData.total, i18n.language)}
            </span>
          ) : null}
          {isFetching && !isLoading && (
            <div className="flex items-center">
              <BrandActivityIndicator size={18} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-[480px]">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              ref={searchInputRef}
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="w-full min-h-[48px] rounded-xl border border-control-border bg-card py-2.5 pl-10 pr-4 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150"
            />
          </div>

          <Button
            ref={addStudentTriggerRef}
            type="button"
            variant="primary"
            aria-label={t("addStudent")}
            onClick={() => {
              activeTriggerRef.current = addStudentTriggerRef.current;
              setPanel({ mode: "create" });
            }}
            className="min-h-[48px] shrink-0 whitespace-nowrap sm:ml-auto"
          >
            <Plus size={16} className="sm:mr-1.5" />
            <span className="hidden sm:inline">{t("addStudent")}</span>
          </Button>
        </div>
      </div>

      <StudentsTable
        students={effectiveStudents}
        total={effectiveTotal}
        page={data?.page ?? page}
        pageSize={data?.page_size ?? pageSize}
        totalPages={effectiveTotalPages}
        search={searchInput}
        isLoading={isLoading}
        isError={isError}
        hasLoadedOnce={hasLoadedOnce}
        onRetry={() => refetch()}
        onPageChange={handlePageChange}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={handlePageSizeChange}
        onEdit={(student, trigger) => {
          activeTriggerRef.current = trigger ?? null;
          handleStudentNavigate(student);
          setPanel({ mode: "edit", student });
        }}
        onDeleteRequest={(student, trigger) => {
          activeTriggerRef.current = trigger ?? null;
          setDeleteError(null);
          setDeleteTarget(student);
        }}
        onAddStudent={() => {
          activeTriggerRef.current = addStudentTriggerRef.current;
          setPanel({ mode: "create" });
        }}
        onClearSearch={handleClearSearch}
        onStudentNavigate={handleStudentNavigate}
      />

      <StudentFormPanel
        open={panel !== null}
        mode={panel?.mode ?? "create"}
        student={panel && panel.mode === "edit" ? panel.student : undefined}
        onClose={() => {
          setPanel(null);
          requestAnimationFrame(() => {
            activeTriggerRef.current?.focus();
          });
        }}
        onSaved={handleSaved}
        finalFocus={activeTriggerRef}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("deleteConfirmTitle")}
        message={
          deleteTarget
            ? t("deleteConfirmMessage", {
                name: `${deleteTarget.first_name} ${deleteTarget.last_name}`,
              })
            : ""
        }
        confirmVariant="destructive"
        pending={isDeleting}
        errorMessage={deleteError ?? undefined}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
          requestAnimationFrame(() => {
            activeTriggerRef.current?.focus();
          });
        }}
        finalFocus={activeTriggerRef}
      />

      <Toast message={toast.message} show={toast.visible} variant={toast.variant} />
    </div>
  );
}

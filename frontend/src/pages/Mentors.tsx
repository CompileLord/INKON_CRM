import { useEffect, useRef, useState } from "react";
import { PageContainer } from "../components/ui/PageContainer";
import { PageHeader } from "../components/ui/PageHeader";
import { Input } from "../components/ui/Input";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MentorsTable } from "../components/mentors/MentorsTable";
import { MentorFormPanel } from "../components/mentors/MentorFormPanel";
import { Button } from "../components/ui/Button";
import { Toast } from "../components/ui/Toast";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { BrandActivityIndicator } from "../components/ui/BrandActivityIndicator";
import { useDeleteUser, useMentors } from "../lib/users/hooks";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { formatNumber } from "../i18n/formatters";
import {
  clearSavedMentorsReturnContext,
  getSavedMentorsReturnContext,
  parseSafePageParam,
  parseSafePageSizeParam,
  recordMentorsNavigation,
  restoreMentorsScrollAndFocus,
} from "../lib/users/returnContext";
import { ApiErrorCodes } from "../lib/auth/apiErrorCodes";
import { useAuthStore } from "../store/authStore";
import type { PaginatedUsers, User } from "../lib/users/types";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type PanelState = { mode: "create" } | { mode: "edit"; mentor: User } | null;

export function Mentors() {
  const { t, i18n } = useTranslation(["mentors", "common"]);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((state) => state.role);
  const userId = useAuthStore((state) => state.userId);

  const hasExplicitParams =
    searchParams.has("q") || searchParams.has("page") || searchParams.has("pageSize");
  const initialReturnCtx = !hasExplicitParams
    ? getSavedMentorsReturnContext(role ?? undefined, userId)
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
  const addMentorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const activeTriggerRef = useRef<HTMLElement | null>(null);

  const { data, isLoading, isFetching, isError, isPlaceholderData, refetch } = useMentors({
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

  const deleteUser = useDeleteUser("mentor");

  useEffect(() => {
    const returnCtx =
      initialReturnCtxRef.current ?? getSavedMentorsReturnContext(role ?? undefined, userId);
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
    const returnCtx = getSavedMentorsReturnContext(role ?? undefined, userId);
    const stateObj = location.state as
      | { fromDirectory?: { mentorId?: number }; mentorId?: number }
      | null
      | undefined;
    const targetId = stateObj?.fromDirectory?.mentorId ?? stateObj?.mentorId ?? returnCtx?.mentorId;
    const targetScroll = returnCtx?.scrollY;

    if (targetId && data?.items && data.items.length > 0) {
      restoreMentorsScrollAndFocus(targetId, targetScroll);
      clearSavedMentorsReturnContext();
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

  const handleMentorNavigate = (mentor: User) => {
    recordMentorsNavigation({
      query: searchInput,
      page,
      pageSize,
      scrollY: typeof window !== "undefined" ? (window.scrollY || window.pageYOffset || 0) : 0,
      mentorId: mentor.id,
      role: role ?? "superadmin",
      userId,
    });
  };

  const handleSaved = (action: "created" | "updated", user?: User) => {
    const latestAuth = useAuthStore.getState();
    const latestOwner = `${latestAuth.role ?? "anonymous"}:${latestAuth.userId ?? "none"}`;
    if (!isMountedRef.current || ownerRef.current !== currentOwner || latestOwner !== currentOwner) return;
    if (action === "created") {
      if (user?.id) {
        recordMentorsNavigation({
          query: searchInput,
          page,
          pageSize,
          mentorId: user.id,
          role: role ?? "superadmin",
          userId,
        });
        navigate(`/mentors/${user.id}`, {
          state: {
            createdMentorId: user.id,
            fromDirectory: {
              search: searchInput,
              page,
              pageSize,
              mentorId: user.id,
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
      try {
        await deleteUser.mutateAsync(deleteTarget.id);
      } catch (deleteFailure) {
        const latestAuth = useAuthStore.getState();
        const latestOwner = `${latestAuth.role ?? "anonymous"}:${latestAuth.userId ?? "none"}`;
        if (!isMountedRef.current || currentGen !== deleteGenRef.current || ownerRef.current !== currentOwner || latestOwner !== currentOwner) return;
        setDeleteError(ApiErrorCodes.translate(deleteFailure, t) ?? t("form.deleteAccountError"));
        return;
      }

      const latestAuth = useAuthStore.getState();
      const latestOwner = `${latestAuth.role ?? "anonymous"}:${latestAuth.userId ?? "none"}`;
      if (!isMountedRef.current || currentGen !== deleteGenRef.current || ownerRef.current !== currentOwner || latestOwner !== currentOwner) return;

      setDeleteTarget(null);
      setDeleteError(null);
      showToast(t("form.deleteSuccess"));
      await refetch();
      restoreMentorsScrollAndFocus();
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
  const effectiveMentors = effectiveData?.items ?? [];
  const effectiveTotal = effectiveData?.total ?? 0;
  const effectiveTotalPages = effectiveData?.total_pages ?? 1;
  const hasLoadedOnce = isCurrentParamsMatchingLastGood || (data !== undefined && !isLoading);

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        count={
          <span className="inline-flex items-center gap-2">
            {isLoading && !isCurrentParamsMatchingLastGood ? (
              <span className="h-5 w-24 motion-safe:animate-pulse rounded bg-border" />
            ) : typeof effectiveData?.total === "number" ? (
              <span>{formatNumber(effectiveData.total, i18n.language)}</span>
            ) : null}
            {isFetching && !isLoading && <BrandActivityIndicator size={18} />}
          </span>
        }
        actions={
          <Button
            ref={addMentorTriggerRef}
            type="button"
            onClick={() => {
              activeTriggerRef.current = addMentorTriggerRef.current;
              setPanel({ mode: "create" });
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {t("addMentor")}
          </Button>
        }
      />

      <div className="min-w-0 sm:w-[30rem]">
        <Input
          ref={searchInputRef}
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          leftAddon={<Search size={16} aria-hidden="true" />}
        />
      </div>

      <MentorsTable
        mentors={effectiveMentors}
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
        onEdit={(mentor, trigger) => {
          activeTriggerRef.current = trigger ?? null;
          handleMentorNavigate(mentor);
          setPanel({ mode: "edit", mentor });
        }}
        onDeleteRequest={(mentor, trigger) => {
          activeTriggerRef.current = trigger ?? null;
          setDeleteError(null);
          setDeleteTarget(mentor);
        }}
        onAddMentor={() => {
          activeTriggerRef.current = addMentorTriggerRef.current;
          setPanel({ mode: "create" });
        }}
        onClearSearch={handleClearSearch}
        onMentorNavigate={handleMentorNavigate}
      />

      <MentorFormPanel
        open={panel !== null}
        mode={panel?.mode ?? "create"}
        mentor={panel && panel.mode === "edit" ? panel.mentor : undefined}
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
    </PageContainer>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCourses } from "../lib/courses/hooks";
import type { CourseResponse } from "../lib/courses/types";
import { useMentors } from "../lib/users/hooks";
import { compareMoney } from "../lib/money";
import { useAuthStore } from "../store/authStore";
import { CoursesStatsStrip } from "../components/courses/CoursesStatsStrip";
import {
  CoursesToolbar,
  type SortOption,
  type StatusFilter,
  type ViewMode,
} from "../components/courses/CoursesToolbar";
import { CourseCard } from "../components/courses/CourseCard";
import { CourseListRow } from "../components/courses/CourseListRow";
import { EmptyState } from "../components/courses/EmptyState";
import { CourseFormPanel } from "../components/courses/CourseFormPanel";
import { Button } from "../components/ui/Button";
import { Toast } from "../components/ui/Toast";

const VIEW_STORAGE_KEY = "imkon-courses-view";
const LIST_PAGE_SIZE = 100;

function getInitialView(): ViewMode {
  if (typeof window === "undefined") return "grid";
  return window.localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
}

export function Courses() {
  const { t } = useTranslation(["courses", "common"]);
  const role = useAuthStore((s) => s.role);
  const isSuperAdmin = role === "superadmin";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortOption>("newest");
  const [view, setView] = useState<ViewMode>(getInitialView);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });
  const [justCreatedId, setJustCreatedId] = useState<number | null>(null);
  const toastTimeoutRef = useRef<number | undefined>(undefined);
  const createdTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const {
    data: coursesPage,
    isLoading,
    isError,
    refetch,
  } = useCourses({ status: status === "all" ? undefined : status, page_size: LIST_PAGE_SIZE });
  const { data: mentorsPage } = useMentors({ page_size: 100 }, isSuperAdmin);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const items = coursesPage?.items ?? [];
    const result = query ? items.filter((c) => c.title.toLowerCase().includes(query)) : items;

    return [...result].sort((a, b) => {
      if (sort === "price") return compareMoney(a.price, b.price);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [coursesPage, search, sort]);

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(
      () => setToast((t) => ({ ...t, visible: false })),
      3000,
    );
  };

  const handleSaved = (action: "created" | "updated", course: CourseResponse) => {
    showToast(t("common:success"));
    if (action === "created") {
      setJustCreatedId(course.id);
      window.clearTimeout(createdTimeoutRef.current);
      createdTimeoutRef.current = window.setTimeout(() => setJustCreatedId(null), 500);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-ink">{t("title")}</h1>
          <p className="mt-0.5 text-[13px] text-muted">{t("subtitle")}</p>
        </div>
        {isSuperAdmin && (
          <Button variant="accent" onClick={() => setPanelOpen(true)}>
            <Plus size={16} className="mr-1.5" />
            {t("addCourse")}
          </Button>
        )}
      </div>

      <CoursesStatsStrip />

      <CoursesToolbar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        sort={sort}
        onSortChange={setSort}
        view={view}
        onViewChange={setView}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl border border-border-warm bg-beige/40" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border-warm bg-card p-10 text-center">
          <AlertCircle size={22} className="text-red-600" />
          <p className="text-sm text-muted">{t("loading")}</p>
          <Button type="button" variant="secondary" onClick={() => refetch()}>
            {t("common:retry")}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onReset={resetFilters} />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              mentor={mentorsPage?.items.find((m) => m.id === course.mentor_id)}
              justCreated={course.id === justCreatedId}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-warm bg-card">
          {filtered.map((course) => (
            <CourseListRow
              key={course.id}
              course={course}
              mentor={mentorsPage?.items.find((m) => m.id === course.mentor_id)}
            />
          ))}
        </div>
      )}

      <CourseFormPanel open={panelOpen} onClose={() => setPanelOpen(false)} onSaved={handleSaved} />

      <Toast message={toast.message} show={toast.visible} variant="success" />
    </div>
  );
}

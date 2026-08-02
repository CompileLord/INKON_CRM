import { useMemo, useState } from "react";
import { AlertCircle, Search } from "lucide-react";
import { useCourses } from "../lib/courses/hooks";
import { useMentors } from "../lib/users/hooks";
import { useAuthStore } from "../store/authStore";
import { JournalCard } from "../components/journals/JournalCard";
import { JournalsStatsStrip } from "../components/journals/JournalsStatsStrip";
import { EmptyState } from "../components/journals/EmptyState";
import { Button } from "../components/ui/Button";

type StatusFilter = "all" | "active" | "archived";

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "Все", value: "all" },
  { label: "Активные", value: "active" },
  { label: "Архив", value: "archived" },
];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

export function Journals() {
  const role = useAuthStore((s) => s.role);
  const isSuperAdmin = role === "superadmin";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const {
    data: coursesPage,
    isLoading,
    isError,
    refetch,
  } = useCourses({ status: status === "all" ? undefined : status, page_size: 100 });
  const { data: mentorsPage } = useMentors({ page_size: 100 }, isSuperAdmin);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const items = coursesPage?.items ?? [];
    return query ? items.filter((c) => c.title.toLowerCase().includes(query)) : items;
  }, [coursesPage, search]);

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Журналы</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          У каждого курса свой журнал — посещаемость, баллы, экзамен и бонусы
        </p>
      </div>

      <JournalsStatsStrip />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию курса…"
            className={`w-72 rounded-full border border-border-warm bg-card py-2 pl-9 pr-4 text-sm text-ink placeholder:text-muted ${FOCUS_RING}`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus(f.value)}
              className={[
                "rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-150",
                FOCUS_RING,
                status === f.value
                  ? "border-blue-600 bg-blue-50 text-blue-600"
                  : "border-border-warm bg-card text-nav hover:bg-strip",
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-border-warm bg-beige/40" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border-warm bg-card p-10 text-center">
          <AlertCircle size={22} className="text-red-600" />
          <p className="text-sm text-muted">Не удалось загрузить журналы</p>
          <Button type="button" variant="secondary" onClick={() => refetch()}>
            Повторить
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onReset={resetFilters} />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((course) => (
            <JournalCard
              key={course.id}
              course={course}
              mentor={mentorsPage?.items.find((m) => m.id === course.mentor_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

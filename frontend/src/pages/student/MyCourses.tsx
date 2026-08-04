import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen } from "lucide-react";
import { useMyStudentProfile } from "../../lib/users/hooks";
import { StudentCourseCard } from "../../components/student/StudentCourseCard";
import { StudentEmptyState } from "../../components/student/StudentEmptyState";

export function MyCourses() {
  const { t } = useTranslation(["student", "common"]);
  const [searchParams, setSearchParams] = useSearchParams();
  const bucketParam = searchParams.get("bucket") === "archive" ? "archive" : "active";

  const { data: profile, isLoading, isError, refetch } = useMyStudentProfile();

  const setBucket = (bucket: "active" | "archive") => {
    if (bucket === "archive") {
      setSearchParams({ bucket: "archive" });
    } else {
      setSearchParams({});
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-card" />
        <div className="h-10 w-64 rounded-xl bg-card" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-card border border-border-warm" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted">{t("common:error", "Произошла ошибка при загрузке курсов")}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-lg border border-border-warm bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-strip"
        >
          {t("common:retry", "Повторить")}
        </button>
      </div>
    );
  }

  const activeCourses = profile.courses.filter((c) => c.bucket === "active");
  const archiveCourses = profile.courses.filter((c) => c.bucket === "archive");
  const currentList = bucketParam === "archive" ? archiveCourses : activeCourses;

  return (
    <div className="flex flex-col gap-6">
      {/* 5.2.1 Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
            <BookOpen size={24} className="text-maroon dark:text-accent" />
            {t("myCoursesTitle", "Мои курсы")}
          </h1>
          <span className="rounded-full bg-strip px-2.5 py-0.5 text-xs font-semibold tabular-nums text-muted border border-border-warm">
            {profile.courses.length}
          </span>
        </div>
      </div>

      {/* 5.2.2 Segmented control */}
      <div role="tablist" className="inline-flex w-fit rounded-xl bg-strip p-1 border border-border-warm">
        <button
          type="button"
          role="tab"
          aria-selected={bucketParam === "active"}
          onClick={() => setBucket("active")}
          className={[
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-all duration-150 motion-safe:transition-transform",
            bucketParam === "active"
              ? "bg-card font-semibold text-ink shadow-xs"
              : "font-medium text-nav hover:text-ink",
          ].join(" ")}
        >
          {t("activeSegment", "Активные")}
          <span className="rounded-full bg-beige px-2 py-0.2 text-xs font-semibold tabular-nums text-muted">
            {activeCourses.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={bucketParam === "archive"}
          onClick={() => setBucket("archive")}
          className={[
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-all duration-150 motion-safe:transition-transform",
            bucketParam === "archive"
              ? "bg-card font-semibold text-ink shadow-xs"
              : "font-medium text-nav hover:text-ink",
          ].join(" ")}
        >
          {t("archiveSegment", "Архив")}
          <span className="rounded-full bg-beige px-2 py-0.2 text-xs font-semibold tabular-nums text-muted">
            {archiveCourses.length}
          </span>
        </button>
      </div>

      {/* 5.2.3 Grid */}
      {currentList.length === 0 ? (
        bucketParam === "archive" ? (
          <StudentEmptyState
            title={t("noArchivedTitle", "В архиве пока ничего нет")}
            body={t("noArchivedBody", "Курсы появятся здесь после их завершения.")}
          />
        ) : (
          <StudentEmptyState
            title={t("noCoursesTitle", "Вы пока не зачислены ни на один курс")}
            body={t("noCoursesBody", "Ваш координатор добавит вас после подтверждения записи.")}
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {currentList.map((entry) => (
            <StudentCourseCard key={entry.course.id} entry={entry} variant={bucketParam} />
          ))}
        </div>
      )}
    </div>
  );
}

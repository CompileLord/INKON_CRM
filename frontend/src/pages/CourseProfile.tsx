import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore, type AuthState } from "../store/authStore";
import { useCourse, useCourseJournals } from "../lib/courses/hooks";
import { useMentorProfile } from "../lib/users/hooks";
import { AuthApiError } from "../lib/auth/errors";
import { buildCourseJournalUrl, getSafeCourseReturnUrl, recordCourseDetailNavigation } from "../lib/courses/returnContext";
import { Button } from "../components/ui/Button";
import { PageContainer } from "../components/ui/PageContainer";
import { Tabs, tabElementId, tabPanelElementId, useTabParam, type TabDefinition } from "../components/ui/Tabs";
import { Toast } from "../components/ui/Toast";
import { ProfileBackLink } from "../components/profile/ProfileBackLink";
import { ProfileSkeleton, ProfileState } from "../components/profile/ProfileState";
import { CourseActionDialogs } from "../components/courses/CourseActionDialogs";
import { CourseDetailHeader } from "../components/courses/CourseDetailHeader";
import { CourseOverviewPane } from "../components/courses/CourseOverviewPane";
import { CourseProgressPane } from "../components/courses/CourseProgressPane";
import { CourseStudentsPane } from "../components/courses/CourseStudentsPane";
import { useCourseActions } from "../components/courses/useCourseActions";
import { useCourseDetailContext, type CourseTabId } from "../components/courses/useCourseDetailContext";
import { useCoursePeriodParam } from "../components/courses/useCoursePeriodParam";

const TAB_IDS: readonly CourseTabId[] = ["overview", "students", "progress"];
const PROFILE_ID_PREFIX: string = "course";

interface ToastState {
  message: string;
  visible: boolean;
  variant: "success" | "error";
}

class CourseFailure {
  static statusOf(error: unknown): number | undefined {
    if (error instanceof AuthApiError) return error.status;
    if (typeof error === "object" && error !== null) return (error as { status?: number }).status;
    return undefined;
  }
}

function CourseProfileOwner({ rawId }: { rawId: string | undefined }) {
  const { t } = useTranslation("courseDetail");
  const { t: tCommon } = useTranslation("common");
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((state: AuthState) => state.role);
  const currentUserId = useAuthStore((state: AuthState) => state.userId);
  const isSuperAdmin: boolean = role === "superadmin";

  const numericId: number | undefined = rawId ? Number(rawId) : undefined;
  const courseId: number | undefined = Number.isSafeInteger(numericId) && (numericId as number) > 0 ? numericId : undefined;

  const [activeTab, selectTab] = useTabParam(TAB_IDS, "overview");
  const activeTabId: CourseTabId = activeTab as CourseTabId;
  const [toast, setToast] = useState<ToastState>({ message: "", visible: false, variant: "success" });
  const toastTimeoutRef = useRef<number | undefined>(undefined);

  const { data: course, isLoading, isFetching, isError, error, refetch } = useCourse(courseId);
  const canQueryMentorProfile: boolean = Boolean(course?.mentor_id && (isSuperAdmin || (role === "mentor" && currentUserId === course.mentor_id)));
  const { data: mentorProfile } = useMentorProfile(canQueryMentorProfile ? course?.mentor_id : undefined);
  const { data: journals, isLoading: isJournalsLoading, isError: isJournalsError, refetch: refetchJournals } = useCourseJournals(activeTabId === "progress" ? courseId : undefined);

  const detail = useCourseDetailContext(courseId, activeTabId, Boolean(course) && !isLoading && (activeTabId !== "progress" || !isJournalsLoading));
  const actions = useCourseActions(course);

  const showToast = useCallback((message: string, variant: "success" | "error" = "success"): void => {
    setToast({ message, visible: true, variant });
    window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToast((previous: ToastState) => ({ ...previous, visible: false })), 3000);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimeoutRef.current), []);

  const notifyUnknownPeriod = useCallback((): void => showToast(t("periodNotFoundHelp"), "error"), [showToast, t]);
  useCoursePeriodParam({ isProgressTab: activeTabId === "progress", journals, isLoading: isJournalsLoading, isError: isJournalsError, onUnknownPeriod: notifyUnknownPeriod });

  const backLink = <ProfileBackLink to={getSafeCourseReturnUrl()} label={t("backToCourses")} />;
  const failureStatus: number | undefined = CourseFailure.statusOf(error);

  if (failureStatus === 403) {
    return <ProfileState stateName="forbidden" backLink={backLink} title={t("accessDenied")} message={t("accessDeniedHelp")} />;
  }
  if (!courseId || failureStatus === 404) {
    return <ProfileState stateName="notFound" backLink={backLink} title={t("notFound")} message={t("notFoundHelp")} />;
  }
  if (isLoading && !course) return <ProfileSkeleton backLink={backLink} hasStats />;
  if (isError && !course) {
    return <ProfileState stateName="failed" backLink={backLink} title={t("loadError")} message={t("loadErrorHelp")} onRetry={() => refetch()} />;
  }
  if (!course) return null;

  const mentorName: string | null = mentorProfile ? `${mentorProfile.user.first_name} ${mentorProfile.user.last_name}`.trim() : null;
  const requestedPeriod: number | undefined = searchParams.get("period") ? Number(searchParams.get("period")) : undefined;

  const tabs: TabDefinition[] = [
    { id: "overview", label: t("tabs.overview") },
    { id: "students", label: t("tabs.students") },
    { id: "progress", label: t("tabs.performance") },
  ];

  const recordJournalDeparture = (): void => {
    recordCourseDetailNavigation(course.id, {
      tab: activeTabId,
      periodId: requestedPeriod,
      search: detail.progressSearch,
      sort: detail.progressSort,
      scrollY: window.scrollY,
    });
  };

  const focusActionTrigger = (): HTMLElement | null => {
    const trigger: HTMLElement | null = document.querySelector<HTMLElement>('[data-entity-header] [aria-haspopup="menu"]');
    if (trigger && trigger.isConnected && trigger.offsetParent !== null) return trigger;
    return document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
  };

  const changeTab = (tabId: string): void => {
    detail.cancelScrollRestore();
    detail.resetPaneReadiness();
    selectTab(tabId);
  };

  return (
    <PageContainer>
      {backLink}

      {isError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-sm text-destructive">
          <span>{t("loadError")}</span>
          <Button type="button" variant="secondary" onClick={() => refetch()}>{tCommon("retry")}</Button>
        </div>
      ) : null}

      <CourseDetailHeader
        course={course}
        mentorName={mentorName}
        isRefreshing={isFetching && !isLoading}
        journalUrl={buildCourseJournalUrl(course.id)}
        onJournalDeparture={recordJournalDeparture}
        menuHandlers={isSuperAdmin ? { onEdit: actions.openEdit, onDuplicate: actions.openDuplicate, onDelete: actions.openDelete } : null}
      />

      <Tabs tabs={tabs} value={activeTabId} onChange={changeTab} ariaLabel={t("tabs.label")} idPrefix={PROFILE_ID_PREFIX} />

      <div role="tabpanel" id={tabPanelElementId(PROFILE_ID_PREFIX, activeTabId)} aria-labelledby={tabElementId(PROFILE_ID_PREFIX, activeTabId)} tabIndex={0} className="min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {activeTabId === "overview" ? (
          <CourseOverviewPane course={course} isSuperAdmin={isSuperAdmin} onReady={() => detail.markPaneReady("overview")} />
        ) : null}

        {activeTabId === "students" ? (
          <CourseStudentsPane
            courseId={course.id}
            courseTitle={course.title}
            coursePrice={course.price}
            isSuperAdmin={isSuperAdmin}
            isMentor={role === "mentor"}
            searchQuery={detail.rosterSearch}
            onSearchQueryChange={(query: string) => {
              detail.setRosterSearch(query);
              detail.setRosterPage(1);
            }}
            sortOption={detail.rosterSort}
            onSortOptionChange={detail.setRosterSort}
            page={detail.rosterPage}
            onPageChange={detail.setRosterPage}
            statusFilter={detail.rosterStatus}
            onStatusFilterChange={(next) => {
              detail.setRosterStatus(next);
              detail.setRosterPage(1);
            }}
            onToast={showToast}
            onReady={() => detail.markPaneReady("students")}
          />
        ) : null}

        {activeTabId === "progress" ? (
          <div className="flex flex-col gap-4">
            {isJournalsError ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-sm text-destructive">
                <span>{t("journalsLoadError")}</span>
                <Button type="button" variant="secondary" onClick={() => refetchJournals()}>{tCommon("retry")}</Button>
              </div>
            ) : null}
            <CourseProgressPane
              courseId={course.id}
              searchQuery={detail.progressSearch}
              onSearchQueryChange={detail.setProgressSearch}
              sortOption={detail.progressSort}
              onSortOptionChange={detail.setProgressSort}
              selectedPeriodId={requestedPeriod}
              onSelectedPeriodIdChange={(periodId: number) => {
                setSearchParams((previous: URLSearchParams) => {
                  const next: URLSearchParams = new URLSearchParams(previous);
                  next.set("period", String(periodId));
                  return next;
                }, { replace: true });
              }}
              onReady={() => detail.markPaneReady("progress")}
            />
          </div>
        ) : null}
      </div>

      <CourseActionDialogs
        course={course}
        actions={actions}
        finalFocus={focusActionTrigger}
        onUpdated={() => {
          showToast(t("updated"));
          refetch();
        }}
      />

      {toast.message !== "" ? <Toast message={toast.message} show={toast.visible} variant={toast.variant} /> : null}
    </PageContainer>
  );
}

export function CourseProfile() {
  const { id } = useParams<{ id: string }>();
  return <CourseProfileOwner key={id ?? "unknown"} rawId={id} />;
}

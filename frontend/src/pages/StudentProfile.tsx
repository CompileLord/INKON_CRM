import { useEffect, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Pencil, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useDeleteUser, useStudentProfile } from "../lib/users/hooks";
import { resolveMediaUrl } from "../lib/users/media";
import { formatDate } from "../i18n/formatters";
import { formatMoney } from "../lib/money";
import { AuthApiError, NetworkError } from "../lib/auth/errors";
import { useAuthStore } from "../store/authStore";
import { PersonAvatar } from "../components/ui/PersonAvatar";
import { BrandActivityIndicator } from "../components/ui/BrandActivityIndicator";
import { ProfileUnavailable, classifyProfileFailure, type ProfileUnavailableKind } from "../components/profile/ProfileUnavailable";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Toast } from "../components/ui/Toast";
import { StudentFormPanel } from "../components/students/StudentFormPanel";
import { StudentRowMenu } from "../components/students/StudentRowMenu";
import { StudentStatusPill } from "../components/students/StudentStatusPill";
import { StudentProfileMeta } from "../components/student/StudentProfileMeta";
import { StudentAccountAccessPopover } from "../components/student/StudentAccountAccessPopover";
import { StudentStatTiles } from "../components/student/StudentStatTiles";
import { StudentProgressPanel } from "../components/student/StudentProgressPanel";
import { StudentCourseStagePill } from "../components/student/StudentCourseStagePill";
import { ProfileTabs, type ProfileTabItem } from "../components/profile/ProfileTabs";
import { DocumentsTab } from "../components/documents/DocumentsTab";
import {
  getStudentProfileReturnTarget,
  getStudentCourseLink,
  getStudentProfileLocationState,
  parseStudentProfileTab,
} from "../lib/students/studentNavigation";
import { fetchFilteredEnrollments } from "../lib/enrollments/hooks";
import { withdrawEnrollment } from "../lib/enrollments/endpoints";
import type { StudentCourseProfile, User } from "../lib/users/types";

export function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const numericId = id ? Number(id) : undefined;
  const { t, i18n } = useTranslation(["students", "common", "documents"]);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const role = useAuthStore((state) => state.role);
  const currentUserId = useAuthStore((state) => state.userId);
  const ownerKey = `${numericId ?? "invalid"}:${role ?? "anonymous"}:${currentUserId ?? "unknown"}`;
  const ownerKeyRef = useRef(ownerKey);
  const ownerGenerationRef = useRef(0);
  const deleteOperationRef = useRef(0);
  if (ownerKeyRef.current !== ownerKey) {
    ownerGenerationRef.current += 1;
    ownerKeyRef.current = ownerKey;
  }
  const ownerGeneration = ownerGenerationRef.current;
  const isLiveOwner = () => {
    const auth = useAuthStore.getState();
    return isMountedRef.current && ownerGenerationRef.current === ownerGeneration
      && ownerKeyRef.current === ownerKey && auth.role === role && auth.userId === currentUserId;
  };
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    const unsubscribe = useAuthStore.subscribe((current, previous) => {
      if (current.role !== previous.role || current.userId !== previous.userId) {
        ownerGenerationRef.current += 1;
        deleteLockRef.current = false;
        setIsDeleting(false);
        setDeleteTarget(null);
        setDeleteError(null);
        setPanel(null);
        setActiveTab("courses");
        setCreatedFeedbackVisible(false);
        activeTriggerRef.current = null;
        window.clearTimeout(toastTimeoutRef.current);
        setToast({ message: "", visible: false, variant: "success" });
      }
    });
    return () => {
      isMountedRef.current = false;
      deleteOperationRef.current += 1;
      unsubscribe();
    };
  }, []);

  const initialProfileTab = parseStudentProfileTab(location.state) ?? "courses";
  const [activeTab, setActiveTab] = useState<"courses" | "performance" | "documents">(
    initialProfileTab,
  );

  const [panel, setPanel] = useState<{ mode: "edit"; student: User } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const deleteLockRef = useRef(false);
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);

  const [toast, setToast] = useState<{
    message: string;
    visible: boolean;
    variant: "success" | "error";
  }>({ message: "", visible: false, variant: "success" });
  const toastTimeoutRef = useRef<number | undefined>(undefined);

  const [createdFeedbackVisible, setCreatedFeedbackVisible] = useState(() => {
    const locState = location.state as { createdStudentId?: number } | null;
    return Boolean(role === "superadmin" && numericId && locState?.createdStudentId === numericId);
  });
  const previousProfileIdRef = useRef(numericId);
  const previousOwnerKeyRef = useRef(ownerKey);

  useEffect(() => {
    const ownerChanged = previousOwnerKeyRef.current !== ownerKey;
    previousOwnerKeyRef.current = ownerKey;
    setPanel(null);
    setDeleteTarget(null);
    setDeleteError(null);
    setIsDeleting(false);
    setActiveTab(ownerChanged ? "courses" : initialProfileTab);
    deleteLockRef.current = false;
    activeTriggerRef.current = null;
    window.clearTimeout(toastTimeoutRef.current);
    setToast({ message: "", visible: false, variant: "success" });
  }, [numericId, role, currentUserId, initialProfileTab]);

  useEffect(() => {
    if (previousProfileIdRef.current !== numericId) {
      previousProfileIdRef.current = numericId;
      setCreatedFeedbackVisible(false);
    }
  }, [numericId]);

  useEffect(() => {
    const locState = location.state as {
      createdStudentId?: number;
      fromDirectory?: { studentId?: number; search?: string; page?: number; pageSize?: number };
    } | null;
    if (numericId && locState?.createdStudentId === numericId) {
      const nextState = { ...locState };
      delete nextState.createdStudentId;
      navigate(location.pathname, { replace: true, state: nextState });
      const timer = window.setTimeout(() => {
        setCreatedFeedbackVisible(false);
      }, 5000);
      return () => {
        window.clearTimeout(timer);
      };
    }
    if (locState?.createdStudentId !== undefined) {
      setCreatedFeedbackVisible(false);
    }
  }, [location.pathname, location.state, navigate, numericId]);

  const {
    data: queriedProfile,
    isLoading,
    isError,
    error,
    refetch,
  } = useStudentProfile(Number.isFinite(numericId) ? numericId : undefined);

  const profileOwnerIsAuthorized = role === "superadmin"
    || (role === "student" && currentUserId === numericId)
    || (role === "mentor" && queriedProfile?.courses.some((item) => item.course.mentor_id === currentUserId));
  const profile = queriedProfile?.user.id === numericId && profileOwnerIsAuthorized ? queriedProfile : undefined;
  const hasTransientRefreshError = isError && (
    error instanceof NetworkError
    || (error instanceof AuthApiError && error.status >= 500 && error.status <= 599)
  );
  const canRetainProfile = Boolean(profile && (!isError || hasTransientRefreshError));

  useEffect(() => {
    if (!isError || hasTransientRefreshError) return;
    ownerGenerationRef.current += 1;
    deleteOperationRef.current += 1;
    deleteLockRef.current = false;
    setPanel(null);
    setDeleteTarget(null);
    setDeleteError(null);
    setIsDeleting(false);
    setActiveTab("courses");
    activeTriggerRef.current = null;
    window.clearTimeout(toastTimeoutRef.current);
    setToast({ message: "", visible: false, variant: "success" });
  }, [isError, hasTransientRefreshError, error]);

  const deleteUser = useDeleteUser("student");

  const showToast = (message: string, variant: "success" | "error" = "success") => {
    setToast({ message, visible: true, variant });
    window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast((current) => ({ ...current, visible: false }));
    }, 3000);
  };

  const profileCourses = profile?.courses.map((item) => ({
    id: item.course.id,
    mentorId: item.course.mentor_id,
  })) ?? [];
  const returnTarget = getStudentProfileReturnTarget(
    role,
    currentUserId,
    location.state,
    profileCourses,
  );

  const handleSaved = (_action: "created" | "updated", updatedStudent?: User) => {
    if (!isLiveOwner() || updatedStudent?.id !== numericId) return;
    setPanel(null);
    showToast(t("form.updateSuccess"));
    refetch();
    requestAnimationFrame(() => {
      if (isLiveOwner()) activeTriggerRef.current?.focus();
    });
  };

  const handleAvatarSaved = (updatedStudent?: User) => {
    if (!isLiveOwner() || updatedStudent?.id !== numericId) return;
    refetch();
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleteLockRef.current || !isLiveOwner() || role !== "superadmin") return;
    const operationGeneration = ++deleteOperationRef.current;
    const targetStudentId = deleteTarget.id;
    const isCurrentOperationOwner = () => isLiveOwner() && deleteOperationRef.current === operationGeneration;
    const reconcileStudentState = () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["users", "students", "profile", targetStudentId] });
    };
    deleteLockRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      let enrollments = [];
      try {
        enrollments = await fetchFilteredEnrollments({
          student_id: targetStudentId,
        });
      } catch {
        if (isCurrentOperationOwner()) setDeleteError(t("form.deleteWithdrawError"));
        return;
      }
      if (!isCurrentOperationOwner()) return;

      const activeEnrollments = (enrollments ?? [])
        .filter((e) => e.status === "active")
        .map((e) => e.id);

      let withdrawnCount = 0;
      for (const enrollmentId of activeEnrollments) {
        try {
          if (!isCurrentOperationOwner()) return;
          await withdrawEnrollment(enrollmentId);
          withdrawnCount++;
          if (!isCurrentOperationOwner()) {
            reconcileStudentState();
            return;
          }
        } catch {
          reconcileStudentState();
          if (isCurrentOperationOwner()) setDeleteError(
            withdrawnCount > 0
              ? t("form.deleteFailedAfterWithdraw")
              : t("form.deleteWithdrawError"),
          );
          return;
        }
      }

      try {
        if (!isCurrentOperationOwner()) return;
        await deleteUser.mutateAsync(targetStudentId);
        reconcileStudentState();
      } catch {
        reconcileStudentState();
        if (isCurrentOperationOwner()) setDeleteError(
          withdrawnCount > 0
            ? t("form.deleteFailedAfterWithdraw")
            : t("form.deleteAccountError"),
        );
        return;
      }
      if (!isCurrentOperationOwner()) return;

      setDeleteTarget(null);
      setDeleteError(null);
      navigate(returnTarget.to, {
        state: returnTarget.state,
      });
    } finally {
      if (isCurrentOperationOwner()) {
        deleteLockRef.current = false;
        setIsDeleting(false);
      }
    }
  };

  const tabs: ProfileTabItem<"courses" | "performance" | "documents">[] = [
    { id: "courses", label: t("coursesTab") },
    { id: "performance", label: t("performanceTab") },
    { id: "documents", label: t("documentsTab") },
  ];

  const handleTabChange = (tabId: "courses" | "performance" | "documents") => {
    setActiveTab(tabId);
    const currentState = getStudentProfileLocationState(location.state);
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: { ...currentState, profileTab: tabId },
    });
  };

  const returnLink = <PageHeader backTo={returnTarget.to} backState={returnTarget.state} backLabel={t(returnTarget.labelKey)} />;

  const renderUnavailableProfile = (kind: ProfileUnavailableKind) => (
    <ProfileUnavailable
      kind={kind}
      title={t(`profileState.${kind}Title`)}
      description={t(`profileState.${kind}Body`)}
      returnLink={returnLink}
      retryLabel={t("common:retry")}
      onRetry={() => refetch()}
    />
  );

  if (!numericId || Number.isNaN(numericId)) {
    return renderUnavailableProfile("notFound");
  }

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm text-muted">
          <BrandActivityIndicator size={22} aria-hidden="true" />
          <span>{t("common:loading")}</span>
        </div>
        {returnLink}
        <div className="min-w-0 rounded-xl border border-border-warm bg-card p-4 motion-safe:animate-pulse">
          <div className="flex min-w-0 items-start gap-3">
            <div data-loading-avatar className="h-12 w-12 shrink-0 rounded-full bg-border-warm/70" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="h-8 w-full max-w-48 rounded bg-border-warm/70" />
              <div className="h-5 w-full max-w-72 rounded bg-border-warm/40" />
            </div>
            {role === "superadmin" && <div className="flex shrink-0 gap-2"><div className="h-11 w-11 rounded-[10px] bg-border-warm/40" /><div className="hidden h-11 w-20 rounded-[10px] bg-border-warm/40 md:block" /><div className="h-11 w-11 rounded-[10px] bg-border-warm/40" /></div>}
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-3 gap-2 motion-safe:animate-pulse">
          {[0, 1, 2].map((metricIndex) => <div key={metricIndex} className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-strip p-3"><div className="h-4 w-16 rounded bg-border-warm/40" /><div className="h-7 w-14 rounded bg-border-warm/40" /></div>)}
        </div>
        <div data-loading-tabs className="flex min-w-0 gap-1.5 overflow-x-auto border-b border-border-warm pb-3 motion-safe:animate-pulse">
          {[0, 1, 2].map((tabIndex) => <div key={tabIndex} className="h-11 min-w-0 flex-1 rounded-[10px] bg-border-warm/40" />)}
        </div>
        <div className="flex min-w-0 flex-col gap-3 motion-safe:animate-pulse">
          {[0, 1].map((courseIndex) => <div key={courseIndex} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border-warm bg-card p-4"><div className="flex min-w-0 justify-between gap-3"><div className="h-6 w-full max-w-48 rounded bg-border-warm/40" /><div className="h-5 w-14 shrink-0 rounded bg-border-warm/40" /></div><div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:justify-between"><div className="h-4 w-full max-w-48 rounded bg-border-warm/40" /><div className="h-4 w-full max-w-24 rounded bg-border-warm/40" /></div><div className="h-4 w-full max-w-40 rounded bg-border-warm/40" /></div>)}
        </div>
      </div>
    );
  }

  if (!profile || !canRetainProfile) {
    const unauthorizedProfileLoaded = queriedProfile?.user.id === numericId && !profileOwnerIsAuthorized;
    return renderUnavailableProfile(unauthorizedProfileLoaded ? "forbidden" : classifyProfileFailure(isError ? error : undefined));
  }

  const { user, courses, performance } = profile;

  return (
    <div className="flex flex-col gap-4">
      {returnLink}

      {hasTransientRefreshError && (
        <div role="alert" className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border-warm bg-card p-3 text-sm text-muted">
          <p className="min-w-0 flex-1">{t("profileRefreshError")}</p>
          <Button variant="secondary" onClick={() => refetch()} className="min-h-11">{t("common:retry")}</Button>
        </div>
      )}

      {createdFeedbackVisible && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-ink"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="shrink-0 text-maroon dark:text-accent" />
            <span>{t("form.createSuccess")}</span>
          </div>
          <button
            type="button"
            onClick={() => setCreatedFeedbackVisible(false)}
            className="min-h-11 min-w-11 px-3 text-sm font-semibold hover:underline"
            aria-label={t("common:close")}
          >
            {t("common:close")}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-border-warm bg-card px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <PersonAvatar
              firstName={user.first_name}
              lastName={user.last_name}
              photoUrl={resolveMediaUrl(user.thumbnail_path ?? user.photo_path) ?? undefined}
              size={48}
            />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="text-2xl font-bold leading-8 text-ink break-words md:text-[28px] md:leading-9">
                  {user.first_name} {user.last_name}
                </h1>
                <StudentStatusPill isDeleted={user.is_deleted} />
              </div>
            </div>
          </div>

          {role === "superadmin" && (
            <div className="flex shrink-0 items-center gap-1">
              <StudentAccountAccessPopover key={ownerKey} rawPassword={user.raw_password} />
              <div className="hidden md:block">
                <Button
                  ref={activeTriggerRef}
                  variant="secondary"
                  onClick={() => setPanel({ mode: "edit", student: user })}
                  className="min-h-11 shrink-0"
                >
                  <Pencil size={15} /> {t("edit")}
                </Button>
              </div>
              <StudentRowMenu
                student={user}
                onEdit={(student, trigger) => {
                  if (trigger instanceof HTMLButtonElement) activeTriggerRef.current = trigger;
                  setPanel({ mode: "edit", student });
                }}
                onDelete={(student, trigger) => {
                  if (trigger instanceof HTMLButtonElement) activeTriggerRef.current = trigger;
                  setDeleteTarget(student);
                }}
              />
            </div>
          )}
        </div>
        <div className="pl-[60px]">
          <StudentProfileMeta user={user} />
        </div>
      </div>

      <StudentStatTiles performance={performance} />

      <ProfileTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        ariaLabel={t("studentActions")}
      />

      <div
        role="tabpanel"
        id="profile-tabpanel-courses"
        aria-labelledby="profile-tab-courses"
        hidden={activeTab !== "courses"}
        className="flex flex-col gap-3"
      >
          {courses.length === 0 ? (
            <div className="rounded-xl border border-border-warm bg-card p-6 text-center text-sm text-muted">
              <p className="font-semibold text-ink">{t("noCoursesTitle")}</p>
              <p className="mt-1 text-xs">
                {t(role === "student" ? "noCoursesStudentDescription" : "noCoursesDescription")}
              </p>
            </div>
          ) : (
            courses.map((item: StudentCourseProfile) => {
              const linkInfo = getStudentCourseLink(
                item.course.id,
                item.course.mentor_id,
                role,
                currentUserId,
              );
              return (
                <div
                  key={item.course.id}
                  className="flex min-w-0 flex-col gap-2 rounded-xl border border-border-warm bg-card p-4 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-row-hover"
                >
                  <div className="flex items-start justify-between gap-3">
                    {linkInfo.isNavigable ? (
                      <Link
                        to={linkInfo.to}
                        className="min-w-0 break-words text-base font-semibold text-ink hover:underline [overflow-wrap:anywhere]"
                      >
              {item.course.title}
                      </Link>
                    ) : (
                      <span className="min-w-0 break-words text-base font-semibold text-ink [overflow-wrap:anywhere]">
                        {item.course.title}
                      </span>
                    )}
                    <StudentCourseStagePill course={item} />
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      {formatDate(item.course.start_date, i18n.language)} –{" "}
                      {formatDate(item.course.end_date, i18n.language)}
                    </span>
                    <span className="font-semibold text-ink tabular-nums">
                      {formatMoney(item.course.price, { suffix: t("currencyTjs") })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
      </div>

      <div
        role="tabpanel"
        id="profile-tabpanel-performance"
        aria-labelledby="profile-tab-performance"
        hidden={activeTab !== "performance"}
      >
        {activeTab === "performance" && (
          <StudentProgressPanel
            key={`${role ?? "anonymous"}:${currentUserId ?? "unknown"}:${user.id}`}
            studentId={user.id}
            courses={courses}
            performance={performance}
            role={role}
            currentUserId={currentUserId}
          />
        )}
      </div>

      <div
        role="tabpanel"
        id="profile-tabpanel-documents"
        aria-labelledby="profile-tab-documents"
        hidden={activeTab !== "documents"}
      >
        {activeTab === "documents" && (
          <DocumentsTab
            key={`${role ?? "anonymous"}:${currentUserId ?? "unknown"}:${user.id}`}
            ownerType="student"
            ownerId={user.id}
            canManage={role === "superadmin"}
            ownerName={`${user.first_name} ${user.last_name}`}
          />
        )}
      </div>

      <StudentFormPanel
        open={panel !== null && panel.student.id === numericId && role === "superadmin"}
        mode="edit"
        student={panel?.student}
        onClose={() => {
          if (!isLiveOwner()) return;
          setPanel(null);
          requestAnimationFrame(() => {
            if (isLiveOwner()) activeTriggerRef.current?.focus();
          });
        }}
        onSaved={handleSaved}
        onAvatarSaved={handleAvatarSaved}
        finalFocus={activeTriggerRef}
      />

      <ConfirmDialog
        open={deleteTarget !== null && deleteTarget.id === numericId && role === "superadmin"}
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
          if (!isLiveOwner()) return;
          setDeleteTarget(null);
          setDeleteError(null);
          requestAnimationFrame(() => {
            if (isLiveOwner()) activeTriggerRef.current?.focus();
          });
        }}
        finalFocus={activeTriggerRef}
      />

      {toast.visible && <Toast message={toast.message} show={toast.visible} variant={toast.variant} />}
    </div>
  );
}

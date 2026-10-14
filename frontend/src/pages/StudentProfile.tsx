import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Cake,
  Mail,
  Phone,
  Key,
  Eye,
  EyeOff,
  Pencil,
  CheckCircle2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useDeleteUser, useStudentProfile } from "../lib/users/hooks";
import { resolveMediaUrl } from "../lib/users/media";
import { formatDate, formatNumber } from "../i18n/formatters";
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

function CourseStatusBadge({ status }: { status: "active" | "archived" }) {
  const { t } = useTranslation("students");
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "active"
          ? "bg-success-surface text-success"
          : "bg-beige text-muted",
      ].join(" ")}
    >
      {status === "active" ? t("courseStatus.active") : t("courseStatus.archived")}
    </span>
  );
}

function CourseEnrollmentBadge({ status }: { status: "active" | "withdrawn" | "completed" }) {
  const { t } = useTranslation("students");
  return (
    <span className="inline-flex items-center rounded-full bg-strip px-2.5 py-0.5 text-xs font-medium text-ink">
      {t(`courseStatus.${status}`)}
    </span>
  );
}

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
        setShowPassword(false);
        setAccountDisclosureOpen(false);
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
  const [showPassword, setShowPassword] = useState(false);
  const [accountDisclosureOpen, setAccountDisclosureOpen] = useState(false);

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
    setShowPassword(false);
    setAccountDisclosureOpen(false);
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
    setShowPassword(false);
    setAccountDisclosureOpen(false);
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

  const returnLink = (
    <Link
      to={returnTarget.to}
      state={returnTarget.state}
      className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-nav hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
    >
      <ArrowLeft size={16} /> {t(returnTarget.labelKey)}
    </Link>
  );

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
        <Link
          to={returnTarget.to}
          state={returnTarget.state}
          className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-nav hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
        >
          <ArrowLeft size={16} /> {t(returnTarget.labelKey)}
        </Link>
        <div className="min-w-0 rounded-xl border border-border-warm bg-card p-4 md:p-5 motion-safe:animate-pulse">
          <div className="flex min-w-0 items-start gap-3 md:gap-4">
            <div data-loading-avatar className="h-12 w-12 shrink-0 rounded-full bg-border-warm/70 md:h-16 md:w-16" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="h-8 w-full max-w-48 rounded bg-border-warm/70 md:h-9" />
              <div className="hidden h-11 w-full max-w-64 rounded bg-border-warm/40 md:block" />
            </div>
            {role === "superadmin" && <div className="flex shrink-0 gap-2"><div className="hidden h-11 w-20 rounded-[10px] bg-border-warm/40 md:block" /><div className="h-11 w-11 rounded-[10px] bg-border-warm/40" /></div>}
          </div>
          <div className="mt-2 h-11 w-full max-w-64 rounded bg-border-warm/40 md:hidden" />
          <div className="mt-1 h-11 w-full max-w-40 rounded bg-border-warm/40" />
          {role === "superadmin" && <div className="mt-1 h-11 w-full max-w-40 rounded bg-border-warm/40" />}
        </div>
        <div className="grid min-w-0 grid-cols-3 gap-2 rounded-xl bg-strip p-3 motion-safe:animate-pulse">
          {[0, 1, 2].map((metricIndex) => <div key={metricIndex} className="flex min-w-0 flex-col gap-1"><div className="h-9 rounded bg-border-warm/40" /><div className="h-8 rounded bg-border-warm/40" /></div>)}
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

  const storedScore = performance?.raw_avg_percentage;
  const storedScoreIsMissing = storedScore === null || storedScore === undefined;
  const scoreDisplay = storedScore === null || storedScore === undefined
    ? t("missingScoreValue")
    : formatNumber(storedScore, i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const absencesDisplay = performance ? formatNumber(performance.absences, i18n.language) : t("attendanceUnavailable");
  const lessonsDisplay = performance ? formatNumber(performance.total_lessons, i18n.language) : t("attendanceUnavailable");

  return (
    <div className="flex flex-col gap-4">
      <Link
        to={returnTarget.to}
        state={returnTarget.state}
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-nav hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
      >
        <ArrowLeft size={16} /> {t(returnTarget.labelKey)}
      </Link>

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

      <div className="rounded-xl border border-border-warm bg-card p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 md:gap-4">
          <div className="flex items-start gap-3 md:gap-4 min-w-0">
            <div className="hidden md:block shrink-0">
              <PersonAvatar
                firstName={user.first_name}
                lastName={user.last_name}
                photoUrl={resolveMediaUrl(user.thumbnail_path ?? user.photo_path) ?? undefined}
                size={64}
              />
            </div>
            <div className="md:hidden shrink-0">
              <PersonAvatar
                firstName={user.first_name}
                lastName={user.last_name}
                photoUrl={resolveMediaUrl(user.thumbnail_path ?? user.photo_path) ?? undefined}
                size={48}
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl leading-8 md:text-[28px] md:leading-9 font-bold text-ink break-words">
                {user.first_name} {user.last_name}
              </h1>
              <div className="hidden md:flex mt-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <a
                  href={`mailto:${user.email}`}
                  className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 text-nav hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
                >
                  <Mail size={14} /> <span className="sr-only">{t("emailLabel")}: </span><span className="min-w-0 break-all">{user.email}</span>
                </a>
                {user.phone && (
                  <a
                    href={`tel:${user.phone}`}
                    className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 tabular-nums text-nav hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
                  >
                  <Phone size={14} /> <span className="sr-only">{t("phoneLabel")}: </span><span className="break-words">{user.phone}</span>
                  </a>
                )}
                {user.parent_phone && (
                  <a
                    href={`tel:${user.parent_phone}`}
                    className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 tabular-nums text-nav hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
                  >
                  <Phone size={14} /> <span>{t("parentPhoneLabel")}:</span> {user.parent_phone}
                  </a>
                )}
              </div>
            </div>
          </div>

          {role === "superadmin" && (
            <>
              <div className="flex shrink-0 items-center gap-2">
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
            </>
          )}
        </div>

        <div className="md:hidden mt-2 flex flex-col gap-1 text-sm text-muted">
          <a
            href={`mailto:${user.email}`}
            className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 text-nav hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
          >
            <Mail size={14} /> <span className="sr-only">{t("emailLabel")}: </span><span className="min-w-0 break-all">{user.email}</span>
          </a>
          {user.phone && (
            <a
              href={`tel:${user.phone}`}
              className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 tabular-nums text-nav hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
            >
            <Phone size={14} /> <span className="sr-only">{t("phoneLabel")}: </span><span className="break-words">{user.phone}</span>
            </a>
          )}
          {user.parent_phone && (
            <a
              href={`tel:${user.parent_phone}`}
              className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 tabular-nums text-nav hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
            >
            <Phone size={14} /> <span>{t("parentPhoneLabel")}:</span> {user.parent_phone}
            </a>
          )}
        </div>

        <div className="mt-1 flex flex-col gap-1">
          {user.date_of_birth && (
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-xs font-medium text-nav hover:text-ink select-none list-none">
                <Cake size={13} /> {t("personalDetails")}
              </summary>
              <div className="mt-1 pl-5 text-xs text-muted">
                <span className="font-medium text-ink">{t("dateOfBirth")}:</span>{" "}
                {formatDate(user.date_of_birth, i18n.language)}
              </div>
            </details>
          )}

          {role === "superadmin" && (
            <details
              className="group"
              open={accountDisclosureOpen}
              onToggle={(e) => {
                const isOpen = e.currentTarget.open;
                setAccountDisclosureOpen(isOpen);
                if (!isOpen) {
                  setShowPassword(false);
                }
              }}
            >
              <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-xs font-medium text-nav hover:text-ink select-none list-none">
                <Key size={13} /> {t("accountAccess")}
              </summary>
              <div className="mt-1 pl-5 flex items-center gap-2 text-xs">
                {user.raw_password ? (
                  <>
                    <span className="text-muted">{t("passwordLabel")}:</span>
                    <span className="font-mono font-bold tracking-wider text-ink">
                      {showPassword ? user.raw_password : "••••••••"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center p-2 text-nav hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
                      aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </>
                ) : (
                  <span className="text-muted">{t("credentialsUnavailable")}</span>
                )}
              </div>
            </details>
          )}
        </div>
      </div>

      <div data-profile-summary className="grid grid-cols-3 gap-2 rounded-xl bg-strip p-3">
        <div className="flex min-w-0 flex-col [overflow-wrap:anywhere]">
          <p className="text-xs leading-[1.5] font-medium text-muted">{t("rawScoreUnverified")}</p>
          <p className="mt-1 text-2xl leading-[1.333333] font-semibold text-ink tabular-nums">
            {storedScoreIsMissing ? (
              <>
                <span aria-hidden="true">{scoreDisplay}</span>
                <span className="sr-only">{t("scoreUnavailable")}</span>
              </>
            ) : scoreDisplay}
          </p>
        </div>
        <div className="flex min-w-0 flex-col [overflow-wrap:anywhere]">
          <p className="text-xs leading-[1.5] font-medium text-muted">{t("absences")}</p>
          <p className="mt-1 text-2xl leading-[1.333333] font-semibold text-ink tabular-nums">{absencesDisplay}</p>
        </div>
        <div className="flex min-w-0 flex-col [overflow-wrap:anywhere]">
          <p className="text-xs leading-[1.5] font-medium text-muted">{t("totalLessons")}</p>
          <p className="mt-1 text-2xl leading-[1.333333] font-semibold text-ink tabular-nums">{lessonsDisplay}</p>
        </div>
      </div>

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
                    <CourseStatusBadge status={item.course.status} />
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
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span>{t("enrollmentStatusLabel")}:</span>
                    <CourseEnrollmentBadge status={item.enrollment_status} />
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
        className="flex flex-col gap-5"
      >
        <div className="rounded-xl border border-border-warm bg-card p-4 md:p-5">
          {performance ? (
            <>
              <h2 className="text-base font-bold text-ink">{t("performance.overallTitle")}</h2>

            <div className="mt-3 flex flex-col gap-1.5 border-b border-border-warm pb-3 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted">{t("performance.scopeLabel")}:</span>
                <span className="font-medium text-ink">
                  {t("performance.scopeAllRecordedSummaries")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted">{t("performance.denominatorBasisLabel")}:</span>
                <span className="font-medium text-ink">
                  {t("performance.basisStoredPeriodTotalLessons")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted">{t("performance.gradingProvenanceLabel")}:</span>
                <span className="font-medium text-ink">
                  {t("performance.gradingProvenanceUnknown")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted">{t("performance.gradingStateLabel")}:</span>
                <span className="font-medium text-ink">
                  {performance?.grading_state === "missing"
                    ? t("performance.gradingStateMissing")
                    : t("performance.gradingStateUnknown")}
                </span>
              </div>
            </div>
            {performance.attendance_denominator === 0 && (
              <p className="mt-3 text-xs text-muted">
                {t("attendance")}: {t("attendanceUnavailable")}
              </p>
            )}
            </>
          ) : (
            <p className="text-sm text-muted">{t("performance.unavailable")}</p>
          )}
          </div>

          <div className="rounded-xl border border-border-warm bg-card p-4 md:p-5">
            <h2 className="text-base font-bold text-ink">{t("performance.courseBreakdownTitle")}</h2>
            {courses.length === 0 ? (
              <p className="mt-3 text-xs text-muted">{t("noCourses")}</p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {courses.map((item: StudentCourseProfile) => {
                  const linkInfo = getStudentCourseLink(
                    item.course.id,
                    item.course.mentor_id,
                    role,
                    currentUserId,
                  );
                  return (
                    <div
                      key={item.course.id}
                      className="rounded-lg border border-border-warm p-3.5 flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        {linkInfo.isNavigable ? (
                          <Link
                            to={linkInfo.to}
                            className="min-w-0 break-words text-sm font-semibold text-ink hover:underline [overflow-wrap:anywhere]"
                          >
                            {item.course.title}
                          </Link>
                        ) : (
                          <span className="min-w-0 break-words text-sm font-semibold text-ink [overflow-wrap:anywhere]">
                            {item.course.title}
                          </span>
                        )}
                        <CourseStatusBadge status={item.course.status} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span>{t("enrollmentStatusLabel")}:</span>
                        <CourseEnrollmentBadge status={item.enrollment_status} />
                      </div>

                      <div className="flex flex-wrap gap-x-1 text-xs text-muted">
                        <span>{t("performance.scopeSingleCourse")}</span>
                        <span aria-hidden="true">·</span>
                        <span>{t("performance.gradingProvenanceUnknown")}</span>
                      </div>

                      {item.performance ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-xs">
                          <div>
                            <span className="text-muted">{t("avgScore")}: </span>
                            <span className="font-semibold text-ink tabular-nums">
                              {item.performance.raw_avg_percentage !== null
                                ? `${formatNumber(item.performance.raw_avg_percentage, i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${formatNumber(100, i18n.language)}`
                                : t("scoreUnavailable")}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted">{t("attendance")}: </span>
                            <span className="font-semibold text-ink tabular-nums">
                              {item.performance.attendance_percentage !== null
                                ? `${formatNumber(item.performance.attendance_percentage, i18n.language, { maximumFractionDigits: 0 })}%`
                                : t("attendanceUnavailable")}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted">{t("absences")}: </span>
                            <span className="font-semibold text-ink tabular-nums">
                              {formatNumber(item.performance.absences, i18n.language)} / {formatNumber(item.performance.total_lessons, i18n.language)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted">{t("performance.summariesCount")}: </span>
                            <span className="font-semibold text-ink tabular-nums">
                              {formatNumber(item.performance.period_summaries_count, i18n.language)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted">{t("performance.noCoursePerformance")}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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

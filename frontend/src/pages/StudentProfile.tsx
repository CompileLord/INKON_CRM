import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStudentProfile } from "../lib/users/hooks";
import { AuthApiError, NetworkError } from "../lib/auth/errors";
import { useAuthStore } from "../store/authStore";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { PageContainer } from "../components/ui/PageContainer";
import { Tabs, tabElementId, tabPanelElementId, useTabParam, type TabDefinition } from "../components/ui/Tabs";
import { Toast } from "../components/ui/Toast";
import { ProfileBackLink } from "../components/profile/ProfileBackLink";
import { ProfileSkeleton, ProfileState } from "../components/profile/ProfileState";
import { classifyProfileFailure, type ProfileUnavailableKind } from "../components/profile/ProfileUnavailable";
import { DocumentsTab } from "../components/documents/DocumentsTab";
import { StudentFormPanel } from "../components/students/StudentFormPanel";
import { StudentCreatedNotice } from "../components/student/StudentCreatedNotice";
import { StudentPasswordSmsDialog } from "../components/student/StudentPasswordSmsDialog";
import { StudentCoursesTab } from "../components/student/StudentCoursesTab";
import { StudentProfileHeader } from "../components/student/StudentProfileHeader";
import { StudentProgressPanel } from "../components/student/StudentProgressPanel";
import { StudentStatTiles } from "../components/student/StudentStatTiles";
import { useStudentDeletion } from "../components/student/useStudentDeletion";
import { getStudentProfileReturnTarget, parseStudentProfileTab, type StudentProfileTabId } from "../lib/students/studentNavigation";
import type { CreatedCredentials, User } from "../lib/users/types";

const TAB_IDS: readonly StudentProfileTabId[] = ["courses", "performance", "documents"];
const PROFILE_ID_PREFIX: string = "profile";

interface ToastState {
  message: string;
  visible: boolean;
  variant: "success" | "error";
}

interface CreationState {
  createdStudentId?: number;
  createdParentLinkCode?: string | null;
  createdCredentials?: CreatedCredentials | null;
}

export function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const numericId: number | undefined = id ? Number(id) : undefined;
  const { t } = useTranslation(["studentProfile", "students", "common"]);
  const navigate = useNavigate();
  const location = useLocation();

  const role = useAuthStore((state) => state.role);
  const currentUserId = useAuthStore((state) => state.userId);
  const isSuperAdmin: boolean = role === "superadmin";
  const ownerKey: string = `${numericId ?? "invalid"}:${role ?? "anonymous"}:${currentUserId ?? "unknown"}`;
  const ownerKeyRef = useRef<string>(ownerKey);
  const ownerGenerationRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  if (ownerKeyRef.current !== ownerKey) {
    ownerGenerationRef.current += 1;
    ownerKeyRef.current = ownerKey;
  }
  const ownerGeneration: number = ownerGenerationRef.current;
  const isLiveOwner = (): boolean => {
    const auth = useAuthStore.getState();
    return isMountedRef.current && ownerGenerationRef.current === ownerGeneration && ownerKeyRef.current === ownerKey && auth.role === role && auth.userId === currentUserId;
  };

  const stateTab: StudentProfileTabId | undefined = parseStudentProfileTab(location.state);
  const [queryTab, selectTab] = useTabParam(TAB_IDS, stateTab ?? "courses");
  const activeTab: StudentProfileTabId = queryTab as StudentProfileTabId;

  const [formStudent, setFormStudent] = useState<User | null>(null);
  const [isAccessOpen, setIsAccessOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState>({ message: "", visible: false, variant: "success" });
  const toastTimeoutRef = useRef<number | undefined>(undefined);
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);

  const creation = location.state as CreationState | null;
  const [createdFeedbackVisible, setCreatedFeedbackVisible] = useState<boolean>(() => Boolean(isSuperAdmin && numericId && creation?.createdStudentId === numericId));
  const [createdParentLinkCode, setCreatedParentLinkCode] = useState<string | null>(() => (isSuperAdmin && numericId && creation?.createdStudentId === numericId ? creation.createdParentLinkCode ?? null : null));
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(() => (isSuperAdmin && numericId && creation?.createdStudentId === numericId ? creation.createdCredentials ?? null : null));
  const previousProfileIdRef = useRef<number | undefined>(numericId);

  const { data: queriedProfile, isLoading, isError, error, refetch } = useStudentProfile(Number.isFinite(numericId) ? numericId : undefined);
  const profileOwnerIsAuthorized: boolean = isSuperAdmin || (role === "student" && currentUserId === numericId) || (role === "mentor" && Boolean(queriedProfile?.courses.some((item) => item.course.mentor_id === currentUserId)));
  const profile = queriedProfile?.user.id === numericId && profileOwnerIsAuthorized ? queriedProfile : undefined;
  const hasTransientRefreshError: boolean = isError && (error instanceof NetworkError || (error instanceof AuthApiError && error.status >= 500 && error.status <= 599));
  const canRetainProfile: boolean = Boolean(profile && (!isError || hasTransientRefreshError));

  const returnTarget = getStudentProfileReturnTarget(role, currentUserId, location.state, profile?.courses.map((item) => ({ id: item.course.id, mentorId: item.course.mentor_id })) ?? []);
  const deletion = useStudentDeletion({ isSuperAdmin, isLiveOwner, returnTarget });

  const clearToast = (): void => {
    window.clearTimeout(toastTimeoutRef.current);
    setToast({ message: "", visible: false, variant: "success" });
  };

  useEffect(() => {
    isMountedRef.current = true;
    const unsubscribe = useAuthStore.subscribe((current, previous) => {
      if (current.role === previous.role && current.userId === previous.userId) return;
      ownerGenerationRef.current += 1;
      deletion.reset(false);
      setFormStudent(null);
      setIsAccessOpen(false);
      selectTab("courses");
      setCreatedFeedbackVisible(false);
      activeTriggerRef.current = null;
      clearToast();
    });
    return () => {
      isMountedRef.current = false;
      deletion.abandonOperations();
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setFormStudent(null);
    setIsAccessOpen(false);
    deletion.reset(false);
    activeTriggerRef.current = null;
    clearToast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericId, role, currentUserId]);

  useEffect(() => {
    if (previousProfileIdRef.current === numericId) return;
    previousProfileIdRef.current = numericId;
    setCreatedFeedbackVisible(false);
    setCreatedParentLinkCode(null);
    setCreatedCredentials(null);
  }, [numericId]);

  useEffect(() => {
    const locationState = location.state as (CreationState & Record<string, unknown>) | null;
    if (numericId && locationState?.createdStudentId === numericId) {
      const nextState: Record<string, unknown> = { ...locationState };
      delete nextState.createdStudentId;
      delete nextState.createdParentLinkCode;
      delete nextState.createdCredentials;
      navigate(`${location.pathname}${location.search}`, { replace: true, state: nextState });
      return;
    }
    if (locationState?.createdStudentId !== undefined) setCreatedFeedbackVisible(false);
  }, [location.pathname, location.search, location.state, navigate, numericId]);

  useEffect(() => {
    if (!isError || hasTransientRefreshError) return;
    ownerGenerationRef.current += 1;
    deletion.reset(true);
    setFormStudent(null);
    setIsAccessOpen(false);
    selectTab("courses");
    activeTriggerRef.current = null;
    clearToast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, hasTransientRefreshError, error]);

  const showToast = (message: string, variant: "success" | "error" = "success"): void => {
    setToast({ message, visible: true, variant });
    window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToast((current: ToastState) => ({ ...current, visible: false })), 3000);
  };

  const backLink = <ProfileBackLink to={returnTarget.to} state={returnTarget.state} label={t(returnTarget.labelKey)} />;
  const unavailable = (kind: ProfileUnavailableKind) => (
    <ProfileState stateName={kind} backLink={backLink} title={t(`state.${kind}Title`)} message={t(`state.${kind}Body`)} onRetry={kind === "failed" ? () => refetch() : undefined} />
  );

  if (!numericId || Number.isNaN(numericId)) return unavailable("notFound");
  if (isLoading) return <ProfileSkeleton backLink={backLink} hasStats />;
  if (!profile || !canRetainProfile) {
    const unauthorizedProfileLoaded: boolean = queriedProfile?.user.id === numericId && !profileOwnerIsAuthorized;
    return unavailable(unauthorizedProfileLoaded ? "forbidden" : classifyProfileFailure(isError ? error : undefined));
  }

  const { user, courses, performance } = profile;
  const tabs: TabDefinition[] = [
    { id: "courses", label: t("tabs.courses") },
    { id: "performance", label: t("tabs.progress") },
    { id: "documents", label: t("tabs.documents") },
  ];
  const profileKey: string = `${role ?? "anonymous"}:${currentUserId ?? "unknown"}:${user.id}`;

  const focusMenuTrigger = (): void => {
    activeTriggerRef.current = document.querySelector<HTMLButtonElement>('[data-entity-header] [aria-haspopup="menu"]');
  };
  const restoreFocus = (): void => {
    requestAnimationFrame(() => {
      if (isLiveOwner()) activeTriggerRef.current?.focus();
    });
  };

  return (
    <PageContainer>
      {backLink}

      {hasTransientRefreshError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-sm text-muted">
          <p className="min-w-0 flex-1">{t("state.refreshError")}</p>
          <Button variant="secondary" onClick={() => refetch()}>{t("common:retry")}</Button>
        </div>
      )}

      {createdFeedbackVisible && (
        <StudentCreatedNotice credentials={createdCredentials} parentLinkCode={createdParentLinkCode} onClose={() => setCreatedFeedbackVisible(false)} />
      )}

      <StudentProfileHeader
        user={user}
        isSuperAdmin={isSuperAdmin}
        editTriggerRef={activeTriggerRef}
        onEdit={() => {
          if (isLiveOwner()) setFormStudent(user);
        }}
        onDelete={() => {
          if (!isLiveOwner()) return;
          focusMenuTrigger();
          deletion.requestDelete(user);
        }}
        onOpenAccess={() => setIsAccessOpen(true)}
      />

      <StudentStatTiles courses={courses} performance={performance} />

      <Tabs tabs={tabs} value={activeTab} onChange={selectTab} ariaLabel={t("tabs.label")} idPrefix={PROFILE_ID_PREFIX} />

      <div role="tabpanel" id={tabPanelElementId(PROFILE_ID_PREFIX, activeTab)} aria-labelledby={tabElementId(PROFILE_ID_PREFIX, activeTab)} className="min-w-0">
        {activeTab === "courses" && <StudentCoursesTab courses={courses} student={user} role={role} currentUserId={currentUserId} onEnrolled={() => refetch()} />}
        {activeTab === "performance" && <StudentProgressPanel key={profileKey} studentId={user.id} courses={courses} role={role} currentUserId={currentUserId} />}
        {activeTab === "documents" && <DocumentsTab key={profileKey} ownerType="student" ownerId={user.id} canManage={isSuperAdmin} ownerName={`${user.first_name} ${user.last_name}`} />}
      </div>

      <StudentPasswordSmsDialog key={ownerKey} open={isAccessOpen && isSuperAdmin} studentId={user.id} contacts={user} onClose={() => setIsAccessOpen(false)} />

      <StudentFormPanel
        open={formStudent !== null && formStudent.id === numericId && isSuperAdmin}
        mode="edit"
        student={formStudent ?? undefined}
        onClose={() => {
          if (!isLiveOwner()) return;
          setFormStudent(null);
          restoreFocus();
        }}
        onSaved={(_action: "created" | "updated", updatedStudent?: User) => {
          if (!isLiveOwner() || updatedStudent?.id !== numericId) return;
          setFormStudent(null);
          showToast(t("students:form.updateSuccess"));
          refetch();
          restoreFocus();
        }}
        onAvatarSaved={(updatedStudent?: User) => {
          if (!isLiveOwner() || updatedStudent?.id !== numericId) return;
          refetch();
        }}
        finalFocus={activeTriggerRef}
      />

      <ConfirmDialog
        open={deletion.deleteTarget !== null && deletion.deleteTarget.id === numericId && isSuperAdmin}
        title={t("students:deleteConfirmTitle")}
        message={deletion.deleteTarget ? t("students:deleteConfirmMessage", { name: `${deletion.deleteTarget.first_name} ${deletion.deleteTarget.last_name}` }) : ""}
        confirmVariant="destructive"
        pending={deletion.isDeleting}
        errorMessage={deletion.deleteError ?? undefined}
        onConfirm={deletion.confirmDelete}
        onCancel={() => {
          if (!isLiveOwner()) return;
          deletion.cancelDelete();
          restoreFocus();
        }}
        finalFocus={activeTriggerRef}
      />

      {toast.message !== "" && <Toast message={toast.message} show={toast.visible} variant={toast.variant} />}
    </PageContainer>
  );
}

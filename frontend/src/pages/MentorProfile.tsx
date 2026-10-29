import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDeleteUser, useMentorAnalytics, useMentorProfile } from "../lib/users/hooks";
import { AuthApiError, NetworkError } from "../lib/auth/errors";
import { ApiErrorCodes } from "../lib/auth/apiErrorCodes";
import type { User, MentorProfileResult, MentorStaffProfileResponse } from "../lib/users/types";
import { useAuthStore } from "../store/authStore";
import { mentorLocationState, mentorProfileTab, mentorReturnTarget, type MentorProfileTab } from "../lib/mentors/mentorNavigation";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { PageContainer } from "../components/ui/PageContainer";
import { TAB_PANEL_ENTER_CLASS, Tabs, tabElementId, tabPanelElementId, useTabParam, type TabDefinition } from "../components/ui/Tabs";
import { AccountAccessDialog } from "../components/profile/AccountAccessDialog";
import { ProfileBackLink } from "../components/profile/ProfileBackLink";
import { ProfileSkeleton, ProfileState } from "../components/profile/ProfileState";
import { classifyProfileFailure, type ProfileUnavailableKind } from "../components/profile/ProfileUnavailable";
import { MentorCourses } from "../components/mentors/MentorCourses";
import { MentorFormPanel } from "../components/mentors/MentorFormPanel";
import { MentorPerformance } from "../components/mentors/MentorPerformance";
import { MentorProfileHeader } from "../components/mentors/MentorProfileHeader";
import { MentorSummary } from "../components/mentors/MentorSummary";
import { StudentMentorCard } from "../components/mentors/StudentMentorCard";
import { DocumentsTab } from "../components/documents/DocumentsTab";

class MentorProfileContract {
  static isStaff(profile: MentorProfileResult | undefined): profile is MentorStaffProfileResponse {
    return profile !== undefined && "active_students_count" in profile && "role" in profile.user && profile.user.role === "mentor";
  }
}

const TAB_IDS: readonly MentorProfileTab[] = ["courses", "performance", "documents"];
const PROFILE_ID_PREFIX: string = "mentor";

export function MentorProfile() {
  const { id } = useParams<{ id: string }>();
  const role = useAuthStore((state) => state.role);
  const userId = useAuthStore((state) => state.userId);
  const numericId: number | undefined = id && /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0 ? Number(id) : undefined;
  if (role === "student") return <StudentMentorCard key={`${role}:${userId}:${numericId}`} id={numericId} />;
  return <MentorProfileWorkspace key={`${role}:${userId}:${numericId}`} id={numericId} role={role} userId={userId} />;
}

function MentorProfileWorkspace({ id, role, userId }: { id: number | undefined; role: string | null; userId: number | null }) {
  const { t } = useTranslation(["mentorProfile", "mentors", "common"]);
  const location = useLocation();
  const navigate = useNavigate();
  const isSuperAdmin: boolean = role === "superadmin";
  const authorized: boolean = id !== undefined && userId !== null && userId > 0 && (isSuperAdmin || (role === "mentor" && userId === id));
  const profileQuery = useMentorProfile(authorized ? id : undefined);
  const analyticsQuery = useMentorAnalytics(authorized ? id : undefined);
  const deleteUser = useDeleteUser("mentor");
  const back = mentorReturnTarget(role, userId, location.state);
  const [queryTab, selectTab] = useTabParam(TAB_IDS, mentorProfileTab(location.state));
  const activeTab: MentorProfileTab = queryTab as MentorProfileTab;
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [pendingDelete, setPendingDelete] = useState<boolean>(false);
  const [isAccessOpen, setIsAccessOpen] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(() => (isSuperAdmin && id && mentorLocationState(location.state).createdMentorId === id ? t("mentors:form.createSuccess") : null));
  const triggerRef = useRef<HTMLElement | null>(null);
  const generationRef = useRef<number>(0);
  const [ownerGeneration, setOwnerGeneration] = useState<number>(0);
  const operationRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);
  const deleteLockRef = useRef<boolean>(false);

  const isLive = (generation: number): boolean => {
    const current = useAuthStore.getState();
    return mountedRef.current && generationRef.current === generation && current.role === role && current.userId === userId;
  };

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = useAuthStore.subscribe((current, previous) => {
      if (current.role === previous.role && current.userId === previous.userId) return;
      generationRef.current++;
      setOwnerGeneration(generationRef.current);
      setEditUser(null);
      setDeleteTarget(null);
      setDeleteError(undefined);
      setPendingDelete(false);
      setIsAccessOpen(false);
      deleteLockRef.current = false;
      setNotice(null);
      selectTab("courses");
    });
    return () => {
      mountedRef.current = false;
      operationRef.current++;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state = mentorLocationState(location.state);
  useEffect(() => {
    if (state.createdMentorId === id && id !== undefined) {
      const next = { ...state };
      delete next.createdMentorId;
      navigate(`${location.pathname}${location.search}`, { replace: true, state: next });
    }
  }, [state.createdMentorId, id, navigate, location.pathname, location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const transientError: boolean = profileQuery.isError && (profileQuery.error instanceof NetworkError || (profileQuery.error instanceof AuthApiError && profileQuery.error.status >= 500 && profileQuery.error.status <= 599));
  const queriedProfile = profileQuery.data;
  const profile = authorized && queriedProfile?.user.id === id && MentorProfileContract.isStaff(queriedProfile) && (!profileQuery.isError || transientError) ? queriedProfile : undefined;

  useEffect(() => {
    if (!profileQuery.isError || transientError) return;
    generationRef.current++;
    setOwnerGeneration(generationRef.current);
    operationRef.current++;
    deleteLockRef.current = false;
    setEditUser(null);
    setDeleteTarget(null);
    setDeleteError(undefined);
    setPendingDelete(false);
    setIsAccessOpen(false);
    setNotice(null);
    selectTab("courses");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.isError, transientError, profileQuery.error]);

  const restoreFocus = (generation: number): void => {
    requestAnimationFrame(() => {
      if (!isLive(generation)) return;
      const trigger: HTMLElement | null = triggerRef.current;
      const target: HTMLElement | null = trigger?.isConnected && trigger.getClientRects().length > 0 ? trigger : document.querySelector<HTMLElement>("h1");
      if (!target) return;
      if (target.tagName === "H1") target.tabIndex = -1;
      target.focus();
    });
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget || !isSuperAdmin || deleteLockRef.current || !isLive(ownerGeneration)) return;
    const generation: number = generationRef.current;
    const operation: number = ++operationRef.current;
    const live = (): boolean => isLive(generation) && operationRef.current === operation;
    deleteLockRef.current = true;
    setPendingDelete(true);
    setDeleteError(undefined);
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      if (live()) navigate(back.to, { state: back.state });
    } catch (deleteFailure) {
      if (live()) setDeleteError(ApiErrorCodes.translate(deleteFailure, t) ?? t("mentors:form.deleteAccountError"));
    } finally {
      if (live()) {
        deleteLockRef.current = false;
        setPendingDelete(false);
      }
    }
  };

  const backLink = <ProfileBackLink to={back.to} state={back.state} label={t(`mentors:${back.label}`)} />;
  const unavailable = (kind: ProfileUnavailableKind) => (
    <ProfileState stateName={kind} backLink={backLink} title={t(`state.${kind}Title`)} message={t(`state.${kind}Body`)} onRetry={kind === "failed" ? () => profileQuery.refetch() : undefined} />
  );
  if (id === undefined) return unavailable("notFound");
  if (!authorized) return unavailable("forbidden");
  if (profileQuery.isLoading) return <ProfileSkeleton backLink={backLink} hasStats />;
  if (!profile) return unavailable(classifyProfileFailure(profileQuery.isError ? profileQuery.error : undefined));

  const tabs: TabDefinition[] = [
    { id: "courses", label: t("tabs.courses") },
    { id: "performance", label: t("tabs.performance") },
    { id: "documents", label: t("tabs.documents") },
  ];

  return (
    <PageContainer>
      {backLink}
      {transientError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-sm text-muted">
          <p className="min-w-0 flex-1">{t("state.refreshError")}</p>
          <Button variant="secondary" onClick={() => profileQuery.refetch()}>{t("common:retry")}</Button>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-sm text-ink">
          <span className="min-w-0">{notice}</span>
          <Button variant="secondary" onClick={() => setNotice(null)}>{t("common:close")}</Button>
        </div>
      )}

      <MentorProfileHeader
        user={profile.user}
        isSuperAdmin={isSuperAdmin}
        onEdit={(trigger: HTMLElement | null) => {
          if (!isLive(ownerGeneration)) return;
          triggerRef.current = trigger;
          setEditUser(profile.user);
        }}
        onDelete={(trigger: HTMLElement | null) => {
          if (!isLive(ownerGeneration)) return;
          triggerRef.current = trigger;
          setDeleteError(undefined);
          setDeleteTarget(profile.user);
        }}
        onOpenAccess={() => setIsAccessOpen(true)}
      />

      <MentorSummary profile={profile} />

      <Tabs tabs={tabs} value={activeTab} onChange={(tab: string) => { if (isLive(ownerGeneration)) selectTab(tab); }} ariaLabel={t("tabs.label")} idPrefix={PROFILE_ID_PREFIX} />

      <div key={activeTab} role="tabpanel" id={tabPanelElementId(PROFILE_ID_PREFIX, activeTab)} aria-labelledby={tabElementId(PROFILE_ID_PREFIX, activeTab)} className={`${TAB_PANEL_ENTER_CLASS} min-w-0`}>
        {activeTab === "courses" && <MentorCourses courses={profile.active_courses} />}
        {activeTab === "performance" && <MentorPerformance profile={profile} analytics={analyticsQuery.data} loading={analyticsQuery.isLoading} failed={analyticsQuery.isError} onRetry={() => analyticsQuery.refetch()} />}
        {activeTab === "documents" && <DocumentsTab key={`${id}:${role}:${userId}:${ownerGeneration}`} ownerType="mentor" ownerId={profile.user.id} canManage={isSuperAdmin} ownerName={`${profile.user.first_name} ${profile.user.last_name}`} />}
      </div>

      <AccountAccessDialog
        key={`${id}:${role}:${userId}:${ownerGeneration}`}
        open={isAccessOpen && isSuperAdmin}
        rawPassword={profile.user.raw_password}
        onClose={() => setIsAccessOpen(false)}
        labels={{ title: t("access.title"), password: t("access.password"), show: t("access.show"), hide: t("access.hide"), unavailable: t("access.unavailable") }}
      />

      <MentorFormPanel
        open={editUser !== null && isSuperAdmin}
        mode="edit"
        mentor={editUser ?? undefined}
        onClose={() => {
          if (!isLive(ownerGeneration)) return;
          setEditUser(null);
          restoreFocus(ownerGeneration);
        }}
        onSaved={(_action: "created" | "updated", updated?: User) => {
          if (!updated || updated.id !== id || !isLive(ownerGeneration)) return;
          setEditUser(null);
          setNotice(t("mentors:form.updateSuccess"));
          profileQuery.refetch();
          analyticsQuery.refetch();
          restoreFocus(ownerGeneration);
        }}
        onAvatarSaved={(updated?: User) => {
          if (updated?.id === id && isLive(ownerGeneration)) profileQuery.refetch();
        }}
        finalFocus={triggerRef}
      />

      <ConfirmDialog
        open={deleteTarget !== null && isSuperAdmin}
        title={t("mentors:deleteConfirmTitle")}
        message={deleteTarget ? t("mentors:deleteConfirmMessage", { name: `${deleteTarget.first_name} ${deleteTarget.last_name}` }) : ""}
        pending={pendingDelete}
        errorMessage={deleteError}
        confirmVariant="destructive"
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!isLive(ownerGeneration)) return;
          setDeleteTarget(null);
          setDeleteError(undefined);
          restoreFocus(ownerGeneration);
        }}
        finalFocus={triggerRef}
      />
    </PageContainer>
  );
}

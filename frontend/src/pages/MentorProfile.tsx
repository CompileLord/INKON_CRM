import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDeleteUser, useMentorAnalytics, useMentorProfile } from "../lib/users/hooks";
import { AuthApiError, NetworkError } from "../lib/auth/errors";
import type { User } from "../lib/users/types";
import { formatNumber } from "../i18n/formatters";
import { useAuthStore } from "../store/authStore";
import { mentorLocationState, mentorProfileTab, mentorReturnTarget, type MentorProfileTab } from "../lib/mentors/mentorNavigation";
import { ProfileTabs } from "../components/profile/ProfileTabs";
import { MentorIdentity } from "../components/mentors/MentorIdentity";
import { MentorCourses } from "../components/mentors/MentorCourses";
import { MentorPerformance } from "../components/mentors/MentorPerformance";
import { MentorFormPanel } from "../components/mentors/MentorFormPanel";
import { DocumentsTab } from "../components/documents/DocumentsTab";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { BrandActivityIndicator } from "../components/ui/BrandActivityIndicator";

export function MentorProfile() {
  const { id } = useParams<{ id: string }>();
  const role = useAuthStore(state => state.role);
  const userId = useAuthStore(state => state.userId);
  const numericId = id && /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0 ? Number(id) : undefined;
  return <MentorProfileWorkspace key={`${role}:${userId}:${numericId}`} id={numericId} role={role} userId={userId} />;
}

function MentorProfileWorkspace({ id, role, userId }: { id: number | undefined; role: string | null; userId: number | null }) {
  const { t, i18n } = useTranslation(["mentors", "common"]);
  const location = useLocation();
  const navigate = useNavigate();
  const authorized = id !== undefined && userId !== null && userId > 0 && (role === "superadmin" || (role === "mentor" && userId === id));
  const profileQuery = useMentorProfile(authorized ? id : undefined);
  const analyticsQuery = useMentorAnalytics(authorized ? id : undefined);
  const deleteUser = useDeleteUser("mentor");
  const back = mentorReturnTarget(role, userId, location.state);
  const [activeTab, setActiveTab] = useState<MentorProfileTab>(() => mentorProfileTab(location.state));
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(() => role === "superadmin" && id && mentorLocationState(location.state).createdMentorId === id ? t("form.createSuccess") : null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const generationRef = useRef(0);
  const [ownerGeneration, setOwnerGeneration] = useState(0);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);
  const deleteLockRef = useRef(false);
  const isLive = (generation: number) => {
    const current = useAuthStore.getState();
    return mountedRef.current && generationRef.current === generation && current.role === role && current.userId === userId;
  };
  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = useAuthStore.subscribe((current, previous) => {
      if (current.role !== previous.role || current.userId !== previous.userId) {
        generationRef.current++;
        setOwnerGeneration(generationRef.current);
        setEditUser(null);
        setDeleteTarget(null);
        setDeleteError(undefined);
        setPendingDelete(false);
        deleteLockRef.current = false;
        setNotice(null);
        setActiveTab("courses");
      }
    });
    return () => { mountedRef.current = false; operationRef.current++; unsubscribe(); };
  }, []);
  const state = mentorLocationState(location.state);
  useEffect(() => {
    if (state.createdMentorId === id && id !== undefined) {
      const next = { ...state };
      delete next.createdMentorId;
      navigate(`${location.pathname}${location.search}`, { replace: true, state: next });
    }
  }, [state.createdMentorId, id, navigate, location.pathname, location.search]);
  const transientError = profileQuery.isError && (profileQuery.error instanceof NetworkError || (profileQuery.error instanceof AuthApiError && profileQuery.error.status >= 500 && profileQuery.error.status <= 599));
  const queriedProfile = profileQuery.data;
  const profile = authorized && queriedProfile?.user.id === id && queriedProfile.user.role === "mentor" && (!profileQuery.isError || transientError) ? queriedProfile : undefined;
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
    setNotice(null);
    setActiveTab("courses");
  }, [profileQuery.isError, transientError, profileQuery.error]);
  const restoreFocus = (generation: number) => requestAnimationFrame(() => {
    if (!isLive(generation)) return;
    const trigger = triggerRef.current;
    const target = trigger?.isConnected && trigger.getClientRects().length > 0 ? trigger : document.querySelector<HTMLElement>("h1");
    if (target) { if (target.tagName === "H1") target.tabIndex = -1; target.focus(); }
  });
  const saved = (_action: "created" | "updated", updated?: User) => {
    if (!updated || updated.id !== id || !isLive(ownerGeneration)) return;
    setEditUser(null);
    setNotice(t("form.updateSuccess"));
    profileQuery.refetch();
    analyticsQuery.refetch();
    restoreFocus(ownerGeneration);
  };
  const photoSaved = (updated?: User) => {
    if (updated?.id === id && isLive(ownerGeneration)) profileQuery.refetch();
  };
  const confirmDelete = async () => {
    if (!deleteTarget || role !== "superadmin" || deleteLockRef.current || !isLive(ownerGeneration)) return;
    const generation = generationRef.current;
    const operation = ++operationRef.current;
    const live = () => isLive(generation) && operationRef.current === operation;
    deleteLockRef.current = true;
    setPendingDelete(true);
    setDeleteError(undefined);
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      if (live()) navigate(back.to, { state: back.state });
    } catch {
      if (live()) setDeleteError(t("form.deleteAccountError"));
    } finally {
      if (live()) { deleteLockRef.current = false; setPendingDelete(false); }
    }
  };
  const backLink = <Link to={back.to} state={back.state} className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-nav hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"><ArrowLeft size={16} />{t(back.label)}</Link>;
  if (!authorized) return <div className="flex flex-col gap-4">{backLink}<p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted">{t("notFound")}</p></div>;
  if (profileQuery.isLoading) return <div role="status" aria-busy="true" className="flex min-w-0 flex-col gap-4">
    {backLink}<div className="flex items-center gap-2 text-sm text-muted"><BrandActivityIndicator size={20} />{t("common:loading")}</div>
    <div className="rounded-2xl border border-border-warm bg-card p-4 md:p-5 motion-safe:animate-pulse">
      <div className="flex min-w-0 items-start gap-3 md:gap-4"><div data-loading-avatar className="h-12 w-12 shrink-0 rounded-full bg-beige md:h-16 md:w-16" /><div className="min-w-0 flex-1"><div className="h-8 w-full max-w-48 rounded bg-beige md:h-9" /><div className="mt-1 hidden h-11 w-full max-w-64 rounded bg-beige md:block" /></div>{role === "superadmin" && <div className="h-11 w-11 shrink-0 rounded-[10px] bg-beige" />}</div>
      <div className="mt-2 h-11 w-full max-w-64 rounded bg-beige md:hidden" />
      <div className="mt-1 h-11 w-full max-w-40 rounded bg-beige" />
      {role === "superadmin" && <div className="mt-1 h-11 w-full max-w-40 rounded bg-beige" />}
    </div>
    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-strip p-3 motion-safe:animate-pulse">{[0, 1, 2].map(item => <div key={item} className="min-w-0"><div className="h-8 rounded bg-beige" /><div className="mt-2 h-8 rounded bg-beige" /></div>)}</div>
    <div className="flex gap-2 motion-safe:animate-pulse">{[0, 1, 2].map(item => <div key={item} className="h-11 min-w-0 flex-1 rounded-[10px] bg-beige" />)}</div>
    <div className="h-32 rounded-2xl border border-border bg-card motion-safe:animate-pulse" />
  </div>;
  if (!profile) return <div className="flex flex-col gap-4">{backLink}<div className="rounded-2xl border border-border bg-card p-6 text-center"><p className="text-sm text-muted">{t("loadError")}</p><Button variant="secondary" className="mt-3" onClick={() => profileQuery.refetch()}>{t("common:retry")}</Button></div></div>;
  const score = profile.avg_score_defined_ratios_mean;
  const number = (value: number) => formatNumber(value, i18n.language, { maximumFractionDigits: 1 });
  const summary = [{ label: "profile.activeCourses", value: number(profile.active_courses.length) }, { label: "profile.activeStudents", value: number(profile.active_students_count) }, { label: "profile.rawNormalized", value: score === null || score === undefined ? t("profile.missingValue") : number(score), unavailable: score === null || score === undefined }];
  return <div className="flex min-w-0 flex-col gap-4">
    <div className="flex items-center justify-between gap-3">{backLink}{profileQuery.isFetching && <div role="status"><BrandActivityIndicator size={20} /><span className="sr-only">{t("common:loading")}</span></div>}</div>
    {transientError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-sm text-muted"><p className="min-w-0 flex-1">{t("profile.refreshError")}</p><Button variant="secondary" onClick={() => profileQuery.refetch()}>{t("common:retry")}</Button></div>}
    {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-sm text-ink"><span className="flex min-w-0 items-center gap-2"><CheckCircle2 size={16} className="shrink-0 text-success" />{notice}</span><Button variant="secondary" onClick={() => setNotice(null)}>{t("common:close")}</Button></div>}
    <MentorIdentity key={`${id}:${role}:${userId}:${ownerGeneration}`} user={profile.user} administrator={role === "superadmin"} onEdit={trigger => { if (!isLive(ownerGeneration)) return; triggerRef.current = trigger ?? null; setEditUser(profile.user); }} onDelete={trigger => { if (!isLive(ownerGeneration)) return; triggerRef.current = trigger ?? null; setDeleteError(undefined); setDeleteTarget(profile.user); }} />
    <div data-profile-summary className="grid grid-cols-3 gap-2 rounded-2xl bg-strip p-3">{summary.map(metric => <div key={metric.label} className="min-w-0 [overflow-wrap:anywhere]"><p className="text-xs font-medium leading-[1.5] text-muted">{t(metric.label)}</p><p className="mt-1 text-2xl font-semibold leading-[1.333333] text-ink tabular-nums">{metric.unavailable ? <><span aria-hidden="true">{metric.value}</span><span className="sr-only">{t("profile.scoreUnavailable")}</span></> : metric.value}</p></div>)}</div>
    <ProfileTabs<MentorProfileTab> key={ownerGeneration} tabs={[{ id: "courses", label: t("tabs.courses") }, { id: "performance", label: t("tabs.performance") }, { id: "documents", label: t("tabs.documents") }]} activeTab={activeTab} onTabChange={tab => { if (!isLive(ownerGeneration)) return; setActiveTab(tab); navigate(`${location.pathname}${location.search}`, { replace: true, state: { ...mentorLocationState(location.state), profileTab: tab } }); }} ariaLabel={t("profile.tabsLabel")} />
    <div role="tabpanel" id="profile-tabpanel-courses" aria-labelledby="profile-tab-courses" hidden={activeTab !== "courses"}>
      <MentorCourses courses={profile.active_courses} />
    </div>
    <div role="tabpanel" id="profile-tabpanel-performance" aria-labelledby="profile-tab-performance" hidden={activeTab !== "performance"}>
      {activeTab === "performance" && <MentorPerformance profile={profile} analytics={analyticsQuery.data} loading={analyticsQuery.isLoading} failed={analyticsQuery.isError} onRetry={() => analyticsQuery.refetch()} />}
    </div>
    <div role="tabpanel" id="profile-tabpanel-documents" aria-labelledby="profile-tab-documents" hidden={activeTab !== "documents"}>
      {activeTab === "documents" && <DocumentsTab key={`${id}:${role}:${userId}:${ownerGeneration}`} ownerType="mentor" ownerId={profile.user.id} canManage={role === "superadmin"} />}
    </div>
    <MentorFormPanel open={editUser !== null && role === "superadmin"} mode="edit" mentor={editUser ?? undefined} onClose={() => { if (!isLive(ownerGeneration)) return; setEditUser(null); restoreFocus(ownerGeneration); }} onSaved={saved} onAvatarSaved={photoSaved} finalFocus={triggerRef} />
    <ConfirmDialog open={deleteTarget !== null && role === "superadmin"} title={t("deleteConfirmTitle")} message={deleteTarget ? t("deleteConfirmMessage", { name: `${deleteTarget.first_name} ${deleteTarget.last_name}` }) : ""} pending={pendingDelete} errorMessage={deleteError} confirmVariant="destructive" onConfirm={confirmDelete} onCancel={() => { if (!isLive(ownerGeneration)) return; setDeleteTarget(null); setDeleteError(undefined); restoreFocus(ownerGeneration); }} finalFocus={triggerRef} />
  </div>;
}

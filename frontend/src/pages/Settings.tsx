import { useRef, useState } from "react";
import { User as UserIcon, Settings as SettingsIcon, Bell, Send, CheckCircle2, Save, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { useCurrentUser, useUpdateOwnProfile, useUploadAvatar } from "../lib/users/hooks";
import { useOrgSettings, useUpdateOrgSettings } from "../lib/settings/hooks";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { LanguageSwitcher } from "../components/ui/LanguageSwitcher";
import { PersonAvatar } from "../components/ui/PersonAvatar";
import { resolveMediaUrl, validateAvatarFile } from "../lib/users/media";

export function Settings() {
  const { t } = useTranslation(["settings", "common"]);
  const role = useAuthStore((s) => s.role);
  const [activeTab, setActiveTab] = useState<"profile" | "system" | "notifications">("profile");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const { data: currentUser } = useCurrentUser();
  const updateOwnProfileMutation = useUpdateOwnProfile();
  const uploadAvatarMutation = useUploadAvatar(role === "student" ? "student" : "mentor");

  const { data: orgSettings } = useOrgSettings();
  const updateOrgSettingsMutation = useUpdateOrgSettings();

  // Profile Form State
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");

  // System & Notifications Form State
  const [orgName, setOrgName] = useState<string>("Учебный центр ИМКОН");
  const [notifyPayments, setNotifyPayments] = useState<boolean>(true);
  const [notifyDebts, setNotifyDebts] = useState<boolean>(true);

  const [saved, setSaved] = useState<boolean>(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Populate profile form when currentUser arrives
  const [loadedUserId, setLoadedUserId] = useState<number | null>(null);
  if (currentUser && currentUser.id !== loadedUserId) {
    setLoadedUserId(currentUser.id);
    setFirstName(currentUser.first_name || "");
    setLastName(currentUser.last_name || "");
    setEmail(currentUser.email || "");
    setPhone(currentUser.phone || "");
  }

  // Populate org settings form when orgSettings arrives
  const [orgLoaded, setOrgLoaded] = useState<boolean>(false);
  if (orgSettings && !orgLoaded) {
    setOrgLoaded(true);
    setOrgName(orgSettings.org_name || "Учебный центр ИМКОН");
    setNotifyPayments(orgSettings.notify_payments ?? true);
    setNotifyDebts(orgSettings.notify_debts ?? true);
  }

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateOwnProfileMutation.mutate(
      {
        first_name: firstName,
        last_name: lastName,
        phone: phone || undefined,
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        },
      }
    );
  };

  const handleSaveOrgSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateOrgSettingsMutation.mutate(
      {
        org_name: orgName,
        notify_payments: notifyPayments,
        notify_debts: notifyDebts,
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        },
      }
    );
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    const validationErr = validateAvatarFile(file);
    if (validationErr) {
      setAvatarError(validationErr);
      return;
    }
    setAvatarError(null);
    uploadAvatarMutation.mutate({
      id: currentUser.id,
      file,
    });
    e.target.value = "";
  };

  const isSuperAdmin = role === "superadmin";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-ink flex items-center gap-2">
            <SettingsIcon className="text-maroon" size={24} /> {t("title")}
          </h2>
          <p className="text-xs text-muted">{t("subtitle")}</p>
        </div>

        {saved && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 animate-in fade-in">
            <CheckCircle2 size={16} /> {t("saved")}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-border gap-6">
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition-all ${
            activeTab === "profile"
              ? "border-maroon text-maroon"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <UserIcon size={18} /> {t("tabs.profile")}
        </button>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab("system")}
            className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition-all ${
              activeTab === "system"
                ? "border-maroon text-maroon"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <SettingsIcon size={18} /> {t("tabs.system")}
          </button>
        )}
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab("notifications")}
            className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition-all ${
              activeTab === "notifications"
                ? "border-maroon text-maroon"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Bell size={18} /> {t("tabs.notifications")}
          </button>
        )}
      </div>

      {/* Profile Settings Tab */}
      {activeTab === "profile" && (
        <form onSubmit={handleSaveProfile} className="flex flex-col gap-6 max-w-2xl">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col gap-5">
            <h3 className="text-sm font-bold text-ink">{t("profileSection")}</h3>

            <div className="flex items-center gap-4 border-b border-border pb-5">
              <PersonAvatar
                firstName={firstName || "U"}
                lastName={lastName || "N"}
                photoUrl={currentUser ? (resolveMediaUrl(currentUser.thumbnail_path ?? currentUser.photo_path) ?? undefined) : undefined}
                size={64}
              />
              <div className="flex flex-col gap-1">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadAvatarMutation.isPending}
                  className="flex items-center gap-2 rounded-xl border border-border bg-cream px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-border transition-colors disabled:opacity-50"
                >
                  <Upload size={14} /> {t("uploadAvatar")}
                </button>
                <span className="text-[11px] text-muted">JPG, PNG</span>
                {avatarError && <p className="text-xs text-red-600">{avatarError}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted">{t("firstName")}</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink focus:border-maroon focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted">{t("lastName")}</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink focus:border-maroon focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted">{t("email")}</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="mt-1 w-full rounded-xl border border-border bg-muted/20 px-3.5 py-2.5 text-sm text-ink opacity-70 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted">{t("phone")}</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink focus:border-maroon focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-ink">{t("appearance", "Тема и язык")}</h3>
              <p className="text-xs text-muted mt-0.5">{t("appearanceSubtitle", "Выберите режим интерфейса и язык приложения")}</p>
            </div>
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={updateOwnProfileMutation.isPending}
              className="flex items-center gap-2 rounded-xl bg-maroon px-5 py-2.5 text-sm font-semibold text-white hover:bg-maroon/90 shadow-sm disabled:opacity-50"
            >
              <Save size={16} /> {t("common:save")}
            </button>
          </div>
        </form>
      )}

      {/* System Settings Tab */}
      {activeTab === "system" && isSuperAdmin && (
        <form onSubmit={handleSaveOrgSettings} className="flex flex-col gap-6 max-w-2xl">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col gap-5">
            <h3 className="text-sm font-bold text-ink">{t("systemSection")}</h3>

            <div>
              <label className="text-xs font-semibold text-muted">{t("orgName")}</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink focus:border-maroon focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted">{t("currency")}</label>
              <input
                type="text"
                value="TJS (Сомони)"
                disabled
                className="mt-1 w-full rounded-xl border border-border bg-muted/20 px-3.5 py-2.5 text-sm font-semibold text-ink opacity-70 cursor-not-allowed"
              />
            </div>

            <div className="rounded-xl border border-border bg-cream/50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-sky-100 p-2.5 text-sky-600">
                  <Send size={20} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-ink">{t("tgWebhook")}</h4>
                  <p className="text-[11px] text-muted">Telegram Bot CRM</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                <CheckCircle2 size={13} /> {t("webhookActive")}
              </span>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={updateOrgSettingsMutation.isPending}
              className="flex items-center gap-2 rounded-xl bg-maroon px-5 py-2.5 text-sm font-semibold text-white hover:bg-maroon/90 shadow-sm disabled:opacity-50"
            >
              <Save size={16} /> {t("common:save")}
            </button>
          </div>
        </form>
      )}

      {/* Notifications Tab */}
      {activeTab === "notifications" && isSuperAdmin && (
        <form onSubmit={handleSaveOrgSettings} className="flex flex-col gap-6 max-w-2xl">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col gap-5">
            <h3 className="text-sm font-bold text-ink">{t("rulesSection")}</h3>

            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h4 className="text-xs font-bold text-ink">{t("paymentNotify")}</h4>
                <p className="text-[11px] text-muted">Telegram</p>
              </div>
              <input
                type="checkbox"
                checked={notifyPayments}
                onChange={(e) => setNotifyPayments(e.target.checked)}
                className="h-5 w-5 rounded-md border-border text-maroon focus:ring-maroon cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-ink">{t("debtNotify")}</h4>
                <p className="text-[11px] text-muted">Telegram</p>
              </div>
              <input
                type="checkbox"
                checked={notifyDebts}
                onChange={(e) => setNotifyDebts(e.target.checked)}
                className="h-5 w-5 rounded-md border-border text-maroon focus:ring-maroon cursor-pointer"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={updateOrgSettingsMutation.isPending}
              className="flex items-center gap-2 rounded-xl bg-maroon px-5 py-2.5 text-sm font-semibold text-white hover:bg-maroon/90 shadow-sm disabled:opacity-50"
            >
              <Save size={16} /> {t("common:save")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

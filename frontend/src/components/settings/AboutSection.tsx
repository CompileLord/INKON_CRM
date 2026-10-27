import { ChevronDown, Server, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsGroup, SettingsRow } from "./SettingsRow";
import { Button } from "../ui/Button";
import { APP_ENVIRONMENT, APP_VERSION, BUILD_TIME, COMMIT_HASH, COMMIT_MESSAGE, UNKNOWN_BUILD_VALUE } from "../../config/version";
import { formatDateTime } from "../../i18n/formatters";
import { useAuthStore } from "../../store/authStore";
import { useServerBuildInfo } from "../../lib/system/hooks";
import type { BuildInfo } from "../../lib/system/types";

const SHORT_HASH_LENGTH = 7;
const UNKNOWN_HASH_VALUES: readonly string[] = ["dev", UNKNOWN_BUILD_VALUE, ""];

interface CommitDetails {
  commitHash: string;
  commitMessage: string;
  builtAt: string;
}

function isKnownValue(value: string): boolean {
  return !UNKNOWN_HASH_VALUES.includes(value.trim());
}

export function commitHashesDiffer(frontendHash: string, serverHash: string): boolean {
  if (!isKnownValue(frontendHash) || !isKnownValue(serverHash)) return false;
  return !serverHash.startsWith(frontendHash) && !frontendHash.startsWith(serverHash);
}

function VersionList({ version, environment }: { version: string; environment?: string }) {
  const { t } = useTranslation("settings");
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm @[34rem]:text-right">
      <dt className="text-muted">{t("about.version")}</dt>
      <dd className="min-w-0 text-ink tabular-nums">{version}</dd>
      {environment && (
        <>
          <dt className="text-muted">{t("about.environment")}</dt>
          <dd className="min-w-0 text-ink">{environment}</dd>
        </>
      )}
    </dl>
  );
}

function CommitList({ title, details }: { title?: string; details: CommitDetails }) {
  const { t, i18n } = useTranslation("settings");
  const unknownLabel: string = t("about.unknown");
  const builtAtDate: Date = new Date(details.builtAt);
  const builtAtLabel: string = Number.isNaN(builtAtDate.getTime()) ? unknownLabel : formatDateTime(builtAtDate, i18n.language);
  const commitMessage: string = isKnownValue(details.commitMessage) ? details.commitMessage : unknownLabel;
  const commitHash: string = isKnownValue(details.commitHash) ? details.commitHash.slice(0, SHORT_HASH_LENGTH) : unknownLabel;

  return (
    <div className="space-y-1">
      {title && <p className="text-sm font-medium text-ink">{title}</p>}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">{t("about.commit")}</dt>
        <dd className="min-w-0 break-words text-ink tabular-nums">{commitHash}</dd>
        <dt className="text-muted">{t("about.commitName")}</dt>
        <dd className="min-w-0 break-words text-ink">{commitMessage}</dd>
        <dt className="text-muted">{t("about.builtAt")}</dt>
        <dd className="min-w-0 text-ink tabular-nums">{builtAtLabel}</dd>
      </dl>
    </div>
  );
}

function ServerVersion({ serverBuild, isLoading, isError, onRetry }: { serverBuild: BuildInfo | undefined; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  const { t } = useTranslation("settings");
  const { t: translateCommon } = useTranslation("common");

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label={translateCommon("loading")} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <div className="h-5 w-16 rounded bg-strip motion-safe:animate-pulse" />
        <div className="h-5 w-full rounded bg-strip motion-safe:animate-pulse" />
      </div>
    );
  }
  if (isError || !serverBuild) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-destructive">{t("about.serverLoadFailed")}</p>
        <Button type="button" variant="secondary" onClick={onRetry}>{t("retry")}</Button>
      </div>
    );
  }
  return <VersionList version={serverBuild.version} />;
}

function BuildDetails({ serverBuild }: { serverBuild: BuildInfo | undefined }) {
  const { t } = useTranslation("settings");
  const appDetails: CommitDetails = { commitHash: COMMIT_HASH, commitMessage: COMMIT_MESSAGE, builtAt: BUILD_TIME };
  const serverHash: string = serverBuild?.commit_sha ?? UNKNOWN_BUILD_VALUE;
  const sameBuild: boolean = isKnownValue(COMMIT_HASH) && isKnownValue(serverHash) && !commitHashesDiffer(COMMIT_HASH, serverHash);
  const serverHasCommitDetails: boolean = [serverHash, serverBuild?.commit_message ?? UNKNOWN_BUILD_VALUE, serverBuild?.built_at ?? UNKNOWN_BUILD_VALUE].some(isKnownValue);
  const showServer: boolean = serverBuild !== undefined && serverHasCommitDetails && !sameBuild;

  return (
    <details className="group py-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{t("about.details")}</span>
        <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-muted motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-4">
        {sameBuild && <p className="text-sm text-muted">{t("about.sameBuild")}</p>}
        <CommitList title={showServer ? t("about.appBuild") : undefined} details={appDetails} />
        {showServer && serverBuild && (
          <CommitList
            title={t("about.serverBuild")}
            details={{ commitHash: serverHash, commitMessage: serverBuild.commit_message ?? UNKNOWN_BUILD_VALUE, builtAt: serverBuild.built_at ?? UNKNOWN_BUILD_VALUE }}
          />
        )}
      </div>
    </details>
  );
}

export function AboutSection() {
  const showBuildDetails: boolean = useAuthStore((state) => state.role === "superadmin");
  const { t } = useTranslation("settings");
  const { data: serverBuild, isLoading, isError, refetch } = useServerBuildInfo();

  return (
    <SettingsGroup title={t("about.title")}>
      <SettingsRow icon={<Smartphone size={18} />} label={t("about.app")} description={t("about.appHint")}>
        <VersionList version={APP_VERSION} environment={t(`about.environments.${APP_ENVIRONMENT}`)} />
      </SettingsRow>
      <SettingsRow icon={<Server size={18} />} label={t("about.server")} description={t("about.serverHint")}>
        <ServerVersion serverBuild={serverBuild} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} />
      </SettingsRow>
      {showBuildDetails && <BuildDetails serverBuild={serverBuild} />}
    </SettingsGroup>
  );
}

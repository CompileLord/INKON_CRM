import { Server, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsGroup, SettingsRow } from "./SettingsRow";
import { Button } from "../ui/Button";
import { APP_VERSION, BUILD_TIME, COMMIT_HASH, COMMIT_MESSAGE, UNKNOWN_BUILD_VALUE } from "../../config/version";
import { formatDateTime } from "../../i18n/formatters";
import { useServerBuildInfo } from "../../lib/system/hooks";

const SHORT_HASH_LENGTH = 7;
const UNKNOWN_HASH_VALUES: readonly string[] = ["dev", UNKNOWN_BUILD_VALUE, ""];

interface BuildDetails {
  version: string;
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

function BuildDetailsList({ details }: { details: BuildDetails }) {
  const { t, i18n } = useTranslation("settings");
  const unknownLabel: string = t("about.unknown");
  const builtAtDate: Date = new Date(details.builtAt);
  const builtAtLabel: string = Number.isNaN(builtAtDate.getTime()) ? unknownLabel : formatDateTime(builtAtDate, i18n.language);
  const commitMessage: string = isKnownValue(details.commitMessage) ? details.commitMessage : unknownLabel;
  const commitHash: string = isKnownValue(details.commitHash) ? details.commitHash.slice(0, SHORT_HASH_LENGTH) : unknownLabel;

  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm @[34rem]:text-right">
      <dt className="text-muted">{t("about.version")}</dt>
      <dd className="min-w-0 text-ink tabular-nums">{details.version}</dd>
      <dt className="text-muted">{t("about.commit")}</dt>
      <dd className="min-w-0 break-words text-ink tabular-nums">{commitHash}</dd>
      <dt className="text-muted">{t("about.commitName")}</dt>
      <dd className="min-w-0 break-words text-ink">{commitMessage}</dd>
      <dt className="text-muted">{t("about.builtAt")}</dt>
      <dd className="min-w-0 text-ink tabular-nums">{builtAtLabel}</dd>
    </dl>
  );
}

function BuildDetailsSkeleton() {
  const { t } = useTranslation("common");
  return (
    <div aria-busy="true" aria-label={t("loading")} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="contents">
          <div className="h-5 w-16 rounded bg-strip motion-safe:animate-pulse" />
          <div className="h-5 w-full rounded bg-strip motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function ServerBuildDetails() {
  const { t } = useTranslation("settings");
  const { data: serverBuild, isLoading, isError, refetch } = useServerBuildInfo();

  if (isLoading) return <BuildDetailsSkeleton />;
  if (isError || !serverBuild) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-destructive">{t("about.serverLoadFailed")}</p>
        <Button type="button" variant="secondary" onClick={() => void refetch()}>{t("retry")}</Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <BuildDetailsList
        details={{
          version: serverBuild.version,
          commitHash: serverBuild.commit_sha,
          commitMessage: serverBuild.commit_message,
          builtAt: serverBuild.built_at,
        }}
      />
      {commitHashesDiffer(COMMIT_HASH, serverBuild.commit_sha) && (
        <p className="text-sm text-muted @[34rem]:text-right">{t("about.hashDiffers")}</p>
      )}
    </div>
  );
}

export function AboutSection() {
  const { t } = useTranslation("settings");

  return (
    <SettingsGroup title={t("about.title")}>
      <SettingsRow icon={<Smartphone size={18} />} label={t("about.app")} description={t("about.appHint")}>
        <BuildDetailsList
          details={{ version: APP_VERSION, commitHash: COMMIT_HASH, commitMessage: COMMIT_MESSAGE, builtAt: BUILD_TIME }}
        />
      </SettingsRow>
      <SettingsRow icon={<Server size={18} />} label={t("about.server")} description={t("about.serverHint")}>
        <ServerBuildDetails />
      </SettingsRow>
    </SettingsGroup>
  );
}

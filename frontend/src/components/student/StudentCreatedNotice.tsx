import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import type { CreatedCredentials } from "../../lib/users/types";

interface StudentCreatedNoticeProps {
  credentials: CreatedCredentials | null;
  parentLinkCode: string | null;
  onClose: () => void;
}

export function StudentCreatedNotice({ credentials, parentLinkCode, onClose }: StudentCreatedNoticeProps) {
  const { t } = useTranslation(["passwordSms", "common"]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const copyCode = async (): Promise<void> => {
    if (!parentLinkCode) return;
    try {
      await navigator.clipboard.writeText(parentLinkCode);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-ink">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{t("passwordSms:created.title")}</p>
          {credentials ? <p className="mt-0.5 text-muted tabular-nums">{t(`passwordSms:created.${credentials.channel}`, { phone: credentials.maskedPhone ?? "" })}</p> : null}
        </div>
        <Button variant="secondary" onClick={onClose} aria-label={t("common:close")} className="min-h-11 shrink-0">{t("common:close")}</Button>
      </div>
      {parentLinkCode ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs text-muted">{t("passwordSms:created.parentLinkCode")}</span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-strip px-3 py-2 font-mono text-base font-semibold tabular-nums tracking-widest text-ink">{parentLinkCode}</span>
            <Button type="button" variant="secondary" onClick={copyCode} className="min-h-11">
              {copyState === "copied" ? <Check size={16} aria-hidden="true" className="mr-1.5" /> : <Copy size={16} aria-hidden="true" className="mr-1.5" />}
              {copyState === "copied" ? t("passwordSms:created.copied") : t("passwordSms:created.copy")}
            </Button>
          </div>
          <span className="text-xs text-muted">{t("passwordSms:created.parentLinkHint")}</span>
          {copyState === "failed" ? <span role="alert" className="text-xs text-destructive">{t("passwordSms:created.copyFailed")}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { formatDateTime } from "../../i18n/formatters";
import { useGenerateTelegramLinkCode } from "../../lib/users/hooks";
import type { TelegramLinkCode } from "../../lib/users/types";

interface TelegramLinkCodeActionProps {
  studentId: number;
  activeCodeExpiresAt: string | null;
}

export function TelegramLinkCodeAction({ studentId, activeCodeExpiresAt }: TelegramLinkCodeActionProps) {
  const { t, i18n } = useTranslation("students");
  const generateCode = useGenerateTelegramLinkCode();
  const [issued, setIssued] = useState<TelegramLinkCode | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const handleGenerate = (): void => {
    setCopyState("idle");
    generateCode.mutate(studentId, { onSuccess: (result) => setIssued(result) });
  };

  const handleCopy = async (): Promise<void> => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const expiresAt: string | null = issued?.expires_at ?? activeCodeExpiresAt;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        loading={generateCode.isPending}
        onClick={handleGenerate}
        className="min-h-11"
      >
        <KeyRound size={16} aria-hidden="true" className="mr-1.5" />
        {expiresAt ? t("parentLink.regenerate") : t("parentLink.generate")}
      </Button>
      {issued ? (
        <>
          <span
            aria-label={t("parentLink.codeLabel")}
            className="rounded-lg bg-strip px-3 py-2 font-mono text-base font-semibold tabular-nums tracking-widest text-ink"
          >
            {issued.code}
          </span>
          <Button type="button" variant="secondary" onClick={handleCopy} className="min-h-11">
            {copyState === "copied" ? (
              <Check size={16} aria-hidden="true" className="mr-1.5" />
            ) : (
              <Copy size={16} aria-hidden="true" className="mr-1.5" />
            )}
            {copyState === "copied" ? t("parentLink.copied") : t("parentLink.copy")}
          </Button>
        </>
      ) : null}
      {expiresAt ? (
        <span className="text-xs text-muted tabular-nums">
          {t("parentLink.codeExpires", { date: formatDateTime(expiresAt, i18n.language) })}
        </span>
      ) : null}
      {issued ? <span className="basis-full text-xs text-muted">{t("parentLink.codeHint")}</span> : null}
      {generateCode.isError ? (
        <span role="alert" className="basis-full text-xs text-destructive">{t("parentLink.codeError")}</span>
      ) : null}
      {copyState === "failed" ? (
        <span role="alert" className="basis-full text-xs text-destructive">{t("parentLink.copyError")}</span>
      ) : null}
    </div>
  );
}

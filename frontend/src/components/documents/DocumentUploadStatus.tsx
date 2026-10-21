import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";
import type { DocumentRejection, DocumentUploadFailure } from "./documentRules";

export type DocumentUploadState =
  | { phase: "idle" }
  | { phase: "uploading"; fileName: string }
  | { phase: "saved"; fileName: string }
  | { phase: "error"; fileName: string; reason: DocumentRejection | DocumentUploadFailure; retryable: boolean };

interface DocumentUploadStatusProps {
  state: DocumentUploadState;
  ownerName: string | undefined;
  onRetry: () => void;
  onReselect: () => void;
  onDismiss: () => void;
}

export function DocumentUploadStatus({ state, ownerName, onRetry, onReselect, onDismiss }: DocumentUploadStatusProps) {
  const { t } = useTranslation(["documents", "common"]);
  if (state.phase === "idle") return null;
  const context = <p className="min-w-0 text-sm font-semibold text-ink [overflow-wrap:anywhere]">{ownerName ? t("upload.context", { owner: ownerName, filename: state.fileName }) : state.fileName}</p>;
  if (state.phase === "uploading") {
    return <div role="status" aria-busy="true" className="flex min-w-0 flex-col gap-1 rounded-[10px] bg-strip px-3 py-2">
      {context}
      <p className="flex items-center gap-2 text-sm text-muted"><BrandActivityIndicator size={20} />{t("upload.uploading")}</p>
    </div>;
  }
  if (state.phase === "saved") {
    return <div role="status" className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-[10px] bg-strip px-3 py-2">
      <div className="flex min-w-0 flex-col gap-1">{context}<p className="flex items-center gap-2 text-sm text-ink"><CheckCircle2 size={16} className="shrink-0 text-success" />{t("upload.saved")}</p></div>
      <Button variant="secondary" onClick={onDismiss}>{t("common:close")}</Button>
    </div>;
  }
  return <div role="alert" className="flex min-w-0 flex-col gap-3 rounded-[10px] bg-strip px-3 py-2">
    <div className="flex min-w-0 flex-col gap-1">{context}<p className="text-sm text-destructive">{t(`upload.errors.${state.reason}`)}</p></div>
    <div className="flex flex-wrap gap-2">
      {state.retryable && <Button variant="primary" onClick={onRetry}>{t("common:retry")}</Button>}
      <Button variant="secondary" onClick={onReselect}>{t("upload.reselect")}</Button>
      <Button variant="secondary" onClick={onDismiss}>{t("common:close")}</Button>
    </div>
  </div>;
}

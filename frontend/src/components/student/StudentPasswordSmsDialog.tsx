import { useEffect } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Modal } from "../ui/Modal";
import { PasswordSmsDeliveries } from "./PasswordSmsDeliveries";
import { AuthApiError } from "../../lib/auth/errors";
import { useResendPasswordSms } from "../../lib/users/hooks";

interface StudentPasswordSmsDialogProps {
  open: boolean;
  studentId: number;
  onClose: () => void;
}

export function resendErrorKey(error: unknown): string {
  if (error instanceof AuthApiError && error.status === 429) return "errors.rateLimited";
  if (error instanceof AuthApiError && error.status === 400) return "errors.noPhone";
  return "errors.generic";
}

export function StudentPasswordSmsDialog({ open, studentId, onClose }: StudentPasswordSmsDialogProps) {
  const { t } = useTranslation("passwordSms");
  const resend = useResendPasswordSms(studentId);
  const resetResend = resend.reset;

  useEffect(() => {
    if (!open) resetResend();
  }, [open, resetResend]);

  return (
    <Modal open={open} onClose={onClose} title={t("title")} maxWidthClassName="max-w-lg">
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-4">
        <div className="flex items-center gap-2">
          <Button type="button" variant="primary" loading={resend.isPending} disabled={resend.isPending} onClick={() => resend.mutate()} className="min-h-11 min-w-0 flex-1 whitespace-nowrap sm:flex-none">
            <MessageSquare size={16} aria-hidden="true" className="mr-1.5" />
            {t("resend")}
          </Button>
          <InfoTooltip label={t("resendInfoLabel")}>{t("resendInfo")}</InfoTooltip>
        </div>
        {resend.isSuccess ? (
          <p role="status" className="text-sm text-success">{t(`sent.${resend.data.destination}`)}</p>
        ) : null}
        {resend.isError ? (
          <p role="alert" className="text-sm text-destructive">{t(resendErrorKey(resend.error))}</p>
        ) : null}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">{t("deliveries.title")}</h3>
          <PasswordSmsDeliveries userId={studentId} enabled={open} />
        </section>
      </div>
    </Modal>
  );
}

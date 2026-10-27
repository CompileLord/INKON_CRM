import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { AuthApiError } from "../../lib/auth/errors";
import { useChangeBillingMode } from "../../lib/enrollments/hooks";
import { formatMoney } from "../../lib/money";
import type { BillingMode } from "../../lib/enrollments/types";

export interface BillingModeTarget {
  enrollmentId: number;
  studentId: number;
  courseId: number;
  studentName: string;
  courseTitle: string;
  currentMode: BillingMode | null | undefined;
}

interface BillingModeDialogProps {
  target: BillingModeTarget | null;
  onClose: () => void;
  onToast: (message: string, variant: "success" | "error") => void;
}

const MAX_REASON_LENGTH = 500;

function readFailure(error: unknown): { status: number | undefined; detail: unknown } {
  if (error instanceof AuthApiError) return { status: error.status, detail: error.detail };
  if (axios.isAxiosError(error)) {
    return { status: error.response?.status, detail: (error.response?.data as { detail?: unknown } | undefined)?.detail };
  }
  if (typeof error === "object" && error !== null && "status" in error) {
    return { status: (error as { status?: number }).status, detail: (error as { detail?: unknown }).detail };
  }
  return { status: undefined, detail: undefined };
}

export function BillingModeDialog({ target, onClose, onToast }: BillingModeDialogProps) {
  const { t } = useTranslation("enrollments");
  const { t: tCommon } = useTranslation("common");
  const [reason, setReason] = useState<string>("");
  const [reasonTouched, setReasonTouched] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const mutation = useChangeBillingMode();

  useEffect(() => {
    setReason("");
    setReasonTouched(false);
    setErrorMessage(undefined);
  }, [target?.enrollmentId]);

  if (target === null) {
    return null;
  }

  const nextMode: BillingMode = target.currentMode === "grant" ? "paid" : "grant";
  const toGrant: boolean = nextMode === "grant";
  const trimmedReason: string = reason.trim();
  const reasonValid: boolean = trimmedReason.length >= 1 && trimmedReason.length <= MAX_REASON_LENGTH;

  const submit = async (): Promise<void> => {
    setReasonTouched(true);
    if (!reasonValid) return;
    setErrorMessage(undefined);
    try {
      const result = await mutation.mutateAsync({
        id: target.enrollmentId,
        studentId: target.studentId,
        courseId: target.courseId,
        billing_mode: nextMode,
        reason: trimmedReason,
      });
      onToast(
        t("billing.switch.success", {
          cancelled: result.cancelled_months,
          cancelledAmount: t("moneyAmount", { amount: formatMoney(result.cancelled_amount) }),
          writtenOff: t("moneyAmount", { amount: formatMoney(result.written_off_amount) }),
          generated: result.generated_months,
        }),
        "success",
      );
      onClose();
    } catch (error: unknown) {
      const { status, detail } = readFailure(error);
      const code: unknown = typeof detail === "object" && detail !== null && "code" in detail ? (detail as { code: unknown }).code : detail;
      if (status === 409 && code === "billing_mode_unchanged") setErrorMessage(t("billing.switch.errors.unchanged"));
      else if (status === 409 && code === "enrollment_not_active") setErrorMessage(t("billing.switch.errors.notActive"));
      else if (status === 422) setErrorMessage(t("billing.switch.errors.invalid"));
      else setErrorMessage(t("billing.switch.errors.generic"));
    }
  };

  return (
    <ConfirmDialog
      open
      title={t(toGrant ? "billing.switch.toGrantTitle" : "billing.switch.toPaidTitle")}
      message={t(toGrant ? "billing.switch.toGrantMessage" : "billing.switch.toPaidMessage", { name: target.studentName, course: target.courseTitle })}
      details={
        <div className="flex flex-col gap-3">
          <p className="rounded-[10px] bg-strip px-3 py-2 text-xs text-muted">
            {t(toGrant ? "billing.switch.toGrantEffect" : "billing.switch.toPaidEffect")}
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              {t("billing.switch.reasonLabel")}
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={MAX_REASON_LENGTH}
                rows={2}
                placeholder={t("billing.switch.reasonPlaceholder")}
                aria-invalid={reasonTouched && !reasonValid}
                className="w-full rounded-xl border border-control-border bg-card px-3 py-2 text-base font-normal text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
              />
            </label>
            {reasonTouched && !reasonValid ? (
              <span role="alert" className="text-xs text-destructive">{t("billing.switch.reasonRequired")}</span>
            ) : null}
          </div>
        </div>
      }
      confirmLabel={t(toGrant ? "billing.switch.toGrant" : "billing.switch.toPaid")}
      cancelLabel={tCommon("cancel")}
      confirmVariant="primary"
      pending={mutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => void submit()}
      onCancel={onClose}
    />
  );
}

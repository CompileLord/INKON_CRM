import { useEffect, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Modal } from "../ui/Modal";
import { PasswordSmsDeliveries } from "./PasswordSmsDeliveries";
import { AuthApiError } from "../../lib/auth/errors";
import { CanonicalPhone } from "../../lib/users/CanonicalPhone";
import { useResendPasswordSms } from "../../lib/users/hooks";
import type { CredentialsChannel, User } from "../../lib/users/types";

export type StudentContacts = Pick<User, "email" | "phone" | "parent_phone">;

interface StudentPasswordSmsDialogProps {
  open: boolean;
  studentId: number;
  contacts: StudentContacts;
  onClose: () => void;
}

export function resendErrorKey(error: unknown): string {
  if (error instanceof AuthApiError && error.status === 429) return "errors.rateLimited";
  if (error instanceof AuthApiError && (error.status === 400 || error.status === 422)) return "errors.noPhone";
  return "errors.generic";
}

function availableChannels(contacts: StudentContacts): CredentialsChannel[] {
  const channels: CredentialsChannel[] = [];
  if (contacts.email) channels.push("email");
  if (contacts.phone) channels.push("student_phone");
  if (contacts.parent_phone) channels.push("parent_phone");
  return channels;
}

function channelDetail(channel: CredentialsChannel, contacts: StudentContacts): string {
  if (channel === "email") return contacts.email ?? "";
  const phone: string | null = channel === "student_phone" ? contacts.phone : contacts.parent_phone;
  return CanonicalPhone.prefill(phone);
}

export function StudentPasswordSmsDialog({ open, studentId, contacts, onClose }: StudentPasswordSmsDialogProps) {
  const { t } = useTranslation("passwordSms");
  const resend = useResendPasswordSms(studentId);
  const resetResend = resend.reset;
  const channels: CredentialsChannel[] = useMemo(() => availableChannels(contacts), [contacts]);
  const [chosenChannel, setChosenChannel] = useState<CredentialsChannel | null>(null);
  const selectedChannel: CredentialsChannel | null =
    chosenChannel !== null && channels.includes(chosenChannel) ? chosenChannel : (channels[0] ?? null);

  useEffect(() => {
    if (!open) resetResend();
  }, [open, resetResend]);

  return (
    <Modal open={open} onClose={onClose} title={t("title")} maxWidthClassName="max-w-lg">
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-4">
        <fieldset className="flex flex-col gap-2" disabled={resend.isPending}>
          <legend className="text-sm font-semibold text-ink">{t("channelLegend")}</legend>
          {channels.length === 0 ? <p className="text-sm text-muted">{t("errors.noPhone")}</p> : null}
          {channels.map((channel: CredentialsChannel) => (
            <label key={channel} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-card px-3 text-sm text-ink">
              <input
                type="radio"
                name="credentials-channel"
                value={channel}
                checked={selectedChannel === channel}
                onChange={() => setChosenChannel(channel)}
                className="h-4 w-4 accent-maroon"
              />
              <span className="min-w-0 break-words">
                {t(`channel.${channel}`)}
                <span className="ml-1 tabular-nums text-muted">{channelDetail(channel, contacts)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            loading={resend.isPending}
            disabled={resend.isPending || selectedChannel === null}
            onClick={() => resend.mutate(selectedChannel ?? undefined)}
            className="min-h-11 min-w-0 flex-1 whitespace-nowrap sm:flex-none"
          >
            <MessageSquare size={16} aria-hidden="true" className="mr-1.5" />
            {t("resend")}
          </Button>
          <InfoTooltip label={t("resendInfoLabel")}>{t("resendInfo")}</InfoTooltip>
        </div>
        {resend.isSuccess ? (
          <p role="status" className="text-sm tabular-nums text-success">{t(`sent.${resend.data.channel}`, { phone: resend.data.masked_phone ?? "" })}</p>
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

import { useTranslation } from "react-i18next";
import { AccountAccessDialog } from "../profile/AccountAccessDialog";

interface StudentAccountAccessProps {
  open: boolean;
  rawPassword: string | null | undefined;
  onClose: () => void;
}

export function StudentAccountAccess({ open, rawPassword, onClose }: StudentAccountAccessProps) {
  const { t } = useTranslation("studentProfile");
  return (
    <AccountAccessDialog
      open={open}
      rawPassword={rawPassword}
      onClose={onClose}
      labels={{ title: t("access.title"), password: t("access.password"), show: t("access.show"), hide: t("access.hide"), unavailable: t("access.unavailable") }}
    />
  );
}

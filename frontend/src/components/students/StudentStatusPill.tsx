import { useTranslation } from "react-i18next";

export function StudentStatusPill({ isDeleted }: { isDeleted: boolean }) {
  const { t } = useTranslation("common");

  if (!isDeleted) return null;

  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-strip px-2 py-0.5 text-xs font-medium text-muted">
      {t("enums.userStatus.archived")}
    </span>
  );
}

import { useTranslation } from "react-i18next";

export function UserStatusBadge({ isDeleted }: { isDeleted: boolean }) {
  const { t } = useTranslation("common");
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        isDeleted
          ? "bg-stone-100 text-stone-600 dark:bg-stone-800/80 dark:text-stone-300"
          : "bg-green-100 text-green-700 dark:bg-green-950/70 dark:text-green-300",
      ].join(" ")}
    >
      {isDeleted ? t("enums.userStatus.archived", "Удалён") : t("enums.userStatus.active", "Активен")}
    </span>
  );
}

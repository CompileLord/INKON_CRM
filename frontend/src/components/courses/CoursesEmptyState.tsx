import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";

export type CoursesEmptyStateType = "catalog" | "status" | "search";

interface CoursesEmptyStateProps {
  type?: CoursesEmptyStateType;
  isSuperAdmin?: boolean;
  searchQuery?: string;
  page?: number;
  onReset?: () => void;
  onCreateCourse?: () => void;
}

export function CoursesEmptyState({ type = "catalog", isSuperAdmin = false, searchQuery = "", page = 1, onReset, onCreateCourse }: CoursesEmptyStateProps) {
  const { t } = useTranslation(["courses", "common"]);
  const wrap = (content: React.ReactNode) => <div className="rounded-2xl border border-border bg-card">{content}</div>;

  if (type === "search") {
    return wrap(
      <EmptyState
        title={t("noMatchesOnPage", { page })}
        description={t("noMatchesOnPageHelp", { query: searchQuery, page })}
        action={onReset ? <Button type="button" variant="secondary" onClick={onReset}>{t("resetSearch")}</Button> : undefined}
      />,
    );
  }

  if (type === "status") {
    return wrap(
      <EmptyState
        title={t("noStatusMatches")}
        description={t("noStatusMatchesHelp")}
        action={onReset ? <Button type="button" variant="secondary" onClick={onReset}>{t("resetFilter")}</Button> : undefined}
      />,
    );
  }

  return wrap(
    <EmptyState
      title={isSuperAdmin ? t("emptyCatalogAdmin") : t("emptyCatalogMentor")}
      description={isSuperAdmin ? t("emptyCatalogAdminHelp") : t("emptyCatalogMentorHelp")}
      action={isSuperAdmin && onCreateCourse ? <Button type="button" onClick={onCreateCourse}><Plus size={16} aria-hidden="true" />{t("addCourse")}</Button> : undefined}
    />,
  );
}

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../components/ui/EmptyState";
import { PageContainer } from "../components/ui/PageContainer";

export function NotFound() {
  const { t } = useTranslation("ui");
  return (
    <PageContainer>
      <div data-not-found className="py-10">
        <EmptyState
          title={t("notFound.title")}
          description={t("notFound.description")}
          action={
            <Link to="/" className="inline-flex min-h-11 items-center rounded-[10px] bg-maroon px-4 text-sm font-medium text-on-primary hover:bg-maroon-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]">
              {t("notFound.home")}
            </Link>
          }
        />
      </div>
    </PageContainer>
  );
}

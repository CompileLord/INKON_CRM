import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ErrorState } from "../components/ui/ErrorState";
import { PageContainer } from "../components/ui/PageContainer";
import { NotFound } from "./NotFound";

export function RouteError() {
  const { t } = useTranslation("ui");
  const routeError: unknown = useRouteError();
  if (isRouteErrorResponse(routeError) && routeError.status === 404) return <NotFound />;
  return (
    <PageContainer>
      <ErrorState title={t("routeError.title")} message={t("routeError.description")} onRetry={() => window.location.reload()} />
    </PageContainer>
  );
}

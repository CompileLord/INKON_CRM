import { useTranslation } from "react-i18next";
import { PageHeader } from "../ui/PageHeader";

export function GreetingBanner() {
  const { t } = useTranslation("dashboard");
  return <PageHeader title={t("title")} />;
}

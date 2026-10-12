import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import i18n from "../../src/i18n";
import "../../src/index.css";
import { initTheme } from "../../src/lib/theme";
import { AuthFrame } from "../../src/layouts/AuthFrame";
import { Input } from "../../src/components/ui/Input";
import { Button } from "../../src/components/ui/Button";
const params = new URLSearchParams(location.search);
for (const [locale, copy] of Object.entries({
  en: { title: "Authentication frame fixture", description: "Shared frame and sample inputs; this is not the implemented login page.", email: "Email" },
  ru: { title: "Проверка рамки входа", description: "Общая рамка и пример полей; это не реализованная страница входа.", email: "Электронная почта" },
  tg: { title: "Санҷиши чорчӯбаи воридшавӣ", description: "Чорчӯбаи умумӣ ва майдонҳои намунавӣ; ин саҳифаи амалишудаи воридшавӣ нест.", email: "Почтаи электронӣ" },
})) i18n.addResourceBundle(locale, "evidence", copy);
await i18n.changeLanguage(params.get("locale") ?? "en"); initTheme();
const composition = (params.get("composition") as "animated-loop" | "static-emblem") ?? "static-emblem";
function Fixture() {
  const { t } = useTranslation();
  return <AuthFrame composition={composition} editorialTitle={t("brand.fullTitle")} editorialDescription={t("brand.subtitle")}><h1 className="text-2xl font-semibold leading-8 text-ink lg:text-[28px] lg:leading-9">{t("evidence:title")}</h1><p className="mt-2 text-muted">{t("evidence:description")}</p><form className="mt-6 space-y-4" onSubmit={(event) => event.preventDefault()}><Input label={t("evidence:email")} type="email"/><Input label={t("auth:password")} type="password"/><Button className="w-full" type="submit">{t("auth:signIn")}</Button></form></AuthFrame>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider, useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import i18n from "../../src/i18n";
import "../../src/index.css";
import { BrandLogo } from "../../src/components/ui/BrandLogo";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { Toggle } from "../../src/components/ui/Toggle";
import { PersonAvatar } from "../../src/components/ui/PersonAvatar";
import { applyTheme, initTheme, setStoredTheme, type ThemeMode } from "../../src/lib/theme";

const params = new URLSearchParams(location.search);
for (const [locale, copy] of Object.entries({
  en: { title: "Shared controls fixture", description: "Test components and sample data. This is not a CRM page." },
  ru: { title: "Проверка общих элементов", description: "Тестовые элементы и пример данных. Это не страница CRM." },
  tg: { title: "Санҷиши унсурҳои умумӣ", description: "Унсурҳои санҷишӣ ва маълумоти намунавӣ. Ин саҳифаи CRM нест." },
})) i18n.addResourceBundle(locale, "evidence", copy);
await i18n.changeLanguage(params.get("locale") ?? "en");
initTheme();

function FoundationFixture() {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);
  const [count, setCount] = useState(0);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [plainSaving, setPlainSaving] = useState(false);
  const [compoundSaving, setCompoundSaving] = useState(false);
  const themes: ThemeMode[] = ["light", "dark", "system"];
  return (
    <main className="mx-auto flex max-w-6xl min-w-0 flex-col gap-6 p-4 text-ink md:p-8" data-fixture="actual-react-components">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{t("evidence:title")}</h1>
          <p className="text-sm text-muted">{t("evidence:description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {themes.map((theme) => <Button key={theme} variant="secondary" data-theme-choice={theme} onClick={() => { setStoredTheme(theme); applyTheme(theme); }}>{t(`theme.${theme}`)}</Button>)}
        </div>
      </header>
      <section className="flex flex-wrap items-center gap-6 rounded-2xl bg-card p-4 md:p-6" data-section="brand">
        <BrandLogo size="sidebar" />
        <BrandLogo variant="emblem" size="xl" />
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <BrandLogo size="sm" /><BrandLogo size="md" /><BrandLogo size="lg" /><BrandLogo size="xl" />
        </div>
        <BrandLogo size="custom" maxWidth={280} maxHeight={100} />
        <BrandLogo size="custom" maxWidth={160} />
        <BrandLogo size="custom" maxHeight={48} />
      </section>
      <section className="flex flex-wrap items-center gap-4 rounded-2xl bg-card p-4 md:p-6" data-section="buttons">
        <Button data-action="save" onClick={() => setCount((value) => value + 1)}>{t("save")}</Button>
        <Button variant="secondary">{t("cancel")}</Button>
        <Button variant="accent">{t("confirm")}</Button>
        <Button variant="destructive">{t("delete")}</Button>
        <Button disabled data-action="disabled" onClick={() => setCount((value) => value + 1)}>{t("saveChanges")}</Button>
        <Button loading data-action="loading" onClick={() => setCount((value) => value + 1)}>{t("controls.loading")}</Button>
        <Button variant="secondary" data-action="idle-compound" onClick={() => setCount((value) => value + 1)}>
          <Settings size={16} aria-hidden="true" />
          <span>{t("nav.settings")}</span>
        </Button>
        <Button
          data-action="interactive-plain-loading"
          loading={plainSaving}
          onClick={() => {
            setCount((value) => value + 1);
            setPlainSaving(true);
          }}
        >
          {t("save")}
        </Button>
        <Button
          variant="secondary"
          data-action="toggle-plain-loading"
          onClick={() => setPlainSaving((value) => !value)}
        >
          {t("edit")}
        </Button>
        <Button
          data-action="interactive-compound-loading"
          loading={compoundSaving}
          onClick={() => {
            setCount((value) => value + 1);
            setCompoundSaving(true);
          }}
        >
          <Settings size={16} aria-hidden="true" />
          <span>{t("saveChanges")}</span>
        </Button>
        <Button
          variant="secondary"
          data-action="toggle-compound-loading"
          onClick={() => setCompoundSaving((value) => !value)}
        >
          {t("edit")}
        </Button>
        <output className="tabular-nums" data-action-count={count}>{t("total")}: {count}</output>
      </section>
      <section className="flex flex-col gap-4 rounded-2xl bg-card p-4 md:p-6" data-section="toggles">
        <Toggle label={t("nav.notifications")} checked={checked} onChange={setChecked} />
        <Toggle label={t("nav.settings")} checked disabled onChange={setChecked} />
      </section>
      <section className="grid min-w-0 gap-6 rounded-2xl bg-card p-4 md:grid-cols-2 md:p-6" data-section="inputs">
        <Input id="email" label={t("auth:phoneOrEmail")} type="email" defaultValue="reader@example.com" helperText={t("auth:loginSubtitle")} />
        <Input id="invalid" label={t("auth:codeLabel")} error={t("auth:invalidCode")} aria-describedby="external-help" />
        <p id="external-help" className="text-sm text-muted">{t("auth:verifySubtitle")}</p>
        <Input id="password" type={passwordVisible ? "text" : "password"} defaultValue="fixture-value" label={t("auth:password")} rightAddon={<Button variant="secondary" aria-label={t("details")} onClick={() => setPasswordVisible((value) => !value)}>◉</Button>} />
        <Input id="disabled-input" disabled label={t("auth:newPassword")} placeholder={t("auth:passwordPlaceholder")} />
      </section>
      <section className="flex flex-wrap gap-4 rounded-2xl bg-card p-4 md:p-6" data-section="avatars">
        <PersonAvatar firstName="Ada" lastName="Lovelace" size={48} />
        <PersonAvatar firstName="Ситора" lastName="Давлатова" photoUrl="/missing-fixture-photo.png" size={48} />
        <PersonAvatar firstName="" lastName="" size={48} />
      </section>
    </main>
  );
}

document.title = i18n.t("appName");
createRoot(document.getElementById("root")!).render(<I18nextProvider i18n={i18n}><FoundationFixture /></I18nextProvider>);

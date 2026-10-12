import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "../components/ui/BrandLogo";
import { BrandAnimatedLogo } from "../components/ui/BrandAnimatedLogo";
import { Button } from "../components/ui/Button";
import { QuickSettingsChanger } from "../components/ui/QuickSettingsChanger";
import { ResponsiveSurface } from "../components/ui/ResponsiveSurface";
import { useDesktop } from "../components/shell/useDesktop";

export type AuthFrameComposition = "animated-loop" | "static-emblem";

export interface AuthFrameProps {
  children: ReactNode;
  editorialTitle: string;
  editorialDescription: string;
  composition?: AuthFrameComposition;
}

export function AuthFrame({
  children,
  editorialTitle,
  editorialDescription,
  composition = "static-emblem",
}: AuthFrameProps) {
  const { t } = useTranslation("common");
  const desktop = useDesktop();
  const previousDesktop = useRef(desktop);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (previousDesktop.current !== desktop) {
      setTrigger(null);
      previousDesktop.current = desktop;
    }
  }, [desktop]);

  return (
    <div className="min-h-dvh bg-card [overflow-wrap:anywhere] lg:grid lg:grid-cols-2">
      <section className="flex min-w-0 flex-col px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] lg:min-h-dvh lg:px-8">
        <div className="mx-auto flex w-full max-w-[400px] items-start justify-between gap-4 lg:max-w-none lg:justify-end">
          <div className="min-w-0 lg:hidden">
            <BrandLogo size="lg" maxWidth={250} />
          </div>
          <Button
            variant="secondary"
            type="button"
            data-shell-settings
            aria-label={t("theme.settings")}
            aria-expanded={Boolean(trigger)}
            aria-controls={trigger ? "auth-settings" : undefined}
            className="shrink-0 px-3"
            onClick={(event) => setTrigger(trigger ? null : event.currentTarget)}
          >
            <Settings size={20} aria-hidden="true" />
          </Button>
        </div>
        <div className="mx-auto w-full max-w-[400px] pt-6 lg:my-auto lg:py-10">
          <div className="mb-6 hidden lg:block">
            <BrandLogo size="xl" />
          </div>
          {children}
        </div>
      </section>
      <aside
        className="relative hidden min-w-0 overflow-hidden bg-auth-field px-8 py-16 lg:flex lg:items-center lg:justify-center"
        aria-label={t("brand.fullTitle")}
      >
        <div className="relative flex w-full max-w-none flex-col items-center text-center">
          <div
            style={
              composition === "animated-loop"
                ? { width: "clamp(375px, calc(30.05vw + 67.3px), 500px)", maxWidth: "100%" }
                : { width: "clamp(322.43px, calc(25.84vw + 57.87px), 429.91px)", maxWidth: "100%" }
            }
          >
            {desktop ? (
              composition === "animated-loop" ? (
                <BrandAnimatedLogo maxWidth={500} />
              ) : (
                <BrandLogo variant="emblem" size="custom" maxWidth={500} />
              )
            ) : null}
          </div>
          <h2 className="mt-8 max-w-[440px] font-serif text-[32px] font-medium leading-10 text-ink xl:text-[40px] xl:leading-12">
            {editorialTitle}
          </h2>
          <p className="mt-3 max-w-[440px] text-base leading-6 text-muted">
            {editorialDescription}
          </p>
        </div>
      </aside>
      {trigger && (
        <ResponsiveSurface
          id="auth-settings"
          title={t("nav.settings")}
          trigger={trigger}
          onClose={() => setTrigger(null)}
        >
          <QuickSettingsChanger />
        </ResponsiveSurface>
      )}
    </div>
  );
}

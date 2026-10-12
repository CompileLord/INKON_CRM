import { useLayoutEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sidebar } from "../components/Sidebar";
import { Header } from "../components/Header";
import { BottomNavigation } from "../components/shell/BottomNavigation";
import { ShellOverlay } from "../components/shell/ShellOverlay";
import { useDesktop } from "../components/shell/useDesktop";
import { useShellStore } from "../store/shellStore";

export function AppLayout() {
  const { t } = useTranslation("common");
  const { pathname } = useLocation();
  const desktop = useDesktop();
  const previousPath = useRef(pathname);
  const previousDesktop = useRef(desktop);
  const close = useShellStore((state) => state.close);
  useLayoutEffect(() => {
    if (previousPath.current !== pathname) {
      close(); queueMicrotask(() => document.getElementById("main-content")?.focus({ preventScroll: true })); previousPath.current = pathname;
    }
    if (previousDesktop.current !== desktop) {
      const hadOverlay = useShellStore.getState().surface !== null;
      close(); if (hadOverlay) document.querySelector<HTMLElement>("[data-shell-settings]")?.focus({ preventScroll: true }); previousDesktop.current = desktop;
    }
    return undefined;
  }, [pathname, desktop, close]);
  useLayoutEffect(() => () => close(), [close]);
  return <><a href="#main-content" className="sr-only fixed left-4 top-4 z-80 rounded-[10px] bg-maroon p-3 text-on-primary focus:not-sr-only">{t("shell.skip")}</a><div className="flex min-h-dvh bg-cream"><Sidebar/><div className="min-w-0 flex-1 pb-[calc(var(--bottom-navigation-height,64px)+16px)] lg:pb-0"><Header/><main id="main-content" tabIndex={-1} className="mx-auto max-w-[1440px] px-4 py-6 outline-none lg:px-8"><Outlet/></main></div><BottomNavigation/></div><ShellOverlay/></>;
}

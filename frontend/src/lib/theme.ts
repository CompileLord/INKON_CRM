export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "imkon_theme";

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function setStoredTheme(theme: ThemeMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_KEY, theme);
}

export function getEffectiveTheme(theme: ThemeMode): "light" | "dark" {
  if (theme === "system") {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }
  return theme;
}

export function getCanvasThemeColor(): string {
  if (typeof document === "undefined") return "";
  const root = document.documentElement;
  return (
    getComputedStyle(root).getPropertyValue("--imkon-cream").trim() ||
    getComputedStyle(root).getPropertyValue("--color-cream").trim()
  );
}

type ThemeListener = (effective: "light" | "dark", mode: ThemeMode) => void;
const listeners = new Set<ThemeListener>();

export function subscribeTheme(listener: ThemeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function applyTheme(theme: ThemeMode): void {
  const effective = getEffectiveTheme(theme);
  if (typeof document !== "undefined") {
    const root = document.documentElement;

    if (effective === "dark") {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    }

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      const canvasColor = getCanvasThemeColor();
      if (canvasColor) {
        metaThemeColor.setAttribute("content", canvasColor);
      }
    }
  }

  listeners.forEach((listener) => {
    listener(effective, theme);
  });
}

let activeMediaCleanup: (() => void) | null = null;

export function initTheme(): void {
  const currentTheme = getStoredTheme();
  applyTheme(currentTheme);

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    if (activeMediaCleanup) {
      activeMediaCleanup();
      activeMediaCleanup = null;
    }
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (getStoredTheme() === "system") {
        applyTheme("system");
      }
    };
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      activeMediaCleanup = () => mediaQuery.removeEventListener("change", handleChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      activeMediaCleanup = () => mediaQuery.removeListener(handleChange);
    }
  }
}

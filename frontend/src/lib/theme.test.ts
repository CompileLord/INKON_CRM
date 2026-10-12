import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, getStoredTheme, initTheme, setStoredTheme } from "./theme";
import { useThemeStore } from "../store/themeStore";

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("appearance persistence and system changes", () => {
  it("uses the central canvas token for browser chrome", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
    document.documentElement.style.setProperty("--imkon-cream", "rgb(10, 21, 40)");
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(meta.content).toBe("rgb(10, 21, 40)");
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists explicit choices and follows OS changes only in System mode", () => {
    let isDark = false;
    const listeners: Array<() => void> = [];
    vi.stubGlobal("matchMedia", () => ({
      get matches() { return isDark; },
      addEventListener: (_event: string, callback: () => void) => listeners.push(callback),
      removeEventListener: vi.fn(),
    }));
    setStoredTheme("system");
    initTheme();
    expect(useThemeStore.getState().theme).toBe("system");
    expect(useThemeStore.getState().effectiveTheme).toBe("light");

    isDark = true;
    listeners.forEach((listener) => listener());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(useThemeStore.getState().effectiveTheme).toBe("dark");

    isDark = false;
    listeners.forEach((listener) => listener());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(useThemeStore.getState().effectiveTheme).toBe("light");

    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(useThemeStore.getState().effectiveTheme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    isDark = false;
    listeners.forEach((listener) => listener());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(useThemeStore.getState().effectiveTheme).toBe("dark");

    useThemeStore.getState().setTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(useThemeStore.getState().effectiveTheme).toBe("light");
    expect(getStoredTheme()).toBe("light");

    isDark = true;
    listeners.forEach((listener) => listener());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(useThemeStore.getState().effectiveTheme).toBe("light");

    localStorage.setItem("imkon_theme", "unexpected");
    expect(getStoredTheme()).toBe("system");
  });
});

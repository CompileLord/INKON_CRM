import { create } from "zustand";
import { applyTheme, getEffectiveTheme, getStoredTheme, setStoredTheme, type ThemeMode } from "../lib/theme";

interface ThemeState {
  theme: ThemeMode;
  effectiveTheme: "light" | "dark";
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const initialTheme = getStoredTheme();

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  effectiveTheme: getEffectiveTheme(initialTheme),
  setTheme: (theme: ThemeMode) => {
    setStoredTheme(theme);
    applyTheme(theme);
    set({
      theme,
      effectiveTheme: getEffectiveTheme(theme),
    });
  },
  toggleTheme: () => {
    const currentEffective = get().effectiveTheme;
    const nextTheme: ThemeMode = currentEffective === "dark" ? "light" : "dark";
    get().setTheme(nextTheme);
  },
}));

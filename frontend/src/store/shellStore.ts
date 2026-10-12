import { create } from "zustand";

export type ShellSurface = "more" | "settings" | "notifications";
interface ShellState {
  surface: ShellSurface | null;
  trigger: HTMLElement | null;
  toggle: (surface: ShellSurface, trigger: HTMLElement) => void;
  close: () => void;
}
export const useShellStore = create<ShellState>((set) => ({
  surface: null,
  trigger: null,
  toggle: (surface, trigger) => set((state) => ({ surface: state.surface === surface ? null : surface, trigger })),
  close: () => set({ surface: null }),
}));

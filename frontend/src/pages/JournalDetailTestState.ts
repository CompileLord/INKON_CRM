export const viewportState = (() => {
  const listeners = new Set<() => void>();
  const state = {
    desktop: true,
    listeners,
    setDesktop(next: boolean): void {
      state.desktop = next;
      listeners.forEach((listener) => listener());
    },
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return query.includes("1024px") ? state.desktop : false;
      },
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    }),
  });
  return state;
})();

export const schoolToday: { value: string } = { value: "2026-10-15" };

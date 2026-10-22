import { useSyncExternalStore } from "react";

const COMPACT_QUERY: string = "(max-width: 639px)";

function mediaListOrNull(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(COMPACT_QUERY) : null;
}

function subscribe(listener: () => void): () => void {
  const media: MediaQueryList | null = mediaListOrNull();
  if (media === null) return () => undefined;
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

export function useCompactJournalColumns(): boolean {
  return useSyncExternalStore(subscribe, () => mediaListOrNull()?.matches ?? false, () => false);
}

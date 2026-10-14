export interface JournalsHubReturnSnapshot {
  search: string;
  scrollY: number;
}

interface StoredReturnState extends JournalsHubReturnSnapshot {
  pending: boolean;
}

const STORAGE_KEY = "kitob_journals_hub_return";

export class JournalsHubReturnStore {
  static sanitizeSearch(rawSearch: string): string {
    const source = new URLSearchParams(rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch);
    const clean = new URLSearchParams();
    const status = source.get("status");
    if (status === "active" || status === "archived") clean.set("status", status);
    const page = source.get("page");
    if (page && /^\d+$/.test(page.trim())) {
      const parsed = Number(page.trim());
      if (Number.isSafeInteger(parsed) && parsed > 1) clean.set("page", String(parsed));
    }
    const query = (source.get("q") ?? "").replace(/[\r\n\0]/g, "").trim();
    if (query) clean.set("q", query.slice(0, 200));
    const serialized = clean.toString();
    return serialized ? `?${serialized}` : "";
  }

  recordNavigationOut(rawSearch: string, scrollY: number): void {
    const safeScroll = Number.isFinite(scrollY) && scrollY > 0 ? scrollY : 0;
    const state: StoredReturnState = {
      search: JournalsHubReturnStore.sanitizeSearch(rawSearch),
      scrollY: safeScroll,
      pending: true,
    };
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      return;
    }
  }

  peekPending(): JournalsHubReturnSnapshot | null {
    const state = this.readState();
    if (!state || !state.pending) return null;
    return { search: state.search, scrollY: state.scrollY };
  }

  clear(): void {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      return;
    }
  }

  private readState(): StoredReturnState | null {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return null;
      const candidate = parsed as Record<string, unknown>;
      if (
        typeof candidate.search !== "string" ||
        typeof candidate.scrollY !== "number" ||
        !Number.isFinite(candidate.scrollY) ||
        candidate.scrollY < 0 ||
        typeof candidate.pending !== "boolean"
      ) {
        return null;
      }
      return {
        search: JournalsHubReturnStore.sanitizeSearch(candidate.search),
        scrollY: candidate.scrollY,
        pending: candidate.pending,
      };
    } catch {
      return null;
    }
  }
}

export const journalsHubReturnStore: JournalsHubReturnStore = new JournalsHubReturnStore();

export class JournalChartPreference {
  static readonly STORAGE_KEY: string = "journal-progress-chart-collapsed";

  static readStored(): boolean | null {
    try {
      const stored: string | null = window.localStorage.getItem(JournalChartPreference.STORAGE_KEY);
      return stored === null ? null : stored === "1";
    } catch {
      return null;
    }
  }

  static readCollapsed(): boolean {
    return JournalChartPreference.readStored() ?? false;
  }

  static writeCollapsed(collapsed: boolean): void {
    try {
      window.localStorage.setItem(JournalChartPreference.STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      return;
    }
  }
}

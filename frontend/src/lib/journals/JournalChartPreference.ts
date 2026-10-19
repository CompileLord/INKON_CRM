export class JournalChartPreference {
  static readonly STORAGE_KEY: string = "journal-progress-chart-collapsed";

  static readCollapsed(): boolean {
    try {
      return window.localStorage.getItem(JournalChartPreference.STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  static writeCollapsed(collapsed: boolean): void {
    try {
      window.localStorage.setItem(JournalChartPreference.STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      return;
    }
  }
}

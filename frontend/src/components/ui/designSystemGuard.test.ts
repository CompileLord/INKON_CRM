import { describe, expect, it } from "vitest";

const SOURCES: Readonly<Record<string, string>> = import.meta.glob<string>(["/src/pages/**/*.tsx", "/src/components/**/*.tsx", "!/src/**/*.test.tsx"], { query: "?raw", import: "default", eager: true });

const RULES: Readonly<Record<string, RegExp>> = {
  "role-tablist": /role=["']tablist["']/,
  "native-select": /<select[\s>]/,
  "native-date-input": /type=["']date["']/,
  "page-max-width": /max-w-/,
};

const PAGE_LEVEL_RULES: readonly string[] = ["page-max-width"];

export const ALLOWLIST_CEILING: number = 31;

const ALLOWLIST: readonly string[] = [
  "components/courses/CourseProgressPane.tsx::native-select",
  "components/courses/CourseRosterSection.tsx::native-select",
  "components/finance/FinanceTabs.tsx::role-tablist",
  "components/finance/OverviewSummary.tsx::native-date-input",
  "components/finance/PaymentDateRangePicker.tsx::native-date-input",
  "components/finance/SchoolDatePicker.tsx::native-date-input",
  "components/journals/JournalWorkspaceTabs.tsx::role-tablist",
  "components/mentors/MentorFormPanel.tsx::native-date-input",
  "components/profile/ProfileTabs.tsx::role-tablist",
  "components/student/StudentBucketTabs.tsx::role-tablist",
  "pages/Audit.tsx::page-max-width",
  "pages/CourseProfile.tsx::page-max-width",
  "pages/CourseProfile.tsx::role-tablist",
  "pages/Finance.tsx::page-max-width",
  "pages/MentorProfile.tsx::page-max-width",
  "pages/Mentors.tsx::native-select",
  "pages/Mentors.tsx::page-max-width",
  "pages/Notifications.tsx::page-max-width",
  "pages/Notifications.tsx::role-tablist",
  "pages/Settings.tsx::page-max-width",
  "pages/StudentProfile.tsx::page-max-width",
  "pages/student/MyCourseDetail.tsx::page-max-width",
  "pages/student/MyCourses.tsx::page-max-width",
  "pages/student/MyJournalPeriod.tsx::page-max-width",
];

class SourceScanner {
  static violations(): string[] {
    const found: string[] = [];
    for (const [globPath, content] of Object.entries(SOURCES)) {
      const relativePath: string = globPath.replace("/src/", "");
      if (relativePath.startsWith("components/ui/")) continue;
      for (const [rule, pattern] of Object.entries(RULES)) {
        const applies: boolean = !PAGE_LEVEL_RULES.includes(rule) || relativePath.startsWith("pages/");
        if (applies && pattern.test(content)) found.push(`${relativePath}::${rule}`);
      }
    }
    return found.sort();
  }
}

describe("design system guard", () => {
  it("flags no violation outside the explicit allowlist", () => {
    const unexpected: string[] = SourceScanner.violations().filter((violation: string) => !ALLOWLIST.includes(violation));
    expect(unexpected).toEqual([]);
  });

  it("requires allowlist entries to still violate so the list only shrinks", () => {
    const current: string[] = SourceScanner.violations();
    expect(ALLOWLIST.filter((entry: string) => !current.includes(entry))).toEqual([]);
  });

  it("fails when a file is added to the allowlist", () => {
    expect(ALLOWLIST.length).toBeLessThanOrEqual(ALLOWLIST_CEILING);
  });

  it("scans a meaningful number of sources", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
  });

  it("detects each rule on sample sources", () => {
    expect(RULES["role-tablist"].test('<div role="tablist">')).toBe(true);
    expect(RULES["native-select"].test("<select value={x}>")).toBe(true);
    expect(RULES["native-date-input"].test('<input type="date" />')).toBe(true);
    expect(RULES["page-max-width"].test('className="mx-auto max-w-5xl"')).toBe(true);
    expect(RULES["native-select"].test("<SelectItem>")).toBe(false);
  });
});

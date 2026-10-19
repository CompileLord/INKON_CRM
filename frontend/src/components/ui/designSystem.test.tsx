import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import i18n from "../../i18n";
import { Badge, type BadgeStatus } from "./Badge";
import { DataTable } from "./DataTable";
import { DatePicker } from "./DatePicker";
import { EmptyState } from "./EmptyState";
import { EntityHeader } from "./EntityHeader";
import { ErrorState } from "./ErrorState";
import { InitialTile, InitialTileColors } from "./InitialTile";
import { ListRow } from "./ListRow";
import { Menu } from "./Menu";
import { PageContainer } from "./PageContainer";
import { PageHeader } from "./PageHeader";
import { PeriodNameFormatter } from "./periodName";
import { SectionCard } from "./SectionCard";
import { Select } from "./Select";
import { StatGroup, StatTile } from "./StatGroup";
import { TabQueryParam, Tabs, useTabParam } from "./Tabs";
import { CalendarDates } from "./calendarDates";

function renderRouted(element: ReactElement, initialEntry: string = "/"): void {
  render(<MemoryRouter initialEntries={[initialEntry]}>{element}</MemoryRouter>);
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(cleanup);

describe("PageContainer and PageHeader", () => {
  it("renders one h1 with count and actions, no icon, and a back link only when asked", () => {
    renderRouted(<PageContainer><PageHeader title="Courses" count="12" actions={<button type="button">Add</button>} backTo="/home" backLabel="Home" /></PageContainer>);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("12").className).toContain("tabular-nums");
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/home");
    expect(document.querySelector("[data-page-container]")?.className).toContain("max-w-[1200px]");
  });
});

describe("Badge", () => {
  it.each<[BadgeStatus, string, string]>([
    ["active", "en", "Active"],
    ["notLinked", "en", "Not linked"],
    ["overdue", "ru", "Просрочен"],
    ["paid", "tg", "Пардохт шудааст"],
  ])("renders %s in %s", async (status, language, expected) => {
    await i18n.changeLanguage(language);
    render(<Badge status={status} />);
    expect(screen.getByText(expected).getAttribute("data-badge-status")).toBe(status);
  });
});

describe("InitialTile", () => {
  it("is deterministic per name and shows the uppercase first letter", () => {
    expect(InitialTileColors.classFor("Algebra")).toBe(InitialTileColors.classFor("Algebra"));
    expect(InitialTileColors.classFor("Algebra")).toMatch(/^bg-series-[1-8]\/20$/);
    expect(InitialTileColors.initialOf("  алгебра")).toBe("А");
    expect(InitialTileColors.initialOf("")).toBe("?");
    render(<InitialTile name="biology" />);
    expect(document.querySelector("[data-initial-tile]")?.textContent).toBe("B");
  });
});

describe("Menu", () => {
  it("opens with the keyboard, selects an item with Enter and supports arrow navigation", async () => {
    const onEdit = vi.fn();
    const onArchive = vi.fn();
    const user = userEvent.setup();
    render(<Menu items={[{ key: "edit", label: "Edit", onSelect: onEdit }, { key: "archive", label: "Archive", onSelect: onArchive, destructive: true }]} />);
    const trigger: HTMLElement = screen.getByRole("button", { name: "More actions" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const items: HTMLElement[] = await screen.findAllByRole("menuitem");
    expect(items).toHaveLength(2);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("closes on Escape without selecting", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<Menu items={[{ key: "edit", label: "Edit", onSelect: onEdit }]} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await screen.findByRole("menuitem");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(onEdit).not.toHaveBeenCalled();
  });
});

describe("Select", () => {
  it("replaces the native select, changes value by keyboard and exposes a listbox", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<string>("a");
      return <Select label="Course" options={[{ value: "a", label: "Algebra" }, { value: "b", label: "Geometry" }]} value={value} onChange={(next) => { onChange(next); setValue(next); }} />;
    }
    render(<Harness />);
    expect(document.querySelector("select")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Course" }));
    expect(await screen.findByRole("listbox")).toBeTruthy();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.getByRole("button", { name: "Course" }).textContent).toContain("Geometry");
  });
});

describe("DatePicker", () => {
  it("displays dd.MM.yyyy and never an ISO or mm/dd/yyyy value", () => {
    render(<DatePicker label="Start" value="2026-10-19" onChange={() => undefined} />);
    expect((screen.getByLabelText("Start") as HTMLInputElement).value).toBe("19.10.2026");
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });

  it("commits typed dates as ISO and rejects invalid ones", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DatePicker label="Start" value="" onChange={onChange} />);
    const input: HTMLElement = screen.getByLabelText("Start");
    await user.type(input, "31.02.2026{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("dd.mm.yyyy");
    await user.clear(input);
    await user.type(input, "05.03.2026{Enter}");
    expect(onChange).toHaveBeenCalledWith("2026-03-05");
  });

  it("selects a day from the calendar popover with the keyboard", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DatePicker label="Start" value="2026-10-19" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Open calendar" }));
    const grid: HTMLElement = await screen.findByRole("grid");
    expect(within(grid).getByRole("gridcell", { name: "19.10.2026" }).getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowRight}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("2026-10-27");
  });

  it("builds Monday-first six-week grids and clamps month arithmetic", () => {
    const grid: string[] = CalendarDates.monthGrid("2026-10-19");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-09-28");
    expect(CalendarDates.addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(CalendarDates.parseTyped("1.2.2026")).toBe("2026-02-01");
    expect(CalendarDates.parseTyped("2026-02-01")).toBeNull();
  });
});

describe("Tabs", () => {
  const tabs = [{ id: "overview", label: "Overview" }, { id: "students", label: "Students", count: 3 }, { id: "grades", label: "Grades" }];

  it("uses roving focus with arrows, Home and End, wrapping around (horizontal)", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<string>("overview");
      return <Tabs tabs={tabs} value={value} onChange={setValue} ariaLabel="Sections" />;
    }
    render(<Harness />);
    const overview: HTMLElement = screen.getByRole("tab", { name: "Overview" });
    expect(overview.getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("tab", { name: /Students/ }).getAttribute("tabindex")).toBe("-1");
    overview.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Students/ }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Students/ }));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Grades" }));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Overview" }));
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Grades" }));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Overview" }));
  });

  it("vertical orientation navigates with Up and Down only", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<string>("overview");
      return <Tabs tabs={tabs} value={value} onChange={setValue} ariaLabel="Sections" orientation="vertical" />;
    }
    render(<Harness />);
    expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("vertical");
    screen.getByRole("tab", { name: "Overview" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: /Students/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("is scrollable on mobile via overflow-x-auto", () => {
    render(<Tabs tabs={tabs} value="overview" onChange={() => undefined} ariaLabel="Sections" />);
    expect(screen.getByRole("tablist").className).toContain("overflow-x-auto");
  });

  it("syncs the active tab with ?tab= and ignores unknown values", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [active, select] = useTabParam(["overview", "students", "grades"], "overview");
      const location = useLocation();
      return <><Tabs tabs={tabs} value={active} onChange={select} ariaLabel="Sections" /><output data-testid="search">{location.search}</output></>;
    }
    renderRouted(<Harness />, "/?tab=grades&other=1");
    expect(screen.getByRole("tab", { name: "Grades" }).getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("tab", { name: /Students/ }));
    expect(screen.getByTestId("search").textContent).toBe("?tab=students&other=1");
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByTestId("search").textContent).toBe("?other=1");
    expect(TabQueryParam.resolve("bogus", ["overview"], "overview")).toBe("overview");
  });
});

describe("StatGroup and StatTile", () => {
  it("renders values with tabular-nums and a hint, in a single card with dividers", () => {
    render(<StatGroup><StatTile label="Score" value="84" hint="of 100" /><StatTile label="Attendance" value="92%" /></StatGroup>);
    expect(document.querySelectorAll("[data-stat-group]")).toHaveLength(1);
    expect(document.querySelector("[data-stat-group]")?.className).toContain("divide-x");
    expect(screen.getByText("84").className).toContain("tabular-nums");
    expect(screen.getByText("of 100")).toBeTruthy();
  });

  it("renders a muted em dash for a missing value, optionally with a tooltip", () => {
    render(<StatGroup><StatTile label="Debt" value={null} /><StatTile label="Grade" value={undefined} missingHint="No exams yet" /></StatGroup>);
    const missing: NodeListOf<Element> = document.querySelectorAll("[data-stat-missing]");
    expect(missing).toHaveLength(2);
    expect(missing[0].textContent).toBe("—");
    expect(missing[0].className).toContain("text-muted");
    expect(screen.getAllByRole("button", { name: "No exams yet" })).toHaveLength(1);
  });
});

describe("SectionCard", () => {
  it("renders title, actions and at most one info tooltip button", () => {
    render(<SectionCard title="Payments" info="Formula" actions={<button type="button">Export</button>}>Body</SectionCard>);
    expect(screen.getByRole("heading", { level: 2, name: /Payments/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Formula" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });

  it("flattens a nested SectionCard so cards never nest", () => {
    render(<SectionCard title="Outer"><SectionCard title="Inner">x</SectionCard></SectionCard>);
    const cards: NodeListOf<Element> = document.querySelectorAll("[data-section-card]");
    expect(cards).toHaveLength(2);
    expect(cards[0].className).toContain("border");
    expect(cards[1].hasAttribute("data-section-flattened")).toBe(true);
    expect(cards[1].className).not.toContain("border");
  });
});

describe("EntityHeader", () => {
  it("renders name, status, meta separated by a middle dot, primary action and menu", async () => {
    const onArchive = vi.fn();
    const user = userEvent.setup();
    render(<EntityHeader avatar={<InitialTile name="Algebra" />} name="Algebra 8A" status={<Badge status="active" />} meta={["Sitora", "Mon 15:00", "24"]} primaryAction={<button type="button">Edit</button>} menuItems={[{ key: "archive", label: "Archive", onSelect: onArchive }]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Algebra 8A");
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getAllByText("·")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });
});

describe("ListRow", () => {
  it("makes the whole row a link while keeping the menu as a separate control", () => {
    renderRouted(<ListRow to="/courses/1" menuItems={[{ key: "edit", label: "Edit", onSelect: () => undefined }]}>Algebra</ListRow>);
    const link: HTMLElement = screen.getByRole("link", { name: "Algebra" });
    expect(link.getAttribute("href")).toBe("/courses/1");
    expect(link.className).toContain("after:inset-0");
    expect(screen.getByRole("button", { name: "More actions" }).className).toContain("z-10");
  });
});

describe("EmptyState and ErrorState", () => {
  it("renders empty copy with an action", () => {
    render(<EmptyState title="Nothing" description="Add one" action={<button type="button">Add</button>} />);
    expect(screen.getByText("Nothing")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
  });

  it("calls retry from the error state in every locale", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    await i18n.changeLanguage("ru");
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("DataTable four states", () => {
  interface Row { id: string; name: string; score: string }
  const columns = [{ key: "name", header: "Student", cell: (row: Row) => row.name }, { key: "score", header: "Score", numeric: true, cell: (row: Row) => row.score }];
  const base = { caption: "Students", columns, rowKey: (row: Row) => row.id, emptyTitle: "No students", emptyDescription: "Enroll one" };

  it("loading renders skeleton rows with the same column geometry", () => {
    renderRouted(<DataTable {...base} rows={[]} isLoading isError={false} onRetry={() => undefined} skeletonRowCount={3} rowMenu={() => []} />);
    const body: Element = document.querySelector("[data-table-state='loading']")!;
    expect(body.querySelectorAll("tr")).toHaveLength(3);
    expect(body.querySelectorAll("tr")[0].querySelectorAll("td")).toHaveLength(3);
  });

  it("error renders a working retry", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderRouted(<DataTable {...base} rows={[]} isLoading={false} isError onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("empty renders explanatory copy", () => {
    renderRouted(<DataTable {...base} rows={[]} isLoading={false} isError={false} onRetry={() => undefined} />);
    expect(screen.getByText("No students")).toBeTruthy();
    expect(screen.getByText("Enroll one")).toBeTruthy();
  });

  it("loaded renders rows, numeric cells, whole-row links and a row menu", () => {
    renderRouted(<DataTable {...base} rows={[{ id: "1", name: "Aisha", score: "412" }]} isLoading={false} isError={false} onRetry={() => undefined} rowHref={(row) => `/students/${row.id}`} rowMenu={() => [{ key: "edit", label: "Edit", onSelect: () => undefined }]} />);
    expect(screen.getByRole("link", { name: "Aisha" }).getAttribute("href")).toBe("/students/1");
    expect(screen.getByText("412").className).toContain("tabular-nums");
    expect(screen.getByRole("button", { name: "More actions" })).toBeTruthy();
    expect(document.querySelector("[data-table-state='loaded']")).toBeTruthy();
  });
});

describe("PeriodNameFormatter", () => {
  it.each<[string, string, string]>([
    ["en", "Week 3", "Week 3"],
    ["ru", "Week 3", "Неделя 3"],
    ["tg", "Week 3", "Ҳафтаи 3"],
    ["en", "Month 1", "Month 1"],
    ["ru", "Month 1", "Месяц 1"],
    ["tg", "Month 1", "Моҳи 1"],
    ["ru", "Custom period", "Custom period"],
  ])("translates %s %s", async (language, label, expected) => {
    await i18n.changeLanguage(language);
    expect(PeriodNameFormatter.translate(label, i18n.t)).toBe(expected);
  });
});

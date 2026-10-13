import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileTabs } from "./ProfileTabs";

afterEach(cleanup);

it("moves the single keyboard tab stop with focus without activating the new pane", async () => {
  const onTabChange = vi.fn();
  render(<ProfileTabs tabs={[{ id: "courses", label: "Courses" }, { id: "performance", label: "Performance" }]} activeTab="courses" onTabChange={onTabChange} />);
  const courses = screen.getByRole("tab", { name: "Courses" });
  const performance = screen.getByRole("tab", { name: "Performance" });
  courses.focus();
  await userEvent.setup().keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(performance);
  expect(performance.tabIndex).toBe(0);
  expect(courses.tabIndex).toBe(-1);
  expect(courses.getAttribute("aria-selected")).toBe("true");
  expect(onTabChange).not.toHaveBeenCalled();
});


it("supports Home, End, manual activation, and Tab reentry through the focused tab", async () => {
  const user = userEvent.setup();
  const onTabChange = vi.fn();
  render(<><button>Before</button><ProfileTabs tabs={[{ id: "courses", label: "Courses" }, { id: "performance", label: "Performance" }, { id: "documents", label: "Documents" }]} activeTab="courses" onTabChange={onTabChange} /><button>After</button></>);
  const courses = screen.getByRole("tab", { name: "Courses" });
  const documents = screen.getByRole("tab", { name: "Documents" });
  courses.focus();
  await user.keyboard("{End}");
  expect(document.activeElement).toBe(documents);
  expect(documents.tabIndex).toBe(0);
  expect(onTabChange).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  expect(onTabChange).toHaveBeenLastCalledWith("documents");
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "After" }));
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(documents);
  await user.keyboard("{Home}");
  expect(document.activeElement).toBe(courses);
  await user.keyboard(" ");
  expect(onTabChange).toHaveBeenLastCalledWith("courses");
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Before" }));
  await user.tab();
  expect(document.activeElement).toBe(courses);
});

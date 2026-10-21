import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { PaymentModal } from "./PaymentModal";
import { httpClient } from "../../lib/auth/httpClient";
import "../../i18n";

beforeAll(() => {
  configure({ asyncUtilTimeout: 8000 });
  vi.setConfig({ testTimeout: 30000 });
});

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
});

const mock = new MockAdapter(httpClient);

function GeneralFixture() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Open general payment</button><PaymentModal isOpen={open} onClose={() => setOpen(false)} onSuccess={() => {}} /></>;
}

describe("authorized payment selection", () => {
  afterEach(() => { cleanup(); mock.reset(); });
  function mockStudents(withProfile: boolean = true) {
    mock.onGet("/students/").reply(config => Number(config.params.page) === 2
      ? [200, { items: [{ id: 90, first_name: "Later", last_name: "Match", email: "later@example.com" }], page: 2, page_size: 8, total: 9, total_pages: 2 }]
      : [200, { items: Array.from({ length: 8 }, (_, index) => ({ id: index + 10, first_name: "First", last_name: "Match " + index, email: "first" + index + "@example.com" })), page: 1, page_size: 8, total: 9, total_pages: 2 }]);
    if (withProfile) mockCourses([{ courseId: 20, title: "Returned archived enrollment" }]);
  }
  function mockCourses(courses: { courseId: number; title: string }[]) {
    const enrollments = courses.map((course, index) => ({ id: 500 + index, student_id: 90, course_id: course.courseId, price_at_enrollment: "1000", color_hex: "#000000", enrolled_at: "2026-09-01T00:00:00Z", status: "withdrawn", is_deleted: false }));
    const charges = courses.map((course, index) => ({ id: 700 + index, enrollment_id: 500 + index, student_id: 90, sequence_no: 1, amount: "10", due_date: "2026-10-01", type: "tuition", status: "open", allocated_amount: "0", remaining_balance: "10", course_title: course.title }));
    mock.onGet("/enrollments/").reply(200, { items: enrollments, total: enrollments.length, page: 1, page_size: 100, total_pages: 1 });
    mock.onGet(/\/finance\/charges\//).reply(200, { items: charges, total: charges.length, page: 1, page_size: 100, total_pages: 1 });
  }
  function openGeneral() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><GeneralFixture /></QueryClientProvider>);
    return userEvent.setup();
  }

  it("reaches students beyond the first page with More results and uses the selected student's returned enrollments with the custom picker", async () => {
    mockStudents();
    const user = openGeneral(); await user.click(screen.getByRole("button", { name: "Open general payment" }));
    const search = screen.getByRole("combobox", { name: "Student" }); await user.type(search, "Match");
    expect((await screen.findAllByRole("option")).length).toBe(8);
    await user.click(await screen.findByRole("button", { name: "More results" }));
    await user.click(await screen.findByRole("option", { name: /Later Match/ }));
    expect(await screen.findByText("Later Match")).toBeTruthy();
    await user.click(await screen.findByLabelText("Priority course"));
    await user.click(await screen.findByRole("option", { name: "Returned archived enrollment" }));
    expect((screen.getByRole("button", { name: "Accept Payment" }) as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector("select")).toBeNull();
    expect(mock.history.get.find(request => request.url === "/enrollments/")?.params).toMatchObject({ student_id: 90 });
    expect(mock.history.get.some(request => /\/students\/\d+\/profile/.test(request.url ?? ""))).toBe(false);
    expect(mock.history.get.some(request => request.url?.startsWith("/courses/"))).toBe(false);
  });

  it("selects with the keyboard and announces the result state", async () => {
    mockStudents();
    const user = openGeneral(); await user.click(screen.getByRole("button", { name: "Open general payment" }));
    const search = screen.getByRole("combobox", { name: "Student" }); await user.type(search, "Match");
    await screen.findAllByRole("option");
    expect((await screen.findAllByRole("status")).some(node => node.textContent === "8 of 9 students")).toBe(true);
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(await screen.findByText("First Match 1")).toBeTruthy();
  });

  it("leaves Accept Payment enabled without a student and explains what is missing on submit", async () => {
    const user = openGeneral(); await user.click(screen.getByRole("button", { name: "Open general payment" }));
    const accept = screen.getByRole("button", { name: "Accept Payment" }) as HTMLButtonElement;
    expect(accept.disabled).toBe(false);
    await user.click(accept);
    expect((await screen.findByRole("alert")).textContent).toBe("Choose a student before recording payment.");
    expect(mock.history.post).toHaveLength(0);
  });

  it("clears the course and its stale data when the student is changed", async () => {
    mockStudents();
    const user = openGeneral(); await user.click(screen.getByRole("button", { name: "Open general payment" }));
    await user.type(screen.getByRole("combobox", { name: "Student" }), "Match");
    await user.click(await screen.findByRole("button", { name: "More results" })); await user.click(await screen.findByRole("option", { name: /Later Match/ }));
    await user.click(await screen.findByLabelText("Priority course")); await user.click(await screen.findByRole("option", { name: "Returned archived enrollment" }));
    expect(screen.getByLabelText("Priority course").textContent).toContain("Returned archived enrollment");
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.queryByLabelText("Priority course")).toBeNull(); expect(screen.queryByText("Returned archived enrollment")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Student" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Accept Payment" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Accept Payment" }).className).toContain("bg-maroon");
  });

  it("shows distinct course loading, error with retry and no-enrollment states", async () => {
    mockStudents(false);
    mock.onGet("/enrollments/").reply(500);
    mock.onGet(/\/finance\/charges\//).reply(200, { items: [], total: 0, page: 1, page_size: 100, total_pages: 0 });
    const user = openGeneral(); await user.click(screen.getByRole("button", { name: "Open general payment" }));
    await user.type(screen.getByRole("combobox", { name: "Student" }), "Match");
    await user.click(await screen.findByRole("button", { name: "More results" })); await user.click(await screen.findByRole("option", { name: /Later Match/ }));
    expect(await screen.findByText("Course context could not be loaded.")).toBeTruthy();
    mock.onGet("/enrollments/").reply(200, { items: [], total: 0, page: 1, page_size: 100, total_pages: 0 });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No available enrollments were returned for this student.")).toBeTruthy();
    expect(screen.queryByText("Course context could not be loaded.")).toBeNull();
  });

  it("reports no match and a retryable search failure separately", async () => {
    mock.onGet("/students/").replyOnce(200, { items: [], page: 1, page_size: 8, total: 0, total_pages: 0 }).onGet("/students/").replyOnce(500);
    const user = openGeneral(); await user.click(screen.getByRole("button", { name: "Open general payment" }));
    const search = screen.getByRole("combobox", { name: "Student" }); await user.type(search, "Nobody");
    expect((await screen.findAllByText("No matching students. Try another name or email.")).length).toBeGreaterThan(0);
    await user.clear(search); await user.type(search, "Broken");
    expect(await screen.findByText("Student search could not be loaded. Retry without changing the payment.", { selector: "p:not(.sr-only)" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Retry" }).length).toBeGreaterThan(0);
  });
});


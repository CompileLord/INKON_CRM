import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { CourseRosterRow } from "./CourseRosterRow";
import type { CourseRosterItem } from "../../lib/enrollments/types";

function item(overrides: Partial<CourseRosterItem>): CourseRosterItem {
  return {
    id: 1,
    enrollment_id: 1,
    student_id: 7,
    course_id: 3,
    color_hex: "#3182CE",
    enrolled_at: "2026-10-01T00:00:00Z",
    status: "active",
    student: { id: 7, first_name: "Umed", last_name: "Boboev", email: "umed@example.com", phone: null, photo_path: null, thumbnail_path: null },
    ...overrides,
  };
}

function renderRow(rosterItem: CourseRosterItem): void {
  render(
    <MemoryRouter>
      <CourseRosterRow item={rosterItem} canOpenProfile canWithdraw={false} canSwitchBillingMode={false} isHighlighted={false} registerName={vi.fn()} onStudentOpen={vi.fn()} onWithdraw={vi.fn()} onSwitchBillingMode={vi.fn()} />
    </MemoryRouter>,
  );
}

beforeEach(async () => i18n.changeLanguage("en"));
afterEach(cleanup);

describe("CourseRosterRow money visibility", () => {
  it("shows the per-student monthly price to staff who receive it", () => {
    renderRow(item({ price_at_enrollment: "500.00", billing_mode: "paid" }));
    expect(screen.getAllByText(/500/).length).toBeGreaterThan(0);
  });

  it("shows no price, grant badge or money to a mentor whose roster carries none", () => {
    renderRow(item({}));
    expect(screen.queryByText(/TJS/)).toBeNull();
    expect(screen.queryByTestId("grant-badge")).toBeNull();
    expect(screen.getAllByText(/since/).length).toBeGreaterThan(0);
  });
});

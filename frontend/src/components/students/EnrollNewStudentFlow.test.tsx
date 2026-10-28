import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import { EnrollNewStudentFlow } from "./EnrollNewStudentFlow";
import type { User } from "../../lib/users/types";

const modalProps = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));

vi.mock("../courses/EnrollStudentModal", () => ({
  EnrollStudentModal: (props: Record<string, unknown>) => {
    modalProps.calls.push(props);
    return props.open ? <div data-testid="enroll-modal" /> : null;
  },
}));
vi.mock("../../lib/courses/hooks", () => ({
  useCourses: () => ({ data: { items: [{ id: 7, title: "Frontend", price: "900.00" }] } }),
}));
vi.mock("../ui/ListboxPicker", () => ({
  ListboxPicker: ({ options, onChange }: { options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange(options[0].value)}>pick-course</button>
  ),
}));

const student = { id: 91, first_name: "Nilufar", last_name: "Rahimova", email: "n@example.com", phone: "+992900000091", photo_path: null, thumbnail_path: null } as unknown as User;

function renderFlow(isJustCreated: boolean) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>
        <EnrollNewStudentFlow open student={student} isJustCreated={isJustCreated} onFinish={vi.fn()} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("EnrollNewStudentFlow", () => {
  beforeEach(async () => {
    modalProps.calls.length = 0;
    await i18n.changeLanguage("en");
  });
  afterEach(() => cleanup());

  it("passes the new student to the enroll modal after a course is picked", () => {
    renderFlow(true);
    expect(screen.getByText("New student created")).toBeDefined();
    fireEvent.click(screen.getByText("pick-course"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const lastProps = modalProps.calls[modalProps.calls.length - 1];
    expect(lastProps.open).toBe(true);
    expect(lastProps.courseId).toBe(7);
    expect(lastProps.initialStudent).toMatchObject({ id: 91, first_name: "Nilufar", last_name: "Rahimova" });
  });

  it("uses the profile wording and a Cancel button when opened from the profile", () => {
    renderFlow(false);
    expect(screen.getByText("Enroll in a course")).toBeDefined();
    expect(screen.queryByText("New student created")).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
  });
});

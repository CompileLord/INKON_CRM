import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CourseFormPanel } from "./CourseFormPanel";
import { useAuthStore } from "../../store/authStore";
import "../../i18n";

vi.hoisted(() =>
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  }),
);

vi.mock("../../lib/courses/hooks", () => ({
  useCreateCourse: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCourse: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadCourseImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../../lib/users/hooks", () => ({
  useMentors: () => ({ data: { items: [], total: 0 }, isLoading: false }),
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useAuthStore.setState({ role: "superadmin" });
});

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

it("renders course form panel with course drawer variant geometry and accessible title", () => {
  renderWithClient(
    <CourseFormPanel
      open={true}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );

  const dialog = screen.getByRole("dialog");
  expect(dialog).toBeTruthy();
  expect(dialog.className).toContain("md:w-[560px]");
  expect(dialog.className).toContain("md:max-w-[560px]");
  expect(dialog.className).toContain("md:inset-y-0");
  expect(dialog.className).toContain("md:rounded-l-2xl");
  expect(dialog.className).toContain("md:border-l");
  expect(dialog.className).toContain("md:origin-right");
  expect(dialog.className).toContain("origin-bottom");

  expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
});

it("triggers onClose when cancel button or close button is clicked", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();

  renderWithClient(
    <CourseFormPanel
      open={true}
      onClose={onClose}
      onSaved={vi.fn()}
    />,
  );

  const cancelBtn = screen.getByRole("button", { name: "Cancel" });
  await user.click(cancelBtn);
  expect(onClose).toHaveBeenCalledTimes(1);

  const closeBtn = screen.getByRole("button", { name: "Close" });
  await user.click(closeBtn);
  expect(onClose).toHaveBeenCalledTimes(2);
});

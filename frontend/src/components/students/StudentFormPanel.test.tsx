import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StudentFormPanel } from "./StudentFormPanel";
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

vi.mock("../../lib/users/hooks", () => ({
  useCreateUser: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateUser: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(() => {
  cleanup();
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

it("renders real default person caller with 480px drawer from 640px and phone dialog below", () => {
  renderWithClient(
    <StudentFormPanel
      open={true}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );

  const dialog = screen.getByRole("dialog");
  expect(dialog).toBeTruthy();
  expect(dialog.className).toContain("sm:w-[480px]");
  expect(dialog.className).toContain("sm:max-w-[480px]");
  expect(dialog.className).toContain("sm:inset-y-0");
  expect(dialog.className).toContain("sm:rounded-l-2xl");
  expect(dialog.className).toContain("sm:border-l");
  expect(dialog.className).toContain("sm:origin-right");
  expect(dialog.className).toContain("origin-bottom");
  expect(dialog.className).toContain("fixed inset-0");
  expect(dialog.className).toContain("w-full");
  expect(dialog.className).toContain("h-dvh");

  expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
});

it("triggers onClose when close button or cancel button is clicked", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();

  renderWithClient(
    <StudentFormPanel
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

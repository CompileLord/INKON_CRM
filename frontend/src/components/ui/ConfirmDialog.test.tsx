import { useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";
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

afterEach(() => cleanup());

function FinalFocusFixture() {
  const [open, setOpen] = useState(false);
  const [itemExists, setItemExists] = useState(true);
  const survivingRef = useRef<HTMLButtonElement | null>(null);

  const handleConfirm = () => {
    setItemExists(false);
    setOpen(false);
  };

  return (
    <div>
      <button ref={survivingRef} data-testid="surviving-search">
        Surviving search
      </button>
      {itemExists ? (
        <button data-testid="delete-trigger" onClick={() => setOpen(true)}>
          Delete item
        </button>
      ) : null}
      <ConfirmDialog
        open={open}
        title="Confirm Deletion"
        message="Are you sure you want to delete this item?"
        finalFocus={survivingRef}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

it("sends focus to surviving element via caller-owned finalFocus when invoker is removed", async () => {
  render(<FinalFocusFixture />);
  const user = userEvent.setup();

  const trigger = screen.getByTestId("delete-trigger");
  await user.click(trigger);

  expect(screen.getByRole("dialog")).toBeTruthy();

  const deleteBtn = screen.getByRole("button", { name: "Delete" });
  await user.click(deleteBtn);

  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  expect(screen.queryByTestId("delete-trigger")).toBeNull();

  await waitFor(() => {
    expect(document.activeElement).toBe(screen.getByTestId("surviving-search"));
  });
});

it("supports default destructive vs explicit primary confirmation variant and existing cancel behavior", async () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup();

  const { unmount } = render(
    <ConfirmDialog
      open={true}
      title="Delete record"
      message="This will delete the record."
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );

  const defaultConfirmBtn = screen.getByRole("button", { name: "Delete" });
  expect(defaultConfirmBtn.className).toContain("bg-destructive");

  const cancelBtn = screen.getByRole("button", { name: "Cancel" });
  await user.click(cancelBtn);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();

  unmount();

  const onConfirmPrimary = vi.fn();
  render(
    <ConfirmDialog
      open={true}
      title="Duplicate record"
      message="This will duplicate the record."
      confirmVariant="primary"
      confirmLabel="Duplicate"
      onConfirm={onConfirmPrimary}
      onCancel={vi.fn()}
    />,
  );

  const primaryConfirmBtn = screen.getByRole("button", { name: "Duplicate" });
  expect(primaryConfirmBtn.className).toContain("bg-maroon");
  await user.click(primaryConfirmBtn);
  expect(onConfirmPrimary).toHaveBeenCalledTimes(1);
});

it("prevents dismissal and repeat submit dispatches when pending", async () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup();

  render(
    <ConfirmDialog
      open={true}
      title="Pending action"
      message="Processing request..."
      pending={true}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );

  const cancelBtn = screen.getByRole("button", { name: "Cancel" });
  expect(cancelBtn.hasAttribute("disabled")).toBe(true);

  const confirmBtn = screen.getByRole("button", { name: "Delete" });
  expect(confirmBtn.hasAttribute("disabled")).toBe(true);

  const closeBtn = screen.getByRole("button", { name: "Close" });
  expect(closeBtn.hasAttribute("disabled")).toBe(true);

  await user.click(cancelBtn);
  await user.click(confirmBtn);
  await user.click(closeBtn);
  expect(onCancel).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();

  await user.keyboard("{Escape}");
  expect(onCancel).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeTruthy();

  const backdrop = document.querySelector(".bg-scrim");
  expect(backdrop).toBeTruthy();
  await user.click(backdrop!);
  expect(onCancel).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeTruthy();
});

function ErrorStateFixture() {
  const [errorMessage, setErrorMessage] = useState<string | undefined>("Failed to copy course");

  return (
    <div>
      <button data-testid="update-error" onClick={() => setErrorMessage("Updated failure message")}>
        Update error
      </button>
      <button data-testid="clear-error" onClick={() => setErrorMessage(undefined)}>
        Clear error
      </button>
      <ConfirmDialog
        open={true}
        title="Duplicate course"
        message="Are you sure you want to duplicate this course?"
        errorMessage={errorMessage}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </div>
  );
}

it("renders caller-owned errorMessage inside dialog accessible alert region and reflects caller state updates without closing dialog", async () => {
  render(<ErrorStateFixture />);
  const user = userEvent.setup();

  const dialog = screen.getByRole("dialog");
  expect(dialog).toBeTruthy();

  const alert = within(dialog).getByRole("alert");
  expect(alert.textContent).toBe("Failed to copy course");
  expect(alert.className).toContain("text-destructive");
  expect(alert.className).toContain("break-words");

  const updateBtn = screen.getByTestId("update-error");
  await user.click(updateBtn);

  const updatedAlert = within(screen.getByRole("dialog")).getByRole("alert");
  expect(updatedAlert.textContent).toBe("Updated failure message");

  const clearBtn = screen.getByTestId("clear-error");
  await user.click(clearBtn);

  expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
  expect(screen.getByRole("dialog")).toBeTruthy();
});

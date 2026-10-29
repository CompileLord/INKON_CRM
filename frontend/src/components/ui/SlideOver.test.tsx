import { useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SlideOver } from "./SlideOver";
import { useShellStore } from "../../store/shellStore";
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

afterEach(() => {
  cleanup();
  useShellStore.setState({ surface: null, trigger: null });
});

function KeyboardContainmentFixture() {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button data-testid="outside-before">Outside Before</button>
      <SlideOver open={open} title="Keyboard Containment" onClose={() => setOpen(false)}>
        <input data-testid="first-input" aria-label="First Input" />
        <button data-testid="middle-button">Middle Button</button>
        <input data-testid="last-input" aria-label="Last Input" />
      </SlideOver>
      <button data-testid="outside-after">Outside After</button>
    </div>
  );
}

function UnderlyingInertFixture() {
  const [open, setOpen] = useState(true);
  const underlyingSpy = vi.fn();
  return (
    <div>
      <div data-testid="underlying-page">
        <button data-testid="underlying-trigger" onClick={underlyingSpy}>
          Underlying Action
        </button>
      </div>
      <SlideOver open={open} title="Inertness Test" onClose={() => setOpen(false)}>
        <button data-testid="inside-btn">Inside</button>
      </SlideOver>
    </div>
  );
}

function CreateFocusReturnFixture() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button data-testid="create-course-trigger" onClick={() => setOpen(true)}>
        Create Course
      </button>
      <SlideOver open={open} title="New Course" onClose={() => setOpen(false)}>
        <input data-testid="course-title-input" aria-label="Course Title" />
      </SlideOver>
    </div>
  );
}

function MenuEditSurvivingOriginFixture() {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const actionsButtonRef = useRef<HTMLButtonElement | null>(null);

  const handleEditClick = () => {
    setMenuOpen(false);
    setOpen(true);
  };

  return (
    <div>
      <button
        ref={actionsButtonRef}
        data-testid="course-actions-menu-trigger"
        onClick={() => setMenuOpen(true)}
      >
        Course Actions
      </button>
      {menuOpen ? (
        <div role="menu">
          <button data-testid="menu-item-edit" onClick={handleEditClick}>
            Edit
          </button>
        </div>
      ) : null}
      <SlideOver
        open={open}
        title="Edit Course"
        onClose={() => setOpen(false)}
        finalFocus={actionsButtonRef}
      >
        <input data-testid="edit-title-input" aria-label="Edit Title" />
      </SlideOver>
    </div>
  );
}

function RealRapidLifecycleFixture() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button data-testid="real-origin-trigger" onClick={() => setOpen(true)}>
        Open Origin
      </button>
      <SlideOver open={open} title="Lifecycle" onClose={() => setOpen(false)}>
        <p>Drawer body</p>
      </SlideOver>
    </div>
  );
}

function PendingGuardReleaseFixture() {
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState(true);
  return (
    <div>
      <SlideOver
        open={open}
        pending={pending}
        title="Pending Guard"
        onClose={() => setOpen(false)}
        footer={
          <button data-testid="release-pending" onClick={() => setPending(false)}>
            Release Pending
          </button>
        }
      >
        <p>Saving changes...</p>
      </SlideOver>
    </div>
  );
}

it("renders with native dialog semantics, accessible title and closes shared shell overlays", async () => {
  const triggerBtn = document.createElement("button");
  document.body.appendChild(triggerBtn);
  useShellStore.getState().toggle("more", triggerBtn);
  expect(useShellStore.getState().surface).toBe("more");

  render(
    <SlideOver open={true} title="Course Details" onClose={vi.fn()}>
      <div>Body content</div>
    </SlideOver>,
  );

  expect(useShellStore.getState().surface).toBeNull();

  const dialog = screen.getByRole("dialog");
  expect(dialog).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Course Details" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  triggerBtn.remove();
});

it("supports 44px close button dismissal, Escape key, and backdrop click", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();

  const { rerender } = render(
    <SlideOver open={true} title="Dismissal Test" onClose={onClose}>
      <p>Body</p>
    </SlideOver>,
  );

  const closeBtn = screen.getByRole("button", { name: "Close" });
  expect(closeBtn.className).toContain("h-11");
  expect(closeBtn.className).toContain("w-11");
  await user.click(closeBtn);
  expect(onClose).toHaveBeenCalledTimes(1);

  onClose.mockClear();
  rerender(
    <SlideOver open={true} title="Dismissal Test" onClose={onClose}>
      <p>Body</p>
    </SlideOver>,
  );

  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);

  onClose.mockClear();
  rerender(
    <SlideOver open={true} title="Dismissal Test" onClose={onClose}>
      <p>Body</p>
    </SlideOver>,
  );

  const backdrop = document.querySelector(".bg-scrim");
  expect(backdrop).toBeTruthy();
  await user.click(backdrop!);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("contains Tab and Shift+Tab keyboard focus strictly inside dialog", async () => {
  const user = userEvent.setup();
  render(<KeyboardContainmentFixture />);

  const dialog = screen.getByRole("dialog");
  expect(dialog).toBeTruthy();

  await waitFor(() => {
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  const closeBtn = screen.getByRole("button", { name: "Close" });
  const firstInput = screen.getByTestId("first-input");
  const middleBtn = screen.getByTestId("middle-button");
  const lastInput = screen.getByTestId("last-input");

  firstInput.focus();
  expect(document.activeElement).toBe(firstInput);

  await user.tab();
  expect(document.activeElement).toBe(middleBtn);

  await user.tab();
  expect(document.activeElement).toBe(lastInput);

  await user.tab();
  expect(document.activeElement).not.toBe(screen.getByTestId("outside-after"));
  expect(document.activeElement).not.toBe(screen.getByTestId("outside-before"));
  const isInsideOrFocusGuard =
    dialog.contains(document.activeElement) ||
    document.activeElement?.hasAttribute("data-base-ui-focus-guard");
  expect(isInsideOrFocusGuard).toBe(true);

  closeBtn.focus();
  await user.tab({ shift: true });
  expect(document.activeElement).not.toBe(screen.getByTestId("outside-before"));
  expect(document.activeElement).not.toBe(screen.getByTestId("outside-after"));
  const isShiftInsideOrFocusGuard =
    dialog.contains(document.activeElement) ||
    document.activeElement?.hasAttribute("data-base-ui-focus-guard");
  expect(isShiftInsideOrFocusGuard).toBe(true);
});

it("makes underlying page inert and prevents activation of background controls", async () => {
  const user = userEvent.setup();
  render(<UnderlyingInertFixture />);

  const underlyingContainer = screen.getByTestId("underlying-page");
  expect(
    underlyingContainer.getAttribute("aria-hidden") === "true" ||
      underlyingContainer.hasAttribute("inert") ||
      underlyingContainer.closest("[aria-hidden='true']") !== null,
  ).toBe(true);

  const underlyingTrigger = screen.getByTestId("underlying-trigger");
  await user.click(underlyingTrigger).catch(() => {});
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("restores focus to visible create button origin on clean dismissal", async () => {
  const user = userEvent.setup();
  render(<CreateFocusReturnFixture />);

  const createTrigger = screen.getByTestId("create-course-trigger");
  await user.click(createTrigger);

  expect(screen.getByRole("dialog")).toBeTruthy();

  const closeBtn = screen.getByRole("button", { name: "Close" });
  await user.click(closeBtn);

  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  await waitFor(() => {
    expect(document.activeElement).toBe(createTrigger);
  });
});

it("restores focus to surviving actions menu origin when menu item unmounts on open", async () => {
  const user = userEvent.setup();
  render(<MenuEditSurvivingOriginFixture />);

  const actionsTrigger = screen.getByTestId("course-actions-menu-trigger");
  await user.click(actionsTrigger);

  const editItem = screen.getByTestId("menu-item-edit");
  await user.click(editItem);

  expect(screen.queryByTestId("menu-item-edit")).toBeNull();
  expect(screen.getByRole("dialog")).toBeTruthy();

  await user.keyboard("{Escape}");

  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  await waitFor(() => {
    expect(document.activeElement).toBe(actionsTrigger);
  });
});

it("blocks dismissal while pending and cleanly dismisses after pending is released", async () => {
  const user = userEvent.setup();
  render(<PendingGuardReleaseFixture />);

  const closeBtn = screen.getByRole("button", { name: "Close" });
  expect(closeBtn.hasAttribute("disabled")).toBe(true);

  await user.click(closeBtn);
  await user.keyboard("{Escape}");

  const backdrop = document.querySelector(".bg-scrim");
  expect(backdrop).toBeTruthy();
  await user.click(backdrop!);
  expect(screen.getByRole("dialog")).toBeTruthy();

  const releaseBtn = screen.getByTestId("release-pending");
  await user.click(releaseBtn);

  await waitFor(() => {
    expect(closeBtn.hasAttribute("disabled")).toBe(false);
  });

  await user.keyboard("{Escape}");

  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

it("supports real rapid lifecycle through dialog close and origin reopen", async () => {
  const user = userEvent.setup();
  render(<RealRapidLifecycleFixture />);

  const originBtn = screen.getByTestId("real-origin-trigger");

  await user.click(originBtn);
  expect(screen.getByRole("dialog")).toBeTruthy();
  await waitFor(() => {
    expect(document.body.style.overflowY).toBe("hidden");
  });

  const closeBtn = screen.getByRole("button", { name: "Close" });
  await user.click(closeBtn);
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  await waitFor(() => {
    expect(document.body.style.overflowY).not.toBe("hidden");
  });
  await waitFor(() => {
    expect(document.activeElement).toBe(originBtn);
  });

  await user.click(originBtn);
  expect(screen.getByRole("dialog")).toBeTruthy();
  await waitFor(() => {
    expect(document.body.style.overflowY).toBe("hidden");
  });

  await user.keyboard("{Escape}");
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  await waitFor(() => {
    expect(document.body.style.overflowY).not.toBe("hidden");
  });
});

it("cleans up native scroll locks when unmounted during route transition", async () => {
  const { unmount } = render(
    <SlideOver open={true} title="Route Transition" onClose={vi.fn()}>
      <p>Active route content</p>
    </SlideOver>,
  );

  await waitFor(() => {
    expect(document.body.style.overflowY).toBe("hidden");
  });

  unmount();

  await waitFor(() => {
    expect(document.body.style.overflowY).not.toBe("hidden");
  });
});

it("preserves open drawer and content across window resize across breakpoints", async () => {
  render(
    <SlideOver open={true} variant="course" title="Resize Drawer" onClose={vi.fn()}>
      <input data-testid="draft-title" aria-label="Draft Title" defaultValue="Initial course" />
    </SlideOver>,
  );

  const input = screen.getByTestId("draft-title") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "Preserved draft value" } });

  await waitFor(() => {
    expect(document.body.style.overflowY).toBe("hidden");
  });

  window.dispatchEvent(new Event("resize"));

  expect(input.value).toBe("Preserved draft value");
  expect(screen.getByRole("dialog")).toBeTruthy();
  await waitFor(() => {
    expect(document.body.style.overflowY).toBe("hidden");
  });
});

it("applies person default geometry with 480px width from 640px breakpoint and phone modal below", () => {
  render(
    <SlideOver open={true} title="Person Drawer" onClose={vi.fn()}>
      <p>Person fields</p>
    </SlideOver>,
  );

  const dialog = screen.getByRole("dialog");
  expect(dialog.className).toContain("sm:w-[480px]");
  expect(dialog.className).toContain("sm:max-w-[480px]");
  expect(dialog.className).toContain("sm:inset-y-0");
  expect(dialog.className).toContain("sm:rounded-l-2xl");
  expect(dialog.className).toContain("sm:origin-right");
  expect(dialog.className).toContain("origin-bottom");
  expect(dialog.className).toContain("fixed inset-0");
  expect(dialog.className).toContain("w-full");
  expect(dialog.className).toContain("h-dvh");
});

it("applies course variant geometry with 560px width from 768px breakpoint and phone modal below", () => {
  render(
    <SlideOver
      open={true}
      variant="course"
      title="Course Drawer"
      onClose={vi.fn()}
      footer={<button>Submit</button>}
    >
      <p>Course terms</p>
    </SlideOver>,
  );

  const dialog = screen.getByRole("dialog");
  expect(dialog.className).toContain("md:w-[560px]");
  expect(dialog.className).toContain("md:max-w-[560px]");
  expect(dialog.className).toContain("md:inset-y-0");
  expect(dialog.className).toContain("md:rounded-l-2xl");
  expect(dialog.className).toContain("md:origin-right");
  expect(dialog.className).toContain("origin-bottom");
  expect(dialog.className).toContain("fixed inset-0");
  expect(dialog.className).toContain("w-full");
  expect(dialog.className).toContain("h-dvh");
  expect(dialog.className).toContain("grid-rows-[auto_minmax(0,1fr)_auto]");
  expect(screen.getByText("Submit")).toBeTruthy();
});

it("keeps the drawer entry animation free of focus-dependent toggles", async () => {
  const user = userEvent.setup();
  render(<SlideOver open title="Animated drawer" onClose={() => {}}><input aria-label="Drawer field"/><button>Drawer press</button></SlideOver>);
  const surface: HTMLElement | null = document.querySelector<HTMLElement>("[class*=card-scale-in]");
  expect(surface).not.toBeNull();
  const classBefore: string = surface!.className;
  expect(classBefore).not.toContain("animate-none");
  expect(classBefore).not.toContain("focus-visible");
  await user.type(screen.getByLabelText("Drawer field"), "abc");
  await user.click(screen.getByRole("button", { name: "Drawer press" }));
  expect(surface!.className).toBe(classBefore);
});

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "../../i18n";
import { JournalCommentEditor } from "./JournalCommentEditor";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

function mount(initialComment: string | null = "Original note") {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <JournalCommentEditor studentName="Aziza Rahimova" formattedDate="10/14/2026" initialComment={initialComment} onSave={onSave} onClose={onClose} />,
  );
  const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
  return { onSave, onClose, textarea };
}

describe("JournalCommentEditor", () => {
  it("shows the student and lesson date in the dialog heading and uses a 16px textarea", () => {
    const { textarea } = mount();
    expect(screen.getByRole("dialog", { name: "Comment for Aziza Rahimova, 10/14/2026" })).toBeDefined();
    expect(textarea.className).toContain("text-base");
    expect(textarea.value).toBe("Original note");
  });

  it("focuses the textarea when it opens", async () => {
    const { textarea } = mount();
    await waitFor(() => expect(document.activeElement).toBe(textarea));
  });

  it("closes on Escape when the draft is pristine", () => {
    const { textarea, onClose } = mount();
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the editor open on Escape when the draft is dirty and offers Continue editing and Discard", () => {
    const { textarea, onClose, onSave } = mount();
    fireEvent.change(textarea, { target: { value: "Edited note" } });
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue editing" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Discard comment changes" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Continue editing" }));
    expect(screen.queryByRole("button", { name: "Discard comment changes" })).toBeNull();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Edited note");

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Discard comment changes" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("states the consequence of Cancel near the footer only when dirty, and Cancel discards without saving", () => {
    const { textarea, onClose, onSave } = mount();
    expect(screen.queryByText("Cancel discards your unsaved comment changes.")).toBeNull();
    fireEvent.change(textarea, { target: { value: "Edited note" } });
    expect(screen.getByText("Cancel discards your unsaved comment changes.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves the trimmed draft and closes", () => {
    const { textarea, onSave, onClose } = mount();
    fireEvent.change(textarea, { target: { value: "  Better note  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Better note");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves an emptied draft as an explicit clear", () => {
    const { textarea, onSave } = mount();
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("");
  });

  it("saves with Ctrl+Enter and with Cmd+Enter but inserts a newline for a plain Enter", () => {
    const first = mount();
    fireEvent.change(first.textarea, { target: { value: "ctrl" } });
    fireEvent.keyDown(first.textarea, { key: "Enter", ctrlKey: true });
    expect(first.onSave).toHaveBeenCalledWith("ctrl");
    cleanup();

    const second = mount();
    fireEvent.change(second.textarea, { target: { value: "meta" } });
    fireEvent.keyDown(second.textarea, { key: "Enter", metaKey: true });
    expect(second.onSave).toHaveBeenCalledWith("meta");
    cleanup();

    const third = mount();
    const notPrevented = fireEvent.keyDown(third.textarea, { key: "Enter" });
    expect(notPrevented).toBe(true);
    expect(third.onSave).not.toHaveBeenCalled();
  });

  it("keeps the draft and the dialog when the window is resized", () => {
    const { textarea, onClose } = mount();
    fireEvent.change(textarea, { target: { value: "Typed before the keyboard opened" } });
    window.dispatchEvent(new Event("resize"));
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Typed before the keyboard opened");
  });

  describe("length limit", () => {
    function typeComment(textarea: HTMLTextAreaElement, value: string): void {
      fireEvent.change(textarea, { target: { value } });
    }

    it("accepts exactly 1000 code points and saves", () => {
      const { textarea, onSave } = mount(null);
      typeComment(textarea, "a".repeat(1000));
      expect(screen.queryByRole("alert")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onSave).toHaveBeenCalledWith("a".repeat(1000));
    });

    it("rejects 1001 code points with a message and blocks Save and Ctrl+Enter", () => {
      const { textarea, onSave } = mount(null);
      typeComment(textarea, "a".repeat(1001));
      expect(screen.getByRole("alert").textContent).toContain("1000");
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
      expect(onSave).not.toHaveBeenCalled();
      expect(textarea.value.length).toBe(1001);
    });

    it("counts astral emoji as one code point each", () => {
      const { textarea, onSave } = mount(null);
      typeComment(textarea, "\u{1F600}".repeat(1000));
      expect(textarea.value.length).toBe(2000);
      expect(screen.queryByRole("alert")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("rejects 1001 astral emoji", () => {
      const { textarea } = mount(null);
      typeComment(textarea, "\u{1F600}".repeat(1001));
      expect(screen.getByRole("alert")).toBeDefined();
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("does not count surrounding whitespace that is trimmed on save", () => {
      const { textarea } = mount(null);
      typeComment(textarea, `  ${"a".repeat(1000)}  `);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("shows the limit message in Russian and Tajik", async () => {
      for (const language of ["ru", "tg"]) {
        await i18n.changeLanguage(language);
        const { textarea } = mount(null);
        typeComment(textarea, "a".repeat(1001));
        const message: string = screen.getByRole("alert").textContent ?? "";
        expect(message).toContain("1000");
        expect(message).not.toBe(i18n.getFixedT("en", "journals")("comment.tooLong", { max: 1000 }));
        cleanup();
      }
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import { StudentCreatedNotice } from "./StudentCreatedNotice";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(cleanup);

describe("StudentCreatedNotice", () => {
  it("names the student phone as the SMS destination", () => {
    render(<StudentCreatedNotice destination="student_phone" parentLinkCode={null} onClose={vi.fn()} />);
    expect(screen.getByText("The password was sent by SMS to the student phone.")).toBeDefined();
    expect(screen.queryByText("Parent link code")).toBeNull();
  });

  it("names the parent phone as the SMS destination", () => {
    render(<StudentCreatedNotice destination="parent_phone" parentLinkCode={null} onClose={vi.fn()} />);
    expect(screen.getByText("The password was sent by SMS to the parent phone.")).toBeDefined();
  });

  it("shows the parent link code with a working copy button", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<StudentCreatedNotice destination="parent_phone" parentLinkCode="ABC12345" onClose={vi.fn()} />);
    expect(screen.getByText("ABC12345")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("ABC12345");
    expect(await screen.findByText("Copied")).toBeDefined();
  });
});

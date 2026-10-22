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
  it("says the password was sent by email", () => {
    render(<StudentCreatedNotice credentials={{ channel: "email", maskedPhone: null }} parentLinkCode={null} onClose={vi.fn()} />);
    expect(screen.getByText("The password was sent by email.")).toBeDefined();
    expect(screen.queryByText("Parent link code")).toBeNull();
  });

  it("names the masked student phone as the SMS destination", () => {
    render(<StudentCreatedNotice credentials={{ channel: "student_phone", maskedPhone: "***4567" }} parentLinkCode={null} onClose={vi.fn()} />);
    expect(screen.getByText("The password was sent by SMS to ***4567.")).toBeDefined();
  });

  it("names the masked parent phone as the SMS destination", () => {
    render(<StudentCreatedNotice credentials={{ channel: "parent_phone", maskedPhone: "***8901" }} parentLinkCode={null} onClose={vi.fn()} />);
    expect(screen.getByText("The password was sent by SMS to the parent, ***8901.")).toBeDefined();
  });

  it("shows the parent link code with a working copy button", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<StudentCreatedNotice credentials={{ channel: "parent_phone", maskedPhone: "***8901" }} parentLinkCode="ABC12345" onClose={vi.fn()} />);
    expect(screen.getByText("ABC12345")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("ABC12345");
    expect(await screen.findByText("Copied")).toBeDefined();
  });
});

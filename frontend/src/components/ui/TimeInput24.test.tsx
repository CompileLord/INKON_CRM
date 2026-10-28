import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { TimeInput24, normalizeTimeDraft } from "./TimeInput24";

afterEach(() => cleanup());

function Harness({ initial, spy }: { initial: string; spy: (value: string) => void }) {
  const [value, setValue] = useState<string>(initial);
  return (
    <I18nextProvider i18n={i18n}>
      <TimeInput24 aria-label="start" value={value} onChange={(next) => { spy(next); setValue(next); }} />
    </I18nextProvider>
  );
}

describe("normalizeTimeDraft", () => {
  it("keeps digits only and inserts the colon", () => {
    expect(normalizeTimeDraft("0930")).toBe("09:30");
    expect(normalizeTimeDraft("9")).toBe("9");
    expect(normalizeTimeDraft("09:3a0")).toBe("09:30");
    expect(normalizeTimeDraft("123456")).toBe("12:34");
  });
});

describe("TimeInput24", () => {
  it("is a 24-hour text field with no AM/PM and shows seconds-free values", () => {
    render(<Harness initial="14:05:00" spy={vi.fn()} />);
    const input: HTMLInputElement = screen.getByLabelText("start");
    expect(input.type).toBe("text");
    expect(input.value).toBe("14:05");
  });

  it("emits a value only when the time is complete and valid", () => {
    const spy = vi.fn();
    render(<Harness initial="" spy={spy} />);
    const input: HTMLInputElement = screen.getByLabelText("start");
    fireEvent.change(input, { target: { value: "0" } });
    expect(spy).toHaveBeenLastCalledWith("");
    fireEvent.change(input, { target: { value: "0930" } });
    expect(spy).toHaveBeenLastCalledWith("09:30");
    expect(input.value).toBe("09:30");
    fireEvent.change(input, { target: { value: "2560" } });
    expect(spy).toHaveBeenLastCalledWith("");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("uses a placeholder in the app language", async () => {
    await i18n.changeLanguage("ru");
    render(<Harness initial="" spy={vi.fn()} />);
    expect((screen.getByLabelText("start") as HTMLInputElement).placeholder).toBe("ЧЧ:ММ");
    await i18n.changeLanguage("en");
  });
});

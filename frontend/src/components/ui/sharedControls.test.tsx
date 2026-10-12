import { createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import en from "../../i18n/locales/en/common.json";
import ru from "../../i18n/locales/ru/common.json";
import tg from "../../i18n/locales/tg/common.json";
import { Button } from "./Button";
import { Toggle } from "./Toggle";
import { Input } from "./Input";
import { PersonAvatar } from "./PersonAvatar";
import { BrandLogo } from "./BrandLogo";

afterEach(cleanup);

describe("shared control interactions", () => {
  it("blocks disabled and pending button actions and allows keyboard submission once", async () => {
    const submit = vi.fn();
    const user = userEvent.setup();
    const view = render(<Button onClick={submit} disabled>Save</Button>);
    await user.click(view.getByRole("button"));
    expect(submit).not.toHaveBeenCalled();
    view.rerender(<Button onClick={submit} loading>Save</Button>);
    await user.click(view.getByRole("button"));
    expect(submit).not.toHaveBeenCalled();
    expect(view.getByRole("button").getAttribute("aria-busy")).toBe("true");
    view.rerender(<Button onClick={submit}>Save</Button>);
    view.getByRole("button").focus();
    await user.keyboard("{Enter}");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("activates a switch through its label, Space and Enter without duplicate changes", async () => {
    const change = vi.fn();
    function ControlledToggle({ disabled = false }: { disabled?: boolean }) {
      const [checked, setChecked] = useState(false);
      return <Toggle label="Notifications" checked={checked} disabled={disabled} onChange={(value) => { change(value); setChecked(value); }} />;
    }
    const user = userEvent.setup();
    const view = render(<ControlledToggle />);
    const control = view.getByRole("switch", { name: "Notifications" });
    await user.click(view.getByText("Notifications"));
    expect(control.getAttribute("aria-checked")).toBe("true");
    expect(change).toHaveBeenCalledTimes(1);
    control.focus();
    await user.keyboard(" ");
    expect(control.getAttribute("aria-checked")).toBe("false");
    await user.keyboard("{Enter}");
    expect(control.getAttribute("aria-checked")).toBe("true");
    expect(change).toHaveBeenCalledTimes(3);
    view.rerender(<ControlledToggle disabled />);
    await user.click(view.getByText("Notifications"));
    await user.keyboard("{Enter} ");
    expect(change).toHaveBeenCalledTimes(3);
  });

  it("preserves unique input IDs, values, ref and focus across localized labels", async () => {
    const ref = createRef<HTMLInputElement>();
    const view = render(<><Input ref={ref} label="Email" /><Input label="Email" /></>);
    const fields = view.getAllByRole("textbox");
    expect(fields[0].id).not.toBe(fields[1].id);
    expect(ref.current).toBe(fields[0]);
    const user = userEvent.setup();
    await user.click(view.getAllByText("Email")[0]);
    expect(document.activeElement).toBe(ref.current);
    await user.type(fields[0], "reader@example.com");
    const id = fields[0].id;
    view.rerender(<><Input ref={ref} label="Почта" /><Input label="Почта" /></>);
    expect(ref.current?.id).toBe(id);
    expect(ref.current?.value).toBe("reader@example.com");
    expect(document.activeElement).toBe(ref.current);
  });

  it("composes caller descriptions with only the currently rendered validation node", () => {
    const view = render(<><p id="external">External explanation</p><Input id="email" label="Email" aria-describedby="external" helperText="Help" /></>);
    const input = view.getByRole("textbox");
    expect(input.getAttribute("aria-describedby")).toBe("external email-helper");
    view.rerender(<><p id="external">External explanation</p><Input id="email" label="Email" aria-describedby="external" error="Invalid email" helperText="Help" /></>);
    expect(input.getAttribute("aria-describedby")).toBe("external email-error");
    expect(view.queryByText("Help")).toBeNull();
    expect(view.getByRole("alert").id).toBe("email-error");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("falls back on an image failure and recovers when the photo changes", () => {
    const view = render(<PersonAvatar firstName="Ada" lastName="Lovelace" photoUrl="/broken.jpg" size={48} />);
    fireEvent.error(view.getByRole("img"));
    expect(view.getByRole("img", { name: "Ada Lovelace" }).textContent).toBe("AL");
    expect(view.getByRole("img").style.width).toBe("48px");
    view.rerender(<PersonAvatar firstName="Ada" lastName="Lovelace" photoUrl="/working.jpg" size={48} />);
    expect(view.getByRole("img").getAttribute("src")).toBe("/working.jpg");
  });

  it("updates the logo accessible name when the locale changes", async () => {
    const i18n = createInstance();
    await i18n.init({ lng: "en", resources: { en: { common: en }, ru: { common: ru }, tg: { common: tg } }, defaultNS: "common" });
    const view = render(<I18nextProvider i18n={i18n}><BrandLogo /></I18nextProvider>);
    expect(view.getByRole("img").getAttribute("alt")).toBe(en.brand.logoAlt);
    await i18n.changeLanguage("tg");
    expect((await view.findByRole("img", { name: tg.brand.logoAlt })).getAttribute("alt")).toBe(tg.brand.logoAlt);
    view.rerender(<I18nextProvider i18n={i18n}><PersonAvatar firstName=" " lastName="" size={48} /></I18nextProvider>);
    const missingName = view.getByRole("img", { name: tg.controls.unknownPerson });
    expect(missingName.querySelector("svg")).not.toBeNull();
    expect(missingName.style.width).toBe("48px");
  });
});

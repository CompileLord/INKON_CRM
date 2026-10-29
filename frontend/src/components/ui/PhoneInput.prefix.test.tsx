import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { PhoneInput } from "./PhoneInput";

afterEach(() => cleanup());

interface PhoneForm {
  phone: string;
}

let submitted: PhoneForm | null = null;

function RegisteredPhone() {
  const { register, handleSubmit } = useForm<PhoneForm>({ defaultValues: { phone: "" } });
  return (
    <form onSubmit={handleSubmit((values) => { submitted = values; })}>
      <PhoneInput label="Phone" {...register("phone")} />
      <button type="submit">Save</button>
    </form>
  );
}

describe("PhoneInput default +992 prefix", () => {
  it("fills +992 when an empty field gets focus and keeps typed digits after it", async () => {
    render(<RegisteredPhone />);
    const input: HTMLInputElement = screen.getByLabelText("Phone");
    await userEvent.click(input);
    expect(input.value).toBe("+992");
    await userEvent.type(input, "901234567");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(submitted).toEqual({ phone: "+992901234567" });
  });

  it("clears an untouched prefix on blur so an optional field stays empty", async () => {
    render(<RegisteredPhone />);
    const input: HTMLInputElement = screen.getByLabelText("Phone");
    await userEvent.click(input);
    fireEvent.blur(input);
    expect(input.value).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(submitted).toEqual({ phone: "" });
  });

  it("does not double the prefix when a full number is pasted", async () => {
    render(<RegisteredPhone />);
    const input: HTMLInputElement = screen.getByLabelText("Phone");
    await userEvent.click(input);
    await userEvent.paste("+992901234567");
    expect(input.value).toBe("+992901234567");
  });

  it("drops a doubled 992 when the full number is typed after the prefix", async () => {
    render(<RegisteredPhone />);
    const input: HTMLInputElement = screen.getByLabelText("Phone");
    await userEvent.click(input);
    await userEvent.type(input, "992901234567");
    expect(input.value).toBe("+992901234567");
  });

  it("does not touch a field that already has a number", async () => {
    render(<PhoneInput label="Phone" defaultValue="+79001234567" />);
    const input: HTMLInputElement = screen.getByLabelText("Phone");
    await userEvent.click(input);
    expect(input.value).toBe("+79001234567");
  });
});

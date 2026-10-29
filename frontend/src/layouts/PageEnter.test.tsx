import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { PageEnter } from "./PageEnter";

afterEach(() => cleanup());

function Fixture() {
  return (
    <MemoryRouter initialEntries={["/students"]}>
      <Link to="/students?q=a">filter</Link>
      <Link to="/finance">finance</Link>
      <Routes><Route element={<PageEnter/>}><Route path="/students" element={<p>students</p>}/><Route path="/finance" element={<p>finance</p>}/></Route></Routes>
    </MemoryRouter>
  );
}

it("replays the page enter animation only when the pathname changes", async () => {
  render(<Fixture/>);
  const user = userEvent.setup();
  const first: HTMLElement = screen.getByTestId("page-enter");
  expect(first.className).toContain("motion-safe:animate-[page-enter_200ms_ease-out]");
  await user.click(screen.getByText("filter"));
  expect(screen.getByTestId("page-enter")).toBe(first);
  await user.click(screen.getByText("finance"));
  expect(screen.getByTestId("page-enter")).not.toBe(first);
  expect(screen.getByText("finance", { selector: "p" })).toBeTruthy();
});

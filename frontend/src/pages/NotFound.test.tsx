import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import i18n from "../i18n";
import { NotFound } from "./NotFound";
import { RouteError } from "./RouteError";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(cleanup);

describe("NotFound and RouteError", () => {
  it("renders the translated 404 with a link home for unknown paths", () => {
    render(<RouterProvider router={createMemoryRouter([{ path: "/", element: <div>home</div> }, { path: "*", element: <NotFound /> }], { initialEntries: ["/nope/1"] })} />);
    expect(screen.getByText("Page not found")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the start page" }).getAttribute("href")).toBe("/");
  });

  it("shows a retryable error for thrown errors and the 404 for 404 responses", () => {
    function Boom(): never {
      throw new Error("boom");
    }
    const errorSpy = console.error;
    console.error = () => undefined;
    render(<RouterProvider router={createMemoryRouter([{ path: "/", element: <Boom />, errorElement: <RouteError /> }])} />);
    console.error = errorSpy;
    expect(screen.getByText("This page failed to open")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("maps a 404 route error response to NotFound", async () => {
    render(<RouterProvider router={createMemoryRouter([{ path: "/", element: <div />, errorElement: <RouteError />, loader: () => { throw new Response("", { status: 404 }); } }])} />);
    expect(await screen.findByText("Page not found")).toBeTruthy();
  });
});

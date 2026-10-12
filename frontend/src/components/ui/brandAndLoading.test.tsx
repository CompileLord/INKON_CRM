import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import en from "../../i18n/locales/en/common.json";
import ru from "../../i18n/locales/ru/common.json";
import tg from "../../i18n/locales/tg/common.json";
import { BrandLogo } from "./BrandLogo";
import { BrandActivityIndicator } from "./BrandActivityIndicator";
import { BrandAnimatedLogo } from "./BrandAnimatedLogo";
import { Button } from "./Button";
import { FullscreenSpinner } from "../auth/FullscreenSpinner";
import { AuthFrame } from "../../layouts/AuthFrame";
import { useThemeStore } from "../../store/themeStore";
import { BRAND_DIMENSIONS } from "../../assets/brandAssets";

beforeAll(() => {
  window.matchMedia = (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  useThemeStore.getState().setTheme("light");
});

function createTestI18n(lang = "en") {
  const instance = createInstance();
  instance.init({
    lng: lang,
    resources: {
      en: { common: en },
      ru: { common: ru },
      tg: { common: tg },
    },
    defaultNS: "common",
  });
  return instance;
}

describe("brand vector assets and loading activity indicator", () => {
  it("renders vector full logo and emblem with verified geometry and no bright plate in dark theme", () => {
    const i18n = createTestI18n("en");
    const view = render(
      <I18nextProvider i18n={i18n}>
        <BrandLogo variant="full" size="md" />
        <BrandLogo variant="emblem" size="sm" />
      </I18nextProvider>,
    );

    const fullLogo = view.getAllByRole("img")[0];
    const emblem = view.getAllByRole("img")[1];

    expect(fullLogo.getAttribute("src")).toContain("kitob-logo-editable.svg");
    expect(fullLogo.getAttribute("alt")).toBe(en.brand.logoAlt);
    expect(emblem.getAttribute("src")).toContain("kitob-emblem-editable.svg");
    expect(emblem.getAttribute("alt")).toBe(en.brand.emblemAlt);

    useThemeStore.getState().setTheme("dark");

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <BrandLogo variant="full" size="md" />
        <BrandLogo variant="emblem" size="sm" />
      </I18nextProvider>,
    );

    const fullLogoDark = view.getAllByRole("img")[0];
    expect(fullLogoDark.getAttribute("src")).toContain("kitob-logo-dark.svg");

    const containers = view.getAllByTestId("brand-logo");
    for (const container of containers) {
      expect(container.className).toContain("bg-transparent");
      expect(container.className).not.toContain("dark:bg-brand-plate");
    }
  });

  it("calculates sidebar dimensions with protected K-height clear space", () => {
    const i18n = createTestI18n("en");
    const view = render(
      <I18nextProvider i18n={i18n}>
        <BrandLogo size="sidebar" />
      </I18nextProvider>,
    );

    const container = view.getByTestId("brand-logo");
    expect(container.style.width).toBe("208px");
    expect(container.style.aspectRatio).toBe(`${(BRAND_DIMENSIONS.logo.aspectRatio + 2 * BRAND_DIMENSIONS.logo.clearSpaceRatio) / (1 + 2 * BRAND_DIMENSIONS.logo.clearSpaceRatio)} / 1`);
  });

  it("applies canonical K-height clear-space wrapper geometry to BrandAnimatedLogo", () => {
    const i18n = createTestI18n("en");
    const view = render(
      <I18nextProvider i18n={i18n}>
        <BrandAnimatedLogo maxWidth={500} />
      </I18nextProvider>,
    );

    const container = view.getByTestId("brand-animated-logo");
    const expectedOuterRatio =
      (BRAND_DIMENSIONS.logo.aspectRatio + 2 * BRAND_DIMENSIONS.logo.clearSpaceRatio) /
      (1 + 2 * BRAND_DIMENSIONS.logo.clearSpaceRatio);
    expect(container.style.aspectRatio).toBe(`${expectedOuterRatio} / 1`);
    expect(container.style.maxWidth).toBe("500px");

    const staticImg = container.querySelector('[data-logo-kind="static"]') as HTMLImageElement;
    const loopImg = container.querySelector('[data-logo-kind="loop"]') as HTMLImageElement;

    expect(staticImg).not.toBeNull();
    expect(loopImg).not.toBeNull();
    expect(staticImg.className).toContain("motion-reduce:block");
    expect(loopImg.className).toContain("motion-reduce:hidden");
    expect(staticImg.style.top).toBe(
      `${(BRAND_DIMENSIONS.logo.clearSpaceRatio / (1 + 2 * BRAND_DIMENSIONS.logo.clearSpaceRatio)) * 100}%`,
    );
    expect(loopImg.style.top).toBe(
      `${(BRAND_DIMENSIONS.logo.clearSpaceRatio / (1 + 2 * BRAND_DIMENSIONS.logo.clearSpaceRatio)) * 100}%`,
    );
  });

  it("renders shared animated book activity indicator with accessible status semantics", () => {
    const i18n = createTestI18n("en");
    const view = render(
      <I18nextProvider i18n={i18n}>
        <BrandActivityIndicator size={32} />
      </I18nextProvider>,
    );

    const indicator = view.getByTestId("brand-activity-indicator");
    expect(indicator.getAttribute("role")).toBe("status");
    expect(indicator.getAttribute("aria-label")).toBe(en.loading);

    const loopImg = indicator.querySelector('[data-indicator-kind="loop"]');
    const staticImg = indicator.querySelector('[data-indicator-kind="static"]');

    expect(loopImg?.getAttribute("src")).toContain("kitob-icon-loop.svg");
    expect(staticImg?.getAttribute("src")).toContain("kitob-icon-static.svg");
    expect(loopImg?.className).toContain("motion-reduce:hidden");
    expect(staticImg?.className).toContain("motion-reduce:block");
    expect(loopImg?.getAttribute("aria-hidden")).toBe("true");
    expect(staticImg?.getAttribute("aria-hidden")).toBe("true");

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <BrandActivityIndicator size={16} aria-hidden="true" />
      </I18nextProvider>,
    );

    const hiddenIndicator = view.getByTestId("brand-activity-indicator");
    expect(hiddenIndicator.getAttribute("role")).toBeNull();
    expect(hiddenIndicator.getAttribute("aria-hidden")).toBe("true");
  });

  it("integrates shared activity indicator into button without layout shift and duplicate announcements", async () => {
    const i18n = createTestI18n("en");
    const submit = vi.fn();
    const user = userEvent.setup();

    const view = render(
      <I18nextProvider i18n={i18n}>
        <Button onClick={submit} loading>Submit</Button>
      </I18nextProvider>,
    );

    const button = view.getByRole("button");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("disabled")).not.toBeNull();
    expect(button.textContent).toContain("Submit");

    const indicator = view.getByTestId("brand-activity-indicator");
    expect(indicator.getAttribute("aria-hidden")).toBe("true");

    await user.click(button);
    expect(submit).not.toHaveBeenCalled();

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <Button onClick={submit}>Submit</Button>
      </I18nextProvider>,
    );

    expect(view.queryByTestId("brand-activity-indicator")).toBeNull();
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button.getAttribute("disabled")).toBeNull();
  });

  it("keeps idle buttons compact when loading is omitted and preserves stable slots when loading is passed", () => {
    const i18n = createTestI18n("en");
    const viewCompact = render(
      <I18nextProvider i18n={i18n}>
        <Button>Compact idle</Button>
      </I18nextProvider>,
    );

    const compactButton = viewCompact.getByRole("button");
    expect(compactButton.children.length).toBe(0);
    expect(compactButton.textContent).toBe("Compact idle");
    viewCompact.unmount();

    const view = render(
      <I18nextProvider i18n={i18n}>
        <Button loading={false}>Save</Button>
      </I18nextProvider>,
    );

    const buttonIdle = view.getByRole("button");
    const childrenIdle = Array.from(buttonIdle.children);
    expect(childrenIdle.length).toBe(3);
    expect(childrenIdle[0].className).toContain("w-[23px]");
    expect(childrenIdle[2].className).toContain("w-[23px]");

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <Button loading={true}>Save</Button>
      </I18nextProvider>,
    );

    const buttonPending = view.getByRole("button");
    const childrenPending = Array.from(buttonPending.children);
    expect(childrenPending.length).toBe(3);
    expect(childrenPending[0].className).toContain("w-[23px]");
    expect(childrenPending[2].className).toContain("w-[23px]");
    expect(childrenPending[0].querySelector('[data-testid="brand-activity-indicator"]')).not.toBeNull();

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <Button loading={false}>
          <span data-testid="icon">icon</span>
          <span>Save changes</span>
        </Button>
      </I18nextProvider>,
    );

    const compoundIdle = view.getByRole("button");
    const compoundChildrenIdle = Array.from(compoundIdle.children);
    expect(compoundChildrenIdle.length).toBe(3);
    expect(compoundChildrenIdle[0].className).toContain("w-[23px]");
    expect(compoundChildrenIdle[2].className).toContain("w-[23px]");

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <Button loading={true}>
          <span data-testid="icon">icon</span>
          <span>Save changes</span>
        </Button>
      </I18nextProvider>,
    );

    const compoundPending = view.getByRole("button");
    const compoundChildrenPending = Array.from(compoundPending.children);
    expect(compoundChildrenPending.length).toBe(3);
    expect(compoundChildrenPending[0].className).toContain("w-[23px]");
    expect(compoundChildrenPending[2].className).toContain("w-[23px]");
    expect(compoundChildrenPending[0].querySelector('[data-testid="brand-activity-indicator"]')).not.toBeNull();
  });

  it("renders accessible loading announcement and book indicator in FullscreenSpinner", () => {
    const i18n = createTestI18n("en");
    const view = render(
      <I18nextProvider i18n={i18n}>
        <FullscreenSpinner />
      </I18nextProvider>,
    );

    const status = view.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toContain(en.loading);

    const indicator = view.getByTestId("brand-activity-indicator");
    expect(indicator).not.toBeNull();
  });

  it("renders animated loop in AuthFrame when composition is animated-loop and static emblem when static-emblem", () => {
    const i18n = createTestI18n("en");

    const view = render(
      <I18nextProvider i18n={i18n}>
        <AuthFrame
          editorialTitle="Chapter"
          editorialDescription="Description"
          composition="animated-loop"
        >
          <div>Form content</div>
        </AuthFrame>
      </I18nextProvider>,
    );

    expect(view.getByTestId("brand-animated-logo")).not.toBeNull();

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <AuthFrame
          editorialTitle="Chapter"
          editorialDescription="Description"
          composition="static-emblem"
        >
          <div>Form content</div>
        </AuthFrame>
      </I18nextProvider>,
    );

    expect(view.queryByTestId("brand-animated-logo")).toBeNull();
    const staticEmblems = view.getAllByTestId("brand-logo");
    expect(staticEmblems.length).toBeGreaterThan(0);
  });

  it("switches animated logo between light and dark loop assets via theme store", () => {
    const i18n = createTestI18n("en");

    const view = render(
      <I18nextProvider i18n={i18n}>
        <BrandAnimatedLogo maxWidth={500} />
      </I18nextProvider>,
    );

    const logo = view.getByTestId("brand-animated-logo");
    const loopLight = logo.querySelector('[data-logo-kind="loop"]');
    const staticLight = logo.querySelector('[data-logo-kind="static"]');
    expect(loopLight?.getAttribute("src")).toContain("kitob-logo-loop.svg");
    expect(staticLight?.getAttribute("src")).toContain("kitob-logo-editable.svg");

    useThemeStore.getState().setTheme("dark");

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <BrandAnimatedLogo maxWidth={500} />
      </I18nextProvider>,
    );

    const loopDark = logo.querySelector('[data-logo-kind="loop"]');
    const staticDark = logo.querySelector('[data-logo-kind="static"]');
    expect(loopDark?.getAttribute("src")).toContain("kitob-logo-loop-dark.svg");
    expect(staticDark?.getAttribute("src")).toContain("kitob-logo-dark.svg");
  });
});

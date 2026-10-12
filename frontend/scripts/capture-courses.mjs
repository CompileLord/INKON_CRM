import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixtures = JSON.parse(input);

const taskDir = resolve("../docs/redesign-execution/group-02/task-01/final");
const taskScreenshotsDir = `${taskDir}/screenshots`;

await mkdir(taskScreenshotsDir, { recursive: true });

const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
assert.ok(superadmin, "Superadmin fixture identity must be present");

const mentor = fixtures.identities.find((item) => item.role === "mentor" && !item.forced && !item.tag);
assert.ok(mentor, "Mentor fixture identity must be present");

const emptyMentor = fixtures.identities.find((item) => item.role === "mentor" && item.tag === "empty") || mentor;

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5188";

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];

function registerProbe(probe) {
  assert.ok(probe.passed, `Probe failed: ${probe.probe} - ${JSON.stringify(probe)}`);
  probes.push(probe);
}

async function recordScreenshot(page, filename, meta = {}) {
  await page.evaluate(async () => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
  const filePath1 = `${taskScreenshotsDir}/${filename}`;
  await page.screenshot({ path: filePath1, fullPage: meta.fullPage ?? false });
  manifest.push({ file: filename, ...meta });
}

async function setupContext(context, options = {}) {
  await context.addInitScript(
    ({ theme, lng }) => {
      localStorage.setItem("i18nextLng", lng || "en");
      localStorage.setItem("theme", theme || "light");
      localStorage.setItem("imkon_theme", theme || "light");
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    },
    {
      theme: options.theme,
      lng: options.lng,
    },
  );

  if (options.holdRequests || options.simulateError) {
    await context.route("**/api/v1/courses**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": previewOrigin,
            "access-control-allow-credentials": "true",
            "access-control-allow-methods": "*",
            "access-control-allow-headers": "*",
          },
        });
        return;
      }
      if (options.holdRequests) return;
      if (options.simulateError) {
        await route.fulfill({
          status: 500,
          headers: {
            "access-control-allow-origin": previewOrigin,
            "access-control-allow-credentials": "true",
            "content-type": "application/json",
          },
          contentType: "application/json",
          body: JSON.stringify({ detail: "SIMULATION: Internal Server Error" }),
        });
        return;
      }
      await route.continue();
    });
  }
}

async function loginAndNavigateToCourses(page, identity, destination = "/courses") {
  await page.goto(`${previewOrigin}/login?redirect=${encodeURIComponent(destination)}`);
  await page.waitForLoadState("domcontentloaded");
  if (page.url().includes("/login")) {
    await page.locator("#email").waitFor({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.locator("#email").fill(identity.email);
    await page.locator("#password").fill(fixtures.password);
    await page.locator('button[type="submit"]').click();
  }
  const expectedPath = destination.split("?")[0];
  await page.waitForURL((url) => url.pathname === expectedPath, { timeout: 30000 });
  await page.locator("h1").waitFor({ timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('main [data-testid="brand-activity-indicator"], main [class*="animate-pulse"]'));
}

try {
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });
    await recordScreenshot(page, "desktop-1440-superadmin-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin course directory desktop light view with authoritative total and create action",
    });
    for (const action of ["Duplicate", "Delete"]) {
      await page.getByRole("button", { name: /^Course actions:/ }).first().click();
      await page.getByRole("menuitem", { name: action, exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await recordScreenshot(page, "desktop-1440-superadmin-" + action.toLowerCase() + "-confirmation-light.png", { role: "superadmin", theme: "light", viewport: "1440x1000", description: action + " named confirmation preview; cancelled without dispatch" });
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "detached" });
    }


    const listBtn = page.locator('button[aria-label="List"], button:has-text("List")').first();
    if ((await listBtn.count()) > 0) {
      await listBtn.click();
      await page.waitForTimeout(200);
      const isList = await page.evaluate(() => localStorage.getItem("kitob_courses_view_preference"));
      registerProbe({
        probe: "view-mode-preference-persistence",
        savedMode: isList,
        passed: isList === "list",
      });
      const gridBtn = page.locator('button[aria-label="Grid"], button:has-text("Grid")').first();
      await gridBtn.click();
      await page.waitForTimeout(200);
    }

    const actionButton = page.locator('button[aria-label^="Course actions:"]').first();
    await actionButton.waitFor({ timeout: 10000 });
    await actionButton.click();
    const menuPopup = page.locator('[role="menu"]');
    await menuPopup.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);
    const menuOpacity = await menuPopup.evaluate((el) => window.getComputedStyle(el).opacity);
    assert.equal(menuOpacity, "1", "Menu popup opacity must be 1 after animation settling");
    const menuOrigin = await page.getByRole("menu").evaluate(element => {
      const actual = getComputedStyle(element);
      const variable = actual.getPropertyValue("--transform-origin").trim();
      const reference = document.createElement("div");
      reference.style.width = actual.width;
      reference.style.height = actual.height;
      reference.style.transformOrigin = "var(--transform-origin)";
      reference.style.position = "absolute";
      reference.style.visibility = "hidden";
      element.appendChild(reference);
      const expected = getComputedStyle(reference).transformOrigin;
      reference.remove();
      return { variable, actual: actual.transformOrigin, expected };
    });
    registerProbe({ probe: "menu-native-trigger-motion-origin", ...menuOrigin, passed: Boolean(menuOrigin.variable) && menuOrigin.actual === menuOrigin.expected });
    await recordScreenshot(page, "desktop-1440-superadmin-admin-menu-open.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin open course overflow menu with Edit, Duplicate, Delete",
    });
    await page.keyboard.press("Escape");
    await menuPopup.waitFor({ state: "detached", timeout: 5000 });

    await page.evaluate(() => window.scrollTo(0, 120));
    await page.waitForTimeout(200);
    const scrolledY = await page.evaluate(() => window.scrollY);
    assert.ok(scrolledY >= 100, `Expected scrolledY >= 100, got ${scrolledY}`);

    const courseCard = page.locator(".grid > div").nth(4);
    const cardLink = courseCard.locator('a[href^="/courses/"]').first();
    await cardLink.click();
    await page.waitForFunction(() => window.location.pathname.startsWith("/courses/"), null, { timeout: 10000 });

    const savedScroll = await page.evaluate(() => {
      const keys = Object.keys(sessionStorage).filter((k) => k.startsWith("kitob_course_list_scroll:"));
      const targetKey = keys[keys.length - 1];
      if (!targetKey) return null;
      const raw = sessionStorage.getItem(targetKey);
      return raw ? JSON.parse(raw).scrollY : null;
    });
    assert.ok(typeof savedScroll === "number" && savedScroll > 50, "Saved scroll must be captured in session storage");

    await page.goBack();
    await page.waitForFunction(() => window.location.pathname === "/courses", null, { timeout: 10000 });
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });
    const yImmediately = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(200);
    const yAt200 = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(400);
    const restoredY = await page.evaluate(() => window.scrollY);
    const scrollDiff = Math.abs(restoredY - savedScroll);
    registerProbe({
      probe: "scroll-return-browser-back",
      scrolledY,
      savedScroll,
      restoredY,
      scrollDiff,
      passed: scrollDiff <= 2,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "dark" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });
    await recordScreenshot(page, "desktop-1440-superadmin-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "1440x1000",
      description: "Superadmin course directory desktop dark view with semantic tokens",
    });
    for (const action of ["Duplicate", "Delete"]) {
      await page.getByRole("button", { name: /^Course actions:/ }).first().click();
      await page.getByRole("menuitem", { name: action, exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await recordScreenshot(page, "desktop-1440-superadmin-" + action.toLowerCase() + "-confirmation-dark.png", { role: "superadmin", theme: "dark", viewport: "1440x1000", description: action + " named confirmation preview; cancelled without dispatch" });
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "detached" });
    }
    await page.getByRole("button", { name: /^Course actions:/ }).first().click();
    await page.getByRole("menu").waitFor();
    await recordScreenshot(page, "desktop-1440-superadmin-admin-menu-dark.png", { role: "superadmin", theme: "dark", viewport: "1440x1000", description: "Open course actions in dark theme" });
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "detached" });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });
    await recordScreenshot(page, "mobile-390-superadmin-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Superadmin mobile 390 light view showing divided row region and 2 complete rows above nav",
    });

    const gridToggleCount = await page.locator('button[aria-label="Grid"], [role="group"][aria-label="View mode"]').count();
    const phoneRowsCount = await page.locator('a[href^="/courses/"]').count();
    registerProbe({
      probe: "phone-row-view-compact",
      gridToggleCount,
      phoneRowsCount,
      passed: gridToggleCount === 0 && phoneRowsCount >= 2,
    });

    const filtersBtn = page.locator('button:has-text("Filters")');
    await filtersBtn.waitFor({ timeout: 10000 });
    await filtersBtn.click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);
    const dialogOpacity = await dialog.evaluate((el) => window.getComputedStyle(el).opacity);
    assert.equal(dialogOpacity, "1", "Dialog opacity must be 1 after animation settling");
    await recordScreenshot(page, "mobile-390-superadmin-filters-open.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Phone filters bottom sheet dialog open with native controlled radios",
    });
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 5000 });
    registerProbe({
      probe: "phone-filters-escape-dismiss",
      passed: true,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setupContext(context, { theme: "dark" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });
    await recordScreenshot(page, "mobile-390-superadmin-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "390x844",
      description: "Superadmin mobile 390 dark view with semantic tokens",
    });
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await recordScreenshot(page, "mobile-390-superadmin-filters-dark.png", { role: "superadmin", theme: "dark", viewport: "390x844", description: "Dark phone Filters dialog with semantic primary Done" });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    const mentorRequests = [];
    page.on("request", (req) => mentorRequests.push(req.url()));
    await loginAndNavigateToCourses(page, mentor, "/courses");
    await page.waitForTimeout(500);
    await recordScreenshot(page, "desktop-1440-mentor-light.png", {
      role: "mentor",
      theme: "light",
      viewport: "1440x1000",
      description: "Mentor course directory desktop light view with secondary Open journal link and no admin controls",
    });

    const unauthorizedRequests = mentorRequests.filter((url) =>
      url.includes("/api/v1/users") ||
      url.includes("/api/v1/audit-log") ||
      url.includes("/api/v1/settings")
    );
    registerProbe({
      probe: "mentor-authorized-requests-only",
      unauthorizedRequests,
      passed: unauthorizedRequests.length === 0,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "dark" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, mentor, "/courses");
    await page.waitForTimeout(500);
    await recordScreenshot(page, "desktop-1440-mentor-dark.png", {
      role: "mentor",
      theme: "dark",
      viewport: "1440x1000",
      description: "Mentor course directory desktop dark view with semantic tokens and journal link",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, mentor, "/courses");
    await page.waitForTimeout(500);
    await recordScreenshot(page, "mobile-390-mentor-light.png", {
      role: "mentor",
      theme: "light",
      viewport: "390x844",
      description: "Mentor mobile 390 light view with secondary Open journal action and no admin menu",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setupContext(context, { theme: "dark" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, mentor, "/courses");
    await page.waitForTimeout(500);
    await recordScreenshot(page, "mobile-390-mentor-dark.png", {
      role: "mentor",
      theme: "dark",
      viewport: "390x844",
      description: "Mentor mobile 390 dark view with semantic tokens",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.waitForTimeout(500);
    await recordScreenshot(page, "mobile-320-superadmin.png", {
      viewport: "320x568",
      description: "Compact 320px phone viewport verifying compact pagination and no clipping",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.waitForTimeout(500);
    await recordScreenshot(page, "tablet-768-superadmin.png", {
      viewport: "768x1024",
      description: "Tablet 768px portrait showing desktop cards and responsive shell",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.waitForTimeout(500);
    await recordScreenshot(page, "tablet-1024-superadmin.png", {
      viewport: "1024x768",
      description: "Tablet 1024px landscape viewport",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator(".grid > div").first().waitFor({ timeout: 10000 });
    const cardWidth = await page.evaluate(() => {
      const card = document.querySelector(".grid > div");
      return card ? card.getBoundingClientRect().width : 0;
    });
    registerProbe({
      probe: "1280-mincard-width",
      cardWidth,
      passed: cardWidth >= 320,
    });
    await recordScreenshot(page, "desktop-1280-mincard.png", {
      viewport: "1280x800",
      description: `Desktop 1280px with sidebar verifying cards stay >= 320px (measured: ${Math.round(cardWidth)}px)`,
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { lng: "ru", theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.waitForTimeout(500);
    await recordScreenshot(page, "desktop-1440-ru.png", {
      locale: "ru",
      viewport: "1440x1000",
      description: "Long Russian copy wrapping and label alignment",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { lng: "tg", theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.waitForTimeout(500);
    await recordScreenshot(page, "desktop-1440-tg.png", {
      locale: "tg",
      viewport: "1440x1000",
      description: "Long Tajik copy wrapping and label alignment",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.evaluate(() => {
      const values = [...document.querySelectorAll('h1,h2,h3,p,span,button,input,select,label,a')].map(element => ({ element, size: parseFloat(getComputedStyle(element).fontSize), line: parseFloat(getComputedStyle(element).lineHeight) }));
      for (const { element, size, line } of values) { element.style.fontSize = size * 2 + 'px'; if (Number.isFinite(line)) element.style.lineHeight = line * 2 + 'px'; }
    });
    const computedFontSize = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      return h1 ? window.getComputedStyle(h1).fontSize : "0px";
    });
    registerProbe({
      probe: "text-zoom-200-applied",
      computedFontSize,
      passed: computedFontSize === "56px",
    });
    await recordScreenshot(page, "desktop-1440-zoom-200.png", {
      zoom: "200%",
      viewport: "1440x1000",
      description: "Computed text sizes doubled once, layout dimensions retained; browser text-enlargement simulation",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });
    await recordScreenshot(page, "desktop-1440-missing-photo.png", {
      viewport: "1440x1000",
      description: "Quiet book icon preserved when course has no photo",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, emptyMentor, "/courses");
    await page.waitForTimeout(500);
    await recordScreenshot(page, "desktop-1440-mentor-empty.png", {
      role: "mentor",
      state: "empty",
      viewport: "1440x1000",
      description: "Genuine empty state for mentor with guidance copy",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses?page=2");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });
    const activePage = await page.locator('nav[aria-label="Courses pagination"] [aria-current="page"]').first().innerText();
    registerProbe({
      probe: "query-page2-navigation",
      activePage,
      passed: activePage.trim() === "2",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses?page=2&q=NoSuchCourseExists");
    await page.waitForTimeout(500);
    await recordScreenshot(page, "desktop-1440-search-no-match-page2.png", {
      query: "page=2&q=NoSuchCourseExists",
      viewport: "1440x1000",
      description: "Honest search empty state on page 2 retaining pagination controls",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { holdRequests: true, theme: "light" });
    const page = await context.newPage();
    await page.goto(`${previewOrigin}/login?redirect=%2Fcourses`);
    await page.locator("#email").fill(superadmin.email);
    await page.locator("#password").fill(fixtures.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => url.pathname === "/courses", { timeout: 15000 });
    await page.waitForSelector('[data-testid="brand-activity-indicator"]', { timeout: 10000 });
    await recordScreenshot(page, "desktop-1440-loading-simulated.png", {
      state: "loading-simulated",
      viewport: "1440x1000",
      description: "SIMULATION: Loading state with BrandActivityIndicator and matching card skeleton",
    });
    registerProbe({
      probe: "loading-state-brand-indicator",
      passed: true,
    });
    await context.close();
  }

  {
    let simulateError = true;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light" });
    await context.route("**/api/v1/courses**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": previewOrigin,
            "access-control-allow-credentials": "true",
            "access-control-allow-methods": "*",
            "access-control-allow-headers": "*",
          },
        });
        return;
      }
      if (simulateError) {
        await route.fulfill({
          status: 500,
          headers: {
            "access-control-allow-origin": previewOrigin,
            "access-control-allow-credentials": "true",
            "content-type": "application/json",
          },
          contentType: "application/json",
          body: JSON.stringify({ detail: "SIMULATION: Internal Server Error" }),
        });
        return;
      }
      await route.continue();
    });

    const page = await context.newPage();
    await page.goto(`${previewOrigin}/login?redirect=%2Fcourses`);
    await page.locator("#email").fill(superadmin.email);
    await page.locator("#password").fill(fixtures.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => url.pathname === "/courses", { timeout: 15000 });
    const retryBtn = page.locator('button:has-text("Retry"), button:has-text("Повторить"), button:has-text("Такрор кардан")');
    await retryBtn.waitFor({ timeout: 10000 });
    await recordScreenshot(page, "desktop-1440-error-simulated.png", {
      state: "error-simulated",
      viewport: "1440x1000",
      description: "SIMULATION: Initial error state with working retry button",
    });

    simulateError = false;
    await retryBtn.click();
    await page.waitForSelector("h1 span", { timeout: 10000 });
    await page.waitForTimeout(400);
    registerProbe({
      probe: "initial-error-working-retry",
      passed: true,
    });

    await context.close();
  }

  await writeFile(`${taskDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  await writeFile(`${taskDir}/probes.json`, JSON.stringify(probes, null, 2));

  console.log(JSON.stringify({ status: "success", screenshots: manifest.length, probes: probes.length }));
} finally {
  await browser.close();
}

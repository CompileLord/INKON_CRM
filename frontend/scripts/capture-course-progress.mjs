import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import readline from "node:readline";

let input = "";
const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) {
  input = line;
  break;
}
const fixtures = JSON.parse(input);

const taskDir = resolve(
  process.env.KITOB_TASK_DIR ||
  "../docs/redesign-execution/group-02/progress/ui/evidence"
);
const taskScreenshotsDir = `${taskDir}/screenshots`;

await mkdir(taskScreenshotsDir, { recursive: true });

const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
const mentor = fixtures.identities.find((item) => item.role === "mentor" && !item.forced && !item.tag);
assert.ok(superadmin, "Superadmin fixture identity must be present");
assert.ok(mentor, "Mentor fixture identity must be present");

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5193";
const apiOrigin = fixtures.api_origin ? `${fixtures.api_origin}/api/v1` : "http://127.0.0.1:18085/api/v1";

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];

function registerProbe(probe) {
  assert.ok(probe.passed, `Probe failed: ${probe.probe} - ${JSON.stringify(probe)}`);
  probes.push(probe);
}

async function recordScreenshot(page, filename, meta = {}) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {}))
    );
  });
  const filePath = `${taskScreenshotsDir}/${filename}`;
  await page.screenshot({ path: filePath, fullPage: meta.fullPage ?? false });
  manifest.push({ file: filename, ...meta });
}

async function setupContext(context, options = {}) {
  const apiBase = apiOrigin.replace("/api/v1", "");
  await context.route("http://localhost:8000/api/v1/**", async (route) => {
    const url = route.request().url().replace("http://localhost:8000", apiBase);
    try {
      const response = await route.fetch({ url });
      await route.fulfill({ response });
    } catch {
      await route.abort();
    }
  });

  await context.route("http://127.0.0.1:8000/api/v1/**", async (route) => {
    const url = route.request().url().replace("http://127.0.0.1:8000", apiBase);
    try {
      const response = await route.fetch({ url });
      await route.fulfill({ response });
    } catch {
      await route.abort();
    }
  });

  await context.addInitScript(
    ({ theme, lng }) => {
      localStorage.setItem("i18nextLng", lng || "en");
      localStorage.setItem("theme", theme || "light");
      localStorage.setItem("imkon_theme", theme || "light");
      if (typeof document !== "undefined" && document.documentElement) {
        if (theme === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
    },
    {
      theme: options.theme,
      lng: options.lng,
    }
  );
}

async function loginAndNavigateToCourseProgress(page, identity, courseId = 1) {
  await page.goto(`${previewOrigin}/login`);
  await page.waitForLoadState("domcontentloaded");
  await page.locator("#email").waitFor({ timeout: 15000 });
  await page.locator("#email").fill(identity.email);
  await page.locator("#password").fill(fixtures.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });

  await page.goto(`${previewOrigin}/courses/${courseId}?tab=progress`);
  await page.waitForLoadState("domcontentloaded");
  await page.locator('button[role="tab"]').first().waitFor({ timeout: 15000 });

  const progressTab = page.locator('button[role="tab"]').filter({ hasText: /Progress|Успеваемость|Пешрафт/i });
  await progressTab.waitFor({ timeout: 10000 });
  const isSelected = await progressTab.getAttribute("aria-selected");
  if (isSelected !== "true") {
    await progressTab.click();
  }

  await page.waitForFunction(
    () => !document.querySelector('main [data-testid="brand-activity-indicator"], main [class*="animate-pulse"]'),
    { timeout: 15000 }
  );
  await page.waitForLoadState("networkidle");
}

try {
  const adminDesktopContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
  });
  await setupContext(adminDesktopContext, { theme: "light", lng: "en" });
  const adminDesktopPage = await adminDesktopContext.newPage();
  await loginAndNavigateToCourseProgress(adminDesktopPage, superadmin, 1);

  await recordScreenshot(adminDesktopPage, "01-desktop-superadmin-course-progress-light.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "superadmin",
    state: "loaded",
    simulation: false,
    description: "Desktop superadmin course progress neutral table view in light theme",
  });

  const tableRegion = adminDesktopPage.locator('div[role="region"][aria-label*="progress" i], div[role="region"]');
  const regionCount = await tableRegion.count();
  const hasRegion = regionCount > 0;
  const isTabFocusable = hasRegion && (await tableRegion.first().getAttribute("tabindex")) === "0";

  const stickyTh = adminDesktopPage.locator("table th.sticky").first();
  const stickyBox = await stickyTh.boundingBox();
  const isStickyValid = stickyBox !== null && stickyBox.width >= 220 && stickyBox.width <= 260;

  const tableRows = adminDesktopPage.locator("tbody tr");
  const rowCount = await tableRows.count();
  const firstRowBox = rowCount > 0 ? await tableRows.first().boundingBox() : null;
  const isRowHeightValid = firstRowBox !== null && firstRowBox.height >= 52;

  const stickyBoxBefore = await stickyTh.boundingBox();
  const xBefore = stickyBoxBefore?.x ?? 0;

  const horizontalScrollable = await tableRegion.first().evaluate((el) => {
    const hasScroll = el.scrollWidth > el.clientWidth;
    el.scrollLeft = 350;
    const scrolled = el.scrollLeft > 0;
    return { hasScroll, scrolled, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });

  await adminDesktopPage.waitForTimeout(100);
  const stickyBoxAfter = await stickyTh.boundingBox();
  const xAfter = stickyBoxAfter?.x ?? 0;
  const isPinnedUnderScroll = Math.abs(xAfter - xBefore) <= 1;

  await tableRegion.first().evaluate((el) => { el.scrollLeft = 0; });
  await adminDesktopPage.waitForTimeout(50);

  await tableRegion.first().focus();
  await adminDesktopPage.keyboard.press("Tab");
  const activeLinkInfo = await adminDesktopPage.evaluate(() => {
    const el = document.activeElement;
    return {
      tagName: el?.tagName || "",
      href: el?.getAttribute("href") || "",
      text: el?.textContent?.trim() || "",
    };
  });
  const hasKeyboardStudentLinkFocus =
    activeLinkInfo.tagName === "A" && activeLinkInfo.href.includes("/students/");

  registerProbe({
    probe: "desktop_table_geometry_and_accessibility",
    passed:
      hasRegion &&
      isTabFocusable &&
      isStickyValid &&
      isRowHeightValid &&
      horizontalScrollable.hasScroll &&
      isPinnedUnderScroll &&
      hasKeyboardStudentLinkFocus,
    details: {
      hasRegion,
      isTabFocusable,
      stickyWidth: stickyBox?.width,
      firstRowHeight: firstRowBox?.height,
      rowCount,
      isPinnedUnderScroll,
      xBefore,
      xAfter,
      hasKeyboardStudentLinkFocus,
      activeLinkInfo,
      ...horizontalScrollable,
    },
  });

  const cellScores = await adminDesktopPage.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("tbody tr"));
    return rows.map((row) => {
      const name = row.querySelector("th a")?.textContent?.trim() || "";
      const cells = Array.from(row.querySelectorAll("td")).map((td) => ({
        text: td.textContent?.trim() || "",
        score: td.querySelector("span[aria-label]")?.getAttribute("aria-label") || "",
      }));
      return { name, cells };
    });
  });

  const rowWithZero = cellScores.find((r) => r.cells.some((c) => c.text.includes("0%") && c.text.includes("0 / 70")));
  const rowWithBonus = cellScores.find((r) => r.cells.some((c) => c.text.includes("110%") && c.text.includes("77 / 70")));
  const rowWithZeroMax = cellScores.find((r) => r.cells.some((c) => c.text.includes("—") && c.text.includes("10 / 0")));
  const hasDashUnavailable = cellScores.some((r) => r.cells.some((c) => c.text === "—"));

  const hasExactZero = Boolean(rowWithZero);
  const hasExactBonus = Boolean(rowWithBonus);
  const hasExactZeroMax = Boolean(rowWithZeroMax);

  const pageContent = await adminDesktopPage.content();
  const hasProvenanceNotice = pageContent.includes("grading status is unavailable") || pageContent.includes("Recorded totals");

  registerProbe({
    probe: "semantics_exact_cells_and_provenance",
    passed: hasExactZero && hasExactBonus && hasExactZeroMax && hasDashUnavailable && hasProvenanceNotice,
    details: {
      hasExactZero,
      hasExactBonus,
      hasExactZeroMax,
      hasDashUnavailable,
      hasProvenanceNotice,
      sampleRows: cellScores.slice(0, 3),
    },
  });

  await tableRegion.first().focus();
  await recordScreenshot(adminDesktopPage, "10-desktop-keyboard-focus-region.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "superadmin",
    state: "focused",
    simulation: false,
    description: "Desktop keyboard focus ring on horizontal scrollable comparison region",
  });

  const searchInput = adminDesktopPage.locator('input[placeholder*="student" i]').first();
  await searchInput.fill("Muhammadali");
  await adminDesktopPage.waitForTimeout(300);
  await recordScreenshot(adminDesktopPage, "13-desktop-search-filtered-view.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "superadmin",
    state: "filtered",
    simulation: false,
    description: "Desktop progress table with search filter applied",
  });
  await searchInput.fill("");
  await adminDesktopPage.waitForTimeout(200);

  await searchInput.fill("NonexistentQueryMatch999");
  await adminDesktopPage.waitForTimeout(300);
  const noMatchContent = await adminDesktopPage.locator("body").innerText();
  const hasNoMatchNotice = /No students match|Не найдено|Ягон донишҷӯ/i.test(noMatchContent);
  const resetBtn = adminDesktopPage.locator('button').filter({ hasText: /Reset search|Сбросить поиск|Тоза кардани/i });
  const hasResetBtn = (await resetBtn.count()) > 0;

  await recordScreenshot(adminDesktopPage, "23-desktop-progress-no-search-matches.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "superadmin",
    state: "empty_search",
    simulation: false,
    description: "Real rendered no matches empty state when search filters out all students",
  });

  if (hasResetBtn) {
    await resetBtn.first().click();
    await adminDesktopPage.waitForTimeout(300);
  } else {
    await searchInput.fill("");
  }

  await adminDesktopPage.goto(`${previewOrigin}/courses/4?tab=progress`);
  await adminDesktopPage.waitForLoadState("domcontentloaded");
  await adminDesktopPage.waitForFunction(
    () => !document.querySelector('main [data-testid="brand-activity-indicator"], main [class*="animate-pulse"]'),
    { timeout: 15000 }
  );
  await adminDesktopPage.waitForTimeout(300);

  const cohortText = await adminDesktopPage.locator("body").innerText();
  const hasEmptyCohortNotice = /No students enrolled|Нет зачисленных|Ҳеҷ донишҷӯ сабти ном/i.test(cohortText);

  await recordScreenshot(adminDesktopPage, "22-desktop-progress-empty-cohort.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "superadmin",
    state: "empty_cohort",
    simulation: false,
    description: "Real rendered empty cohort state when course has no enrolled students",
  });

  await adminDesktopPage.goto(`${previewOrigin}/courses/3?tab=progress`);
  await adminDesktopPage.waitForLoadState("domcontentloaded");
  await adminDesktopPage.waitForFunction(
    () => !document.querySelector('main [data-testid="brand-activity-indicator"], main [class*="animate-pulse"]'),
    { timeout: 15000 }
  );
  await adminDesktopPage.waitForTimeout(300);

  const emptyText = await adminDesktopPage.locator("body").innerText();
  const hasEmptyNotice = /no journal periods|периоды журналов|давраҳои журнал/i.test(emptyText);
  const openJournalLink = adminDesktopPage.locator('a[href*="/journals/3"]').first();
  const hasJournalLink = (await openJournalLink.count()) > 0;

  await recordScreenshot(adminDesktopPage, "14-empty-state-no-periods.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "superadmin",
    state: "empty_periods",
    simulation: false,
    description: "Empty state when course has no journal periods configured",
  });

  registerProbe({
    probe: "empty_state_guidance_and_cta",
    passed: hasEmptyNotice && hasJournalLink && hasEmptyCohortNotice && hasNoMatchNotice,
    details: { hasEmptyNotice, hasJournalLink, hasEmptyCohortNotice, hasNoMatchNotice },
  });

  await adminDesktopContext.close();

  const dataStatesContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
  });
  await setupContext(dataStatesContext, { theme: "light", lng: "en" });
  const dataStatesPage = await dataStatesContext.newPage();

  let simulateLoading = true;
  await dataStatesContext.route("**/api/v1/courses/1/staff-progress", async (route) => {
    if (simulateLoading) {
      await new Promise((r) => setTimeout(r, 2000));
    }
    await route.continue();
  });

  await dataStatesPage.goto(`${previewOrigin}/login`);
  await dataStatesPage.locator("#email").waitFor({ timeout: 15000 });
  await dataStatesPage.locator("#email").fill(superadmin.email);
  await dataStatesPage.locator("#password").fill(fixtures.password);
  await dataStatesPage.locator('button[type="submit"]').click();
  await dataStatesPage.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });

  const progressNavPromise = dataStatesPage.goto(`${previewOrigin}/courses/1?tab=progress`);
  await dataStatesPage.waitForSelector('main [class*="animate-pulse"]', { timeout: 10000 });

  await recordScreenshot(dataStatesPage, "19-desktop-progress-loading-state.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "superadmin",
    state: "loading",
    simulation: true,
    description: "Simulated initial loading skeleton state matching table geometry with brand indicator",
  });

  simulateLoading = false;
  await progressNavPromise;
  await dataStatesPage.waitForFunction(
    () => !document.querySelector('main [data-testid="brand-activity-indicator"], main [class*="animate-pulse"]'),
    { timeout: 15000 }
  );

  let simulateError = true;
  await dataStatesContext.unroute("**/api/v1/courses/1/staff-progress");
  await dataStatesContext.route("**/api/v1/courses/1/staff-progress", async (route) => {
    if (simulateError) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Simulated internal server error" }),
      });
    } else {
      await route.continue();
    }
  });

  await dataStatesPage.goto(`${previewOrigin}/courses/1?tab=progress`);
  await dataStatesPage.waitForLoadState("domcontentloaded");
  const errorTextLocator = dataStatesPage.locator("body");
  await dataStatesPage.waitForFunction(
    () => /Failed to load|Не удалось загрузить|Боргирӣ нашуд/i.test(document.body.innerText),
    { timeout: 15000 }
  );

  const retryButton = dataStatesPage.locator('button').filter({ hasText: /Retry|Повторить|Такрор/i }).first();
  const hasInitialRetryBtn = (await retryButton.count()) > 0;

  await recordScreenshot(dataStatesPage, "20-desktop-progress-initial-error-state.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "superadmin",
    state: "initial_error",
    simulation: true,
    description: "Simulated initial load error state with working retry button",
  });

  simulateError = false;
  await retryButton.click();
  await dataStatesPage.waitForFunction(
    () => document.querySelectorAll("tbody tr").length > 0,
    { timeout: 15000 }
  );
  const recoveredRowCount = await dataStatesPage.locator("tbody tr").count();
  const initialRetryRecovered = recoveredRowCount > 0;

  let simulateRefetchError = true;
  await dataStatesContext.unroute("**/api/v1/courses/1/staff-progress");
  await dataStatesContext.route("**/api/v1/courses/1/staff-progress", async (route) => {
    if (simulateRefetchError) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Simulated background refetch failure" }),
      });
    } else {
      await route.continue();
    }
  });

  const overviewTab = dataStatesPage.locator('button[role="tab"]').filter({ hasText: /Overview|Обзор|Шарҳи умумӣ/i }).first();
  const progressTabBtn = dataStatesPage.locator('button[role="tab"]').filter({ hasText: /Progress|Успеваемость|Пешрафт/i }).first();
  await overviewTab.click();
  await dataStatesPage.waitForTimeout(200);
  await progressTabBtn.click();
  await dataStatesPage.waitForTimeout(400);

  const refetchAlert = dataStatesPage.locator('[role="alert"]').first();
  try {
    await refetchAlert.waitFor({ timeout: 15000 });
  } catch {}
  const hasRefetchAlert = (await refetchAlert.count()) > 0;
  const rowsRetainedOnRefetchError = (await dataStatesPage.locator("tbody tr").count()) > 0;

  await recordScreenshot(dataStatesPage, "21-desktop-progress-refetch-error-retaining-rows.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "superadmin",
    state: "refetch_error",
    simulation: true,
    description: "Simulated background refetch failure retaining loaded rows with inline retry banner",
  });

  simulateRefetchError = false;
  if (hasRefetchAlert) {
    const inlineRetryBtn = refetchAlert.locator("button").first();
    if ((await inlineRetryBtn.count()) > 0) {
      await inlineRetryBtn.click();
      try {
        await refetchAlert.waitFor({ state: "hidden", timeout: 15000 });
      } catch {}
    }
  }

  await dataStatesPage.goto(`${previewOrigin}/courses/4?tab=progress`);
  await dataStatesPage.waitForLoadState("domcontentloaded");
  await dataStatesPage.waitForFunction(
    () => !document.querySelector('main [data-testid="brand-activity-indicator"], main [class*="animate-pulse"]'),
    { timeout: 15000 }
  );
  await dataStatesPage.waitForFunction(
    () => /No students enrolled|Нет зачисленных|Ҳеҷ донишҷӯ сабти ном/i.test(document.body.innerText),
    { timeout: 15000 }
  );

  let simulateEmptyRefetchError = true;
  await dataStatesContext.route("**/api/v1/courses/4/staff-progress", async (route) => {
    if (simulateEmptyRefetchError) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Simulated background refetch failure on empty course" }),
      });
    } else {
      await route.continue();
    }
  });

  const emptyOverviewTab = dataStatesPage.locator('button[role="tab"]').filter({ hasText: /Overview|Обзор|Шарҳи умумӣ/i }).first();
  const emptyProgressTab = dataStatesPage.locator('button[role="tab"]').filter({ hasText: /Progress|Успеваемость|Пешрафт/i }).first();
  await emptyOverviewTab.click();
  await dataStatesPage.waitForTimeout(200);
  await emptyProgressTab.click();

  const emptyRefetchAlert = dataStatesPage.locator('[role="alert"]').first();
  try {
    await emptyRefetchAlert.waitFor({ timeout: 15000 });
  } catch {}
  const hasEmptyRefetchAlert = (await emptyRefetchAlert.count()) > 0;
  const emptyCohortRetainedOnRefetchError = /No students enrolled|Нет зачисленных|Ҳеҷ донишҷӯ сабти ном/i.test(
    await dataStatesPage.locator("body").innerText()
  );

  await recordScreenshot(dataStatesPage, "25-desktop-progress-refetch-error-retaining-empty.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "superadmin",
    state: "refetch_error_empty",
    simulation: true,
    description: "Simulated background refetch failure retaining empty cohort guidance with inline retry banner",
  });

  simulateEmptyRefetchError = false;
  if (hasEmptyRefetchAlert) {
    const emptyInlineRetryBtn = emptyRefetchAlert.locator("button").first();
    if ((await emptyInlineRetryBtn.count()) > 0) {
      await emptyInlineRetryBtn.click();
      try {
        await emptyRefetchAlert.waitFor({ state: "hidden", timeout: 15000 });
      } catch {}
    }
  }
  const emptyCohortRetainedAfterRetry = /No students enrolled|Нет зачисленных|Ҳеҷ донишҷӯ сабти ном/i.test(
    await dataStatesPage.locator("body").innerText()
  );

  registerProbe({
    probe: "four_states_loading_error_and_refetch_retention",
    passed:
      initialRetryRecovered &&
      hasInitialRetryBtn &&
      rowsRetainedOnRefetchError &&
      hasRefetchAlert &&
      hasEmptyRefetchAlert &&
      emptyCohortRetainedOnRefetchError &&
      emptyCohortRetainedAfterRetry,
    details: {
      initialRetryRecovered,
      hasInitialRetryBtn,
      rowsRetainedOnRefetchError,
      recoveredRowCount,
      hasRefetchAlert,
      hasEmptyRefetchAlert,
      emptyCohortRetainedOnRefetchError,
      emptyCohortRetainedAfterRetry,
    },
  });

  await dataStatesContext.close();

  const adminDarkContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
  });
  await setupContext(adminDarkContext, { theme: "dark", lng: "en" });
  const adminDarkPage = await adminDarkContext.newPage();
  await loginAndNavigateToCourseProgress(adminDarkPage, superadmin, 1);

  await recordScreenshot(adminDarkPage, "02-desktop-superadmin-course-progress-dark.png", {
    viewport: "1440x1000",
    theme: "dark",
    role: "superadmin",
    state: "loaded",
    simulation: false,
    description: "Desktop superadmin course progress neutral table view in dark theme",
  });
  await adminDarkContext.close();

  const mentorLightContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
  });
  await setupContext(mentorLightContext, { theme: "light", lng: "en" });
  const mentorLightPage = await mentorLightContext.newPage();

  const requestedUrls = [];
  mentorLightPage.on("request", (req) => requestedUrls.push(req.url()));

  await loginAndNavigateToCourseProgress(mentorLightPage, mentor, 1);

  const staffProgressCalled = requestedUrls.some((u) => u.includes("/courses/1/staff-progress"));
  const privilegedUsersCalled = requestedUrls.some((u) => u.includes("/api/v1/users") && !u.includes("/users/me"));
  const privilegedChargesCalled = requestedUrls.some((u) => u.includes("/api/v1/charges"));

  registerProbe({
    probe: "role_access_and_lazy_staff_reads",
    passed: staffProgressCalled && !privilegedUsersCalled && !privilegedChargesCalled,
    details: { staffProgressCalled, privilegedUsersCalled, privilegedChargesCalled },
  });

  await recordScreenshot(mentorLightPage, "03-desktop-mentor-course-progress-light.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "mentor",
    state: "loaded",
    simulation: false,
    description: "Desktop assigned mentor course progress table in light theme",
  });
  await mentorLightContext.close();

  const mentorDarkContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
  });
  await setupContext(mentorDarkContext, { theme: "dark", lng: "en" });
  const mentorDarkPage = await mentorDarkContext.newPage();
  await loginAndNavigateToCourseProgress(mentorDarkPage, mentor, 1);

  await recordScreenshot(mentorDarkPage, "04-desktop-mentor-course-progress-dark.png", {
    viewport: "1440x1000",
    theme: "dark",
    role: "mentor",
    state: "loaded",
    simulation: false,
    description: "Desktop assigned mentor course progress table in dark theme",
  });
  await mentorDarkContext.close();

  const phoneLightContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
  });
  await setupContext(phoneLightContext, { theme: "light", lng: "en" });
  const phoneLightPage = await phoneLightContext.newPage();
  await loginAndNavigateToCourseProgress(phoneLightPage, superadmin, 1);

  const phoneOrder = await phoneLightPage.evaluate(() => {
    const periodSelect = document.querySelector("div.md\\:hidden select");
    const searchInput = document.querySelector('input[type="text"]');
    if (!periodSelect || !searchInput) return false;
    const pos = periodSelect.compareDocumentPosition(searchInput);
    return Boolean(pos & Node.DOCUMENT_POSITION_FOLLOWING);
  });

  const phonePeriodSelect = phoneLightPage.locator("div.md\\:hidden select").first();
  const selectBox = await phonePeriodSelect.boundingBox();
  const selectFontSize = await phonePeriodSelect.evaluate((el) => window.getComputedStyle(el).fontSize);

  const phoneSearchInput = phoneLightPage.locator('input[type="text"]').first();
  const inputFontSize = await phoneSearchInput.evaluate((el) => window.getComputedStyle(el).fontSize);
  const inputBox = await phoneSearchInput.boundingBox();

  const studentLink = phoneLightPage.locator('div.md\\:hidden a[href*="/students/"]').first();
  const linkBox = await studentLink.boundingBox();
  const studentNameClass = await studentLink.locator("p").evaluate((el) => el.className);
  const wrapsName = !studentNameClass.includes("truncate") && studentNameClass.includes("break-words");

  const isTouchTargetValid =
    selectBox !== null &&
    selectBox.height >= 44 &&
    inputBox !== null &&
    inputBox.height >= 44 &&
    linkBox !== null &&
    linkBox.height >= 44;
  const is16pxFont = parseInt(selectFontSize, 10) >= 16 && parseInt(inputFontSize, 10) >= 16;

  registerProbe({
    probe: "phone_anatomy_order_and_touch_targets",
    passed: phoneOrder && isTouchTargetValid && is16pxFont && wrapsName,
    details: {
      phoneOrder,
      selectHeight: selectBox?.height,
      inputHeight: inputBox?.height,
      linkHeight: linkBox?.height,
      selectFontSize,
      inputFontSize,
      wrapsName,
    },
  });

  await recordScreenshot(phoneLightPage, "05-phone-superadmin-course-progress-light.png", {
    viewport: "390x844",
    theme: "light",
    role: "superadmin",
    state: "loaded",
    simulation: false,
    description: "Phone superadmin course progress with period selector FIRST, search/sort, and wrapped student rows",
  });

  await phonePeriodSelect.click();
  await recordScreenshot(phoneLightPage, "15-phone-period-picker-open.png", {
    viewport: "390x844",
    theme: "light",
    role: "superadmin",
    state: "interaction",
    simulation: false,
    description: "Phone period selector interactive view",
  });

  await phoneLightPage.evaluate(() => window.scrollBy(0, 350));
  await phoneLightPage.waitForTimeout(150);
  await recordScreenshot(phoneLightPage, "17-phone-scrolled-view.png", {
    viewport: "390x844",
    theme: "light",
    role: "superadmin",
    state: "scrolled",
    simulation: false,
    description: "Phone course progress view after vertical scroll showing wrapped long names",
  });

  await phoneLightContext.close();

  const phoneDarkContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
  });
  await setupContext(phoneDarkContext, { theme: "dark", lng: "en" });
  const phoneDarkPage = await phoneDarkContext.newPage();
  await loginAndNavigateToCourseProgress(phoneDarkPage, superadmin, 1);

  await recordScreenshot(phoneDarkPage, "06-phone-superadmin-course-progress-dark.png", {
    viewport: "390x844",
    theme: "dark",
    role: "superadmin",
    state: "loaded",
    simulation: false,
    description: "Phone superadmin course progress view in dark theme",
  });

  await phoneDarkPage.evaluate(() => window.scrollBy(0, 350));
  await phoneDarkPage.waitForTimeout(150);
  await recordScreenshot(phoneDarkPage, "24-phone-scrolled-view-dark.png", {
    viewport: "390x844",
    theme: "dark",
    role: "superadmin",
    state: "scrolled",
    simulation: false,
    description: "Phone course progress view in dark theme after vertical scroll showing wrapped long names",
  });

  await phoneDarkContext.close();

  const phone320Context = await browser.newContext({
    viewport: { width: 320, height: 640 },
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
  });
  await setupContext(phone320Context, { theme: "light", lng: "en" });
  const phone320Page = await phone320Context.newPage();
  await loginAndNavigateToCourseProgress(phone320Page, superadmin, 1);

  const docScrollWidth = await phone320Page.evaluate(() => document.documentElement.scrollWidth);
  const docClientWidth = await phone320Page.evaluate(() => document.documentElement.clientWidth);
  const noDocumentOverflow = docScrollWidth <= docClientWidth;

  await recordScreenshot(phone320Page, "07-phone-320-compact-view.png", {
    viewport: "320x640",
    theme: "light",
    role: "superadmin",
    state: "compact",
    simulation: false,
    description: "Narrow phone 320px viewport without document overflow",
  });

  registerProbe({
    probe: "phone_320_no_document_overflow_and_scroll",
    passed: noDocumentOverflow,
    details: { docScrollWidth, docClientWidth, noDocumentOverflow },
  });

  await phone320Context.close();

  const tabletContext = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    colorScheme: "light",
  });
  await setupContext(tabletContext, { theme: "light", lng: "en" });
  const tabletPage = await tabletContext.newPage();
  await loginAndNavigateToCourseProgress(tabletPage, superadmin, 1);

  await recordScreenshot(tabletPage, "08-tablet-768-breakpoint-view.png", {
    viewport: "768x1024",
    theme: "light",
    role: "superadmin",
    state: "tablet",
    simulation: false,
    description: "Tablet 768px breakpoint table view with sticky identity column",
  });
  await tabletContext.close();

  const desktop1024Context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    colorScheme: "light",
  });
  await setupContext(desktop1024Context, { theme: "light", lng: "en" });
  const desktop1024Page = await desktop1024Context.newPage();
  await loginAndNavigateToCourseProgress(desktop1024Page, superadmin, 1);

  const tableReg1024 = desktop1024Page.locator('div[role="region"]').first();
  await tableReg1024.evaluate((el) => { el.scrollLeft = 240; });
  await desktop1024Page.waitForTimeout(150);

  await recordScreenshot(desktop1024Page, "16-desktop-horizontal-scrolled-table.png", {
    viewport: "1024x768",
    theme: "light",
    role: "superadmin",
    state: "scrolled",
    simulation: false,
    description: "Desktop 1024px table horizontally scrolled showing pinned identity column",
  });

  await recordScreenshot(desktop1024Page, "09-desktop-1024-standard-view.png", {
    viewport: "1024x768",
    theme: "light",
    role: "superadmin",
    state: "desktop",
    simulation: false,
    description: "Standard desktop 1024px progress table view",
  });
  await desktop1024Context.close();

  const ruContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
  });
  await setupContext(ruContext, { theme: "light", lng: "ru" });
  const ruPage = await ruContext.newPage();
  await loginAndNavigateToCourseProgress(ruPage, superadmin, 1);

  const ruContent = await ruPage.content();
  const hasRuTranslations = ruContent.includes("Успеваемость курса") && ruContent.includes("Сводка");

  await recordScreenshot(ruPage, "11-desktop-course-progress-ru.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "superadmin",
    lng: "ru",
    state: "localized",
    simulation: false,
    description: "Desktop course progress localized in Russian",
  });

  registerProbe({
    probe: "russian_localization",
    passed: hasRuTranslations,
    details: { hasRuTranslations },
  });

  await ruContext.close();

  const tgContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
  });
  await setupContext(tgContext, { theme: "light", lng: "tg" });
  const tgPage = await tgContext.newPage();
  await loginAndNavigateToCourseProgress(tgPage, superadmin, 1);

  const tgContent = await tgPage.content();
  const hasTgTranslations = tgContent.includes("Пешрафти курс") && tgContent.includes("Хулоса");

  await recordScreenshot(tgPage, "12-desktop-course-progress-tg.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "superadmin",
    lng: "tg",
    state: "localized",
    simulation: false,
    description: "Desktop course progress localized in Tajik",
  });

  registerProbe({
    probe: "tajik_localization",
    passed: hasTgTranslations,
    details: { hasTgTranslations },
  });

  await tgContext.close();

  const returnContextSession = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
  });
  await setupContext(returnContextSession, { theme: "light", lng: "en" });
  const returnPage = await returnContextSession.newPage();
  await loginAndNavigateToCourseProgress(returnPage, superadmin, 1);

  const phonePeriodSelectElem = returnPage.locator("div.md\\:hidden select").first();
  await phonePeriodSelectElem.waitFor({ timeout: 5000 });
  const periodOptions = await phonePeriodSelectElem.locator("option").all();
  assert.ok(periodOptions.length >= 2, "There must be at least 2 periods");
  const targetOptionValue = await periodOptions[1].getAttribute("value");
  assert.ok(targetOptionValue, "Target option value must be present");
  await phonePeriodSelectElem.selectOption(targetOptionValue);
  await returnPage.waitForTimeout(200);

  const selectedPeriodId = Number(targetOptionValue);

  const searchBox = returnPage.getByLabel(/search|поиск|ҷустуҷӯ/i).first();
  await searchBox.fill("Muhammadali");

  const sortSelect = returnPage.getByLabel(/sort|мураттабсозӣ|сортировка/i).first();
  await sortSelect.selectOption("score_asc");

  await returnPage.evaluate(() => window.scrollTo(0, 250));
  await returnPage.waitForTimeout(200);
  const measuredScrollBefore = await returnPage.evaluate(() => window.scrollY);
  const hasNonzeroScrollBefore = measuredScrollBefore >= 100;

  const studentProfileLink = returnPage.locator('div.md\\:hidden a[href*="/students/"]').first();
  await studentProfileLink.click();
  await returnPage.waitForURL((url) => url.pathname.includes("/students/"), { timeout: 15000 });

  await returnPage.goBack();
  await returnPage.waitForLoadState("networkidle");
  await returnPage.waitForFunction(
    () => !document.querySelector('main [data-testid="brand-activity-indicator"], main [class*="animate-pulse"]'),
    { timeout: 15000 }
  );
  await returnPage.waitForTimeout(300);

  const restoredUrl = returnPage.url();
  const hasRestoredTab = restoredUrl.includes("tab=progress");
  const restoredPeriodVal = await phonePeriodSelectElem.inputValue();
  const isPeriodRestored = Number(restoredPeriodVal) === selectedPeriodId;

  const restoredSearchVal = await searchBox.inputValue();
  const restoredSortVal = await sortSelect.inputValue();

  const measuredScrollAfter = await returnPage.evaluate(() => window.scrollY);
  const isScrollRestored =
    measuredScrollAfter > 0 && Math.abs(measuredScrollAfter - measuredScrollBefore) <= 50;

  await returnPage.setViewportSize({ width: 1440, height: 1000 });
  await returnPage.waitForTimeout(250);
  const desktopPreservedUrl = returnPage.url();
  const periodPreservedOnDesktopResize = desktopPreservedUrl.includes(`period=${selectedPeriodId}`);

  await returnPage.setViewportSize({ width: 390, height: 844 });
  await returnPage.waitForTimeout(250);
  const phoneRepreserVal = await phonePeriodSelectElem.inputValue();
  const periodPreservedOnPhoneResize = Number(phoneRepreserVal) === selectedPeriodId;

  const studentsTab = returnPage.locator('button[role="tab"]').filter({ hasText: /Students|Студенты|Донишҷӯён/i }).first();
  await studentsTab.click();
  await returnPage.waitForTimeout(400);

  const studentsSearchInput = returnPage.locator('input[type="text"]').first();
  const studentsSearchVal = await studentsSearchInput.inputValue();
  const isSeparatedFromStudents = studentsSearchVal !== "Muhammadali";

  await returnPage.goto(`${previewOrigin}/courses/2?tab=progress`);
  await returnPage.waitForLoadState("networkidle");
  await returnPage.waitForFunction(
    () => !document.querySelector('main [data-testid="brand-activity-indicator"], main [class*="animate-pulse"]'),
    { timeout: 15000 }
  );
  await returnPage.waitForTimeout(300);

  const course2SearchBox = returnPage.getByLabel(/search|поиск|ҷустуҷӯ/i).first();
  const course2SortSelect = returnPage.getByLabel(/sort|мураттабсозӣ|сортировка/i).first();
  const course2SearchVal = await course2SearchBox.inputValue();
  const course2SortVal = await course2SortSelect.inputValue();
  const course2Url = returnPage.url();

  const isSeparatedFromOtherCourse =
    course2SearchVal === "" &&
    course2SortVal === "score_desc" &&
    !course2Url.includes(`period=${selectedPeriodId}`);

  registerProbe({
    probe: "selected_period_and_profile_return_persistence",
    passed:
      hasRestoredTab &&
      isPeriodRestored &&
      restoredSearchVal === "Muhammadali" &&
      restoredSortVal === "score_asc" &&
      hasNonzeroScrollBefore &&
      isScrollRestored &&
      periodPreservedOnPhoneResize &&
      periodPreservedOnDesktopResize &&
      isSeparatedFromStudents &&
      isSeparatedFromOtherCourse,
    details: {
      hasRestoredTab,
      selectedPeriodId,
      restoredPeriodId: Number(restoredPeriodVal),
      isPeriodRestored,
      restoredSearchVal,
      restoredSortVal,
      measuredScrollBefore,
      measuredScrollAfter,
      isScrollRestored,
      periodPreservedOnPhoneResize,
      periodPreservedOnDesktopResize,
      isSeparatedFromStudents,
      isSeparatedFromOtherCourse,
    },
  });

  await returnContextSession.close();

  const a11yContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(a11yContext, { theme: "light", lng: "en" });
  const a11yPage = await a11yContext.newPage();
  await loginAndNavigateToCourseProgress(a11yPage, superadmin, 1);

  await a11yPage.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  await a11yPage.waitForTimeout(300);

  const computedRootFontSize = await a11yPage.evaluate(
    () => window.getComputedStyle(document.documentElement).fontSize
  );

  await a11yPage.evaluate(() => {
    const tableOrRegion = document.querySelector('[role="region"][aria-label], table');
    if (tableOrRegion) {
      tableOrRegion.scrollIntoView({ block: "center" });
    }
  });
  await a11yPage.waitForTimeout(200);

  await recordScreenshot(a11yPage, "18-desktop-200-percent-text-enlargement.png", {
    viewport: "1440x1000",
    theme: "light",
    role: "superadmin",
    state: "enlarged",
    simulation: false,
    description: "Desktop view of Progress table and controls with computed 32px root font size (200% enlargement)",
  });

  const enlargedDocWidth = await a11yPage.evaluate(() => document.documentElement.scrollWidth);
  const enlargedClientWidth = await a11yPage.evaluate(() => document.documentElement.clientWidth);
  const textGrowsWithoutDocOverflow = enlargedDocWidth <= enlargedClientWidth + 2;

  const reducedMotionActive = await a11yPage.evaluate(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const computedMotionInspect = await a11yPage.evaluate(() => {
    const interactiveElements = Array.from(
      document.querySelectorAll("main button, main a, main select, main input")
    );
    const samples = interactiveElements.slice(0, 10).map((el) => {
      const cs = window.getComputedStyle(el);
      return {
        tag: el.tagName,
        transitionDuration: cs.transitionDuration,
        animationDuration: cs.animationDuration,
      };
    });
    const hasInfiniteAnimations = samples.some(
      (s) => s.animationDuration && s.animationDuration !== "0s"
    );
    return { samples, hasInfiniteAnimations };
  });

  await a11yPage.keyboard.press("Tab");
  const focusedActiveTag = await a11yPage.evaluate(() => document.activeElement?.tagName || "");
  const hasKeyboardNativeFocus = Boolean(focusedActiveTag);

  const identityColumnContainment = await a11yPage.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("tbody tr"));
    let allContained = true;
    let maxOverflowPx = 0;
    const measurements = [];

    for (const row of rows) {
      const th = row.querySelector("th.sticky");
      const link = th?.querySelector("a");
      if (!th || !link) continue;

      const thRect = th.getBoundingClientRect();
      const linkRect = link.getBoundingClientRect();

      const overflowPx = Math.max(0, linkRect.right - thRect.right);
      if (overflowPx > maxOverflowPx) {
        maxOverflowPx = overflowPx;
      }
      if (overflowPx > 1.5) {
        allContained = false;
      }

      measurements.push({
        name: link.textContent?.trim(),
        thWidth: thRect.width,
        linkWidth: linkRect.width,
        thRight: thRect.right,
        linkRight: linkRect.right,
        overflowPx,
      });
    }

    return { allContained, maxOverflowPx, sampleMeasurements: measurements.slice(0, 5) };
  });

  registerProbe({
    probe: "root_enlargement_200_and_reduced_motion",
    passed:
      textGrowsWithoutDocOverflow &&
      reducedMotionActive &&
      computedRootFontSize === "32px" &&
      !computedMotionInspect.hasInfiniteAnimations &&
      hasKeyboardNativeFocus &&
      identityColumnContainment.allContained,
    details: {
      textGrowsWithoutDocOverflow,
      enlargedDocWidth,
      enlargedClientWidth,
      reducedMotionActive,
      computedRootFontSize,
      hasInfiniteAnimations: computedMotionInspect.hasInfiniteAnimations,
      sampleDurations: computedMotionInspect.samples.slice(0, 3),
      hasKeyboardNativeFocus,
      focusedActiveTag,
      ...identityColumnContainment,
    },
  });

  await a11yContext.close();

} finally {
  await browser.close();
}

await writeFile(`${taskDir}/manifest.json`, JSON.stringify(manifest, null, 2));
await writeFile(`${taskDir}/probes.json`, JSON.stringify(probes, null, 2));

console.log(JSON.stringify({
  manifestCount: manifest.length,
  probesCount: probes.length,
  allProbesPassed: probes.every((p) => p.passed),
}));

import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixtures = JSON.parse(input);

const outputDir = resolve("../docs/redesign-execution/group-01/task-08/screenshots");
const attempt4Dir = resolve("../docs/redesign-execution/group-01/task-08/attempt4/screenshots");
const taskDir = resolve("../docs/redesign-execution/group-01/task-08");
const taskAttempt4Dir = resolve("../docs/redesign-execution/group-01/task-08/attempt4");
await mkdir(outputDir, { recursive: true });
await mkdir(attempt4Dir, { recursive: true });
await mkdir(taskAttempt4Dir, { recursive: true });

const mentor = fixtures.identities.find((item) => item.role === "mentor" && !item.forced);
assert.ok(mentor, "Mentor fixture identity must be present");

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const probes = [];
const manifest = [];
const pageErrors = [];
const unexpectedHttpErrors = [];

async function recordScreenshot(page, filename, meta = {}) {
  const p1 = `${outputDir}/${filename}`;
  const p2 = `${attempt4Dir}/${filename}`;
  await page.screenshot({ path: p1, fullPage: meta.mode === "extreme-wrapping" });
  await copyFile(p1, p2);
  manifest.push({ file: filename, ...meta });
}

async function setupContext(context, options = {}) {
  await context.route("http://localhost:8000/api/v1/**", async (route) => {
    const url = route.request().url().replace("http://localhost:8000", "http://127.0.0.1:18080");
    try {
      const response = await route.fetch({ url });
      await route.fulfill({ response });
    } catch {
      await route.abort();
    }
  });

  if (options.lng) {
    await context.addInitScript((l) => localStorage.setItem("i18nextLng", l), options.lng);
  } else {
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  }

  if (options.zoom) {
    await context.addInitScript(() => {
      const applyZoom = () => {
        if (document.documentElement) {
          document.documentElement.style.fontSize = "200%";
        }
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyZoom);
      } else {
        applyZoom();
      }
    });
  }
}

async function loginAsMentor(page, allowedErrorUrls = [], isPrivacyTest = false) {
  page.on("pageerror", (err) => {
    console.error("PAGE ERROR:", err.message);
    pageErrors.push(err.message);
  });

  if (!isPrivacyTest) {
    page.on("request", (req) => {
      const url = req.url();
      const forbidden = ["/api/v1/finance", "/api/v1/audit", "/api/v1/audit-log"];
      for (const f of forbidden) {
        if (url.includes(f)) {
          throw new Error(`Forbidden staff request made by mentor page: ${url}`);
        }
      }
      const cleanUrl = url.split("?")[0].replace(/\/+$/, "");
      if (cleanUrl.endsWith("/api/v1/mentors")) {
        throw new Error(`Forbidden mentors directory request made by mentor page: ${url}`);
      }
      if (url.includes("/api/v1/mentors/") && url.includes("/analytics")) {
        throw new Error(`Forbidden mentor analytics request made by mentor page: ${url}`);
      }
      if (url.includes("/api/v1/mentors/") && !url.includes("/api/v1/mentors/me") && !url.includes(`/api/v1/mentors/${mentor.id}`)) {
        throw new Error(`Forbidden other mentor request made by mentor page: ${url}`);
      }
    });
  }

  page.on("response", (res) => {
    if (res.status() >= 400 && !isPrivacyTest) {
      const url = res.url();
      const isAllowed = allowedErrorUrls.some((pattern) => url.includes(pattern));
      if (!isAllowed) {
        console.error("UNEXPECTED HTTP ERROR:", res.status(), url);
        unexpectedHttpErrors.push({ status: res.status(), url });
      }
    }
  });

  await page.goto("http://127.0.0.1:5174/login?redirect=/");
  await page.locator("#email").fill(mentor.email);
  await page.locator("#password").fill(fixtures.password);
  await page.locator('button[type="submit"]').click();
  try {
    await page.waitForURL((url) => url.pathname === "/" || url.pathname.startsWith("/mentors/"), { timeout: 10000 });
  } catch (err) {
    console.error("LOGIN FAILED. Current URL:", page.url());
    const body = await page.locator("body").innerText();
    console.error("PAGE CONTENT:", body.slice(0, 500));
    throw err;
  }
  if (new URL(page.url()).pathname !== "/") {
    await page.goto("http://127.0.0.1:5174/");
    await page.waitForURL((url) => url.pathname === "/");
  }
  await page.locator("main").waitFor();
  await page.locator("h1").waitFor();
}

async function waitForMentorDashboard(page) {
  await page.locator('section[aria-labelledby="grading-queue-heading"]').waitFor({ timeout: 15000 });
  await page.locator('section[aria-labelledby="active-courses-heading"]').waitFor({ timeout: 15000 });
  await page.locator('section[aria-labelledby="mentor-summary-heading"]').waitFor({ timeout: 15000 });
  await page.locator('section[aria-labelledby="active-courses-heading"] :text("Python Fundamentals")').first().waitFor({ timeout: 15000 });
  await page.locator('section[aria-labelledby="active-courses-heading"] :text("English IELTS Master")').first().waitFor({ timeout: 15000 });
  await page.locator('section[aria-labelledby="grading-queue-heading"] :text("Week 1: Python Basics")').first().waitFor({ timeout: 15000 });
  await page.locator('section[aria-labelledby="mentor-summary-heading"] p:has-text("2")').first().waitFor({ timeout: 15000 });
  await page.locator('section[aria-labelledby="mentor-summary-heading"] p:has-text("3")').first().waitFor({ timeout: 15000 });

  const foreignCourseCount = await page.locator('section[aria-labelledby="active-courses-heading"] :text("Web Design")').count();
  assert.equal(foreignCourseCount, 0, "Foreign course assigned to second mentor must not be visible on mentor dashboard");
}

async function assertSummaryMetrics(page) {
  const summarySection = page.locator('section[aria-labelledby="mentor-summary-heading"]');
  await summarySection.waitFor({ timeout: 15000 });

  const paragraphs = summarySection.locator("p.tabular-nums");
  const count = await paragraphs.count();
  assert.equal(count, 3, "Summary metrics section must render 3 value paragraphs");

  const values = [];
  for (let i = 0; i < count; i++) {
    const p = paragraphs.nth(i);
    const text = (await p.innerText()).trim();
    values.push(text);

    const style = await p.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
      };
    });
    assert.equal(style.fontSize, "28px", `Summary metric ${i} fontSize must be 28px across all viewports`);
    assert.equal(style.lineHeight, "36px", `Summary metric ${i} lineHeight must be 36px across all viewports`);
  }

  assert.ok(values.includes("2"), "Must include 2 active courses");
  assert.ok(values.includes("2"), "Must include 2 periods needing grading");
  assert.ok(values.includes("3"), "Must include 3 active students");
}

async function assertCoursesGrid(page, expectedMinCardWidth = 320) {
  const gridInfo = await page.evaluate(() => {
    const section = document.querySelector('section[aria-labelledby="active-courses-heading"]');
    if (!section) return null;
    const grid = section.querySelector(".grid");
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const cols = window.getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const firstCard = grid.querySelector(":scope > div");
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : 0;
    return {
      gridWidth: rect.width,
      cols,
      cardWidth,
    };
  });
  assert.ok(gridInfo, "Active courses grid must be present");
  if (gridInfo.gridWidth >= 656) {
    assert.equal(gridInfo.cols, 2, `When grid width (${gridInfo.gridWidth}px) >= 656px, it must render 2 columns`);
    assert.ok(gridInfo.cardWidth >= expectedMinCardWidth, `Card width (${gridInfo.cardWidth}px) must be >= ${expectedMinCardWidth}px`);
  } else {
    assert.equal(gridInfo.cols, 1, `When grid width (${gridInfo.gridWidth}px) < 656px, it must render 1 column`);
  }
}

try {
  for (const theme of ["light", "dark"]) {
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    await setupContext(desktopContext);
    const desktopPage = await desktopContext.newPage();
    await loginAsMentor(desktopPage);
    await waitForMentorDashboard(desktopPage);
    await assertSummaryMetrics(desktopPage);
    await assertCoursesGrid(desktopPage, 320);

    const desktopFile = `mentor-dashboard-1440x1000-${theme}.png`;
    await recordScreenshot(desktopPage, desktopFile, { viewport: "1440x1000", theme, locale: "en" });
    probes.push({ test: `desktop-1440x1000-${theme}`, status: "pass" });

    const h1Text = await desktopPage.locator("h1").innerText();
    assert.ok(h1Text.includes("Teacher Dashboard"));

    const queueHeading = await desktopPage.locator('h2[id="grading-queue-heading"]').innerText();
    assert.ok(queueHeading.includes("Needs Grading"));

    const isOverflowing = await desktopPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(isOverflowing, false, "Desktop 1440x1000 must not have horizontal document overflow");

    const queueActionBox = await desktopPage.locator('section[aria-labelledby="grading-queue-heading"] a').first().boundingBox();
    assert.ok(queueActionBox, "Queue row Open journal action link must be present");
    assert.ok(queueActionBox.height >= 44, `Queue action button height=${queueActionBox.height} must be at least 44px`);
    assert.ok(queueActionBox.width >= 44, `Queue action button width=${queueActionBox.width} must be at least 44px`);

    const courseActionBox = await desktopPage.locator('section[aria-labelledby="active-courses-heading"] a[href^="/journals/"]').first().boundingBox();
    assert.ok(courseActionBox, "Course row Open journal action link must be present");
    assert.ok(courseActionBox.height >= 44, `Course action button height=${courseActionBox.height} must be at least 44px`);
    assert.ok(courseActionBox.width >= 44, `Course action button width=${courseActionBox.width} must be at least 44px`);

    await desktopContext.close();
  }

  for (const theme of ["light", "dark"]) {
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    await setupContext(mobileContext);
    const mobilePage = await mobileContext.newPage();
    await loginAsMentor(mobilePage);
    await waitForMentorDashboard(mobilePage);
    await assertSummaryMetrics(mobilePage);
    await assertCoursesGrid(mobilePage);

    const mobileFile = `mentor-dashboard-390x844-${theme}.png`;
    await recordScreenshot(mobilePage, mobileFile, { viewport: "390x844", theme, locale: "en" });
    probes.push({ test: `mobile-390x844-${theme}`, status: "pass" });

    const isMobileOverflowing = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(isMobileOverflowing, false, "Mobile 390x844 must not have horizontal document overflow");

    const queueActionBox = await mobilePage.locator('section[aria-labelledby="grading-queue-heading"] a').first().boundingBox();
    assert.ok(queueActionBox, "Queue row action link must be present on mobile");
    assert.ok(queueActionBox.height >= 44, `Mobile queue action height=${queueActionBox.height} must be >=44px`);

    const courseActionBox = await mobilePage.locator('section[aria-labelledby="active-courses-heading"] a[href^="/journals/"]').first().boundingBox();
    assert.ok(courseActionBox, "Course row action link must be present on mobile");
    assert.ok(courseActionBox.height >= 44, `Mobile course action height=${courseActionBox.height} must be >=44px`);

    await mobileContext.close();
  }

  for (const lng of ["ru", "tg"]) {
    const lngDesktopContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await setupContext(lngDesktopContext, { lng });
    const lngDesktopPage = await lngDesktopContext.newPage();
    await loginAsMentor(lngDesktopPage);
    await waitForMentorDashboard(lngDesktopPage);

    const lngDesktopFile = `mentor-dashboard-1440x1000-${lng}.png`;
    await recordScreenshot(lngDesktopPage, lngDesktopFile, { viewport: "1440x1000", theme: "light", locale: lng });
    probes.push({ test: `desktop-1440x1000-${lng}`, status: "pass" });

    const h1Text = await lngDesktopPage.locator("h1").innerText();
    if (lng === "ru") {
      assert.ok(h1Text.includes("Панель Преподавателя"), `Russian H1 expected: ${h1Text}`);
    } else {
      assert.ok(h1Text.includes("Панели Муаллим"), `Tajik H1 expected: ${h1Text}`);
    }

    await lngDesktopContext.close();

    const lngMobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await setupContext(lngMobileContext, { lng });
    const lngMobilePage = await lngMobileContext.newPage();
    await loginAsMentor(lngMobilePage);
    await waitForMentorDashboard(lngMobilePage);

    const lngMobileFile = `mentor-dashboard-390x844-${lng}.png`;
    await recordScreenshot(lngMobilePage, lngMobileFile, { viewport: "390x844", theme: "light", locale: lng });
    probes.push({ test: `mobile-390x844-${lng}`, status: "pass" });

    const isLngMobileOverflowing = await lngMobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(isLngMobileOverflowing, false, `Mobile 390x844 in ${lng} must not have horizontal document overflow`);

    await lngMobileContext.close();
  }

  for (const lng of ["en", "ru", "tg"]) {
    const narrowContext = await browser.newContext({
      viewport: { width: 320, height: 640 },
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await setupContext(narrowContext, { lng });
    const narrowPage = await narrowContext.newPage();
    await loginAsMentor(narrowPage);
    await waitForMentorDashboard(narrowPage);

    const overflow = await narrowPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, `Narrow 320x640 in ${lng} must not have horizontal document overflow`);

    const sections = narrowPage.locator("section");
    const sectionCount = await sections.count();
    for (let i = 0; i < sectionCount; i++) {
      const box = await sections.nth(i).boundingBox();
      if (box) {
        assert.ok(box.width <= 320, `Section ${i} width ${box.width} must fit in 320px viewport`);
      }
    }

    const narrowFile = `mentor-dashboard-320x640-${lng}.png`;
    await recordScreenshot(narrowPage, narrowFile, { viewport: "320x640", theme: "light", locale: lng });
    probes.push({ test: `responsive-320x640-${lng}`, status: "pass" });
    await narrowContext.close();
  }

  const longNarrowContext = await browser.newContext({
    viewport: { width: 320, height: 640 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(longNarrowContext);
  const longTitle = "Superlongunbreakablecoursename1234567890abcdefghijklmnopqrstuvwxyz";
  const longPeriod = "Superlongunbreakableperiodlabel1234567890abcdefghijklmnopqrstuvwxyz";

  await longNarrowContext.route("**/api/v1/courses/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: 1,
            title: longTitle,
            description: "",
            start_date: "2026-01-01",
            end_date: "2026-12-31",
            exam_type: "monthly",
            price: "1200.00",
            mentor_id: mentor.id,
            status: "active",
          },
        ],
        total: 1,
        page: 1,
        page_size: 50,
        total_pages: 1,
      }),
    });
  });

  await longNarrowContext.route("**/api/v1/mentors/me/grading-queue**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          journal_id: 101,
          course_id: 1,
          course_title: longTitle,
          period_label: longPeriod,
          period_start: "2026-10-01",
          period_end: "2026-10-07",
          state: "partial",
          cells_filled: 2,
          cells_expected: 5,
          is_current: true,
        },
      ]),
    });
  });

  const longNarrowPage = await longNarrowContext.newPage();
  await loginAsMentor(longNarrowPage);
  await longNarrowPage.locator(`text="${longTitle}"`).first().waitFor({ timeout: 10000 });

  const overflowLong = await longNarrowPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert.equal(overflowLong, false, "320px long unbreakable simulation must not have horizontal document overflow");

  const boundsViolations = await longNarrowPage.evaluate(() => {
    const elements = document.querySelectorAll("section, section h2, section p, section span, section a, section button");
    const violations = [];
    for (const el of elements) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        if (r.right > 320.5) {
          violations.push({ tag: el.tagName, class: el.className, right: r.right, text: el.textContent?.slice(0, 30) });
        }
      }
    }
    return violations;
  });
  assert.equal(boundsViolations.length, 0, `Element bounds must not overflow 320px viewport: ${JSON.stringify(boundsViolations)}`);

  await recordScreenshot(longNarrowPage, "mentor-dashboard-320x640-long-unbreakable-simulated.png", { viewport: "320x640", theme: "light", locale: "en", mode: "long-unbreakable-simulated" });
  probes.push({ test: "responsive-320x640-long-unbreakable-simulated", status: "pass" });

  const lastAction = longNarrowPage.locator('section[aria-labelledby="active-courses-heading"] a[href^="/journals/"]').first();
  await lastAction.scrollIntoViewIfNeeded();
  const lastActionBox = await lastAction.boundingBox();
  assert.ok(lastActionBox, "Last action link must have bounding box");
  assert.ok(lastActionBox.y + lastActionBox.height <= 640, `Last action bottom (${lastActionBox.y + lastActionBox.height}) must be within viewport <= 640px`);

  await longNarrowContext.close();

  const zoomContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(zoomContext, { zoom: true });
  const zoomPage = await zoomContext.newPage();
  await loginAsMentor(zoomPage);
  await waitForMentorDashboard(zoomPage);

  const zoomComputedBody = await zoomPage.evaluate(() => window.getComputedStyle(document.body).fontSize);
  assert.ok(parseFloat(zoomComputedBody) >= 32, `200% zoom computed body fontSize=${zoomComputedBody} must be >=32px`);

  const zoomComputedH1 = await zoomPage.evaluate(() => {
    const h1 = document.querySelector("h1");
    return h1 ? window.getComputedStyle(h1).fontSize : "";
  });
  assert.ok(parseFloat(zoomComputedH1) >= 32, `200% zoom computed H1 fontSize=${zoomComputedH1} must be >=32px`);

  const zoomOverflow = await zoomPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert.equal(zoomOverflow, false, "200% zoom on 390x844 must not have horizontal document overflow");

  const zoomFile = "mentor-dashboard-390x844-text-200.png";
  await recordScreenshot(zoomPage, zoomFile, { viewport: "390x844", theme: "light", locale: "en", zoom: "200%" });
  probes.push({ test: "mobile-390x844-text-200", status: "pass" });
  await zoomContext.close();

  for (const { name, viewport } of [
    { name: "768x1024", viewport: { width: 768, height: 1024 } },
    { name: "1024x768", viewport: { width: 1024, height: 768 } },
    { name: "1280x800", viewport: { width: 1280, height: 800 } },
  ]) {
    const vpContext = await browser.newContext({
      viewport,
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await setupContext(vpContext);
    const vpPage = await vpContext.newPage();
    await loginAsMentor(vpPage);
    await waitForMentorDashboard(vpPage);
    await assertCoursesGrid(vpPage);

    const vpOverflow = await vpPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(vpOverflow, false, `Viewport ${name} must not have horizontal document overflow`);

    const vpFile = `mentor-dashboard-${name}-light.png`;
    await recordScreenshot(vpPage, vpFile, { viewport: name, theme: "light", locale: "en" });
    probes.push({ test: `responsive-${name}-light`, status: "pass" });
    await vpContext.close();
  }

  for (const theme of ["light", "dark"]) {
    const popoverContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    await setupContext(popoverContext);
    const popoverPage = await popoverContext.newPage();
    await loginAsMentor(popoverPage);
    await waitForMentorDashboard(popoverPage);

    const desktopSettingsBtn = popoverPage.locator("button[data-shell-settings]");
    await desktopSettingsBtn.click();
    const desktopSettingsSurface = popoverPage.locator("#shell-surface");
    await desktopSettingsSurface.waitFor({ state: "visible", timeout: 5000 });
    await recordScreenshot(popoverPage, `mentor-dashboard-settings-desktop-popover-${theme}.png`, { viewport: "1440x1000", theme, mode: "settings-popover" });
    probes.push({ test: `settings-desktop-popover-${theme}`, status: "pass" });

    const desktopCloseBtn = popoverPage.locator("button[aria-label='Close'], button[aria-label='Закрыть'], button[aria-label='Пӯшидан']").first();
    if (await desktopCloseBtn.isVisible()) {
      await desktopCloseBtn.click();
    } else {
      await popoverPage.keyboard.press("Escape");
    }
    await desktopSettingsSurface.waitFor({ state: "hidden", timeout: 5000 });
    const isSettingsFocused = await popoverPage.evaluate(() => document.activeElement?.hasAttribute("data-shell-settings") || document.activeElement?.getAttribute("data-shell-settings") !== null);
    assert.ok(isSettingsFocused, "Focus must return to settings button on desktop");

    const desktopNotifBtn = popoverPage.locator("button[aria-label='Notifications'], button:has(svg.lucide-bell)").first();
    await desktopNotifBtn.click();
    const desktopNotifSurface = popoverPage.locator("#shell-surface");
    await desktopNotifSurface.waitFor({ state: "visible", timeout: 5000 });
    await recordScreenshot(popoverPage, `mentor-dashboard-notifications-desktop-popover-${theme}.png`, { viewport: "1440x1000", theme, mode: "notifications-popover" });
    probes.push({ test: `notifications-desktop-popover-${theme}`, status: "pass" });

    const desktopNotifClose = popoverPage.locator("button[aria-label='Close'], button[aria-label='Закрыть'], button[aria-label='Пӯшидан']").first();
    if (await desktopNotifClose.isVisible()) {
      await desktopNotifClose.click();
    } else {
      await popoverPage.keyboard.press("Escape");
    }
    await desktopNotifSurface.waitFor({ state: "hidden", timeout: 5000 });
    const isNotifFocused = await popoverPage.evaluate(() => {
      const el = document.activeElement;
      return el?.getAttribute("aria-label")?.includes("Notifications") || el?.querySelector("svg.lucide-bell") !== null;
    });
    assert.ok(isNotifFocused, "Focus must return to notifications button on desktop");

    await popoverContext.close();
  }

  for (const theme of ["light", "dark"]) {
    const phoneModalContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    await setupContext(phoneModalContext);
    const phoneModalPage = await phoneModalContext.newPage();
    await loginAsMentor(phoneModalPage);
    await waitForMentorDashboard(phoneModalPage);

    const phoneSettingsBtn = phoneModalPage.locator("button[data-shell-settings]");
    await phoneSettingsBtn.click();
    const phoneSettingsSurface = phoneModalPage.locator("#shell-surface");
    await phoneSettingsSurface.waitFor({ state: "visible", timeout: 5000 });
    await recordScreenshot(phoneModalPage, `mentor-dashboard-settings-mobile-dialog-${theme}.png`, { viewport: "390x844", theme, mode: "settings-mobile-dialog" });
    probes.push({ test: `settings-mobile-dialog-${theme}`, status: "pass" });

    const phoneCloseBtn = phoneModalPage.locator("button[aria-label='Close'], button[aria-label='Закрыть'], button[aria-label='Пӯшидан']").first();
    if (await phoneCloseBtn.isVisible()) {
      await phoneCloseBtn.click();
    } else {
      await phoneModalPage.keyboard.press("Escape");
    }
    await phoneSettingsSurface.waitFor({ state: "hidden", timeout: 5000 });
    const isPhoneSettingsFocused = await phoneModalPage.evaluate(() => document.activeElement?.hasAttribute("data-shell-settings") || document.activeElement?.getAttribute("data-shell-settings") !== null);
    assert.ok(isPhoneSettingsFocused, "Focus must return to settings button on mobile");

    const phoneNotifBtn = phoneModalPage.locator("button[aria-label='Notifications'], button:has(svg.lucide-bell)").first();
    await phoneNotifBtn.click();
    const phoneNotifSurface = phoneModalPage.locator("#shell-surface");
    await phoneNotifSurface.waitFor({ state: "visible", timeout: 5000 });
    await recordScreenshot(phoneModalPage, `mentor-dashboard-notifications-mobile-dialog-${theme}.png`, { viewport: "390x844", theme, mode: "notifications-mobile-dialog" });
    probes.push({ test: `notifications-mobile-dialog-${theme}`, status: "pass" });

    const phoneNotifClose = phoneModalPage.locator("button[aria-label='Close'], button[aria-label='Закрыть'], button[aria-label='Пӯшидан']").first();
    if (await phoneNotifClose.isVisible()) {
      await phoneNotifClose.click();
    } else {
      await phoneModalPage.keyboard.press("Escape");
    }
    await phoneNotifSurface.waitFor({ state: "hidden", timeout: 5000 });
    const isPhoneNotifFocused = await phoneModalPage.evaluate(() => {
      const el = document.activeElement;
      return el?.getAttribute("aria-label")?.includes("Notifications") || el?.querySelector("svg.lucide-bell") !== null;
    });
    assert.ok(isPhoneNotifFocused, "Focus must return to notifications button on mobile");

    await phoneModalContext.close();
  }

  const loginRes = await fetch("http://127.0.0.1:18080/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: mentor.email, password: fixtures.password }),
  });
  const { access_token } = await loginRes.json();
  const authHeaders = { Authorization: `Bearer ${access_token}` };

  const queueRes = await fetch("http://127.0.0.1:18080/api/v1/mentors/me/grading-queue", { headers: authHeaders });
  assert.equal(queueRes.status, 200, "Must successfully fetch genuine mentor grading queue");
  const queueData = await queueRes.json();
  assert.ok(queueData.length >= 2, "Seeded grading queue must have at least 2 items");

  const item1 = queueData[0];
  const item2 = queueData[1];
  assert.notEqual(item1.journal_id, item2.journal_id, "Seeded queue items must have distinct journal IDs");
  assert.notEqual(item1.course_id, item2.course_id, "Seeded queue items must have distinct course IDs");

  const navContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(navContext);
  const navPage = await navContext.newPage();
  await loginAsMentor(navPage);
  await waitForMentorDashboard(navPage);

  const queueLinks = navPage.locator('section[aria-labelledby="grading-queue-heading"] a[href^="/journals/"]');
  const queueLinksCount = await queueLinks.count();
  assert.ok(queueLinksCount >= 2, "There must be at least 2 queue links rendered for the 2 pending periods");

  const link1Href = await queueLinks.nth(0).getAttribute("href");
  const link2Href = await queueLinks.nth(1).getAttribute("href");
  assert.equal(link1Href, `/journals/${item1.course_id}?period=${item1.journal_id}`, "First queue link href must match real queue JSON item1 course_id and journal_id");
  assert.equal(link2Href, `/journals/${item2.course_id}?period=${item2.journal_id}`, "Second queue link href must match real queue JSON item2 course_id and journal_id");

  await queueLinks.nth(0).focus();
  await navPage.keyboard.press("Enter");
  await navPage.waitForURL((url) => url.pathname === `/journals/${item1.course_id}` && url.searchParams.get("period") === String(item1.journal_id), { timeout: 10000 });

  await navPage.locator(`text="${item1.period_label}"`).first().waitFor({ timeout: 10000 });

  await recordScreenshot(navPage, "mentor-dashboard-keyboard-focus.png", { viewport: "1440x1000", mode: "keyboard-focus" });
  probes.push({ test: "keyboard-focus", status: "pass" });

  await navPage.goBack();
  await navPage.waitForURL((u) => u.pathname === "/", { timeout: 10000 });
  await waitForMentorDashboard(navPage);

  const course1Link = navPage.locator(`section[aria-labelledby="active-courses-heading"] a[href="/journals/${item1.course_id}"]`).first();
  assert.ok(await course1Link.isVisible(), `Course card link must exist for /journals/${item1.course_id}`);
  await course1Link.click();
  await navPage.waitForURL((url) => url.pathname === `/journals/${item1.course_id}` && !url.searchParams.get("period"), { timeout: 10000 });

  await navPage.goBack();
  await navPage.waitForURL((u) => u.pathname === "/", { timeout: 10000 });
  await waitForMentorDashboard(navPage);
  await navContext.close();

  const foreignCourseRes = await fetch("http://127.0.0.1:18080/api/v1/courses/3/journals", { headers: authHeaders });
  assert.equal(foreignCourseRes.status, 403, "Direct request to foreign course journals must return HTTP 403 Forbidden");

  const missingCourseRes = await fetch("http://127.0.0.1:18080/api/v1/courses/99999/journals", { headers: authHeaders });
  assert.equal(missingCourseRes.status, 404, "Direct request to non-existent course journals must return HTTP 404 Not Found");

  const financeRes = await fetch("http://127.0.0.1:18080/api/v1/finance/debts/", { headers: authHeaders });
  assert.equal(financeRes.status, 403, "Direct request to finance debts by mentor must return HTTP 403 Forbidden");

  const auditRes = await fetch("http://127.0.0.1:18080/api/v1/audit-log/", { headers: authHeaders });
  assert.equal(auditRes.status, 403, "Direct request to audit logs by mentor must return HTTP 403 Forbidden");

  const otherMentorProfileRes = await fetch("http://127.0.0.1:18080/api/v1/mentors/999/profile", { headers: authHeaders });
  assert.equal(otherMentorProfileRes.status, 403, "Direct request to other mentor profile by mentor must return HTTP 403 Forbidden");

  const mentorsListRes = await fetch("http://127.0.0.1:18080/api/v1/mentors/", { headers: authHeaders });
  assert.equal(mentorsListRes.status, 403, "Direct request to mentors directory by mentor must return HTTP 403 Forbidden");

  probes.push({ test: "privacy-boundaries-cross-mentor", status: "pass" });

  const motionContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await setupContext(motionContext);
  const motionPage = await motionContext.newPage();
  await loginAsMentor(motionPage);
  await waitForMentorDashboard(motionPage);

  const actionInfo = await motionPage.evaluate(() => {
    const action = document.querySelector('section[aria-labelledby="grading-queue-heading"] a');
    if (!action) return null;
    const style = window.getComputedStyle(action);
    return {
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
      classList: Array.from(action.classList),
    };
  });
  assert.ok(actionInfo, "Interactive action link must be present");
  assert.equal(actionInfo.transitionDuration, "0.15s", "Interactive control transition duration must be exactly 0.15s (150ms)");
  assert.ok(actionInfo.transitionProperty.includes("transform") || actionInfo.transitionProperty === "all", `Transition property must include transform: ${actionInfo.transitionProperty}`);
  assert.ok(actionInfo.classList.includes("motion-safe:duration-150"), "Interactive control must include motion-safe:duration-150");
  assert.ok(actionInfo.classList.includes("motion-safe:ease-out"), "Interactive control must include motion-safe:ease-out");
  assert.ok(actionInfo.classList.includes("motion-safe:active:scale-[0.96]") || actionInfo.classList.includes("active:scale-[0.96]"), "Interactive control must include active:scale-[0.96]");

  await recordScreenshot(motionPage, "mentor-dashboard-non-reduced-motion.png", { viewport: "1440x1000", mode: "non-reduced-motion" });
  probes.push({ test: "non-reduced-motion", status: "pass" });
  await motionContext.close();

  const loadingContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(loadingContext);
  await loadingContext.route("**/api/v1/mentors/me/grading-queue**", async () => {});
  await loadingContext.route("**/api/v1/courses/**", async () => {});
  const loadingPage = await loadingContext.newPage();
  await loginAsMentor(loadingPage);

  const skeletonQueueCount = await loadingPage.locator('section[aria-labelledby="grading-queue-heading"] div[role="status"][aria-busy="true"]').count();
  assert.ok(skeletonQueueCount >= 1, "Queue local skeleton must have role='status' and aria-busy='true'");

  const skeletonCoursesCount = await loadingPage.locator('section[aria-labelledby="active-courses-heading"] div[role="status"][aria-busy="true"]').count();
  assert.ok(skeletonCoursesCount >= 1, "Courses local skeleton must have role='status' and aria-busy='true'");

  const skeletonAnimation = await loadingPage.evaluate(() => {
    const skeleton = document.querySelector('div[role="status"] div.bg-strip');
    return skeleton ? window.getComputedStyle(skeleton).animationName : "none";
  });
  assert.equal(skeletonAnimation, "none", "In prefers-reduced-motion: reduce, skeleton pulse animation must be none");

  await assertCoursesGrid(loadingPage);

  const loadingFile = "mentor-dashboard-loading-state-simulated.png";
  await recordScreenshot(loadingPage, loadingFile, { viewport: "1440x1000", mode: "loading-state-simulated" });
  probes.push({ test: "loading-state-simulated", status: "pass" });
  await loadingContext.close();

  const emptyQueueContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(emptyQueueContext);
  await emptyQueueContext.route("**/api/v1/mentors/me/grading-queue**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  const emptyQueuePage = await emptyQueueContext.newPage();
  await loginAsMentor(emptyQueuePage);
  await emptyQueuePage.locator('section[aria-labelledby="grading-queue-heading"]').waitFor({ timeout: 10000 });

  const emptyCheck = emptyQueuePage.locator('text="All current periods are graded"');
  await emptyCheck.waitFor({ timeout: 10000 });
  assert.ok(await emptyCheck.isVisible(), "Empty grading queue calm text must be visible");

  const courseLinkBoxInEmpty = await emptyQueuePage.locator('section[aria-labelledby="active-courses-heading"] a[href^="/journals/"]').first().boundingBox();
  assert.ok(courseLinkBoxInEmpty, "Course journal link must be rendered in empty queue state");
  assert.ok(courseLinkBoxInEmpty.y + courseLinkBoxInEmpty.height < 780, `At 390px in empty queue state, course journal link must be visible above bottom nav`);

  const emptyQueueFile = "mentor-dashboard-empty-queue-simulated.png";
  await recordScreenshot(emptyQueuePage, emptyQueueFile, { viewport: "390x844", mode: "empty-queue-simulated" });
  probes.push({ test: "empty-queue-simulated", status: "pass" });
  await emptyQueueContext.close();

  const emptyCoursesContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(emptyCoursesContext);
  await emptyCoursesContext.route("**/api/v1/courses/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 50, total_pages: 0 }),
    });
  });
  const emptyCoursesPage = await emptyCoursesContext.newPage();
  await loginAsMentor(emptyCoursesPage);
  await emptyCoursesPage.locator('section[aria-labelledby="active-courses-heading"]').waitFor({ timeout: 10000 });

  const emptyCoursesNotice = emptyCoursesPage.locator('text="No active assigned groups"');
  await emptyCoursesNotice.waitFor({ timeout: 10000 });
  assert.ok(await emptyCoursesNotice.isVisible(), "Empty courses copy must be displayed");

  const emptyCoursesFile = "mentor-dashboard-empty-courses-simulated.png";
  await recordScreenshot(emptyCoursesPage, emptyCoursesFile, { viewport: "1440x1000", mode: "empty-courses-simulated" });
  probes.push({ test: "empty-courses-simulated", status: "pass" });
  await emptyCoursesContext.close();

  const profileErrContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(profileErrContext);
  let failProfile = true;
  await profileErrContext.route("**/api/v1/mentors/me/profile**", async (route) => {
    if (failProfile) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Simulated profile error" }),
      });
    } else {
      const url = route.request().url().replace("http://localhost:8000", "http://127.0.0.1:18080");
      try {
        const response = await route.fetch({ url });
        await route.fulfill({ response });
      } catch {
        await route.abort();
      }
    }
  });
  const profileErrPage = await profileErrContext.newPage();
  await loginAsMentor(profileErrPage, ["/api/v1/mentors/me/profile"]);
  const profileUnavailableNotice = profileErrPage.locator('text="Student count currently unavailable"');
  await profileUnavailableNotice.waitFor({ timeout: 15000 });
  assert.ok(await profileUnavailableNotice.isVisible(), "Profile unavailable notice must be visible on error");

  const profileErrFile = "mentor-dashboard-error-profile-simulated.png";
  await recordScreenshot(profileErrPage, profileErrFile, { viewport: "1440x1000", mode: "error-profile-simulated" });
  probes.push({ test: "error-profile-simulated", status: "pass" });

  failProfile = false;
  const profileRetryBtn = profileErrPage.locator('button[aria-label="Retry My Students"]');
  await profileRetryBtn.click();
  await profileErrPage.locator('section[aria-labelledby="mentor-summary-heading"] p:has-text("3")').waitFor({ timeout: 15000 });
  await profileErrContext.close();

  const errorContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(errorContext);
  await errorContext.route("**/api/v1/mentors/me/grading-queue**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Simulated grading queue error" }),
    });
  });
  const errorPage = await errorContext.newPage();
  await loginAsMentor(errorPage, ["/api/v1/mentors/me/grading-queue"]);
  const queueRetryBtn = errorPage.locator('section[aria-labelledby="grading-queue-heading"] button:has-text("Retry")');
  await queueRetryBtn.waitFor({ timeout: 15000 });

  const errorFile = "mentor-dashboard-error-state-simulated.png";
  await recordScreenshot(errorPage, errorFile, { viewport: "1440x1000", mode: "error-state-simulated" });
  probes.push({ test: "error-state-simulated", status: "pass" });

  await errorContext.unroute("**/api/v1/mentors/me/grading-queue**");
  await queueRetryBtn.click();
  await errorPage.locator('section[aria-labelledby="grading-queue-heading"] :text("Week 1: Python Basics")').first().waitFor({ timeout: 15000 });
  await errorContext.close();

  const coursesErrContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(coursesErrContext);
  await coursesErrContext.route("**/api/v1/courses/**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Simulated courses error" }),
    });
  });
  const coursesErrPage = await coursesErrContext.newPage();
  await loginAsMentor(coursesErrPage, ["/api/v1/courses/"]);
  const coursesRetryBtn = coursesErrPage.locator('section[aria-labelledby="active-courses-heading"] button:has-text("Retry")');
  await coursesRetryBtn.waitFor({ timeout: 15000 });

  const coursesErrFile = "mentor-dashboard-error-courses-simulated.png";
  await recordScreenshot(coursesErrPage, coursesErrFile, { viewport: "1440x1000", mode: "error-courses-simulated" });
  probes.push({ test: "error-courses-simulated", status: "pass" });

  await coursesErrContext.unroute("**/api/v1/courses/**");
  await coursesRetryBtn.click();
  await coursesErrPage.locator('section[aria-labelledby="active-courses-heading"] :text("Python Fundamentals")').first().waitFor({ timeout: 15000 });
  await coursesErrContext.close();

  const staleContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(staleContext);
  const stalePage = await staleContext.newPage();
  await loginAsMentor(stalePage, ["/api/v1/mentors/me/grading-queue"]);
  await waitForMentorDashboard(stalePage);

  let shouldFailQueue = true;
  await staleContext.route("**/api/v1/mentors/me/grading-queue**", async (route) => {
    if (shouldFailQueue) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Simulated refresh error" }),
      });
    } else {
      const url = route.request().url().replace("http://localhost:8000", "http://127.0.0.1:18080");
      try {
        const response = await route.fetch({ url });
        await route.fulfill({ response });
      } catch {
        await route.abort();
      }
    }
  });

  await stalePage.evaluate(() => {
    if (window.__queryClient) {
      window.__queryClient.refetchQueries();
    }
  });

  const staleNotice = stalePage.locator('text="Failed to update grading queue — showing cached data"');
  await staleNotice.waitFor({ timeout: 15000 });
  assert.ok(await staleNotice.isVisible(), "Stale update notice must be visible upon refresh failure");

  const staleFile = "mentor-dashboard-stale-state-simulated.png";
  await recordScreenshot(stalePage, staleFile, { viewport: "1440x1000", mode: "stale-state-simulated" });
  probes.push({ test: "stale-state-simulated", status: "pass" });

  shouldFailQueue = false;
  const retryBtn = stalePage.locator('section[aria-labelledby="grading-queue-heading"] button:has-text("Retry")');
  await retryBtn.click();
  await staleNotice.waitFor({ state: "hidden", timeout: 15000 });

  const staleRecoveryFile = "mentor-dashboard-stale-recovery.png";
  await recordScreenshot(stalePage, staleRecoveryFile, { viewport: "1440x1000", mode: "stale-recovery" });
  probes.push({ test: "stale-recovery", status: "pass" });

  await staleContext.close();

  const staleProfileContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(staleProfileContext);
  const staleProfilePage = await staleProfileContext.newPage();
  await loginAsMentor(staleProfilePage, ["/api/v1/mentors/me/profile"]);
  await waitForMentorDashboard(staleProfilePage);

  let failProfileRefetch = true;
  await staleProfileContext.route("**/api/v1/mentors/me/profile**", async (route) => {
    if (failProfileRefetch) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Simulated profile refresh failure" }),
      });
    } else {
      const url = route.request().url().replace("http://localhost:8000", "http://127.0.0.1:18080");
      try {
        const response = await route.fetch({ url });
        await route.fulfill({ response });
      } catch {
        await route.abort();
      }
    }
  });

  await staleProfilePage.evaluate(() => {
    if (window.__queryClient) {
      window.__queryClient.refetchQueries({ queryKey: ["users", "mentors", "profile", "me"] });
    }
  });

  const profileStaleNotice = staleProfilePage.locator('section[aria-labelledby="mentor-summary-heading"] :text("Update failed — showing cached data")');
  await profileStaleNotice.waitFor({ timeout: 15000 });
  assert.ok(await profileStaleNotice.isVisible(), "Stale update notice must be visible upon profile refresh failure");

  const retainedStudentCount = await staleProfilePage.locator('section[aria-labelledby="mentor-summary-heading"] p:has-text("3")').count();
  assert.ok(retainedStudentCount > 0, "Retained student count 3 must remain visible");

  const retainedCoursesCount = await staleProfilePage.locator('section[aria-labelledby="mentor-summary-heading"] p:has-text("2")').count();
  assert.ok(retainedCoursesCount >= 2, "Other summary counts (2) must be preserved");

  const staleProfileFile = "mentor-dashboard-stale-profile-simulated.png";
  await recordScreenshot(staleProfilePage, staleProfileFile, { viewport: "1440x1000", mode: "stale-profile-simulated" });
  probes.push({ test: "stale-profile-simulated", status: "pass" });

  failProfileRefetch = false;
  const profileStaleRetryBtn = staleProfilePage.locator('section[aria-labelledby="mentor-summary-heading"] button:has-text("Retry")').last();
  await profileStaleRetryBtn.click();
  await profileStaleNotice.waitFor({ state: "hidden", timeout: 15000 });
  probes.push({ test: "stale-profile-recovery", status: "pass" });

  await staleProfileContext.close();

  const retEmptyContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(retEmptyContext);
  let emptyOrError = "empty";
  await retEmptyContext.route("**/api/v1/mentors/me/grading-queue**", async (route) => {
    if (emptyOrError === "empty") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else if (emptyOrError === "error") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Simulated refresh error on empty queue" }),
      });
    } else {
      const url = route.request().url().replace("http://localhost:8000", "http://127.0.0.1:18080");
      try {
        const response = await route.fetch({ url });
        await route.fulfill({ response });
      } catch {
        await route.abort();
      }
    }
  });
  const retEmptyPage = await retEmptyContext.newPage();
  await loginAsMentor(retEmptyPage, ["/api/v1/mentors/me/grading-queue"]);
  const emptyNotice = retEmptyPage.locator('text="All current periods are graded"');
  await emptyNotice.waitFor({ timeout: 10000 });

  emptyOrError = "error";
  await retEmptyPage.evaluate(() => {
    if (window.__queryClient) {
      window.__queryClient.refetchQueries();
    }
  });

  const retEmptyStaleNotice = retEmptyPage.locator('text="Failed to update grading queue — showing cached data"');
  await retEmptyStaleNotice.waitFor({ timeout: 15000 });
  assert.ok(await emptyNotice.isVisible(), "Retained empty queue calm copy must remain visible while showing stale notice");

  const retEmptyStaleFile = "mentor-dashboard-retained-empty-queue-stale.png";
  await recordScreenshot(retEmptyPage, retEmptyStaleFile, { viewport: "1440x1000", mode: "retained-empty-queue-stale" });
  probes.push({ test: "retained-empty-queue-stale", status: "pass" });

  emptyOrError = "restore";
  const retEmptyRetryBtn = retEmptyPage.locator('section[aria-labelledby="grading-queue-heading"] button:has-text("Retry")');
  await retEmptyRetryBtn.click();
  await retEmptyStaleNotice.waitFor({ state: "hidden", timeout: 15000 });
  await retEmptyContext.close();

  const retEmptyCoursesContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(retEmptyCoursesContext);
  let emptyCoursesMode = "empty";
  await retEmptyCoursesContext.route("**/api/v1/courses/**", async (route) => {
    if (emptyCoursesMode === "empty") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 50, total_pages: 0 }),
      });
    } else if (emptyCoursesMode === "error") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Simulated refresh error on empty courses" }),
      });
    } else {
      const url = route.request().url().replace("http://localhost:8000", "http://127.0.0.1:18080");
      try {
        const response = await route.fetch({ url });
        await route.fulfill({ response });
      } catch {
        await route.abort();
      }
    }
  });

  const retEmptyCoursesPage = await retEmptyCoursesContext.newPage();
  await loginAsMentor(retEmptyCoursesPage, ["/api/v1/courses"]);
  const retainedEmptyCoursesNotice = retEmptyCoursesPage.locator('text="No active assigned groups"');
  await retainedEmptyCoursesNotice.waitFor({ timeout: 10000 });
  assert.ok(await retainedEmptyCoursesNotice.isVisible(), "Empty courses copy must be displayed");

  await retEmptyCoursesPage.locator('section[aria-labelledby="grading-queue-heading"]').waitFor({ timeout: 10000 });

  emptyCoursesMode = "error";
  await retEmptyCoursesPage.evaluate(() => {
    if (window.__queryClient) {
      window.__queryClient.refetchQueries({ queryKey: ["courses"] });
    }
  });

  const coursesStaleNotice = retEmptyCoursesPage.locator('text="Failed to update courses — showing cached data"');
  await coursesStaleNotice.waitFor({ timeout: 15000 });
  assert.ok(await retainedEmptyCoursesNotice.isVisible(), "Retained empty courses copy must remain visible while showing stale notice");

  const retEmptyCoursesStaleFile = "mentor-dashboard-retained-empty-courses-stale.png";
  await recordScreenshot(retEmptyCoursesPage, retEmptyCoursesStaleFile, { viewport: "1440x1000", mode: "retained-empty-courses-stale" });
  probes.push({ test: "retained-empty-courses-stale", status: "pass" });

  emptyCoursesMode = "empty";
  const retEmptyCoursesRetryBtn = retEmptyCoursesPage.locator('section[aria-labelledby="active-courses-heading"] button:has-text("Retry")');
  await retEmptyCoursesRetryBtn.click();
  await coursesStaleNotice.waitFor({ state: "hidden", timeout: 15000 });
  probes.push({ test: "retained-empty-courses-recovery", status: "pass" });

  await retEmptyCoursesContext.close();

} finally {
  await browser.close();
}

assert.equal(unexpectedHttpErrors.length, 0, `Captured unexpected HTTP errors: ${JSON.stringify(unexpectedHttpErrors)}`);
assert.equal(pageErrors.length, 0, `Captured unexpected page errors: ${pageErrors.join("; ")}`);

const probesJson = JSON.stringify(probes, null, 2);
const manifestJson = JSON.stringify(manifest, null, 2);

await writeFile(`${taskDir}/probes.json`, probesJson);
await writeFile(`${taskAttempt4Dir}/probes.json`, probesJson);
await writeFile(`${taskDir}/manifest.json`, manifestJson);
await writeFile(`${taskAttempt4Dir}/manifest.json`, manifestJson);

console.log(`Successfully verified ${probes.length} probes and recorded ${manifest.length} screenshots.`);

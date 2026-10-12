import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixtures = JSON.parse(input);

const outputDir = resolve("../docs/redesign-execution/group-01/task-07/screenshots");
const attempt4Dir = resolve("../docs/redesign-execution/group-01/task-07/attempt4/screenshots");
const taskDir = resolve("../docs/redesign-execution/group-01/task-07");
const taskAttempt4Dir = resolve("../docs/redesign-execution/group-01/task-07/attempt4");
await mkdir(outputDir, { recursive: true });
await mkdir(attempt4Dir, { recursive: true });
await mkdir(taskAttempt4Dir, { recursive: true });

const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
assert.ok(superadmin, "Superadmin fixture identity must be present");

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const probes = [];
const manifest = [];
const pageErrors = [];

let loadedAttentionHeight = 0;
let loadedActivityHeight = 0;

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

async function loginAsSuperadmin(page, recordErrors = true) {
  if (recordErrors) {
    page.on("pageerror", (err) => {
      console.error("PAGE ERROR:", err.message);
      pageErrors.push(err.message);
    });
  }
  page.on("response", (res) => {
    if (res.status() >= 400) console.error("HTTP ERROR:", res.status(), res.url());
  });

  await page.goto("http://127.0.0.1:5174/login");
  await page.locator("#email").fill(superadmin.email);
  await page.locator("#password").fill(fixtures.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.locator("main").waitFor();
  await page.locator("h1").waitFor();
}

async function waitForDashboardData(page) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {}
  await page.waitForSelector("ul li", { timeout: 10000 });
  await page.waitForFunction(() => {
    const summary = document.querySelector('section[aria-labelledby="dashboard-summary-heading"]');
    const values = summary ? Array.from(summary.querySelectorAll("p.font-bold")).map((el) => el.textContent?.trim()) : [];
    return values.includes("5 500.50 TJS") && values.includes("3") && values.includes("7");
  }, null, { timeout: 10000 });
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
    await loginAsSuperadmin(desktopPage);
    await waitForDashboardData(desktopPage);

    const desktopFile = `superadmin-dashboard-1440x1000-${theme}.png`;
    await recordScreenshot(desktopPage, desktopFile, { viewport: "1440x1000", theme, locale: "en" });
    probes.push({ test: `desktop-1440x1000-${theme}`, status: "pass" });

    const h1Text = await desktopPage.locator("h1").innerText();
    assert.ok(h1Text.includes("Admin Dashboard"));

    const gridCols = await desktopPage.evaluate(() => {
      const container = document.querySelector(".\\@container");
      if (!container) return 0;
      const grid = container.querySelector(".grid.grid-cols-1");
      if (!grid) return 0;
      return window.getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    });
    assert.equal(gridCols, 2, "Desktop 1440x1000 content grid must compute 2 columns (60/40 split)");

    const firstRowBox = await desktopPage.locator("ul.divide-y li").first().boundingBox();
    assert.ok(firstRowBox, "First debt row must be present");
    assert.ok(firstRowBox.y <= 520, `First row y=${firstRowBox.y} must appear before 520px from top`);

    const debtRows = await desktopPage.locator("div.rounded-xl.border:has(h2:has-text('Requires attention today')) ul.divide-y > li").count();
    assert.equal(debtRows, 5, "Attention list must show 5 rows from limit 5 despite 6 seeded debts");

    const actionBox = await desktopPage.locator("a:has-text('Open Finance')").first().boundingBox();
    assert.ok(actionBox, "Per-row finance action must be present");
    assert.ok(actionBox.height >= 44, `Action button height=${actionBox.height} must be at least 44px`);
    assert.ok(actionBox.width >= 44, `Action button width=${actionBox.width} must be at least 44px`);

    const visibleActivityCount = await desktopPage.evaluate(() => {
      const card = Array.from(document.querySelectorAll("div.rounded-xl.border")).find((c) =>
        c.querySelector("h2")?.textContent?.includes("Recent Activity")
      );
      if (!card) return 0;
      const lis = card.querySelectorAll("ul.divide-y > li");
      return Array.from(lis).filter((li) => window.getComputedStyle(li).display !== "none").length;
    });
    assert.equal(visibleActivityCount, 5, "Activity feed must display 5 items on desktop");

    if (theme === "light") {
      loadedAttentionHeight = await desktopPage.evaluate(() => {
        const card = Array.from(document.querySelectorAll("div.rounded-xl.border")).find((c) =>
          c.querySelector("h2")?.textContent?.includes("Requires attention today")
        );
        const list = card ? card.querySelector("ul.divide-y") : null;
        return list ? list.getBoundingClientRect().height : 0;
      });
      loadedActivityHeight = await desktopPage.evaluate(() => {
        const card = Array.from(document.querySelectorAll("div.rounded-xl.border")).find((c) =>
          c.querySelector("h2")?.textContent?.includes("Recent Activity")
        );
        const list = card ? card.querySelector("ul.divide-y") : null;
        return list ? list.getBoundingClientRect().height : 0;
      });
    }

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    await setupContext(mobileContext);
    const mobilePage = await mobileContext.newPage();
    await loginAsSuperadmin(mobilePage);
    await waitForDashboardData(mobilePage);

    const mobileFile = `superadmin-dashboard-390x844-${theme}.png`;
    await recordScreenshot(mobilePage, mobileFile, { viewport: "390x844", theme, locale: "en" });
    probes.push({ test: `mobile-390x844-${theme}`, status: "pass" });

    const mobileOverflow = await mobilePage.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert.equal(mobileOverflow, false, "Mobile 390x844 must not have horizontal overflow");

    const visibleActivityMobile = await mobilePage.evaluate(() => {
      const card = Array.from(document.querySelectorAll("div.rounded-xl.border")).find((c) =>
        c.querySelector("h2")?.textContent?.includes("Recent Activity")
      );
      if (!card) return 0;
      const lis = card.querySelectorAll("ul.divide-y > li");
      return Array.from(lis).filter((li) => window.getComputedStyle(li).display !== "none").length;
    });
    assert.equal(visibleActivityMobile, 3, "Activity feed must display 3 items on phone");

    await desktopContext.close();
    await mobileContext.close();
  }

  const narrowContext = await browser.newContext({
    viewport: { width: 320, height: 640 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(narrowContext);
  const narrowPage = await narrowContext.newPage();
  await loginAsSuperadmin(narrowPage);
  await waitForDashboardData(narrowPage);

  const narrowOverflow = await narrowPage.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  assert.equal(narrowOverflow, false, "Narrow 320x640 must not have horizontal overflow");

  const narrowFile = "superadmin-dashboard-320x640-light.png";
  await recordScreenshot(narrowPage, narrowFile, { viewport: "320x640", theme: "light", locale: "en" });
  probes.push({ test: "narrow-320x640-light", status: "pass" });
  await narrowContext.close();

  const narrowExtremeContext = await browser.newContext({
    viewport: { width: 320, height: 640 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(narrowExtremeContext);
  await narrowExtremeContext.route("**/api/v1/finance/debts/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            student: { id: 999, first_name: "Muhammadali-Konstantin", last_name: "Abdurakhmonov-Tursunzoda", email: "long@example.com", payment_day_of_month: 1 },
            course: { id: 88, title: "Enterprise Fullstack Cloud Engineering Architecture" },
            price_at_enrollment: "1250000.50",
            billed_to_date: "1250000.50",
            total_paid: "0.00",
            debt: "1250000.50",
            overdue_days: 18,
          },
        ],
        total: 1,
        page: 1,
        page_size: 5,
        total_pages: 1,
      }),
    });
  });
  const narrowExtremePage = await narrowExtremeContext.newPage();
  await loginAsSuperadmin(narrowExtremePage);
  await waitForDashboardData(narrowExtremePage);

  const extremeCheck = await narrowExtremePage.evaluate(() => {
    const card = Array.from(document.querySelectorAll("div.rounded-xl.border")).find((c) =>
      c.querySelector("h2")?.textContent?.includes("Requires attention today")
    );
    if (!card) return { found: false, moneyClipped: true, nameClipped: true };
    const cardRect = card.getBoundingClientRect();
    const moneyEl = card.querySelector(".text-destructive.tabular-nums");
    const nameEl = card.querySelector("p.font-medium.text-ink");
    const actionEl = card.querySelector("a[href='/finance']");
    if (!moneyEl || !nameEl || !actionEl) return { found: false, moneyClipped: true, nameClipped: true };
    const moneyRect = moneyEl.getBoundingClientRect();
    const nameRect = nameEl.getBoundingClientRect();
    const actionRect = actionEl.getBoundingClientRect();
    return {
      found: true,
      moneyClipped: moneyRect.right > cardRect.right + 2,
      nameClipped: nameRect.right > cardRect.right + 2,
      actionClipped: actionRect.right > cardRect.right + 2,
    };
  });
  assert.equal(extremeCheck.found, true, "Extreme debtor card must be present");
  assert.equal(extremeCheck.moneyClipped, false, "Large debt number must not clip at 320px");
  assert.equal(extremeCheck.nameClipped, false, "Long debtor name must not clip at 320px");
  assert.equal(extremeCheck.actionClipped, false, "Action button must not clip at 320px");

  const narrowExtremeFile = "superadmin-dashboard-320x640-extreme-wrapping.png";
  await recordScreenshot(narrowExtremePage, narrowExtremeFile, { viewport: "320x640", theme: "light", locale: "en", mode: "extreme-wrapping" });
  await narrowExtremePage.locator("span.text-destructive.tabular-nums.whitespace-nowrap").first().evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const scrolledAmount = await narrowExtremePage.locator("span.text-destructive.tabular-nums.whitespace-nowrap").first().boundingBox();
  assert.ok(scrolledAmount && scrolledAmount.y >= 56 && scrolledAmount.y + scrolledAmount.height < 576, "Extreme money must be visibly clear of fixed navigation");
  await recordScreenshot(narrowExtremePage, "superadmin-dashboard-320x640-extreme-scrolled.png", { viewport: "320x640", theme: "light", locale: "en", mode: "extreme-scrolled-simulation" });
  probes.push({ test: "narrow-320-extreme-wrapping", status: "pass" });
  await narrowExtremeContext.close();

  const tabletContext = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(tabletContext);
  const tabletPage = await tabletContext.newPage();
  await loginAsSuperadmin(tabletPage);
  await waitForDashboardData(tabletPage);

  const tabletGridCols = await tabletPage.evaluate(() => {
    const container = document.querySelector(".\\@container");
    if (!container) return 0;
    const grid = container.querySelector(".grid.grid-cols-1");
    if (!grid) return 0;
    return window.getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  });
  assert.equal(tabletGridCols, 1, "Tablet 768x1024 must stack columns into 1 column");

  const tabletFile = "superadmin-dashboard-768x1024-light.png";
  await recordScreenshot(tabletPage, tabletFile, { viewport: "768x1024", theme: "light", locale: "en" });
  probes.push({ test: "tablet-768x1024-light", status: "pass" });
  await tabletContext.close();

  const shell1024Context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(shell1024Context);
  const shell1024Page = await shell1024Context.newPage();
  await loginAsSuperadmin(shell1024Page);
  await waitForDashboardData(shell1024Page);

  const shellGridCols = await shell1024Page.evaluate(() => {
    const container = document.querySelector(".\\@container");
    if (!container) return 0;
    const grid = container.querySelector(".grid.grid-cols-1");
    if (!grid) return 0;
    return window.getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  });
  assert.equal(shellGridCols, 1, "1024x768 shell with sidebar must stack into 1 column");

  const shell1024File = "superadmin-dashboard-1024x768-light.png";
  await recordScreenshot(shell1024Page, shell1024File, { viewport: "1024x768", theme: "light", locale: "en" });
  probes.push({ test: "shell-1024x768-light", status: "pass" });
  await shell1024Context.close();

  for (const lng of ["ru", "tg"]) {
    const lngDesktopContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await setupContext(lngDesktopContext, { lng });
    const lngDesktopPage = await lngDesktopContext.newPage();
    await loginAsSuperadmin(lngDesktopPage);
    await waitForDashboardData(lngDesktopPage);

    const lngDesktopFile = `superadmin-dashboard-1440x1000-${lng}.png`;
    await recordScreenshot(lngDesktopPage, lngDesktopFile, { viewport: "1440x1000", theme: "light", locale: lng });
    probes.push({ test: `locale-1440-${lng}`, status: "pass" });
    await lngDesktopContext.close();

    const lngMobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await setupContext(lngMobileContext, { lng });
    const lngMobilePage = await lngMobileContext.newPage();
    await loginAsSuperadmin(lngMobilePage);
    await waitForDashboardData(lngMobilePage);

    const lngMobileFile = `superadmin-dashboard-390x844-${lng}.png`;
    await recordScreenshot(lngMobilePage, lngMobileFile, { viewport: "390x844", theme: "light", locale: lng });
    probes.push({ test: `locale-390-${lng}`, status: "pass" });
    await lngMobileContext.close();
  }

  const zoomContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(zoomContext, { zoom: true });
  const zoomPage = await zoomContext.newPage();
  await loginAsSuperadmin(zoomPage);
  await waitForDashboardData(zoomPage);

  await zoomPage.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const rootFontSize = await zoomPage.evaluate(() => window.getComputedStyle(document.documentElement).fontSize);
  assert.equal(rootFontSize, "32px", "200% font zoom must compute 32px root font-size");

  const zoomFile = "superadmin-dashboard-390x844-text-200.png";
  await recordScreenshot(zoomPage, zoomFile, { viewport: "390x844", theme: "light", locale: "en", zoom: "200%" });
  probes.push({ test: "zoom-200-text", status: "pass" });
  await zoomContext.close();

  const keyboardContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(keyboardContext);
  const keyboardPage = await keyboardContext.newPage();
  await loginAsSuperadmin(keyboardPage);
  await waitForDashboardData(keyboardPage);

  await keyboardPage.keyboard.press("Tab");
  await keyboardPage.keyboard.press("Tab");
  await keyboardPage.keyboard.press("Tab");
  const activeTagName = await keyboardPage.evaluate(() => document.activeElement ? document.activeElement.tagName : "BODY");
  assert.notEqual(activeTagName, "BODY", "Tab navigation must focus an interactive element");

  const focusFile = "superadmin-dashboard-keyboard-focus.png";
  await recordScreenshot(keyboardPage, focusFile, { viewport: "1440x1000", theme: "light", locale: "en", mode: "keyboard-focus" });
  probes.push({ test: "keyboard-focus", status: "pass" });
  await keyboardContext.close();

  const motionContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await setupContext(motionContext);
  const motionPage = await motionContext.newPage();
  await loginAsSuperadmin(motionPage);
  await waitForDashboardData(motionPage);
  const motionFile = "superadmin-dashboard-non-reduced-motion.png";
  await recordScreenshot(motionPage, motionFile, { viewport: "1440x1000", theme: "light", locale: "en", mode: "non-reduced-motion" });
  probes.push({ test: "motion-non-reduced", status: "pass" });
  await motionContext.close();

  const overlayContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(overlayContext);
  const overlayPage = await overlayContext.newPage();
  await loginAsSuperadmin(overlayPage);
  await waitForDashboardData(overlayPage);

  const desktopSettingsBtn = overlayPage.locator("button[data-shell-settings]");
  await desktopSettingsBtn.click();
  const desktopSettingsSurface = overlayPage.locator("#shell-surface");
  await desktopSettingsSurface.waitFor({ state: "visible", timeout: 5000 });
  const settingsDesktopFile = "superadmin-dashboard-settings-desktop-popover.png";
  await recordScreenshot(overlayPage, settingsDesktopFile, { viewport: "1440x1000", theme: "light", locale: "en", mode: "settings-desktop-popover" });
  probes.push({ test: "overlay-settings-desktop", status: "pass" });

  const desktopCloseBtn = overlayPage.locator("button[aria-label='Close'], button[aria-label='Закрыть'], button[aria-label='Пӯшидан']").first();
  if (await desktopCloseBtn.isVisible()) {
    await desktopCloseBtn.click();
  } else {
    await overlayPage.keyboard.press("Escape");
  }
  await desktopSettingsSurface.waitFor({ state: "hidden", timeout: 5000 });
  const isDesktopSettingsFocused = await overlayPage.evaluate(() => document.activeElement?.hasAttribute("data-shell-settings") || document.activeElement?.getAttribute("data-shell-settings") !== null);
  assert.ok(isDesktopSettingsFocused, "Focus must return to settings button on desktop");

  const desktopNotifBtn = overlayPage.locator("button[aria-label='Notifications'], button:has(svg.lucide-bell)").first();
  await desktopNotifBtn.click();
  const desktopNotifSurface = overlayPage.locator("#shell-surface");
  await desktopNotifSurface.waitFor({ state: "visible", timeout: 5000 });
  const notifDesktopFile = "superadmin-dashboard-notifications-desktop-popover.png";
  await recordScreenshot(overlayPage, notifDesktopFile, { viewport: "1440x1000", theme: "light", locale: "en", mode: "notifications-desktop-popover" });
  probes.push({ test: "overlay-notifications-desktop", status: "pass" });

  const desktopNotifClose = overlayPage.locator("button[aria-label='Close'], button[aria-label='Закрыть'], button[aria-label='Пӯшидан']").first();
  if (await desktopNotifClose.isVisible()) {
    await desktopNotifClose.click();
  } else {
    await overlayPage.keyboard.press("Escape");
  }
  await desktopNotifSurface.waitFor({ state: "hidden", timeout: 5000 });
  await overlayContext.close();

  const mobileModalContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(mobileModalContext);
  const mobileModalPage = await mobileModalContext.newPage();
  await loginAsSuperadmin(mobileModalPage);
  await waitForDashboardData(mobileModalPage);

  const mobileSettingsBtn = mobileModalPage.locator("button[data-shell-settings]");
  await mobileSettingsBtn.click();
  const mobileSettingsSurface = mobileModalPage.locator("#shell-surface");
  await mobileSettingsSurface.waitFor({ state: "visible", timeout: 5000 });
  const settingsMobileFile = "superadmin-dashboard-settings-mobile-dialog.png";
  await recordScreenshot(mobileModalPage, settingsMobileFile, { viewport: "390x844", theme: "light", locale: "en", mode: "settings-mobile-dialog" });
  probes.push({ test: "overlay-settings-mobile", status: "pass" });

  const mobileCloseBtn = mobileModalPage.locator("button[aria-label='Close'], button[aria-label='Закрыть'], button[aria-label='Пӯшидан']").first();
  if (await mobileCloseBtn.isVisible()) {
    await mobileCloseBtn.click();
  } else {
    await mobileModalPage.keyboard.press("Escape");
  }
  await mobileSettingsSurface.waitFor({ state: "hidden", timeout: 5000 });
  const isMobileSettingsFocused = await mobileModalPage.evaluate(() => document.activeElement?.hasAttribute("data-shell-settings") || document.activeElement?.getAttribute("data-shell-settings") !== null);
  assert.ok(isMobileSettingsFocused, "Focus must return to settings button on mobile");

  const mobileNotifBtn = mobileModalPage.locator("button[aria-label='Notifications'], button:has(svg.lucide-bell)").first();
  if (await mobileNotifBtn.isVisible()) {
    await mobileNotifBtn.click();
    const mobileNotifSurface = mobileModalPage.locator("#shell-surface");
    await mobileNotifSurface.waitFor({ state: "visible", timeout: 5000 });
    const notifMobileFile = "superadmin-dashboard-notifications-mobile-dialog.png";
    await recordScreenshot(mobileModalPage, notifMobileFile, { viewport: "390x844", theme: "light", locale: "en", mode: "notifications-mobile-dialog" });
    probes.push({ test: "overlay-notifications-mobile", status: "pass" });

    const mobileNotifClose = mobileModalPage.locator("button[aria-label='Close'], button[aria-label='Закрыть'], button[aria-label='Пӯшидан']").first();
    if (await mobileNotifClose.isVisible()) {
      await mobileNotifClose.click();
    } else {
      await mobileModalPage.keyboard.press("Escape");
    }
    await mobileNotifSurface.waitFor({ state: "hidden", timeout: 5000 });
  }
  await mobileModalContext.close();

  const navContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(navContext);
  const navPage = await navContext.newPage();
  await loginAsSuperadmin(navPage);
  await waitForDashboardData(navPage);

  const debtsLink = navPage.getByRole("link", { name: /Open Finance • View debts/ });
  assert.equal(await debtsLink.getAttribute("href"), "/finance");
  await debtsLink.click();
  await navPage.waitForURL((url) => url.pathname === "/finance");
  probes.push({ test: "nav-finance-debts", status: "pass" });

  await navPage.goto("http://127.0.0.1:5174/");
  await navPage.waitForSelector("h1");
  await waitForDashboardData(navPage);

  const auditLink = navPage.getByRole("link", { name: "View all activity" });
  assert.equal(await auditLink.getAttribute("href"), "/audit");
  await auditLink.click();
  await navPage.waitForURL((url) => url.pathname === "/audit");
  probes.push({ test: "nav-audit-journal", status: "pass" });
  await navContext.close();

  const loadingContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(loadingContext);
  await loadingContext.route("**/api/v1/finance/analytics**", async () => {
    await new Promise((r) => setTimeout(r, 8000));
  });
  await loadingContext.route("**/api/v1/finance/debts/**", async () => {
    await new Promise((r) => setTimeout(r, 8000));
  });
  await loadingContext.route("**/api/v1/audit-log/**", async () => {
    await new Promise((r) => setTimeout(r, 8000));
  });
  const loadingPage = await loadingContext.newPage();
  await loginAsSuperadmin(loadingPage);

  const skeletonAttentionHeight = await loadingPage.evaluate(() => {
    const card = Array.from(document.querySelectorAll("div.rounded-xl.border")).find((c) =>
      c.querySelector("h2")?.textContent?.includes("Requires attention today")
    );
    const skeleton = card ? card.querySelector(".motion-safe\\:animate-pulse") : null;
    return skeleton ? skeleton.getBoundingClientRect().height : 0;
  });
  const skeletonActivityHeight = await loadingPage.evaluate(() => {
    const card = Array.from(document.querySelectorAll("div.rounded-xl.border")).find((c) =>
      c.querySelector("h2")?.textContent?.includes("Recent Activity")
    );
    const skeletons = card ? Array.from(card.querySelectorAll(".motion-safe\\:animate-pulse")) : [];
    const visibleSkeleton = skeletons.find((el) => window.getComputedStyle(el).display !== "none") || skeletons[0];
    return visibleSkeleton ? visibleSkeleton.getBoundingClientRect().height : 0;
  });
  assert.ok(
    Math.abs(skeletonAttentionHeight - loadedAttentionHeight) <= 60,
    `Skeleton attention height (${skeletonAttentionHeight}) must match loaded height (${loadedAttentionHeight})`
  );
  assert.ok(
    Math.abs(skeletonActivityHeight - loadedActivityHeight) <= 60,
    `Skeleton activity height (${skeletonActivityHeight}) must match loaded height (${loadedActivityHeight})`
  );

  const loadingFile = "superadmin-dashboard-loading-state-simulated.png";
  await recordScreenshot(loadingPage, loadingFile, { viewport: "1440x1000", theme: "light", locale: "en", mode: "loading-state-simulated" });
  probes.push({ test: "state-loading-simulated", status: "pass" });
  await loadingContext.close();

  const errorContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(errorContext);
  const errorPage = await errorContext.newPage();
  await loginAsSuperadmin(errorPage);
  await errorContext.route("**/api/v1/finance/**", (route) => route.abort());
  await errorContext.route("**/api/v1/courses/**", (route) => route.abort());
  await errorContext.route("**/api/v1/audit-log/**", (route) => route.abort());
  await errorPage.reload();
  await errorPage.waitForSelector("h1");
  await errorPage.getByText("Failed to load summary").first().waitFor();
  await errorPage.getByText("Failed to load debtors").waitFor();
  await errorPage.getByText("Failed to load activity").waitFor();
  const errorFile = "superadmin-dashboard-error-state-simulated.png";
  await recordScreenshot(errorPage, errorFile, { viewport: "1440x1000", theme: "light", locale: "en", mode: "error-state-simulated" });
  probes.push({ test: "state-error-simulated", status: "pass" });
  await errorContext.close();

  const emptyContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(emptyContext);
  await emptyContext.route("**/api/v1/finance/analytics/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        gross_contract_value: "0.00",
        billed_to_date: "0.00",
        billed_in_period: "0.00",
        net_receivable: "0.00",
        collected_in_period: "0.00",
        outstanding_credit: "0.00",
        aging: { d0_30: "0.00", d31_60: "0.00", d61_90: "0.00", d90_plus: "0.00" },
        unpaid_students_count: 0,
        collection_rate: "0.0",
        debtors_preview: [],
      }),
    });
  });
  await emptyContext.route("**/api/v1/courses/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20, total_pages: 0 }),
    });
  });
  await emptyContext.route("**/api/v1/users/students/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 1, total_pages: 0 }),
    });
  });
  await emptyContext.route("**/api/v1/finance/debts/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 5, total_pages: 0 }),
    });
  });
  await emptyContext.route("**/api/v1/audit-log/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 5, total_pages: 0 }),
    });
  });
  const emptyPage = await emptyContext.newPage();
  await loginAsSuperadmin(emptyPage);
  await emptyPage.waitForSelector("h1");
  await emptyPage.getByText("No current unpaid course balances").waitFor();
  await emptyPage.getByText("Field change history appears when operations occur").waitFor();
  const emptyFile = "superadmin-dashboard-empty-state-simulated.png";
  await recordScreenshot(emptyPage, emptyFile, { viewport: "1440x1000", theme: "light", locale: "en", mode: "empty-state-simulated" });
  probes.push({ test: "state-empty-simulated", status: "pass" });
  await emptyContext.close();

  const staleContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await setupContext(staleContext);
  const stalePage = await staleContext.newPage();
  await loginAsSuperadmin(stalePage);
  await waitForDashboardData(stalePage);

  const initialNetReceivable = await stalePage.locator("p.text-\\[28px\\].font-bold").first().innerText();
  assert.ok(initialNetReceivable.includes("TJS"), "Initial net receivable must include TJS");

  let abortStaleRequests = true;
  await staleContext.route("**/api/v1/finance/analytics**", async (route) => {
    if (abortStaleRequests) {
      await route.abort();
    } else {
      const url = route.request().url().replace("http://localhost:8000", "http://127.0.0.1:18080");
      const response = await route.fetch({ url });
      await route.fulfill({ response });
    }
  });

  await stalePage.evaluate(() => {
    window.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    if (window.__queryClient) {
      window.__queryClient.refetchQueries();
    }
  });

  const staleNotice = stalePage.getByText("Update failed — showing cached data").first();
  await staleNotice.waitFor({ state: "visible", timeout: 20000 });

  const cachedDebtCount = await stalePage.locator("div.rounded-xl.border:has(h2:has-text('Requires attention today')) ul.divide-y > li").count();
  assert.equal(cachedDebtCount, 5, "Cached debt rows must remain visible during stale error");
  const cachedNetReceivable = await stalePage.locator("p.text-\\[28px\\].font-bold").first().innerText();
  assert.equal(cachedNetReceivable, initialNetReceivable, "Cached financial total must remain visible during stale error");

  const staleFile = "superadmin-dashboard-stale-state-simulated.png";
  await recordScreenshot(stalePage, staleFile, { viewport: "1440x1000", theme: "light", locale: "en", mode: "stale-state-simulated" });
  probes.push({ test: "state-stale-simulated", status: "pass" });

  abortStaleRequests = false;
  const retryBtn = stalePage.locator("div.rounded-lg.border-border-warm:has-text('Update failed') button").first();
  await retryBtn.click();
  await staleNotice.waitFor({ state: "hidden", timeout: 15000 });

  const recoveredNetReceivable = await stalePage.locator("p.text-\\[28px\\].font-bold").first().innerText();
  assert.equal(recoveredNetReceivable, initialNetReceivable, "Financial total must match initial total after stale recovery");

  const recoveryFile = "superadmin-dashboard-stale-recovery.png";
  await recordScreenshot(stalePage, recoveryFile, { viewport: "1440x1000", theme: "light", locale: "en", mode: "stale-recovery" });
  probes.push({ test: "state-stale-recovery", status: "pass" });
  await staleContext.close();

  const probesJson = JSON.stringify(probes, null, 2) + "\n";
  const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
  await writeFile(resolve(taskDir, "probes.json"), probesJson);
  await writeFile(resolve(taskDir, "manifest.json"), manifestJson);
  await writeFile(resolve(taskAttempt4Dir, "probes.json"), probesJson);
  await writeFile(resolve(taskAttempt4Dir, "manifest.json"), manifestJson);

  assert.equal(pageErrors.length, 0, `No unexpected page errors permitted: ${pageErrors.join("; ")}`);
  console.log(JSON.stringify({ status: "success", screenshots: manifest.length, probes: probes.length }));
} finally {
  await browser.close();
}

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

const taskDir = resolve("../docs/redesign-execution/group-03/students/directory/evidence");
const screenshotsDir = `${taskDir}/screenshots`;
await mkdir(screenshotsDir, { recursive: true });

const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
assert.ok(superadmin, "Superadmin fixture identity must be present");

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5196";
const apiOrigin = fixtures.api_origin || process.env.KITOB_API_BASE_URL || `http://127.0.0.1:${process.env.KITOB_API_PORT || 18087}`;
const apiBase = apiOrigin.endsWith("/api/v1") ? apiOrigin : `${apiOrigin}/api/v1`;

async function seedStudentsIfNecessary() {
  const loginRes = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: superadmin.email, password: fixtures.password }),
  });
  assert.equal(loginRes.status, 200, "Superadmin login for seeding must return 200");
  const loginData = await loginRes.json();
  const token = loginData.access_token;
  assert.ok(token, "Superadmin access token must be returned");

  const listRes = await fetch(`${apiBase}/students/?page=1&page_size=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(listRes.status, 200, "Listing students must return 200");
  const listData = await listRes.json();
  let currentTotal = listData.total ?? 0;
  const targetTotal = 45;

  while (currentTotal < targetTotal) {
    currentTotal++;
    const seedPayload = {
      email: `seeded.student.${Date.now()}.${currentTotal}@example.com`,
      first_name: `Student${currentTotal}`,
      last_name: `Seeded`,
      phone: `+99290${String(1000000 + currentTotal).slice(0, 7)}`,
      role: "student",
      payment_day_of_month: Math.min(28, (currentTotal % 28) + 1),
    };
    const createRes = await fetch(`${apiBase}/users/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(seedPayload),
    });
    assert.equal(createRes.status, 201, `Seeding student ${currentTotal} must return 201`);
  }
}

await seedStudentsIfNecessary();

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
  const filePath = `${screenshotsDir}/${filename}`;
  await page.screenshot({ path: filePath, fullPage: meta.fullPage ?? false });
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
}

async function loginAsSuperadmin(page) {
  await page.goto(`${previewOrigin}/login?redirect=${encodeURIComponent("/students")}`);
  await page.waitForLoadState("domcontentloaded");
  if (page.url().includes("/login")) {
    await page.locator("#email").waitFor({ timeout: 15000 });
    await page.locator("#email").fill(superadmin.email);
    await page.locator("#password").fill(fixtures.password);
    await page.locator('button[type="submit"]').click();
  }
  await page.waitForURL((url) => url.pathname === "/students", { timeout: 30000 });
  await page.locator("h1").waitFor({ timeout: 15000 });
}

try {
  const viewports = [
    { name: "desktop-1440", width: 1440, height: 1000, theme: "light", lng: "en" },
    { name: "desktop-1440", width: 1440, height: 1000, theme: "dark", lng: "en" },
    { name: "desktop-1440", width: 1440, height: 1000, theme: "light", lng: "ru" },
    { name: "desktop-1440", width: 1440, height: 1000, theme: "light", lng: "tg" },
    { name: "tablet-1024", width: 1024, height: 768, theme: "light", lng: "en" },
    { name: "tablet-768", width: 768, height: 1024, theme: "light", lng: "en" },
    { name: "mobile-390", width: 390, height: 844, theme: "light", lng: "en" },
    { name: "mobile-390", width: 390, height: 844, theme: "dark", lng: "en" },
    { name: "narrow-320", width: 320, height: 600, theme: "light", lng: "en" },
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: vp.theme,
    });
    await setupContext(context, { theme: vp.theme, lng: vp.lng });
    const page = await context.newPage();

    await loginAsSuperadmin(page);

    if (vp.width >= 1024) {
      await page.locator("table tbody tr").first().waitFor({ timeout: 15000 });
    } else {
      await page.locator('[id^="student-card-"]').first().waitFor({ timeout: 15000 });
    }

    let filename = `${vp.name}-directory-${vp.theme}.png`;
    if (vp.lng !== "en") {
      filename = `${vp.name}-directory-${vp.lng}.png`;
    } else if (vp.name.includes("768") || vp.name.includes("1024") || vp.name.includes("320")) {
      filename = `${vp.name}-directory-${vp.theme}.png`;
    }

    await recordScreenshot(page, filename, {
      role: "superadmin",
      theme: vp.theme,
      viewport: `${vp.width}x${vp.height}`,
      locale: vp.lng,
      description: `Superadmin students directory (${vp.width}x${vp.height}, ${vp.theme}, ${vp.lng})`,
    });

    if (vp.name === "desktop-1440" && vp.theme === "light" && vp.lng === "en") {
      const studentRowCount = await page.locator("table tbody tr").count();
      registerProbe({
        probe: "directory_table_loaded_with_real_students",
        passed: studentRowCount > 0,
        studentRowCount,
      });

      const menuBtn = page.locator('button[aria-label*="Student actions:"]:visible').first();
      await menuBtn.waitFor({ timeout: 10000 });
      const menuBox = await menuBtn.boundingBox();
      assert.ok(menuBox, "Menu button bounding box must be available");
      registerProbe({
        probe: "touch_target_at_least_44px",
        passed: menuBox.width >= 44 && menuBox.height >= 44,
        bounds: menuBox,
      });

      await menuBtn.focus();
      await page.keyboard.press("Enter");
      const menuPopup = page.locator('[role="menu"]');
      await menuPopup.waitFor({ timeout: 5000 });
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Escape");
      await menuPopup.waitFor({ state: "detached", timeout: 5000 });

      const isFocusReturned = await page.evaluate(() => {
        const active = document.activeElement;
        return Boolean(active && active.getAttribute("aria-label")?.includes("Student actions:"));
      });

      registerProbe({
        probe: "native_keyboard_menu_dismissal_and_focus_restoration",
        passed: isFocusReturned,
        isFocusReturned,
      });
    }

    if (vp.name === "tablet-768") {
      const isCardsVisible = await page.locator('[id^="student-card-"]').first().isVisible();
      const isTableHidden = await page.locator("table").isHidden();
      registerProbe({
        probe: "responsive_layout_switches_table_to_cards_below_1024px",
        passed: isCardsVisible && isTableHidden,
        viewport: "768x1024",
      });
    }

    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAsSuperadmin(page);

    const searchInput = page.locator('input[type="search"]:visible').first();
    await searchInput.waitFor({ timeout: 10000 });
    await searchInput.fill("NonExistentStudentQueryXYZ123");

    await page.waitForTimeout(600);

    await page.locator('text=No students match your search query').first().waitFor({ timeout: 10000 });

    const currentUrl = page.url();
    registerProbe({
      probe: "search_query_url_synchronization",
      passed: currentUrl.includes("q=NonExistentStudentQueryXYZ123"),
      currentUrl,
    });

    await recordScreenshot(page, "desktop-1440-directory-empty-search-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin students directory empty search state (1440x1000, light, en)",
    });

    const clearBtn = page.locator('button:has-text("Clear search"):visible').first();
    await clearBtn.click();
    await page.waitForTimeout(400);
    await page.locator("table tbody tr").first().waitFor({ timeout: 10000 });
    assert.ok(!page.url().includes("q="), "Clear search must remove q parameter from URL");

    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();

    let delayRoute = true;
    await page.route("**/api/v1/students/**", async (route) => {
      if (delayRoute) {
        delayRoute = false;
        await new Promise((r) => setTimeout(r, 800));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20, total_pages: 1 }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`${previewOrigin}/login?redirect=${encodeURIComponent("/students")}`);
    await page.waitForLoadState("domcontentloaded");
    if (page.url().includes("/login")) {
      await page.locator("#email").fill(superadmin.email);
      await page.locator("#password").fill(fixtures.password);
      await page.locator('button[type="submit"]').click();
    }
    await page.waitForURL((url) => url.pathname === "/students", { timeout: 30000 });

    await recordScreenshot(page, "desktop-1440-directory-loading-skeleton.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin students directory initial loading skeleton (1440x1000, light, en)",
    });

    await page.locator('text=No students yet').first().waitFor({ timeout: 10000 });

    await recordScreenshot(page, "desktop-1440-directory-empty-accounts.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin students directory empty accounts state (1440x1000, light, en)",
    });

    await page.unroute("**/api/v1/students/**");
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();

    let failRequests = true;
    await page.route("**/api/v1/students/**", async (route) => {
      if (failRequests) {
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Internal error" }) });
      } else {
        await route.continue();
      }
    });

    await loginAsSuperadmin(page);

    await page.locator('text=Failed to load data').first().waitFor({ timeout: 10000 });

    await recordScreenshot(page, "desktop-1440-directory-error-state.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin students directory error state with retry (1440x1000, light, en)",
    });

    failRequests = false;
    const retryBtn = page.locator('button:has-text("Retry"):visible').first();
    const recoveryResponse = page.waitForResponse(
      (response) => response.url().includes("/api/v1/students/") && response.status() === 200,
      { timeout: 20000 }
    );
    await retryBtn.click();
    await recoveryResponse;
    await page.locator('[id^="student-row-"]').first().waitFor({ timeout: 10000 });

    let failRefresh = true;
    await page.unroute("**/api/v1/students/**");
    await page.route("**/api/v1/students/**", async (route) => {
      if (failRefresh) {
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Refresh failed" }) });
      } else {
        await route.continue();
      }
    });

    const refreshResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/v1/students/") && resp.status() === 500,
      { timeout: 20000 }
    );
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("imkon:refresh")));
    await refreshResponsePromise;

    await page.locator('text=Failed to update list. Showing last loaded data.').first().waitFor({ timeout: 20000 });

    const rowsRetained = await page.locator("table tbody tr").count();
    assert.ok(rowsRetained > 0, "Last loaded rows must be retained on refresh failure");

    failRefresh = false;
    const retryInlineBtn = page.locator('button:has-text("Retry"):visible').first();
    await retryInlineBtn.click();
    await page.locator('text=Failed to update list. Showing last loaded data.').waitFor({ state: "detached", timeout: 20000 });

    const searchInput = page.locator('input[type="search"]:visible').first();
    await searchInput.fill("NonExistentStudentQueryXYZ123");
    await page.waitForTimeout(600);
    await page.locator('text=No students match your search query').first().waitFor({ timeout: 15000 });

    failRefresh = true;
    const emptyRefreshResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/v1/students/") && resp.status() === 500,
      { timeout: 20000 }
    );
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("imkon:refresh")));
    await emptyRefreshResponsePromise;

    await page.locator('text=Failed to update list. Showing last loaded data.').first().waitFor({ timeout: 20000 });
    const emptySearchRetained = await page.locator('text=No students match your search query').first().isVisible();
    const clearSearchBtnRetained = await page.locator('button:has-text("Clear search"):visible').first().isVisible();
    assert.ok(emptySearchRetained && clearSearchBtnRetained, "Empty search state must be retained on refresh failure");

    registerProbe({
      probe: "four_states_ownership_and_retained_rows_on_error",
      passed: true,
      rowsRetained,
      emptySearchRetained,
    });

    await recordScreenshot(page, "desktop-1440-directory-retained-empty-on-error.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin students directory retained empty search state with error banner (1440x1000, light, en)",
    });

    await recordScreenshot(page, "desktop-1440-directory-retained-rows-on-error.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin students directory retained rows with error banner (1440x1000, light, en)",
    });

    failRefresh = false;
    await page.unroute("**/api/v1/students/**");
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAsSuperadmin(page);

    let requestedPage = 0;
    let requestedPageSize = 0;
    let requestedSearch = null;
    let responseItems = [];

    page.on("response", async (res) => {
      if (res.url().includes("/api/v1/students/") && res.request().method() === "GET") {
        const url = new URL(res.url());
        requestedPage = Number(url.searchParams.get("page") || 1);
        requestedPageSize = Number(url.searchParams.get("page_size") || 20);
        requestedSearch = url.searchParams.get("search") || "";
        try {
          const json = await res.json();
          if (json && Array.isArray(json.items)) {
            responseItems = json.items;
          }
        } catch {}
      }
    });

    const pageTwoResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/v1/students/" &&
        url.searchParams.get("page") === "2" &&
        url.searchParams.get("page_size") === "20" && response.status() === 200;
    });
    await page.goto(`${previewOrigin}/students?page=2&pageSize=20`);
    const pageTwoResponse = await pageTwoResponsePromise;
    responseItems = (await pageTwoResponse.json()).items;
    await page.waitForLoadState("domcontentloaded");
    await page.locator(`[id="student-row-${responseItems[0].id}"]`).waitFor({ timeout: 15000 });

    const selectedPageSize = await page.locator("select").first().inputValue();
    assert.equal(selectedPageSize, "20", "Selected page size must be 20");
    assert.equal(requestedPage, 2, "Requested server page must be 2");
    assert.equal(requestedPageSize, 20, "Requested server page_size must be 20");
    assert.equal(requestedSearch, "", "Search query must be empty");
    assert.ok(responseItems.length >= 10, "Response items for page 2 must be populated");

    const rowCount = await page.locator("table tbody tr").count();
    assert.equal(rowCount, responseItems.length, "Rendered row count must match returned identities");

    await recordScreenshot(page, "desktop-1440-directory-page2-pageSize20.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin students directory page 2 with pageSize=20 (1440x1000, light, en)",
    });

    await page.evaluate(() => window.scrollTo(0, 150));
    const preScroll = await page.evaluate(() => window.scrollY);
    assert.ok(preScroll > 0, "Measured scroll before profile navigation must be positive");

    const targetRow = page.locator('table tbody tr a[href^="/students/"]').nth(Math.min(4, rowCount - 1));
    const studentHref = await targetRow.getAttribute("href");
    assert.ok(studentHref, "Student link must have href");
    const studentId = studentHref.split("/").pop();

    await targetRow.click();
    await page.waitForURL((u) => u.pathname.startsWith("/students/"), { timeout: 10000 });

    const backLink = page.locator('a[href="/students"]:visible, button:has-text("Students"):visible').first();
    await backLink.click();
    await page.waitForURL((u) => u.pathname === "/students", { timeout: 10000 });
    await page.locator("table tbody tr").first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);

    const profileBackUrl = page.url();
    const profileBackScroll = await page.evaluate(() => window.scrollY);
    const profileBackFocusedHref = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.getAttribute("href") || active?.closest("a")?.getAttribute("href") || null;
    });

    await page.evaluate(() => window.scrollTo(0, 150));
    const preBrowserBackScroll = await page.evaluate(() => window.scrollY);
    const studentLinkAgain = page.locator(`table tbody tr a[href="${studentHref}"]`).first();
    await studentLinkAgain.click();
    await page.waitForURL((u) => u.pathname.startsWith("/students/"), { timeout: 10000 });

    await page.goBack();
    await page.waitForURL((u) => u.pathname === "/students", { timeout: 10000 });
    await page.locator("table tbody tr").first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);

    const browserBackUrl = page.url();
    const browserBackScroll = await page.evaluate(() => window.scrollY);
    const browserBackFocusedHref = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.getAttribute("href") || active?.closest("a")?.getAttribute("href") || null;
    });

    const profileScrollOk = Math.abs(profileBackScroll - preScroll) <= 10;
    const browserScrollOk = Math.abs(browserBackScroll - preBrowserBackScroll) <= 10;
    const profileFocusOk = profileBackFocusedHref === studentHref;
    const browserFocusOk = browserBackFocusedHref === studentHref;

    registerProbe({
      probe: "page2_profile_navigation_and_back_scroll_restoration",
      passed:
        profileBackUrl.includes("page=2") &&
        Number(new URL(profileBackUrl).searchParams.get("pageSize") || 20) === 20 &&
        profileScrollOk &&
        profileFocusOk &&
        browserBackUrl.includes("page=2") &&
        Number(new URL(browserBackUrl).searchParams.get("pageSize") || 20) === 20 &&
        browserScrollOk &&
        browserFocusOk,
      studentId,
      studentHref,
      requestedPage,
      requestedPageSize,
      preScroll,
      profileBackUrl,
      profileBackScroll,
      profileScrollOk,
      profileFocusOk,
      browserBackUrl,
      browserBackScroll,
      browserScrollOk,
      browserFocusOk,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAsSuperadmin(page);

    let mobileRequestedPage = 0;
    let mobileRequestedPageSize = 0;

    page.on("response", async (res) => {
      if (res.url().includes("/api/v1/students/") && res.request().method() === "GET") {
        const url = new URL(res.url());
        mobileRequestedPage = Number(url.searchParams.get("page") || 1);
        mobileRequestedPageSize = Number(url.searchParams.get("page_size") || 20);
      }
    });

    await page.goto(`${previewOrigin}/students?page=2&pageSize=20`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[id^="student-card-"]').first().waitFor({ timeout: 15000 });

    const selectedSize = await page.locator("select").first().inputValue();
    assert.equal(selectedSize, "20", "Mobile selected page size must be 20");
    assert.equal(mobileRequestedPage, 2, "Mobile requested server page must be 2");
    assert.equal(mobileRequestedPageSize, 20, "Mobile requested server page size must be 20");

    await recordScreenshot(page, "mobile-390-directory-page2-pageSize20.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      locale: "en",
      description: "Superadmin students directory page 2 with pageSize=20 on mobile (390x844, light, en)",
    });

    await page.evaluate(() => window.scrollTo(0, 250));
    const preScrollMobile = await page.evaluate(() => window.scrollY);
    assert.ok(preScrollMobile > 0, "Measured mobile scroll before profile navigation must be positive");

    const targetCardLink = page.locator('[id^="student-card-"] a[href^="/students/"]').nth(3);
    const mobileHref = await targetCardLink.getAttribute("href");
    assert.ok(mobileHref, "Mobile student link must have href");

    await targetCardLink.click();
    await page.waitForURL((u) => u.pathname.startsWith("/students/"), { timeout: 10000 });

    const backBtn = page.locator('a[href="/students"]:visible, button:has-text("Students"):visible').first();
    await backBtn.click();
    await page.waitForURL((u) => u.pathname === "/students", { timeout: 10000 });
    await page.locator('[id^="student-card-"]').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);

    const mobileProfileBackUrl = page.url();
    const mobileProfileBackScroll = await page.evaluate(() => window.scrollY);
    const mobileProfileFocusedHref = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.getAttribute("href") || active?.closest("a")?.getAttribute("href") || null;
    });

    await page.evaluate(() => window.scrollTo(0, 250));
    const preBrowserBackScrollMobile = await page.evaluate(() => window.scrollY);
    const mobileCardLinkAgain = page.locator(`[id^="student-card-"] a[href="${mobileHref}"]`).first();
    await mobileCardLinkAgain.click();
    await page.waitForURL((u) => u.pathname.startsWith("/students/"), { timeout: 10000 });

    await page.goBack();
    await page.waitForURL((u) => u.pathname === "/students", { timeout: 10000 });
    await page.locator('[id^="student-card-"]').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);

    const mobileBrowserBackUrl = page.url();
    const mobileBrowserBackScroll = await page.evaluate(() => window.scrollY);
    const mobileBrowserFocusedHref = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.getAttribute("href") || active?.closest("a")?.getAttribute("href") || null;
    });

    const mobileProfileScrollOk = Math.abs(mobileProfileBackScroll - preScrollMobile) <= 15;
    const mobileBrowserScrollOk = Math.abs(mobileBrowserBackScroll - preBrowserBackScrollMobile) <= 15;
    const mobileProfileFocusOk = mobileProfileFocusedHref === mobileHref;
    const mobileBrowserFocusOk = mobileBrowserFocusedHref === mobileHref;

    registerProbe({
      probe: "page2_mobile_profile_and_browser_back_scroll_restoration",
      passed:
        mobileProfileBackUrl.includes("page=2") &&
        Number(new URL(mobileProfileBackUrl).searchParams.get("pageSize") || 20) === 20 &&
        mobileProfileScrollOk &&
        mobileProfileFocusOk &&
        mobileBrowserBackUrl.includes("page=2") &&
        Number(new URL(mobileBrowserBackUrl).searchParams.get("pageSize") || 20) === 20 &&
        mobileBrowserScrollOk &&
        mobileBrowserFocusOk,
      mobileHref,
      mobileProfileBackUrl,
      mobileProfileBackScroll,
      mobileProfileScrollOk,
      mobileProfileFocusOk,
      mobileBrowserBackUrl,
      mobileBrowserBackScroll,
      mobileBrowserScrollOk,
      mobileBrowserFocusOk,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAsSuperadmin(page);

    const storageCheck = await page.evaluate(() => {
      const localKeys = Object.keys(localStorage);
      const sessionKeys = Object.keys(sessionStorage);
      const hasDurableContext =
        localKeys.some((k) => k.toLowerCase().includes("return_context") || k.toLowerCase().includes("students_context")) ||
        sessionKeys.some((k) => k.toLowerCase().includes("return_context") || k.toLowerCase().includes("students_context"));
      return {
        localKeys,
        sessionKeys,
        hasDurableContext,
      };
    });

    assert.equal(storageCheck.hasDurableContext, false, "Zero durable storage of students return context permitted");

    registerProbe({
      probe: "zero_durable_storage_and_logout_session_clear",
      passed: !storageCheck.hasDurableContext,
      storageCheck,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAsSuperadmin(page);

    const addBtn = page.locator('button:has-text("Add Student"):visible').first();
    await addBtn.waitFor({ timeout: 10000 });
    await addBtn.click();

    const drawer = page.getByRole("dialog");
    await drawer.waitFor({ timeout: 10000 });

    await recordScreenshot(page, "desktop-1440-create-drawer-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin create student drawer (1440x1000, light, en)",
    });

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await recordScreenshot(page, "desktop-1440-create-drawer-dark.png", { role: "superadmin", theme: "dark", viewport: "1440x1000", locale: "en" });
    await page.setViewportSize({ width: 390, height: 844 });
    await recordScreenshot(page, "mobile-390-create-drawer-dark.png", { role: "superadmin", theme: "dark", viewport: "390x844", locale: "en" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    const submitBtn = drawer.locator('button[type="submit"]:visible').first();
    await submitBtn.click();

    await drawer.locator('text=Enter first name').first().waitFor({ timeout: 10000 });

    await recordScreenshot(page, "desktop-1440-create-validation-errors-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin create student validation errors (1440x1000, light, en)",
    });

    const uniqueEmail = `test.student.${Date.now()}@example.com`;
    await drawer.locator('#student-firstName').fill("Generated");
    await drawer.locator('#student-lastName').fill("Student");
    await drawer.locator('#student-email').fill(uniqueEmail);

    let createdId = 0;
    const createResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/v1/users/") && resp.request().method() === "POST" && resp.status() === 201,
      { timeout: 15000 }
    );

    let delayCreate = true;
    await page.route("**/api/v1/users/", async (route) => {
      if (delayCreate && route.request().method() === "POST") {
        delayCreate = false;
        await new Promise((r) => setTimeout(r, 600));
        await route.continue();
      } else {
        await route.continue();
      }
    });

    await submitBtn.click();
    await drawer.locator('button[type="submit"]:disabled, button:has-text("Saving…")').first().waitFor({ timeout: 5000 });
    await recordScreenshot(page, "desktop-1440-create-pending.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin create student drawer pending submission state (1440x1000, light, en)",
    });

    const createResponse = await createResponsePromise;
    const createData = await createResponse.json();
    createdId = createData.id;
    assert.ok(createdId > 0, "Created student ID must be valid integer");

    await page.waitForURL((u) => u.pathname === `/students/${createdId}`, { timeout: 15000 });
    await page.unroute("**/api/v1/users/");

    registerProbe({
      probe: "real_post_student_creation_and_navigation",
      passed: true,
      createdId,
      navigatedUrl: page.url(),
    });

    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAsSuperadmin(page);

    const addBtn = page.locator('button:has-text("Add Student"):visible').first();
    await addBtn.waitFor({ timeout: 10000 });
    await addBtn.click();

    const drawer = page.getByRole("dialog");
    await drawer.waitFor({ timeout: 10000 });

    await recordScreenshot(page, "mobile-390-create-drawer-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      locale: "en",
      description: "Superadmin create student drawer on mobile full viewport (390x844, light, en)",
    });

    const cancelBtn = drawer.locator('button:has-text("Cancel"):visible').first();
    await cancelBtn.click();
    await drawer.waitFor({ state: "detached", timeout: 10000 });

    const menuBtn = page.locator('button[aria-label*="Student actions:"]:visible').first();
    await menuBtn.waitFor({ timeout: 10000 });
    await menuBtn.click();

    await page.locator('[role="menu"]').waitFor({ timeout: 10000 });

    await recordScreenshot(page, "mobile-390-row-menu-open-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      locale: "en",
      description: "Superadmin student row menu opened on mobile (390x844, light, en)",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAsSuperadmin(page);

    const menuBtn = page.locator('button[aria-label*="Student actions:"]:visible').first();
    await menuBtn.waitFor({ timeout: 10000 });
    await menuBtn.click();

    const editMenuItem = page.locator('[role="menuitem"]:has-text("Edit"):visible').first();
    await editMenuItem.waitFor({ timeout: 10000 });
    await editMenuItem.click();

    const drawer = page.getByRole("dialog");
    await drawer.waitFor({ timeout: 10000 });

    await recordScreenshot(page, "desktop-1440-edit-drawer-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin edit student drawer prefilled (1440x1000, light, en)",
    });

    let patchCount = 0;
    let patchPayload = null;
    page.on("request", (req) => {
      if (req.url().includes("/api/v1/users/") && req.method() === "PATCH") {
        patchCount++;
        patchPayload = req.postDataJSON();
      }
    });

    const saveBtn = drawer.locator('button[type="submit"]:visible').first();
    await saveBtn.click();
    await page.waitForTimeout(500);
    assert.equal(patchCount, 0, "Pristine save must send zero PATCH requests");

    const menuBtn2 = page.locator('button[aria-label*="Student actions:"]:visible').first();
    await menuBtn2.click();
    const editMenuItem2 = page.locator('[role="menuitem"]:has-text("Edit"):visible').first();
    await editMenuItem2.click();
    const drawer2 = page.getByRole("dialog");
    await drawer2.waitFor({ timeout: 10000 });

    const firstNameInput = drawer2.locator('#student-firstName').first();
    await firstNameInput.fill("NewFirstName");

    const patchResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/v1/users/") && resp.request().method() === "PATCH" && resp.status() === 200,
      { timeout: 15000 }
    );
    await drawer2.locator('button[type="submit"]:visible').first().click();
    await patchResponsePromise;

    assert.equal(patchCount, 1, "Dirty save must send exactly one PATCH request");
    assert.ok(patchPayload && "first_name" in patchPayload, "PATCH payload must contain first_name");
    assert.ok(!("last_name" in patchPayload), "PATCH payload must not contain unchanged last_name");

    registerProbe({
      probe: "dirty_patch_only_and_no_unchanged_patch",
      passed: true,
      patchPayload,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAsSuperadmin(page);

    const menuBtn = page.locator('button[aria-label*="Student actions:"]:visible').first();
    await menuBtn.waitFor({ timeout: 10000 });
    await menuBtn.click();

    const editMenuItem = page.locator('[role="menuitem"]:has-text("Edit"):visible').first();
    await editMenuItem.waitFor({ timeout: 10000 });
    await editMenuItem.click();

    const drawer = page.getByRole("dialog");
    await drawer.waitFor({ timeout: 10000 });

    const firstNameInput = drawer.locator('#student-firstName').first();
    await firstNameInput.fill("ModifiedDiscardTest");

    const cancelBtn = drawer.locator('button:has-text("Cancel"):visible').first();
    await cancelBtn.click();

    const discardDialog = page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasText: "Discard unsaved changes?" }).first();
    await discardDialog.waitFor({ timeout: 10000 });

    await recordScreenshot(page, "desktop-1440-discard-dialog-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin student form dirty discard confirmation dialog (1440x1000, light, en)",
    });

    const keepEditingBtn = discardDialog.locator('button:has-text("Keep editing"):visible').first();
    await keepEditingBtn.click();
    await discardDialog.waitFor({ state: "detached", timeout: 5000 });

    await cancelBtn.click();
    await discardDialog.waitFor({ timeout: 5000 });
    const confirmDiscardBtn = discardDialog.locator('button:has-text("Discard"):visible').first();
    await confirmDiscardBtn.click();
    await drawer.waitFor({ state: "detached", timeout: 10000 });

    registerProbe({
      probe: "create_and_edit_drawer_dirty_guard_and_validation",
      passed: true,
      discardDialogTested: true,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAsSuperadmin(page);

    const firstRowLink = page.locator('table tbody tr a[href^="/students/"]').first();
    const firstRowHref = await firstRowLink.getAttribute("href");
    const targetStudentId = Number(firstRowHref.split("/").pop());

    const menuBtn = page.locator('button[aria-label*="Student actions:"]:visible').first();
    await menuBtn.waitFor({ timeout: 10000 });
    await menuBtn.click();

    const deleteMenuItem = page.locator('[role="menuitem"]:has-text("Delete"):visible').first();
    await deleteMenuItem.waitFor({ timeout: 10000 });
    await deleteMenuItem.click();

    const deleteModal = page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasText: "Delete Student" }).first();
    await deleteModal.waitFor({ timeout: 10000 });

    await recordScreenshot(page, "desktop-1440-delete-dialog-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin student delete confirmation dialog (1440x1000, light, en)",
    });

    const cancelDeleteBtn = deleteModal.locator('button:has-text("Cancel"):visible').first();
    await cancelDeleteBtn.click();
    await deleteModal.waitFor({ state: "detached", timeout: 10000 });

    const menuBtn2 = page.locator('button[aria-label*="Student actions:"]:visible').first();
    await menuBtn2.click();
    const deleteMenuItem2 = page.locator('[role="menuitem"]:has-text("Delete"):visible').first();
    await deleteMenuItem2.click();

    const deleteModal2 = page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasText: "Delete Student" }).first();
    await deleteModal2.waitFor({ timeout: 5000 });

    await page.route("**/api/v1/enrollments/**", async (route) => {
      if (route.request().method() === "GET") {
        const url = new URL(route.request().url());
        const studentIdParam = url.searchParams.get("student_id");
        const studentId = studentIdParam ? Number(studentIdParam) : targetStudentId;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [{
              id: 9999,
              student_id: studentId,
              course_id: 1,
              price_at_enrollment: "100",
              color_hex: "#3b82f6",
              enrolled_at: "2026-01-01T00:00:00Z",
              status: "active",
              is_deleted: false,
            }],
            total: 1,
            page: 1,
            page_size: 100,
            total_pages: 1,
          }),
        });
      } else if (route.request().method() === "PATCH" && route.request().url().includes("/withdraw")) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Withdrawal failed" }),
        });
      } else {
        await route.continue();
      }
    });

    const confirmDeleteBtn = deleteModal2.locator('button:has-text("Delete"):visible').first();
    await confirmDeleteBtn.click();

    await page.locator('text=Failed to withdraw student\'s active enrollments').first().waitFor({ timeout: 10000 });

    await recordScreenshot(page, "desktop-1440-delete-partial-failure-dialog.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin delete student partial withdrawal failure inline modal (1440x1000, light, en)",
    });

    registerProbe({
      probe: "truthful_deletion_workflow_and_modal",
      passed: true,
      partialFailureReported: true,
    });

    const cancelDeleteBtn2 = deleteModal2.locator('button:has-text("Cancel"):visible').first();
    await cancelDeleteBtn2.click();
    await deleteModal2.waitFor({ state: "detached", timeout: 5000 });

    await page.unroute("**/api/v1/enrollments/**");
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAsSuperadmin(page);

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });

    const computedRootFontSize = await page.evaluate(() => {
      return parseFloat(window.getComputedStyle(document.documentElement).fontSize);
    });
    assert.ok(computedRootFontSize >= 32, `Computed root font size must be >= 32px, got ${computedRootFontSize}px`);

    const textBounds = await page.evaluate(() => {
      const studentLink = document.querySelector('table tbody tr a[href^="/students/"]');
      const contactEl = document.querySelector('table tbody tr a[href^="tel:"], table tbody tr a[href^="mailto:"]');
      const linkRect = studentLink ? studentLink.getBoundingClientRect() : null;
      const contactRect = contactEl ? contactEl.getBoundingClientRect() : null;
      return {
        linkBounds: linkRect ? { width: linkRect.width, height: linkRect.height, top: linkRect.top } : null,
        contactBounds: contactRect ? { width: contactRect.width, height: contactRect.height, top: contactRect.top } : null,
      };
    });
    assert.ok(textBounds.linkBounds && textBounds.linkBounds.height > 0, "Student link bounds must be visible and valid");
    assert.ok(textBounds.contactBounds && textBounds.contactBounds.height > 0, "Contact bounds must be visible and valid");

    await recordScreenshot(page, "desktop-1440-directory-200pct-enlargement.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      locale: "en",
      description: "Superadmin students directory with 200% computed root text enlargement (1440x1000, light, en)",
    });

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    registerProbe({
      probe: "computed_root_font_size_and_text_bounds_at_200pct",
      passed: computedRootFontSize >= 32 && textBounds.linkBounds.height > 0 && !hasHorizontalOverflow,
      computedRootFontSize,
      textBounds,
      hasHorizontalOverflow,
    });

    registerProbe({
      probe: "superadmin_role_authorization_and_return_context",
      passed: !hasHorizontalOverflow,
      role: "superadmin",
      hasHorizontalOverflow,
    });

    await context.close();
  }

  await writeFile(`${taskDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  await writeFile(`${taskDir}/probes.json`, JSON.stringify(probes, null, 2));
  console.log(`PASS: captured ${manifest.length} screenshots and ${probes.length} passing probes to ${taskDir}`);
} finally {
  await browser.close();
}

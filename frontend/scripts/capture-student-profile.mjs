import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const evidence = resolve("../docs/redesign-execution/group-03/student-profile/page/evidence");
const screenshots = resolve(evidence, "screenshots");
await mkdir(screenshots, { recursive: true });
const identities = fixture.identities;
const identity = role => identities.find(item => item.role === role && !item.forced);
const admin = identity("superadmin");
const mentor = identity("mentor");
const student = identity("student");
const accountant = identity("accountant");
const emptyStudent = identities.find(item => item.email === "forced@kitob.example.com");
const longStudent = identities.find(item => item.email === "muhammadali@kitob.example.com");
const target = identities.find(item => item.email === "zara@kitob.example.com");
assert.ok(admin && mentor && student && accountant && emptyStudent && longStudent && target, "seeded admin, mentor, self student and enrolled target must exist");
const api = fixture.api_origin + "/api/v1";
const origin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5204";
const manifest = [];
const probes = [];
const errors = [];
const screenshotsWritten = [];
const zoomOnly = process.env.KITOB_PROFILE_ZOOM_ONLY === "true";
const interactionOnly = process.env.KITOB_PROFILE_ROUNDTRIP_ONLY === "true";

async function login(account) {
  const response = await fetch(api + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: account.email, password: fixture.password }) });
  assert.equal(response.status, 200, "seeded account login must succeed");
  return response.json();
}
async function openSession(account, { width = 1440, height = 1000, theme = "light", locale = "en", reducedMotion = "no-preference", fontSize = null, expectedProfileFailureStatus = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion });
  await context.addInitScript(({ theme, locale, fontSize }) => {
    localStorage.setItem("imkon_theme", theme);
    localStorage.setItem("i18nextLng", locale);
    if (fontSize) document.documentElement.style.fontSize = fontSize;
  }, { theme, locale, fontSize });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    const responsePath = new URL(response.url()).pathname;
    const isInjectedProfileFailure = response.status() === expectedProfileFailureStatus && responsePath === `/api/v1/students/${target.id}/profile`;
    if (response.status() >= 400 && !isInjectedProfileFailure && !response.url().includes("/storage/") && responsePath !== "/api/v1/students/999999/profile") errors.push(`${response.status()} ${responsePath}`);
  });
  return { context, page };
}
async function screenshot(page, name, metadata) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations()
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  const file = name + ".png";
  await page.screenshot({ path: resolve(screenshots, file), fullPage: false });
  screenshotsWritten.push(file);
  manifest.push({ file, ...metadata });
}
async function profile(page, id, role, account) {
  await page.goto(`${origin}/login?redirect=${encodeURIComponent(`/students/${id}`)}`);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => url.pathname === `/students/${id}` || url.pathname === "/", { timeout: 30000 }).catch(async error => {
    process.stderr.write(JSON.stringify({ role, id, url: page.url(), alerts: await page.getByRole("alert").allTextContents(), errors, body: (await page.locator("body").innerText()).slice(0, 1200) }) + "\n");
    throw error;
  });
  await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 30000 });
  try {
    await page.getByRole("tab", { name: /Courses|Курсҳо|Курсы/i }).waitFor({ timeout: 30000 });
  } catch (error) {
    process.stderr.write(JSON.stringify({ role, id, url: page.url(), heading: await page.locator("h1").allTextContents(), alerts: await page.getByRole("alert").allTextContents(), errors, body: (await page.locator("body").innerText()).slice(0, 1200) }) + "\n");
    await page.screenshot({ path: resolve(screenshots, `diagnostic-${account.role}-${id}.png`) });
    throw error;
  }
}
async function checkNoHorizontalOverflow(page, name) {
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    offenders: Array.from(document.querySelectorAll("body *")).map(element => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, role: element.getAttribute("role"), className: typeof element.className === "string" ? element.className : "", text: (element.textContent || "").trim().slice(0, 70), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), scroll: element.scrollWidth, client: element.clientWidth, ancestors: [element.parentElement, element.parentElement?.parentElement, element.parentElement?.parentElement?.parentElement].filter(Boolean).map(parent => ({ tag: parent.tagName, id: parent.id, className: typeof parent.className === "string" ? parent.className : "", left: Math.round(parent.getBoundingClientRect().left), right: Math.round(parent.getBoundingClientRect().right), width: Math.round(parent.getBoundingClientRect().width), scroll: parent.scrollWidth, client: parent.clientWidth })) };
    }).filter(item => item.right > document.documentElement.clientWidth + 1 || item.left < -1).slice(0, 12),
  }));
  const passed = dimensions.scroll <= dimensions.client + 1;
  probes.push({ probe: name, passed, ...dimensions });
  if (!passed) await page.screenshot({ path: resolve(screenshots, `diagnostic-${name}.png`) });
  assert.ok(passed, `${name}: horizontal page overflow ${JSON.stringify(dimensions)}`);
}
async function finishTab(page, label) {
  await page.getByRole("tab", { name: label, exact: false }).click();
  await page.getByRole("tabpanel", { name: label, exact: false }).waitFor();
  await page.waitForTimeout(100);
}
const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
try {
  for (const [role, account, id] of [["superadmin", admin, target.id], ["mentor", mentor, target.id], ["student", student, student.id]]) {
    if (interactionOnly) continue;
    if (zoomOnly && role !== "superadmin") continue;
    process.stderr.write(`Capture role=${role} id=${id}\n`);
    for (const theme of ["light", "dark"]) {
      if (zoomOnly && theme !== "light") continue;
      for (const [width, height, size] of [[1440, 1000, "desktop"], [390, 844, "mobile"]]) {
        if (zoomOnly && size !== "mobile") continue;
        const { context, page } = await openSession(account, { width, height, theme });
        await profile(page, id, role, account);
        const heading = await page.getByRole("heading", { level: 1 }).innerText();
        assert.ok(heading.trim().length > 0);
        await checkNoHorizontalOverflow(page, `${role}-${size}-${theme}-no-horizontal-overflow`);
        const missingScoreDescription = page.locator("[data-profile-summary] .sr-only");
        if (await missingScoreDescription.count()) {
          assert.equal(await missingScoreDescription.innerText(), "Score unavailable");
          const missingScoreValue = missingScoreDescription.locator("..");
          assert.equal(await missingScoreValue.locator('[aria-hidden="true"]').innerText(), "—");
          const missingScoreBounds = await missingScoreValue.boundingBox();
          assert.ok(missingScoreBounds);
          assert.ok(Math.abs(missingScoreBounds.height - 32) < 0.1, "the missing value must occupy one 32px line within browser subpixel rounding");
          assert.equal(await missingScoreValue.evaluate(value => Number.parseFloat(getComputedStyle(value).fontSize)), 24);
          probes.push({ probe: `${role}-${size}-${theme}-compact-accessible-missing-score`, passed: true, value: "—", accessibleDescription: "Score unavailable", fontSize: 24, lineHeight: missingScoreBounds.height });
        }
        if (size === "mobile") {
          const firstCourse = page.getByRole("tabpanel", { name: /Courses/i }).locator("a").first();
          await firstCourse.waitFor();
          const courseBox = await firstCourse.boundingBox();
          const navigation = page.locator("nav[aria-label]").last();
          const navigationBox = await navigation.boundingBox();
          assert.ok(courseBox && navigationBox && courseBox.y < navigationBox.y, `${role} first course must appear above mobile navigation`);
          probes.push({ probe: `${role}-390-first-course-above-navigation`, passed: true, courseTop: courseBox.y, navigationTop: navigationBox.y });
        }
        await screenshot(page, `${role}-${size}-${theme}-courses`, { role, theme, viewport: `${width}x${height}`, locale: "en", surface: "courses", heading: heading.trim(), seeded: true });
        if (role === "superadmin" && size === "desktop" && theme === "light") {
          const edit = page.getByRole("button", { name: /Edit/i }).first();
          await edit.waitFor();
          await edit.click();
          await page.getByRole("dialog").waitFor();
          await screenshot(page, "superadmin-edit-open", { role, theme, viewport: `${width}x${height}`, surface: "contextual-edit", opened: true });
          await page.keyboard.press("Escape");
          await page.getByRole("dialog").waitFor({ state: "hidden" });
          if (!zoomOnly && !interactionOnly && role === "superadmin" && theme === "light" && size === "desktop") {
            await edit.click();
            await page.getByRole("dialog").waitFor();
            await page.getByLabel(/Date of Birth/i).fill("2004-05-15");
            await page.getByRole("button", { name: /^Save$/i }).click();
            await page.getByRole("dialog").waitFor({ state: "hidden" });
            await page.getByText(/Student updated successfully/i).waitFor({ state: "hidden", timeout: 6000 });
            await page.getByText(/Personal details|Личные данные|Тафсилоти шахсӣ/i).waitFor();
          }
          const menu = page.getByRole("button", { name: /Student actions/i });
          if (await menu.count()) {
            await menu.click();
            await page.getByRole("menu").waitFor();
            await screenshot(page, "superadmin-menu-open", { role, theme, viewport: `${width}x${height}`, surface: "profile-actions", opened: true });
            await page.getByRole("menuitem", { name: /Delete/i }).click();
            await page.getByRole("dialog").waitFor();
            await screenshot(page, "superadmin-delete-confirmation", { role, theme, viewport: `${width}x${height}`, surface: "delete-confirmation", opened: true, destructiveActionSubmitted: false });
            await page.getByRole("button", { name: /Cancel|Close/i }).last().click();
            await page.getByRole("dialog").waitFor({ state: "hidden" });
          }
          const details = page.getByText(/Personal details|Личные данные|Тафсилоти шахсӣ/i).first();
          if (await details.count()) {
            await details.click();
            await page.getByText(/2004/).waitFor();
            probes.push({ probe: "populated-personal-details-from-isolated-seed", passed: true, dobSource: "isolated preview database edited with superadmin form", dob: "2004-05-15" });
            await screenshot(page, "superadmin-details-open", { role, theme, viewport: `${width}x${height}`, surface: "personal-details", opened: true, dateOfBirth: "2004-05-15", fixtureSource: "isolated preview database updated with admin form" });
          }
          const accountAccess = page.getByText(/Account access|Доступ к аккаунту|Дастрасӣ ба ҳисоб/i).first();
          if (await accountAccess.count()) {
            await accountAccess.click();
            await screenshot(page, "superadmin-account-open", { role, theme, viewport: `${width}x${height}`, surface: "account-access", opened: true });
          }
        }
        await finishTab(page, "Performance");
        await screenshot(page, `${role}-${size}-${theme}-performance`, { role, theme, viewport: `${width}x${height}`, locale: "en", surface: "performance", seeded: true });
        await finishTab(page, "Documents");
        await screenshot(page, `${role}-${size}-${theme}-documents`, { role, theme, viewport: `${width}x${height}`, locale: "en", surface: "documents", seeded: true, deliveryWorkflowOutsideScope: true });
        if (size === "mobile") {
          await page.setViewportSize({ width: 320, height: 844 });
          await checkNoHorizontalOverflow(page, `${role}-320-${theme}-no-horizontal-overflow`);
          await screenshot(page, `${role}-narrow-320-${theme}`, { role, theme, viewport: "320x844", surface: "documents", seeded: true });
        }
        if (role === "superadmin" && size === "mobile" && theme === "light") {
          await finishTab(page, "Courses");
          assert.equal(await page.getByRole("button", { name: /^Edit$/i }).count(), 0, "admin Edit belongs in the separate phone menu");
          const phoneMenu = page.getByRole("button", { name: /Student actions/i });
          await phoneMenu.click();
          await page.getByRole("menu").waitFor();
          assert.equal(await page.getByRole("menuitem", { name: /^Edit$/i }).count(), 1);
          await screenshot(page, "superadmin-mobile-menu-open", { role, theme, viewport: "390x844", surface: "profile-actions", opened: true });
          await page.keyboard.press("Escape");
          await page.setViewportSize({ width: 390, height: 844 });
          await finishTab(page, "Courses");
          const firstTab = page.getByRole("tab", { name: /Courses/i });
          await firstTab.focus();
          await page.keyboard.press("ArrowRight");
          assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-controls")), "profile-tabpanel-performance");
          assert.equal(await firstTab.getAttribute("aria-selected"), "true", "arrow focus movement must not change selected panel");
          const focusedTab = page.getByRole("tab", { name: /Performance/i });
          assert.equal(await focusedTab.getAttribute("tabindex"), "0");
          assert.equal(await firstTab.getAttribute("tabindex"), "-1");
          await page.keyboard.press("Tab");
          assert.notEqual(await page.evaluate(() => document.activeElement?.getAttribute("role")), "tab");
          await page.keyboard.press("Shift+Tab");
          assert.equal(await page.evaluate(() => document.activeElement?.id), "profile-tab-performance");
          await page.keyboard.press("Enter");
          assert.equal(await focusedTab.getAttribute("aria-selected"), "true");
          probes.push({ probe: "tab-keyboard-focus-activation", passed: true, focusAndSelectionAreSeparate: true });
          await finishTab(page, "Courses");
          await page.setViewportSize({ width: 390, height: 844 });
          await page.locator("#main-content").evaluate(root => {
            const elements = [root, ...root.querySelectorAll("*")];
            const fontSizes = elements.map(element => Number.parseFloat(getComputedStyle(element).fontSize));
            elements.forEach((element, index) => {
              const fontSize = fontSizes[index];
              if (Number.isFinite(fontSize) && fontSize > 0) element.style.fontSize = `${fontSize * 2}px`;
            });
          });
          await checkNoHorizontalOverflow(page, "superadmin-mobile-200-percent-no-horizontal-overflow");
          const summaryTextFits = await page.locator("[data-profile-summary]").evaluate(summary => {
            return [...summary.children].every(cell => {
              const bounds = cell.getBoundingClientRect();
              return [...cell.querySelectorAll("p")].every(paragraph => {
                const textNodes = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
                const textRectangles = [];
                while (textNodes.nextNode()) {
                  const textNode = textNodes.currentNode;
                  if (textNode.parentElement?.closest(".sr-only")) continue;
                  const range = document.createRange();
                  range.selectNodeContents(textNode);
                  textRectangles.push(...range.getClientRects());
                }
                return textRectangles.every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1);
              });
            });
          });
          assert.equal(summaryTextFits, true, "enlarged summary text must stay within its own cell");
          probes.push({ probe: "superadmin-mobile-200-percent-summary-cell-containment", passed: summaryTextFits, simulation: "computed profile font sizes doubled" });
          await screenshot(page, "superadmin-mobile-200-percent", { role, theme, viewport: "390x844", textScale: "200%", surface: "courses", seeded: true, simulation: "computed profile text sizes doubled while spacing remained unchanged" });
        }
        await context.close();
      }
    }
  }

  if (!zoomOnly) {
  if (!interactionOnly) {
  for (const width of [768, 1024]) {
    const { context, page } = await openSession(admin, { width, height: width === 768 ? 1024 : 768, theme: "light" });
    await profile(page, target.id, "superadmin", admin);
    await checkNoHorizontalOverflow(page, `superadmin-${width}-no-horizontal-overflow`);
    await screenshot(page, `superadmin-responsive-${width}`, { role: "superadmin", theme: "light", viewport: `${width}x${width === 768 ? 1024 : 768}`, locale: "en", surface: "courses", seeded: true });
    await context.close();
  }

  for (const locale of ["ru", "tg"]) {
    const { context, page } = await openSession(admin, { width: 390, height: 844, theme: "light", locale });
    await profile(page, target.id, "superadmin", admin);
    await checkNoHorizontalOverflow(page, `superadmin-mobile-${locale}-no-horizontal-overflow`);
    const localeStudents = JSON.parse(await readFile(resolve(`src/i18n/locales/${locale}/students.json`), "utf8"));
    const localizedMissingDescription = page.locator("[data-profile-summary] .sr-only");
    assert.equal(await localizedMissingDescription.innerText(), localeStudents.scoreUnavailable);
    const localizedMissingValue = localizedMissingDescription.locator("..");
    assert.equal(await localizedMissingValue.locator('[aria-hidden="true"]').innerText(), localeStudents.missingScoreValue);
    const localizedMissingBounds = await localizedMissingValue.boundingBox();
    assert.ok(localizedMissingBounds);
    assert.ok(Math.abs(localizedMissingBounds.height - 32) < 0.1, "the localized missing value must occupy one 32px line within browser subpixel rounding");
    probes.push({ probe: `superadmin-mobile-${locale}-compact-accessible-missing-score`, passed: true, value: localeStudents.missingScoreValue, accessibleDescription: localeStudents.scoreUnavailable, lineHeight: localizedMissingBounds.height });
    await screenshot(page, `superadmin-mobile-${locale}`, { role: "superadmin", theme: "light", viewport: "390x844", locale, surface: "courses", seeded: true });
    await context.close();
  }

  const { context: longNameContext, page: longNamePage } = await openSession(admin, { width: 390, height: 844, theme: "light", locale: "ru" });
  await profile(longNamePage, longStudent.id, "superadmin", admin);
  await checkNoHorizontalOverflow(longNamePage, "superadmin-long-name-390-no-horizontal-overflow");
  await screenshot(longNamePage, "superadmin-long-name-mobile", { role: "superadmin", theme: "light", viewport: "390x844", locale: "ru", surface: "courses", seeded: true, identity: "long seeded Cyrillic student name" });
  await longNameContext.close();

  const refreshSession = await openSession(admin, { width: 1440, height: 1000, theme: "light", expectedProfileFailureStatus: 503 });
  await profile(refreshSession.page, target.id, "superadmin", admin);
  const originalProfileName = await refreshSession.page.getByRole("heading", { level: 1 }).innerText();
  await finishTab(refreshSession.page, "Performance");
  await refreshSession.page.getByRole("button", { name: /^Edit$/i }).click();
  await refreshSession.page.getByLabel(/First Name/i).fill("Unsaved Name");
  let injectRefreshFailure = true;
  await refreshSession.page.route(`${api}/students/${target.id}/profile`, async route => {
    if (injectRefreshFailure) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Injected transient refresh failure" }) });
    else await route.continue();
  });
  const savedPhotoResponse = refreshSession.page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/users/${target.id}/avatar/` && response.request().method() === "POST" && response.status() === 200);
  await refreshSession.page.locator('input[type="file"]').setInputFiles(resolve("src/assets/kitob-emblem.png"));
  const savedPhoto = await (await savedPhotoResponse).json();
  assert.equal(savedPhoto.id, target.id);
  assert.ok(savedPhoto.photo_path && savedPhoto.thumbnail_path);
  await refreshSession.page.getByText("Could not refresh this profile. Showing the last loaded information. Try again.").waitFor();
  assert.equal(await refreshSession.page.getByRole("dialog", { name: "Edit Student" }).count(), 1);
  assert.equal(await refreshSession.page.getByLabel(/First Name/i).inputValue(), "Unsaved Name");
  await screenshot(refreshSession.page, "superadmin-avatar-saved-refresh-error-dirty-edit", { role: "superadmin", theme: "light", viewport: "1440x1000", surface: "independently-saved-photo-dirty-edit", seeded: true, simulatedRefreshStatus: 503, realAvatarUpload: true });
  await refreshSession.page.getByRole("button", { name: /^Cancel$/i }).click();
  await refreshSession.page.getByRole("button", { name: /^Discard$/i }).click();
  await refreshSession.page.getByRole("dialog", { name: "Edit Student" }).waitFor({ state: "hidden" });
  assert.equal(await refreshSession.page.getByRole("heading", { level: 1 }).innerText(), originalProfileName);
  assert.equal(await refreshSession.page.getByRole("tab", { name: "Performance" }).getAttribute("aria-selected"), "true");
  await screenshot(refreshSession.page, "superadmin-refresh-error-retained-profile", { role: "superadmin", theme: "light", viewport: "1440x1000", surface: "retained-profile-after-dirty-identity-cancel", seeded: true, simulatedRefreshStatus: 503, realAvatarUpload: true });
  injectRefreshFailure = false;
  await refreshSession.page.getByRole("button", { name: /^Retry$/i }).click();
  await refreshSession.page.getByText("Could not refresh this profile. Showing the last loaded information. Try again.").waitFor({ state: "hidden" });
  const refreshedAdminLogin = await login(admin);
  const persistedProfileResponse = await fetch(`${api}/students/${target.id}/profile`, { headers: { Authorization: `Bearer ${refreshedAdminLogin.access_token}` } });
  assert.equal(persistedProfileResponse.status, 200);
  const persistedProfile = await persistedProfileResponse.json();
  assert.equal(persistedProfile.user.photo_path, savedPhoto.photo_path);
  assert.equal(persistedProfile.user.thumbnail_path, savedPhoto.thumbnail_path);
  assert.notEqual(persistedProfile.user.first_name, "Unsaved Name");
  assert.equal(await refreshSession.page.getByRole("tab", { name: "Performance" }).getAttribute("aria-selected"), "true");
  probes.push({ probe: "independent-avatar-success-transient-refresh-dirty-identity-cancel-retry", passed: true, realUploadStatus: 200, simulatedRefreshStatus: 503, persistedPhoto: true, dirtyIdentityDiscarded: true, selectedTabRetained: true, retryRecovered: true });
  await screenshot(refreshSession.page, "superadmin-refresh-retry-recovered", { role: "superadmin", theme: "light", viewport: "1440x1000", surface: "refresh-recovered-independent-photo-persisted", seeded: true, earlierRefreshFailureSimulated: true });
  await refreshSession.context.close();

  for (const theme of ["light", "dark"]) {
    for (const width of [1440, 390, 320]) {
      const height = width === 1440 ? 1000 : 844;
      const loadingSession = await openSession(admin, { width, height, theme });
      let releaseProfile;
      let profileRequestStarted;
      const profileStarted = new Promise(resolveStarted => { profileRequestStarted = resolveStarted; });
      const releaseRequest = new Promise(resolveRelease => { releaseProfile = resolveRelease; });
      await loadingSession.page.route(`${api}/students/${target.id}/profile`, async route => {
        profileRequestStarted();
        await releaseRequest;
        await route.continue();
      });
      await loadingSession.page.goto(`${origin}/login?redirect=${encodeURIComponent(`/students/${target.id}`)}`);
      await loadingSession.page.locator("#email").fill(admin.email);
      await loadingSession.page.locator("#password").fill(fixture.password);
      await loadingSession.page.locator('button[type="submit"]').click();
      await loadingSession.page.waitForURL(url => url.pathname === `/students/${target.id}`);
      await profileStarted;
      await loadingSession.page.getByRole("status").waitFor();
      await checkNoHorizontalOverflow(loadingSession.page, `profile-loading-${width}-${theme}-no-horizontal-overflow`);
      const avatarBounds = await loadingSession.page.locator("[data-loading-avatar]").boundingBox();
      assert.ok(avatarBounds);
      assert.equal(avatarBounds.width, width === 1440 ? 64 : 48);
      assert.equal(avatarBounds.height, width === 1440 ? 64 : 48);
      assert.equal(await loadingSession.page.locator("[data-loading-tabs]").count(), 1);
      probes.push({ probe: `profile-loading-${width}-${theme}-responsive-geometry`, passed: true, measuredAvatar: avatarBounds.width, expectedAvatar: width === 1440 ? 64 : 48, simulatedNetworkDelay: true });
      const filename = width === 1440 && theme === "light" ? "superadmin-profile-loading" : `superadmin-profile-loading-${width}-${theme}`;
      await screenshot(loadingSession.page, filename, { role: "superadmin", theme, viewport: `${width}x${height}`, surface: "profile-loading", simulatedNetworkDelay: true, fixtureSource: "real isolated seeded API response" });
      releaseProfile();
      await loadingSession.page.getByRole("tab", { name: /Courses/i }).waitFor();
      await loadingSession.context.close();
    }
  }

  const emptySession = await openSession(admin, { width: 1440, height: 1000, theme: "light" });
  await profile(emptySession.page, emptyStudent.id, "superadmin", admin);
  await emptySession.page.getByText(/No courses found/i).waitFor();
  await screenshot(emptySession.page, "superadmin-no-courses-empty", { role: "superadmin", theme: "light", viewport: "1440x1000", surface: "courses-empty", fixtureSource: "real isolated seeded API response" });
  await emptySession.context.close();

  const errorSession = await openSession(admin, { width: 1440, height: 1000, theme: "light" });
  await errorSession.page.goto(`${origin}/login?redirect=${encodeURIComponent("/students/999999")}`);
  await errorSession.page.locator("#email").fill(admin.email);
  await errorSession.page.locator("#password").fill(fixture.password);
  await errorSession.page.locator('button[type="submit"]').click();
  await errorSession.page.waitForURL(url => url.pathname === "/students/999999");
  await errorSession.page.getByRole("button", { name: /Retry|Try again|Повторить/i }).waitFor();
  await errorSession.page.getByRole("link", { name: /Back to Students/i }).first().waitFor();
  await screenshot(errorSession.page, "superadmin-profile-not-found-error", { role: "superadmin", theme: "light", viewport: "1440x1000", surface: "profile-error", fixtureSource: "real isolated API 404" });
  await errorSession.context.close();

  }
  const adminSession = await login(admin);
  const targetResponse = await fetch(`${api}/students/${target.id}/profile`, { headers: { Authorization: `Bearer ${adminSession.access_token}` } });
  assert.equal(targetResponse.status, 200);
  const targetProfile = await targetResponse.json();
  const assignedCourseId = targetProfile.courses[0]?.course?.id;
  assert.ok(assignedCourseId, "target student must be enrolled in a seeded course");
  const mentorLogin = await login(mentor);
  const rosterResponse = await fetch(`${api}/enrollments/courses/${assignedCourseId}/roster?page=1&page_size=20`, { headers: { Authorization: `Bearer ${mentorLogin.access_token}` } });
  const rosterPayload = await rosterResponse.json();
  const rosterNames = (rosterPayload.items ?? []).map(item => `${item.student.first_name} ${item.student.last_name}`);
  assert.equal(rosterResponse.status, 200, "mentor must read the assigned course roster");
  assert.ok(rosterNames.includes("Zara Karimova"), `assigned roster should include target student; received ${JSON.stringify(rosterNames)}`);
  const { context, page } = await openSession(mentor, { width: 1440, height: 1000, theme: "light" });
  await page.goto(`${origin}/login?redirect=${encodeURIComponent(`/courses/${assignedCourseId}?tab=students`)}`);
  await page.locator("#email").fill(mentor.email);
  await page.locator("#password").fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => url.pathname === `/courses/${assignedCourseId}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.getByRole("tab", { name: /Students/i }).click();
  await page.getByTestId("roster-row").first().waitFor();
  const studentLink = page.getByRole("link", { name: "Zara Karimova", exact: true }).first();
  if (await studentLink.count()) {
    await studentLink.click();
    await page.waitForURL(url => url.pathname === `/students/${target.id}`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.getByRole("tab", { name: /Performance/i }).click();
    await page.getByRole("link", { name: "Back to Course", exact: true }).click();
    await page.waitForURL(url => url.pathname.startsWith("/courses/"));
    probes.push({ probe: "mentor-authorized-course-profile-roundtrip", passed: true, targetStudentId: target.id, returned: new URL(page.url()).pathname });
  } else {
    probes.push({ probe: "mentor-authorized-course-profile-roundtrip", passed: false, reason: "No seeded student link found in assigned course UI" });
  }
  await context.close();

  const reducedMotionSession = await openSession(admin, { width: 390, height: 844, theme: "light", reducedMotion: "reduce" });
  await profile(reducedMotionSession.page, target.id, "superadmin", admin);
  const reducedMotionState = await reducedMotionSession.page.getByRole("tab", { name: /Courses/i }).evaluate(element => ({
    preference: matchMedia("(prefers-reduced-motion: reduce)").matches,
    duration: getComputedStyle(element).transitionDuration,
    animation: getComputedStyle(element).animationName,
  }));
  assert.equal(reducedMotionState.preference, true);
  assert.equal(reducedMotionState.duration, "0s");
  probes.push({ probe: "profile-tabs-respect-reduced-motion", passed: true, ...reducedMotionState });
  await screenshot(reducedMotionSession.page, "superadmin-mobile-reduced-motion", { role: "superadmin", theme: "light", viewport: "390x844", surface: "courses", reducedMotion: true, seeded: true });
  await reducedMotionSession.context.close();

  const checks = [
    ["superadmin", admin, target.id, 200],
    ["mentor", mentor, target.id, 200],
    ["student-self", student, student.id, 200],
    ["student-other", student, target.id, 403],
    ["accountant", accountant, target.id, 403],
  ];
  for (const [name, account, id, expected] of checks) {
    const authenticated = await login(account);
    const response = await fetch(`${api}/students/${id}/profile`, { headers: { Authorization: `Bearer ${authenticated.access_token}` } });
    probes.push({ probe: `api-profile-authorization-${name}`, passed: response.status === expected, status: response.status, expected });
    assert.equal(response.status, expected, `profile role boundary for ${name}`);
  }
  const accountantLogin = await login(accountant);
  const accountantDirectory = await fetch(`${api}/students/?page=1&page_size=5`, { headers: { Authorization: `Bearer ${accountantLogin.access_token}` } });
  probes.push({ probe: "accountant-student-directory-remains-authorized", passed: accountantDirectory.status === 200, status: accountantDirectory.status, expected: 200 });
  assert.equal(accountantDirectory.status, 200);
  assert.deepEqual(errors, [], "browser must have no page errors or unexpected HTTP failures");
  }
  if (interactionOnly) {
    const existingProbes = JSON.parse(await readFile(resolve(evidence, "probes.json"), "utf8"));
    const updatedProbeNames = new Set(probes.map(probe => probe.probe));
    existingProbes.probes = existingProbes.probes.filter(probe => !updatedProbeNames.has(probe.probe)).concat(probes);
    existingProbes.browserErrors = errors;
    await writeFile(resolve(evidence, "probes.json"), JSON.stringify(existingProbes, null, 2) + "\n");
    const existingManifest = JSON.parse(await readFile(resolve(evidence, "manifest.json"), "utf8"));
    const updatedFiles = new Set(manifest.map(screenshot => screenshot.file));
    existingManifest.screenshots = existingManifest.screenshots.filter(screenshot => !updatedFiles.has(screenshot.file)).concat(manifest);
    await writeFile(resolve(evidence, "manifest.json"), JSON.stringify(existingManifest, null, 2) + "\n");
  } else {
    await writeFile(resolve(evidence, "manifest.json"), JSON.stringify({ task: "KITOB-03-03", screenshots: manifest }, null, 2) + "\n");
    await writeFile(resolve(evidence, "probes.json"), JSON.stringify({ task: "KITOB-03-03", probes, browserErrors: errors, screenshots: screenshotsWritten }, null, 2) + "\n");
  }
  process.stdout.write(JSON.stringify({ screenshots: manifest.length, probes: probes.length, browserErrors: errors.length, evidence }, null, 2) + "\n");
} finally {
  await browser.close();
}

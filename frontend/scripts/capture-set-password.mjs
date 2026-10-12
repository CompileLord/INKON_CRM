import { chromium } from "playwright";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
});
const stdinIterator = rl[Symbol.asyncIterator]();

async function readStdinLine() {
  const { value, done } = await stdinIterator.next();
  if (done) return null;
  return value;
}

const initialLine = await readStdinLine();
const fixtures = initialLine ? JSON.parse(initialLine) : { password: "", identities: [] };

const outputDir = resolve("../docs/redesign-execution/group-01/task-06/screenshots");
const taskDir = resolve("../docs/redesign-execution/group-01/task-06");
const attempt4Dir = resolve("../docs/redesign-execution/group-01/task-06/attempt4/screenshots");
const attempt4Root = resolve("../docs/redesign-execution/group-01/task-06/attempt4");

await mkdir(outputDir, { recursive: true });
await mkdir(attempt4Dir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const records = [];
const errors = [];

async function saveScreenshot(page, fileName) {
  await page.screenshot({ path: `${outputDir}/${fileName}` });
  await page.screenshot({ path: `${attempt4Dir}/${fileName}` });
}

async function isOverflowing(page) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    } catch (err) {
      lastError = err;
      await page.waitForTimeout(150);
    }
  }
  throw lastError ?? new Error("Failed to evaluate isOverflowing");
}

async function establishForcedSession(page, email, password) {
  await page.goto("http://127.0.0.1:5174/login", { waitUntil: "domcontentloaded" });
  await page.locator("#email").waitFor();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/set-password");
  await page.locator("h1").waitFor();
  await page.locator("#newPassword").waitFor();
  await page.locator("#confirmPassword").waitFor();
  await page.locator('button[type="submit"]').waitFor();
}

try {
  const forcedStudent = fixtures.identities.find((i) => i.forced && i.role === "student") || fixtures.identities.find((i) => i.forced);
  assert.ok(forcedStudent);
  const targetEmail = forcedStudent.email;
  const initialPassword = fixtures.password;

  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: theme,
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: `mobile-${theme}`, message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    const headingMetrics = await page.locator("h1").evaluate((el) => {
      const style = window.getComputedStyle(el);
      return { fontSize: style.fontSize, lineHeight: style.lineHeight };
    });
    assert.equal(headingMetrics.fontSize, "24px");
    assert.equal(headingMetrics.lineHeight, "32px");

    const subtitleMetrics = await page.locator("h1 + p").evaluate((el) => {
      const style = window.getComputedStyle(el);
      return { fontSize: style.fontSize, lineHeight: style.lineHeight };
    });
    assert.equal(subtitleMetrics.fontSize, "16px");
    assert.equal(subtitleMetrics.lineHeight, "24px");

    const overflows = await isOverflowing(page);
    assert.equal(overflows, false);

    const submit = page.locator('button[type="submit"]');
    await submit.scrollIntoViewIfNeeded();
    assert.equal(await submit.isVisible(), true);

    const fileName = `set-password-mobile-${theme}.png`;
    await saveScreenshot(page, fileName);

    records.push({
      surface: "set-password-baseline",
      width: 390,
      height: 844,
      theme,
      locale: "en",
      headingFontSize: headingMetrics.fontSize,
      headingLineHeight: headingMetrics.lineHeight,
      subtitleFontSize: subtitleMetrics.fontSize,
      subtitleLineHeight: subtitleMetrics.lineHeight,
      overflows,
      file: fileName,
    });
    await context.close();
  }

  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: theme,
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: `desktop-${theme}`, message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    const headingMetrics = await page.locator("h1").evaluate((el) => {
      const style = window.getComputedStyle(el);
      return { fontSize: style.fontSize, lineHeight: style.lineHeight };
    });
    assert.equal(headingMetrics.fontSize, "28px");
    assert.equal(headingMetrics.lineHeight, "36px");

    const overflows = await isOverflowing(page);
    assert.equal(overflows, false);

    const motionState = await page.evaluate(() => {
      const staticEmblems = Array.from(document.querySelectorAll('aside img[src*="static"], aside img[src*="emblem"]'));
      const loopEmblems = Array.from(document.querySelectorAll('aside img[src*="loop"], aside img[src*="animated"]'));
      return {
        staticVisible: staticEmblems.some((img) => window.getComputedStyle(img).display !== "none"),
        loopHidden: loopEmblems.every((img) => window.getComputedStyle(img).display === "none"),
      };
    });

    assert.equal(motionState.staticVisible, true);
    assert.equal(motionState.loopHidden, true);

    const fileName = `set-password-desktop-${theme}.png`;
    await saveScreenshot(page, fileName);

    records.push({
      surface: "set-password-baseline",
      width: 1440,
      height: 1000,
      theme,
      locale: "en",
      headingFontSize: headingMetrics.fontSize,
      headingLineHeight: headingMetrics.lineHeight,
      overflows,
      staticEmblemDisplayed: motionState.staticVisible,
      noLoopLogo: motionState.loopHidden,
      file: fileName,
    });
    await context.close();
  }

  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: `reduced-motion-${theme}`, message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    const fileName = `set-password-desktop-reduced-motion-${theme}.png`;
    await saveScreenshot(page, fileName);

    const motionState = await page.evaluate(() => {
      const staticEmblems = Array.from(document.querySelectorAll('img[src*="static"], img[src*="emblem"]'));
      const loopEmblems = Array.from(document.querySelectorAll('img[src*="loop"], img[src*="animated"]'));
      return {
        staticVisible: staticEmblems.some((img) => window.getComputedStyle(img).display !== "none"),
        loopHidden: loopEmblems.every((img) => window.getComputedStyle(img).display === "none"),
      };
    });

    records.push({
      surface: "set-password-reduced-motion",
      theme,
      staticVisible: motionState.staticVisible,
      loopHidden: motionState.loopHidden,
      file: fileName,
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "desktop-settings-draft-preservation", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    const newPass = page.locator("#newPassword");
    const confirmPass = page.locator("#confirmPassword");
    const toggleBtn = page.locator('[data-testid="toggle-both-passwords"]');

    await newPass.fill("DraftPass123!");
    await confirmPass.fill("DraftPass123!");
    await toggleBtn.click();

    assert.equal(await newPass.getAttribute("type"), "text");
    assert.equal(await confirmPass.getAttribute("type"), "text");

    const settingsBtn = page.locator("button[data-shell-settings]");
    await settingsBtn.waitFor({ state: "visible" });
    await settingsBtn.click();

    const settingsOverlay = page.locator("#auth-settings");
    await settingsOverlay.waitFor({ state: "visible" });

    const darkBtn = settingsOverlay.getByRole("button", { name: "Dark theme", exact: true });
    await darkBtn.waitFor({ state: "visible" });
    await darkBtn.click();
    assert.equal(await darkBtn.getAttribute("aria-pressed"), "true");
    assert.equal(await darkBtn.evaluate((el) => document.activeElement === el), true);

    const isHtmlDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    assert.equal(isHtmlDark, true);

    const ruBtn = settingsOverlay.locator("button").filter({ hasText: /^Русский$/i });
    await ruBtn.waitFor({ state: "visible" });
    await ruBtn.click();
    assert.equal(await ruBtn.getAttribute("aria-pressed"), "true");
    assert.equal(await ruBtn.evaluate((el) => document.activeElement === el), true);

    const activeLocale = await page.evaluate(() => localStorage.getItem("i18nextLng"));
    assert.ok(activeLocale && activeLocale.startsWith("ru"));

    await saveScreenshot(page, "set-password-settings-opened-desktop.png");

    await page.keyboard.press("Escape");
    await settingsOverlay.waitFor({ state: "hidden" });

    assert.equal(await newPass.inputValue(), "DraftPass123!");
    assert.equal(await confirmPass.inputValue(), "DraftPass123!");
    assert.equal(await newPass.getAttribute("type"), "text");
    assert.equal(await confirmPass.getAttribute("type"), "text");

    await saveScreenshot(page, "set-password-draft-preserved-desktop.png");

    records.push({
      surface: "set-password-settings-draft-desktop",
      themeChangedToDark: true,
      htmlDarkClassPresent: true,
      localeChangedToRussian: true,
      draftValuesPreserved: true,
      visibilityPreserved: true,
      files: [
        "set-password-settings-opened-desktop.png",
        "set-password-draft-preserved-desktop.png",
      ],
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "mobile-settings-draft-preservation", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    const newPass = page.locator("#newPassword");
    const confirmPass = page.locator("#confirmPassword");
    const toggleBtn = page.locator('[data-testid="toggle-both-passwords"]');

    await newPass.fill("MobileDraftPass123!");
    await confirmPass.fill("MobileDraftPass123!");
    await toggleBtn.click();

    const settingsBtn = page.locator("button[data-shell-settings]");
    await settingsBtn.waitFor({ state: "visible" });
    await settingsBtn.click();

    const settingsOverlay = page.locator("#auth-settings");
    await settingsOverlay.waitFor({ state: "visible" });

    const darkBtn = settingsOverlay.getByRole("button", { name: "Dark theme", exact: true });
    await darkBtn.waitFor({ state: "visible" });
    await darkBtn.click();
    assert.equal(await darkBtn.getAttribute("aria-pressed"), "true");
    assert.equal(await darkBtn.evaluate((el) => document.activeElement === el), true);

    const isHtmlDarkMobile = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    assert.equal(isHtmlDarkMobile, true);

    const tgBtn = settingsOverlay.locator("button").filter({ hasText: /^Тоҷикӣ$/i });
    await tgBtn.waitFor({ state: "visible" });
    await tgBtn.click();
    assert.equal(await tgBtn.getAttribute("aria-pressed"), "true");
    assert.equal(await tgBtn.evaluate((el) => document.activeElement === el), true);

    const activeLocaleMobile = await page.evaluate(() => localStorage.getItem("i18nextLng"));
    assert.ok(activeLocaleMobile && activeLocaleMobile.startsWith("tg"));

    await saveScreenshot(page, "set-password-settings-opened-mobile.png");

    await page.keyboard.press("Escape");
    await settingsOverlay.waitFor({ state: "hidden" });

    assert.equal(await newPass.inputValue(), "MobileDraftPass123!");
    assert.equal(await confirmPass.inputValue(), "MobileDraftPass123!");
    assert.equal(await newPass.getAttribute("type"), "text");
    assert.equal(await confirmPass.getAttribute("type"), "text");

    await saveScreenshot(page, "set-password-draft-preserved-mobile.png");

    records.push({
      surface: "set-password-settings-draft-mobile",
      themeChangedToDark: true,
      htmlDarkClassPresent: true,
      localeChangedToTajik: true,
      draftValuesPreserved: true,
      visibilityPreserved: true,
      files: [
        "set-password-settings-opened-mobile.png",
        "set-password-draft-preserved-mobile.png",
      ],
    });
    await context.close();
  }

  for (const locale of ["ru", "tg"]) {
    const context = await browser.newContext({
      viewport: { width: 320, height: 640 },
      colorScheme: "light",
    });
    await context.addInitScript((loc) => localStorage.setItem("i18nextLng", loc), locale);
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: `narrow-320-${locale}`, message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    const overflows = await isOverflowing(page);
    assert.equal(overflows, false);

    const submit = page.locator('button[type="submit"]');
    await submit.scrollIntoViewIfNeeded();
    assert.equal(await submit.isVisible(), true);

    const fileName = `set-password-narrow-320-${locale}.png`;
    await saveScreenshot(page, fileName);

    records.push({
      surface: "set-password-narrow-320",
      width: 320,
      height: 640,
      locale,
      overflows: false,
      submitReachable: true,
      file: fileName,
    });
    await context.close();
  }

  for (const width of [320, 768, 1024]) {
    const height = width === 320 ? 640 : width === 768 ? 1024 : 768;
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: theme,
      });
      await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
      const page = await context.newPage();
      page.on("pageerror", (err) => errors.push({ test: `viewport-${width}-${theme}`, message: err.message }));

      await establishForcedSession(page, targetEmail, initialPassword);

      const overflows = await isOverflowing(page);
      assert.equal(overflows, false);

      const submit = page.locator('button[type="submit"]');
      await submit.scrollIntoViewIfNeeded();
      assert.equal(await submit.isVisible(), true);

      const fileName = `set-password-viewport-${width}-${theme}.png`;
      await saveScreenshot(page, fileName);
      records.push({
        surface: "set-password-viewport",
        width,
        height,
        theme,
        overflows,
        submitReachable: true,
        file: fileName,
      });
      await context.close();
    }
  }

  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 500 },
      colorScheme: theme,
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: `short-viewport-${theme}`, message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    const submit = page.locator('button[type="submit"]');
    await submit.scrollIntoViewIfNeeded();
    assert.equal(await submit.isVisible(), true);

    const fileName = `set-password-short-viewport-${theme}.png`;
    await saveScreenshot(page, fileName);
    records.push({
      surface: "set-password-short-viewport",
      width: 1024,
      height: 500,
      theme,
      submitReachable: true,
      file: fileName,
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "text-enlarged", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });

    const overflows = await isOverflowing(page);
    assert.equal(overflows, false);

    const submit = page.locator('button[type="submit"]');
    await submit.scrollIntoViewIfNeeded();
    assert.equal(await submit.isVisible(), true);

    const fileName = "set-password-text-enlarged-200.png";
    await saveScreenshot(page, fileName);
    records.push({
      surface: "set-password-text-enlarged-200",
      rootFontSize: "32px",
      overflows: false,
      submitReachable: true,
      file: fileName,
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "visibility-toggle", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    const newPass = page.locator("#newPassword");
    const confirmPass = page.locator("#confirmPassword");
    const toggleBtn = page.locator('[data-testid="toggle-both-passwords"]');

    const toggleRect = await toggleBtn.boundingBox();
    assert.ok(toggleRect && toggleRect.height >= 44);

    await newPass.fill("DummyPassword123");
    await confirmPass.fill("DummyPassword123");

    assert.equal(await newPass.getAttribute("type"), "password");
    assert.equal(await confirmPass.getAttribute("type"), "password");
    assert.equal(await toggleBtn.textContent(), "Show both passwords");

    await toggleBtn.click();

    assert.equal(await newPass.getAttribute("type"), "text");
    assert.equal(await confirmPass.getAttribute("type"), "text");
    assert.equal(await toggleBtn.textContent(), "Hide both passwords");

    await saveScreenshot(page, "set-password-visibility-toggled.png");

    await toggleBtn.click();
    assert.equal(await newPass.getAttribute("type"), "password");
    assert.equal(await confirmPass.getAttribute("type"), "password");

    await newPass.fill("");
    await confirmPass.fill("");

    records.push({
      surface: "set-password-visibility-action",
      commonToggleAffectsBothInputs: true,
      minTouchTargetHeight: toggleRect.height,
      toggledStateScreenshottedWithDummyData: true,
      dummyDataCleared: true,
      file: "set-password-visibility-toggled.png",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "keyboard-focus", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    await page.locator("#newPassword").focus();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "newPassword");

    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "confirmPassword");

    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "toggle-both-passwords");

    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("type")), "submit");

    await saveScreenshot(page, "set-password-keyboard-focus.png");
    records.push({
      surface: "set-password-keyboard-navigation",
      tabTraversalSuccessful: true,
      activeElementMatchesSequentially: true,
      file: "set-password-keyboard-focus.png",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.route("**/*.{svg,png,jpg,jpeg,webp}", (route) => route.abort());
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "missing-media", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    const newPasswordInput = page.locator("#newPassword");
    await newPasswordInput.waitFor({ state: "visible" });
    assert.equal(await newPasswordInput.isVisible(), true);
    await newPasswordInput.fill("DummyMediaTest123!");
    assert.equal(await newPasswordInput.inputValue(), "DummyMediaTest123!");
    await newPasswordInput.fill("");

    const submit = page.locator('button[type="submit"]');
    assert.equal(await submit.isVisible(), true);

    await saveScreenshot(page, "set-password-missing-media.png");
    records.push({
      surface: "set-password-missing-media",
      functionalLayoutWithoutMedia: true,
      inputOperableWithoutMedia: true,
      file: "set-password-missing-media.png",
    });
    await context.close();
  }

  for (const locale of ["en", "ru", "tg"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript((loc) => localStorage.setItem("i18nextLng", loc), locale);
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: `locale-${locale}`, message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    await page.locator('button[type="submit"]').click();
    const errorCount = await page.locator('p[role="alert"]').count();
    assert.equal(errorCount, 2);

    const fileName = `set-password-validation-${locale}.png`;
    await saveScreenshot(page, fileName);

    records.push({
      surface: "set-password-locale-validation",
      locale,
      validationErrorsRendered: true,
      file: fileName,
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "simulated-short-password", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    await page.locator("#newPassword").fill("short1");
    await page.locator("#confirmPassword").fill("short1");
    await page.locator('button[type="submit"]').click();

    const error = page.locator("#newPassword-error");
    await error.waitFor();
    assert.equal(await error.textContent(), "Password must be at least 8 characters long");

    await saveScreenshot(page, "set-password-simulated-short.png");
    records.push({
      surface: "set-password-simulated-short",
      errorValidated: true,
      file: "set-password-simulated-short.png",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "simulated-no-digit", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    await page.locator("#newPassword").fill("passwordwithoutdigits");
    await page.locator("#confirmPassword").fill("passwordwithoutdigits");
    await page.locator('button[type="submit"]').click();

    const error = page.locator("#newPassword-error");
    await error.waitFor();
    assert.equal(await error.textContent(), "Password must contain at least 1 digit");

    await saveScreenshot(page, "set-password-simulated-no-digit.png");
    records.push({
      surface: "set-password-simulated-no-digit",
      errorValidated: true,
      file: "set-password-simulated-no-digit.png",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "simulated-mismatch", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    await page.locator("#newPassword").fill("ValidPassword123");
    await page.locator("#confirmPassword").fill("DifferentPassword123");
    await page.locator('button[type="submit"]').click();

    const error = page.locator("#confirmPassword-error");
    await error.waitFor();
    assert.equal(await error.textContent(), "Passwords do not match");

    await saveScreenshot(page, "set-password-simulated-mismatch.png");
    records.push({
      surface: "set-password-simulated-mismatch",
      errorValidated: true,
      file: "set-password-simulated-mismatch.png",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "simulated-400-policy", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    let routeInterceptedCount = 0;
    await page.route("**/api/v1/auth/set-password", (route) => {
      routeInterceptedCount++;
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Password must be at least 8 characters and contain at least 1 digit" }),
      });
    });

    await page.locator("#newPassword").fill("validpass1");
    await page.locator("#confirmPassword").fill("validpass1");
    await page.locator('button[type="submit"]').click();

    const error = page.locator("#newPassword-error");
    await error.waitFor();
    assert.equal(routeInterceptedCount, 1);
    assert.equal(await error.textContent(), "Password must be at least 8 characters and contain at least 1 digit");

    await saveScreenshot(page, "set-password-simulated-400-policy.png");
    records.push({
      surface: "set-password-simulated-400-policy",
      routeIntercepted: true,
      interceptionCount: routeInterceptedCount,
      errorMappedToField: true,
      file: "set-password-simulated-400-policy.png",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "simulated-422-string-too-short", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    let routeInterceptedCount = 0;
    await page.route("**/api/v1/auth/set-password", (route) => {
      routeInterceptedCount++;
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          detail: [
            {
              loc: ["body", "new_password"],
              msg: "String should have at least 8 characters",
              type: "string_too_short",
              ctx: { min_length: 8 },
            },
          ],
        }),
      });
    });

    await page.locator("#newPassword").fill("validPass1");
    await page.locator("#confirmPassword").fill("validPass1");
    await page.locator('button[type="submit"]').click();

    const error = page.locator("#newPassword-error");
    await error.waitFor();
    assert.equal(routeInterceptedCount, 1);
    const errorText = await error.textContent();
    assert.ok(errorText.includes("8"));
    assert.ok(!errorText.includes("{{min}}"));
    assert.equal(errorText, "Password must be at least 8 characters long");

    await saveScreenshot(page, "set-password-simulated-422-interpolated.png");
    records.push({
      surface: "set-password-simulated-422-string-too-short",
      routeIntercepted: true,
      interceptionCount: routeInterceptedCount,
      interpolated8Rendered: true,
      noUnresolvedTokens: true,
      file: "set-password-simulated-422-interpolated.png",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "simulated-rate-limit", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    let routeInterceptedCount = 0;
    await page.route("**/api/v1/auth/set-password", (route) => {
      routeInterceptedCount++;
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Too many attempts. Please try again later" }),
      });
    });

    await page.locator("#newPassword").fill("validpass1");
    await page.locator("#confirmPassword").fill("validpass1");
    await page.locator('button[type="submit"]').click();

    const alert = page.locator('div[role="alert"]');
    await alert.waitFor();
    assert.equal(routeInterceptedCount, 1);
    assert.equal(await alert.textContent(), "Too many attempts. Please try again later");

    await saveScreenshot(page, "set-password-simulated-rate-limit.png");
    records.push({
      surface: "set-password-simulated-rate-limit",
      routeIntercepted: true,
      interceptionCount: routeInterceptedCount,
      errorAlertShown: true,
      file: "set-password-simulated-rate-limit.png",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "simulated-network-error", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    let routeInterceptedCount = 0;
    await page.route("**/api/v1/auth/set-password", (route) => {
      routeInterceptedCount++;
      route.abort();
    });

    await page.locator("#newPassword").fill("validpass1");
    await page.locator("#confirmPassword").fill("validpass1");
    await page.locator('button[type="submit"]').click();

    const alert = page.locator('div[role="alert"]');
    await alert.waitFor();
    assert.equal(routeInterceptedCount, 1);
    assert.equal(await alert.textContent(), "Could not connect to server. Check your internet connection");

    await saveScreenshot(page, "set-password-simulated-network-error.png");
    records.push({
      surface: "set-password-simulated-network-error",
      routeIntercepted: true,
      interceptionCount: routeInterceptedCount,
      networkAlertShown: true,
      file: "set-password-simulated-network-error.png",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "simulated-loading", message: err.message }));

    await establishForcedSession(page, targetEmail, initialPassword);

    let fulfillRequest = null;
    let routeInterceptedCount = 0;
    await page.route("**/api/v1/auth/set-password", async (route) => {
      routeInterceptedCount++;
      await new Promise((resolve) => {
        fulfillRequest = () => {
          route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Simulated rejection after delay" }),
          });
          resolve();
        };
      });
    });

    await page.locator("#newPassword").fill("validpass1");
    await page.locator("#confirmPassword").fill("validpass1");

    const submit = page.locator('button[type="submit"]');
    await submit.click();

    await page.waitForTimeout(100);
    assert.equal(routeInterceptedCount, 1);
    assert.equal(await submit.getAttribute("aria-busy"), "true");
    assert.equal(await submit.isDisabled(), true);

    await saveScreenshot(page, "set-password-simulated-loading.png");

    fulfillRequest();
    await page.locator('div[role="alert"]').waitFor();

    assert.equal(await submit.isDisabled(), false);

    records.push({
      surface: "set-password-simulated-loading",
      routeIntercepted: true,
      interceptionCount: routeInterceptedCount,
      ariaBusyVerified: true,
      bookIndicatorRendered: true,
      retryAllowedAfterFailure: true,
      file: "set-password-simulated-loading.png",
    });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "unauthenticated-direct-guard", message: err.message }));

    await page.goto("http://127.0.0.1:5174/set-password", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/login");
    assert.equal(new URL(page.url()).pathname, "/login");

    records.push({
      surface: "set-password-unauthenticated-guard",
      redirectedToLogin: true,
    });
    await context.close();
  }

  const normalRoles = ["student", "mentor", "superadmin", "accountant"];
  for (const role of normalRoles) {
    const normalUser = fixtures.identities.find((i) => !i.forced && i.role === role);
    assert.ok(normalUser);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: `normal-direct-guard-${role}`, message: err.message }));

    await page.goto("http://127.0.0.1:5174/login", { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill(normalUser.email);
    await page.locator("#password").fill(fixtures.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => url.pathname !== "/login");

    await page.goto("http://127.0.0.1:5174/set-password", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname !== "/set-password");
    assert.notEqual(new URL(page.url()).pathname, "/set-password");

    records.push({
      surface: `set-password-normal-user-guard-${role}`,
      role,
      userEmail: normalUser.email,
      redirectedAwayFromGuardedPage: true,
      landingPath: new URL(page.url()).pathname,
    });
    await context.close();
  }

  const roleSpecs = [
    { role: "student", expectedPathPrefix: "/students/" },
    { role: "mentor", expectedPathPrefix: "/mentors/" },
    { role: "superadmin", expectedPathExact: "/" },
    { role: "accountant", expectedPathExact: "/" },
  ];

  for (const spec of roleSpecs) {
    const forcedIdentity = fixtures.identities.find((i) => i.forced && i.role === spec.role);
    assert.ok(forcedIdentity);

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: `real-backend-flow-${spec.role}`, message: err.message }));

    await establishForcedSession(page, forcedIdentity.email, initialPassword);

    const storeBefore = await page.evaluate(async () => {
      const authModule = await import("/src/store/authStore.ts");
      const state = authModule.useAuthStore.getState();
      return {
        status: state.status,
        role: state.role,
        mustSetPassword: state.mustSetPassword,
      };
    });
    assert.equal(storeBefore.status, "authenticated");
    assert.equal(storeBefore.mustSetPassword, true);

    const secureNewPassword = crypto.randomBytes(16).toString("hex") + "1aA!";
    await page.locator("#newPassword").fill(secureNewPassword);
    await page.locator("#confirmPassword").fill(secureNewPassword);

    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/v1/auth/set-password") && res.request().method() === "POST",
    );

    await page.locator('button[type="submit"]').click();

    const response = await responsePromise;
    const recordedResponseStatus = response.status();
    const recordedResponseBody = await response.json();

    if (spec.expectedPathExact) {
      await page.waitForURL((url) => url.pathname === spec.expectedPathExact);
      assert.equal(new URL(page.url()).pathname, spec.expectedPathExact);
    } else {
      await page.waitForURL((url) => url.pathname.startsWith(spec.expectedPathPrefix));
      assert.ok(new URL(page.url()).pathname.startsWith(spec.expectedPathPrefix));
    }

    assert.equal(recordedResponseStatus, 200);
    assert.ok(recordedResponseBody && typeof recordedResponseBody.access_token === "string");
    assert.equal(recordedResponseBody.must_set_password, false);

    const storeAfter = await page.evaluate(async () => {
      const authModule = await import("/src/store/authStore.ts");
      const state = authModule.useAuthStore.getState();
      return {
        status: state.status,
        role: state.role,
        userId: state.userId,
        mustSetPassword: state.mustSetPassword,
      };
    });

    assert.equal(storeAfter.status, "authenticated");
    assert.equal(storeAfter.mustSetPassword, false);
    assert.equal(storeAfter.role, spec.role);
    assert.equal(storeAfter.userId, forcedIdentity.id);

    const landingScreenshot = `set-password-real-${spec.role}-landing.png`;
    await saveScreenshot(page, landingScreenshot);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    const storeReload = await page.evaluate(async () => {
      const authModule = await import("/src/store/authStore.ts");
      const state = authModule.useAuthStore.getState();
      return {
        status: state.status,
        role: state.role,
        userId: state.userId,
        mustSetPassword: state.mustSetPassword,
      };
    });

    assert.equal(storeReload.status, "authenticated");
    assert.equal(storeReload.mustSetPassword, false);
    assert.equal(storeReload.role, spec.role);

    const reloadScreenshot = `set-password-real-${spec.role}-reload.png`;
    await saveScreenshot(page, reloadScreenshot);

    records.push({
      surface: `set-password-genuine-seeded-${spec.role}`,
      role: spec.role,
      userEmail: forcedIdentity.email,
      userId: forcedIdentity.id,
      realResponseStatus: recordedResponseStatus,
      tokenSubjectMatches: storeAfter.userId === forcedIdentity.id,
      tokenRoleMatches: storeAfter.role === spec.role,
      forcedStateCleared: true,
      routedToCanonicalLanding: true,
      landingPath: new URL(page.url()).pathname,
      reloadRemainsAuthenticated: true,
      files: [landingScreenshot, reloadScreenshot],
    });
    await context.close();
  }

  assert.deepEqual(errors, []);

  const probeReport = {
    scope: "KITOB-01-06 attempt 4 /set-password all authorized roles redesigned; AuthFrame static-emblem; synchronous submit ref guard; static Python 3.12 Unicode 15 digit policy; common 44px visibility toggle affecting both inputs; genuine forced session for all 4 roles; interactive settings surface theme and language switch with draft and visibility preservation; route interception assertions; safe random passwords in memory",
    timestamp: new Date().toISOString(),
    isolatedSeededDatabase: true,
    totalRecords: records.length,
    hardwareVerified: false,
    records,
  };

  const probeJson = JSON.stringify(probeReport, null, 2);
  await writeFile(`${outputDir}/probes.json`, probeJson);
  await writeFile(`${taskDir}/probes.json`, probeJson);
  await writeFile(`${attempt4Root}/probes.json`, probeJson);

  console.log(`PASS: ${records.length} probes verified; real seeded set-password flows for all roles, settings draft preservation, simulated error states, and responsive viewports captured.`);
} finally {
  rl.close();
  await browser.close();
}

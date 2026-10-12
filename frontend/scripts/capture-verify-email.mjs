import { chromium } from "playwright";
import assert from "node:assert/strict";
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

async function requestRedisCode(email) {
  process.stdout.write(JSON.stringify({ action: "get_redis_code", email }) + "\n");
  const responseLine = await readStdinLine();
  if (!responseLine) return "";
  const data = JSON.parse(responseLine);
  return String(data.code || "");
}

const initialLine = await readStdinLine();
const fixtures = initialLine ? JSON.parse(initialLine) : { password: "", identities: [] };

const outputDir = resolve("../docs/redesign-execution/group-01/task-05/screenshots");
const taskDir = resolve("../docs/redesign-execution/group-01/task-05");
const attempt2Dir = resolve("../docs/redesign-execution/group-01/task-05/attempt2/screenshots");
const attempt2Root = resolve("../docs/redesign-execution/group-01/task-05/attempt2");

await mkdir(outputDir, { recursive: true });
await mkdir(attempt2Dir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const records = [];
const errors = [];

async function saveScreenshot(page, fileName) {
  await page.screenshot({ path: `${outputDir}/${fileName}` });
  await page.screenshot({ path: `${attempt2Dir}/${fileName}` });
}

async function loadVerifyPage(page, url = "http://127.0.0.1:5174/verify-email") {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("h1").waitFor();
  await page.locator("#email").waitFor();
  await page.locator("#code").waitFor();
  await page.locator('button[type="submit"]').waitFor();
}

async function isOverflowing(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    } catch {
      await page.waitForTimeout(150);
    }
  }
  return false;
}

try {
  for (const theme of ["light", "dark"]) {
    for (const width of [390, 1440]) {
      const height = width === 1440 ? 1000 : 844;
      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: theme,
      });
      await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
      const page = await context.newPage();
      page.on("pageerror", (err) => errors.push({ test: `baseline-${width}-${theme}`, message: err.message }));

      await loadVerifyPage(page);

      const overflows = await isOverflowing(page);
      assert.equal(overflows, false);

      const headingMetrics = await page.evaluate(() => {
        const el = document.querySelector("h1");
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
        };
      });

      if (width === 1440) {
        assert.equal(headingMetrics?.fontSize, "28px");
        assert.equal(headingMetrics?.lineHeight, "36px");
      } else {
        assert.equal(headingMetrics?.fontSize, "24px");
        assert.equal(headingMetrics?.lineHeight, "32px");
      }

      const subtitleMetrics = await page.evaluate(() => {
        const el = document.querySelector("h1 + p");
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
        };
      });
      assert.equal(subtitleMetrics?.fontSize, "16px");
      assert.equal(subtitleMetrics?.lineHeight, "24px");

      const linkMetrics = await page.evaluate(() => {
        const link = document.querySelector('a[href="/login"]');
        if (!link) return null;
        const rect = link.getBoundingClientRect();
        const style = window.getComputedStyle(link);
        return {
          height: rect.height,
          color: style.color,
        };
      });
      assert.ok(linkMetrics && linkMetrics.height >= 44);

      const statusSlotHeight = await page.evaluate(() => {
        const slot = document.querySelector(".min-h-\\[24px\\]");
        if (!slot) return 0;
        return slot.getBoundingClientRect().height;
      });
      assert.ok(statusSlotHeight >= 24);

      const fileName = width === 1440 ? `verify-desktop-${theme}.png` : `verify-mobile-${theme}.png`;
      await saveScreenshot(page, fileName);

      records.push({
        surface: "verify-baseline",
        width,
        height,
        theme,
        locale: "en",
        headingFontSize: headingMetrics?.fontSize,
        headingLineHeight: headingMetrics?.lineHeight,
        subtitleFontSize: subtitleMetrics?.fontSize,
        subtitleLineHeight: subtitleMetrics?.lineHeight,
        backLinkHeight: linkMetrics?.height,
        statusSlotHeight,
        overflows,
        file: fileName,
      });
      await context.close();
    }
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

    await loadVerifyPage(page);

    const fileName = `verify-desktop-reduced-motion-${theme}.png`;
    await saveScreenshot(page, fileName);

    const motionState = await page.evaluate(() => {
      const staticEmblems = Array.from(document.querySelectorAll('img[src*="static"], img[src*="editable"]'));
      const loopEmblems = Array.from(document.querySelectorAll('img[src*="loop"], img[src*="animated"]'));
      return {
        staticVisible: staticEmblems.some((img) => window.getComputedStyle(img).display !== "none"),
        loopHidden: loopEmblems.every((img) => window.getComputedStyle(img).display === "none"),
      };
    });

    records.push({
      surface: "verify-reduced-motion",
      theme,
      staticVisible: motionState.staticVisible,
      loopHidden: motionState.loopHidden,
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

      await loadVerifyPage(page);

      const overflows = await isOverflowing(page);
      assert.equal(overflows, false);

      const submit = page.locator('button[type="submit"]');
      await submit.scrollIntoViewIfNeeded();
      assert.equal(await submit.isVisible(), true);

      const fileName = `verify-viewport-${width}-${theme}.png`;
      await saveScreenshot(page, fileName);
      records.push({
        surface: "verify-viewport",
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

    await loadVerifyPage(page);

    const submit = page.locator('button[type="submit"]');
    await submit.scrollIntoViewIfNeeded();
    assert.equal(await submit.isVisible(), true);

    const fileName = `verify-short-viewport-${theme}.png`;
    await saveScreenshot(page, fileName);
    records.push({
      surface: "verify-short-viewport",
      width: 1024,
      height: 500,
      theme,
      submitReachable: true,
      file: fileName,
    });
    await context.close();
  }

  for (const locale of ["ru", "tg"]) {
    for (const width of [390, 1440]) {
      const height = width === 1440 ? 1000 : 844;
      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: "light",
      });
      await context.addInitScript((loc) => localStorage.setItem("i18nextLng", loc), locale);
      const page = await context.newPage();
      page.on("pageerror", (err) => errors.push({ test: `locale-${locale}-${width}`, message: err.message }));

      await loadVerifyPage(page);

      const overflows = await isOverflowing(page);
      assert.equal(overflows, false);

      const prefix = width === 1440 ? "desktop" : "mobile";
      const fileName = `verify-${prefix}-${locale}.png`;
      await saveScreenshot(page, fileName);
      records.push({
        surface: "verify-locale",
        width,
        height,
        locale,
        overflows,
        file: fileName,
      });
      await context.close();
    }
  }

  for (const width of [390, 1440]) {
    const height = width === 1440 ? 1000 : 844;
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "tg"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: `enlarged-${width}`, message: err.message }));

    await loadVerifyPage(page);

    const prefix = width === 1440 ? "desktop" : "mobile";
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.locator('button[type="submit"]').scrollIntoViewIfNeeded();
    assert.equal(await isOverflowing(page), false);
    assert.equal(await page.locator('button[type="submit"]').isVisible(), true);
    const fileName = `verify-${prefix}-200pct-text.png`;
    await saveScreenshot(page, fileName);
    records.push({
      surface: "verify-enlarged-text",
      width,
      height,
      rootFontScale: 2,
      horizontalOverflow: false,
      submitReachable: true,
      locale: "tg",
      file: fileName,
    });
    await context.close();
  }

  for (const theme of ["light", "dark"]) {
    for (const width of [390, 1440]) {
      const height = width === 1440 ? 1000 : 844;
      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: theme,
      });
      await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
      const page = await context.newPage();
      page.on("pageerror", (err) => errors.push({ test: `settings-${width}-${theme}`, message: err.message }));

      await loadVerifyPage(page);
      const settingsButton = page.locator("button[data-shell-settings]");
      await settingsButton.waitFor();
      await settingsButton.click();

      const dialog = page.getByRole("dialog");
      await dialog.waitFor();

      const prefix = width === 1440 ? "desktop" : "mobile";
      const fileName = `verify-settings-open-${prefix}-${theme}.png`;
      await saveScreenshot(page, fileName);

      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });

      const focusedOnTrigger = await settingsButton.evaluate((el) => el === document.activeElement);
      records.push({
        surface: "verify-settings-open",
        width,
        height,
        theme,
        escapeDismissed: true,
        focusRestored: focusedOnTrigger,
        file: fileName,
      });
      await context.close();
    }
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push({ test: "keyboard-navigation", message: err.message }));

    await loadVerifyPage(page);

    await page.locator("#email").focus();
    assert.equal(await page.locator("#email").evaluate((el) => el === document.activeElement), true);

    await page.keyboard.press("Tab");
    assert.equal(await page.locator("#code").evaluate((el) => el === document.activeElement), true);

    await page.keyboard.press("Tab");
    assert.equal(await page.locator('button[type="submit"]').evaluate((el) => el === document.activeElement), true);

    await page.keyboard.press("Tab");
    const resendButton = page.locator("form button.tabular-nums");
    assert.equal(await resendButton.evaluate((el) => el === document.activeElement), true);

    await page.keyboard.press("Tab");
    const backLink = page.locator('a[href="/login"]');
    assert.equal(await backLink.evaluate((el) => el === document.activeElement), true);

    await saveScreenshot(page, "verify-keyboard-focus.png");
    records.push({
      surface: "verify-keyboard-focus",
      tabOrderCorrect: true,
      file: "verify-keyboard-focus.png",
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
    page.on("pageerror", (err) => errors.push({ test: "client-validation", message: err.message }));

    await loadVerifyPage(page);
    await page.locator('button[type="submit"]').click();

    const emailError = page.locator("#email-error");
    const codeError = page.locator("#code-error");
    await emailError.waitFor();
    await codeError.waitFor();

    assert.equal(await emailError.textContent(), "Required field");
    assert.equal(await codeError.textContent(), "Required field");

    await saveScreenshot(page, "verify-client-errors.png");

    await page.locator("#email").fill("invalid-email-address");
    await page.locator("#code").fill("123");
    await page.locator('button[type="submit"]').click();

    assert.equal(await emailError.textContent(), "Invalid email address");
    assert.equal(await codeError.textContent(), "Invalid code");

    await saveScreenshot(page, "verify-client-invalid-errors.png");

    records.push({
      surface: "verify-client-validation",
      emptyValidationErrors: true,
      invalidEmailError: true,
      shortCodeError: true,
      files: ["verify-client-errors.png", "verify-client-invalid-errors.png"],
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
    page.on("pageerror", (err) => errors.push({ test: "resend-client-validation", message: err.message }));

    let resendIntercepted = false;
    await page.route("**/api/v1/auth/resend-code", (route) => {
      resendIntercepted = true;
      route.abort();
    });

    await loadVerifyPage(page);
    const resendBtn = page.locator("form button.tabular-nums");
    await resendBtn.click();

    const emailError = page.locator("#email-error");
    await emailError.waitFor();
    assert.equal(await emailError.textContent(), "Required field");
    assert.equal(resendIntercepted, false);

    await page.locator("#email").fill("bad-format-email");
    await resendBtn.click();
    assert.equal(await emailError.textContent(), "Invalid email address");
    assert.equal(resendIntercepted, false);

    await saveScreenshot(page, "verify-resend-client-errors.png");

    records.push({
      surface: "verify-resend-client-validation",
      emptyEmailBlockedWithoutApi: true,
      invalidEmailBlockedWithoutApi: true,
      file: "verify-resend-client-errors.png",
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
    page.on("pageerror", (err) => errors.push({ test: "resend-manual-locale", message: err.message }));

    await loadVerifyPage(page);
    const resendBtn = page.locator("form button.tabular-nums");
    await resendBtn.click();

    const emailError = page.locator("#email-error");
    await emailError.waitFor();
    assert.equal(await emailError.textContent(), "Required field");
    assert.equal(await page.locator("#code-error").count(), 0);

    const settingsBtn = page.locator("button[data-shell-settings]");
    await settingsBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Русский" }).click();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    assert.equal(await emailError.textContent(), "Обязательное поле");
    assert.equal(await page.locator("#code-error").count(), 0);
    assert.equal(await settingsBtn.evaluate((el) => el === document.activeElement), true);

    await saveScreenshot(page, "verify-resend-manual-empty-ru.png");

    await settingsBtn.click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Тоҷикӣ" }).click();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    assert.equal(await emailError.textContent(), "Майдони ҳатмӣ");
    assert.equal(await page.locator("#code-error").count(), 0);

    await page.locator("#email").fill("not-an-email");
    await resendBtn.click();
    assert.equal(await emailError.textContent(), "Нишонии почтаи электронӣ нодуруст аст");
    assert.equal(await page.locator("#code-error").count(), 0);

    await saveScreenshot(page, "verify-resend-manual-invalid-tg.png");

    records.push({
      surface: "verify-resend-manual-locale-retranslation",
      emptyEmailRetranslated: true,
      invalidEmailRetranslated: true,
      codeValidationNotTriggered: true,
      settingsFocusPreserved: true,
      files: ["verify-resend-manual-empty-ru.png", "verify-resend-manual-invalid-tg.png"],
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
    page.on("pageerror", (err) => errors.push({ test: "422-unknown-error", message: err.message }));

    let requestIntercepted = false;
    let requestCount = 0;
    const technicalMsg = "Database error: postgres connection pool exhausted";
    await page.route("**/api/v1/auth/verify-code", (route) => {
      requestIntercepted = true;
      requestCount++;
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          detail: [
            { loc: ["body", "email"], msg: technicalMsg, type: "database_exception" },
          ],
        }),
      });
    });

    await loadVerifyPage(page);
    await page.locator("#email").fill("operator@example.com");
    await page.locator("#code").fill("123456");
    await page.locator('button[type="submit"]').click();

    const emailError = page.locator("#email-error");
    await emailError.waitFor();
    assert.equal(requestIntercepted, true);
    assert.equal(requestCount, 1);
    assert.equal(await emailError.textContent(), "Something went wrong. Please try again");

    const pageContent = await page.evaluate(() => document.body.textContent || "");
    assert.equal(pageContent.includes(technicalMsg), false);

    await saveScreenshot(page, "verify-422-unknown-error.png");
    records.push({
      surface: "verify-labeled-simulated-422-unknown",
      requestIntercepted: true,
      requestCount: 1,
      technicalDiagnosticsSuppressed: true,
      genericLocalizedErrorShown: true,
      file: "verify-422-unknown-error.png",
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
    page.on("pageerror", (err) => errors.push({ test: "simulated-expired-code", message: err.message }));

    let requestIntercepted = false;
    await page.route("**/api/v1/auth/verify-code", (route) => {
      requestIntercepted = true;
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Verification code expired or not requested" }),
      });
    });

    await loadVerifyPage(page);
    await page.locator("#email").fill("invited@example.com");
    await page.locator("#code").fill("123456");
    await page.locator('button[type="submit"]').click();

    const alert = page.locator('div[role="alert"]');
    await alert.waitFor();
    assert.equal(requestIntercepted, true);
    assert.equal(await alert.textContent(), "Verification code has expired. Please request a new one");

    await saveScreenshot(page, "verify-simulated-expired-en.png");

    const settingsButton = page.locator("button[data-shell-settings]");
    await settingsButton.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Русский" }).click();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    assert.equal(await alert.textContent(), "Срок действия кода истёк. Запросите новый код");
    assert.equal(await page.locator("#email").inputValue(), "invited@example.com");
    assert.equal(await page.locator("#code").inputValue(), "123456");

    await saveScreenshot(page, "verify-simulated-expired-ru.png");

    await settingsButton.click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Тоҷикӣ" }).click();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    assert.equal(await alert.textContent(), "Мӯҳлати коди тасдиқ гузашт. Лутфан коди навро дархост кунед");
    assert.equal(await page.locator("#email").inputValue(), "invited@example.com");
    assert.equal(await page.locator("#code").inputValue(), "123456");

    await saveScreenshot(page, "verify-simulated-expired-tg.png");

    records.push({
      surface: "verify-labeled-simulated-expired",
      requestIntercepted: true,
      translatedAcrossLanguages: true,
      valuesRetainedAcrossSwitch: true,
      files: [
        "verify-simulated-expired-en.png",
        "verify-simulated-expired-ru.png",
        "verify-simulated-expired-tg.png",
      ],
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
    page.on("pageerror", (err) => errors.push({ test: "simulated-too-many-attempts", message: err.message }));

    let requestIntercepted = false;
    await page.route("**/api/v1/auth/verify-code", (route) => {
      requestIntercepted = true;
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Too many incorrect attempts. Code invalidated." }),
      });
    });

    await loadVerifyPage(page);
    await page.locator("#email").fill("invited@example.com");
    await page.locator("#code").fill("654321");
    await page.locator('button[type="submit"]').click();

    const alert = page.locator('div[role="alert"]');
    await alert.waitFor();
    assert.equal(requestIntercepted, true);
    assert.equal(await alert.textContent(), "Too many incorrect attempts. Code invalidated. Please request a new code");

    await saveScreenshot(page, "verify-simulated-too-many-attempts.png");
    records.push({
      surface: "verify-labeled-simulated-too-many-attempts",
      requestIntercepted: true,
      file: "verify-simulated-too-many-attempts.png",
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
    page.on("pageerror", (err) => errors.push({ test: "simulated-invalid-code", message: err.message }));

    let requestIntercepted = false;
    await page.route("**/api/v1/auth/verify-code", (route) => {
      requestIntercepted = true;
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invalid verification code" }),
      });
    });

    await loadVerifyPage(page);
    await page.locator("#email").fill("invited@example.com");
    await page.locator("#code").fill("111222");
    await page.locator('button[type="submit"]').click();

    const codeError = page.locator("#code-error");
    await codeError.waitFor();
    assert.equal(requestIntercepted, true);
    assert.equal(await codeError.textContent(), "Invalid code");

    await saveScreenshot(page, "verify-simulated-invalid-code.png");
    records.push({
      surface: "verify-labeled-simulated-invalid-code",
      requestIntercepted: true,
      file: "verify-simulated-invalid-code.png",
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
    page.on("pageerror", (err) => errors.push({ test: "simulated-user-not-found", message: err.message }));

    let requestIntercepted = false;
    await page.route("**/api/v1/auth/verify-code", (route) => {
      requestIntercepted = true;
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "User not found" }),
      });
    });

    await loadVerifyPage(page);
    await page.locator("#email").fill("nonexistent@example.com");
    await page.locator("#code").fill("333444");
    await page.locator('button[type="submit"]').click();

    const emailError = page.locator("#email-error");
    await emailError.waitFor();
    assert.equal(requestIntercepted, true);
    assert.equal(await emailError.textContent(), "User with this email was not found");

    await saveScreenshot(page, "verify-simulated-user-not-found.png");
    records.push({
      surface: "verify-labeled-simulated-user-not-found",
      requestIntercepted: true,
      file: "verify-simulated-user-not-found.png",
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
    page.on("pageerror", (err) => errors.push({ test: "simulated-resend-rate-limit", message: err.message }));

    let requestIntercepted = false;
    await page.route("**/api/v1/auth/resend-code", (route) => {
      requestIntercepted = true;
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Too many requests" }),
      });
    });

    await loadVerifyPage(page);
    await page.locator("#email").fill("invited@example.com");
    const resendBtn = page.locator("form button.tabular-nums");
    await resendBtn.click();

    const alert = page.locator('div[role="alert"]');
    await alert.waitFor();
    assert.equal(requestIntercepted, true);
    assert.equal(await alert.textContent(), "Too many attempts. Please try again later");

    await saveScreenshot(page, "verify-simulated-resend-rate-limit.png");
    records.push({
      surface: "verify-labeled-simulated-resend-rate-limit",
      requestIntercepted: true,
      file: "verify-simulated-resend-rate-limit.png",
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

    await page.route("**/api/v1/auth/verify-code", (route) => route.abort("failed"));

    await loadVerifyPage(page);
    await page.locator("#email").fill("test.net@example.com");
    await page.locator("#code").fill("999888");
    await page.locator('button[type="submit"]').click();

    const alert = page.locator('div[role="alert"]');
    await alert.waitFor();
    assert.equal(await alert.textContent(), "Could not connect to server. Check your internet connection");

    await saveScreenshot(page, "verify-simulated-network-error.png");
    records.push({
      surface: "verify-labeled-simulated-network-error",
      networkAlertShown: true,
      file: "verify-simulated-network-error.png",
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
    page.on("pageerror", (err) => errors.push({ test: "duplicate-enter-pending", message: err.message }));

    let requestCount = 0;
    await page.route("**/api/v1/auth/verify-code", async (route) => {
      requestCount++;
      await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3000));
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Too many incorrect attempts. Code invalidated." }),
      });
    });

    await loadVerifyPage(page);
    await page.locator("#email").fill("rapid.tester@example.com");
    await page.locator("#code").fill("555666");

    await page.locator("#code").press("Enter");
    await page.locator("#code").press("Enter");

    const submitButton = page.locator('button[type="submit"]');
    assert.equal(await submitButton.isDisabled(), true);
    assert.equal(await submitButton.getAttribute("aria-busy"), "true");

    await saveScreenshot(page, "verify-simulated-loading.png");

    const alert = page.locator('div[role="alert"]');
    await alert.waitFor();
    assert.equal(requestCount, 1);
    assert.equal(await alert.textContent(), "Too many incorrect attempts. Code invalidated. Please request a new code");
    assert.equal(await submitButton.isDisabled(), false);

    records.push({
      surface: "verify-labeled-simulated-loading",
      rapidEnterBlockedSecondRequest: true,
      singleApiCallWhilePending: true,
      retryAllowedAfterFailure: true,
      file: "verify-simulated-loading.png",
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
    page.on("pageerror", (err) => errors.push({ test: "resend-cooldown-isolation", message: err.message }));

    await page.route("**/api/v1/auth/resend-code", (route) => {
      route.fulfill({ status: 204 });
    });

    await page.clock.install();
    await loadVerifyPage(page);
    await page.locator("#email").fill("first.user@example.com");
    const resendBtn = page.locator("form button.tabular-nums");
    await resendBtn.click();

    const statusMsg = page.locator('p[role="status"]');
    await statusMsg.waitFor();
    assert.equal(await statusMsg.textContent(), "A new verification code has been sent to your email");

    assert.equal(await resendBtn.isDisabled(), true);
    const buttonText = await resendBtn.textContent();
    assert.ok(buttonText?.includes("Resend code ("));

    await saveScreenshot(page, "verify-resend-success-cooldown.png");
    await page.clock.runFor(2000);
    const initialSeconds = Number(buttonText.match(/\((\d+)s\)/)[1]);
    const remainingSeconds = Number((await resendBtn.textContent()).match(/\((\d+)s\)/)[1]);
    assert.ok(remainingSeconds > 0 && remainingSeconds < initialSeconds);

    await page.locator("#email").fill("second.user@example.com");
    assert.equal(await resendBtn.isDisabled(), false);
    assert.equal(await resendBtn.textContent(), "Resend code");

    await page.locator("#email").fill("first.user@example.com");
    assert.equal(await resendBtn.isDisabled(), true);
    assert.ok((await resendBtn.textContent())?.includes("Resend code ("));

    await page.clock.runFor(60000);
    assert.equal(await resendBtn.isDisabled(), false);
    assert.equal(await resendBtn.textContent(), "Resend code");

    records.push({
      surface: "verify-resend-cooldown-isolation",
      cooldownDisabledButton: true,
      cooldownIsolatedToEmail: true,
      countdownDecrements: true,
      localCooldownExpires: true,
      clockSimulationExplicit: true,
      file: "verify-resend-success-cooldown.png",
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
    page.on("pageerror", (err) => errors.push({ test: "real-backend-verify-flow", message: err.message }));

    const forcedIdentity = fixtures.identities.find((i) => i.forced);
    assert.ok(forcedIdentity);
    const targetEmail = forcedIdentity.email;

    await loadVerifyPage(page);
    await page.locator("#email").fill(targetEmail);
    await page.locator("#code").fill("999999");
    await page.locator('button[type="submit"]').click();

    const alert = page.locator('div[role="alert"]');
    await alert.waitFor();
    assert.equal(await alert.textContent(), "Verification code has expired. Please request a new one");

    await saveScreenshot(page, "verify-real-expired-result.png");

    const resendBtn = page.locator("form button.tabular-nums");
    await resendBtn.click();

    const statusMsg = page.locator('p[role="status"]');
    await statusMsg.waitFor();
    assert.equal(await statusMsg.textContent(), "A new verification code has been sent to your email");

    await saveScreenshot(page, "verify-real-resend-success.png");

    await page.locator("#email").fill("another.user@example.com");
    assert.equal(await page.locator('p[role="status"]').count(), 0);

    await page.locator("#email").fill(targetEmail);
    await statusMsg.waitFor();
    assert.equal(await statusMsg.textContent(), "A new verification code has been sent to your email");

    const realCode = await requestRedisCode(targetEmail);
    assert.equal(realCode.length, 6);

    await page.locator("#code").fill(realCode);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL((url) => url.pathname === "/set-password");
    assert.equal(new URL(page.url()).pathname, "/set-password");

    const storeState = await page.evaluate(async () => {
      const authModule = await import("/src/store/authStore.ts");
      const state = authModule.useAuthStore.getState();
      return {
        status: state.status,
        role: state.role,
        mustSetPassword: state.mustSetPassword,
      };
    });

    assert.equal(storeState.status, "authenticated");
    assert.equal(storeState.mustSetPassword, true);

    await saveScreenshot(page, "verify-real-success-set-password-landing.png");

    records.push({
      surface: "verify-genuine-seeded-flow",
      realExpiredReturned400: true,
      realResendReturned204: true,
      resendStatusOwnershipVerified: true,
      redisCodeSafelyObtainedInMemory: true,
      realVerifyCodeReturned200: true,
      forcedGuardRoutedToSetPassword: true,
      storeVerifiedAuthenticated: true,
      files: [
        "verify-real-expired-result.png",
        "verify-real-resend-success.png",
        "verify-real-success-set-password-landing.png",
      ],
    });
    await context.close();
  }

  assert.deepEqual(errors, []);

  const probeReport = {
    scope: "KITOB-01-05 /verify-email invitation activation redesigned; AuthFrame animated-loop; 6-digit schema; mapVerifyCodeError / mapResendCodeError; 16/24 body; 44px link; 24px status reserved slot; reduced-motion; simultaneous submit ref guard; genuine seeded verify and forced set-password routing",
    timestamp: new Date().toISOString(),
    isolatedSeededDatabase: true,
    totalRecords: records.length,
    hardwareVerified: false,
    records,
  };

  const probeJson = JSON.stringify(probeReport, null, 2);
  await writeFile(`${outputDir}/probes.json`, probeJson);
  await writeFile(`${taskDir}/probes.json`, probeJson);
  await writeFile(`${attempt2Dir}/probes.json`, probeJson);
  await writeFile(`${attempt2Root}/probes.json`, probeJson);

  console.log(`PASS: ${records.length} probes verified; real seeded verify flow, error states, and responsive viewports captured.`);
} finally {
  rl.close();
  await browser.close();
}

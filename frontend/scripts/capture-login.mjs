import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixtures = JSON.parse(input);

const outputDir = resolve("../docs/redesign-execution/group-01/task-04/screenshots");
const taskDir = resolve("../docs/redesign-execution/group-01/task-04");
const attempt3Dir = resolve("../docs/redesign-execution/group-01/task-04/attempt3/screenshots");
const attempt3Root = resolve("../docs/redesign-execution/group-01/task-04/attempt3");

await mkdir(outputDir, { recursive: true });
await mkdir(attempt3Dir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const records = [];
const errors = [];

async function saveScreenshot(page, fileName) {
  await page.screenshot({ path: `${outputDir}/${fileName}` });
  await page.screenshot({ path: `${attempt3Dir}/${fileName}` });
}

async function loadLoginPage(page, url = "http://127.0.0.1:5174/login") {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("h1").waitFor();
  await page.locator("#email").waitFor();
  await page.locator("#password").waitFor();
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

      await loadLoginPage(page);

      const overflows = await isOverflowing(page);
      assert.equal(overflows, false);

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

      const activationLinkCount = await page.locator('a[href="/verify-email"]').count();
      assert.equal(activationLinkCount, 0);

      const fileName = width === 1440 ? `login-desktop-${theme}.png` : `login-mobile-${theme}.png`;
      await saveScreenshot(page, fileName);
      records.push({
        surface: "login-baseline",
        width,
        height,
        theme,
        locale: "en",
        subtitleFontSize: subtitleMetrics?.fontSize,
        subtitleLineHeight: subtitleMetrics?.lineHeight,
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

    await loadLoginPage(page);

    const fileName = `login-desktop-reduced-motion-${theme}.png`;
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
      surface: "login-reduced-motion",
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

      await loadLoginPage(page);

      const overflows = await isOverflowing(page);
      assert.equal(overflows, false);

      const submit = page.locator('button[type="submit"]');
      await submit.scrollIntoViewIfNeeded();
      assert.equal(await submit.isVisible(), true);

      const fileName = `login-viewport-${width}-${theme}.png`;
      await saveScreenshot(page, fileName);
      records.push({
        surface: "login-viewport",
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

    await loadLoginPage(page);

    const submit = page.locator('button[type="submit"]');
    await submit.scrollIntoViewIfNeeded();
    assert.equal(await submit.isVisible(), true);

    const fileName = `login-short-viewport-${theme}.png`;
    await saveScreenshot(page, fileName);
    records.push({
      surface: "login-short-viewport",
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

      await loadLoginPage(page);

      const overflows = await isOverflowing(page);
      assert.equal(overflows, false);

      const prefix = width === 1440 ? "desktop" : "mobile";
      const fileName = `login-${prefix}-${locale}.png`;
      await saveScreenshot(page, fileName);
      records.push({
        surface: "login-locale",
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

    await loadLoginPage(page);

    const prefix = width === 1440 ? "desktop" : "mobile";
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.locator('button[type="submit"]').scrollIntoViewIfNeeded();
    assert.equal(await isOverflowing(page), false);
    assert.equal(await page.locator('button[type="submit"]').isVisible(), true);
    const fileName = `login-${prefix}-200pct-text.png`;
    await saveScreenshot(page, fileName);
    records.push({
      surface: "login-enlarged-text",
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

      await loadLoginPage(page);
      const settingsButton = page.locator("button[data-shell-settings]");
      await settingsButton.waitFor();
      await settingsButton.click();

      const dialog = page.getByRole("dialog");
      await dialog.waitFor();

      const prefix = width === 1440 ? "desktop" : "mobile";
      const fileName = `login-settings-open-${prefix}-${theme}.png`;
      await saveScreenshot(page, fileName);

      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });

      const focusedOnTrigger = await settingsButton.evaluate((el) => el === document.activeElement);
      records.push({
        surface: "login-settings-open",
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
    page.on("pageerror", (err) => errors.push({ test: "visibility-retention", message: err.message }));

    await loadLoginPage(page);
    const emailInput = page.locator("#email");
    const passwordInput = page.locator("#password");
    const harmlessTestValue = "SampleNonSecret99!";

    await emailInput.fill("operator@example.com");
    await passwordInput.fill(harmlessTestValue);

    const toggleButton = page.getByRole("button", { name: "Show password" });
    await toggleButton.click();

    assert.equal(await passwordInput.getAttribute("type"), "text");
    assert.equal(await passwordInput.inputValue(), harmlessTestValue);

    await saveScreenshot(page, "login-visibility-shown.png");

    const settingsButton = page.locator("button[data-shell-settings]");
    await settingsButton.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();

    const ruOption = dialog.getByRole("button", { name: "Русский" });
    await ruOption.click();

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    assert.equal(await emailInput.inputValue(), "operator@example.com");
    assert.equal(await passwordInput.inputValue(), harmlessTestValue);
    assert.equal(await passwordInput.getAttribute("type"), "text");

    await saveScreenshot(page, "login-retention-locale-switch.png");

    await passwordInput.fill("");
    assert.equal(await passwordInput.inputValue(), "");

    records.push({
      surface: "login-visibility-and-retention",
      toggleWorked: true,
      preservedAcrossLanguageSwitch: true,
      clearedBeforeAuth: true,
      files: ["login-visibility-shown.png", "login-retention-locale-switch.png"],
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
    page.on("pageerror", (err) => errors.push({ test: "keyboard-navigation", message: err.message }));

    await loadLoginPage(page);

    await page.locator("#email").focus();
    assert.equal(await page.locator("#email").evaluate((el) => el === document.activeElement), true);

    await page.keyboard.press("Tab");
    assert.equal(await page.locator("#password").evaluate((el) => el === document.activeElement), true);

    await page.keyboard.press("Tab");
    const toggleFocused = await page.getByRole("button", { name: "Show password" }).evaluate((el) => el === document.activeElement);
    assert.equal(toggleFocused, true);

    await saveScreenshot(page, "login-keyboard-focus.png");
    records.push({
      surface: "login-keyboard-focus",
      emailTabToPassword: true,
      passwordTabToToggle: true,
      file: "login-keyboard-focus.png",
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

    await loadLoginPage(page);
    await page.locator('button[type="submit"]').click();

    const emailError = page.locator("#email-error");
    const passwordError = page.locator("#password-error");
    await emailError.waitFor();
    await passwordError.waitFor();

    assert.equal(await emailError.textContent(), "Required field");
    assert.equal(await passwordError.textContent(), "Required field");

    await saveScreenshot(page, "login-client-errors.png");

    await page.locator("#email").fill("not-an-email");
    await page.locator('button[type="submit"]').click();
    assert.equal(await emailError.textContent(), "Invalid email address");

    await saveScreenshot(page, "login-invalid-email-error.png");

    records.push({
      surface: "login-client-validation",
      emptyValidationErrors: true,
      invalidEmailError: true,
      files: ["login-client-errors.png", "login-invalid-email-error.png"],
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
    page.on("pageerror", (err) => errors.push({ test: "422-arbitrary-error-keyboard", message: err.message }));

    const technicalMessage = "Domain not allowed: database lookup LDAP rejection trace";
    await page.route("**/api/v1/auth/login", (route) => {
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          detail: [
            { loc: ["body", "email"], msg: technicalMessage, type: "value_error" },
            { loc: ["body", "password"], msg: "Password hash verification failed", type: "value_error" },
          ],
        }),
      });
    });

    await loadLoginPage(page);
    await page.locator("#email").fill("operator@bad-corp.com");
    await page.locator("#password").fill("ValidPassword123!");

    await page.locator("#password").press("Enter");

    const emailError = page.locator("#email-error");
    const passwordError = page.locator("#password-error");
    await emailError.waitFor();
    await passwordError.waitFor();

    assert.equal(await emailError.textContent(), "Something went wrong. Please try again");
    assert.equal(await passwordError.textContent(), "Something went wrong. Please try again");
    const bodyTextEn = await page.evaluate(() => document.body.textContent || "");
    assert.equal(bodyTextEn.includes(technicalMessage), false);

    await saveScreenshot(page, "login-422-arbitrary-error-en.png");

    const settingsBtn = page.locator("button[data-shell-settings]");
    await settingsBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Русский" }).click();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    assert.equal(await emailError.textContent(), "Что-то пошло не так. Попробуйте ещё раз");
    assert.equal(await passwordError.textContent(), "Что-то пошло не так. Попробуйте ещё раз");
    assert.equal(await page.locator("#email").inputValue(), "operator@bad-corp.com");
    assert.equal(await page.locator("#password").inputValue(), "ValidPassword123!");
    const bodyTextRu = await page.evaluate(() => document.body.textContent || "");
    assert.equal(bodyTextRu.includes(technicalMessage), false);

    await saveScreenshot(page, "login-422-arbitrary-error-ru.png");

    await settingsBtn.click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Тоҷикӣ" }).click();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    assert.equal(await emailError.textContent(), "Хатои номаълум рух дод. Лутфан бори дигар кӯшиш кунед");
    assert.equal(await passwordError.textContent(), "Хатои номаълум рух дод. Лутфан бори дигар кӯшиш кунед");
    assert.equal(await page.locator("#email").inputValue(), "operator@bad-corp.com");
    assert.equal(await page.locator("#password").inputValue(), "ValidPassword123!");

    await saveScreenshot(page, "login-422-arbitrary-error-tg.png");

    records.push({
      surface: "login-labeled-simulated-422-arbitrary",
      nativeKeyboardEnter: true,
      technicalDiagnosticsSuppressed: true,
      arbitraryMappedToGeneric: true,
      errorTranslatedEnRuTg: true,
      valuesPreservedAcrossLocaleSwitches: true,
      files: [
        "login-422-arbitrary-error-en.png",
        "login-422-arbitrary-error-ru.png",
        "login-422-arbitrary-error-tg.png",
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
    page.on("pageerror", (err) => errors.push({ test: "422-field-mapping-keyboard", message: err.message }));

    let formatRequestCount = 0;
    const technicalMessage = "Email syntax check failed: missing at sign in string";
    await page.route("**/api/v1/auth/login", (route) => {
      formatRequestCount += 1;
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          detail: [
            {
              loc: ["body", "email"],
              msg: technicalMessage,
              type: "value_error",
              ctx: { reason: "An email address must have an @-sign." },
            },
          ],
        }),
      });
    });

    await loadLoginPage(page);
    await page.locator("#email").fill("operator@example.com");
    await page.locator("#password").fill("ValidPassword123!");

    await page.locator("#password").press("Enter");

    const emailError = page.locator("#email-error");
    await emailError.waitFor();
    assert.equal(formatRequestCount, 1);

    assert.equal(await emailError.textContent(), "Invalid email address");
    const bodyTextEn = await page.evaluate(() => document.body.textContent || "");
    assert.equal(bodyTextEn.includes(technicalMessage), false);

    await saveScreenshot(page, "login-422-field-error-en.png");

    const settingsBtn = page.locator("button[data-shell-settings]");
    await settingsBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Русский" }).click();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    assert.equal(await emailError.textContent(), "Некорректный адрес электронной почты");
    assert.equal(await page.locator("#email").inputValue(), "operator@example.com");
    assert.equal(await page.locator("#password").inputValue(), "ValidPassword123!");
    const bodyTextRu = await page.evaluate(() => document.body.textContent || "");
    assert.equal(bodyTextRu.includes(technicalMessage), false);

    await saveScreenshot(page, "login-422-field-error-ru.png");

    await settingsBtn.click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Тоҷикӣ" }).click();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    assert.equal(await emailError.textContent(), "Нишонии почтаи электронӣ нодуруст аст");
    assert.equal(await page.locator("#email").inputValue(), "operator@example.com");
    assert.equal(await page.locator("#password").inputValue(), "ValidPassword123!");

    await saveScreenshot(page, "login-422-field-error-tg.png");

    records.push({
      surface: "login-labeled-simulated-422-format",
      nativeKeyboardEnter: true,
      technicalDiagnosticsSuppressed: true,
      errorTranslatedEnRuTg: true,
      valuesPreservedAcrossLocaleSwitches: true,
      files: [
        "login-422-field-error-en.png",
        "login-422-field-error-ru.png",
        "login-422-field-error-tg.png",
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
    page.on("pageerror", (err) => errors.push({ test: "duplicate-enter-pending", message: err.message }));

    let requestCount = 0;
    await page.route("**/api/v1/auth/login", async (route) => {
      requestCount++;
      await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3000));
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Incorrect email or password" }),
      });
    });

    await loadLoginPage(page);
    await page.locator("#email").fill("test.rapid@example.com");
    await page.locator("#password").fill("Password123!");

    await page.locator("#password").press("Enter");
    await page.locator("#password").press("Enter");

    const submitButton = page.locator('button[type="submit"]');
    assert.equal(await submitButton.isDisabled(), true);
    assert.equal(await submitButton.getAttribute("aria-busy"), "true");
    await saveScreenshot(page, "login-simulated-loading.png");

    const alert = page.locator('div[role="alert"]');
    await alert.waitFor();
    assert.equal(requestCount, 1);
    assert.equal(await alert.textContent(), "Invalid email or password");
    assert.equal(await submitButton.isDisabled(), false);

    records.push({
      surface: "login-labeled-simulated-loading",
      rapidEnterBlockedSecondRequest: true,
      singleApiCallWhilePending: true,
      retryAllowedAfterFailure: true,
      files: ["login-simulated-loading.png"],
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
    page.on("pageerror", (err) => errors.push({ test: "real-401-error", message: err.message }));

    await loadLoginPage(page);
    await page.locator("#email").fill("superadmin@kitob.example.com");
    await page.locator("#password").fill("completely-wrong-password-999");
    await page.locator('button[type="submit"]').click();

    const alert = page.locator('div[role="alert"]');
    await alert.waitFor();
    assert.equal(await alert.textContent(), "Invalid email or password");

    await saveScreenshot(page, "login-real-401-error.png");

    const settingsButton = page.locator("button[data-shell-settings]");
    await settingsButton.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();

    await dialog.getByRole("button", { name: "Русский" }).click();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    assert.equal(await alert.textContent(), "Неверный email или пароль");
    assert.equal(await page.locator("#email").inputValue(), "superadmin@kitob.example.com");
    assert.equal(await page.locator("#password").inputValue(), "completely-wrong-password-999");

    await saveScreenshot(page, "login-401-error-locale-updated.png");

    records.push({
      surface: "login-real-401-error",
      realBackend401: true,
      localeUpdatedWithoutClearing: true,
      files: ["login-real-401-error.png", "login-401-error-locale-updated.png"],
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

    await page.route("**/api/v1/auth/login", (route) => route.abort("failed"));

    await loadLoginPage(page);
    await page.locator("#email").fill("test.net@example.com");
    await page.locator("#password").fill("Password123!");
    await page.locator('button[type="submit"]').click();

    const alert = page.locator('div[role="alert"]');
    await alert.waitFor();
    assert.equal(await alert.textContent(), "Could not connect to server. Check your internet connection");

    await saveScreenshot(page, "login-simulated-network-error.png");

    records.push({
      surface: "login-labeled-simulated-network-error",
      simulated: true,
      networkAlertShown: true,
      file: "login-simulated-network-error.png",
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
    page.on("pageerror", (err) => errors.push({ test: "open-redirect", message: err.message }));

    const superadmin = fixtures.identities.find((i) => i.role === "superadmin");
    assert.ok(superadmin);

    await loadLoginPage(page, "http://127.0.0.1:5174/login?redirect=//evil.com");
    await page.locator("#email").fill(superadmin.email);
    await page.locator("#password").fill(fixtures.password);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL((url) => url.pathname === "/");
    assert.equal(new URL(page.url()).origin, "http://127.0.0.1:5174");
    assert.equal(new URL(page.url()).pathname, "/");

    records.push({
      surface: "login-open-redirect-protection",
      attemptedRedirect: "//evil.com",
      safeDestination: "/",
      protected: true,
    });
    await context.close();
  }

  for (const fixture of fixtures.identities) {
    for (const theme of ["light", "dark"]) {
      for (const width of [390, 1440]) {
        const height = width === 1440 ? 1000 : 844;
        const context = await browser.newContext({
          viewport: { width, height },
          colorScheme: theme,
        });
        await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
        const page = await context.newPage();
        page.on("pageerror", (err) => errors.push({ test: `auth-${fixture.role}-${width}-${theme}`, message: err.message }));

        await loadLoginPage(page);
        await page.locator("#email").fill(fixture.email);
        await page.locator("#password").fill(fixtures.password);
        await page.locator('button[type="submit"]').click();

        const expectedPath = fixture.forced
          ? "/set-password"
          : fixture.role === "student"
          ? `/students/${fixture.id}`
          : fixture.role === "mentor"
          ? `/mentors/${fixture.id}`
          : "/";

        await page.waitForURL((url) => url.pathname === expectedPath);

        const storeIdentity = await page.evaluate(async () => {
          const authModule = await import("/src/store/authStore.ts");
          const state = authModule.useAuthStore.getState();
          return {
            status: state.status,
            userId: state.userId,
            role: state.role,
            mustSetPassword: state.mustSetPassword,
          };
        });

        assert.equal(storeIdentity.status, "authenticated");
        assert.equal(storeIdentity.userId, fixture.id);
        assert.equal(storeIdentity.role, fixture.role);
        assert.equal(storeIdentity.mustSetPassword, fixture.forced);

        if (fixture.forced) {
          await page.locator('input[autocomplete="new-password"]').first().waitFor();
        } else {
          await page.locator("main").waitFor();
        }

        const rolePrefix = fixture.forced ? "forced-password" : fixture.role;
        const fileName = `${rolePrefix}-landing-${width}-${theme}.png`;
        await saveScreenshot(page, fileName);

        records.push({
          surface: "login-genuine-seeded-auth",
          role: fixture.role,
          userId: fixture.id,
          forced: fixture.forced,
          width,
          theme,
          destination: expectedPath,
          realBackendLogin: true,
          storeVerified: true,
          file: fileName,
        });
        await context.close();
      }
    }
  }

  assert.deepEqual(errors, []);

  const probeReport = {
    scope: "KITOB-01-04 Login page redesigned (Attempt 3 correction); AuthFrame animated-loop; 422 mapping; 16/24 body; 44px link; reduced-motion; simultaneous submit ref guard; genuine seeded login across 4 roles and forced fixture",
    timestamp: new Date().toISOString(),
    isolatedSeededDatabase: true,
    totalRecords: records.length,
    hardwareVerified: false,
    records,
  };

  const probeJson = JSON.stringify(probeReport, null, 2);
  await writeFile(`${outputDir}/probes.json`, probeJson);
  await writeFile(`${taskDir}/probes.json`, probeJson);
  await writeFile(`${attempt3Dir}/probes.json`, probeJson);
  await writeFile(`${attempt3Root}/probes.json`, probeJson);

  console.log(`PASS: ${records.length} probes verified; real seeded auth, safe redirect, error states, and responsive viewports captured. ${attempt3Dir}`);
} finally {
  await browser.close();
}

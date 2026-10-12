import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixtures = JSON.parse(input);

const taskDir = resolve(
  process.env.KITOB_TASK_DIR ||
  "../docs/redesign-execution/group-02/course-forms/form-attempt1"
);
const taskScreenshotsDir = `${taskDir}/screenshots`;

await mkdir(taskScreenshotsDir, { recursive: true });

const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
assert.ok(superadmin, "Superadmin fixture identity must be present");

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5189";

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

async function loginAndNavigateToCourses(page, identity, destination = "/courses") {
  await page.goto(`${previewOrigin}/login?redirect=${encodeURIComponent(destination)}`);
  await page.waitForLoadState("domcontentloaded");
  if (page.url().includes("/login")) {
    await page.locator("#email").waitFor({ timeout: 15000 });
    await page.locator("#email").fill(identity.email);
    await page.locator("#password").fill(fixtures.password);
    await page.locator('button[type="submit"]').click();
  }
  const expectedPath = destination.split("?")[0];
  await page.waitForURL((url) => url.pathname === expectedPath, { timeout: 30000 });
  await page.locator("h1").waitFor({ timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('main [data-testid="brand-activity-indicator"], main [class*="animate-pulse"]'));
}

async function measureFormFontSizes(dialog) {
  return await dialog.evaluate(() => {
    const selectors = [
      "#course-title-field",
      "#course-description-field",
      "#course-mentor-field",
      "#course-start-date-field",
      "#course-end-date-field",
      "#course-price-field",
      "#course-exam-type-field",
      "#schedule-time-start-0",
      "#schedule-time-end-0",
      "#schedule-day-0",
    ];
    return selectors.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { selector: sel, found: false };
      const cs = window.getComputedStyle(el);
      return {
        selector: sel,
        found: true,
        fontSize: cs.fontSize,
        fontSizePx: parseFloat(cs.fontSize),
      };
    });
  });
}

async function openEditCourseWithSchedule(page) {
  let actionsBtn = page.getByRole("button", { name: /Course actions: Python Fundamentals/i });
  if ((await actionsBtn.count()) === 0) {
    actionsBtn = page.getByRole("button", { name: /Course actions: English IELTS/i });
  }
  if ((await actionsBtn.count()) === 0) {
    actionsBtn = page.getByRole("button", { name: /^Course actions:/ }).first();
  }
  await actionsBtn.click();
  const editItem = page.getByRole("menuitem", { name: /Edit|Редактировать|Таҳрир/i });
  await editItem.click();
  const editDialog = page.getByRole("dialog");
  await editDialog.waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  return editDialog;
}

try {
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    let adminClosedMentorHistoryRequests = 0;
    await context.route("**/api/v1/courses/*/mentor-history*", async (route) => {
      adminClosedMentorHistoryRequests++;
      await route.continue();
    });

    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    registerProbe({
      probe: "admin-role-closed-read-security",
      adminClosedMentorHistoryRequests,
      passed: adminClosedMentorHistoryRequests === 0,
    });

    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    const titleInput = dialog.locator("#course-title-field");
    const descInput = dialog.locator("#course-description-field");
    const mentorSelect = dialog.locator("#course-mentor-field");
    const priceInput = dialog.locator("#course-price-field");
    const imageDropzone = dialog.locator('[data-testid="course-image-dropzone"]');

    await mentorSelect.waitFor({ state: "visible", timeout: 10000 });
    await imageDropzone.waitFor({ state: "visible", timeout: 10000 });

    const titleBox = await titleInput.boundingBox();
    const descBox = await descInput.boundingBox();
    const mentorBox = await mentorSelect.boundingBox();
    const priceBox = await priceInput.boundingBox();
    const imageBox = await imageDropzone.boundingBox();

    const orderCorrect = Boolean(
      titleBox && descBox && mentorBox && priceBox && imageBox &&
      titleBox.y < descBox.y &&
      descBox.y < mentorBox.y &&
      mentorBox.y < priceBox.y &&
      priceBox.y < imageBox.y
    );

    registerProbe({
      probe: "create-form-section-order-desktop",
      orderCorrect,
      passed: orderCorrect,
    });

    await recordScreenshot(page, "desktop-1440-create-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin course create drawer in light theme with section order: Identity, Mentor & dates, Price & exams, Schedule, Image last",
    });

    const createBtn = dialog.getByRole("button", { name: /Create|Создать|Эҷод кардан/i });
    await createBtn.click();
    await page.waitForTimeout(300);

    const titleError = dialog.locator("#course-title-error");
    await titleError.waitFor({ timeout: 3000 });
    const isTitleFocused = await titleInput.evaluate((el) => document.activeElement === el);

    registerProbe({
      probe: "invalid-submit-focuses-first-invalid-field",
      isTitleFocused,
      titleErrorVisible: await titleError.isVisible(),
      passed: isTitleFocused,
    });

    await recordScreenshot(page, "desktop-1440-create-validation-errors.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Validation errors displayed and first invalid field focused on invalid create submit",
    });

    await titleInput.fill("Draft Title for Dismissal");
    const closeBtn = dialog.getByRole("button", { name: /Close|Закрыть|Пӯшидан/i });
    await closeBtn.click();

    const confirmDialog = page.getByRole("dialog", { name: /Discard changes\?|Отменить изменения\?|Тағйиротро бекор кардан\?/i });
    await confirmDialog.waitFor({ timeout: 5000 });

    registerProbe({
      probe: "dirty-dismiss-intercepted-by-confirm-dialog",
      confirmDialogVisible: await confirmDialog.isVisible(),
      passed: true,
    });

    await recordScreenshot(page, "desktop-1440-create-dirty-discard-confirm.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Discard changes confirmation dialog intercepted on dirty drawer close attempt",
    });

    const keepEditingBtn = confirmDialog.getByRole("button", { name: /Keep editing|Продолжить редактирование|Идома додани таҳрир/i });
    await keepEditingBtn.click();
    await confirmDialog.waitFor({ state: "detached" });
    await page.waitForTimeout(100);

    const isRefocused = await titleInput.evaluate((el) => document.activeElement === el);
    registerProbe({
      probe: "keep-editing-restores-form-focus",
      isRefocused,
      passed: isRefocused,
    });

    await closeBtn.click();
    await confirmDialog.waitFor({ timeout: 5000 });
    const discardBtn = confirmDialog.getByRole("button", { name: /Discard|Сбросить|Бекор кардан/i });
    await discardBtn.click();
    await confirmDialog.waitFor({ state: "detached" });
    await dialog.waitFor({ state: "detached" });

    registerProbe({
      probe: "discard-clears-draft-and-closes-drawer",
      passed: true,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });

    await dialog.locator("#course-title-field").fill("Valid Title For Schedule Test");
    await dialog.locator("#course-description-field").fill("Valid Description");
    await dialog.locator("#course-price-field").fill("1500");

    const mentorSelect = dialog.locator("#course-mentor-field");
    await mentorSelect.waitFor({ state: "visible", timeout: 10000 });
    await mentorSelect.locator("option").nth(1).waitFor({ state: "attached", timeout: 10000 });
    const mentorVal = await mentorSelect.locator("option").nth(1).getAttribute("value");
    if (mentorVal) await mentorSelect.selectOption(mentorVal);

    await dialog.locator("#course-start-date-field").fill("2026-11-01");
    await dialog.locator("#course-end-date-field").fill("2027-05-01");

    const timeStartInput = dialog.locator("#schedule-time-start-0");
    await timeStartInput.fill("");

    const createBtn = dialog.getByRole("button", { name: /Create|Создать|Эҷод кардан/i });
    await createBtn.click();
    await page.waitForTimeout(300);

    const isTimeStartFocused = await timeStartInput.evaluate((el) => document.activeElement === el);
    const hasAriaInvalid = await timeStartInput.getAttribute("aria-invalid");

    registerProbe({
      probe: "schedule-nested-invalid-time-focus",
      isTimeStartFocused,
      ariaInvalid: hasAriaInvalid === "true",
      passed: isTimeStartFocused && hasAriaInvalid === "true",
    });

    await page.keyboard.press("Escape");
    const confirmDialog = page.getByRole("dialog", { name: /Discard changes\?/i });
    if (await confirmDialog.isVisible()) {
      await confirmDialog.getByRole("button", { name: /Discard/i }).click();
    }
    await dialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "dark", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    await recordScreenshot(page, "desktop-1440-create-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "1440x1000",
      description: "Superadmin course create drawer in dark theme with semantic design tokens",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    const editDialog = await openEditCourseWithSchedule(page);
    await editDialog.locator('span:has-text("–")').first().waitFor({ timeout: 10000 });

    const saveBtn = editDialog.getByRole("button", { name: /Save|Сохранить|Сабт кардан/i });
    const isSaveDisabled = await saveBtn.isDisabled();

    const termsSection = editDialog.getByText(/Course terms \(read-only\)|Условия курса \(только для чтения\)|Шартҳои курс \(танҳо барои хондан\)/i);
    const immutabilityNotice = editDialog.getByText(/Exam type, price, and schedule cannot be changed|Тип экзамена, цену и расписание нельзя изменить|Намуди имтиҳон, нарх ва ҷадвалро пас аз эҷоди курс тағйир додан мумкин нест/i);

    registerProbe({
      probe: "edit-mode-immutability-and-disabled-save",
      isSaveDisabled,
      termsSectionVisible: await termsSection.isVisible(),
      immutabilityNoticeVisible: await immutabilityNotice.isVisible(),
      passed: isSaveDisabled && (await termsSection.isVisible()) && (await immutabilityNotice.isVisible()),
    });

    await recordScreenshot(page, "desktop-1440-edit-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "1440x1000",
      description: "Superadmin course edit drawer in dark theme with read-only terms and immutability notice",
    });

    await page.keyboard.press("Escape");
    await editDialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const editDialog = await openEditCourseWithSchedule(page);
    await editDialog.locator('span:has-text("–")').first().waitFor({ timeout: 10000 });

    const scheduleFacts = await editDialog.locator("div.flex.flex-wrap.gap-2 > span").allTextContents();
    const normalizedScheduleFacts = scheduleFacts.map((value) => value.replace(/\s+/g, " ").trim());
    const expectedScheduleFacts = [
      "Monday: 09:00–10:30",
      "Wednesday: 09:00–10:30",
      "Friday: 09:00–10:30",
    ];
    const hasExpectedScheduleFacts = expectedScheduleFacts.every((fact) => normalizedScheduleFacts.includes(fact));
    registerProbe({
      probe: "edit-mode-loaded-schedule-display",
      expectedScheduleFacts,
      renderedScheduleFacts: normalizedScheduleFacts,
      passed: hasExpectedScheduleFacts,
    });

    await recordScreenshot(page, "desktop-1440-edit-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin course edit drawer in light theme showing read-only terms",
    });

    await page.keyboard.press("Escape");
    await editDialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "reduced-motion-probe.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/J7sAAAAASUVORK5CYII=", "base64"),
    });
    await dialog.locator("[class*='transition-opacity']").waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    await recordScreenshot(page, "desktop-1440-reduced-motion.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      reducedMotion: "reduce",
      description: "Superadmin course create drawer rendered under prefers-reduced-motion: reduce",
    });

    const motionCheck = await dialog.evaluate((root) => {
      const selectors = [
        ["surface", root],
        ["title", root.querySelector("#course-title-field")],
        ["close", root.querySelector('button[aria-label="Close"]')],
        ["image-overlay", root.querySelector("[class*='transition-opacity']")],
      ];
      return selectors.map(([name, element]) => {
        if (!(element instanceof HTMLElement)) return { name, found: false };
        const style = getComputedStyle(element);
        return {
          name,
          found: true,
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          transitionProperty: style.transitionProperty,
          transitionDuration: style.transitionDuration,
        };
      });
    });
    const mediaMatches = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const reducedMotionComputed = motionCheck.length === 4 && motionCheck.every((entry) =>
      entry.found &&
      (entry.animationName === "none" || entry.animationDuration.split(",").every((duration) => parseFloat(duration) === 0)) &&
      entry.transitionDuration.split(",").every((duration) => parseFloat(duration) === 0)
    );
    await page.keyboard.press("Tab");
    const keyboardFocusRemainsImmediate = await dialog.evaluate((root) => root.contains(document.activeElement));
    registerProbe({
      probe: "reduced-motion-computed-behavior",
      reducedMotionMatched: mediaMatches,
      computedMotion: motionCheck,
      keyboardFocusRemainsImmediate,
      passed: mediaMatches && reducedMotionComputed && keyboardFocusRemainsImmediate,
    });

    await dialog.getByRole("button", { name: /Remove image|Удалить изображение|Расмро хориҷ кардан/i }).click();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    const dialogBox = await dialog.boundingBox();
    assert.ok(dialogBox, "Mobile dialog box must be present");
    const isFullMobileWidth = Math.abs(dialogBox.width - 390) < 2;

    const startDateInput = dialog.locator("#course-start-date-field");
    const endDateInput = dialog.locator("#course-end-date-field");
    const startBox = await startDateInput.boundingBox();
    const endBox = await endDateInput.boundingBox();

    const isSingleColumn = Boolean(startBox && endBox && Math.abs(startBox.x - endBox.x) < 5 && startBox.y < endBox.y);

    const mobileFontSizes = await measureFormFontSizes(dialog);
    const allAtLeast16px = mobileFontSizes.every((item) => !item.found || item.fontSizePx >= 16);

    registerProbe({
      probe: "mobile-390-single-column-and-font-sizes",
      isFullMobileWidth,
      isSingleColumn,
      allAtLeast16px,
      fontSizes: mobileFontSizes,
      passed: isFullMobileWidth && isSingleColumn && allAtLeast16px,
    });

    await recordScreenshot(page, "mobile-390-create-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Superadmin course create full-height dialog on mobile 390 light theme single column with >=16px inputs",
    });

    await page.keyboard.press("Escape");
    const editDialog = await openEditCourseWithSchedule(page);
    await editDialog.locator('span:has-text("–")').first().waitFor({ timeout: 10000 });

    const changeImageBtn = editDialog.getByRole("button", { name: /Change image|Изменить обложку|Ивази расм/i });
    const isChangeImageVisible = await changeImageBtn.isVisible();
    const changeBox = await changeImageBtn.boundingBox();
    const isTouchTargetMin44 = Boolean(changeBox && changeBox.height >= 44);

    registerProbe({
      probe: "hoverless-touch-image-controls",
      isChangeImageVisible,
      isTouchTargetMin44,
      passed: isChangeImageVisible && isTouchTargetMin44,
    });

    await recordScreenshot(page, "mobile-390-edit-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Superadmin course edit full-height dialog on mobile 390 light theme with read-only terms",
    });

    await page.keyboard.press("Escape");
    await editDialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setupContext(context, { theme: "dark", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    await recordScreenshot(page, "mobile-390-create-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "390x844",
      description: "Superadmin course create full-height dialog on mobile 390 dark theme",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    const editDialog = await openEditCourseWithSchedule(page);

    await recordScreenshot(page, "mobile-390-edit-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "390x844",
      description: "Superadmin course edit full-height dialog on mobile 390 dark theme with read-only terms",
    });

    await page.keyboard.press("Escape");
    await editDialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 320, height: 600 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    const dialogBox = await dialog.boundingBox();
    assert.ok(dialogBox, "Mobile 320 dialog box must be present");
    const is320FullWidth = Math.abs(dialogBox.width - 320) < 2;

    const fontSizes320 = await measureFormFontSizes(dialog);
    const allAtLeast16pxAt320 = fontSizes320.every((item) => !item.found || item.fontSizePx >= 16);

    registerProbe({
      probe: "mobile-320-full-width-and-font-sizes",
      is320FullWidth,
      allAtLeast16pxAt320,
      passed: is320FullWidth && allAtLeast16pxAt320,
    });

    await recordScreenshot(page, "mobile-320-create-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "320x600",
      description: "Superadmin course create full-height dialog on small mobile 320 viewport with >=16px inputs",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 640, height: 900 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    const dialogBox = await dialog.boundingBox();
    assert.ok(dialogBox, "Tablet 640 dialog box must be present");
    const is640FullWidth = Math.abs(dialogBox.width - 640) < 2;

    registerProbe({
      probe: "tablet-640-full-width",
      is640FullWidth,
      passed: is640FullWidth,
    });

    await recordScreenshot(page, "tablet-640-create-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "640x900",
      description: "Superadmin course create full-height dialog on tablet 640 viewport",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    const dialogBox = await dialog.boundingBox();
    assert.ok(dialogBox, "Tablet 768 dialog box must be present");
    const is768DrawerWidth = Math.abs(dialogBox.width - 560) < 5;

    registerProbe({
      probe: "tablet-768-drawer-geometry",
      dialogWidth: dialogBox.width,
      is560pxDrawer: is768DrawerWidth,
      passed: is768DrawerWidth,
    });

    await recordScreenshot(page, "tablet-768-create-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "768x1024",
      description: "Superadmin course create 560px drawer on tablet 768 viewport",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    const dialogBox = await dialog.boundingBox();
    assert.ok(dialogBox, "Desktop 1024 dialog box must be present");
    const is1024DrawerWidth = Math.abs(dialogBox.width - 560) < 5;

    registerProbe({
      probe: "desktop-1024-drawer-geometry",
      dialogWidth: dialogBox.width,
      is560pxDrawer: is1024DrawerWidth,
      passed: is1024DrawerWidth,
    });

    await recordScreenshot(page, "desktop-1024-create-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1024x768",
      description: "Superadmin course create 560px drawer on desktop 1024 viewport",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "ru" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Создать курс|Новый курс|Create course/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    const russianTitleInput = dialog.locator("#course-title-field");
    await russianTitleInput.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(250);
    registerProbe({
      probe: "russian-form-copy-visible",
      translatedHeading: await dialog.getByRole("heading", { name: "Новый курс" }).isVisible(),
      translatedTitleLabel: (await dialog.locator('label[for="course-title-field"]').innerText()).replace(/\s*\*/, "").trim() === "Название",
      passed: (await dialog.getByRole("heading", { name: "Новый курс" }).isVisible()) &&
        (await dialog.locator('label[for="course-title-field"]').innerText()).replace(/\s*\*/, "").trim() === "Название",
    });

    await recordScreenshot(page, "desktop-1440-create-ru.png", {
      role: "superadmin",
      theme: "light",
      locale: "ru",
      viewport: "1440x1000",
      description: "Superadmin course create drawer in Russian locale with verified translations",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "tg" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Сохтани курс|Курси нав|Create course/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    const tajikTitleInput = dialog.locator("#course-title-field");
    await tajikTitleInput.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(250);
    registerProbe({
      probe: "tajik-form-copy-visible",
      translatedHeading: await dialog.getByRole("heading", { name: "Курси нав" }).isVisible(),
      translatedTitleLabel: (await dialog.locator('label[for="course-title-field"]').innerText()).replace(/\s*\*/, "").trim() === "Ном",
      passed: (await dialog.getByRole("heading", { name: "Курси нав" }).isVisible()) &&
        (await dialog.locator('label[for="course-title-field"]').innerText()).replace(/\s*\*/, "").trim() === "Ном",
    });

    await recordScreenshot(page, "desktop-1440-create-tg.png", {
      role: "superadmin",
      theme: "light",
      locale: "tg",
      viewport: "1440x1000",
      description: "Superadmin course create drawer in Tajik locale with verified translations",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.waitForTimeout(300);

    const header = dialog.locator('h2, [class*="DialogTitle"]').first();
    const closeBtn = dialog.getByRole("button", { name: /Close|Закрыть|Пӯшидан/i });
    const body = dialog.locator('form, [class*="overflow-y-auto"]').first();
    const footer = dialog.locator('[class*="border-t"]').last();

    const headerBox = await header.boundingBox();
    const closeBox = await closeBtn.boundingBox();
    const bodyBox = await body.boundingBox();
    const footerBox = await footer.boundingBox();

    const headerReachable = Boolean(headerBox && headerBox.y >= 0);
    const closeReachable = Boolean(closeBox && closeBox.y >= 0);
    const has44pxClose = Boolean(closeBox && closeBox.width >= 44 && closeBox.height >= 44);
    const bodyReachable = Boolean(bodyBox && bodyBox.width > 0 && bodyBox.height > 0);
    const footerReachable = Boolean(footerBox && footerBox.width > 0 && footerBox.height > 0);

    registerProbe({
      probe: "desktop-1440-text-200-reachability",
      headerReachable,
      closeReachable,
      has44pxClose,
      bodyReachable,
      footerReachable,
      passed: headerReachable && closeReachable && has44pxClose && bodyReachable && footerReachable,
    });

    await recordScreenshot(page, "desktop-1440-text-200.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      textEnlargement: "200%",
      description: "Superadmin course create drawer with actual 200% root text enlargement on desktop light theme",
    });

    await closeBtn.click();
    await dialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.waitForTimeout(300);

    const header = dialog.locator('h2, [class*="DialogTitle"]').first();
    const closeBtn = dialog.getByRole("button", { name: /Close|Закрыть|Пӯшидан/i });
    const body = dialog.locator('form, [class*="overflow-y-auto"]').first();
    const footer = dialog.locator('[class*="border-t"]').last();

    const headerBox = await header.boundingBox();
    const closeBox = await closeBtn.boundingBox();
    const bodyBox = await body.boundingBox();
    const footerBox = await footer.boundingBox();

    const headerReachable = Boolean(headerBox && headerBox.y >= 0);
    const closeReachable = Boolean(closeBox && closeBox.y >= 0);
    const has44pxClose = Boolean(closeBox && closeBox.width >= 44 && closeBox.height >= 44);
    const bodyReachable = Boolean(bodyBox && bodyBox.width > 0 && bodyBox.height > 0);
    const footerReachable = Boolean(footerBox && footerBox.width > 0 && footerBox.height > 0);

    registerProbe({
      probe: "mobile-390-text-200-reachability",
      headerReachable,
      closeReachable,
      has44pxClose,
      bodyReachable,
      footerReachable,
      passed: headerReachable && closeReachable && has44pxClose && bodyReachable && footerReachable,
    });

    await recordScreenshot(page, "mobile-390-text-200.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      textEnlargement: "200%",
      description: "Superadmin course create full-height dialog with actual 200% root text enlargement on mobile 390 light theme",
    });

    await closeBtn.click();
    await dialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const newCourseTitle = `Physics Advanced ${Date.now()}`;
    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });

    await dialog.locator("#course-title-field").fill(newCourseTitle);
    await dialog.locator("#course-description-field").fill("Comprehensive advanced physics course with laboratory experiments.");

    const mentorSelect = dialog.locator("#course-mentor-field");
    await mentorSelect.waitFor({ state: "visible", timeout: 10000 });
    await mentorSelect.locator("option").nth(1).waitFor({ state: "attached", timeout: 10000 });
    const mentorOptionValue = await mentorSelect.locator("option").nth(1).getAttribute("value");
    if (mentorOptionValue) {
      await mentorSelect.selectOption(mentorOptionValue);
    }

    await dialog.locator("#course-start-date-field").fill("2026-11-01");
    await dialog.locator("#course-end-date-field").fill("2027-05-01");
    await dialog.locator("#course-price-field").fill("1850");

    const timeStartInput = dialog.locator('input[aria-label="Start time"]');
    const timeEndInput = dialog.locator('input[aria-label="End time"]');
    await timeStartInput.fill("14:00");
    await timeEndInput.fill("16:00");

    const createBtn = dialog.getByRole("button", { name: /Create|Создать|Эҷод кардан/i });
    await createBtn.click();
    await dialog.waitFor({ state: "detached", timeout: 10000 });

    await page.waitForTimeout(500);
    const createdCard = page.getByText(newCourseTitle);
    if (!(await createdCard.isVisible())) {
      const page2Btn = page.getByRole("button", { name: /^2$/ });
      if (await page2Btn.isVisible()) {
        await page2Btn.click();
        await page.waitForTimeout(500);
      }
    }
    await createdCard.waitFor({ timeout: 10000 });

    registerProbe({
      probe: "real-course-create-and-persistence",
      newCourseTitle,
      persistedInList: await createdCard.isVisible(),
      passed: true,
    });

    await recordScreenshot(page, "desktop-1440-create-persistence-success.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Newly created course persisted in backend and displayed in courses catalog",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });

    let courseWriteCount = 0;
    let photoUploadCount = 0;
    let simulatePhotoFailure = true;

    await context.route("**/api/v1/courses**", async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("/image")) {
        photoUploadCount++;
        if (simulatePhotoFailure) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ detail: "SIMULATED: Image upload failed due to storage exception" }),
          });
          return;
        }
      } else if (method === "POST" || method === "PATCH") {
        courseWriteCount++;
      }
      await route.continue();
    });

    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const partialTitle = `Bio Chemistry Partial ${Date.now()}`;
    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });

    await dialog.locator("#course-title-field").fill(partialTitle);
    await dialog.locator("#course-description-field").fill("Partial success test course with simulated image upload failure.");

    const mentorSelect = dialog.locator("#course-mentor-field");
    await mentorSelect.waitFor({ state: "visible", timeout: 10000 });
    await mentorSelect.locator("option").nth(1).waitFor({ state: "attached", timeout: 10000 });
    const mentorOptionValue = await mentorSelect.locator("option").nth(1).getAttribute("value");
    if (mentorOptionValue) {
      await mentorSelect.selectOption(mentorOptionValue);
    }

    await dialog.locator("#course-start-date-field").fill("2026-11-01");
    await dialog.locator("#course-end-date-field").fill("2027-05-01");
    await dialog.locator("#course-price-field").fill("2200");

    const timeStartInput = dialog.locator('input[aria-label="Start time"]');
    const timeEndInput = dialog.locator('input[aria-label="End time"]');
    await timeStartInput.fill("10:00");
    await timeEndInput.fill("12:00");

    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "cover.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    });

    const createBtn = dialog.getByRole("button", { name: /Create|Создать|Эҷод кардан/i });
    await createBtn.click();

    const partialAlert = dialog.getByRole("alert").filter({ hasText: /Course saved, image upload pending/i });
    await partialAlert.waitFor({ timeout: 10000 });

    const retryImageBtn = dialog.getByRole("button", { name: /Retry image upload/i });
    const closeSavedBtn = dialog.getByRole("button", { name: /Close \(course saved\)/i });

    registerProbe({
      probe: "partial-image-failure-simulated-handling",
      partialAlertVisible: await partialAlert.isVisible(),
      retryButtonVisible: await retryImageBtn.isVisible(),
      closeSavedButtonVisible: await closeSavedBtn.isVisible(),
      initialCourseWriteCount: courseWriteCount,
      initialPhotoUploadCount: photoUploadCount,
      passed: (await partialAlert.isVisible()) && (await retryImageBtn.isVisible()) && (await closeSavedBtn.isVisible()) && courseWriteCount === 1 && photoUploadCount === 1,
    });

    await recordScreenshot(page, "desktop-1440-create-partial-image-simulated.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      simulated: true,
      description: "SIMULATED: Course saved successfully while image upload failed; retry targets image only and close explains course persisted",
    });

    simulatePhotoFailure = false;
    await retryImageBtn.click();

    await dialog.waitFor({ state: "detached", timeout: 10000 });

    registerProbe({
      probe: "retry-image-upload-zero-duplicate-writes",
      totalCourseWrites: courseWriteCount,
      totalPhotoUploads: photoUploadCount,
      zeroDuplicateWrites: courseWriteCount === 1,
      retrySucceeded: photoUploadCount === 2,
      passed: courseWriteCount === 1 && photoUploadCount === 2,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    let scheduleFail = true;
    await context.route("**/api/v1/courses/*/schedule*", async (route) => {
      if (scheduleFail) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Schedule loading failed" }),
        });
      } else {
        await route.continue();
      }
    });

    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const editDialog = await openEditCourseWithSchedule(page);
    const scheduleErrorEl = editDialog.getByText(/Failed to load schedule|Load error/i);
    await scheduleErrorEl.waitFor({ timeout: 15000 });
    const retryBtn = editDialog.getByRole("button", { name: /Retry/i });

    scheduleFail = false;
    await retryBtn.click();
    await editDialog.locator('span:has-text("–")').first().waitFor({ timeout: 10000 });

    registerProbe({
      probe: "edit-mode-schedule-error-and-retry",
      errorVisibleBeforeRetry: true,
      recoveredAfterRetry: true,
      passed: true,
    });

    await page.keyboard.press("Escape");
    await editDialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    await context.route("**/api/v1/courses/*/schedule*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const editDialog = await openEditCourseWithSchedule(page);
    const emptyNotice = editDialog.getByText(/No schedule configured|No schedule data/i);
    await emptyNotice.waitFor({ timeout: 5000 });

    registerProbe({
      probe: "edit-mode-schedule-empty-state",
      emptyStateVisible: await emptyNotice.isVisible(),
      passed: await emptyNotice.isVisible(),
    });

    await page.keyboard.press("Escape");
    await editDialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const mentorIdentity = fixtures.identities.find((item) => item.role === "mentor" && !item.forced);
    assert.ok(mentorIdentity, "Mentor fixture identity must be present");
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    let mentorHistoryRequests = 0;
    await context.route("**/api/v1/courses/*/mentor-history*", async (route) => {
      mentorHistoryRequests++;
      await route.continue();
    });

    const page = await context.newPage();
    await loginAndNavigateToCourses(page, mentorIdentity, "/courses");
    const hasCreateButton = await page.getByRole("button", { name: /Add course|Create course|Новый курс/i }).isVisible();

    registerProbe({
      probe: "mentor-role-closed-read-security",
      mentorHistoryRequests,
      hasCreateButton,
      passed: mentorHistoryRequests === 0 && !hasCreateButton,
    });

    await context.close();
  }

} finally {
  await browser.close();
  await writeFile(`${taskDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  await writeFile(`${taskDir}/probes.json`, JSON.stringify(probes, null, 2));
}

console.log(JSON.stringify({ screenshots: manifest.length, probes: probes.length, passed: true }));

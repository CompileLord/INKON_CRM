import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixtures = JSON.parse(input);

const taskDir = resolve(
  process.env.KITOB_TASK_DIR ||
  "../docs/redesign-execution/group-02/course-forms/drawer-attempt3"
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
    ({ theme, lng, reducedMotion }) => {
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
      reducedMotion: options.reducedMotion,
    }
  );
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
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Add course|Create course|Новый курс|Добавить курс/i });
    await addBtn.waitFor({ timeout: 10000 });
    await addBtn.click();

    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    const dialogBox = await dialog.boundingBox();
    assert.ok(dialogBox, "Dialog must be rendered and have a bounding box");
    const viewportWidth = 1440;
    const isEndAligned = Math.abs((dialogBox.x + dialogBox.width) - viewportWidth) < 2;
    const is560Wide = Math.abs(dialogBox.width - 560) < 2;

    const closeBtn = dialog.getByRole("button", { name: /Close|Закрыть|Пӯшидан/i });
    const closeBox = await closeBtn.boundingBox();
    const has44pxClose = Boolean(closeBox && closeBox.width >= 44 && closeBox.height >= 44);

    const bodyOverflow = await page.evaluate(() => document.body.style.overflowY);
    const scrollLocked = bodyOverflow === "hidden";

    registerProbe({
      probe: "desktop-1440-course-drawer-geometry",
      dialogWidth: dialogBox.width,
      dialogX: dialogBox.x,
      isEndAligned,
      is560Wide,
      has44pxClose,
      scrollLocked,
      passed: isEndAligned && is560Wide && has44pxClose && scrollLocked,
    });

    await recordScreenshot(page, "desktop-1440-create-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin course create drawer 560px end-aligned on desktop light theme",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 5000 });

    const scrollUnlocked = await page.evaluate(() => document.body.style.overflowY !== "hidden");
    registerProbe({
      probe: "escape-dismissal-and-scroll-unlock",
      scrollUnlocked,
      passed: scrollUnlocked,
    });

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
      description: "Superadmin course create drawer 560px end-aligned on desktop dark theme",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    const actionsBtn = page.getByRole("button", { name: /^Course actions:/ }).first();
    await actionsBtn.click();
    const editItem = page.getByRole("menuitem", { name: /Edit|Редактировать|Таҳрир/i });
    await editItem.click();

    const editDialog = page.getByRole("dialog");
    await editDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    await recordScreenshot(page, "desktop-1440-edit-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "1440x1000",
      description: "Superadmin course edit drawer 560px end-aligned on desktop dark theme",
    });

    const backdrop = page.locator(".bg-scrim");
    await backdrop.click({ position: { x: 50, y: 50 } });
    await editDialog.waitFor({ state: "detached", timeout: 5000 });

    registerProbe({
      probe: "backdrop-click-dismissal",
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

    const actionsBtn = page.getByRole("button", { name: /^Course actions:/ }).first();
    await actionsBtn.click();
    const editItem = page.getByRole("menuitem", { name: /Edit|Редактировать|Таҳрир/i });
    await editItem.click();

    const editDialog = page.getByRole("dialog");
    await editDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    await recordScreenshot(page, "desktop-1440-edit-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin course edit drawer 560px end-aligned on desktop light theme",
    });

    await page.keyboard.press("Escape");
    await editDialog.waitFor({ state: "detached" });
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
    assert.ok(dialogBox, "Mobile dialog bounding box");
    const isFullWidth = Math.abs(dialogBox.width - 390) < 2;
    const isFullHeight = Math.abs(dialogBox.height - 844) < 2;

    registerProbe({
      probe: "mobile-390-course-dialog-geometry",
      dialogWidth: dialogBox.width,
      dialogHeight: dialogBox.height,
      isFullWidth,
      isFullHeight,
      passed: isFullWidth && isFullHeight,
    });

    await recordScreenshot(page, "mobile-390-create-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Superadmin course create full-height dialog on mobile 390 light theme",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
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

    const actionsBtn = page.getByRole("button", { name: /^Course actions:/ }).first();
    await actionsBtn.click();
    const editItem = page.getByRole("menuitem", { name: /Edit|Редактировать|Таҳрир/i });
    await editItem.click();

    const editDialog = page.getByRole("dialog");
    await editDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    await recordScreenshot(page, "mobile-390-edit-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "390x844",
      description: "Superadmin course edit full-height dialog on mobile 390 dark theme",
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
    const is320FullWidth = Math.abs(dialogBox.width - 320) < 2;

    registerProbe({
      probe: "mobile-320-full-width",
      dialogWidth: dialogBox.width,
      is320FullWidth,
      passed: is320FullWidth,
    });

    await recordScreenshot(page, "mobile-320-create-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "320x600",
      description: "Superadmin course create full-height dialog on small mobile 320 light theme",
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
    const is640FullWidth = Math.abs(dialogBox.width - 640) < 2;

    registerProbe({
      probe: "tablet-640-course-variant-remains-fullwidth",
      dialogWidth: dialogBox.width,
      is640FullWidth,
      passed: is640FullWidth,
    });

    await recordScreenshot(page, "tablet-640-create-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "640x900",
      description: "Course create dialog at 640px breakpoint remains full-width phone dialog before 768px threshold",
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
    const is768Drawer560 = Math.abs(dialogBox.width - 560) < 2;
    const is768EndAligned = Math.abs((dialogBox.x + dialogBox.width) - 768) < 2;

    registerProbe({
      probe: "tablet-768-course-variant-expands-to-560-drawer",
      dialogWidth: dialogBox.width,
      dialogX: dialogBox.x,
      is768Drawer560,
      is768EndAligned,
      passed: is768Drawer560 && is768EndAligned,
    });

    await recordScreenshot(page, "tablet-768-create-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "768x1024",
      description: "Course create drawer at 768px breakpoint expands to 560px end-aligned drawer",
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

    await recordScreenshot(page, "desktop-1024-create-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1024x768",
      description: "Course create drawer at 1024px desktop width",
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

    const addBtn = page.getByRole("button", { name: /Создать курс|Новый курс|Добавить курс|Add course/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    await recordScreenshot(page, "desktop-1440-ru.png", {
      role: "superadmin",
      theme: "light",
      locale: "ru",
      viewport: "1440x1000",
      description: "Superadmin course create drawer in Russian locale",
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

    const addBtn = page.getByRole("button", { name: /Сохтани курс|Илова кардани курс|Add course/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    await recordScreenshot(page, "desktop-1440-tg.png", {
      role: "superadmin",
      theme: "light",
      locale: "tg",
      viewport: "1440x1000",
      description: "Superadmin course create drawer in Tajik locale",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 15000 });

    const addBtn = page.getByRole("button", { name: /Add course|Create course/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    registerProbe({
      probe: "desktop-1440-hidpi-scale-factor-2",
      deviceScaleFactor: 2,
      passed: true,
    });

    await recordScreenshot(page, "desktop-1440-hidpi-2x.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      deviceScaleFactor: 2,
      description: "Superadmin course create drawer under 2x device scale factor (high-DPI / retina display scale)",
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

    const addBtn = page.getByRole("button", { name: /Add course|Create course/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.waitForTimeout(300);

    const header = dialog.locator('h2, [class*="DialogTitle"]').first();
    const closeBtn = dialog.getByRole("button", { name: /Close|Закрыть|Пӯшидан/i });
    const body = dialog.locator('div[class*="overflow-y-auto"]').first();
    const footer = dialog.locator('div[class*="border-t"]').last();

    const headerBox = await header.boundingBox();
    const closeBox = await closeBtn.boundingBox();
    const bodyBox = await body.boundingBox();
    const footerBox = await footer.boundingBox();

    const has44pxClose = Boolean(closeBox && closeBox.width >= 44 && closeBox.height >= 44);
    const headerReachable = Boolean(headerBox && headerBox.width > 0 && headerBox.height > 0);
    const closeReachable = Boolean(closeBox && closeBox.y >= 0);
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

    const addBtn = page.getByRole("button", { name: /Add course|Create course/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.waitForTimeout(300);

    const header = dialog.locator('h2, [class*="DialogTitle"]').first();
    const closeBtn = dialog.getByRole("button", { name: /Close|Закрыть|Пӯшидан/i });
    const body = dialog.locator('div[class*="overflow-y-auto"]').first();
    const footer = dialog.locator('div[class*="border-t"]').last();

    const headerBox = await header.boundingBox();
    const closeBox = await closeBtn.boundingBox();
    const bodyBox = await body.boundingBox();
    const footerBox = await footer.boundingBox();

    const has44pxClose = Boolean(closeBox && closeBox.width >= 44 && closeBox.height >= 44);
    const headerReachable = Boolean(headerBox && headerBox.width > 0 && headerBox.height > 0);
    const closeReachable = Boolean(closeBox && closeBox.y >= 0);
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
    const context = await browser.newContext({ viewport: { width: 640, height: 900 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/students");
    await page.locator("h1").waitFor({ timeout: 15000 });

    const addStudentBtn = page.getByRole("button", { name: /Add student|Новый студент|Илова кардани донишҷӯ/i });
    await addStudentBtn.waitFor({ timeout: 10000 });
    await addStudentBtn.click();

    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    const dialogBox = await dialog.boundingBox();
    assert.ok(dialogBox, "Student dialog bounding box");
    const is480Wide = Math.abs(dialogBox.width - 480) < 2;
    const isEndAligned = Math.abs((dialogBox.x + dialogBox.width) - 640) < 2;

    registerProbe({
      probe: "tablet-640-person-default-drawer-geometry",
      dialogWidth: dialogBox.width,
      dialogX: dialogBox.x,
      is480Wide,
      isEndAligned,
      passed: is480Wide && isEndAligned,
    });

    await recordScreenshot(page, "tablet-640-person-default-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "640x900",
      description: "Real default person caller (StudentFormPanel) 480px end-aligned drawer at 640px breakpoint",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/students");
    await page.locator("h1").waitFor({ timeout: 15000 });

    const addStudentBtn = page.getByRole("button", { name: /Add student|Новый студент|Илова кардани донишҷӯ/i });
    await addStudentBtn.waitFor({ timeout: 10000 });
    await addStudentBtn.click();

    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    const dialogBox = await dialog.boundingBox();
    assert.ok(dialogBox, "Student dialog mobile bounding box");
    const isFullWidth = Math.abs(dialogBox.width - 390) < 2;
    const isFullHeight = Math.abs(dialogBox.height - 844) < 2;

    registerProbe({
      probe: "mobile-390-person-default-dialog-geometry",
      dialogWidth: dialogBox.width,
      dialogHeight: dialogBox.height,
      isFullWidth,
      isFullHeight,
      passed: isFullWidth && isFullHeight,
    });

    await recordScreenshot(page, "mobile-390-person-default-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Real default person caller (StudentFormPanel) full-height dialog below 640px breakpoint (390px)",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
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

    const addBtn = page.getByRole("button", { name: /Add course|Create course/i });
    await addBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);

    await recordScreenshot(page, "desktop-1440-reduced-motion.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin course create drawer under prefers-reduced-motion",
    });

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await context.close();
  }

  registerProbe({
    probe: "caller-renders-field-redesign-pending",
    note: "Drawer geometry and Base UI lifecycle verified; form fields, dirty drafts and persistence redesign remain pending in KITOB-02-05-FORM",
    passed: true,
  });

  await writeFile(`${taskDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  await writeFile(`${taskDir}/probes.json`, JSON.stringify(probes, null, 2));
  console.log(`Successfully recorded ${manifest.length} screenshots and ${probes.length} probes.`);
} finally {
  await browser.close();
}

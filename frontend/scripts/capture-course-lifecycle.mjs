import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixtures = JSON.parse(input);

const taskDir = resolve(
  process.env.KITOB_TASK_DIR ||
  "../docs/redesign-execution/group-02/course-forms/lifecycle/evidence"
);
const taskScreenshotsDir = `${taskDir}/screenshots`;

await mkdir(taskScreenshotsDir, { recursive: true });

const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
assert.ok(superadmin, "Superadmin fixture identity must be present");

const mentor = fixtures.identities.find((item) => item.role === "mentor" && !item.forced && !item.tag);
assert.ok(mentor, "Mentor fixture identity must be present");

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5191";

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

try {
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });

    await recordScreenshot(page, "desktop-1440-superadmin-courses-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin course directory desktop light view with create course action",
    });

    const createButton = page.locator('button:has-text("Create Course"), button:has-text("Создать курс"), button:has-text("Эҷоди курс")').first();
    await createButton.waitFor({ timeout: 5000 });
    await createButton.click();

    const drawerDialog = page.locator('[role="dialog"]');
    await drawerDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-create-drawer-open-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin create course drawer open on desktop light view",
    });

    await page.keyboard.press("Escape");
    await drawerDialog.waitFor({ state: "detached", timeout: 5000 });
    await page.waitForTimeout(300);

    const isCreateButtonFocused = await createButton.evaluate((el) => document.activeElement === el);
    assert.ok(isCreateButtonFocused, "Create Course button must receive focus after drawer dismissal");
    registerProbe({
      probe: "create-drawer-focus-restoration",
      passed: isCreateButtonFocused,
      activeElementTag: await page.evaluate(() => document.activeElement?.tagName),
    });

    const firstActionTrigger = page.locator('button[aria-label^="Course actions:"]').first();
    await firstActionTrigger.waitFor({ timeout: 5000 });
    await firstActionTrigger.click();

    const menuPopup = page.locator('[role="menu"]');
    await menuPopup.waitFor({ timeout: 5000 });
    const editItem = page.locator('[role="menuitem"]:has-text("Edit"), [role="menuitem"]:has-text("Редактировать"), [role="menuitem"]:has-text("Таҳрир")');
    await editItem.waitFor({ timeout: 5000 });
    await editItem.click();

    await drawerDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-edit-drawer-open-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin edit course drawer open on desktop light view",
    });

    await page.keyboard.press("Escape");
    await drawerDialog.waitFor({ state: "detached", timeout: 5000 });
    await page.waitForTimeout(300);

    const isEditTriggerFocused = await firstActionTrigger.evaluate((el) => document.activeElement === el);
    assert.ok(isEditTriggerFocused, "Edit action trigger must receive focus after drawer dismissal");
    registerProbe({
      probe: "edit-drawer-focus-restoration",
      passed: isEditTriggerFocused,
      activeElementTag: await page.evaluate(() => document.activeElement?.tagName),
    });

    const searchInput = page.locator('input[type="text"][placeholder*="course"], input[type="text"][placeholder*="курс"]').first();
    await searchInput.fill("Web Design");
    await page.waitForTimeout(500);

    const webDesignActionTrigger = page.locator('button[aria-label="Course actions: Web Design"]').first();
    await webDesignActionTrigger.waitFor({ timeout: 5000 });
    await webDesignActionTrigger.click();
    await menuPopup.waitFor({ timeout: 5000 });

    const duplicateItem = page.locator('[role="menuitem"]:has-text("Duplicate"), [role="menuitem"]:has-text("Дублировать"), [role="menuitem"]:has-text("Нусхабардорӣ")');
    await duplicateItem.click();

    const confirmDialog = page.locator('[role="dialog"]');
    await confirmDialog.waitFor({ timeout: 5000 });
    const confirmWebDuplicateButton = confirmDialog.locator('button:has-text("Duplicate"), button:has-text("Дублировать"), button:has-text("Нусхабардорӣ")').last();
    await confirmWebDuplicateButton.click();

    const alertMessage = confirmDialog.locator('[role="alert"]');
    await alertMessage.waitFor({ timeout: 10000 });
    const alertText = await alertMessage.innerText();
    assert.ok(alertText.length > 0, "Alert message must be shown when schedule is missing");
    assert.equal(page.url().split("?")[0], `${previewOrigin}/courses`, "Page must remain on /courses without navigation");

    await recordScreenshot(page, "desktop-1440-duplicate-missing-schedule-blocked.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Duplicate blocked with alert when course lacks schedule",
      alertText,
    });
    registerProbe({
      probe: "duplicate-missing-schedule-blocked",
      passed: Boolean(alertText),
      alertText,
    });

    await page.keyboard.press("Escape");
    await confirmDialog.waitFor({ state: "detached", timeout: 5000 });

    await searchInput.fill("Python");
    await page.waitForTimeout(500);

    const pythonActionTrigger = page.locator('button[aria-label="Course actions: Python Fundamentals"]').first();
    await pythonActionTrigger.waitFor({ timeout: 5000 });
    await pythonActionTrigger.click();
    await menuPopup.waitFor({ timeout: 5000 });
    await duplicateItem.click();

    await confirmDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-duplicate-confirm-dialog-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Confirmation dialog for duplicating Python Fundamentals",
    });

    const confirmDuplicateButton = confirmDialog.locator('button:has-text("Duplicate"), button:has-text("Дублировать"), button:has-text("Нусхабардорӣ")').last();
    await confirmDuplicateButton.click();

    await page.waitForURL((url) => url.pathname.startsWith("/courses/") && url.pathname !== "/courses", { timeout: 15000 });
    await page.locator("h1").waitFor({ timeout: 10000 });
    const dirDuplicateUrl = page.url();
    assert.ok(dirDuplicateUrl.includes("/courses/"), "URL must navigate to created duplicate course detail");

    await recordScreenshot(page, "desktop-1440-duplicated-course-detail-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Duplicated course detail page navigated to after successful duplicate",
      url: dirDuplicateUrl,
    });
    registerProbe({
      probe: "duplicate-success-navigation",
      passed: true,
      navigatedUrl: dirDuplicateUrl,
    });

    await page.goto(`${previewOrigin}/courses`);
    await page.waitForURL((url) => url.pathname === "/courses", { timeout: 10000 });
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });

    let candidateTrigger = page.locator('button[aria-label^="Course actions: Python Fundamentals ("]').first();
    if ((await candidateTrigger.count()) === 0) {
      const pageTwoLink = page.locator('button[aria-label="Page 2"], button:has-text("2")').last();
      if ((await pageTwoLink.count()) > 0) {
        await pageTwoLink.click();
        await page.waitForTimeout(400);
      }
      candidateTrigger = page.locator('button[aria-label^="Course actions: Python Fundamentals ("]').first();
    }
    if ((await candidateTrigger.count()) === 0) {
      candidateTrigger = page.locator('button[aria-label^="Course actions:"]').last();
    }

    await candidateTrigger.waitFor({ timeout: 10000 });
    await candidateTrigger.click();
    await menuPopup.waitFor({ timeout: 5000 });

    const deleteItem = page.locator('[role="menuitem"]:has-text("Delete"), [role="menuitem"]:has-text("Удалить"), [role="menuitem"]:has-text("Нест кардан")');
    await deleteItem.waitFor({ timeout: 5000 });
    await deleteItem.click();

    await confirmDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-delete-confirm-dialog-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Confirmation dialog for deleting course",
    });

    const cancelButton = confirmDialog.locator('button:has-text("Cancel"), button:has-text("Отмена"), button:has-text("Бекор кардан")');
    await cancelButton.click();
    await confirmDialog.waitFor({ state: "detached", timeout: 5000 });
    await page.waitForTimeout(300);

    const isDeleteTriggerFocused = await candidateTrigger.evaluate((el) => document.activeElement === el);
    assert.ok(isDeleteTriggerFocused, "Delete action trigger must receive focus after cancellation");
    registerProbe({
      probe: "delete-cancellation-focus-restoration",
      passed: isDeleteTriggerFocused,
      activeElementTag: await page.evaluate(() => document.activeElement?.tagName),
    });

    await candidateTrigger.click();
    await menuPopup.waitFor({ timeout: 5000 });
    await deleteItem.click();
    await confirmDialog.waitFor({ timeout: 5000 });

    const confirmDeleteButton = confirmDialog.locator('button:has-text("Delete"), button:has-text("Удалить"), button:has-text("Нест кардан")').last();
    await confirmDeleteButton.click();

    await confirmDialog.waitFor({ state: "detached", timeout: 10000 });
    const toast = page.locator('[role="status"][aria-live="polite"]');
    await toast.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    const searchInputAfterDelete = page.locator('input[type="text"][placeholder*="course"], input[type="text"][placeholder*="курс"]').first();
    const isSearchFocused = await searchInputAfterDelete.evaluate((el) => document.activeElement === el);
    assert.ok(isSearchFocused, "Search input must receive focus after successful course deletion");

    await recordScreenshot(page, "desktop-1440-delete-success-list-refreshed.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "List refreshed and search input focused after successful delete",
    });
    registerProbe({
      probe: "delete-success-list-refresh",
      passed: isSearchFocused,
      activeElementTag: await page.evaluate(() => document.activeElement?.tagName),
    });

    const [sourceCourseRes, sourceScheduleRes] = await Promise.all([
      page.waitForResponse((res) => res.request().method() === "GET" && res.url().includes("/api/v1/courses/1") && !res.url().includes("/schedule") && res.status() === 200),
      page.waitForResponse((res) => res.request().method() === "GET" && res.url().includes("/courses/1/schedule") && res.status() === 200),
      page.goto(`${previewOrigin}/courses/1`),
    ]);
    const sourceCourseData = await sourceCourseRes.json();
    const sourceSchedules = await sourceScheduleRes.json();
    await page.waitForURL((url) => url.pathname === "/courses/1", { timeout: 10000 });
    await page.locator("h1").waitFor({ timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector('main [data-testid="brand-activity-indicator"], main [class*="animate-pulse"]'));

    const profileMenuTrigger = page.locator('button[aria-label="Course actions: Python Fundamentals"]').first();
    await profileMenuTrigger.waitFor({ timeout: 5000 });
    await profileMenuTrigger.click();

    await menuPopup.waitFor({ timeout: 5000 });
    const profileEditItem = page.locator('[role="menuitem"]:has-text("Edit"), [role="menuitem"]:has-text("Редактировать"), [role="menuitem"]:has-text("Таҳрир")');
    await profileEditItem.click();

    const profileDrawer = page.locator('[role="dialog"]');
    await profileDrawer.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-profile-edit-drawer-open.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "CourseProfile edit drawer open",
    });

    const descField = page.locator("#course-description-field");
    await descField.fill("Updated Python Fundamentals course description for lifecycle verification.");

    const saveBtn = page.locator('button[type="submit"][form="course-form"]');
    await saveBtn.click();

    await profileDrawer.waitFor({ state: "detached", timeout: 10000 });
    await page.waitForTimeout(400);

    const updatedDescEl = page.locator("text=Updated Python Fundamentals course description for lifecycle verification.");
    await updatedDescEl.waitFor({ timeout: 10000 });
    const isDescUpdated = (await updatedDescEl.count()) > 0;
    assert.ok(isDescUpdated, "Detail view must refresh with mutated description");

    const isProfileMenuFocused = await profileMenuTrigger.evaluate((el) => document.activeElement === el);
    assert.ok(isProfileMenuFocused, "Header action menu must receive focus after profile edit save");

    await recordScreenshot(page, "desktop-1440-profile-edited-refreshed.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "CourseProfile refreshed with updated description and focused header menu",
    });
    registerProbe({
      probe: "detail-edit-persistence-and-focus",
      passed: isDescUpdated && isProfileMenuFocused,
    });

    let copyPostRequests = [];
    const copyRequestListener = (req) => {
      if (req.method() === "POST" && req.url().includes("/courses/") && req.url().includes("/copy/")) {
        copyPostRequests.push(req);
      }
    };
    page.on("request", copyRequestListener);

    await profileMenuTrigger.click();
    await menuPopup.waitFor({ timeout: 5000 });
    const profileDuplicateItem = page.locator('[role="menuitem"]:has-text("Duplicate"), [role="menuitem"]:has-text("Дублировать"), [role="menuitem"]:has-text("Нусхабардорӣ")');
    await profileDuplicateItem.click();

    await confirmDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-profile-duplicate-confirm.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Confirmation dialog for duplicating from CourseProfile",
    });

    const confirmProfileDuplicateBtn = confirmDialog.locator('button:has-text("Duplicate"), button:has-text("Дублировать"), button:has-text("Нусхабардорӣ")').last();

    const [copyResponse, scheduleResponse] = await Promise.all([
      page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/courses/") && res.url().includes("/copy/") && res.status() === 201),
      page.waitForResponse((res) => res.request().method() === "GET" && res.url().includes("/schedule") && !res.url().includes("/courses/1/schedule") && res.status() === 200),
      confirmProfileDuplicateBtn.click(),
    ]);

    const copyResponseJson = await copyResponse.json();
    const newCourseSchedules = await scheduleResponse.json();

    await page.waitForURL((url) => url.pathname.startsWith("/courses/") && url.pathname !== "/courses/1" && url.pathname !== "/courses", { timeout: 15000 });
    await page.locator("h1").waitFor({ timeout: 10000 });
    const newCourseUrl = page.url();

    page.off("request", copyRequestListener);

    assert.equal(copyPostRequests.length, 1, "Exactly one POST request must be captured during copy");
    assert.ok(copyResponseJson, "Copied course response JSON must be received");
    assert.equal(copyResponseJson.photo_path, null, "photo_path policy: copied course must not copy photo (photo_path must be null)");

    const currentPathname = new URL(page.url()).pathname;
    assert.equal(currentPathname, `/courses/${copyResponseJson.id}`, "Pathname must be exactly /courses/<copyResponseJson.id>");

    const copyPayload = copyPostRequests[0].postDataJSON();
    assert.equal(copyResponseJson.start_date, copyPayload.start_date, "start_date must match POST payload");
    assert.equal(copyResponseJson.end_date, copyPayload.end_date, "end_date must match POST payload");
    assert.equal(copyResponseJson.price, copyPayload.price, "price decimal string must match POST payload");
    assert.equal(copyResponseJson.mentor_id, copyPayload.mentor_id, "mentor_id must match POST payload");
    assert.equal(copyResponseJson.exam_type, copyPayload.exam_type, "exam_type must match POST payload");

    assert.equal(copyPayload.start_date, sourceCourseData.start_date, "payload start_date must match source course");
    assert.equal(copyPayload.end_date, sourceCourseData.end_date, "payload end_date must match source course");
    assert.equal(copyPayload.price, sourceCourseData.price, "payload price must match source course");
    assert.equal(copyPayload.mentor_id, sourceCourseData.mentor_id, "payload mentor_id must match source course");
    assert.equal(copyPayload.exam_type, sourceCourseData.exam_type, "payload exam_type must match source course");

    assert.ok(sourceSchedules && sourceSchedules.length > 0, "Source course must have schedules");
    assert.ok(newCourseSchedules && newCourseSchedules.length > 0, "New course must have schedules");
    assert.equal(newCourseSchedules.length, sourceSchedules.length, "Copied course must match source schedule count");
    for (let idx = 0; idx < sourceSchedules.length; idx++) {
      const src = sourceSchedules[idx];
      const target = newCourseSchedules[idx];
      assert.equal(target.day_of_week, src.day_of_week, `Schedule ${idx} day_of_week must match canonical value`);
      assert.equal(target.time_start, src.time_start, `Schedule ${idx} time_start must match exact canonical string`);
      assert.equal(target.time_end, src.time_end, `Schedule ${idx} time_end must match exact canonical string`);
    }

    assert.equal(copyPayload.schedules.length, sourceSchedules.length, "Payload schedules count must match source schedules");
    for (let idx = 0; idx < sourceSchedules.length; idx++) {
      const src = sourceSchedules[idx];
      const pld = copyPayload.schedules[idx];
      assert.equal(pld.day_of_week, src.day_of_week, `Payload schedule ${idx} day_of_week must match`);
      assert.equal(pld.time_start, src.time_start, `Payload schedule ${idx} time_start must match exact canonical string`);
      assert.equal(pld.time_end, src.time_end, `Payload schedule ${idx} time_end must match exact canonical string`);
    }

    await recordScreenshot(page, "desktop-1440-profile-duplicated-detail.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Navigated to newly duplicated course detail with verified schedules",
      url: newCourseUrl,
    });

    registerProbe({
      probe: "duplicate-schedule-fidelity-and-photo-policy",
      passed: copyPostRequests.length === 1 &&
        copyResponseJson.photo_path === null &&
        currentPathname === `/courses/${copyResponseJson.id}` &&
        copyResponseJson.start_date === copyPayload.start_date &&
        copyResponseJson.end_date === copyPayload.end_date &&
        copyResponseJson.price === copyPayload.price &&
        copyResponseJson.mentor_id === copyPayload.mentor_id &&
        copyResponseJson.exam_type === copyPayload.exam_type,
      newCourseId: copyResponseJson.id,
      exactPathname: currentPathname,
      photoPolicyNull: copyResponseJson.photo_path === null,
      termsFidelity: {
        start_date: copyResponseJson.start_date,
        end_date: copyResponseJson.end_date,
        price: copyResponseJson.price,
        mentor_id: copyResponseJson.mentor_id,
        exam_type: copyResponseJson.exam_type,
      },
      scheduleCount: newCourseSchedules.length,
    });

    const dupHeaderMenuTrigger = page.locator('button[aria-label^="Course actions:"]').first();
    await dupHeaderMenuTrigger.waitFor({ timeout: 5000 });

    let deleteRequests = [];
    const deleteReqListener = (req) => {
      if (req.method() === "DELETE" && req.url().includes("/courses/")) {
        deleteRequests.push(req);
      }
    };
    page.on("request", deleteReqListener);

    await dupHeaderMenuTrigger.click();
    await menuPopup.waitFor({ timeout: 5000 });
    const profileDeleteItem = page.locator('[role="menuitem"]:has-text("Delete"), [role="menuitem"]:has-text("Удалить"), [role="menuitem"]:has-text("Нест кардан")');
    await profileDeleteItem.click();

    await confirmDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-profile-delete-confirm.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Delete confirmation modal on CourseProfile",
    });

    const cancelProfileDeleteBtn = confirmDialog.locator('button:has-text("Cancel"), button:has-text("Отмена"), button:has-text("Бекор кардан")');
    await cancelProfileDeleteBtn.click();
    await confirmDialog.waitFor({ state: "detached", timeout: 5000 });
    await page.waitForTimeout(300);

    assert.equal(deleteRequests.length, 0, "Zero DELETE requests must be issued upon cancel");
    const isTriggerFocusedAfterCancel = await dupHeaderMenuTrigger.evaluate((el) => document.activeElement === el);
    assert.ok(isTriggerFocusedAfterCancel, "Trigger must retain focus after delete cancel");

    registerProbe({
      probe: "cancellation-zero-write-fidelity",
      passed: deleteRequests.length === 0 && isTriggerFocusedAfterCancel,
    });

    await dupHeaderMenuTrigger.click();
    await menuPopup.waitFor({ timeout: 5000 });
    await profileDeleteItem.click();
    await confirmDialog.waitFor({ timeout: 5000 });

    const confirmProfileDeleteBtn = confirmDialog.locator('button:has-text("Delete"), button:has-text("Удалить"), button:has-text("Нест кардан")').last();
    await confirmProfileDeleteBtn.click();

    await confirmDialog.waitFor({ state: "detached", timeout: 10000 });
    await page.waitForURL((url) => url.pathname === "/courses", { timeout: 15000 });
    page.off("request", deleteReqListener);

    assert.equal(deleteRequests.length, 1, "Exactly one DELETE request must be issued upon confirm delete");
    assert.equal(page.url().split("?")[0], `${previewOrigin}/courses`, "Must gracefully return to preserved directory list context");

    await recordScreenshot(page, "desktop-1440-profile-delete-return-courses.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Graceful return to preserved courses directory after deletion on CourseProfile",
    });

    registerProbe({
      probe: "detail-delete-return-context",
      passed: deleteRequests.length === 1 && page.url().split("?")[0] === `${previewOrigin}/courses`,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "dark" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });

    await recordScreenshot(page, "desktop-1440-superadmin-courses-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "1440x1000",
      description: "Superadmin course directory in dark theme",
    });

    const createButton = page.locator('button:has-text("Create Course"), button:has-text("Создать курс"), button:has-text("Эҷоди курс")').first();
    await createButton.click();
    const drawerDialog = page.locator('[role="dialog"]');
    await drawerDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-create-drawer-open-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "1440x1000",
      description: "Create course drawer in dark theme",
    });
    await page.keyboard.press("Escape");
    await drawerDialog.waitFor({ state: "detached", timeout: 5000 });

    const firstActionTrigger = page.locator('button[aria-label^="Course actions:"]').first();
    await firstActionTrigger.click();
    const menuPopup = page.locator('[role="menu"]');
    await menuPopup.waitFor({ timeout: 5000 });
    const duplicateItem = page.locator('[role="menuitem"]:has-text("Duplicate"), [role="menuitem"]:has-text("Дублировать"), [role="menuitem"]:has-text("Нусхабардорӣ")');
    await duplicateItem.click();

    const confirmDialog = page.locator('[role="dialog"]');
    await confirmDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-duplicate-confirm-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "1440x1000",
      description: "Duplicate confirmation dialog in dark theme",
    });
    await page.keyboard.press("Escape");
    await confirmDialog.waitFor({ state: "detached", timeout: 5000 });

    await firstActionTrigger.click();
    await menuPopup.waitFor({ timeout: 5000 });
    const deleteItem = page.locator('[role="menuitem"]:has-text("Delete"), [role="menuitem"]:has-text("Удалить"), [role="menuitem"]:has-text("Нест кардан")');
    await deleteItem.click();
    await confirmDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-delete-confirm-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "1440x1000",
      description: "Delete confirmation dialog in dark theme",
    });
    await page.keyboard.press("Escape");
    await confirmDialog.waitFor({ state: "detached", timeout: 5000 });

    registerProbe({
      probe: "dark-theme-dialogs-and-surfaces",
      passed: true,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });

    await recordScreenshot(page, "mobile-390-courses-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Superadmin course directory mobile 390 light view",
    });

    const createButton = page.locator('button:has-text("Create Course"), button:has-text("Создать курс"), button:has-text("Эҷоди курс")').first();
    await createButton.click();
    const drawerDialog = page.locator('[role="dialog"]');
    await drawerDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    const mobileDrawerBox = await drawerDialog.boundingBox();
    assert.ok(mobileDrawerBox && mobileDrawerBox.width >= 350, "Mobile drawer must fill mobile width");

    await recordScreenshot(page, "mobile-390-create-drawer-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Mobile full-screen create course drawer",
      measuredWidth: mobileDrawerBox?.width,
    });

    await page.keyboard.press("Escape");
    await drawerDialog.waitFor({ state: "detached", timeout: 5000 });

    const firstActionTrigger = page.locator('button[aria-label^="Course actions:"]').first();
    await firstActionTrigger.click();
    const menuPopup = page.locator('[role="menu"]');
    await menuPopup.waitFor({ timeout: 5000 });
    await page.waitForTimeout(200);

    await recordScreenshot(page, "mobile-390-action-menu-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Mobile course card action popup",
    });

    const duplicateItem = page.locator('[role="menuitem"]:has-text("Duplicate"), [role="menuitem"]:has-text("Дублировать"), [role="menuitem"]:has-text("Нусхабардорӣ")');
    await duplicateItem.click();
    const confirmDialog = page.locator('[role="dialog"]');
    await confirmDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(200);

    await recordScreenshot(page, "mobile-390-duplicate-confirm-light.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Mobile duplicate confirmation modal",
    });
    await page.keyboard.press("Escape");
    await confirmDialog.waitFor({ state: "detached", timeout: 5000 });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setupContext(context, { theme: "dark" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });

    await recordScreenshot(page, "mobile-390-courses-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "390x844",
      description: "Superadmin course directory mobile 390 dark view",
    });

    const firstActionTrigger = page.locator('button[aria-label^="Course actions:"]').first();
    await firstActionTrigger.click();
    const menuPopup = page.locator('[role="menu"]');
    await menuPopup.waitFor({ timeout: 5000 });
    const editItem = page.locator('[role="menuitem"]:has-text("Edit"), [role="menuitem"]:has-text("Редактировать"), [role="menuitem"]:has-text("Таҳрир")');
    await editItem.click();

    const drawerDialog = page.locator('[role="dialog"]');
    await drawerDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "mobile-390-edit-drawer-dark.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "390x844",
      description: "Mobile edit course drawer in dark theme",
    });
    await page.keyboard.press("Escape");
    await drawerDialog.waitFor({ state: "detached", timeout: 5000 });

    registerProbe({
      probe: "mobile-responsive-full-height-surfaces",
      passed: true,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });

    const createButton = page.locator('button:has-text("Create Course"), button:has-text("Создать курс"), button:has-text("Эҷоди курс")').first();
    await createButton.click();
    const drawerDialog = page.locator('[role="dialog"]');
    await drawerDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    const drawerBox = await drawerDialog.boundingBox();
    assert.ok(drawerBox, "Drawer bounding box must exist on tablet");
    const drawerWidth = Math.round(drawerBox.width);
    assert.ok(drawerWidth >= 500 && drawerWidth <= 580, `Expected drawer width ~560px on tablet, got ${drawerWidth}`);

    await recordScreenshot(page, "tablet-768-create-drawer.png", {
      role: "superadmin",
      theme: "light",
      viewport: "768x1024",
      description: "Tablet 768px create course drawer bounded to 560px",
      drawerWidth,
    });
    registerProbe({
      probe: "responsive-viewports-geometry",
      tabletDrawerWidth: drawerWidth,
      passed: drawerWidth >= 500 && drawerWidth <= 580,
    });

    await page.keyboard.press("Escape");
    await drawerDialog.waitFor({ state: "detached", timeout: 5000 });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });

    await recordScreenshot(page, "desktop-1024-courses.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1024x768",
      description: "Desktop 1024px course directory with full sidebar and grid",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "ru" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });

    const firstActionTrigger = page.locator('button[aria-label^="Course actions:"], button[aria-label^="Действия с курсом:"]').first();
    await firstActionTrigger.click();
    const menuPopup = page.locator('[role="menu"]');
    await menuPopup.waitFor({ timeout: 5000 });
    const duplicateItem = page.locator('[role="menuitem"]:has-text("Дублировать")');
    await duplicateItem.click();

    const confirmDialog = page.locator('[role="dialog"]');
    await confirmDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-duplicate-ru.png", {
      role: "superadmin",
      theme: "light",
      lng: "ru",
      viewport: "1440x1000",
      description: "Duplicate confirmation dialog in Russian",
    });
    await page.keyboard.press("Escape");
    await confirmDialog.waitFor({ state: "detached", timeout: 5000 });

    await firstActionTrigger.click();
    await menuPopup.waitFor({ timeout: 5000 });
    const deleteItem = page.locator('[role="menuitem"]:has-text("Удалить")');
    await deleteItem.click();
    await confirmDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-delete-ru.png", {
      role: "superadmin",
      theme: "light",
      lng: "ru",
      viewport: "1440x1000",
      description: "Delete confirmation dialog in Russian",
    });
    await page.keyboard.press("Escape");
    await confirmDialog.waitFor({ state: "detached", timeout: 5000 });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "tg" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });

    const firstActionTrigger = page.locator('button[aria-label^="Course actions:"], button[aria-label^="Амалҳо бо курс:"]').first();
    await firstActionTrigger.click();
    const menuPopup = page.locator('[role="menu"]');
    await menuPopup.waitFor({ timeout: 5000 });
    const duplicateItem = page.locator('[role="menuitem"]:has-text("Нусхабардорӣ")');
    await duplicateItem.click();

    const confirmDialog = page.locator('[role="dialog"]');
    await confirmDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-duplicate-tg.png", {
      role: "superadmin",
      theme: "light",
      lng: "tg",
      viewport: "1440x1000",
      description: "Duplicate confirmation dialog in Tajik",
    });
    await page.keyboard.press("Escape");
    await confirmDialog.waitFor({ state: "detached", timeout: 5000 });

    await firstActionTrigger.click();
    await menuPopup.waitFor({ timeout: 5000 });
    const deleteItem = page.locator('[role="menuitem"]:has-text("Нест кардан")');
    await deleteItem.click();
    await confirmDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    await recordScreenshot(page, "desktop-1440-delete-tg.png", {
      role: "superadmin",
      theme: "light",
      lng: "tg",
      viewport: "1440x1000",
      description: "Delete confirmation dialog in Tajik",
    });
    await page.keyboard.press("Escape");
    await confirmDialog.waitFor({ state: "detached", timeout: 5000 });

    registerProbe({
      probe: "multilingual-lifecycle-dialogs-parity",
      passed: true,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();
    await loginAndNavigateToCourses(page, superadmin, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });

    const prefersReducedMotion = await page.evaluate(() =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    assert.ok(prefersReducedMotion, "window.matchMedia('(prefers-reduced-motion: reduce)') must match");

    const rootComputedFontSize = await page.evaluate(() =>
      window.getComputedStyle(document.documentElement).fontSize
    );
    assert.equal(rootComputedFontSize, "32px", "Computed root fontSize must be 32px at 200% text enlargement");

    const firstActionTrigger = page.locator('button[aria-label^="Course actions:"]').first();
    await firstActionTrigger.click();
    const menuPopup = page.locator('[role="menu"]');
    await menuPopup.waitFor({ timeout: 5000 });
    const duplicateItem = page.locator('[role="menuitem"]:has-text("Duplicate"), [role="menuitem"]:has-text("Дублировать"), [role="menuitem"]:has-text("Нусхабардорӣ")');
    await duplicateItem.click();

    const confirmDialog = page.locator('[role="dialog"]');
    await confirmDialog.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    const titleFontSize = await confirmDialog.locator("h2, [id*='title'], [data-testid*='title'], h3").first().evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).fontSize);
    });
    assert.ok(titleFontSize >= 24, `Enlarged dialog title font size must be >= 24px, got ${titleFontSize}px`);

    const bodyFontSize = await confirmDialog.locator("p").first().evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).fontSize);
    });
    assert.ok(bodyFontSize >= 18, `Enlarged dialog body font size must be >= 18px, got ${bodyFontSize}px`);

    const dialogBoundingBox = await confirmDialog.boundingBox();
    assert.ok(dialogBoundingBox && dialogBoundingBox.width >= 300 && dialogBoundingBox.height >= 150, "Dialog bounding box must be valid and readable");

    const clippingCheck = await confirmDialog.evaluate((el) => {
      const hasScrollOverflow = el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2;
      const computed = window.getComputedStyle(el);
      const hasNegativeMargin =
        parseFloat(computed.marginLeft) < 0 ||
        parseFloat(computed.marginRight) < 0 ||
        parseFloat(computed.marginTop) < 0 ||
        parseFloat(computed.marginBottom) < 0;
      return {
        hasScrollOverflow,
        hasNegativeMargin,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      };
    });
    assert.ok(!clippingCheck.hasScrollOverflow, "Dialog must have no clipping scroll overflow");
    assert.ok(!clippingCheck.hasNegativeMargin, "Dialog must have no negative margin overflows");

    await page.keyboard.press("Tab");
    const insideAfterTab = await confirmDialog.evaluate((dialog) => dialog.contains(document.activeElement));
    assert.ok(insideAfterTab, "Focus must remain inside dialog after Tab");

    await page.keyboard.press("Tab");
    const insideAfterSecondTab = await confirmDialog.evaluate((dialog) => dialog.contains(document.activeElement));
    assert.ok(insideAfterSecondTab, "Focus must remain inside dialog after second Tab");

    await page.keyboard.press("Shift+Tab");
    const insideAfterShiftTab = await confirmDialog.evaluate((dialog) => dialog.contains(document.activeElement));
    assert.ok(insideAfterShiftTab, "Focus must remain inside dialog after Shift+Tab");

    const reducedMotionComputed = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const buttons = Array.from(dialog?.querySelectorAll("button") || []);
      const getStyles = (el) => {
        const cs = window.getComputedStyle(el);
        return {
          tagName: el.tagName,
          text: el.textContent?.trim(),
          animationName: cs.animationName,
          animationDuration: cs.animationDuration,
          transitionDuration: cs.transitionDuration,
        };
      };
      return {
        dialog: dialog ? getStyles(dialog) : null,
        buttons: buttons.map(getStyles),
      };
    });

    assert.ok(reducedMotionComputed.dialog, "Dialog element must exist for reduced-motion computed checks");
    assert.equal(reducedMotionComputed.dialog.animationName, "none", "Dialog nonessential animationName must be none under reduced motion");
    assert.ok(
      reducedMotionComputed.dialog.animationDuration === "0s" || reducedMotionComputed.dialog.animationName === "none",
      "Dialog animation duration must be 0s or animation none"
    );

    for (const btnStyle of reducedMotionComputed.buttons) {
      assert.equal(btnStyle.animationName, "none", "Button animationName must be none under reduced motion");
      assert.ok(
        btnStyle.transitionDuration === "0s" || btnStyle.transitionDuration === "",
        `Button transition duration must be 0s under reduced motion, got ${btnStyle.transitionDuration}`
      );
    }

    await recordScreenshot(page, "desktop-1440-enlarged-text-duplicate.png", {
      role: "superadmin",
      theme: "light",
      textScale: 2.0,
      viewport: "1440x1000",
      description: "Duplicate modal with 200% root text enlargement and reduced-motion",
      rootComputedFontSize,
      titleFontSize,
      bodyFontSize,
      dialogBoundingBox,
      reducedMotionComputed,
    });

    await page.keyboard.press("Escape");
    await confirmDialog.waitFor({ state: "detached", timeout: 5000 });

    registerProbe({
      probe: "enlarged-text-layout-integrity",
      passed: rootComputedFontSize === "32px" && !clippingCheck.hasScrollOverflow && !clippingCheck.hasNegativeMargin && titleFontSize >= 24 && bodyFontSize >= 18,
      rootComputedFontSize,
      titleFontSize,
      bodyFontSize,
      dialogBoundingBox,
      clippingCheck,
    });

    registerProbe({
      probe: "reduced-motion-and-keyboard-focus",
      passed: prefersReducedMotion && insideAfterTab && insideAfterShiftTab &&
        reducedMotionComputed.dialog.animationName === "none" &&
        reducedMotionComputed.buttons.every((b) => b.animationName === "none" && (b.transitionDuration === "0s" || b.transitionDuration === "")),
      prefersReducedMotion,
      reducedMotionComputed,
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light" });
    const page = await context.newPage();

    let privilegedCalls = 0;
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/users/mentors") || url.includes("/mentor-history")) {
        privilegedCalls++;
      }
    });

    await loginAndNavigateToCourses(page, mentor, "/courses");
    await page.locator('a[href^="/courses/"]').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);

    const createBtnCount = await page.locator('button:has-text("Create Course"), button:has-text("Создать курс"), button:has-text("Эҷоди курс")').count();
    const actionMenuCount = await page.locator('button[aria-label^="Course actions:"]').count();

    assert.equal(createBtnCount, 0, "Mentor role must not have Create Course button");
    assert.equal(actionMenuCount, 0, "Mentor role must not have Course actions overflow button");
    assert.equal(privilegedCalls, 0, "Mentor role must not make privileged /users/mentors requests");

    await recordScreenshot(page, "desktop-1440-mentor-readonly.png", {
      role: "mentor",
      theme: "light",
      viewport: "1440x1000",
      description: "Mentor course directory with read-only view and zero privileged calls",
      createBtnCount,
      actionMenuCount,
      privilegedCalls,
    });

    registerProbe({
      probe: "mentor-role-read-only-lifecycle",
      passed: createBtnCount === 0 && actionMenuCount === 0 && privilegedCalls === 0,
      createBtnCount,
      actionMenuCount,
      privilegedCalls,
    });

    await context.close();
  }

  await writeFile(`${taskDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  await writeFile(`${taskDir}/probes.json`, JSON.stringify(probes, null, 2));

  console.log(JSON.stringify({ status: "success", screenshots: manifest.length, probes: probes.length }));
} finally {
  await browser.close();
}

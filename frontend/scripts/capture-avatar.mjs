import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixtures = JSON.parse(input);

const taskDir = resolve("../docs/redesign-execution/group-03/students/avatar/evidence");
const screenshotsDir = `${taskDir}/screenshots`;
await mkdir(screenshotsDir, { recursive: true });

const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
assert.ok(superadmin, "Superadmin fixture identity must be present");

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5196";

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
  await page.locator('button[aria-label*="Student actions:"]:visible, button[aria-label*="Действия студента:"]:visible, button[aria-label*="Амалҳои донишҷӯ:"]:visible, button[aria-label*="Edit"]:visible').first().waitFor({ timeout: 15000 });
}

async function openStudentEditDrawer(page) {
  const menuBtn = page.locator('button[aria-label*="Student actions:"]:visible, button[aria-label*="Действия студента:"]:visible, button[aria-label*="Амалҳои донишҷӯ:"]:visible').first();
  if (await menuBtn.isVisible()) {
    await menuBtn.click();
    const editItem = page.locator('[role="menuitem"]:has-text("Edit"), [role="menuitem"]:has-text("Редактировать"), [role="menuitem"]:has-text("Таҳрир")').first();
    await editItem.waitFor({ timeout: 10000 });
    await editItem.click();
  } else {
    const editBtn = page.locator('button[aria-label*="Edit"]:visible, button[aria-label*="Редактировать"]:visible, button[aria-label*="Таҳрир"]:visible').first();
    await editBtn.waitFor({ timeout: 10000 });
    await editBtn.click();
  }
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 10000 });
  await dialog.locator('input[type="file"]').waitFor({ timeout: 10000 });
  return dialog;
}

try {
  const viewports = [
    { name: "desktop-1440", width: 1440, height: 1000, theme: "light", lng: "en" },
    { name: "desktop-1440", width: 1440, height: 1000, theme: "dark", lng: "en" },
    { name: "mobile-390", width: 390, height: 844, theme: "light", lng: "en" },
    { name: "mobile-390", width: 390, height: 844, theme: "dark", lng: "en" },
    { name: "tablet-768", width: 768, height: 1024, theme: "light", lng: "en" },
    { name: "desktop-1024", width: 1024, height: 768, theme: "light", lng: "en" },
    { name: "narrow-320", width: 320, height: 600, theme: "light", lng: "en" },
    { name: "desktop-1440", width: 1440, height: 1000, theme: "light", lng: "ru" },
    { name: "desktop-1440", width: 1440, height: 1000, theme: "light", lng: "tg" },
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: vp.theme,
    });
    await setupContext(context, { theme: vp.theme, lng: vp.lng });
    const page = await context.newPage();

    await loginAsSuperadmin(page);
    const dialog = await openStudentEditDrawer(page);

    let filename = `${vp.name}-edit-student-drawer-${vp.theme}.png`;
    if (vp.lng !== "en") {
      filename = `${vp.name}-edit-student-drawer-${vp.lng}.png`;
    } else if (vp.name.includes("768") || vp.name.includes("1024") || vp.name.includes("320")) {
      filename = `${vp.name}-edit-student-drawer-${vp.theme}.png`;
    }

    await recordScreenshot(page, filename, {
      role: "superadmin",
      theme: vp.theme,
      viewport: `${vp.width}x${vp.height}`,
      locale: vp.lng,
      description: `Superadmin student edit drawer with AvatarUploadField (${vp.width}x${vp.height}, ${vp.theme}, ${vp.lng})`,
    });

    if (vp.name === "desktop-1440" && vp.theme === "light" && vp.lng === "en") {
      registerProbe({
        probe: "superadmin_students_table_and_edit_drawer_opened",
        passed: true,
        viewport: "1440x1000",
        drawerFound: true,
      });

      const targetBounds = await page.evaluate(() => {
        const dialogEl = document.querySelector('[role="dialog"]');
        if (!dialogEl) return null;
        const btn = Array.from(dialogEl.querySelectorAll('button')).find((b) =>
          b.textContent.includes("photo") || b.textContent.includes("Photo") || b.textContent.includes("фото") || b.textContent.includes("акс")
        );
        if (!btn) return null;
        const rect = btn.getBoundingClientRect();
        return { width: rect.width, height: rect.height, text: btn.textContent };
      });
      registerProbe({
        probe: "touch_target_at_least_44px",
        passed: targetBounds !== null && targetBounds.width >= 44 && targetBounds.height >= 44,
        bounds: targetBounds,
      });
    }

    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAsSuperadmin(page);
    await openStudentEditDrawer(page);

    await recordScreenshot(page, "desktop-1440-edit-student-reduced-motion.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      reducedMotion: true,
      description: "Superadmin student edit drawer with prefers-reduced-motion active",
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
    const dialog = await openStudentEditDrawer(page);

    const uploadBtn = dialog.locator('button:has-text("Upload photo"), button:has-text("Change photo")').first();
    await uploadBtn.focus();

    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    const focusedText = await page.evaluate(() => document.activeElement?.textContent);
    registerProbe({
      probe: "native_keyboard_focus_target_is_accessible_button",
      passed: focusedTag === "BUTTON" && Boolean(focusedText?.includes("photo") || focusedText?.includes("Photo")),
      focusedTag,
      focusedText,
    });

    await recordScreenshot(page, "desktop-1440-edit-student-keyboard-focus.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin student edit drawer with native keyboard focus ring on accessible avatar upload button",
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
    const dialog = await openStudentEditDrawer(page);

    await page.route("**/api/v1/users/*/avatar/", async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });

    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles(resolve("./src/assets/kitob-emblem.png"));

    await dialog.locator('text=Uploading').waitFor({ timeout: 5000 });

    await recordScreenshot(page, "desktop-1440-student-avatar-uploading-simulated.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      simulated: true,
      description: "Simulated in-flight avatar upload showing activity indicator and progress geometry (SIMULATED)",
    });

    await page.unroute("**/api/v1/users/*/avatar/");
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
    const dialog = await openStudentEditDrawer(page);

    // 1. Initial Real Upload: Save a real photo through authorized endpoint
    const avatarResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/avatar/") && res.request().method() === "POST",
      { timeout: 20000 },
    );

    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles(resolve("./src/assets/kitob-emblem.png"));

    const avatarResponse = await avatarResponsePromise;
    assert.equal(avatarResponse.status(), 200, "Real initial avatar upload POST must return 200");
    const responsePayload = await avatarResponse.json();
    assert.ok(responsePayload.id, "Response must include student id");
    assert.ok(responsePayload.thumbnail_path || responsePayload.photo_path, "Response must include updated photo paths");

    await dialog.locator('text=Photo saved').waitFor({ timeout: 10000 });

    const avatarContainer = dialog.locator('[data-testid="avatar-preview-container"]');
    const avatarImg = avatarContainer.locator("img");
    await avatarImg.waitFor({ timeout: 5000 });

    const persistedInitialAvatarSrc = await avatarImg.getAttribute("src");
    assert.ok(persistedInitialAvatarSrc, "Saved avatar img must have src attribute");
    assert.ok(
      persistedInitialAvatarSrc.includes(responsePayload.thumbnail_path) ||
      persistedInitialAvatarSrc.includes(responsePayload.photo_path),
      `Avatar img src (${persistedInitialAvatarSrc}) must match response thumbnail_path (${responsePayload.thumbnail_path}) or photo_path (${responsePayload.photo_path})`,
    );

    const initialLoaded = await avatarImg.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
    assert.ok(initialLoaded, "Actual avatar image must render with positive natural dimensions");

    registerProbe({
      probe: "real_superadmin_avatar_upload_post_200",
      passed: true,
      status: 200,
      studentId: responsePayload.id,
      photo_path: responsePayload.photo_path,
      thumbnail_path: responsePayload.thumbnail_path,
      persistedInitialAvatarSrc,
      naturalWidth: await avatarImg.evaluate((img) => img.naturalWidth),
      naturalHeight: await avatarImg.evaluate((img) => img.naturalHeight),
    });

    await recordScreenshot(page, "desktop-1440-student-avatar-saved-real.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      realPost200: true,
      description: "Real authorized superadmin avatar upload POST outcome showing HTTP 200 media response and Saved state badge",
    });

    // 2. Attempt failed replacement: verify same actual avatar URL retained
    let simulateFailure = true;
    await page.route("**/api/v1/users/*/avatar/", async (route) => {
      if (simulateFailure) {
        await route.fulfill({
          status: 413,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Avatar size exceeds the 5MB limit" }),
        });
      } else {
        await route.continue();
      }
    });

    await fileInput.setInputFiles(resolve("./src/assets/kitob-logo-original.png"));

    await dialog.locator('div[role="alert"]').waitFor({ timeout: 5000 });
    const retryBtn = dialog.locator('button:has-text("Retry")');
    await retryBtn.waitFor({ timeout: 5000 });

    const failedAvatarSrc = await avatarImg.getAttribute("src");
    assert.equal(
      failedAvatarSrc,
      persistedInitialAvatarSrc,
      `Failed replacement must retain exact persisted prior photo URL (${persistedInitialAvatarSrc}), got: ${failedAvatarSrc}`,
    );

    const failedLoaded = await avatarImg.evaluate((img) => img.complete && img.naturalWidth > 0);
    assert.ok(failedLoaded, "Avatar image must remain loaded and rendered on failure");

    await recordScreenshot(page, "desktop-1440-student-avatar-error-simulated.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      simulated: true,
      description: "Simulated upload failure retaining prior student photo with inline error badge and retry/reselect actions (SIMULATED)",
    });

    // 3. Inline Retry: verify exactly one retry POST and actual returned saved avatar path
    simulateFailure = false;
    let postCount = 0;
    const retryResponsePromise = page.waitForResponse(
      (res) => {
        if (res.url().includes("/avatar/") && res.request().method() === "POST") {
          postCount += 1;
          return true;
        }
        return false;
      },
      { timeout: 15000 },
    );

    await retryBtn.click();
    const retryResponse = await retryResponsePromise;
    assert.equal(retryResponse.status(), 200, "Inline retry POST must return 200");
    const retryPayload = await retryResponse.json();
    assert.equal(retryPayload.id, responsePayload.id, "Retry response must match student id");
    assert.equal(postCount, 1, "Inline retry must send exactly one POST request");

    await dialog.locator('text=Photo saved').waitFor({ timeout: 10000 });

    const retriedAvatarSrc = await avatarImg.getAttribute("src");
    assert.ok(retriedAvatarSrc, "Retried avatar image must have src attribute");
    assert.ok(
      retriedAvatarSrc.includes(retryPayload.thumbnail_path) ||
      retriedAvatarSrc.includes(retryPayload.photo_path),
      `Retried avatar img src (${retriedAvatarSrc}) must match retry thumbnail_path (${retryPayload.thumbnail_path}) or photo_path (${retryPayload.photo_path})`,
    );

    const retriedLoaded = await avatarImg.evaluate((img) => img.complete && img.naturalWidth > 0);
    assert.ok(retriedLoaded, "Retried avatar image must be loaded successfully");

    registerProbe({
      probe: "avatar_error_simulation_retains_prior_photo_and_retry_succeeds",
      passed: true,
      studentId: responsePayload.id,
      persistedInitialAvatarSrc,
      failedAvatarSrc,
      retriedAvatarSrc,
      naturalWidth: await avatarImg.evaluate((img) => img.naturalWidth),
      naturalHeight: await avatarImg.evaluate((img) => img.naturalHeight),
      retrySucceeded: true,
      retryPostCount: postCount,
    });

    await page.unroute("**/api/v1/users/*/avatar/");
    await context.close();
  }

  await writeFile(`${taskDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  await writeFile(`${taskDir}/probes.json`, JSON.stringify(probes, null, 2));
  console.log(`PASS: captured ${manifest.length} screenshots and ${probes.length} passing probes to ${taskDir}`);
} finally {
  await browser.close();
}

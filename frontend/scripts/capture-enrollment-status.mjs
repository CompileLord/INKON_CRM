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

const taskDir = resolve(
  process.env.KITOB_TASK_DIR ||
  "../docs/redesign-execution/group-02/enrollment-status/evidence"
);
const taskScreenshotsDir = `${taskDir}/screenshots`;

await mkdir(taskScreenshotsDir, { recursive: true });

const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
assert.ok(superadmin, "Superadmin fixture identity must be present");

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5190";
const apiOrigin = fixtures.api_origin ? `${fixtures.api_origin}/api/v1` : "http://127.0.0.1:18082/api/v1";

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
    }
  );
}

async function loginAndNavigateToCourseStudents(page, identity, courseId) {
  const destination = `/courses/${courseId}?tab=students`;
  await page.goto(`${previewOrigin}/login?redirect=${encodeURIComponent(destination)}`);
  await page.waitForLoadState("domcontentloaded");
  if (page.url().includes("/login")) {
    await page.locator("#email").waitFor({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.locator("#email").fill(identity.email);
    await page.locator("#password").fill(fixtures.password);
    await page.locator('button[type="submit"]').click();
  }
  await page.waitForURL((url) => url.pathname.includes(`/courses/${courseId}`), { timeout: 30000 });
  await page.locator('button[role="tab"]').first().waitFor({ timeout: 15000 });

  const studentsTab = page.locator('button[role="tab"]').filter({ hasText: /Students|Студенты|Донишҷӯён/i });
  await studentsTab.waitFor({ timeout: 10000 });
  const isSelected = await studentsTab.getAttribute("aria-selected");
  if (isSelected !== "true") {
    await studentsTab.click();
  }

  await page.waitForFunction(() => !document.querySelector('main [data-testid="brand-activity-indicator"], main [class*="animate-pulse"]'), { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}

function parseRgb(colorStr) {
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrast(rgb1, rgb2) {
  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const EXPECTED_LABELS = {
  en: { active: "Active", withdrawn: "Withdrawn", completed: "Completed" },
  ru: { active: "Активен", withdrawn: "Отчислен", completed: "Завершен" },
  tg: { active: "Фаъол", withdrawn: "Хориҷшуда", completed: "Хатмкарда" },
};

try {
  const loginRes = await fetch(`${apiOrigin}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: superadmin.email, password: fixtures.password }),
  });
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  const token = loginData.access_token;

  const coursesRes = await fetch(`${apiOrigin}/courses/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(coursesRes.status, 200);
  const coursesList = await coursesRes.json();
  const items = coursesList.items || coursesList;
  const targetCourse = items[0];
  assert.ok(targetCourse, "Target course must exist");
  const courseId = targetCourse.id;

  async function inspectFixtureBadges(page) {
    return await page.evaluate(() => {
      function getStyle(selector) {
        const elem = document.querySelector(selector);
        if (!elem) return null;
        const style = window.getComputedStyle(elem);
        return {
          text: elem.textContent?.trim(),
          color: style.color,
          backgroundColor: style.backgroundColor,
          className: elem.className,
        };
      }

      return {
        active: getStyle('[data-status-wrapper="active"] span.rounded-full'),
        withdrawn: getStyle('[data-status-wrapper="withdrawn"] span.rounded-full'),
        completed: getStyle('[data-status-wrapper="completed"] span.rounded-full'),
      };
    });
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    const realRosterBadges = await page.evaluate(() => {
      const badges = Array.from(document.querySelectorAll('[data-testid="roster-row"] span.rounded-full')).map((elem) => {
        const style = window.getComputedStyle(elem);
        return {
          text: elem.textContent?.trim(),
          color: style.color,
          backgroundColor: style.backgroundColor,
          className: elem.className,
        };
      });
      return badges;
    });

    assert.ok(realRosterBadges.length > 0, "Real seeded roster must contain status badges");
    const activeBadge = realRosterBadges.find((b) => b.text === "Active");
    assert.ok(activeBadge, "Real seeded roster must contain Active badge");

    const activeContrast = getContrast(parseRgb(activeBadge.color), parseRgb(activeBadge.backgroundColor));
    registerProbe({
      probe: "real-seeded-roster-badge-light",
      activeText: activeBadge.text,
      activeColor: activeBadge.color,
      activeBg: activeBadge.backgroundColor,
      activeContrast: Number(activeContrast.toFixed(2)),
      passed: activeContrast >= 4.5 && activeBadge.text === EXPECTED_LABELS.en.active,
    });

    await recordScreenshot(page, "desktop-1440-light-roster.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Real seeded course roster in light theme showing production enrollment status badges",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "dark", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    const realRosterBadges = await page.evaluate(() => {
      const badges = Array.from(document.querySelectorAll('[data-testid="roster-row"] span.rounded-full')).map((elem) => {
        const style = window.getComputedStyle(elem);
        return {
          text: elem.textContent?.trim(),
          color: style.color,
          backgroundColor: style.backgroundColor,
          className: elem.className,
        };
      });
      return badges;
    });

    assert.ok(realRosterBadges.length > 0, "Real seeded roster must contain status badges in dark theme");
    const activeBadge = realRosterBadges.find((b) => b.text === "Active");
    assert.ok(activeBadge, "Real seeded roster must contain Active badge in dark theme");

    const activeContrast = getContrast(parseRgb(activeBadge.color), parseRgb(activeBadge.backgroundColor));
    registerProbe({
      probe: "real-seeded-roster-badge-dark",
      activeText: activeBadge.text,
      activeColor: activeBadge.color,
      activeBg: activeBadge.backgroundColor,
      activeContrast: Number(activeContrast.toFixed(2)),
      passed: activeContrast >= 4.5 && activeBadge.text === EXPECTED_LABELS.en.active,
    });

    await recordScreenshot(page, "desktop-1440-dark-roster.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "1440x1000",
      description: "Real seeded course roster in dark theme showing production enrollment status badges",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await page.goto(`${previewOrigin}/scripts/fixtures/enrollment-status.html?locale=en&theme=light`);
    await page.locator('[data-fixture="enrollment-status-badge-fixture"]').waitFor({ timeout: 15000 });

    const badgeData = await inspectFixtureBadges(page);
    assert.ok(badgeData.active && badgeData.withdrawn && badgeData.completed, "Fixture must render all three badges");

    const activeContrast = getContrast(parseRgb(badgeData.active.color), parseRgb(badgeData.active.backgroundColor));
    const withdrawnContrast = getContrast(parseRgb(badgeData.withdrawn.color), parseRgb(badgeData.withdrawn.backgroundColor));
    const completedContrast = getContrast(parseRgb(badgeData.completed.color), parseRgb(badgeData.completed.backgroundColor));

    const lightPassed =
      activeContrast >= 4.5 &&
      withdrawnContrast >= 4.5 &&
      completedContrast >= 4.5 &&
      badgeData.active.text === EXPECTED_LABELS.en.active &&
      badgeData.withdrawn.text === EXPECTED_LABELS.en.withdrawn &&
      badgeData.completed.text === EXPECTED_LABELS.en.completed;

    registerProbe({
      probe: "fixture-light-theme-contrast-and-labels",
      activeText: badgeData.active.text,
      activeColor: badgeData.active.color,
      activeBg: badgeData.active.backgroundColor,
      activeContrast: Number(activeContrast.toFixed(2)),
      withdrawnText: badgeData.withdrawn.text,
      withdrawnColor: badgeData.withdrawn.color,
      withdrawnBg: badgeData.withdrawn.backgroundColor,
      withdrawnContrast: Number(withdrawnContrast.toFixed(2)),
      completedText: badgeData.completed.text,
      completedColor: badgeData.completed.color,
      completedBg: badgeData.completed.backgroundColor,
      completedContrast: Number(completedContrast.toFixed(2)),
      passed: lightPassed,
    });

    await recordScreenshot(page, "desktop-1440-fixture-light.png", {
      theme: "light",
      locale: "en",
      viewport: "1440x900",
      description: "Actual React fixture rendering all three production EnrollmentStatusBadge statuses in light theme",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setupContext(context, { theme: "dark", lng: "en" });
    const page = await context.newPage();
    await page.goto(`${previewOrigin}/scripts/fixtures/enrollment-status.html?locale=en&theme=dark`);
    await page.locator('[data-fixture="enrollment-status-badge-fixture"]').waitFor({ timeout: 15000 });

    const badgeData = await inspectFixtureBadges(page);
    assert.ok(badgeData.active && badgeData.withdrawn && badgeData.completed, "Fixture must render all three badges in dark mode");

    const activeContrast = getContrast(parseRgb(badgeData.active.color), parseRgb(badgeData.active.backgroundColor));
    const withdrawnContrast = getContrast(parseRgb(badgeData.withdrawn.color), parseRgb(badgeData.withdrawn.backgroundColor));
    const completedContrast = getContrast(parseRgb(badgeData.completed.color), parseRgb(badgeData.completed.backgroundColor));

    const darkPassed =
      activeContrast >= 4.5 &&
      withdrawnContrast >= 4.5 &&
      completedContrast >= 4.5 &&
      badgeData.active.text === EXPECTED_LABELS.en.active &&
      badgeData.withdrawn.text === EXPECTED_LABELS.en.withdrawn &&
      badgeData.completed.text === EXPECTED_LABELS.en.completed;

    registerProbe({
      probe: "fixture-dark-theme-contrast-and-labels",
      activeText: badgeData.active.text,
      activeColor: badgeData.active.color,
      activeBg: badgeData.active.backgroundColor,
      activeContrast: Number(activeContrast.toFixed(2)),
      withdrawnText: badgeData.withdrawn.text,
      withdrawnColor: badgeData.withdrawn.color,
      withdrawnBg: badgeData.withdrawn.backgroundColor,
      withdrawnContrast: Number(withdrawnContrast.toFixed(2)),
      completedText: badgeData.completed.text,
      completedColor: badgeData.completed.color,
      completedBg: badgeData.completed.backgroundColor,
      completedContrast: Number(completedContrast.toFixed(2)),
      passed: darkPassed,
    });

    await recordScreenshot(page, "desktop-1440-fixture-dark.png", {
      theme: "dark",
      locale: "en",
      viewport: "1440x900",
      description: "Actual React fixture rendering all three production EnrollmentStatusBadge statuses in dark theme",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setupContext(context, { theme: "light", lng: "ru" });
    const page = await context.newPage();
    await page.goto(`${previewOrigin}/scripts/fixtures/enrollment-status.html?locale=ru&theme=light`);
    await page.locator('[data-fixture="enrollment-status-badge-fixture"]').waitFor({ timeout: 15000 });

    const badgeData = await inspectFixtureBadges(page);
    assert.ok(badgeData.active && badgeData.withdrawn && badgeData.completed, "Fixture must render all three badges in Russian");

    const ruPassed =
      badgeData.active.text === EXPECTED_LABELS.ru.active &&
      badgeData.withdrawn.text === EXPECTED_LABELS.ru.withdrawn &&
      badgeData.completed.text === EXPECTED_LABELS.ru.completed;

    registerProbe({
      probe: "fixture-russian-locale-labels",
      activeText: badgeData.active.text,
      withdrawnText: badgeData.withdrawn.text,
      completedText: badgeData.completed.text,
      expectedActive: EXPECTED_LABELS.ru.active,
      expectedWithdrawn: EXPECTED_LABELS.ru.withdrawn,
      expectedCompleted: EXPECTED_LABELS.ru.completed,
      passed: ruPassed,
    });

    await recordScreenshot(page, "desktop-1440-fixture-ru.png", {
      theme: "light",
      locale: "ru",
      viewport: "1440x900",
      description: "Actual React fixture rendering production EnrollmentStatusBadge in Russian locale",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setupContext(context, { theme: "light", lng: "tg" });
    const page = await context.newPage();
    await page.goto(`${previewOrigin}/scripts/fixtures/enrollment-status.html?locale=tg&theme=light`);
    await page.locator('[data-fixture="enrollment-status-badge-fixture"]').waitFor({ timeout: 15000 });

    const badgeData = await inspectFixtureBadges(page);
    assert.ok(badgeData.active && badgeData.withdrawn && badgeData.completed, "Fixture must render all three badges in Tajik");

    const tgPassed =
      badgeData.active.text === EXPECTED_LABELS.tg.active &&
      badgeData.withdrawn.text === EXPECTED_LABELS.tg.withdrawn &&
      badgeData.completed.text === EXPECTED_LABELS.tg.completed;

    registerProbe({
      probe: "fixture-tajik-locale-labels",
      activeText: badgeData.active.text,
      withdrawnText: badgeData.withdrawn.text,
      completedText: badgeData.completed.text,
      expectedActive: EXPECTED_LABELS.tg.active,
      expectedWithdrawn: EXPECTED_LABELS.tg.withdrawn,
      expectedCompleted: EXPECTED_LABELS.tg.completed,
      passed: tgPassed,
    });

    await recordScreenshot(page, "desktop-1440-fixture-tg.png", {
      theme: "light",
      locale: "tg",
      viewport: "1440x900",
      description: "Actual React fixture rendering production EnrollmentStatusBadge in Tajik locale",
    });

    await context.close();
  }

  await writeFile(`${taskDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  await writeFile(`${taskDir}/probes.json`, JSON.stringify(probes, null, 2));

  console.log(JSON.stringify({ success: true, screenshots: manifest.length, probes: probes.length }));
} finally {
  await browser.close();
}

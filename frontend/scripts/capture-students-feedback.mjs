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

const taskDir = resolve("../docs/redesign-execution/group-03/students-feedback/evidence");
const screenshotsDir = `${taskDir}/screenshots`;
await mkdir(screenshotsDir, { recursive: true });

const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
assert.ok(superadmin, "Superadmin fixture identity must be present");

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5199";
const apiOrigin = fixtures.api_origin;
const apiBase = `${apiOrigin}/api/v1`;

const loginResponse = await fetch(`${apiBase}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: superadmin.email, password: fixtures.password }),
});
assert.equal(loginResponse.status, 200);
const token = (await loginResponse.json()).access_token;

const seededNames = [
  ["Farrukh", "Saidov"], ["Dilnoza", "Karimova"], ["Rustam", "Nazarov"], ["Madina", "Yusupova"],
  ["Bahrom", "Qodirov-Abdurakhmonov"], ["Zarina", "Hakimova"], ["Sherzod", "Rahimov"], ["Nilufar", "Ismoilova"],
];
for (let index = 0; index < seededNames.length; index++) {
  const response = await fetch(`${apiBase}/users/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      email: `feedback.student.${index}.with.a.long.address.for.truncation@example.com`,
      first_name: seededNames[index][0],
      last_name: seededNames[index][1],
      phone: `+99290${String(1000100 + index).slice(0, 7)}`,
      parent_phone: index % 2 === 0 ? `+99293${String(2000100 + index).slice(0, 7)}` : null,
      role: "student",
      payment_day_of_month: index === 3 ? null : (index * 4) % 28 + 1,
    }),
  });
  assert.equal(response.status, 201, `seed student ${index}`);
}

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const SIMULATION_NOTE = "Chart series simulated via a staff-progress route fixture because preview data has fewer than two graded periods; profile data is real preview data.";
const probes = [];

function registerProbe(probe) {
  assert.ok(probe.passed, `Probe failed: ${JSON.stringify(probe)}`);
  probes.push(probe);
}

async function shot(page, filename, meta) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {})));
  });
  await page.screenshot({ path: `${screenshotsDir}/${filename}`, fullPage: meta.fullPage ?? false });
  manifest.push({ file: filename, ...meta });
}

async function open(width, height, theme) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  await context.addInitScript(({ theme }) => {
    localStorage.setItem("i18nextLng", "en");
    localStorage.setItem("theme", theme);
    localStorage.setItem("imkon_theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, { theme });
  const page = await context.newPage();
  await page.goto(`${previewOrigin}/login?redirect=${encodeURIComponent("/students")}`);
  await page.locator("#email").waitFor({ timeout: 15000 });
  await page.locator("#email").fill(superadmin.email);
  await page.locator("#password").fill(fixtures.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/students", { timeout: 30000 });
  await page.locator("h1").waitFor();
  return { context, page };
}

try {
  for (const theme of ["light", "dark"]) {
    const { context, page } = await open(1440, 1000, theme);
    await page.locator("table tbody tr[id^='student-row-']").first().waitFor({ timeout: 15000 });
    await shot(page, `students-1440-${theme}.png`, { viewport: "1440x1000", theme });

    if (theme === "light") {
      const rowHeight = await page.locator("table tbody tr").first().evaluate((row) => row.getBoundingClientRect().height);
      registerProbe({ probe: "desktop_row_height_56_to_64", passed: rowHeight >= 56 && rowHeight <= 64, rowHeight });
      const activePills = await page.locator("tbody tr").getByText(/^Active$/).count();
      registerProbe({ probe: "no_active_pill", passed: activePills === 0, activePills });
      const nested = await page.evaluate(() => {
        const scrollers = [...document.querySelectorAll("*")].filter((el) => {
          const style = getComputedStyle(el);
          return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1 && el !== document.documentElement && el !== document.body;
        });
        return scrollers.length;
      });
      registerProbe({ probe: "no_nested_vertical_scroll", passed: nested === 0, nested });
      const hasSelect = await page.locator("select").count();
      registerProbe({ probe: "no_native_select", passed: hasSelect === 0, hasSelect });

      const trigger = page.getByRole("button", { name: "Guardian phone" }).first();
      await trigger.hover();
      await page.getByRole("link", { name: /^\+99293/ }).first().waitFor({ timeout: 5000 });
      registerProbe({ probe: "guardian_popover_opens_on_hover", passed: true });
      await shot(page, "students-guardian-popover-1440-light.png", { viewport: "1440x1000", theme, state: "guardian popover open" });
      await page.mouse.move(5, 5);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: /Rows per page/ }).click();
      await page.getByRole("listbox", { name: "Rows per page" }).waitFor();
      await shot(page, "students-page-size-listbox-1440-light.png", { viewport: "1440x1000", theme, state: "page size listbox open" });
      await page.keyboard.press("Escape");
    }
    await context.close();
  }

  {
    const { context, page } = await open(390, 844, "light");
    await page.locator('[id^="student-card-"]').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    registerProbe({ probe: "mobile_no_horizontal_scroll", passed: overflow <= 0, overflow });
    registerProbe({ probe: "mobile_table_hidden", passed: await page.locator("table").isHidden() });
    await shot(page, "students-390-light.png", { viewport: "390x844", theme: "light" });
    await context.close();
  }

  const students = await (await fetch(`${apiBase}/students/?page=1&page_size=50`, { headers: { Authorization: `Bearer ${token}` } })).json();
  let target = null;
  for (const candidate of students.items) {
    const profile = await (await fetch(`${apiBase}/students/${candidate.id}/profile`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (profile.courses.length >= 2 && (!target || profile.courses.length > target.courses)) target = { id: candidate.id, courses: profile.courses.length };
  }
  assert.ok(target, "A student with at least two courses must exist in the preview data");
  const patch = await fetch(`${apiBase}/users/${target.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ phone: "+992901234567", parent_phone: "+992931234567" }),
  });
  assert.equal(patch.status, 200, "Setting a guardian phone must succeed");

  async function openProgress(width, height, theme, simulateGradedPeriods = true) {
    const { context, page } = await open(width, height, theme);
    if (simulateGradedPeriods) {
      await page.route("**/api/v1/courses/*/staff-progress", async (route) => {
        const courseId = Number(new URL(route.request().url()).pathname.split("/").at(-2));
        const base = 55 + (courseId % 5) * 7;
        const periods = Array.from({ length: 6 }, (_, index) => ({ id: courseId * 100 + index, period_label: `W${index + 1}`, period_start: `2026-02-${String(index * 7 + 1).padStart(2, "0")}`, period_end: `2026-02-${String(index * 7 + 7).padStart(2, "0")}` }));
        const results = periods.map((period, index) => ({ period_id: period.id, grading_state: "unknown", score: 1, max_score: 10, percentage: index === 5 ? null : Math.min(100, base + index * 6 + ((index * courseId) % 4) * 3 - 6) }));
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ course_id: courseId, periods, students: [{ student_id: target.id, first_name: "S", last_name: "F", grading_provenance: "unknown", period_results: results }] }) });
      });
    }
    await page.goto(`${previewOrigin}/students/${target.id}`);
    await page.locator("h1").waitFor({ timeout: 15000 });
    await page.getByRole("tab", { name: "Progress" }).click();
    await page.locator('[data-testid="student-progress-chart"], [data-testid="course-progress-row"]').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    return { context, page };
  }

  for (const theme of ["light", "dark"]) {
    const { context, page } = await openProgress(1440, 1000, theme);
    const chartVisible = await page.getByTestId("student-progress-chart").isVisible().catch(() => false);
    if (theme === "light") {
      registerProbe({ probe: "profile_progress_chart_visible", passed: chartVisible });
      const lines = await page.locator('[data-testid="student-chart-line"]').count();
      registerProbe({ probe: "profile_progress_one_line_per_course_with_data", passed: lines >= 1, lines });
      const rows = await page.getByTestId("course-progress-row").count();
      registerProbe({ probe: "profile_progress_course_rows", passed: rows === target.courses, rows, courses: target.courses });
      const pillCounts = await page.locator('[data-testid="course-progress-row"]').evaluateAll((rows) => rows.map((row) => row.querySelectorAll('[data-testid="course-stage-pill"]').length));
      registerProbe({ probe: "one_stage_pill_per_course", passed: pillCounts.every((count) => count === 1), pillCounts });
      const box = await page.getByTestId("student-progress-chart").boundingBox();
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
      await page.waitForTimeout(300);
      await shot(page, "student-profile-progress-hover-1440-light.png", { viewport: "1440x1000", theme, state: "crosshair tooltip", note: SIMULATION_NOTE });
      await page.mouse.move(5, 5);
    }
    await shot(page, `student-profile-progress-1440-${theme}.png`, { viewport: "1440x1000", theme, fullPage: true, note: SIMULATION_NOTE });
    await context.close();
  }

  {
    const { context, page } = await openProgress(1440, 1000, "light", false);
    registerProbe({ probe: "profile_progress_empty_state_explains_reason", passed: await page.getByText("Not enough graded periods").isVisible() });
    await shot(page, "student-profile-progress-empty-1440-light.png", { viewport: "1440x1000", theme: "light", state: "empty (real preview data)", fullPage: true });
    await context.close();
  }

  {
    const { context, page } = await openProgress(390, 844, "light");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    registerProbe({ probe: "profile_mobile_no_horizontal_scroll", passed: overflow <= 0, overflow });
    await shot(page, "student-profile-progress-390-light.png", { viewport: "390x844", theme: "light", fullPage: true, note: SIMULATION_NOTE });
    await context.close();
  }

  {
    const { context, page } = await open(1440, 1000, "light");
    await page.goto(`${previewOrigin}/students/${target.id}`);
    await page.locator("h1").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Guardian phone" }).hover();
    await page.getByRole("link", { name: "+992931234567" }).waitFor({ timeout: 5000 });
    await shot(page, "student-profile-guardian-popover-1440-light.png", { viewport: "1440x1000", theme: "light", state: "guardian popover open" });
    await context.close();
  }

  {
    const { context, page } = await open(1440, 1000, "light");
    await page.locator("table tbody tr").first().waitFor({ timeout: 15000 });
    const firstName = (await page.locator("table tbody tr").first().getByRole("link").first().innerText()).trim();
    await page.locator("table tbody tr").first().locator("td").nth(3).click();
    await page.waitForURL((url) => /^\/students\/\d+/.test(url.pathname), { timeout: 10000 });
    registerProbe({ probe: "row_click_opens_profile", passed: true, firstName });
    await context.close();
  }
} finally {
  await browser.close();
}

await writeFile(`${taskDir}/manifest.json`, JSON.stringify(manifest, null, 2));
await writeFile(`${taskDir}/probes.json`, JSON.stringify(probes, null, 2));
console.log(JSON.stringify({ screenshots: manifest.length, probes: probes.length }));

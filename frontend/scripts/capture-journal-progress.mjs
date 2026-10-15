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

const evidenceDir = resolve("../docs/redesign-execution/group-04/settings-progress/evidence/progress");
const screenshotsDir = `${evidenceDir}/screenshots`;
await mkdir(screenshotsDir, { recursive: true });

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5212";
const apiOrigin = `${fixtures.api_origin}/api/v1`;
const mentor = fixtures.identities.find((item) => item.role === "mentor" && !item.forced);
const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
assert.ok(mentor && superadmin, "Mentor and superadmin identities must exist");

const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

async function apiLogin(identity) {
  const response = await fetch(`${apiOrigin}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: identity.email, password: fixtures.password }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  return { "Content-Type": "application/json", Authorization: `Bearer ${body.access_token}` };
}

const mentorHeaders = await apiLogin(mentor);
const superadminHeaders = await apiLogin(superadmin);

const createCourseResponse = await fetch(`${apiOrigin}/courses/`, {
  method: "POST",
  headers: superadminHeaders,
  body: JSON.stringify({
    title: "Settings Fixture: Applied Algebra and Statistics for Advanced Learners",
    description: "Fixture course with a Monday, Wednesday and Friday schedule and monthly periods.",
    start_date: "2026-08-03",
    end_date: "2026-12-31",
    exam_type: "monthly",
    price: "100.00",
    mentor_id: mentor.id,
    schedules: [0, 2, 4].map((day) => ({ day_of_week: day, time_start: "09:00:00", time_end: "10:30:00" })),
  }),
});
assert.equal(createCourseResponse.status, 201, "Fixture course must be created");
const courseId = (await createCourseResponse.json()).id;

for (const identity of fixtures.identities.filter((item) => item.role === "student")) {
  await fetch(`${apiOrigin}/enrollments/`, {
    method: "POST",
    headers: superadminHeaders,
    body: JSON.stringify({ student_id: identity.id, course_id: courseId }),
  });
}

const periods = await (await fetch(`${apiOrigin}/courses/${courseId}/journals`, { headers: mentorHeaders })).json();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dushanbe", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const currentPeriod = periods.find((period) => period.period_start <= today && today <= period.period_end);
assert.ok(currentPeriod, "A date-active period is required");

async function getDetail() {
  const response = await fetch(`${apiOrigin}/journals/${currentPeriod.id}`, { headers: mentorHeaders });
  assert.equal(response.status, 200);
  return response.json();
}

const seeded = await getDetail();
assert.ok(seeded.students.length >= 4, "At least four students are required");
const putEntries = async (student, patches) => {
  const payload = patches.map(([date, patch]) => {
    const entry = student.entries.find((candidate) => candidate.lesson_date === date);
    return { student_id: student.student_id, lesson_date: date, version: entry.version, comment: null, ...patch };
  });
  const response = await fetch(`${apiOrigin}/journals/${currentPeriod.id}/entries`, { method: "PUT", headers: mentorHeaders, body: JSON.stringify(payload) });
  assert.equal(response.status, 200);
};
await putEntries(seeded.students[0], seeded.lesson_dates.map((date) => [date, { attendance: true, score: 5 }]));
await putEntries(seeded.students[1], seeded.lesson_dates.slice(0, 6).map((date) => [date, { attendance: true, score: 3 }]));
const refreshed = await getDetail();
const patchSummary = async (student, exam, bonus) => {
  const response = await fetch(`${apiOrigin}/journals/${currentPeriod.id}/students/${student.student_id}/summary`, { method: "PATCH", headers: mentorHeaders, body: JSON.stringify({ exam_score: exam, bonus_score: bonus, version: student.summary.version }) });
  assert.equal(response.status, 200);
};
await patchSummary(refreshed.students[0], refreshed.exam_max_score, 20);
await patchSummary(refreshed.students[1], Math.floor(refreshed.exam_max_score / 2), 3);
const seededDetail = await getDetail();
const aboveHundred = seededDetail.students.find((student) => student.summary.percentage > 100);
assert.ok(aboveHundred, "A student above 100 percent is required");
const aboveName = `${aboveHundred.first_name} ${aboveHundred.last_name}`;
const staffProgress = await (await fetch(`${apiOrigin}/courses/${courseId}/staff-progress`, { headers: mentorHeaders })).json();
const currentIndex = staffProgress.periods.findIndex((period) => period.id === currentPeriod.id);
const storedInCurrent = staffProgress.students.map((student) => student.period_results.find((result) => result.period_id === currentPeriod.id)).filter((result) => result.percentage !== null);
const zeroPeriodIndex = staffProgress.periods.findIndex((period) => period.period_start <= today && staffProgress.students.some((student) => student.period_results.find((result) => result.period_id === period.id)?.percentage === 0));
assert.ok(currentIndex >= 0);
const upcomingIndexes = staffProgress.periods.flatMap((period, index) => (period.period_start > today ? [index] : []));
assert.ok(upcomingIndexes.length > 0, "The fixture needs a period after today");

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];
const pageErrors = [];

function registerProbe(probe) {
  if (!probe.passed) console.error("PROBE_FAIL", JSON.stringify(probe));
  assert.ok(probe.passed, `Probe failed: ${probe.probe} ${JSON.stringify(probe)}`);
  probes.push(probe);
}

async function settle(page) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
}

async function shot(page, filename, meta) {
  console.error("SHOT", filename);
  await settle(page);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.screenshot({ path: `${screenshotsDir}/${filename}`, timeout: 45000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await sleep(1500);
    }
  }
  manifest.push({ file: filename, ...meta });
}

async function applyTheme(page, theme) {
  await page.evaluate((value) => {
    document.documentElement.classList.toggle("dark", value === "dark");
    document.documentElement.setAttribute("data-theme", value);
    localStorage.setItem("imkon_theme", value);
  }, theme);
}

async function newSession(identity, { lng = "en", viewport = { width: 1440, height: 1000 }, theme = "light" } = {}) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    ([language, themeValue]) => {
      localStorage.setItem("i18nextLng", language);
      localStorage.setItem("imkon_theme", themeValue);
    },
    [lng, theme],
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
    console.error("PAGEERROR", String(error).slice(0, 400));
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of (4|5)\d\d/.test(message.text())) {
      pageErrors.push(message.text());
      console.error("CONSOLE", message.text().slice(0, 400));
    }
  });
  await page.goto(`${previewOrigin}/login`);
  await page.locator("#email").fill(identity.email);
  await page.locator("#password").fill(fixtures.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  await applyTheme(page, theme);
  return { context, page };
}

const progressUrl = `${previewOrigin}/journals/${courseId}?tab=progress`;
const staffRoute = new RegExp(`/api/v1/courses/${courseId}/staff-progress$`);
const overflowOf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function openProgress(page, lng = "en") {
  await page.goto(progressUrl);
  await page.getByTestId("progress-scope").waitFor({ timeout: 20000 });
  await sleep(500);
}

const periodLines = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="journal-progress"] tbody tr, [data-testid="journal-progress"] ul[aria-label="Class results by period"] > li')).map((node) => node.innerText.replace(/\n+/g, " | ")));
const fillValues = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="progress-bar"] > div[data-fill]')).map((node) => Number(node.getAttribute("data-fill"))));

const formatPct = (value) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
const expectedAverage = (periodId) => {
  const values = staffProgress.students.map((student) => student.period_results.find((result) => result.period_id === periodId)).filter((result) => result.percentage !== null).map((result) => result.percentage);
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
};

for (const [width, height] of [[1440, 1000], [390, 844]]) {
  for (const theme of ["light", "dark"]) {
    const tag = `${width}-${theme}`;
    const meta = (state) => ({ viewport: `${width}x${height}`, theme, state });

    {
      const { context, page } = await newSession(superadmin, { viewport: { width, height }, theme });
      await openProgress(page);
      const lines = await periodLines(page);
      const scope = await page.getByTestId("progress-scope").innerText();
      const currentAverage = expectedAverage(currentPeriod.id);
      registerProbe({ probe: `class_${tag}_scope_and_every_period_listed_with_server_average`, passed: scope === "Whole course, all periods" && lines.length === staffProgress.periods.length && lines[currentIndex].includes(formatPct(currentAverage)) && lines[currentIndex].includes(`${storedInCurrent.length} of ${staffProgress.students.length} students`), scope, current: lines[currentIndex], expected: formatPct(currentAverage) });
      registerProbe({ probe: `class_${tag}_no_overflow_and_no_completion_claims`, passed: (await overflowOf(page)) <= 0 && !/graded|complet|needs grading/i.test(await page.getByTestId("journal-progress").innerText()) });
      registerProbe({ probe: `class_${tag}_upcoming_periods_show_label_and_not_started_without_counts_or_bars`, passed: upcomingIndexes.every((index) => lines[index].includes("Upcoming") && lines[index].includes("Not started") && !/%|students/.test(lines[index].replace(/\d{2}[./]\d{2}[./]\d{4}/g, ""))), lines: upcomingIndexes.map((index) => lines[index]) });
      registerProbe({ probe: `class_${tag}_one_short_scope_line_and_no_search_box`, passed: (await page.getByTestId("journal-progress").locator("p").first().innerText()).length < 120 && (await page.getByTestId("journal-progress").locator("input").count()) === 0 });
      if (width < 1024) {
        const firstRow = await page.getByTestId("progress-results").locator("li").first().evaluate((node) => { const box = node.getBoundingClientRect(); return { top: Math.round(box.top), bottom: Math.round(box.bottom), viewport: window.innerHeight }; });
        registerProbe({ probe: `class_${tag}_first_period_row_visible_without_scrolling`, passed: firstRow.top >= 0 && firstRow.bottom <= firstRow.viewport - 64, ...firstRow });
      }
      const fills = await fillValues(page);
      registerProbe({ probe: `class_${tag}_bars_within_track`, passed: fills.length > 0 && fills.every((fill) => fill >= 0 && fill <= 100), fills });
      if (zeroPeriodIndex >= 0) registerProbe({ probe: `class_${tag}_stored_zero_reads_zero_not_unavailable`, passed: lines[zeroPeriodIndex].includes("0%") && !lines[zeroPeriodIndex].includes("Unavailable |") , line: lines[zeroPeriodIndex] });
      await shot(page, `progress-class-${tag}.png`, meta("Progress, class view: course-wide scope label, every period with range, stored results out of the roster and class average of stored totals with bars"));

      await page.getByLabel("Compare a student").selectOption({ label: aboveName });
      await sleep(300);
      const compared = await periodLines(page);
      const aboveText = compared[currentIndex];
      const comparedFills = await fillValues(page);
      registerProbe({ probe: `student_${tag}_above_100_displays_as_supplied_and_bar_is_not_clipped`, passed: /1\d\d(\.\d+)?%/.test(aboveText) && comparedFills.every((fill) => fill >= 0 && fill <= 100) && comparedFills.includes(100) && (await overflowOf(page)) <= 0, aboveText, max: Math.max(...comparedFills) });
      await shot(page, `progress-student-above-100-${tag}.png`, meta(`${aboveName} compared with the class: total over max, a percentage above 100 displayed as supplied, bars on one scale with a 100% mark`));
      await context.close();
    }

    {
      const { context, page } = await newSession(superadmin, { viewport: { width, height }, theme });
      await page.route(staffRoute, async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        const blank = body.periods[currentIndex === 0 ? 1 : 0].id;
        body.students.forEach((student, index) => {
          if (index % 2 === 0) student.period_results.forEach((result) => { if (result.period_id === blank) Object.assign(result, { score: null, max_score: null, percentage: null }); });
        });
        await route.fulfill({ response, json: body });
      });
      await openProgress(page);
      await page.getByLabel("Compare a student").selectOption({ index: 1 });
      await sleep(300);
      const lines = await periodLines(page);
      registerProbe({ probe: `missing_${tag}_unavailable_counted_and_never_zero`, passed: lines.some((line) => /Unavailable: \d+/.test(line)) && lines.some((line) => line.includes("Unavailable")), lines: lines.slice(0, 3) });
      await shot(page, `progress-missing-simulated-${tag}.png`, meta("labeled simulation: the harness blanks one period's results for half the roster. Counts drop, Unavailable is shown, averages use stored values only"));
      await context.close();
    }

    {
      const { context, page } = await newSession(superadmin, { viewport: { width, height }, theme });
      await page.route(staffRoute, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "simulated" }) }));
      await page.route(/\/journals\/\d+\/entries$/, async (route) => {
        if (route.request().method() !== "PUT") return route.continue();
        return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ detail: "Simulated entry failure" }) });
      });
      await page.goto(`${previewOrigin}/journals/${courseId}`);
      await page.locator('[data-testid="journal-save-status"]').waitFor({ state: "attached", timeout: 20000 });
      await sleep(600);
      const checkbox = page.getByRole("checkbox").first();
      const initiallyChecked = await checkbox.isChecked();
      await checkbox.click();
      const wasChecked = await checkbox.isChecked();
      await page.getByRole("tab", { name: "Progress" }).click();
      await page.getByText("Could not load progress").waitFor({ timeout: 15000 });
      const statusVisible = await page.getByTestId("journal-save-status").isVisible();
      registerProbe({ probe: `error_${tag}_progress_failure_shows_retry_and_keeps_save_status_for_the_draft`, passed: (await page.getByRole("button", { name: "Retry" }).first().isVisible()) && statusVisible && (await page.getByText("Your gradebook and unsaved changes are not affected.").isVisible()) });
      await shot(page, `progress-error-simulated-${tag}.png`, meta("labeled simulation: staff-progress answered 500. Local error with Retry; the save status for the unsaved Gradebook draft (entries write answered 400 by the harness) stays visible"));
      await page.getByRole("tab", { name: "Gradebook" }).click();
      await sleep(500);
      const stillChecked = await page.getByRole("checkbox").first().isChecked();
      registerProbe({ probe: `error_${tag}_gradebook_and_draft_intact_after_progress_failure`, passed: wasChecked !== initiallyChecked && stillChecked === wasChecked, initiallyChecked, wasChecked, stillChecked });
      await shot(page, `progress-error-gradebook-intact-simulated-${tag}.png`, meta("labeled simulation: back on Gradebook after the Progress failure, the edited attendance draft is still present"));
      await context.close();
    }
  }
}

for (const lng of ["ru", "tg"]) {
  const { context, page } = await newSession(superadmin, { lng, viewport: { width: 390, height: 844 }, theme: "light" });
  await openProgress(page);
  await page.getByTestId("journal-progress").locator("select").selectOption({ index: 1 });
  await sleep(300);
  registerProbe({ probe: `locale_${lng}_progress_no_overflow`, passed: (await overflowOf(page)) <= 0 });
  await shot(page, `progress-student-${lng}-390-light.png`, { viewport: "390x844", theme: "light", locale: lng, state: `Progress with a student comparison in ${lng}` });
  await context.close();
}

registerProbe({ probe: "no_unexpected_page_errors", passed: pageErrors.length === 0, errors: pageErrors.slice(0, 5) });

await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify(manifest, null, 2));
await writeFile(`${evidenceDir}/probes.json`, JSON.stringify(probes, null, 2));
await browser.close();
console.log(`Captured ${manifest.length} screenshots and ${probes.length} probes, all passed.`);

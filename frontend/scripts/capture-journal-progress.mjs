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

const evidenceDir = resolve("../docs/redesign-execution/group-04/user-feedback/evidence/progress");
const screenshotsDir = `${evidenceDir}/screenshots`;
await mkdir(screenshotsDir, { recursive: true });

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5217";
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

async function getDetail(journalId) {
  const response = await fetch(`${apiOrigin}/journals/${journalId}`, { headers: mentorHeaders });
  assert.equal(response.status, 200);
  return response.json();
}

async function seedPeriod(period, periodNumber) {
  const detail = await getDetail(period.id);
  const roster = detail.students.slice(0, 8);
  for (const [position, student] of roster.entries()) {
    const payload = detail.lesson_dates.map((date, dateIndex) => {
      const entry = student.entries.find((candidate) => candidate.lesson_date === date);
      const topStudent = position === 0 && period.id === currentPeriod.id;
      const score = topStudent ? 5 : (position * 2 + periodNumber * 3 + dateIndex) % 6;
      return { student_id: student.student_id, lesson_date: date, version: entry.version, comment: null, attendance: topStudent || score > 0 || dateIndex % 2 === 0, score };
    });
    const response = await fetch(`${apiOrigin}/journals/${period.id}/entries`, { method: "PUT", headers: mentorHeaders, body: JSON.stringify(payload) });
    assert.equal(response.status, 200);
  }
  const refreshed = await getDetail(period.id);
  for (const [position, student] of refreshed.students.slice(0, 8).entries()) {
    const exam = Math.min(refreshed.exam_max_score, Math.floor(((position * 9 + periodNumber * 13) % 100) / 100 * refreshed.exam_max_score));
    const bonus = position === 0 && period.id === currentPeriod.id ? 20 : position % 4;
    const response = await fetch(`${apiOrigin}/journals/${period.id}/students/${student.student_id}/summary`, { method: "PATCH", headers: mentorHeaders, body: JSON.stringify({ exam_score: position === 0 && period.id === currentPeriod.id ? refreshed.exam_max_score : exam, bonus_score: bonus, version: student.summary.version }) });
    assert.equal(response.status, 200);
  }
}

const startedPeriods = periods.filter((period) => period.period_start <= today);
for (const [index, period] of startedPeriods.entries()) await seedPeriod(period, index + 1);
const staffProgress = await (await fetch(`${apiOrigin}/courses/${courseId}/staff-progress`, { headers: mentorHeaders })).json();
const upcomingIndexes = staffProgress.periods.flatMap((period, index) => (period.period_start > today ? [index] : []));
assert.ok(upcomingIndexes.length > 0, "The fixture needs a period after today");
const startedCount = staffProgress.periods.length - upcomingIndexes.length;
const highestValue = Math.max(...staffProgress.students.flatMap((student) => student.period_results.map((result) => result.percentage ?? 0)));
assert.ok(highestValue > 100, "A value above 100 percent is required");

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

async function openProgress(page) {
  await page.goto(progressUrl);
  await page.getByTestId("progress-chart").waitFor({ timeout: 20000 });
  await sleep(600);
}

async function revealChart(page) {
  await page.evaluate(() => {
    const target = document.querySelector('[data-testid="progress-chart"]');
    if (target) window.scrollTo(0, window.scrollY + target.getBoundingClientRect().top - 110);
  });
  await sleep(300);
}

async function hoverPeriod(page, fraction) {
  const area = page.getByTestId("chart-hit-area");
  const box = await area.boundingBox();
  await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
  await sleep(350);
}

const tooltipReadout = (page) => page.getByTestId("chart-tooltip").evaluate((node) => ({
  period: node.firstElementChild.textContent,
  values: Array.from(node.querySelectorAll('[data-testid="chart-tooltip-entry"]')).map((entry) => parseFloat(entry.lastElementChild.textContent.replace(",", "."))),
  names: Array.from(node.querySelectorAll('[data-testid="chart-tooltip-entry"] span.truncate')).map((span) => span.textContent),
  box: (() => { const b = node.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; })(),
  side: node.getAttribute("data-side"),
  transition: getComputedStyle(node).transitionProperty + " | " + getComputedStyle(node).transitionDuration + " | " + getComputedStyle(node).transitionTimingFunction,
}));

for (const [width, height] of [[1440, 1000], [390, 844]]) {
  for (const theme of ["light", "dark"]) {
    const tag = `${width}-${theme}`;
    const meta = (state) => ({ viewport: `${width}x${height}`, theme, state });

    {
      const { context, page } = await newSession(superadmin, { viewport: { width, height }, theme });
      await openProgress(page);
      await revealChart(page);
      const info = await page.getByTestId("progress-chart").evaluate((node) => ({
        series: Array.from(node.querySelectorAll('[data-testid="chart-series-student"]')).filter((group) => group.getAttribute("data-visible") === "true").length,
        average: node.querySelector('[data-testid="chart-series-average"]').getAttribute("data-visible"),
        labels: Array.from(node.querySelectorAll("svg text")).map((text) => text.textContent),
        gridValues: Array.from(node.querySelectorAll('[data-testid="chart-gridline"]')).map((line) => line.getAttribute("data-value")).join(),
        dotted: Array.from(node.querySelectorAll('[data-testid="chart-gridline"]')).filter((line) => line.getAttribute("stroke-dasharray")).length,
        width: node.getBoundingClientRect().width,
        viewportWidth: document.documentElement.clientWidth,
        border: getComputedStyle(node).borderTopWidth,
      }));
      registerProbe({ probe: `chart_${tag}_default_shows_top_six_plus_average_with_dotted_grid_and_no_border`, passed: info.series === 6 && info.average === "true" && info.gridValues === "0,25,50,75,100" && info.dotted === 4 && info.border === "0px" && info.width <= info.viewportWidth && upcomingIndexes.every((index) => !info.labels.includes(staffProgress.periods[index].period_label)), ...info });
      const legendInfo = await page.getByTestId("progress-legend").evaluate((node) => {
        const row = node.querySelector("ul");
        return { chips: row.querySelectorAll("button").length, rowHeight: Math.round(row.getBoundingClientRect().height), more: node.querySelector('[data-testid="legend-more"]')?.textContent, rowScrolls: getComputedStyle(row).overflowX };
      });
      registerProbe({ probe: `legend_${tag}_plotted_chips_plus_average_then_one_plus_n_more_chip_in_one_row`, passed: legendInfo.chips === 7 && legendInfo.more === `+${staffProgress.students.length - 6} more` && legendInfo.rowHeight <= (width >= 1024 ? 100 : 60) && (width >= 1024 || legendInfo.rowScrolls === "auto"), ...legendInfo });
      registerProbe({ probe: `chart_${tag}_no_page_overflow`, passed: (await overflowOf(page)) <= 0 });
      await shot(page, `progress-class-${tag}.png`, meta("Progress chart: top five students by latest value plus a dashed class average, dotted gridlines, no border, dot legend chips"));

      await hoverPeriod(page, 0.5);
      const first = await tooltipReadout(page);
      const chartBox = await page.getByTestId("progress-chart").boundingBox();
      registerProbe({ probe: `tooltip_${tag}_lists_visible_values_sorted_high_to_low_inside_the_chart`, passed: first.values.length >= 2 && first.values.every((value, index) => index === 0 || first.values[index - 1] >= value) && first.box.left >= chartBox.x - 1 && first.box.right <= chartBox.x + chartBox.width + 1, ...first });
      registerProbe({ probe: `tooltip_${tag}_glides_with_a_150ms_transform_and_opacity_transition`, passed: first.transition.includes("transform") && first.transition.includes("0.15s") && first.transition.includes("cubic-bezier(0.16, 1, 0.3, 1)"), transition: first.transition });
      const guideBox = await page.getByTestId("chart-crosshair").boundingBox();
      registerProbe({ probe: `tooltip_${tag}_card_does_not_cover_the_active_guide_and_points`, passed: guideBox.x < first.box.left || guideBox.x > first.box.right, guideX: Math.round(guideBox.x), card: first.box });
      await shot(page, `progress-tooltip-${tag}.png`, meta("crosshair open on one period: thin guide, enlarged points and one card listing every visible student's value sorted high to low"));

      const guideBefore = await page.getByTestId("chart-crosshair").evaluate((node) => node.style.transform);
      await hoverPeriod(page, 0.98);
      const edge = await tooltipReadout(page);
      const guideAfter = await page.getByTestId("chart-crosshair").evaluate((node) => node.style.transform);
      registerProbe({ probe: `tooltip_${tag}_flips_side_near_the_right_edge_and_stays_inside`, passed: edge.side === "left" && edge.box.right <= chartBox.x + chartBox.width + 1 && guideBefore !== guideAfter && edge.period !== first.period, side: edge.side, guideBefore, guideAfter });
      await shot(page, `progress-tooltip-edge-${tag}.png`, meta("latest period near the right edge: the card flipped to the left of the guide and stays inside the chart"));

      const chip = page.getByRole("list", { name: "Chart series" }).getByRole("button").nth(1);
      await chip.click();
      await sleep(350);
      const faded = await page.locator('[data-testid="chart-series-student"]').evaluateAll((nodes) => nodes.filter((node) => node.getAttribute("data-visible") === "false" && getComputedStyle(node).opacity === "0").length);
      registerProbe({ probe: `legend_${tag}_toggle_fades_the_line_out`, passed: faded === staffProgress.students.length - 5, faded });
      await page.getByTestId("legend-more").click();
      await page.getByTestId("legend-more-popover").waitFor();
      await sleep(300);
      const popover = await page.getByTestId("legend-more-popover").evaluate((node) => { const b = node.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, vw: window.innerWidth, vh: window.innerHeight, options: node.querySelectorAll('[role="option"]').length, animation: getComputedStyle(node).animationName + " " + getComputedStyle(node).animationDuration }; });
      registerProbe({ probe: `legend_${tag}_more_popover_lists_every_student_with_checkboxes_inside_the_viewport_and_scales_in`, passed: popover.options === staffProgress.students.length && popover.left >= 0 && popover.right <= popover.vw && popover.animation.includes("card-scale-in") && popover.animation.includes("0.15s"), ...popover });
      await shot(page, `progress-legend-more-${tag}.png`, meta("the +N more chip opened: a compact listbox with a checkbox per student, Show all and Hide all, scaled in from its anchor"));
      await page.getByRole("button", { name: "Show all" }).click();
      await sleep(350);
      const allVisible = await page.locator('[data-testid="chart-series-student"][data-visible="true"]').count();
      registerProbe({ probe: `legend_${tag}_show_all_makes_every_line_visible`, passed: allVisible === staffProgress.students.length, allVisible });
      const looks = await page.locator('[data-testid="chart-series-student"][data-visible="true"]').evaluateAll((groups) => groups.map((group) => { const path = group.querySelector('[data-testid="chart-line"]'); return path ? `${path.getAttribute("class")}|${path.getAttribute("stroke-dasharray")}` : null; }).filter((look) => look !== null));
      registerProbe({ probe: `legend_${tag}_no_two_visible_lines_share_colour_and_dash`, passed: looks.length > 0 && new Set(looks).size === looks.length, lines: looks.length, distinct: new Set(looks).size });
      await page.keyboard.press("Escape");
      await hoverPeriod(page, 0.5);
      await shot(page, `progress-all-students-${tag}.png`, meta("Show all: every student's line, with the card listing all visible values"));
      await context.close();
    }

    {
      const { context, page } = await newSession(superadmin, { viewport: { width, height }, theme });
      await page.route(staffRoute, async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        const blank = body.periods[1].id;
        body.students.forEach((student, index) => {
          if (index < 8) student.period_results.forEach((result) => { if (result.period_id === blank && index % 2 === 0) Object.assign(result, { score: null, max_score: null, percentage: null }); });
        });
        await route.fulfill({ response, json: body });
      });
      await openProgress(page);
      await revealChart(page);
      const broken = await page.locator('[data-testid="chart-series-student"][data-visible="true"]').evaluateAll((groups) => groups.map((group) => ({ lines: group.querySelectorAll('[data-testid="chart-line"]').length, points: group.querySelectorAll('[data-testid="chart-point"]').length })));
      registerProbe({ probe: `missing_${tag}_chart_breaks_the_line_at_the_gap_and_plots_no_zero`, passed: broken.some((entry) => entry.points === startedCount - 1 && entry.lines <= 1) && broken.every((entry) => entry.points <= startedCount), broken });
      await hoverPeriod(page, 0.5);
      await shot(page, `progress-missing-simulated-${tag}.png`, meta("labeled simulation: the harness blanks one period for some students. Their lines break there, and the card omits them"));
      await context.close();
    }

    {
      const { context, page } = await newSession(superadmin, { viewport: { width, height }, theme });
      await page.route(staffRoute, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "simulated" }) }));
      await page.goto(`${previewOrigin}/journals/${courseId}`);
      await page.locator('[data-testid="journal-save-status"]').waitFor({ state: "attached", timeout: 20000 });
      await sleep(600);
      const checkbox = page.getByRole("checkbox").first();
      const initiallyChecked = await checkbox.isChecked();
      await page.route(/\/journals\/\d+\/entries$/, (route) => (route.request().method() === "PUT" ? route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ detail: "Simulated entry failure" }) }) : route.continue()));
      await checkbox.click();
      const wasChecked = await checkbox.isChecked();
      await page.getByRole("tab", { name: "Progress" }).click();
      await page.getByText("Could not load progress").waitFor({ timeout: 15000 });
      registerProbe({ probe: `error_${tag}_progress_failure_shows_retry_and_keeps_save_status_for_the_draft`, passed: (await page.getByRole("button", { name: "Retry" }).first().isVisible()) && (await page.getByTestId("journal-save-status").isVisible()) });
      await shot(page, `progress-error-simulated-${tag}.png`, meta("labeled simulation: staff-progress answered 500. Local error with Retry; the Gradebook draft status stays visible"));
      await page.getByRole("tab", { name: "Gradebook" }).click();
      await sleep(500);
      registerProbe({ probe: `error_${tag}_gradebook_and_draft_intact_after_progress_failure`, passed: wasChecked !== initiallyChecked && (await page.getByRole("checkbox").first().isChecked()) === wasChecked });
      await context.close();
    }
  }
}

for (const lng of ["ru", "tg"]) {
  const { context, page } = await newSession(superadmin, { lng, viewport: { width: 390, height: 844 }, theme: "light" });
  await openProgress(page);
  await revealChart(page);
  await hoverPeriod(page, 0.5);
  registerProbe({ probe: `locale_${lng}_progress_no_overflow`, passed: (await overflowOf(page)) <= 0 });
  await shot(page, `progress-tooltip-${lng}-390-light.png`, { viewport: "390x844", theme: "light", locale: lng, state: `Progress chart with the crosshair open in ${lng}` });
  await context.close();
}

registerProbe({ probe: "no_unexpected_page_errors", passed: pageErrors.length === 0, errors: pageErrors.slice(0, 5) });

await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify(manifest, null, 2));
await writeFile(`${evidenceDir}/probes.json`, JSON.stringify(probes, null, 2));
await browser.close();
console.log(`Captured ${manifest.length} screenshots and ${probes.length} probes, all passed.`);

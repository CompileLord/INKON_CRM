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

const evidenceDir = resolve("../docs/redesign-execution/group-04/summary/evidence");
const screenshotsDir = `${evidenceDir}/screenshots`;
await mkdir(screenshotsDir, { recursive: true });

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5211";
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
    title: "Workspace Fixture: Applied Algebra and Statistics for Advanced Learners",
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

const studentIdentities = fixtures.identities.filter((item) => item.role === "student");
let enrolledCount = 0;
for (const identity of studentIdentities) {
  const response = await fetch(`${apiOrigin}/enrollments/`, {
    method: "POST",
    headers: superadminHeaders,
    body: JSON.stringify({ student_id: identity.id, course_id: courseId }),
  });
  if (response.status === 201) enrolledCount += 1;
}

const periods = await (await fetch(`${apiOrigin}/courses/${courseId}/journals`, { headers: mentorHeaders })).json();
const orderedPeriods = [...periods].sort((a, b) => a.period_start.localeCompare(b.period_start));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dushanbe", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const currentPeriod = orderedPeriods.find((period) => period.period_start <= today && today <= period.period_end);
assert.ok(currentPeriod, "A date-active period is required");
const previousPeriod = orderedPeriods[orderedPeriods.indexOf(currentPeriod) - 1];
assert.ok(previousPeriod, "A previous period is required");

async function getDetail(journalId, headers = mentorHeaders) {
  const response = await fetch(`${apiOrigin}/journals/${journalId}`, { headers });
  assert.equal(response.status, 200);
  return response.json();
}

const currentDetail = await getDetail(currentPeriod.id);
assert.ok(currentDetail.students.length >= 4, `A roster of at least four students is required (newly enrolled ${enrolledCount}, roster ${currentDetail.students.length})`);
const dates = currentDetail.lesson_dates;
assert.ok(dates.length >= 8, "Eight or more lesson dates are required for horizontal scrolling");
const sortedDates = [...dates].sort();
const expectedLesson = sortedDates.includes(today) ? today : [...sortedDates].reverse().find((date) => date <= today) ?? sortedDates[0];
const firstStudent = currentDetail.students[0];
const secondStudent = currentDetail.students[1];

async function seedSummaries() {
  const detail = await getDetail(currentPeriod.id);
  const lessonDatesAll = detail.lesson_dates;
  const [high, partial] = detail.students;
  const putEntries = async (student, patches) => {
    const payload = patches.map(([date, patch]) => {
      const entry = student.entries.find((candidate) => candidate.lesson_date === date);
      return { student_id: student.student_id, lesson_date: date, version: entry.version, comment: null, ...patch };
    });
    const response = await fetch(`${apiOrigin}/journals/${currentPeriod.id}/entries`, { method: "PUT", headers: mentorHeaders, body: JSON.stringify(payload) });
    assert.equal(response.status, 200);
  };
  await putEntries(high, lessonDatesAll.map((date) => [date, { attendance: true, score: 5 }]));
  await putEntries(partial, lessonDatesAll.slice(0, 6).map((date, index) => [date, { attendance: true, score: 3, ...(index === 0 ? { comment: "Needs extra practice with fractions before the next exam." } : {}) }]));
  const refreshed = await getDetail(currentPeriod.id);
  const patchSummary = async (student, exam, bonus) => {
    const response = await fetch(`${apiOrigin}/journals/${currentPeriod.id}/students/${student.student_id}/summary`, { method: "PATCH", headers: mentorHeaders, body: JSON.stringify({ exam_score: exam, bonus_score: bonus, version: student.summary.version }) });
    assert.equal(response.status, 200);
  };
  await patchSummary(refreshed.students[0], refreshed.exam_max_score, 20);
  await patchSummary(refreshed.students[1], Math.floor(refreshed.exam_max_score / 2), 3);
}
await seedSummaries();
const seededDetail = await getDetail(currentPeriod.id);
const aboveHundred = seededDetail.students.find((student) => student.summary.percentage > 100);
assert.ok(aboveHundred, "A student above 100 percent is required");
const aboveHundredName = `${aboveHundred.first_name} ${aboveHundred.last_name}`;

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

async function shot(page, filename, meta, options = {}) {
  console.error("SHOT", filename);
  if (!options.immediate) await settle(page);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.screenshot({ path: `${screenshotsDir}/${filename}`, fullPage: Boolean(options.fullPage), timeout: 45000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      console.error("SHOT_RETRY", filename, String(error).slice(0, 120));
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

const writeLogs = [];

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
  const writes = [];
  writeLogs.push(writes);
  await page.route(/\/journals\/\d+\/(entries|students\/\d+\/summary)$/, async (route) => {
    const request = route.request();
    if (request.method() !== "PUT" && request.method() !== "PATCH") {
      await route.continue();
      return;
    }
    const record = { kind: request.method() === "PUT" ? "entries" : "summary", body: JSON.parse(request.postData() ?? "null"), url: request.url() };
    writes.push(record);
    if (page.holdWritesMilliseconds) await sleep(page.holdWritesMilliseconds);
    const response = await route.fetch();
    record.status = response.status();
    await route.fulfill({ response });
  });
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
  return { context, page, writes };
}

async function openWorkspace(page, query = "") {
  await page.goto(`${previewOrigin}/journals/${courseId}${query}`);
  await page.locator('[data-testid="journal-grid-region"]').waitFor({ state: "visible", timeout: 20000 });
  await page.locator('[data-testid="journal-grid-skeleton"]').waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  await sleep(300);
}

const phaseOf = (page) => page.locator('[data-testid="journal-save-status"]').getAttribute("data-phase");
async function waitForPhase(page, phase, timeout = 15000) {
  await page.waitForFunction(
    (expected) => document.querySelector('[data-testid="journal-save-status"]')?.getAttribute("data-phase") === expected,
    phase,
    { timeout },
  );
}

const nameOf = (student) => `${student.first_name} ${student.last_name}`;

async function measureDocumentOverflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

process.on("uncaughtException", async (error) => {
  console.error(String(error));
  for (const context of browser.contexts()) {
    for (const [index, openPage] of context.pages().entries()) {
      await openPage.screenshot({ path: `/tmp/kitob-workspace-failure-${index}.png` }).catch(() => {});
    }
  }
  process.exit(1);
});

async function openSummary(page, extra = "") {
  await page.goto(`${previewOrigin}/journals/${courseId}?view=summary${extra}`);
  const anchor = extra.includes("student=") ? "#journal-breakdown-heading" : '[aria-label^="Student totals"], [aria-label^="Итоги"], [aria-label^="Натиҷаҳои"]';
  await page.locator(anchor).first().waitFor({ state: "visible", timeout: 20000 });
  await sleep(400);
}

const overflowOf = async (page) => {
  const result = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const offenders = overflow > 0 ? Array.from(document.querySelectorAll("body *")).filter((node) => node.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 6).map((node) => `${node.tagName}.${String(node.className).slice(0, 80)}`) : [];
    return { overflow, offenders };
  });
  if (result.overflow > 0) console.error("OFFENDERS", JSON.stringify(result.offenders));
  return result.overflow;
};

for (const [width, height] of [[1440, 1000], [1024, 900], [390, 844]]) {
  for (const theme of ["light", "dark"]) {
    const { context, page } = await newSession(superadmin, { viewport: { width, height }, theme });
    await openSummary(page);
    const overflow = await overflowOf(page);
    const text = await page.locator("main, body").first().innerText();
    registerProbe({ probe: `summary_${width}_${theme}_no_overflow_and_percentage_above_100_as_supplied`, passed: overflow <= 0 && /\b1[0-9]{2}\.[0-9]{1,2}%/.test(text), overflow, sample: text.match(/\b1[0-9]{2}\.[0-9]{1,2}%/)?.[0] });
    if (width >= 1024) {
      const headings = await page.locator("table th[scope='col']").allInnerTexts();
      const editBox = await page.locator("[data-summary-edit]").first().evaluate((node) => { const b = node.getBoundingClientRect(); return { height: Math.round(b.height), border: getComputedStyle(node).borderTopWidth, text: node.textContent }; });
      registerProbe({ probe: `summary_table_${width}_${theme}_edit_action_is_a_quiet_ghost`, passed: editBox.height >= 44 && editBox.border === "0px" && editBox.text === "Edit", ...editBox });
      registerProbe({ probe: `summary_table_columns_${width}_${theme}`, passed: ["Students", "Homework", "Attendance", "Exam", "Bonus", "Total / max", "%"].every((heading) => headings.includes(heading)), headings });
    } else {
      const pairs = await page.locator("li dl").first().innerText();
      const gap = await page.evaluate(() => {
        const group = document.querySelector('[role="group"][aria-label]');
        const search = document.querySelector('input[type="search"]');
        return { band: Boolean(document.querySelector('[data-testid="journal-lesson-band"]')), gap: Math.round(search.getBoundingClientRect().top - group.getBoundingClientRect().bottom) };
      });
      registerProbe({ probe: `summary_390_${theme}_collapses_the_empty_lesson_band`, passed: !gap.band && gap.gap <= 16, ...gap });
      const editBox = await page.locator("[data-summary-edit]").first().evaluate((node) => { const b = node.getBoundingClientRect(); const cs = getComputedStyle(node); return { width: Math.round(b.width), height: Math.round(b.height), border: cs.borderTopWidth, text: node.textContent }; });
      registerProbe({ probe: `summary_390_${theme}_edit_action_is_a_compact_borderless_ghost`, passed: editBox.height >= 44 && editBox.width < 200 && editBox.border === "0px" && editBox.text === "Edit", ...editBox });
      registerProbe({ probe: `summary_narrow_rows_have_labeled_pairs_${theme}`, passed: ["Homework", "Attendance", "Exam", "Bonus"].every((label) => pairs.includes(label)), pairs: pairs.replace(/\n/g, " ") });
    }
    await shot(page, `superadmin-summary-${width}-${theme}.png`, { viewport: `${width}x${height}`, theme, state: width >= 1024 ? "Summary table with a student above 100 percent" : "Summary divided rows with labeled component pairs" });
    await context.close();
  }
}

{
  const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await openGridChecks(page);
  await context.close();
}

async function openGridChecks(page) {
  await openWorkspace(page);
  const textboxes = await page.locator("tbody input[type='text']").count();
  const headers = await page.locator("thead th").allInnerTexts();
  registerProbe({ probe: "desktop_grid_has_no_inline_bonus_or_exam_inputs", passed: textboxes === 0 && !headers.some((header) => /^(Bonus|Exam)/.test(header)), textboxes, headers });
}

{
  const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await openSummary(page);
  let journalRequests = 0;
  page.on("request", (request) => {
    if (/\/api\/v1\/(journals|students|enrollments)\//.test(request.url()) && request.method() === "GET") journalRequests += 1;
  });
  const opener = page.getByRole("button", { name: `Open breakdown for ${aboveHundredName}` });
  await opener.focus();
  await opener.click();
  await page.getByRole("button", { name: "Back to summary" }).waitFor();
  await page.getByRole("button", { name: "How this total is calculated" }).click();
  await sleep(300);
  registerProbe({ probe: "breakdown_opens_in_place_without_requests", passed: journalRequests === 0, journalRequests });
  const disclosure = await page.locator("[id]", { hasText: "Percentage =" }).last().innerText();
  const apiDetail = await getDetail(currentPeriod.id);
  const apiSummary = apiDetail.students.find((student) => student.student_id === aboveHundred.student_id).summary;
  registerProbe({ probe: "disclosure_values_match_server_summary", passed: disclosure.includes(String(apiSummary.sum_score)) && disclosure.includes(String(apiSummary.max_period_score)) && disclosure.includes(`Homework ${apiSummary.homework_score}`), disclosure: disclosure.replace(/\n/g, " | "), apiSummary });
  registerProbe({ probe: "view_profile_is_shown_for_superadmin", passed: await page.getByRole("link", { name: "View profile" }).isVisible() });
  await shot(page, "superadmin-breakdown-disclosure-1440-light.png", { viewport: "1440x1000", theme: "light", state: "student breakdown in place with the calculation disclosure open and View profile shown" });
  await page.getByRole("button", { name: "Back to summary" }).click();
  await sleep(400);
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-summary-open"));
  registerProbe({ probe: "back_restores_focus_to_the_initiating_row", passed: focused === String(aboveHundred.student_id), focused });
  await context.close();
}

{
  const { context, page } = await newSession(superadmin, { viewport: { width: 390, height: 844 }, theme: "dark" });
  await openSummary(page, `&student=${aboveHundred.student_id}`);
  await page.getByRole("button", { name: "How this total is calculated" }).click();
  await sleep(300);
  const overflow = await overflowOf(page);
  registerProbe({ probe: "breakdown_390_dark_no_overflow", passed: overflow <= 0, overflow });
  await shot(page, "superadmin-breakdown-390-dark.png", { viewport: "390x844", theme: "dark", state: "breakdown on a phone with the disclosure open" });
  await context.close();
}

{
  const { context, page, writes } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await openSummary(page);
  const target = seededDetail.students[1];
  const targetName = `${target.first_name} ${target.last_name}`;
  await page.getByRole("button", { name: `Edit exam and bonus for ${targetName}` }).click();
  const dialog = page.getByRole("dialog", { name: /Edit exam and bonus/ });
  await dialog.waitFor();
  await sleep(300);
  const box = await dialog.boundingBox();
  const fontSize = await dialog.getByLabel("Bonus").evaluate((node) => getComputedStyle(node).fontSize);
  registerProbe({ probe: "editor_is_bounded_with_16px_inputs_and_disabled_apply_when_pristine", passed: box.width <= 480 && fontSize === "16px" && (await dialog.getByRole("button", { name: "Apply" }).isDisabled()), width: box.width, fontSize });
  await shot(page, "superadmin-editor-pristine-1440-light.png", { viewport: "1440x1000", theme: "light", state: "paired exam and bonus editor, pristine" });
  await dialog.getByLabel("Bonus").fill("21");
  await dialog.getByLabel("Exam").fill("");
  const invalid = await dialog.locator("[role='alert']").allInnerTexts();
  registerProbe({ probe: "editor_rejects_invalid_values_inline_and_disables_apply", passed: invalid.length === 2 && (await dialog.getByRole("button", { name: "Apply" }).isDisabled()) && (await dialog.getByLabel("Exam").inputValue()) === "", invalid });
  await shot(page, "superadmin-editor-invalid-1440-light.png", { viewport: "1440x1000", theme: "light", state: "bonus above 20 and an empty exam rejected inline; nothing zeroed or clamped" });
  await dialog.getByLabel("Bonus").fill("9");
  await dialog.getByLabel("Exam").fill("30");
  const mark = writes.length;
  await dialog.getByRole("button", { name: "Apply" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="journal-save-status"]')?.getAttribute("data-phase") === "saved", null, { timeout: 15000 });
  const summaryWrites = writes.slice(mark).filter((write) => write.kind === "summary");
  const persisted = (await getDetail(currentPeriod.id)).students[1].summary;
  registerProbe({ probe: "apply_queues_one_paired_write_that_persists_both_values", passed: summaryWrites.length === 1 && summaryWrites[0].body.bonus_score === 9 && summaryWrites[0].body.exam_score === 30 && persisted.bonus_score === 9 && persisted.exam_score === 30, body: summaryWrites[0]?.body, persisted: { bonus: persisted.bonus_score, exam: persisted.exam_score } });
  const focusedEdit = await page.evaluate(() => document.activeElement?.getAttribute("data-summary-edit"));
  registerProbe({ probe: "apply_returns_focus_to_that_students_edit_action", passed: focusedEdit === String(target.student_id), focusedEdit });
  await context.close();
}

{
  const { context, page, writes } = await newSession(superadmin, { viewport: { width: 390, height: 844 } });
  await openSummary(page);
  const target = seededDetail.students[1];
  await page.getByRole("button", { name: `Edit exam and bonus for ${target.first_name} ${target.last_name}` }).click();
  const dialog = page.getByRole("dialog", { name: /Edit exam and bonus/ });
  await dialog.waitFor();
  await dialog.getByLabel("Bonus").fill("11");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Continue editing" }).waitFor();
  const mark = writes.length;
  registerProbe({ probe: "dirty_escape_keeps_the_editor_and_offers_continue_or_discard", passed: (await dialog.isVisible()) && (await page.getByRole("button", { name: "Discard changes" }).isVisible()) });
  await shot(page, "superadmin-editor-dirty-dismiss-390-light.png", { viewport: "390x844", theme: "light", state: "dirty Escape: editor kept, Continue editing and Discard changes revealed" });
  await page.getByRole("button", { name: "Discard changes" }).click();
  await sleep(500);
  registerProbe({ probe: "discarding_the_editor_sends_nothing", passed: writes.length === mark });
  await context.close();
}

{
  const { context, page, writes } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await openSummary(page, `&student=${seededDetail.students[1].student_id}`);
  page.holdWritesMilliseconds = 2500;
  await page.getByRole("button", { name: "Edit exam and bonus" }).click();
  await page.getByLabel("Bonus", { exact: true }).fill("6");
  await page.getByRole("button", { name: "Apply" }).click();
  await sleep(900);
  await page.getByRole("link", { name: "View profile" }).click();
  await page.getByText("Saving your changes before you leave…").waitFor({ timeout: 8000 });
  const stillHere = new URL(page.url()).pathname === `/journals/${courseId}`;
  await page.waitForURL(/\/students\/\d+/, { timeout: 15000 });
  page.holdWritesMilliseconds = 0;
  registerProbe({ probe: "view_profile_waits_for_the_drain_before_navigating", passed: stillHere && writes.filter((write) => write.kind === "summary").length === 1, stillHere });
  await context.close();
}

for (const lng of ["ru", "tg"]) {
  const { context, page } = await newSession(superadmin, { lng, viewport: { width: 1440, height: 1000 } });
  await openSummary(page);
  const overflow = await overflowOf(page);
  registerProbe({ probe: `summary_${lng}_no_overflow`, passed: overflow <= 0, overflow });
  await shot(page, `superadmin-summary-${lng}-1440-light.png`, { viewport: "1440x1000", theme: "light", locale: lng, state: `Summary in ${lng}` });
  await page.getByRole("button", { name: new RegExp(aboveHundredName.split(" ")[0]) }).first().click();
  await sleep(400);
  await shot(page, `superadmin-breakdown-${lng}-1440-light.png`, { viewport: "1440x1000", theme: "light", locale: lng, state: `breakdown in ${lng}` });
  await context.close();
}

{
  const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await page.route(new RegExp(`/api/v1/journals/${currentPeriod.id}$`), async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.students[2].summary = null;
    return route.fulfill({ response, json: body });
  });
  await openSummary(page);
  const unavailable = await page.getByText("Unavailable").count();
  registerProbe({ probe: "missing_summary_reads_unavailable_never_zero", passed: unavailable === 1, unavailable });
  await shot(page, "summary-missing-simulated-1440-light.png", { viewport: "1440x1000", theme: "light", state: "one student's summary removed from the response by the harness (labeled simulation): Unavailable instead of zero" });
  await context.close();
}

{
  const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await page.route(new RegExp(`/api/v1/journals/${currentPeriod.id}$`), (route) => (route.request().method() === "GET" ? new Promise(() => {}) : route.continue()));
  await page.goto(`${previewOrigin}/journals/${courseId}?view=summary`);
  await page.locator('[data-testid="journal-grid-skeleton"]').waitFor({ timeout: 15000 });
  await sleep(300);
  await shot(page, "summary-loading-simulated-1440-light.png", { viewport: "1440x1000", theme: "light", state: "journal request held pending by the harness (labeled simulation)" }, { immediate: true });
  await context.close();
}

{
  const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await page.route(new RegExp(`/api/v1/journals/${currentPeriod.id}$`), (route) => (route.request().method() === "GET" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "simulated" }) }) : route.continue()));
  await page.goto(`${previewOrigin}/journals/${courseId}?view=summary`);
  await page.getByText("Failed to load journal data").waitFor({ timeout: 20000 });
  await shot(page, "summary-error-simulated-1440-light.png", { viewport: "1440x1000", theme: "light", state: "journal request answered 500 by the harness (labeled simulation); Retry present" });
  await context.close();
}

{
  const mentorSession = await newSession(mentor, { viewport: { width: 1440, height: 1000 } });
  await openSummary(mentorSession.page);
  const archiveResponse = await fetch(`${apiOrigin}/courses/${courseId}`, { method: "PATCH", headers: superadminHeaders, body: JSON.stringify({ status: "archived" }) });
  assert.equal(archiveResponse.status, 200);
  await mentorSession.context.close();
  const archived = await newSession(mentor, { viewport: { width: 1440, height: 1000 } });
  await openSummary(archived.page);
  const editActions = await archived.page.getByRole("button", { name: /Edit exam and bonus/ }).count();
  const notice = await archived.page.getByTestId("journal-archived-notice").isVisible();
  await archived.page.getByRole("button", { name: `Open breakdown for ${aboveHundredName}` }).click();
  await sleep(300);
  const breakdownEdit = await archived.page.getByRole("button", { name: "Edit exam and bonus" }).count();
  registerProbe({ probe: "archived_mentor_summary_is_read_only_with_values_visible", passed: editActions === 0 && breakdownEdit === 0 && notice, editActions, breakdownEdit, notice });
  await shot(archived.page, "mentor-archived-readonly-summary-1440-light.png", { viewport: "1440x1000", theme: "light", state: "archived journal, assigned mentor: breakdown with values and no edit action" });
  await archived.context.close();
}

registerProbe({ probe: "no_unexpected_page_errors", passed: pageErrors.length === 0, errors: pageErrors.slice(0, 5) });

await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify(manifest, null, 2));
await writeFile(`${evidenceDir}/probes.json`, JSON.stringify(probes, null, 2));
await browser.close();
console.log(`Captured ${manifest.length} screenshots and ${probes.length} probes, all passed.`);

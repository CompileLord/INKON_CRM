import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import readline from "node:readline";

let input = "";
const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) {
  input = line;
  break;
}
const fixtures = JSON.parse(input);

const evidenceDir = resolve("../docs/redesign-execution/group-04/integration/evidence");
const screenshotsDir = `${evidenceDir}/screenshots`;
await mkdir(screenshotsDir, { recursive: true });

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5213";
const apiOrigin = `${fixtures.api_origin}/api/v1`;
const sections = (process.env.KITOB_SECTIONS || "hub,profile,owner,period,roles,integrity,overlays,states,locales,layout,archived").split(",");
const strict = process.env.KITOB_STRICT === "1";
const mentor = fixtures.identities.find((item) => item.role === "mentor" && !item.forced && !item.tag);
const unrelatedMentor = fixtures.identities.find((item) => item.role === "mentor" && item.tag === "empty");
const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
const accountant = fixtures.identities.find((item) => item.role === "accountant" && !item.forced);
const studentIdentity = fixtures.identities.find((item) => item.role === "student" && !item.forced);
assert.ok(mentor && unrelatedMentor && superadmin && accountant && studentIdentity, "All role identities must exist");

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

async function createCourse(title, { schedules = true, mentorId = mentor.id } = {}) {
  const response = await fetch(`${apiOrigin}/courses/`, {
    method: "POST",
    headers: superadminHeaders,
    body: JSON.stringify({
      title,
      description: "Integration fixture course.",
      start_date: "2026-08-03",
      end_date: "2026-12-31",
      exam_type: "monthly",
      price: "100.00",
      mentor_id: mentorId,
      schedules: schedules ? [0, 2, 4].map((day) => ({ day_of_week: day, time_start: "09:00:00", time_end: "10:30:00" })) : [],
    }),
  });
  assert.equal(response.status, 201, `Course ${title} must be created`);
  return (await response.json()).id;
}

const courseId = await createCourse("Integration Fixture: Applied Algebra and Statistics for Advanced Learners");
const emptyRosterCourseId = await createCourse("Integration Empty Roster");
for (let index = 0; index < 8; index += 1) await createCourse(`Integration Filler ${index + 1}`);

const studentIdentities = fixtures.identities.filter((item) => item.role === "student" && !item.forced);
for (const identity of studentIdentities) {
  for (const targetCourse of [courseId]) {
    await fetch(`${apiOrigin}/enrollments/`, {
      method: "POST",
      headers: superadminHeaders,
      body: JSON.stringify({ student_id: identity.id, course_id: targetCourse }),
    });
  }
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
assert.ok(currentDetail.students.length >= 4, "A roster of at least four students is required");
const sortedDates = [...currentDetail.lesson_dates].sort();
const expectedLesson = sortedDates.includes(today) ? today : [...sortedDates].reverse().find((date) => date <= today) ?? sortedDates[0];
const lessonIndex = sortedDates.indexOf(expectedLesson);
const nameOf = (student) => `${student.first_name} ${student.last_name}`;

async function seedSummaries() {
  const detail = await getDetail(currentPeriod.id);
  const [high, partial] = detail.students;
  const putEntries = async (student, patches) => {
    const payload = patches.map(([date, patch]) => {
      const entry = student.entries.find((candidate) => candidate.lesson_date === date);
      return { student_id: student.student_id, lesson_date: date, version: entry.version, comment: null, ...patch };
    });
    const response = await fetch(`${apiOrigin}/journals/${currentPeriod.id}/entries`, { method: "PUT", headers: mentorHeaders, body: JSON.stringify(payload) });
    assert.equal(response.status, 200);
  };
  await putEntries(high, detail.lesson_dates.map((date) => [date, { attendance: true, score: 5 }]));
  await putEntries(partial, detail.lesson_dates.slice(0, 6).map((date, index) => [date, { attendance: true, score: 3, ...(index === 0 ? { comment: "Needs extra practice with fractions." } : {}) }]));
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
const targetStudent = seededDetail.students[2];
const profileStudent = seededDetail.students[0];

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];
const observations = [];
const pageErrors = [];

function registerProbe(probe) {
  if (!probe.passed) console.error("PROBE_FAIL", JSON.stringify(probe));
  if (strict) assert.ok(probe.passed, `Probe failed: ${probe.probe} ${JSON.stringify(probe)}`);
  probes.push(probe);
}

function observe(name, data) {
  console.error("OBSERVE", name, JSON.stringify(data));
  observations.push({ name, data });
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

async function newSession(identity, { lng = "en", viewport = { width: 1440, height: 1000 }, theme = "light", hold = 0 } = {}) {
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
  page.holdWritesMilliseconds = hold;
  await page.route(/\/journals\/\d+\/(entries|students\/\d+\/summary|exam-max-score)$/, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.continue();
      return;
    }
    const record = { kind: request.url().includes("/entries") ? "entries" : request.url().includes("/summary") ? "summary" : "exam", method: request.method(), body: JSON.parse(request.postData() ?? "null"), url: request.url() };
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
    if (message.type() === "error" && !/status of (4|5)\d\d|Failed to load resource/.test(message.text())) {
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

const workspaceUrl = (query = "", id = courseId) => `${previewOrigin}/journals/${id}${query}`;

async function openWorkspace(page, query = "", id = courseId) {
  await page.goto(workspaceUrl(query, id));
  await page.locator('[data-testid="journal-grid-region"], [data-lesson-row]').first().waitFor({ state: "visible", timeout: 20000 });
  await page.locator('[data-testid="journal-grid-skeleton"], [data-testid="journal-lesson-skeleton"]').first().waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  await sleep(300);
}

async function waitForSaved(page, timeout = 15000) {
  await page.waitForFunction(() => {
    const phase = document.querySelector('[data-testid="journal-save-status"]')?.getAttribute("data-phase");
    return phase === "saved" || phase === "idle";
  }, null, { timeout });
}

const phaseOf = (page) => page.locator('[data-testid="journal-save-status"]').first().getAttribute("data-phase");

const overflowOf = (page) =>
  page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));

const guarded = async (name, body) => {
  if (!sections.includes(name)) return;
  console.error("SECTION", name);
  try {
    await body();
  } catch (error) {
    console.error("SECTION_FAILED", name, String(error).slice(0, 600));
    observe(`section_failed_${name}`, { error: String(error).slice(0, 600) });
    for (const context of browser.contexts()) {
      for (const [index, openPage] of context.pages().entries()) {
        await openPage.screenshot({ path: `/tmp/kitob-integration-failure-${name}-${index}.png` }).catch(() => {});
      }
    }
    if (strict) throw error;
  }
};

const gridCell = (page, row, lessonOffset = lessonIndex) => page.locator("tbody tr").nth(row).locator('[data-control="cell"]').nth(lessonOffset);

await guarded("hub", async () => {
  {
    const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 600 } });
    await page.goto(`${previewOrigin}/journals?status=active`);
    await page.locator('ul[aria-label] a[href^="/journals/"]').first().waitFor();
    await sleep(500);
    const linkCount = await page.locator('ul[aria-label] a[href^="/journals/"]').count();
    await page.evaluate(() => window.scrollTo(0, 700));
    await sleep(300);
    const scrolled = await page.evaluate(() => window.scrollY);
    const target = page.locator('ul[aria-label] a[href^="/journals/"]').nth(Math.min(12, linkCount - 1));
    const targetHref = await target.getAttribute("href");
    await target.scrollIntoViewIfNeeded();
    const scrolledAtClick = await page.evaluate(() => window.scrollY);
    await target.click();
    await page.waitForURL(`**${targetHref}`);
    await sleep(800);
    await page.getByRole("link", { name: "Back to journals" }).click();
    await page.waitForURL(/\/journals\?status=active/);
    await page.locator('ul[aria-label] a[href^="/journals/"]').first().waitFor();
    await sleep(800);
    const restored = await page.evaluate(() => ({ y: window.scrollY, search: location.search }));
    registerProbe({ probe: "hub_back_link_restores_status_filter_and_scroll", passed: restored.search === "?status=active" && Math.abs(restored.y - scrolledAtClick) <= 40 && scrolledAtClick > 0, scrolledAtClick, restored });
    await shot(page, "superadmin-hub-restored-after-back-1440.png", { viewport: "1440x600", theme: "light", state: "hub restored with ?status=active and the scroll offset after opening a journal and using the Back to journals link" });
    await page.goBack();
    await page.waitForURL(`**${targetHref}`);
    await page.goBack();
    await page.waitForURL(/\/journals\?status=active/);
    await sleep(800);
    const historyRestored = await page.evaluate(() => ({ y: window.scrollY, search: location.search }));
    observe("hub_history_back_after_link_back", historyRestored);
    await context.close();
  }
  {
    const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 600 } });
    await page.goto(`${previewOrigin}/journals?page=2`);
    await page.locator('ul[aria-label] a[href^="/journals/"]').first().waitFor();
    await sleep(500);
    const rows = await page.locator('ul[aria-label] a[href^="/journals/"]').count();
    const target = page.locator('ul[aria-label] a[href^="/journals/"]').nth(rows - 1);
    const targetHref = await target.getAttribute("href");
    await target.scrollIntoViewIfNeeded();
    const scrolled = await page.evaluate(() => window.scrollY);
    await target.click();
    await page.waitForURL(`**${targetHref}`);
    await sleep(600);
    await page.goBack();
    await page.locator('ul[aria-label] a[href^="/journals/"]').first().waitFor();
    await sleep(800);
    const restored = await page.evaluate(() => ({ y: window.scrollY, search: location.search }));
    registerProbe({ probe: "hub_browser_back_restores_page_two_and_scroll", passed: restored.search === "?page=2" && Math.abs(restored.y - scrolled) <= 40, rows, scrolled, restored });
    await context.close();
  }
  {
    const { context, page } = await newSession(mentor, { viewport: { width: 390, height: 844 } });
    await page.goto(`${previewOrigin}/journals`);
    await page.locator('ul[aria-label] a[href^="/journals/"]').first().waitFor();
    await sleep(500);
    await page.getByRole("searchbox").or(page.getByRole("textbox")).first().fill("Integration Fixture");
    await sleep(400);
    await page.locator('ul[aria-label] a[href^="/journals/"]').first().click();
    await page.waitForURL(/\/journals\/\d+$/);
    await page.getByRole("link", { name: "Back to journals" }).click();
    await page.waitForURL(/\/journals\?q=/);
    const search = await page.evaluate(() => location.search);
    const value = await page.getByRole("searchbox").or(page.getByRole("textbox")).first().inputValue();
    registerProbe({ probe: "hub_back_restores_search_text_for_mentor_phone", passed: search.includes("q=Integration") && value === "Integration Fixture", search, value });
    await context.close();
  }
});

await guarded("profile", async () => {
  const summaryQuery = `?period=${currentPeriod.id}&lesson=${expectedLesson}&view=summary&student=${profileStudent.student_id}`;
  for (const [label, viewport] of [["1440", { width: 1440, height: 1000 }], ["390", { width: 390, height: 844 }]]) {
    const { context, page, writes } = await newSession(superadmin, { viewport, hold: 1200 });
    await page.goto(workspaceUrl(summaryQuery));
    await page.locator("#journal-breakdown-heading").waitFor({ timeout: 20000 });
    await sleep(500);
    await page.getByRole("button", { name: /Edit exam and bonus/ }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByLabel("Bonus").fill("7");
    await dialog.getByRole("button", { name: "Apply" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("link", { name: "View profile" }).click();
    await page.waitForURL(/\/students\/\d+/, { timeout: 20000 });
    await sleep(800);
    const writesAtProfile = writes.map((write) => ({ kind: write.kind, status: write.status }));
    const backLabel = await page.locator("a", { hasText: /Back to/ }).first().innerText().catch(() => "none");
    const backHref = await page.locator("a", { hasText: /Back to/ }).first().getAttribute("href").catch(() => "none");
    registerProbe({ probe: `profile_back_link_returns_to_the_journal_context_${label}`, passed: backLabel === "Back to Journal" && backHref === `/journals/${courseId}${summaryQuery}`, backLabel, backHref, writesAtProfile });
    await shot(page, `superadmin-profile-after-view-profile-${label}.png`, { viewport: `${viewport.width}x${viewport.height}`, theme: "light", state: "student profile reached from the journal breakdown View profile link; in-page Back link target recorded" });
    await page.goBack();
    await page.locator("#journal-breakdown-heading").waitFor({ timeout: 20000 });
    await sleep(600);
    const returned = await page.evaluate(() => ({ search: location.search, active: document.activeElement?.id || document.activeElement?.tagName || null, bonus: document.body.innerText.match(/Bonus[\s\S]{0,12}/)?.[0] }));
    registerProbe({ probe: `view_profile_then_browser_back_restores_period_lesson_view_and_breakdown_${label}`, passed: returned.search.includes(`period=${currentPeriod.id}`) && returned.search.includes("view=summary") && returned.search.includes(`student=${profileStudent.student_id}`), returned });
    registerProbe({ probe: `view_profile_then_back_restores_focus_inside_the_breakdown_${label}`, passed: returned.active === "journal-breakdown-heading" || returned.active === "A", returned });
    await page.getByRole("link", { name: "View profile" }).click();
    await page.waitForURL(/\/students\/\d+/);
    await page.locator("a", { hasText: "Back to Journal" }).first().click();
    await page.locator("#journal-breakdown-heading").waitFor({ timeout: 20000 });
    const viaLink = await page.evaluate(() => location.pathname + location.search);
    registerProbe({ probe: `profile_back_link_round_trip_restores_period_lesson_view_and_breakdown_${label}`, passed: viaLink === `/journals/${courseId}${summaryQuery}`, viaLink });
    await shot(page, `superadmin-breakdown-after-profile-back-${label}.png`, { viewport: `${viewport.width}x${viewport.height}`, theme: "light", state: "breakdown restored after browser back from the profile; focus recorded in probes" });
    await context.close();
    await fetch(`${apiOrigin}/journals/${currentPeriod.id}/students/${profileStudent.student_id}/summary`, { method: "PATCH", headers: superadminHeaders, body: JSON.stringify({ bonus_score: 20, exam_score: seededDetail.exam_max_score, version: (await getDetail(currentPeriod.id)).students[0].summary.version }) });
  }
  {
    const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
    await page.goto(workspaceUrl(`?period=${previousPeriod.id}&view=summary`));
    await page.locator("table[aria-label]").waitFor({ timeout: 20000 });
    await page.locator("[data-summary-open]").first().click();
    await page.locator("#journal-breakdown-heading").waitFor();
    await page.getByRole("link", { name: "View profile" }).click();
    await page.waitForURL(/\/students\/\d+/);
    await page.goBack();
    await page.locator("#journal-breakdown-heading").waitFor();
    observe("previous_period_breakdown_after_profile", { search: await page.evaluate(() => location.search) });
    await context.close();
  }
});

await guarded("owner", async () => {
  const student = seededDetail.students[3];
  const studentName = nameOf(student);
  const dateEntry = student.entries.find((entry) => entry.lesson_date === expectedLesson);
  const { context, page, writes } = await newSession(mentor, { viewport: { width: 1440, height: 1000 }, hold: 2500 });
  await openWorkspace(page, `?period=${currentPeriod.id}&lesson=${expectedLesson}`);
  const startAttendance = dateEntry.attendance;
  await gridCell(page, 3).locator('input[type="checkbox"]').evaluate((node) => node.click());
  await sleep(150);
  await page.setViewportSize({ width: 900, height: 900 });
  await sleep(700);
  const lessonRow = page.locator(`[data-lesson-row="${student.student_id}"]`);
  await lessonRow.waitFor();
  const checkedInLesson = await lessonRow.locator('input[type="checkbox"]').isChecked();
  const statusPhase = await phaseOf(page);
  registerProbe({ probe: "pending_attendance_survives_grid_to_lesson_breakpoint_switch", passed: checkedInLesson === !startAttendance && ["unsaved", "saving"].includes(statusPhase), checkedInLesson, statusPhase, startAttendance });
  await shot(page, "mentor-owner-lesson-after-breakpoint-pending-900.png", { viewport: "900x900", theme: "light", state: "grid edit pending, viewport narrowed below 1024: Lesson view shows the same draft and the same unsaved/saving status" });
  await page.getByRole("button", { name: "Summary", exact: true }).click();
  await sleep(300);
  const summaryPhase = await phaseOf(page).catch(() => "none");
  registerProbe({ probe: "pending_status_visible_in_summary_during_save", passed: ["unsaved", "saving"].includes(summaryPhase), summaryPhase });
  await page.getByRole("tab", { name: "Progress" }).click();
  await sleep(300);
  const progressPhase = await phaseOf(page).catch(() => "none");
  registerProbe({ probe: "pending_status_visible_in_progress_during_save", passed: ["unsaved", "saving"].includes(progressPhase), progressPhase });
  await shot(page, "mentor-owner-progress-with-pending-status-900.png", { viewport: "900x900", theme: "light", state: "Progress tab while the Gradebook write is still pending: save status stays visible" });
  await page.waitForFunction(() => document.querySelector('[data-testid="journal-save-status"]')?.getAttribute("data-phase") !== "saving" && document.querySelector('[data-testid="journal-save-status"]')?.getAttribute("data-phase") !== "unsaved", null, { timeout: 20000 }).catch(() => {});
  await sleep(500);
  registerProbe({ probe: "exactly_one_entries_write_for_the_pending_edit_across_surfaces", passed: writes.filter((write) => write.kind === "entries").length === 1, writes: writes.map((write) => ({ kind: write.kind, status: write.status })) });
  const persisted = (await getDetail(currentPeriod.id)).students.find((candidate) => candidate.student_id === student.student_id).entries.find((entry) => entry.lesson_date === expectedLesson);
  registerProbe({ probe: "pending_edit_persisted_after_surface_changes", passed: persisted.attendance === !startAttendance, persisted });
  await page.getByRole("tab", { name: "Gradebook" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await sleep(600);
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await sleep(600);
  const finalChecked = await gridCell(page, 3).locator('input[type="checkbox"]').isChecked();
  registerProbe({ probe: "draft_visible_in_grid_after_returning_above_breakpoint", passed: finalChecked === !startAttendance, finalChecked });
  await context.close();
});

await guarded("period", async () => {
  const before = JSON.stringify((await getDetail(previousPeriod.id)).students.map((student) => student.entries.map((entry) => [entry.attendance, entry.score])));
  const { context, page, writes } = await newSession(mentor, { viewport: { width: 1440, height: 1000 }, hold: 1500 });
  await openWorkspace(page, `?period=${currentPeriod.id}&lesson=${expectedLesson}`);
  const student = seededDetail.students[3];
  const startScore = (await getDetail(currentPeriod.id)).students.find((candidate) => candidate.student_id === student.student_id).entries.find((entry) => entry.lesson_date === expectedLesson).score;
  await gridCell(page, 3).locator('[data-control="score"]').click();
  await page.getByRole("menuitemradio", { name: startScore === 2 ? "3" : "2", exact: true }).click();
  await sleep(200);
  await page.locator("select[aria-label='Period']").selectOption(String(previousPeriod.id));
  await sleep(200);
  observe("period_change_right_after_edit", { url: await page.evaluate(() => location.search), phase: await phaseOf(page).catch(() => "none"), dialogs: await page.getByRole("dialog").count() });
  await page.waitForFunction((id) => location.search.includes(`period=${id}`), previousPeriod.id, { timeout: 20000 });
  await sleep(800);
  const entryWrites = writes.filter((write) => write.kind === "entries");
  registerProbe({ probe: "period_change_drains_exactly_one_write_to_the_original_journal", passed: entryWrites.length === 1 && entryWrites[0].url.includes(`/journals/${currentPeriod.id}/entries`) && entryWrites[0].status === 200, writes: writes.map((write) => ({ url: write.url, status: write.status })) });
  const after = JSON.stringify((await getDetail(previousPeriod.id)).students.map((student) => student.entries.map((entry) => [entry.attendance, entry.score])));
  registerProbe({ probe: "no_draft_leaks_into_the_other_journal", passed: before === after });
  await shot(page, "mentor-period-switched-after-drain-1440.png", { viewport: "1440x1000", theme: "light", state: "period changed immediately after a pending score: the edit drained to the original journal, nothing written to the target journal" });
  await context.close();
});

await guarded("roles", async () => {
  {
    for (const [label, query] of [["grid", ""], ["progress", "?tab=progress"], ["summary", "?view=summary"]]) {
      const { context, page } = await newSession(unrelatedMentor, { viewport: { width: 1440, height: 1000 } });
      await page.goto(workspaceUrl(query));
      await page.getByRole("heading", { name: "You do not have access to this journal" }).waitFor({ timeout: 15000 });
      const retry = await page.getByRole("button", { name: "Retry" }).count();
      const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      registerProbe({ probe: `unrelated_mentor_denied_with_explanation_and_no_retry_${label}`, passed: retry === 0 && !body.includes("Failed to load") && !body.includes("Algebra"), retry, body: body.slice(0, 200) });
      if (label === "grid") {
        await shot(page, "unrelated-mentor-denied-journal-1440.png", { viewport: "1440x1000", theme: "light", role: "unrelated mentor", state: "journal route of a course the mentor does not teach: explicit denial, Back link, no Retry, no course data" });
        await page.getByRole("link", { name: "Journals" }).first().click();
        await page.waitForURL(/\/journals$/);
        const listed = await page.locator('ul[aria-label] a[href^="/journals/"]').count();
        registerProbe({ probe: "unrelated_mentor_hub_lists_no_foreign_courses", passed: listed === 0, listed });
      }
      await context.close();
    }
    const { context, page } = await newSession(unrelatedMentor, { viewport: { width: 390, height: 844 }, theme: "dark" });
    await page.goto(workspaceUrl());
    await page.getByRole("heading", { name: "You do not have access to this journal" }).waitFor({ timeout: 15000 });
    await shot(page, "unrelated-mentor-denied-journal-390-dark.png", { viewport: "390x844", theme: "dark", role: "unrelated mentor", state: "the same denial on a phone in the dark theme" });
    await context.close();
  }
  for (const [label, identity] of [["student", studentIdentity], ["accountant", accountant]]) {
    for (const query of ["", "?tab=progress", "?view=summary"]) {
      const { context, page } = await newSession(identity, { viewport: { width: 1440, height: 1000 } });
      const staffRequests = [];
      page.on("request", (request) => {
        if (new RegExp(`/(journals/${currentPeriod.id}|courses/${courseId}(/|$))`).test(request.url()) && !request.url().includes("5213")) staffRequests.push(request.url());
      });
      await page.goto(workspaceUrl(query));
      await sleep(2000);
      const state = await page.evaluate(() => ({ path: location.pathname, text: document.body.innerText }));
      registerProbe({ probe: `${label}_cannot_open_staff_journal_route${query}`, passed: state.path === "/" && !/Gradebook|Progress|Period settings/.test(state.text) && staffRequests.length === 0, path: state.path, staffRequests });
      if (query === "") await shot(page, `${label}-denied-journal-1440.png`, { viewport: "1440x1000", theme: "light", role: label, state: `${label} opening a staff journal route lands on its own home with no journal request` });
      await context.close();
    }
    const { context, page } = await newSession(identity, { viewport: { width: 1440, height: 1000 } });
    await page.goto(`${previewOrigin}/journals`);
    await sleep(1500);
    registerProbe({ probe: `${label}_cannot_open_journals_hub`, passed: (await page.evaluate(() => location.pathname)) === "/" });
    await context.close();
  }
});

await guarded("integrity", async () => {
  {
    const { context, page, writes } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
    await page.goto(workspaceUrl(`?period=${previousPeriod.id}&view=summary`));
    await page.locator("table[aria-label]").waitFor();
    await page.locator("select[aria-label='Period']").selectOption(String(currentPeriod.id));
    await page.waitForFunction((id) => location.search.includes(`period=${id}`), currentPeriod.id);
    await page.locator("table[aria-label]").waitFor();
    await sleep(600);
    await page.locator("[data-summary-edit]").first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByLabel("Bonus").fill("9");
    await shot(page, "superadmin-summary-editor-dirty-before-history-back-1440.png", { viewport: "1440x1000", theme: "light", state: "Summary editor with a typed bonus in the current period, before browser Back to the previous period" });
    await page.goBack();
    await sleep(1000);
    const state = await page.evaluate(() => ({ search: location.search, dialogs: document.querySelectorAll('[role="dialog"]').length, bodyOverflow: getComputedStyle(document.body).overflow }));
    registerProbe({ probe: "summary_editor_does_not_survive_a_period_change", passed: state.dialogs === 0 && state.search.includes(`period=${previousPeriod.id}`) && state.bodyOverflow !== "hidden" && writes.length === 0, state, writes: writes.length });
    await shot(page, "superadmin-summary-after-history-back-no-editor-1440.png", { viewport: "1440x1000", theme: "light", state: "after browser Back the editor is gone, the previous period summary is clean and nothing was written" });
    await context.close();
  }
  {
    const { context, page, writes } = await newSession(mentor, { viewport: { width: 390, height: 844 } });
    await page.goto(workspaceUrl(`?period=${previousPeriod.id}`));
    await page.locator("[data-lesson-row]").first().waitFor();
    await page.locator("select[aria-label='Period']").selectOption(String(currentPeriod.id));
    await page.waitForFunction((id) => location.search.includes(`period=${id}`), currentPeriod.id);
    await page.locator("[data-lesson-row]").first().waitFor();
    await sleep(600);
    await page.locator("[data-lesson-row]").first().locator('[data-control="comment"]').click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.locator("textarea").fill("typed in the current period");
    await page.goBack();
    await sleep(1000);
    const state = await page.evaluate(() => ({ search: location.search, dialogs: document.querySelectorAll('[role="dialog"]').length }));
    registerProbe({ probe: "phone_comment_dialog_does_not_survive_a_period_change", passed: state.dialogs === 0 && writes.length === 0, state, writes: writes.length });
    await context.close();
  }
  {
    const { context, page, writes } = await newSession(mentor, { viewport: { width: 390, height: 844 } });
    await openWorkspace(page, `?period=${currentPeriod.id}&lesson=${expectedLesson}`);
    const rows = page.locator("[data-lesson-row]");
    await rows.nth(2).locator('[data-control="score"]').click();
    await page.getByRole("dialog", { name: /Score for/ }).waitFor();
    const tabTargets = [];
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press("Tab");
      tabTargets.push(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))));
    }
    registerProbe({ probe: "phone_score_picker_keeps_tab_focus_inside_the_dialog", passed: tabTargets.every(Boolean), tabTargets });
    await shot(page, "mentor-phone-picker-after-twelve-tabs-390.png", { viewport: "390x844", theme: "light", state: "score picker still focused inside after twelve Tab presses" });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    registerProbe({ probe: "phone_picker_escape_returns_focus_to_score_control", passed: (await page.evaluate(() => document.activeElement?.getAttribute("data-control"))) === "score" && writes.length === 0 });
    await context.close();
  }
  {
    const { context, page } = await newSession(mentor, { viewport: { width: 1440, height: 1000 } });
    await openWorkspace(page, `?period=${currentPeriod.id}&lesson=${expectedLesson}`);
    await gridCell(page, 1).locator('[data-control="score"]').click();
    await page.getByRole("menuitemradio", { name: "3", exact: true }).waitFor();
    await page.keyboard.press("Tab");
    await sleep(300);
    const state = await page.evaluate(() => ({ popovers: document.querySelectorAll('[role="menuitemradio"]').length, active: document.activeElement?.getAttribute("data-control") ?? document.activeElement?.tagName }));
    registerProbe({ probe: "desktop_score_popover_closes_on_tab", passed: state.popovers === 0, state });
    await context.close();
  }
  {
    const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
    await page.goto(workspaceUrl(`?period=${currentPeriod.id}&view=summary`));
    await page.locator("table[aria-label]").waitFor();
    await page.locator("[data-summary-edit]").first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByLabel("Bonus").fill("9");
    await page.setViewportSize({ width: 800, height: 900 });
    await sleep(900);
    const narrow = await page.evaluate(() => ({ dialogs: document.querySelectorAll('[role="dialog"]').length, bonus: document.getElementById("journal-summary-bonus")?.value ?? null }));
    await shot(page, "superadmin-summary-editor-draft-kept-at-800.png", { viewport: "800x900", theme: "light", state: "Summary editor draft (bonus 9) kept after the viewport narrowed below 1024" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await sleep(900);
    const wide = await page.evaluate(() => ({ dialogs: document.querySelectorAll('[role="dialog"]').length, bonus: document.getElementById("journal-summary-bonus")?.value ?? null }));
    registerProbe({ probe: "summary_editor_keeps_dirty_draft_across_the_1024_breakpoint", passed: narrow.dialogs === 1 && narrow.bonus === "9" && wide.dialogs === 1 && wide.bonus === "9", narrow, wide });
    await context.close();
  }
  {
    const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
    await page.goto(workspaceUrl(`?period=${currentPeriod.id}&view=summary&student=${profileStudent.student_id}`));
    await page.locator("#journal-breakdown-heading").waitFor();
    await sleep(500);
    registerProbe({ probe: "breakdown_hides_roster_search", passed: (await page.getByRole("searchbox").count()) === 0 });
    await shot(page, "superadmin-breakdown-no-search-1440.png", { viewport: "1440x1000", theme: "light", state: "breakdown without the unrelated roster search box" });
    await context.close();
  }
  {
    const { context, page } = await newSession(mentor, { viewport: { width: 1440, height: 1000 } });
    await page.goto(workspaceUrl("", emptyRosterCourseId));
    await page.getByText("There are no students in this course").waitFor({ timeout: 15000 });
    registerProbe({ probe: "empty_roster_hides_search", passed: (await page.getByRole("searchbox").count()) === 0 });
    await context.close();
  }
});

await guarded("overlays", async () => {
  {
    const { context, page } = await newSession(mentor, { viewport: { width: 1440, height: 1000 } });
    await openWorkspace(page, `?period=${currentPeriod.id}&lesson=${expectedLesson}`);
    await gridCell(page, 1).locator('[data-control="score"]').click();
    await page.getByRole("dialog", { name: /Score for/ }).waitFor();
    await page.setViewportSize({ width: 900, height: 900 });
    await sleep(700);
    const pickerAfter = { popovers: await page.locator('[role="menuitemradio"]').count(), bodyOverflow: await page.evaluate(() => getComputedStyle(document.body).overflow), inert: await page.evaluate(() => document.querySelectorAll("[inert]").length) };
    registerProbe({ probe: "desktop_score_popover_closes_cleanly_when_the_breakpoint_changes", passed: pickerAfter.popovers === 0 && pickerAfter.bodyOverflow !== "hidden" && pickerAfter.inert === 0, pickerAfter });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await context.close();
  }
  {
    const { context, page } = await newSession(mentor, { viewport: { width: 390, height: 844 } });
    await openWorkspace(page, `?period=${currentPeriod.id}&lesson=${expectedLesson}`);
    await page.locator("[data-lesson-row]").nth(1).locator('[data-control="comment"]').click();
    const dialog = page.getByRole("dialog", { name: /Comment for/ });
    await dialog.waitFor();
    await dialog.locator("textarea").fill("Draft typed before the window was resized.");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await sleep(900);
    const state = await page.evaluate(() => ({ dialogs: document.querySelectorAll('[role="dialog"]').length, bodyOverflow: getComputedStyle(document.body).overflow, inertCount: document.querySelectorAll("[inert]").length, ariaHidden: document.querySelectorAll('body > [aria-hidden="true"], #root[aria-hidden="true"]').length, active: document.activeElement?.tagName }));
    observe("comment_dialog_after_breakpoint_to_desktop", state);
    const cleanup = state.bodyOverflow !== "hidden" && state.inertCount === 0 && state.ariaHidden === 0;
    registerProbe({ probe: "comment_dialog_unmounted_by_breakpoint_leaves_no_scroll_lock_or_inert_background", passed: cleanup, state });
    const clickable = await gridCell(page, 0).locator('[data-control="score"]').click({ timeout: 4000 }).then(() => true).catch(() => false);
    registerProbe({ probe: "grid_is_interactive_after_overlay_cleanup", passed: clickable });
    await context.close();
  }
  {
    const { context, page, writes } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
    await openWorkspace(page, `?period=${currentPeriod.id}`);
    await page.locator("select[aria-label='Period']").selectOption(String(previousPeriod.id));
    await page.waitForFunction((id) => location.search.includes(`period=${id}`), previousPeriod.id);
    await sleep(600);
    await page.getByRole("button", { name: "Period settings" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.locator("#journal-period-settings-input").fill("77");
    await page.goBack();
    await sleep(900);
    const state = await page.evaluate(() => ({ search: location.search, dialogs: document.querySelectorAll('[role="dialog"]').length, input: document.getElementById("journal-period-settings-input")?.value ?? null, period: document.querySelector("#journal-period-settings-input")?.closest('[role="dialog"]')?.innerText.replace(/\s+/g, " ").slice(0, 160) ?? null }));
    registerProbe({ probe: "period_settings_dialog_does_not_survive_a_period_change", passed: state.dialogs === 0 && state.search.includes(`period=${currentPeriod.id}`) && writes.length === 0, state, writes: writes.length });
    await shot(page, "superadmin-settings-dialog-after-history-back-1440.png", { viewport: "1440x1000", theme: "light", state: "Period settings opened on one period with a typed maximum, then browser Back to the other period: dialog gone, no write" });
    await page.getByRole("button", { name: "Period settings" }).click();
    const reopened = await page.evaluate(() => ({ value: document.getElementById("journal-period-settings-input")?.value ?? null, text: document.querySelector('[role="dialog"]')?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? "" }));
    registerProbe({ probe: "reopened_period_settings_shows_the_current_journal_and_a_pristine_maximum", passed: reopened.value === String(seededDetail.exam_max_score) && reopened.text.includes(currentPeriod.period_label), reopened });
    await context.close();
  }
});

await guarded("states", async () => {
  {
    const { context, page } = await newSession(mentor, { viewport: { width: 1440, height: 1000 } });
    let failCourse = true;
    await page.route(new RegExp(`/api/v1/courses/${courseId}$`), (route) => (failCourse ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "x" }) }) : route.continue()));
    await page.goto(workspaceUrl());
    await page.getByRole("button", { name: "Retry" }).waitFor({ timeout: 15000 });
    await shot(page, "mentor-state-course-error-1440.png", { viewport: "1440x1000", theme: "light", state: "course request failed (simulated 500): error with Retry and Back link" });
    failCourse = false;
    await page.getByRole("button", { name: "Retry" }).click();
    await page.locator('[data-testid="journal-grid-region"]').waitFor({ timeout: 20000 });
    registerProbe({ probe: "course_error_retry_recovers_to_loaded_workspace", passed: true });
    await context.close();
  }
  {
    const { context, page } = await newSession(mentor, { viewport: { width: 390, height: 844 } });
    let failPeriods = true;
    await page.route(new RegExp(`/api/v1/courses/${courseId}/journals$`), (route) => (failPeriods ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "x" }) }) : route.continue()));
    await page.goto(workspaceUrl());
    await page.getByRole("button", { name: "Retry" }).waitFor({ timeout: 15000 });
    await shot(page, "mentor-state-periods-error-390.png", { viewport: "390x844", theme: "light", state: "period list failed (simulated 500): error with Retry" });
    failPeriods = false;
    await page.getByRole("button", { name: "Retry" }).click();
    await page.locator("[data-lesson-row]").first().waitFor({ timeout: 20000 });
    await context.close();
  }
  {
    const { context, page } = await newSession(mentor, { viewport: { width: 1440, height: 1000 } });
    await openWorkspace(page, `?period=${currentPeriod.id}&lesson=${expectedLesson}`);
    let failJournal = true;
    await page.route(new RegExp(`/api/v1/journals/${currentPeriod.id}$`), (route) => (failJournal ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "x" }) }) : route.continue()));
    await sleep(31500);
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await page.getByText("Could not refresh the journal").waitFor({ timeout: 15000 }).catch(() => {});
    const notice = await page.getByText("Could not refresh the journal").count();
    const gridStill = await page.locator('[data-testid="journal-grid-region"]').count();
    const retry = await page.getByRole("button", { name: "Retry" }).count();
    registerProbe({ probe: "refresh_failure_keeps_the_loaded_grid_with_a_warning_and_retry", passed: notice === 1 && gridStill === 1 && retry >= 1, notice, gridStill, retry });
    await shot(page, "mentor-state-refresh-failed-retained-1440.png", { viewport: "1440x1000", theme: "light", state: "journal refetch failed (simulated 500) after the cache went stale: last loaded grid retained with a warning and Retry" });
    failJournal = false;
    await context.close();
  }
  {
    const { context, page } = await newSession(mentor, { viewport: { width: 1440, height: 1000 } });
    let failProgress = true;
    await page.route(new RegExp(`/api/v1/courses/${courseId}/staff-progress$`), (route) => (failProgress ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "x" }) }) : route.continue()));
    await page.goto(workspaceUrl("?tab=progress"));
    await page.getByRole("button", { name: "Retry" }).waitFor({ timeout: 25000 });
    registerProbe({ probe: "progress_error_names_the_problem_and_offers_retry", passed: (await page.getByText("Could not load progress").count()) === 1 });
    await shot(page, "mentor-state-progress-error-1440.png", { viewport: "1440x1000", theme: "light", state: "Progress request failed (simulated 500): error with Retry; Gradebook untouched" });
    failProgress = false;
    await page.getByRole("button", { name: "Retry" }).click();
    await page.getByRole("table", { name: /Class results by period/ }).waitFor({ timeout: 20000 });
    await context.close();
  }
  {
    const { context, page } = await newSession(mentor, { viewport: { width: 1440, height: 1000 } });
    await page.goto(workspaceUrl("", emptyRosterCourseId));
    await sleep(2500);
    registerProbe({ probe: "empty_roster_explains_why_and_what_happens_next", passed: (await page.getByText("Students appear here once they are enrolled in this course.").count()) === 1 });
    await shot(page, "mentor-state-empty-roster-1440.png", { viewport: "1440x1000", theme: "light", state: "course with periods but no students" });
    await page.goto(workspaceUrl("?view=summary", emptyRosterCourseId));
    await sleep(1500);
    await shot(page, "mentor-state-empty-roster-summary-1440.png", { viewport: "1440x1000", theme: "light", state: "empty roster, Summary view" });
    await page.goto(workspaceUrl("?tab=progress", emptyRosterCourseId));
    await sleep(2000);
    await shot(page, "mentor-state-empty-roster-progress-1440.png", { viewport: "1440x1000", theme: "light", state: "empty roster, Progress tab" });
    await context.close();
  }
});

const localeJson = async (lng, namespace) => JSON.parse(await readFile(`src/i18n/locales/${lng}/${namespace}.json`, "utf8"));
const flattenLeaves = (node, prefix = "") => Object.entries(node).flatMap(([key, value]) => (typeof value === "string" ? [[prefix + key, value]] : flattenLeaves(value, `${prefix}${key}.`)));

await guarded("locales", async () => {
  for (const lng of ["ru", "tg"]) {
    const english = new Map();
    for (const namespace of ["journals", "common"]) {
      const enLeaves = new Map(flattenLeaves(await localeJson("en", namespace)));
      const localLeaves = new Map(flattenLeaves(await localeJson(lng, namespace)));
      for (const [key, value] of enLeaves) {
        const local = localLeaves.get(key);
        if (local !== undefined && local !== value && !/\{\{/.test(value) && value.replace(/[^A-Za-z]/g, "").length >= 4) english.set(value, local);
      }
    }
    const { context, page } = await newSession(superadmin, { lng, viewport: { width: 1440, height: 1000 } });
    for (const [name, query] of [["grid", `?period=${currentPeriod.id}`], ["summary", `?period=${currentPeriod.id}&view=summary`], ["progress", "?tab=progress"], ["breakdown", `?period=${currentPeriod.id}&view=summary&student=${profileStudent.student_id}`]]) {
      await page.goto(workspaceUrl(query));
      await sleep(2500);
      const leaks = await page.evaluate((entries) => {
        const known = new Map(entries);
        const found = [];
        const walker = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (known.has(text)) found.push(text);
        }
        for (const element of document.querySelectorAll("main [aria-label], main [title], main input[placeholder]")) {
          for (const attribute of ["aria-label", "title", "placeholder"]) {
            const value = element.getAttribute(attribute);
            if (value && known.has(value)) found.push(`${attribute}=${value}`);
          }
        }
        return found;
      }, [...english.entries()]);
      const fixtureNames = new Set(seededDetail.students.flatMap((student) => [student.first_name, student.last_name]));
      const realLeaks = leaks.filter((text) => !fixtureNames.has(text));
      registerProbe({ probe: `no_english_locale_strings_visible_in_${lng}_${name}`, passed: realLeaks.length === 0, leaks: realLeaks });
      await shot(page, `superadmin-${name}-${lng}-1440.png`, { viewport: "1440x1000", theme: "light", state: `${name} in ${lng}: every visible journal string translated` });
    }
    await page.goto(workspaceUrl(`?period=${currentPeriod.id}`));
    await sleep(2000);
    await page.getByRole("button", { name: /./ }).filter({ hasText: /Танзимоти давра|Настройки периода/ }).first().click();
    await sleep(500);
    await shot(page, `superadmin-settings-dialog-${lng}-1440.png`, { viewport: "1440x1000", theme: "light", state: `Period settings dialog in ${lng}` });
    await context.close();
  }
});

await guarded("layout", async () => {
  const widths = [320, 390, 768, 1024, 1440];
  for (const width of widths) {
    for (const theme of ["light", "dark"]) {
      const { context, page } = await newSession(superadmin, { viewport: { width, height: 900 }, theme });
      for (const [name, url] of [
        ["hub", `${previewOrigin}/journals`],
        ["grid", workspaceUrl(`?period=${currentPeriod.id}`)],
        ["summary", workspaceUrl(`?period=${currentPeriod.id}&view=summary`)],
        ["breakdown", workspaceUrl(`?period=${currentPeriod.id}&view=summary&student=${profileStudent.student_id}`)],
        ["progress", workspaceUrl("?tab=progress")],
      ]) {
        await page.goto(url);
        await sleep(1800);
        const overflow = await overflowOf(page);
        registerProbe({ probe: `no_document_overflow_${name}_${width}_${theme}`, passed: overflow.scrollWidth <= overflow.clientWidth, ...overflow });
        if (theme === "light" && (width === 1440 || width === 390) && name !== "hub") {
          const typography = await page.evaluate(() => {
            const numeric = /^[\d\s.,%/:–-]+$/;
            const untabulated = [];
            const motion = [];
            const walker = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const text = node.textContent.trim();
              if (!text || !/\d/.test(text) || !numeric.test(text)) continue;
              const parent = node.parentElement;
              if (!getComputedStyle(parent).fontVariantNumeric.includes("tabular-nums")) untabulated.push(text);
            }
            for (const element of document.querySelectorAll("main *")) {
              const style = getComputedStyle(element);
              if (style.transitionProperty.split(",").some((property) => property.trim() === "all") && parseFloat(style.transitionDuration) > 0) motion.push(`${element.tagName}.${String(element.className).slice(0, 40)}`);
            }
            return { untabulated: untabulated.slice(0, 8), motion: motion.slice(0, 8) };
          });
          registerProbe({ probe: `numbers_are_tabular_and_nothing_transitions_all_${name}_${width}`, passed: typography.untabulated.length === 0 && typography.motion.length === 0, ...typography });
        }
        if ((width === 1440 || width === 390) && ["grid", "summary", "progress"].includes(name)) {
          await shot(page, `superadmin-${name}-${width}-${theme}.png`, { viewport: `${width}x900`, theme, state: `${name} at ${width} in ${theme}` });
        }
      }
      await context.close();
    }
  }
});

await guarded("archived", async () => {
  const archive = await fetch(`${apiOrigin}/courses/${courseId}`, { method: "PATCH", headers: superadminHeaders, body: JSON.stringify({ status: "archived" }) });
  assert.equal(archive.status, 200);
  const { context, page, writes } = await newSession(mentor, { viewport: { width: 1440, height: 1000 } });
  const surfaces = [
    ["grid", `?period=${currentPeriod.id}`, 1440],
    ["summary", `?period=${currentPeriod.id}&view=summary`, 1440],
    ["breakdown", `?period=${currentPeriod.id}&view=summary&student=${profileStudent.student_id}`, 1440],
    ["progress", "?tab=progress", 1440],
    ["lesson", `?period=${currentPeriod.id}&lesson=${expectedLesson}`, 390],
    ["summary", `?period=${currentPeriod.id}&view=summary`, 390],
    ["breakdown", `?period=${currentPeriod.id}&view=summary&student=${profileStudent.student_id}`, 390],
  ];
  for (const [name, query, width] of surfaces) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(workspaceUrl(query));
    await sleep(2200);
    const state = await page.evaluate(() => ({
      checkboxes: document.querySelectorAll("input[type='checkbox']").length,
      popups: document.querySelectorAll("[aria-haspopup]").length,
      edit: document.querySelectorAll("[data-summary-edit]").length,
      settings: document.querySelectorAll("[data-period-settings]").length,
      notice: Boolean(document.querySelector('[data-testid="journal-archived-notice"]')),
    }));
    registerProbe({ probe: `archived_mentor_read_only_${name}_${width}`, passed: state.checkboxes === 0 && state.popups === 0 && state.edit === 0 && state.settings === 0 && state.notice, state });
    await shot(page, `mentor-archived-${name}-${width}.png`, { viewport: `${width}x${width === 390 ? 844 : 1000}`, theme: "light", state: `archived course, assigned mentor, ${name}: no editors, notice present` });
  }
  registerProbe({ probe: "archived_mentor_sent_no_writes", passed: writes.length === 0, writes: writes.length });
  await context.close();
  await fetch(`${apiOrigin}/courses/${courseId}`, { method: "PATCH", headers: superadminHeaders, body: JSON.stringify({ status: "active" }) });
});

await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify(manifest, null, 2));
await writeFile(`${evidenceDir}/probes.json`, JSON.stringify({ probes, observations, pageErrors }, null, 2));
await browser.close();
const failed = probes.filter((probe) => !probe.passed);
console.log(JSON.stringify({ screenshots: manifest.length, probes: probes.length, failed: failed.map((probe) => probe.probe), observations: observations.length, pageErrors: pageErrors.length }));
if (strict && failed.length > 0) process.exit(1);

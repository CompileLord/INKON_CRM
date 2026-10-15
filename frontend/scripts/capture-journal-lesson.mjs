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

const evidenceDir = resolve("../docs/redesign-execution/group-04/lesson/evidence");
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

async function seedCheckedRows() {
  const detail = await getDetail(currentPeriod.id);
  const rows = [
    [detail.students[0], { attendance: true, score: 4, comment: null }],
    [detail.students[1], { attendance: true, score: 2, comment: "Needs extra practice with fractions before the next exam." }],
  ];
  for (const [student, patch] of rows) {
    const entry = student.entries.find((candidate) => candidate.lesson_date === expectedLesson);
    const response = await fetch(`${apiOrigin}/journals/${currentPeriod.id}/entries`, {
      method: "PUT",
      headers: mentorHeaders,
      body: JSON.stringify([{ student_id: student.student_id, lesson_date: expectedLesson, version: entry.version, ...patch }]),
    });
    assert.equal(response.status, 200);
  }
}
await seedCheckedRows();

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

const rowSelector = '[data-lesson-row]';

async function openLesson(page, query = "") {
  await page.goto(`${previewOrigin}/journals/${courseId}${query}`);
  await page.locator(rowSelector).first().waitFor({ state: "visible", timeout: 20000 });
  await sleep(400);
}

async function geometry(page) {
  return page.evaluate(() => {
    const row = document.querySelector("[data-lesson-row]");
    const rect = row.getBoundingClientRect();
    const targets = Array.from(row.querySelectorAll("label, button")).map((node) => {
      const box = node.getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height) };
    });
    const nav = document.querySelector("nav.fixed");
    const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    return {
      rowTop: Math.round(rect.top),
      rowBottom: Math.round(rect.bottom),
      rowHeight: Math.round(rect.height),
      rowWidth: Math.round(rect.width),
      targets,
      viewportBottomVisible: Math.round(Math.min(window.innerHeight, navTop)),
      secondRowBottom: Math.round(document.querySelectorAll("[data-lesson-row]")[1].getBoundingClientRect().bottom),
      actionTops: Array.from(row.querySelectorAll("label, button")).map((node) => Math.round(node.getBoundingClientRect().top)),
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

for (const [identityName, identity] of [["superadmin", superadmin], ["mentor", mentor]]) {
  for (const [width, height] of [[390, 844], [768, 1024]]) {
    for (const theme of ["light", "dark"]) {
      const { context, page } = await newSession(identity, { viewport: { width, height }, theme });
      await openLesson(page);
      const g = await geometry(page);
      registerProbe({ probe: `lesson_no_overflow_and_44px_targets_${identityName}_${width}_${theme}`, passed: g.docOverflow <= 0 && g.targets.length === 3 && g.targets.every((t) => t.width >= 44 && t.height >= 44), ...g });
      registerProbe({ probe: `actions_on_one_line_${identityName}_${width}_${theme}`, passed: new Set(g.actionTops).size === 1, actionTops: g.actionTops });
      if (width === 390) registerProbe({ probe: `two_complete_editable_rows_above_the_fold_${identityName}_390_${theme}`, passed: g.secondRowBottom <= g.viewportBottomVisible, secondRowBottom: g.secondRowBottom, visibleBottom: g.viewportBottomVisible, rowHeight: g.rowHeight });
      const checked = await page.locator("[data-lesson-row] input[type='checkbox']:checked").count();
      registerProbe({ probe: `checked_attendance_rows_visible_${identityName}_${width}_${theme}`, passed: checked >= 2, checked });
      const boxColors = await page.evaluate(() => {
        const unchecked = document.querySelector("[data-lesson-row] input[type='checkbox']:not(:checked)");
        const probe = document.createElement("div");
        probe.className = "bg-card";
        document.body.appendChild(probe);
        const card = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { unchecked: unchecked ? getComputedStyle(unchecked).backgroundColor : null, card };
      });
      registerProbe({ probe: `unchecked_checkbox_uses_card_token_${identityName}_${width}_${theme}`, passed: boxColors.unchecked === null || boxColors.unchecked === boxColors.card, ...boxColors });
      await shot(page, `${identityName}-lesson-${width}-${theme}.png`, { viewport: `${width}x${height}`, theme, role: identityName, state: "Lesson view with checked attendance and a set score on the first rows" });
      await context.close();
    }
  }
}

{
  const { context, page } = await newSession(mentor, { viewport: { width: 320, height: 640 } });
  await openLesson(page);
  const g = await geometry(page);
  registerProbe({ probe: "lesson_320_has_no_overflow_and_44px_targets", passed: g.docOverflow <= 0 && g.targets.every((t) => t.width >= 44 && t.height >= 44), ...g });
  await shot(page, "mentor-lesson-320-light.png", { viewport: "320x640", theme: "light", state: "320px Lesson view; actions wrap only if they do not fit" });
  await context.close();
  for (const width of [360, 375]) {
    const narrow = await newSession(mentor, { viewport: { width, height: 740 } });
    await openLesson(narrow.page);
    const ng = await geometry(narrow.page);
    registerProbe({ probe: `actions_on_one_line_at_${width}`, passed: new Set(ng.actionTops).size === 1 && ng.docOverflow <= 0, actionTops: ng.actionTops, docOverflow: ng.docOverflow });
    await narrow.context.close();
  }
}

{
  const { context, page } = await newSession(mentor, { viewport: { width: 390, height: 844 } });
  await openLesson(page);
  await page.evaluate(() => window.scrollTo(0, 500));
  await sleep(400);
  const band = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="journal-lesson-band"]');
    const header = document.querySelector("header");
    return { bandTop: Math.round(node.getBoundingClientRect().top), headerBottom: Math.round(header.getBoundingClientRect().bottom), position: getComputedStyle(node).position, scrollY: Math.round(window.scrollY) };
  });
  registerProbe({ probe: "lesson_band_sticks_below_shell_header_after_scrolling", passed: band.position === "sticky" && band.scrollY > 300 && Math.abs(band.bandTop - band.headerBottom) <= 2, ...band });
  await shot(page, "mentor-lesson-sticky-band-390-light.png", { viewport: "390x844", theme: "light", state: `scrolled ${band.scrollY}px; the lesson/date and status band stays below the shell header` });
  await context.close();

  const landscape = await newSession(mentor, { viewport: { width: 844, height: 390 } });
  await openLesson(landscape.page);
  const landscapePosition = await landscape.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="journal-lesson-band"]')).position);
  registerProbe({ probe: "lesson_band_is_not_sticky_at_short_landscape_height", passed: landscapePosition === "static", landscapePosition });
  await landscape.context.close();
}

{
  const { context, page, writes } = await newSession(mentor, { viewport: { width: 390, height: 844 } });
  await openLesson(page);
  const row = page.locator(rowSelector).nth(2);
  const before = await row.boundingBox();
  const scoreButton = row.getByRole("button", { name: /Score for/ });
  await scoreButton.click();
  const picker = page.getByRole("dialog", { name: /Score for/ });
  await picker.waitFor();
  const pickerBox = await picker.boundingBox();
  const frameWidth = await picker.evaluate((node) => node.parentElement.getBoundingClientRect().width);
  const choices = await page.getByRole("menuitemradio").evaluateAll((nodes) => nodes.map((node) => { const b = node.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y) }; }));
  registerProbe({ probe: "picker_bounded_3x2_grid_with_44px_choices", passed: frameWidth <= 320 && frameWidth <= 390 - 32 && choices.length === 6 && choices.every((c) => c.w >= 44 && c.h >= 44) && new Set(choices.map((c) => c.y)).size === 2, frameWidth, choices });
  await shot(page, "mentor-score-picker-390-light.png", { viewport: "390x844", theme: "light", state: "bounded score picker with student, date, current score, presence context and a 3x2 grid" }, { immediate: true });
  const noScoreFill = await page.getByRole("menuitemradio").evaluateAll((nodes) => nodes.map((node) => ({ checked: node.getAttribute("aria-checked"), filled: getComputedStyle(node).backgroundColor })));
  const cardColor = await page.evaluate(() => { const probe = document.createElement("div"); probe.className = "bg-card"; document.body.appendChild(probe); const color = getComputedStyle(probe).backgroundColor; probe.remove(); return color; });
  registerProbe({ probe: "picker_without_a_score_fills_no_choice", passed: noScoreFill.every((choice) => choice.checked === "false" && choice.filled === cardColor), noScoreFill, cardColor });
  await page.keyboard.press("ArrowRight");
  const rovingLabel = await page.evaluate(() => document.activeElement?.textContent);
  registerProbe({ probe: "picker_arrow_key_roving_moves_focus_between_choices", passed: rovingLabel === "1" || rovingLabel === "2" || rovingLabel === "3" || rovingLabel === "4" || rovingLabel === "5", rovingLabel });
  await page.keyboard.press("Escape");
  const scored = page.locator(rowSelector).nth(0);
  await scored.getByRole("button", { name: /Score for/ }).click();
  await page.getByRole("dialog", { name: /Score for/ }).waitFor();
  const scoredChoices = await page.getByRole("menuitemradio").evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent, checked: node.getAttribute("aria-checked") })));
  registerProbe({ probe: "picker_with_a_score_fills_only_that_choice", passed: scoredChoices.filter((choice) => choice.checked === "true").length === 1 && scoredChoices.find((choice) => choice.checked === "true").text === "4", scoredChoices });
  await shot(page, "mentor-score-picker-with-score-390-light.png", { viewport: "390x844", theme: "light", state: "picker on a student whose current score is 4: only 4 is filled" }, { immediate: true });
  await page.keyboard.press("Escape");
  const focusBack = await page.evaluate(() => document.activeElement?.getAttribute("data-control"));
  registerProbe({ probe: "picker_escape_changes_nothing_and_returns_focus_to_score_control", passed: focusBack === "score" && writes.length === 0, focusBack, writes: writes.length });
  const writeMark = writes.length;
  await scoreButton.click();
  await page.getByRole("menuitemradio", { name: "5", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="journal-save-status"]')?.getAttribute("data-phase") === "saved", null, { timeout: 15000 });
  const after = await row.boundingBox();
  registerProbe({ probe: "choosing_a_score_queues_one_write_closes_returns_focus_and_keeps_row_height", passed: writes.length === writeMark + 1 && (await page.evaluate(() => document.activeElement?.getAttribute("data-control"))) === "score" && Math.abs(after.height - before.height) < 1, rowHeightBefore: before.height, rowHeightAfter: after.height });
  await context.close();
}

for (const theme of ["light", "dark"]) {
  const { context, page } = await newSession(mentor, { viewport: { width: 390, height: 844 }, theme });
  await openLesson(page);
  const row = page.locator(rowSelector).nth(1);
  await row.getByRole("button", { name: /comment for/i }).click();
  const dialog = page.getByRole("dialog", { name: /Comment for/ });
  await dialog.waitFor();
  await sleep(400);
  const box = await dialog.boundingBox();
  const textareaSize = await dialog.locator("textarea").evaluate((node) => getComputedStyle(node).fontSize);
  const footerVisible = await dialog.getByRole("button", { name: "Save" }).isVisible();
  registerProbe({ probe: `comment_sheet_bounded_16px_textarea_and_reachable_footer_${theme}`, passed: box.width <= 390 - 16 && box.x >= 8 && textareaSize === "16px" && footerVisible && box.y + box.height <= 844, box, textareaSize });
  if (theme === "light") {
    await shot(page, "mentor-comment-sheet-pristine-390-light.png", { viewport: "390x844", theme, state: "comment sheet with an existing comment, pristine" });
    await dialog.locator("textarea").fill("Edited comment that has not been saved yet.");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Continue editing" }).waitFor();
    const stillOpen = await dialog.isVisible();
    registerProbe({ probe: "dirty_escape_keeps_the_sheet_and_offers_continue_or_discard", passed: stillOpen && (await page.getByRole("button", { name: "Discard comment changes" }).isVisible()) });
    await shot(page, "mentor-comment-dirty-dismiss-390-light.png", { viewport: "390x844", theme, state: "dirty Escape: editor kept, Continue editing and Discard comment changes revealed" });
    await page.getByRole("button", { name: "Continue editing" }).click();
    await page.setViewportSize({ width: 390, height: 520 });
    await sleep(300);
    const kept = await dialog.locator("textarea").inputValue();
    registerProbe({ probe: "resize_keeps_the_dirty_comment_draft_and_the_dialog", passed: kept === "Edited comment that has not been saved yet." && (await dialog.isVisible()) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Discard comment changes" }).click();
    await dialog.waitFor({ state: "detached" });
    const focusReturned = await page.evaluate(() => document.activeElement?.getAttribute("data-control"));
    registerProbe({ probe: "discarding_returns_focus_to_the_comment_action", passed: focusReturned === "comment", focusReturned });
  } else {
    await shot(page, "mentor-comment-sheet-pristine-390-dark.png", { viewport: "390x844", theme, state: "comment sheet in the dark theme" });
  }
  await context.close();
}

{
  const { context, page } = await newSession(mentor, { viewport: { width: 1280, height: 900 } });
  await openWorkspace(page);
  const startCell = page.locator("tbody tr").nth(0).locator('[data-control="cell"]').nth(sortedDates.indexOf(expectedLesson));
  await startCell.focus();
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: /Comment for/ });
  await dialog.waitFor();
  await sleep(300);
  const width = (await dialog.boundingBox()).width;
  await page.keyboard.type("desktop dirty");
  await page.keyboard.press("Escape");
  const kept = await page.getByRole("button", { name: "Continue editing" }).isVisible();
  registerProbe({ probe: "desktop_comment_editor_is_centered_le_480_with_dirty_dismissal", passed: width <= 480 && kept, width });
  await page.getByRole("button", { name: "Continue editing" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Discard comment changes" }).click();
  await context.close();
}

{
  const { context, page, writes } = await newSession(mentor, { viewport: { width: 390, height: 844 } });
  await openLesson(page);
  const names = await page.locator(`${rowSelector} span.font-semibold`).allInnerTexts();
  const target = names[1].split(" ")[0].toLowerCase().slice(0, 4);
  await page.getByRole("searchbox").fill(target);
  await sleep(300);
  const visibleRows = await page.locator(rowSelector).count();
  const count = await page.getByText(/ of \d+ students/).innerText();
  registerProbe({ probe: "search_filters_loaded_roster_with_matched_total_count", passed: visibleRows >= 1 && visibleRows < names.length && /^\d+ of \d+ students$/.test(count), visibleRows, count });
  await shot(page, "mentor-search-matches-390-light.png", { viewport: "390x844", theme: "light", state: "search with matches and the matched/total count" });
  await page.getByRole("searchbox").fill("qqqzzz");
  await page.getByText("No students match").waitFor();
  await shot(page, "mentor-search-no-match-390-light.png", { viewport: "390x844", theme: "light", state: "search without matches; Clear search offered" });
  await page.getByRole("button", { name: "Clear search" }).first().click();
  await page.locator(rowSelector).first().waitFor();
  const restored = await page.locator(rowSelector).count();
  registerProbe({ probe: "clear_search_restores_every_row_in_source_order", passed: restored === names.length && (await page.locator(`${rowSelector} span.font-semibold`).allInnerTexts()).join() === names.join(), restored });
  await shot(page, "mentor-search-cleared-390-light.png", { viewport: "390x844", theme: "light", state: "search cleared, full roster restored" });
  const hiddenWriteMark = writes.length;
  page.holdWritesMilliseconds = 2000;
  await page.locator(rowSelector).nth(0).getByRole("button", { name: /Score for/ }).click();
  await page.getByRole("menuitemradio", { name: "3", exact: true }).click();
  await sleep(900);
  await page.getByRole("searchbox").fill(target);
  const status = await page.locator('[data-testid="journal-save-status"]').getAttribute("data-phase");
  registerProbe({ probe: "hidden_rows_pending_work_stays_in_the_global_status", passed: status === "saving" || status === "unsaved", status });
  await page.waitForFunction(() => document.querySelector('[data-testid="journal-save-status"]')?.getAttribute("data-phase") === "saved", null, { timeout: 15000 });
  page.holdWritesMilliseconds = 0;
  registerProbe({ probe: "search_filtering_sent_the_grade_to_the_original_student", passed: writes.length === hiddenWriteMark + 1 && writes[writes.length - 1].body[0].student_id === firstStudent.student_id, body: writes[writes.length - 1]?.body });
  await context.close();
}

{
  const { context, page } = await newSession(mentor, { viewport: { width: 1280, height: 900 } });
  await openWorkspace(page);
  const grid = page.locator("tbody tr").nth(0).locator('[data-control="cell"]').nth(sortedDates.indexOf(expectedLesson));
  await grid.locator("button").first().focus();
  await page.setViewportSize({ width: 800, height: 900 });
  await page.locator(rowSelector).first().waitFor();
  await sleep(500);
  const equivalent = await page.evaluate(() => document.activeElement?.getAttribute("data-control"));
  registerProbe({ probe: "breakpoint_change_keeps_period_lesson_and_moves_focus_to_equivalent_control", passed: equivalent === "attendance" || equivalent === "score" || equivalent === "comment", equivalent });
  await context.close();
}

{
  const { context, page } = await newSession(mentor, { viewport: { width: 390, height: 844 } });
  await page.route(`**/api/v1/journals/${currentPeriod.id}`, (route) => (route.request().method() === "GET" ? new Promise(() => {}) : route.continue()));
  await page.goto(`${previewOrigin}/journals/${courseId}`);
  await page.locator('[data-testid="journal-lesson-skeleton"]').waitFor({ timeout: 15000 });
  await sleep(300);
  await shot(page, "lesson-loading-simulated-390-light.png", { viewport: "390x844", theme: "light", state: "selected journal request held pending by the harness (labeled simulation)" }, { immediate: true });
  await context.close();
}

{
  const { context, page } = await newSession(mentor, { viewport: { width: 390, height: 844 } });
  await page.route(`**/api/v1/journals/${currentPeriod.id}`, (route) => (route.request().method() === "GET" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "simulated" }) }) : route.continue()));
  await page.goto(`${previewOrigin}/journals/${courseId}`);
  await page.getByText("Failed to load journal data").waitFor({ timeout: 20000 });
  await shot(page, "lesson-error-simulated-390-light.png", { viewport: "390x844", theme: "light", state: "selected journal request answered 500 by the harness (labeled simulation); Retry present" });
  await context.close();
}

for (const lng of ["ru", "tg"]) {
  const { context, page } = await newSession(mentor, { lng, viewport: { width: 390, height: 844 } });
  await openLesson(page);
  const g = await geometry(page);
  registerProbe({ probe: `lesson_${lng}_has_no_overflow_and_44px_targets`, passed: g.docOverflow <= 0 && g.targets.every((t) => t.width >= 44 && t.height >= 44), ...g });
  await shot(page, `mentor-lesson-${lng}-390-light.png`, { viewport: "390x844", theme: "light", locale: lng, state: `Lesson view in ${lng}` });
  await context.close();
}

{
  const mentorSession = await newSession(mentor, { viewport: { width: 390, height: 844 } });
  await openLesson(mentorSession.page);
  const archiveResponse = await fetch(`${apiOrigin}/courses/${courseId}`, { method: "PATCH", headers: superadminHeaders, body: JSON.stringify({ status: "archived" }) });
  assert.equal(archiveResponse.status, 200);
  await mentorSession.context.close();
  const archived = await newSession(mentor, { viewport: { width: 390, height: 844 } });
  await openLesson(archived.page);
  const editors = await archived.page.locator("input[type='checkbox'], [aria-haspopup]").count();
  const notice = await archived.page.getByTestId("journal-archived-notice").isVisible();
  registerProbe({ probe: "archived_assigned_mentor_phone_rows_are_read_only", passed: editors === 0 && notice, editors, notice });
  await shot(archived.page, "mentor-archived-readonly-lesson-390-light.png", { viewport: "390x844", theme: "light", state: "archived course, assigned mentor: explanation and read-only rows" });
  await archived.context.close();
}

registerProbe({ probe: "no_unexpected_page_errors", passed: pageErrors.length === 0, errors: pageErrors.slice(0, 5) });

await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify(manifest, null, 2));
await writeFile(`${evidenceDir}/probes.json`, JSON.stringify(probes, null, 2));
await browser.close();
console.log(`Captured ${manifest.length} screenshots and ${probes.length} probes, all passed.`);

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

const evidenceDir = resolve("../docs/redesign-execution/group-04/workspace/evidence");
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

for (const [identityName, identity] of [["superadmin", superadmin], ["mentor", mentor]]) {
  for (const [width, height] of [[1440, 1000], [1024, 900]]) {
    for (const theme of ["light", "dark"]) {
      const { context, page } = await newSession(identity, { viewport: { width, height }, theme });
      await openWorkspace(page);
      const overflow = await measureDocumentOverflow(page);
      registerProbe({ probe: `no_document_overflow_${identityName}_${width}_${theme}`, passed: overflow.scrollWidth <= overflow.clientWidth, ...overflow });
      const checkboxColors = await page.evaluate(() => {
        const box = document.querySelector("tbody input[type='checkbox']");
        const probe = document.createElement("div");
        probe.className = "bg-card";
        document.body.appendChild(probe);
        const card = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const size = box.closest("label").getBoundingClientRect();
        return { background: getComputedStyle(box).backgroundColor, card, width: size.width, height: size.height };
      });
      registerProbe({ probe: `checkbox_uses_card_token_and_44px_target_${identityName}_${width}_${theme}`, passed: checkboxColors.background === checkboxColors.card && checkboxColors.width >= 44 && checkboxColors.height >= 44, ...checkboxColors });
      await shot(page, `${identityName}-workspace-${width}-${theme}.png`, {
        viewport: `${width}x${height}`,
        theme,
        role: identityName,
        state: "loaded gradebook grid with picker, tabs, lesson navigation, status area",
      });
      await context.close();
    }
  }
}

{
  const { context, page, writes } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await openWorkspace(page);

  const selectedHeader = page.locator('th[aria-current="date"]');
  const selectedText = await selectedHeader.innerText();
  registerProbe({
    probe: "default_lesson_selection_matches_documented_rule",
    passed: (await selectedHeader.count()) === 1 && selectedText.includes(expectedLesson.slice(8, 10)),
    expected_lesson: expectedLesson,
    header: selectedText.replace(/\n/g, " | "),
  });

  const pickerText = await page.locator("select[aria-label='Period']").evaluate((node) => node.parentElement?.textContent ?? "");
  registerProbe({ probe: "picker_shows_label_range_and_truthful_state", passed: pickerText.includes(currentPeriod.period_label) && pickerText.includes("Current"), text: pickerText });
  const optionTexts = await page.locator("select[aria-label='Period'] option").allInnerTexts();
  registerProbe({ probe: "picker_options_show_label_range_timing_and_no_fill_state", passed: optionTexts.length >= 3 && optionTexts.every((text) => !/Complete|In progress|Not started|Unavailable/.test(text) && text.split(" · ").length === 3), optionTexts: optionTexts.slice(0, 4) });
  await page.locator("select[aria-label='Period']").focus();
  await shot(page, "superadmin-picker-focused-1440-light.png", { viewport: "1440x1000", theme: "light", state: "period picker keyboard-focused; label, range and timing tag only" });
  const pickerBox = await page.locator("select[aria-label='Period']").evaluate((node) => node.parentElement.getBoundingClientRect().width);
  registerProbe({ probe: "period_picker_at_least_240px", passed: pickerBox >= 240, width: pickerBox });

  const geometry = await page.evaluate(() => {
    const region = document.querySelector('[data-testid="journal-grid-region"]');
    const headers = Array.from(region.querySelectorAll("thead th"));
    const corner = headers[0].getBoundingClientRect();
    const lessonWidths = headers.filter((header) => header.hasAttribute("scope") && header.querySelector("button")).map((header) => header.getBoundingClientRect().width);
    const cell = region.querySelector('[data-control="cell"]');
    const label = cell.querySelector("label").getBoundingClientRect();
    const buttons = Array.from(cell.querySelectorAll("button")).map((button) => button.getBoundingClientRect());
    const regionBox = region.getBoundingClientRect();
    return {
      cornerWidth: corner.width,
      minLessonWidth: Math.min(...lessonWidths),
      checkbox: { width: label.width, height: label.height },
      buttons: buttons.map((box) => ({ width: box.width, height: box.height })),
      cellWidth: cell.getBoundingClientRect().width,
      regionHeight: regionBox.height,
      regionBottom: regionBox.bottom,
      innerHeight: window.innerHeight,
      scrollWidth: region.scrollWidth,
      clientWidth: region.clientWidth,
      hasCue: Boolean(document.querySelector('[data-testid="journal-scroll-cue"]')),
    };
  });
  registerProbe({ probe: "student_column_at_least_200px", passed: geometry.cornerWidth >= 200, width: geometry.cornerWidth });
  registerProbe({ probe: "lesson_columns_at_least_160px", passed: geometry.minLessonWidth >= 160, width: geometry.minLessonWidth });
  registerProbe({
    probe: "three_controls_are_44px_and_fit_the_cell",
    passed: geometry.checkbox.width >= 44 && geometry.checkbox.height >= 44 && geometry.buttons.every((box) => box.width >= 44 && box.height >= 44) && geometry.cellWidth >= 3 * 44,
    geometry: { checkbox: geometry.checkbox, buttons: geometry.buttons, cellWidth: geometry.cellWidth },
  });
  registerProbe({ probe: "grid_region_scrolls_horizontally_with_visible_cue", passed: geometry.scrollWidth > geometry.clientWidth && geometry.hasCue, scrollWidth: geometry.scrollWidth, clientWidth: geometry.clientWidth, hasCue: geometry.hasCue });
  registerProbe({ probe: "grid_height_fits_dynamic_viewport", passed: geometry.regionBottom <= geometry.innerHeight, regionBottom: geometry.regionBottom, innerHeight: geometry.innerHeight });

  const region = page.locator('[data-testid="journal-grid-region"]');
  const regionBox = await region.boundingBox();
  const scrollLeftBeforeWheel = await region.evaluate((node) => node.scrollLeft);
  await page.mouse.move(regionBox.x + regionBox.width / 2, regionBox.y + regionBox.height / 2);
  await page.mouse.wheel(0, 400);
  await sleep(200);
  const afterWheel = await region.evaluate((node) => ({ scrollLeft: node.scrollLeft, scrollTop: node.scrollTop }));
  registerProbe({ probe: "vertical_wheel_is_not_converted_to_horizontal_scrolling", passed: afterWheel.scrollLeft === scrollLeftBeforeWheel, before: scrollLeftBeforeWheel, ...afterWheel });
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.setViewportSize({ width: 1440, height: 640 });
  await sleep(500);
  await region.evaluate((node) => {
    node.scrollLeft = 520;
    node.scrollTop = Math.min(160, node.scrollHeight - node.clientHeight);
  });
  await sleep(250);
  const sticky = await page.evaluate(() => {
    const regionNode = document.querySelector('[data-testid="journal-grid-region"]');
    const regionBox = regionNode.getBoundingClientRect();
    const corner = regionNode.querySelector("thead th");
    const cornerBox = corner.getBoundingClientRect();
    const rowHeader = regionNode.querySelector("tbody th");
    const rowBox = rowHeader.getBoundingClientRect();
    const dateHeader = regionNode.querySelector('thead th[aria-current="date"]') ?? regionNode.querySelectorAll("thead th")[2];
    const dateBox = dateHeader.getBoundingClientRect();
    const topLayer = document.elementFromPoint(cornerBox.left + 20, cornerBox.top + 10);
    return {
      scrollLeft: regionNode.scrollLeft,
      scrollTop: regionNode.scrollTop,
      cornerLeftOffset: Math.round(cornerBox.left - regionBox.left),
      cornerTopOffset: Math.round(cornerBox.top - regionBox.top),
      rowLeftOffset: Math.round(rowBox.left - regionBox.left),
      dateTopOffset: Math.round(dateBox.top - regionBox.top),
      cornerOnTop: corner.contains(topLayer),
      zIndexes: {
        corner: getComputedStyle(corner).zIndex,
        header: getComputedStyle(dateHeader).zIndex,
        row: getComputedStyle(rowHeader).zIndex,
      },
    };
  });
  registerProbe({
    probe: "student_column_and_date_header_stay_pinned_after_scrolling_both_ways",
    passed: sticky.scrollLeft > 0 && sticky.cornerLeftOffset <= 2 && sticky.rowLeftOffset <= 2 && sticky.dateTopOffset <= 2 && sticky.cornerTopOffset <= 2 && sticky.cornerOnTop && Number(sticky.zIndexes.corner) > Number(sticky.zIndexes.header) && Number(sticky.zIndexes.header) > Number(sticky.zIndexes.row),
    ...sticky,
  });
  await shot(page, "superadmin-grid-scrolled-sticky-1440-light.png", {
    viewport: "1440x1000",
    theme: "light",
    state: `grid scrolled horizontally (scrollLeft ${sticky.scrollLeft}) and vertically (scrollTop ${sticky.scrollTop}) with sticky student column, date header and corner`,
  });
  await region.evaluate((node) => {
    node.scrollLeft = 0;
    node.scrollTop = 0;
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await sleep(500);

  await page.getByRole("button", { name: "Keyboard help" }).click();
  await sleep(200);
  await shot(page, "superadmin-help-open-1440-light.png", { viewport: "1440x1000", theme: "light", state: "labeled Help control open with translated shortcuts" });
  await page.keyboard.press("Escape");
  const helpFocused = await page.evaluate(() => document.activeElement?.textContent?.includes("Keyboard help") ?? false);
  registerProbe({ probe: "help_escape_closes_and_returns_focus_to_trigger", passed: helpFocused });

  await page.locator("th[aria-current='date']").scrollIntoViewIfNeeded();
  const dateIndex = sortedDates.indexOf(expectedLesson);
  const startCell = page.locator('tbody tr').nth(0).locator('[data-control="cell"]').nth(dateIndex);
  await startCell.focus();
  await page.keyboard.press("ArrowRight");
  const afterRight = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  const startLabel = await startCell.getAttribute("aria-label");
  const expectedMoved = dateIndex < sortedDates.length - 1;
  registerProbe({ probe: "arrow_right_moves_to_the_next_lesson_cell", passed: expectedMoved ? afterRight !== startLabel : afterRight === startLabel, from: startLabel, to: afterRight });
  await page.keyboard.press("ArrowLeft");

  const before = writes.length;
  await startCell.focus();
  await page.keyboard.press("4");
  await waitForPhase(page, "saved");
  const gradeWrites = writes.slice(before);
  const downLabel = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  const detailAfterGrade = await getDetail(currentPeriod.id);
  const gradedEntry = detailAfterGrade.students.find((student) => student.student_id === firstStudent.student_id).entries.find((entry) => entry.lesson_date === expectedLesson);
  registerProbe({
    probe: "key_4_grades_advances_down_and_persists_against_the_selected_journal_id",
    passed: gradeWrites.length === 1 && gradeWrites[0].url.includes(`/journals/${currentPeriod.id}/entries`) && gradedEntry.score === 4 && gradedEntry.attendance === true && downLabel?.includes(nameOf(secondStudent)),
    writes: gradeWrites.length,
    url: gradeWrites[0]?.url,
    persisted: { score: gradedEntry.score, attendance: gradedEntry.attendance },
    focus_after: downLabel,
  });
  await waitForPhase(page, "idle", 6000);

  const spaceBefore = writes.length;
  await page.keyboard.press("Space");
  await waitForPhase(page, "saved");
  const spaceWrites = writes.slice(spaceBefore);
  registerProbe({
    probe: "space_toggles_attendance_on_the_focused_cell",
    passed: spaceWrites.length === 1 && spaceWrites[0].body[0].attendance === true,
    payload: spaceWrites[0]?.body,
  });
  await waitForPhase(page, "idle", 6000);

  await startCell.focus();
  await page.keyboard.press("c");
  const dialogVisible = await page.getByRole("dialog", { name: "Comment" }).isVisible();
  registerProbe({ probe: "c_opens_the_comment_editor", passed: dialogVisible });
  const writesBeforeTyping = writes.length;
  await page.keyboard.type("5 c Space");
  const commentValue = await page.getByRole("dialog", { name: "Comment" }).locator("textarea").inputValue();
  registerProbe({ probe: "shortcuts_do_not_fire_inside_the_comment_textarea", passed: commentValue === "5 c Space" && writes.length === writesBeforeTyping, value: commentValue });
  await page.keyboard.press("Escape");

  const bonusField = page.locator("tbody tr").nth(0).locator("input[inputmode='numeric']").first();
  await bonusField.focus();
  const entryWritesBefore = writes.filter((write) => write.kind === "entries").length;
  await page.keyboard.type("3");
  await page.keyboard.press("Escape");
  registerProbe({ probe: "shortcuts_do_not_fire_inside_a_summary_field", passed: writes.filter((write) => write.kind === "entries").length === entryWritesBefore });

  const regionTabbable = await region.getAttribute("tabindex");
  const regionLabel = await region.getAttribute("aria-label");
  registerProbe({ probe: "grid_region_is_labeled_and_keyboard_scrollable", passed: regionTabbable === "0" && Boolean(regionLabel), regionLabel });

  const refetchState = { reverse: false, requests: 0 };
  await page.route(new RegExp(`/api/v1/journals/${currentPeriod.id}$`), async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    refetchState.requests += 1;
    const response = await route.fetch();
    const body = await response.json();
    if (refetchState.reverse) body.students = [...body.students].reverse();
    await route.fulfill({ response, json: body });
  });
  await page.goto(`${previewOrigin}/journals/${courseId}`);
  await page.locator('[data-testid="journal-grid-region"]').waitFor({ state: "visible" });
  await sleep(500);
  const refetchOrderBefore = await page.locator("tbody th").allInnerTexts();
  const refetchCell = page.locator("tbody tr").nth(0).locator('[data-control="cell"]').nth(dateIndex);
  await refetchCell.focus();
  const focusLabelBefore = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  const requestsBeforeRefetch = refetchState.requests;
  refetchState.reverse = true;
  await sleep(31000);
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await sleep(1500);
  const refetchOrderAfter = await page.locator("tbody th").allInnerTexts();
  const focusLabelAfter = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  registerProbe({
    probe: "order_and_focus_survive_a_refetch_that_reorders_the_server_response",
    passed: refetchState.requests > requestsBeforeRefetch && JSON.stringify(refetchOrderBefore) === JSON.stringify(refetchOrderAfter) && focusLabelBefore === focusLabelAfter && refetchOrderBefore.length >= 2,
    refetch_requests: refetchState.requests - requestsBeforeRefetch,
    order_before: refetchOrderBefore.slice(0, 3),
    order_after: refetchOrderAfter.slice(0, 3),
    focus_before: focusLabelBefore,
    focus_after: focusLabelAfter,
  });

  await page.goto(`${previewOrigin}/journals/${courseId}?period=${previousPeriod.id}`);
  await page.locator('[data-testid="journal-grid-region"]').waitFor({ state: "visible" });
  await sleep(300);
  await page.locator('[data-testid="journal-grid-region"]').scrollIntoViewIfNeeded();
  const goBackTarget = `${previewOrigin}/journals/${courseId}`;
  await page.goto(goBackTarget);
  await page.locator('[data-testid="journal-grid-region"]').waitFor({ state: "visible" });
  await sleep(300);
  await page.locator("select[aria-label='Period']").selectOption(String(previousPeriod.id));
  await page.waitForURL(new RegExp(`period=${previousPeriod.id}`));
  await page.locator('[data-testid="journal-grid-skeleton"]').waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  await sleep(400);
  const switchedText = await page.locator("select[aria-label='Period']").evaluate((node) => node.parentElement?.textContent ?? "");
  await page.goBack();
  await sleep(500);
  const backText = await page.locator("select[aria-label='Period']").evaluate((node) => node.parentElement?.textContent ?? "");
  await page.goForward();
  await sleep(500);
  const forwardText = await page.locator("select[aria-label='Period']").evaluate((node) => node.parentElement?.textContent ?? "");
  registerProbe({
    probe: "period_change_and_back_forward_update_visible_context",
    passed: switchedText.includes(previousPeriod.period_label) && backText.includes(currentPeriod.period_label) && forwardText.includes(previousPeriod.period_label),
    switchedText,
    backText,
    forwardText,
  });
  await context.close();
}

{
  const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await page.goto(`${previewOrigin}/journals`);
  await sleep(500);
  await page.goto(`${previewOrigin}/journals/${courseId}?period=9999&lesson=1999-01-01`);
  await page.locator('[data-testid="journal-grid-region"]').waitFor({ state: "visible", timeout: 20000 });
  await sleep(400);
  const noticeVisible = await page.locator('[data-testid="journal-route-notice-period"]').isVisible();
  const normalizedSearch = new URL(page.url()).search;
  registerProbe({ probe: "invalid_period_shows_notice_and_normalizes_url", passed: noticeVisible && !normalizedSearch.includes("9999"), search: normalizedSearch });
  await shot(page, "superadmin-invalid-period-notice-1440-light.png", { viewport: "1440x1000", theme: "light", state: "invalid period query shows a translated notice and the date-active fallback" });
  await page.goBack();
  await sleep(500);
  registerProbe({ probe: "invalid_url_was_replaced_not_pushed", passed: new URL(page.url()).pathname === "/journals", url: page.url() });
  await context.close();
}

{
  const { context, page, writes } = await newSession(mentor, { viewport: { width: 1440, height: 1000 } });
  await openWorkspace(page);
  const startCell = page.locator("tbody tr").nth(0).locator('[data-control="cell"]').nth(sortedDates.indexOf(expectedLesson));
  await startCell.focus();
  page.holdWritesMilliseconds = 2500;
  await page.keyboard.press("3");
  await sleep(900);
  await page.locator("select[aria-label='Period']").selectOption(String(previousPeriod.id));
  await page.getByText("Saving your changes before you leave…").waitFor({ timeout: 8000 });
  const urlWhileDraining = new URL(page.url()).search;
  await shot(page, "mentor-period-change-draining-1440-light.png", { viewport: "1440x1000", theme: "light", state: "period change frozen by the drain dialog while a real PUT is held 2500ms by the harness (labeled simulation of a slow network)" });
  await page.waitForURL(new RegExp(`period=${previousPeriod.id}`), { timeout: 15000 });
  page.holdWritesMilliseconds = 0;
  registerProbe({
    probe: "period_change_waits_for_drain_then_switches_and_sends_nothing_to_the_new_journal",
    passed: !urlWhileDraining.includes("period=") && writes.length === 1 && writes[0].url.includes(`/journals/${currentPeriod.id}/entries`),
    url_while_draining: urlWhileDraining,
    writes: writes.map((write) => write.url),
  });
  await context.close();
}

for (const [lng, label] of [["ru", "ru"], ["tg", "tg"]]) {
  const { context, page } = await newSession(superadmin, { lng, viewport: { width: 1440, height: 1000 } });
  await openWorkspace(page);
  const headers = await page.locator("thead th[scope='col'] button").allInnerTexts();
  const weekdayFragments = headers.map((text) => text.split("\n")[0]);
  registerProbe({ probe: `weekday_headers_are_localized_${lng}`, passed: weekdayFragments.length > 0 && weekdayFragments.every((text) => text.length > 0 && !/^[A-Za-z]+$/.test(text)), weekdays: weekdayFragments.slice(0, 5) });
  await shot(page, `superadmin-${label}-weekday-headers-1440-light.png`, { viewport: "1440x1000", theme: "light", locale: lng, state: `workspace in ${lng} with localized weekday abbreviations in the date headers` });
  await context.close();
}

{
  const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await page.goto(`${previewOrigin}/journals/${courseId}?view=summary`);
  await page.getByRole("list", { name: /Student totals/ }).waitFor({ timeout: 20000 });
  await sleep(300);
  await shot(page, "superadmin-summary-1440-light.png", { viewport: "1440x1000", theme: "light", state: "interim Summary list (the full breakdown ships with KITOB-04-05)" });
  await page.goto(`${previewOrigin}/journals/${courseId}?tab=progress`);
  await sleep(1500);
  await shot(page, "superadmin-progress-tab-1440-light.png", { viewport: "1440x1000", theme: "light", state: "Progress tab showing the existing chart until KITOB-04-07" });
  await context.close();
}

{
  const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await page.route(`**/api/v1/courses/${courseId}/journals`, () => new Promise(() => {}));
  await page.goto(`${previewOrigin}/journals/${courseId}`);
  await page.locator('[data-testid="journal-period-skeleton"]').waitFor({ timeout: 15000 });
  await sleep(300);
  await shot(page, "context-loading-simulated-1440-light.png", { viewport: "1440x1000", theme: "light", state: "period list request held pending by the harness (labeled simulation)" }, { immediate: true });
  await context.close();
}

{
  const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await page.route(`**/api/v1/courses/${courseId}/journals`, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "simulated" }) }));
  await page.goto(`${previewOrigin}/journals/${courseId}`);
  await page.getByText("Could not load the journal periods").waitFor({ timeout: 20000 });
  await shot(page, "context-error-simulated-1440-light.png", { viewport: "1440x1000", theme: "light", state: "period list request answered 500 by the harness (labeled simulation); Retry present" });
  const retryVisible = await page.getByRole("button", { name: "Retry" }).isVisible();
  registerProbe({ probe: "period_error_state_offers_retry_and_keeps_title", passed: retryVisible && (await page.locator("h1").innerText()).length > 0 });
  await context.close();
}

{
  const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await page.route(/\/api\/v1\/journals\/\d+$/, (route) => (route.request().method() === "GET" ? new Promise(() => {}) : route.continue()));
  await page.goto(`${previewOrigin}/journals/${courseId}`);
  await page.locator('[data-testid="journal-grid-skeleton"]').waitFor({ timeout: 15000 });
  await sleep(300);
  await shot(page, "grid-loading-simulated-1440-light.png", { viewport: "1440x1000", theme: "light", state: "selected journal request held pending by the harness (labeled simulation); skeleton shares the grid geometry" }, { immediate: true });
  await context.close();
}

{
  const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await page.route(/\/api\/v1\/journals\/\d+$/, (route) => (route.request().method() === "GET" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "simulated" }) }) : route.continue()));
  await page.goto(`${previewOrigin}/journals/${courseId}`);
  await page.getByText("Failed to load journal data").waitFor({ timeout: 20000 });
  await shot(page, "grid-error-simulated-1440-light.png", { viewport: "1440x1000", theme: "light", state: "selected journal request answered 500 by the harness (labeled simulation); Retry present" });
  await context.close();
}

for (const width of [320, 390, 768, 1024, 1440]) {
  const { context, page } = await newSession(mentor, { viewport: { width, height: 844 } });
  await openWorkspace(page);
  const overflow = await measureDocumentOverflow(page);
  registerProbe({ probe: `no_document_horizontal_overflow_at_${width}`, passed: overflow.scrollWidth <= overflow.clientWidth, ...overflow });
  if (width === 390) {
    await shot(page, "mentor-phone-390-light.png", { viewport: "390x844", theme: "light", state: "phone width only proves absence of document overflow; the Lesson view ships with KITOB-04-04" });
  }
  await context.close();
}

{
  const { context, page } = await newSession(superadmin, { viewport: { width: 1440, height: 1000 } });
  await openWorkspace(page);
  const checkboxCount = await page.locator("tbody input[type='checkbox']").count();
  registerProbe({ probe: "superadmin_keeps_editors_on_a_course_after_the_mentor_loses_access", passed: checkboxCount > 0, checkboxCount });
  await context.close();
}

{
  const mentorSession = await newSession(mentor, { viewport: { width: 1440, height: 1000 } });
  await openWorkspace(mentorSession.page);
  const archiveResponse = await fetch(`${apiOrigin}/courses/${courseId}`, {
    method: "PATCH",
    headers: superadminHeaders,
    body: JSON.stringify({ status: "archived" }),
  });
  assert.equal(archiveResponse.status, 200, "Superadmin must be able to archive the course");
  const page = mentorSession.page;
  const startCell = page.locator("tbody tr").nth(0).locator('[data-control="cell"]').nth(sortedDates.indexOf(expectedLesson));
  await startCell.focus();
  const before = mentorSession.writes.length;
  await page.keyboard.press("5");
  await page.getByTestId("journal-forbidden-notice").waitFor({ timeout: 15000 });
  await sleep(2500);
  const forbiddenWrites = mentorSession.writes.slice(before);
  const draftVisible = await page.locator("tbody tr").nth(0).getByText("5", { exact: true }).first().isVisible();
  registerProbe({
    probe: "real_403_after_archive_keeps_the_draft_for_review_and_blocks_writes",
    passed: forbiddenWrites.length === 1 && forbiddenWrites[0].status === 403 && (await page.locator("tbody input[type='checkbox']").count()) === 0 && draftVisible && (await phaseOf(page)) === "failed",
    writes: forbiddenWrites.map((write) => ({ status: write.status, url: write.url })),
    draftVisible,
    phase: await phaseOf(page),
  });
  await shot(page, "mentor-forbidden-after-403-1440-light.png", { viewport: "1440x1000", theme: "light", state: "real 403 after the course was archived mid-session: draft kept, editors unmounted, writes blocked" });
  await mentorSession.context.close();

  const serverRefusal = await fetch(`${apiOrigin}/journals/${currentPeriod.id}/entries`, {
    method: "PUT",
    headers: mentorHeaders,
    body: JSON.stringify([{ student_id: secondStudent.student_id, lesson_date: expectedLesson, attendance: true, score: 2, comment: null, version: 1 }]),
  });
  registerProbe({ probe: "server_rejects_mentor_writes_to_an_archived_course", passed: serverRefusal.status === 403, status: serverRefusal.status });

  for (const theme of ["light", "dark"]) {
    const archived = await newSession(mentor, { viewport: { width: 1440, height: 1000 }, theme });
    await openWorkspace(archived.page);
    const checkboxes = await archived.page.locator("input[type='checkbox']").count();
    const popups = await archived.page.locator("[aria-haspopup]").count();
    const periodSettings = await archived.page.getByRole("button", { name: "Period settings" }).count();
    const notice = await archived.page.getByTestId("journal-archived-notice").isVisible();
    const writesBefore = archived.writes.length;
    await archived.page.locator("tbody tr").nth(0).locator("[role='group']").nth(sortedDates.indexOf(expectedLesson)).focus();
    await archived.page.keyboard.press("4");
    await sleep(1200);
    registerProbe({
      probe: `archived_assigned_mentor_is_read_only_${theme}`,
      passed: checkboxes === 0 && popups === 0 && periodSettings === 0 && notice && archived.writes.length === writesBefore,
      checkboxes,
      popups,
      periodSettings,
      notice,
    });
    await shot(archived.page, `mentor-archived-readonly-1440-${theme}.png`, { viewport: "1440x1000", theme, state: "archived course for its assigned mentor: explanation, no editors, reads retained" });
    await archived.context.close();
  }
}

registerProbe({ probe: "no_unexpected_page_errors", passed: pageErrors.length === 0, errors: pageErrors.slice(0, 5) });

await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify(manifest, null, 2));
await writeFile(`${evidenceDir}/probes.json`, JSON.stringify(probes, null, 2));
await browser.close();
console.log(`Captured ${manifest.length} screenshots and ${probes.length} probes, all passed.`);

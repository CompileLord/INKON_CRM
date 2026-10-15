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

const evidenceDir = resolve("../docs/redesign-execution/group-04/user-feedback/evidence/grid");
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

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
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
  const context = await browser.newContext({ viewport, ...(viewport.width <= 768 ? { isMobile: true, hasTouch: true } : {}) });
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

async function openLesson(page) {
  await page.goto(`${previewOrigin}/journals/${courseId}`);
  await page.locator("[data-lesson-row]").first().waitFor({ state: "visible", timeout: 20000 });
  await sleep(400);
}

const docOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [width, height] of [[1440, 520], [1024, 520]]) {
  for (const theme of ["light", "dark"]) {
    const { context, page } = await newSession(mentor, { viewport: { width, height }, theme });
    await openWorkspace(page);
    const metrics = await page.evaluate(() => {
      const body = document.querySelector('[data-testid="journal-grid-region"]');
      return { bodyClientHeight: body.clientHeight, bodyScrollHeight: body.scrollHeight, overflowY: getComputedStyle(body).overflowY, documentHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight };
    });
    registerProbe({ probe: `grid_has_no_vertical_scroll_of_its_own_${width}_${theme}`, passed: metrics.bodyScrollHeight <= metrics.bodyClientHeight + 1 && metrics.overflowY === "hidden" && metrics.documentHeight > metrics.innerHeight, ...metrics });
    await page.evaluate(() => { const strip = document.querySelector('[data-testid="journal-grid-header"]'); const shell = document.querySelector("header.sticky"); window.scrollTo(0, strip.getBoundingClientRect().top + window.scrollY - shell.getBoundingClientRect().bottom + 40); });
    await sleep(300);
    const body = page.locator('[data-testid="journal-grid-region"]');
    await body.evaluate((node) => { node.scrollLeft = 400; });
    await sleep(300);
    const stuck = await page.evaluate(() => {
      const header = document.querySelector('[data-testid="journal-grid-header"]');
      const shell = document.querySelector("header.sticky");
      const headerBox = header.getBoundingClientRect();
      const bodyNode = document.querySelector('[data-testid="journal-grid-region"]');
      const firstHeadCell = header.querySelector("th[aria-current='date']") ?? header.querySelectorAll("th")[3];
      const lessonKey = firstHeadCell.querySelector("button").textContent;
      const cellIndex = Array.from(header.querySelectorAll("th")).indexOf(firstHeadCell);
      const bodyCell = bodyNode.querySelector("tbody tr").children[cellIndex];
      const bar = document.querySelector('[data-testid="journal-grid-scrollbar"]');
      const barBox = bar.getBoundingClientRect();
      const corner = header.querySelector("th");
      const row = bodyNode.querySelector("tbody th");
      return {
        scrollY: Math.round(window.scrollY),
        headerTopMinusShellBottom: Math.round(headerBox.top - shell.getBoundingClientRect().bottom),
        horizontalMisalignment: Math.round(Math.abs(firstHeadCell.getBoundingClientRect().left - bodyCell.getBoundingClientRect().left)),
        headerScrollLeft: Math.round(header.scrollLeft),
        bodyScrollLeft: Math.round(bodyNode.scrollLeft),
        barBottomMinusViewport: Math.round(window.innerHeight - barBox.bottom),
        barScrollLeft: Math.round(bar.scrollLeft),
        cornerLeftOffset: Math.round(corner.getBoundingClientRect().left - header.getBoundingClientRect().left),
        studentColumnLeftOffset: Math.round(row.getBoundingClientRect().left - bodyNode.getBoundingClientRect().left),
        lessonKey: lessonKey.replace(/\n/g, " "),
      };
    });
    registerProbe({
      probe: `header_sticks_under_shell_stays_aligned_and_bar_sticks_to_viewport_bottom_${width}_${theme}`,
      passed: stuck.scrollY > 250 && Math.abs(stuck.headerTopMinusShellBottom) <= 2 && stuck.horizontalMisalignment <= 1 && stuck.headerScrollLeft === stuck.bodyScrollLeft && stuck.bodyScrollLeft > 0 && stuck.barBottomMinusViewport <= 2 && stuck.barScrollLeft === stuck.bodyScrollLeft && stuck.cornerLeftOffset <= 1 && stuck.studentColumnLeftOffset <= 1,
      ...stuck,
    });
    registerProbe({ probe: `no_document_overflow_${width}_${theme}`, passed: (await docOverflow(page)) <= 0 });
    await shot(page, `grid-scrolled-${width}-${theme}.png`, { viewport: `${width}x${height}`, theme, state: `page scrolled ${stuck.scrollY}px and grid scrolled sideways ${stuck.bodyScrollLeft}px: header stuck under the shell header, aligned with the body; student column pinned; horizontal scrollbar stuck at the viewport bottom` });
    await context.close();
  }
}

for (const theme of ["light", "dark"]) {
  const { context, page, writes } = await newSession(mentor, { viewport: { width: 1440, height: 800 }, theme });
  await openWorkspace(page);
  const row = page.locator("tbody tr").nth(0);
  const cell = row.locator('[data-control="cell"]').nth(sortedDates.indexOf(expectedLesson));
  await cell.locator('[data-control="score"]').click();
  const menu = page.getByRole("menu", { name: /Score for/ });
  await menu.waitFor();
  const info = await menu.evaluate((node) => {
    const popover = node.parentElement;
    const box = popover.getBoundingClientRect();
    const choices = Array.from(node.querySelectorAll("button")).map((button) => { const b = button.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top) }; });
    return { text: popover.textContent, width: Math.round(box.width), height: Math.round(box.height), choices, dialogs: document.querySelectorAll('[role="dialog"]').length, closeButtons: popover.querySelectorAll('[aria-label="Close"]').length };
  });
  registerProbe({ probe: `desktop_popover_is_a_single_row_of_six_small_choices_${theme}`, passed: info.text === "012345" && info.height <= 56 && info.width <= 260 && info.choices.length === 6 && new Set(info.choices.map((c) => c.top)).size === 1 && info.choices.every((c) => c.w >= 34 && c.w <= 40) && info.dialogs === 0 && info.closeButtons === 0, ...info });
  await shot(page, `grid-score-popover-1440-${theme}.png`, { viewport: "1440x800", theme, state: "minimal grade popover anchored to the score cell: only six choices, current score highlighted" }, { immediate: true });
  if (theme === "light") {
    await page.keyboard.press("ArrowRight");
    const roved = await page.evaluate(() => document.activeElement?.textContent);
    await page.keyboard.press("Escape");
    registerProbe({ probe: "popover_arrow_roving_and_escape_change_nothing", passed: roved !== null && (await page.getByRole("menu").count()) === 0 && writes.length === 0, roved, writes: writes.length });
    await cell.focus();
    await page.keyboard.press("3");
    await page.waitForFunction(() => document.querySelector('[data-testid="journal-save-status"]')?.getAttribute("data-phase") === "saved", null, { timeout: 15000 });
    registerProbe({ probe: "digit_key_still_grades_from_the_cell", passed: writes.length === 1 && writes[0].body[0].score === 3 });
  }
  await context.close();
}

for (const [width, height] of [[390, 844], [320, 640]]) {
  for (const theme of ["light", "dark"]) {
    const { context, page, writes } = await newSession(mentor, { viewport: { width, height }, theme });
    await openLesson(page);
    const row = page.locator("[data-lesson-row]").nth(0);
    await row.getByRole("button", { name: /Score for/ }).click();
    const menu = row.getByRole("menu");
    await menu.waitFor();
    const geometry = await row.evaluate((node) => {
      const menuNode = node.querySelector('[role="menu"]');
      const actions = node.querySelector(".flex-wrap");
      const choices = Array.from(menuNode.querySelectorAll("button")).map((button) => { const b = button.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top) }; });
      return { dialogs: document.querySelectorAll('[role="dialog"]').length, text: menuNode.textContent, menuTop: Math.round(menuNode.getBoundingClientRect().top), actionsBottom: Math.round(actions.getBoundingClientRect().bottom), choices, menuRight: Math.round(menuNode.getBoundingClientRect().right), docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    registerProbe({ probe: `phone_inline_row_of_six_44px_choices_under_the_action_line_${width}_${theme}`, passed: geometry.dialogs === 0 && geometry.text === "012345" && geometry.choices.length === 6 && geometry.choices.every((c) => c.w >= 44 && c.h >= 44) && new Set(geometry.choices.map((c) => c.top)).size === 1 && geometry.menuTop >= geometry.actionsBottom && geometry.menuRight <= width && geometry.docOverflow <= 0, ...geometry });
    await shot(page, `lesson-score-inline-${width}-${theme}.png`, { viewport: `${width}x${height}`, theme, state: "inline row of six 44px score choices directly under the student's action line; no dialog" });
    if (theme === "light" && width === 390) {
      await page.mouse.click(10, 300);
      await sleep(200);
      registerProbe({ probe: "tapping_elsewhere_collapses_the_inline_choices_without_a_write", passed: (await row.getByRole("menu").count()) === 0 && writes.length === 0 });
      await row.getByRole("button", { name: /Score for/ }).click();
      await row.getByRole("menuitemradio", { name: "5", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="journal-save-status"]')?.getAttribute("data-phase") === "saved", null, { timeout: 15000 });
      registerProbe({ probe: "choosing_collapses_the_row_and_queues_one_write", passed: (await row.getByRole("menu").count()) === 0 && writes.length === 1 && writes[0].body[0].score === 5 });
    }
    await context.close();
  }
}

for (const [lng, width, height] of [["ru", 1440, 800], ["ru", 390, 844], ["tg", 1440, 800], ["tg", 390, 844]]) {
  for (const theme of ["light", "dark"]) {
    const { context, page } = await newSession(mentor, { lng, viewport: { width, height }, theme });
    if (width <= 768) await openLesson(page);
    else await openWorkspace(page);
    await page.getByRole("combobox").first().click();
    const listbox = page.getByRole("listbox");
    await listbox.waitFor();
    await sleep(350);
    const info = await listbox.evaluate((node) => {
      const options = Array.from(node.querySelectorAll('[role="option"]')).map((option) => { const b = option.getBoundingClientRect(); return { h: Math.round(b.height), selected: option.getAttribute("aria-selected"), check: Boolean(option.querySelector("svg")), text: option.textContent }; });
      const box = node.getBoundingClientRect();
      return { options, left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top), bottom: Math.round(box.bottom), vw: window.innerWidth, vh: window.innerHeight, radius: getComputedStyle(node).borderRadius, shadow: getComputedStyle(node).boxShadow !== "none", docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    registerProbe({ probe: `period_listbox_open_${lng}_${width}_${theme}`, passed: info.options.length >= 3 && info.options.every((o) => o.h >= 44) && info.options.filter((o) => o.selected === "true" && o.check).length === 1 && info.left >= 0 && info.right <= info.vw && info.bottom <= info.vh && info.shadow && info.docOverflow <= 0, ...info });
    await shot(page, `period-listbox-open-${lng}-${width}-${theme}.png`, { viewport: `${width}x${height}`, theme, locale: lng, state: "custom period listbox: rounded card panel, 44px rows with label, muted range, timing chip and a check on the selected row" });
    await context.close();
  }
}

{
  const { context, page } = await newSession(mentor, { viewport: { width: 1440, height: 900 } });
  await openWorkspace(page);
  const trigger = page.getByRole("combobox").first();
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const roving = await page.evaluate(() => document.activeElement?.getAttribute("role"));
  await page.keyboard.press("Home");
  await page.keyboard.press("Escape");
  const focusBack = await page.evaluate(() => document.activeElement?.getAttribute("role"));
  registerProbe({ probe: "listbox_keyboard_open_and_escape_returns_focus_to_the_trigger", passed: roving === "listbox" && focusBack === "combobox" && new URL(page.url()).search === "", roving, focusBack });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await page.waitForURL(/period=/, { timeout: 8000 });
  await sleep(100);
  const transition = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="journal-period-transition"]');
    const animations = node.getAnimations().map((animation) => { const timing = animation.effect.getTiming(); return { duration: timing.duration, easing: timing.easing, properties: Object.keys(animation.effect.getKeyframes()[0]).filter((key) => !["offset", "easing", "composite", "computedOffset"].includes(key)) }; });
    return { direction: node.getAttribute("data-direction"), animations };
  });
  registerProbe({ probe: "period_change_slides_content_in_the_direction_of_travel_over_200ms_on_transform_and_opacity", passed: transition.direction === "earlier" && transition.animations.some((a) => a.duration === 200 && a.easing === "cubic-bezier(0.16, 1, 0.3, 1)" && a.properties.every((p) => p === "opacity" || p === "transform")), ...transition });
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  const page = await context.newPage();
  await page.goto(`${previewOrigin}/login`);
  await page.locator("#email").fill(mentor.email);
  await page.locator("#password").fill(fixtures.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  await openWorkspace(page);
  await page.getByRole("combobox").first().click();
  await page.getByRole("option").first().click();
  await page.waitForURL(/period=/, { timeout: 8000 });
  await sleep(60);
  const reduced = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="journal-period-transition"]');
    return node.getAnimations().map((animation) => Object.keys(animation.effect.getKeyframes()[0]).filter((key) => !["offset", "easing", "composite", "computedOffset"].includes(key)));
  });
  registerProbe({ probe: "reduced_motion_period_change_has_no_transform_movement", passed: reduced.every((keys) => !keys.includes("transform")), reduced });
  await context.close();
}

registerProbe({ probe: "no_unexpected_page_errors", passed: pageErrors.length === 0, errors: pageErrors.slice(0, 5) });
await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify(manifest, null, 2));
await writeFile(`${evidenceDir}/probes.json`, JSON.stringify(probes, null, 2));
await browser.close();
console.log(`Captured ${manifest.length} screenshots and ${probes.length} probes, all passed.`);

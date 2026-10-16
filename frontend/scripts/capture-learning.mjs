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

const evidenceDir = resolve("../docs/redesign-execution/group-06/learning/evidence");
const screenshotsDir = `${evidenceDir}/screenshots`;
await mkdir(screenshotsDir, { recursive: true });

const quick = process.env.KITOB_CAPTURE_MODE === "quick";
const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5461";
const apiOrigin = `${fixtures.api_origin}/api/v1`;
const identityByEmail = (email) => fixtures.identities.find((item) => item.email === email);
const student = identityByEmail("student@kitob.example.com");
const zara = identityByEmail("zara@kitob.example.com");
const emptyStudent = identityByEmail("empty.student@kitob.example.com");
const mentor = fixtures.identities.find((item) => item.role === "mentor" && !item.forced && item.email === "mentor@kitob.example.com");
const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
assert.ok(student && zara && emptyStudent && mentor && superadmin, "Fixture identities must exist");

const PEER_COMMENT = "PEER-PRIVATE-COMMENT-MUST-NOT-LEAK";
const OWN_COMMENT = "Great progress this week, keep practising the loops and the exercises at home.";

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
const studentHeaders = await apiLogin(student);

async function createCourse(title, schedules, mentorId = mentor.id) {
  const response = await fetch(`${apiOrigin}/courses/`, {
    method: "POST",
    headers: superadminHeaders,
    body: JSON.stringify({
      title,
      description:
        "A practical course that combines weekly lessons, homework and a monthly exam. You will work in small groups, receive written feedback from your mentor and track every result in the class journal. Bring a laptop to every lesson.",
      start_date: "2026-08-03",
      end_date: "2026-12-31",
      exam_type: "monthly",
      price: "100.00",
      mentor_id: mentorId,
      schedules,
    }),
  });
  assert.equal(response.status, 201, `Course ${title} must be created`);
  return (await response.json()).id;
}

async function enroll(studentId, courseId) {
  const response = await fetch(`${apiOrigin}/enrollments/`, {
    method: "POST",
    headers: superadminHeaders,
    body: JSON.stringify({ student_id: studentId, course_id: courseId }),
  });
  assert.ok([201, 409].includes(response.status), `Enrollment must succeed, got ${response.status}`);
  return response.status === 201 ? response.json() : null;
}

const mondayWednesdayFriday = [0, 2, 4].map((day) => ({ day_of_week: day, time_start: "09:00:00", time_end: "10:30:00" }));
const algebraId = await createCourse("Applied Algebra and Statistics for Advanced Learners", mondayWednesdayFriday);
const studySkillsId = await createCourse("Study Skills", [{ day_of_week: 1, time_start: "14:00:00", time_end: "15:30:00" }]);

const classmates = fixtures.identities.filter((item) => item.role === "student" && item.id !== emptyStudent.id);
for (const identity of classmates) await enroll(identity.id, algebraId);
const studySkillsEnrollment = await enroll(student.id, studySkillsId);
assert.ok(studySkillsEnrollment, "Study Skills enrollment must be new");
const withdraw = await fetch(`${apiOrigin}/enrollments/${studySkillsEnrollment.id}/withdraw`, { method: "PATCH", headers: superadminHeaders, body: JSON.stringify({}) });
assert.ok([200, 204].includes(withdraw.status), `Withdrawal must succeed, got ${withdraw.status}`);

const periods = await (await fetch(`${apiOrigin}/courses/${algebraId}/journals`, { headers: mentorHeaders })).json();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dushanbe", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const startedPeriods = periods.filter((period) => period.period_start <= today);
const upcomingPeriods = periods.filter((period) => period.period_start > today);
const currentPeriod = periods.find((period) => period.period_start <= today && today <= period.period_end);
assert.ok(currentPeriod && startedPeriods.length >= 3 && upcomingPeriods.length > 0, "Started, current and upcoming periods are required");

async function getDetail(journalId) {
  const response = await fetch(`${apiOrigin}/journals/${journalId}`, { headers: mentorHeaders });
  assert.equal(response.status, 200);
  return response.json();
}

async function gradePeriod(period, periodNumber) {
  const detail = await getDetail(period.id);
  for (const [position, record] of detail.students.entries()) {
    const payload = detail.lesson_dates
      .filter((date) => date <= today)
      .map((date, dateIndex) => {
        const entry = record.entries.find((candidate) => candidate.lesson_date === date);
        const score = (position * 2 + periodNumber * 3 + dateIndex) % 6;
        const isStudent = record.student_id === student.id;
        return {
          student_id: record.student_id,
          lesson_date: date,
          version: entry.version,
          comment: isStudent ? (dateIndex === 0 ? OWN_COMMENT : dateIndex === 1 ? "Well done." : null) : dateIndex === 0 ? PEER_COMMENT : null,
          attendance: score > 0 || dateIndex % 2 === 0,
          score: isStudent ? Math.max(score, 3) : score,
        };
      });
    if (payload.length === 0) continue;
    const response = await fetch(`${apiOrigin}/journals/${period.id}/entries`, { method: "PUT", headers: mentorHeaders, body: JSON.stringify(payload) });
    assert.equal(response.status, 200);
  }
  const refreshed = await getDetail(period.id);
  for (const [position, record] of refreshed.students.entries()) {
    if (!record.summary) continue;
    const exam = Math.min(refreshed.exam_max_score, Math.floor((((position * 9 + periodNumber * 13) % 100) / 100) * refreshed.exam_max_score));
    const response = await fetch(`${apiOrigin}/journals/${period.id}/students/${record.student_id}/summary`, {
      method: "PATCH",
      headers: mentorHeaders,
      body: JSON.stringify({ exam_score: exam, bonus_score: position % 4, version: record.summary.version }),
    });
    assert.equal(response.status, 200);
  }
}
for (const [index, period] of startedPeriods.entries()) await gradePeriod(period, index + 1);

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];
const pageErrors = [];
const classResponses = [];

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
  await settle(page);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.screenshot({ path: `${screenshotsDir}/${filename}`, timeout: 45000, ...options });
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
  page.on("response", async (response) => {
    if (/\/journals\/\d+\/class$/.test(response.url()) && response.status() === 200) {
      classResponses.push(await response.text());
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

const overflowOf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function goto(page, path, readyTestId) {
  await page.goto(`${previewOrigin}${path}`);
  if (readyTestId) await page.getByTestId(readyTestId).first().waitFor({ timeout: 20000 });
  await sleep(500);
}

async function bottomClearance(page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await sleep(300);
  return page.evaluate(() => {
    const nav = document.querySelector("nav[aria-label]:not([aria-label=''])[class*='fixed']");
    const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    const main = document.querySelector("main");
    const last = Array.from(main.querySelectorAll("*")).filter((node) => node.getBoundingClientRect().height > 0).reduce((maximum, node) => Math.max(maximum, node.getBoundingClientRect().bottom), 0);
    return { navTop: Math.round(navTop), lastContentBottom: Math.round(last), navVisible: Boolean(nav) && getComputedStyle(nav).display !== "none" };
  });
}

const journalPath = `/my/journal/${currentPeriod.id}`;
const olderPeriod = startedPeriods[0];
const sizes = quick ? [[1440, 1000], [390, 844]] : [[1440, 1000], [390, 844]];
const themes = quick ? ["light"] : ["light", "dark"];

for (const [width, height] of sizes) {
  for (const theme of themes) {
    const tag = `${width}-${theme}`;
    const meta = (state) => ({ viewport: `${width}x${height}`, theme, state });
    const phone = width < 600;

    {
      const { context, page } = await newSession(student, { viewport: { width, height }, theme });
      await goto(page, "/my/courses", "course-score");
      const cards = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('main a[href^="/my/courses/"]'));
        return {
          links: links.length,
          hrefs: links.map((link) => link.getAttribute("href")),
          columns: new Set(links.map((link) => Math.round(link.getBoundingClientRect().left))).size,
          nested: links.filter((link) => link.querySelector("a, button")).length,
          tabs: Array.from(document.querySelectorAll('[role="tab"]')).map((tab) => ({ text: tab.textContent.trim(), height: Math.round(tab.getBoundingClientRect().height) })),
          covers: document.querySelectorAll('[data-testid="course-cover"]').length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          scrollsInsideMain: document.querySelector("main").scrollHeight > document.querySelector("main").clientHeight + 1 && getComputedStyle(document.querySelector("main")).overflowY !== "visible",
        };
      });
      registerProbe({ probe: `courses_${tag}_one_link_per_course_${phone ? "single" : "three"}_column_grid_tabs_44px_no_overflow`, passed: cards.links >= 3 && new Set(cards.hrefs).size === cards.links && cards.nested === 0 && (phone ? cards.columns === 1 : cards.columns === 3) && cards.tabs.every((tab) => tab.height >= 44) && cards.overflow <= 0 && !cards.scrollsInsideMain, ...cards });
      await shot(page, `courses-active-${tag}.png`, meta("My courses, Active: 16:9 covers with initials fallback, band-colored score with slim bar, stepper dots, teacher avatar line, segmented tabs with counts"), { fullPage: true });
      if (phone) {
        const clearance = await bottomClearance(page);
        registerProbe({ probe: `courses_${tag}_bottom_navigation_never_covers_the_last_card`, passed: clearance.navVisible && clearance.lastContentBottom <= clearance.navTop, ...clearance });
      }
      const cardScore = await page.evaluate(() => {
        const card = Array.from(document.querySelectorAll('main a[href^="/my/courses/"]')).find((link) => link.textContent.includes("Applied Algebra"));
        const python = Array.from(document.querySelectorAll('main a[href^="/my/courses/"]')).find((link) => link.textContent.includes("Python Fundamentals"));
        return { algebra: card?.querySelector('[data-testid="course-score"]')?.textContent.trim(), python: python?.querySelector('[data-testid="course-score"]')?.textContent.trim(), covers: document.querySelectorAll('[data-testid="course-cover"]').length, initials: document.querySelectorAll('[data-testid="course-initials"]').length };
      });
      registerProbe({ probe: `courses_${tag}_card_scores_use_graded_period_average_and_ungraded_reads_not_graded_yet`, passed: cardScore.python === "Not graded yet" && /^\d+%$/.test(cardScore.algebra ?? "") && cardScore.covers + cardScore.initials === 5 && cardScore.initials >= 3, ...cardScore });
      await page.getByRole("tab", { name: /Archive/ }).click();
      await page.waitForURL(/bucket=archive/);
      await sleep(400);
      const archiveInfo = await page.evaluate(() => ({ chips: Array.from(document.querySelectorAll('[data-testid="course-status-chip"]')).map((chip) => chip.textContent.trim()), cards: document.querySelectorAll('main a[href^="/my/courses/"]').length }));
      registerProbe({ probe: `courses_${tag}_archive_bucket_in_url_lists_archived_and_withdrawn_with_status_chip`, passed: archiveInfo.cards >= 2 && archiveInfo.chips.length === archiveInfo.cards, ...archiveInfo });
      await shot(page, `courses-archive-${tag}.png`, meta("Archive bucket via ?bucket=archive: status chip (Archived / Withdrawn), muted tint"), { fullPage: true });
      await page.goBack();
      await page.waitForURL((url) => !url.search.includes("archive"));
      registerProbe({ probe: `courses_${tag}_browser_back_restores_active_bucket`, passed: (await page.getByRole("tab", { name: /Active/ }).getAttribute("aria-selected")) === "true" });
      await context.close();
    }

    {
      const { context, page } = await newSession(student, { viewport: { width, height }, theme });
      await goto(page, `/my/courses/${algebraId}`, "course-stats");
      await page.getByTestId("period-list").waitFor({ timeout: 20000 });
      await page.getByTestId("progress-chart").waitFor({ timeout: 20000 });
      await sleep(600);
      const detail = await page.evaluate(() => ({
        tiles: Array.from(document.querySelectorAll('[data-testid="course-stats"] > div')).map((tile) => tile.textContent.trim()),
        periodLinks: Array.from(document.querySelectorAll('[data-testid="period-list"] a')).map((link) => link.getAttribute("href")),
        upcomingRows: document.querySelectorAll('[data-testid="period-row-upcoming"]').length,
        upcomingLinks: document.querySelectorAll('[data-testid="period-row-upcoming"] a').length,
        latestChips: document.querySelectorAll('[data-testid="latest-period-chip"]').length,
        scoreChips: Array.from(document.querySelectorAll('[data-testid="period-score-chip"]')).map((chip) => chip.getAttribute("data-band")),
        schedule: document.querySelector('[data-testid="schedule-line"]')?.textContent.trim(),
        nextLesson: document.querySelector('[data-testid="next-lesson-chip"]')?.textContent.trim(),
        selfLegend: Array.from(document.querySelectorAll('[data-testid="progress-legend"] ul button')).map((button) => button.textContent.trim()),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      registerProbe({ probe: `detail_${tag}_four_stat_tiles_one_latest_chip_upcoming_without_link_schedule_and_next_chip`, passed: detail.tiles.length === 4 && detail.latestChips === 1 && detail.periodLinks.length === startedPeriods.length && detail.upcomingRows === upcomingPeriods.length && detail.upcomingLinks === 0 && detail.periodLinks.every((href) => href.startsWith("/my/journal/")) && /Mon · Wed · Fri 09:00–10:30/.test(detail.schedule ?? "") && /^Next: /.test(detail.nextLesson ?? "") && detail.overflow <= 0, ...detail });
      registerProbe({ probe: `detail_${tag}_progress_chart_selects_own_line_first_with_you_badge`, passed: /You/.test(detail.selfLegend[1] ?? "") , legend: detail.selfLegend });
      const agreement = await page.evaluate(() => {
        const tile = document.querySelector('[data-testid="stat-score-value"]')?.textContent.trim();
        const cells = Array.from(document.querySelectorAll('[data-testid="student-row"][data-self="true"] td')).map((cell) => cell.textContent.trim());
        return { tile, tableAverage: cells[cells.length - 2] };
      });
      registerProbe({ probe: `detail_${tag}_score_tile_equals_the_class_table_average_of_the_own_row`, passed: Boolean(agreement.tile) && agreement.tile === agreement.tableAverage, ...agreement });
      await shot(page, `course-detail-${tag}.png`, meta("Course detail: breadcrumb, meta line with schedule, teacher, Next chip, four icon tiles, compact period rows with band chips, class progress chart with own line, collapsed About"), { fullPage: true });
      if (phone) {
        const clearance = await bottomClearance(page);
        registerProbe({ probe: `detail_${tag}_bottom_navigation_never_covers_the_last_section`, passed: clearance.navVisible && clearance.lastContentBottom <= clearance.navTop, ...clearance });
        await shot(page, `course-detail-bottom-${tag}.png`, meta("Course detail scrolled to the very end: About section fully above the bottom navigation"));
      }
      await page.getByRole("button", { name: /Read more/ }).click();
      await sleep(250);
      registerProbe({ probe: `detail_${tag}_about_toggle_expands_description`, passed: (await page.getByRole("button", { name: /Collapse/ }).getAttribute("aria-expanded")) === "true" });
      await context.close();
    }

    {
      const { context, page } = await newSession(student, { viewport: { width, height }, theme });
      await goto(page, journalPath, "period-summary");
      await sleep(900);
      const journal = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('[data-testid="journal-grid-region"] tbody tr'));
        const lessonRows = Array.from(document.querySelectorAll("[data-lesson-row]"));
        const controls = document.querySelectorAll('[data-testid="journal-grid-region"] input, [data-testid="journal-grid-region"] [data-control], [data-lesson-row] input, [data-lesson-row] [data-control]').length;
        const text = document.body.innerText;
        return {
          rows: rows.length,
          firstSelf: rows[0]?.getAttribute("data-self") === "true",
          lessonRows: lessonRows.length,
          firstLessonSelf: lessonRows[0]?.getAttribute("data-self") === "true",
          selfRows: document.querySelectorAll('[data-self="true"]').length,
          editControls: controls,
          peerLeak: text.includes("PEER-PRIVATE"),
          ownNote: document.querySelectorAll('[data-testid="own-note"]').length,
          summary: document.querySelector('[data-testid="period-total"]')?.textContent,
          contributions: Array.from(document.querySelectorAll('[data-testid="period-contributions"] dd')).length,
          rank: document.querySelector('[data-testid="period-rank"]')?.textContent.trim(),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          readOnlyBadge: Boolean(document.querySelector('[data-testid="read-only-badge"]')),
          saveMarkers: document.querySelectorAll('[data-testid="journal-save-marker"], [data-save-status]').length,
        };
      });
      registerProbe({ probe: `journal_${tag}_read_only_own_row_pinned_first_no_edit_controls_no_peer_comment`, passed: (phone ? journal.firstLessonSelf && journal.lessonRows >= 5 : journal.firstSelf && journal.rows >= 5) && journal.selfRows === 1 && journal.editControls === 0 && !journal.peerLeak && journal.ownNote >= 1 && journal.contributions === 4 && journal.overflow <= 0 && journal.readOnlyBadge && journal.saveMarkers === 0, ...journal });
      await shot(page, `journal-gradebook-${tag}.png`, meta(phone ? "Student period: score summary with icon legend and rank chip, read-only Lesson view with the student's row pinned first and highlighted, mentor notes" : "Student period: score summary, read-only class grid with names and scores, own row pinned first and highlighted, mentor notes"), { fullPage: true });
      if (phone) {
        const clearance = await bottomClearance(page);
        registerProbe({ probe: `journal_${tag}_bottom_navigation_never_covers_the_notes`, passed: clearance.navVisible && clearance.lastContentBottom <= clearance.navTop, ...clearance });
      }
      await context.close();
    }

    {
      const { context, page } = await newSession(student, { viewport: { width, height }, theme });
      await goto(page, `${journalPath}?tab=progress`, "progress-chart");
      await sleep(700);
      const progress = await page.evaluate(() => ({
        legend: Array.from(document.querySelectorAll('[data-testid="progress-legend"] ul button')).map((button) => button.textContent.trim()),
        visible: document.querySelectorAll('[data-testid="chart-series-student"][data-visible="true"]').length,
        selfRowFirst: document.querySelector('[data-testid="student-row"]')?.getAttribute("data-self") === "true",
        more: document.querySelector('[data-testid="legend-more"]')?.textContent.trim(),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      registerProbe({ probe: `progress_${tag}_own_line_selected_by_default_pinned_first_and_table_row_highlighted`, passed: /You/.test(progress.legend[1] ?? "") && progress.selfRowFirst && progress.visible >= 6 && progress.overflow <= 0, ...progress });
      await shot(page, `journal-progress-${tag}.png`, meta("Period Progress tab: the same chart and table as the mentor, read-only; own line selected first with You badge, thicker line, own table row pinned and highlighted"), { fullPage: true });
      await context.close();
    }
  }
}

if (!quick) {
  {
    const { context, page } = await newSession(zara, { viewport: { width: 1440, height: 1000 } });
    await goto(page, "/my/courses?bucket=archive", "bucket-count-archive");
    await sleep(500);
    const emptyArchive = await page.evaluate(() => ({ text: document.querySelector("main").innerText, buttons: Array.from(document.querySelectorAll("main button")).map((button) => button.textContent.trim()) }));
    registerProbe({ probe: "courses_empty_archive_explains_and_offers_one_return_to_active_action", passed: /Nothing archived yet/.test(emptyArchive.text) && emptyArchive.buttons.filter((label) => /Back to active courses/.test(label)).length === 1, ...emptyArchive });
    await shot(page, "courses-archive-empty-1440-light.png", { viewport: "1440x1000", theme: "light", state: "Empty archive: one short sentence and Back to active courses" });
    await page.getByRole("button", { name: /Back to active courses/ }).click();
    await page.waitForURL((url) => !url.search.includes("archive"));
    registerProbe({ probe: "courses_return_to_active_action_switches_bucket", passed: (await page.getByRole("tab", { name: /Active/ }).getAttribute("aria-selected")) === "true" });
    await context.close();
  }
  {
    const { context, page } = await newSession(emptyStudent, { viewport: { width: 1440, height: 1000 } });
    await goto(page, "/my/courses", "bucket-count-active");
    await sleep(500);
    registerProbe({ probe: "courses_empty_active_explains_why_and_what_happens_next", passed: /not enrolled/i.test(await page.locator("main").innerText()) });
    await shot(page, "courses-active-empty-1440-light.png", { viewport: "1440x1000", theme: "light", state: "Student with no enrollments: explained empty state" });
    await context.close();
  }
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const tag = `${width}-light`;
    {
      const { context, page } = await newSession(student, { viewport: { width, height } });
      await page.route(/\/students\/me\/profile$/, async (route) => {
        await sleep(2500);
        await route.continue();
      });
      await page.goto(`${previewOrigin}/my/courses`);
      await page.getByTestId("courses-skeleton").waitFor({ timeout: 10000 });
      const geometry = await page.evaluate(() => ({ cards: document.querySelectorAll('[data-testid="courses-skeleton"] > div').length, tabCountsPlaceholder: Array.from(document.querySelectorAll('[data-testid^="bucket-count"]')).map((node) => node.textContent) }));
      registerProbe({ probe: `courses_${tag}_loading_skeleton_matches_card_grid_and_never_shows_zero_counts`, passed: geometry.cards === 3 && geometry.tabCountsPlaceholder.every((text) => text === "–"), ...geometry });
      await shot(page, `courses-loading-simulated-${tag}.png`, { viewport: `${width}x844`, theme: "light", state: "Labeled simulation: profile response delayed 2.5 s. Skeleton in the card grid geometry, counts shown as dashes not zeros" });
      await context.close();
    }
    {
      const { context, page } = await newSession(student, { viewport: { width, height } });
      let failures = 4;
      await page.route(/\/students\/me\/profile$/, (route) => {
        if (failures > 0) {
          failures -= 1;
          return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "simulated" }) });
        }
        return route.continue();
      });
      await page.goto(`${previewOrigin}/my/courses`);
      const retry = page.getByRole("button", { name: "Retry" });
      await retry.waitFor({ timeout: 20000 });
      await shot(page, `courses-error-simulated-${tag}.png`, { viewport: `${width}x844`, theme: "light", state: "Labeled simulation: profile answered 500, local error with Retry" });
      await retry.click();
      await page.getByTestId("course-score").first().waitFor({ timeout: 20000 });
      registerProbe({ probe: `courses_${tag}_error_retry_recovers_the_list`, passed: true });
      await context.close();
    }
  }
  {
    const { context, page } = await newSession(student, { viewport: { width: 1440, height: 1000 } });
    await page.route(new RegExp(`/courses/${algebraId}/class-progress$`), (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "simulated" }) }));
    await page.route(/\/students\/me\/profile$/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "simulated" }) }));
    await page.goto(`${previewOrigin}/my/courses/${algebraId}`);
    await page.getByTestId("period-list").waitFor({ timeout: 20000 });
    await page.getByText("Could not load progress").waitFor({ timeout: 20000 });
    await sleep(500);
    const independent = await page.evaluate(() => ({ periods: document.querySelectorAll('[data-testid="period-list"] a').length, retries: Array.from(document.querySelectorAll("main button")).filter((button) => button.textContent.trim() === "Retry").length, stats: document.querySelectorAll('[data-testid="course-stats"]').length }));
    registerProbe({ probe: "detail_partial_failures_keep_periods_and_period_derived_tiles_with_local_retry", passed: independent.periods >= 3 && independent.retries >= 1 && independent.stats === 1, ...independent });
    await shot(page, "course-detail-partial-failure-simulated-1440-light.png", { viewport: "1440x1000", theme: "light", state: "Labeled simulation: profile and class-progress answered 500. Periods stay usable, each failed pane has its own Retry" }, { fullPage: true });
    await context.close();
  }
  for (const lng of ["ru", "tg"]) {
    for (const [width, height] of [[1440, 1000], [390, 844]]) {
      const { context, page } = await newSession(student, { lng, viewport: { width, height } });
      await goto(page, "/my/courses", "course-score");
      registerProbe({ probe: `locale_${lng}_${width}_courses_no_overflow`, passed: (await overflowOf(page)) <= 0 });
      await shot(page, `courses-active-${lng}-${width}-light.png`, { viewport: `${width}x${height}`, theme: "light", locale: lng, state: `My courses in ${lng}` }, { fullPage: true });
      await goto(page, `/my/courses/${algebraId}`, "course-stats");
      await page.getByTestId("progress-chart").waitFor({ timeout: 20000 });
      registerProbe({ probe: `locale_${lng}_${width}_detail_no_overflow`, passed: (await overflowOf(page)) <= 0 });
      await shot(page, `course-detail-${lng}-${width}-light.png`, { viewport: `${width}x${height}`, theme: "light", locale: lng, state: `Course detail in ${lng}` }, { fullPage: true });
      await goto(page, journalPath, "period-summary");
      await sleep(700);
      registerProbe({ probe: `locale_${lng}_${width}_journal_no_overflow`, passed: (await overflowOf(page)) <= 0 });
      await shot(page, `journal-gradebook-${lng}-${width}-light.png`, { viewport: `${width}x${height}`, theme: "light", locale: lng, state: `Period journal in ${lng}` }, { fullPage: true });
      await context.close();
    }
  }
  for (const width of [320, 768, 1024]) {
    const { context, page } = await newSession(student, { viewport: { width, height: 900 } });
    for (const [name, path, ready] of [["courses", "/my/courses", "course-score"], ["detail", `/my/courses/${algebraId}`, "course-stats"], ["journal", journalPath, "period-summary"], ["progress", `${journalPath}?tab=progress`, "progress-chart"]]) {
      await goto(page, path, ready);
      await sleep(600);
      registerProbe({ probe: `width_${width}_${name}_has_no_document_overflow`, passed: (await overflowOf(page)) <= 0, overflow: await overflowOf(page) });
      if (name === "journal" || name === "detail") await shot(page, `${name}-${width}-light.png`, { viewport: `${width}x900`, theme: "light", state: `${name} at ${width}px` }, { fullPage: true });
    }
    await context.close();
  }
  {
    const { context, page } = await newSession(student, { viewport: { width: 1440, height: 1000 } });
    await goto(page, journalPath, "period-summary");
    await sleep(700);
    await page.locator('button[aria-haspopup="listbox"]').first().click();
    await page.getByRole("option").first().waitFor({ timeout: 5000 });
    await sleep(300);
    await shot(page, "journal-period-switcher-1440-light.png", { viewport: "1440x1000", theme: "light", state: "Custom period listbox open on the student journal" });
    await page.getByRole("option", { name: /Month 2/ }).click();
    await page.waitForURL(new RegExp(`/my/journal/${olderPeriod.id + 1}$|/my/journal/\\d+$`));
    await page.getByRole("heading", { level: 1, name: "Month 2" }).waitFor({ timeout: 15000 });
    registerProbe({ probe: "journal_period_switcher_moves_to_another_period_without_going_back", passed: !page.url().endsWith(`/my/journal/${currentPeriod.id}`) });
    await context.close();
  }
  {
    const { context, page } = await newSession(zara, { viewport: { width: 1440, height: 1000 } });
    const other = await fetch(`${apiOrigin}/journals/${currentPeriod.id}/class`, { headers: await apiLogin(zara) });
    registerProbe({ probe: "api_enrolled_classmate_can_read_class_journal", passed: other.status === 200 });
    await context.close();
  }
  {
    const outsider = await fetch(`${apiOrigin}/journals/${currentPeriod.id}/class`, { headers: await apiLogin(emptyStudent) });
    registerProbe({ probe: "api_non_enrolled_student_gets_403", passed: outsider.status === 403 });
    const write = await fetch(`${apiOrigin}/journals/${currentPeriod.id}/entries`, { method: "PUT", headers: studentHeaders, body: JSON.stringify([]) });
    registerProbe({ probe: "api_student_write_to_entries_is_403", passed: write.status === 403 });
    const staffOnly = await fetch(`${apiOrigin}/courses/${algebraId}/staff-progress`, { headers: studentHeaders });
    registerProbe({ probe: "api_student_staff_progress_still_403", passed: staffOnly.status === 403 });
  }
}

const leaked = classResponses.filter((body) => /PEER-PRIVATE|@kitob\.example\.com|"email"|"phone"/.test(body));
registerProbe({ probe: "class_journal_responses_never_contain_peer_comments_emails_or_phones", passed: classResponses.length > 0 && leaked.length === 0, responses: classResponses.length });
registerProbe({ probe: "no_unexpected_page_errors", passed: pageErrors.length === 0, errors: pageErrors.slice(0, 5) });

await writeFile(`${evidenceDir}/manifest${quick ? "-quick" : ""}.json`, JSON.stringify(manifest, null, 2));
await writeFile(`${evidenceDir}/probes${quick ? "-quick" : ""}.json`, JSON.stringify(probes, null, 2));
await browser.close();
console.log(`Captured ${manifest.length} screenshots and ${probes.length} probes, all passed.`);

import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import readline from "node:readline";

let input = "";
const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) {
  input = line;
  break;
}
const fixtures = JSON.parse(input);

const evidenceDir = resolve("../docs/redesign-execution/group-04/reliability/evidence");
const screenshotsDir = `${evidenceDir}/screenshots`;
await mkdir(screenshotsDir, { recursive: true });

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5209";
const apiOrigin = `${fixtures.api_origin}/api/v1`;
const mentor = fixtures.identities.find((item) => item.role === "mentor" && !item.forced);
const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
assert.ok(mentor && superadmin, "Mentor and superadmin identities must exist");

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

const enrolledStudentIds = [];
for (const identity of fixtures.identities.filter((item) => item.role === "student" && item.forced)) {
  const response = await fetch(`${apiOrigin}/enrollments/`, {
    method: "POST",
    headers: superadminHeaders,
    body: JSON.stringify({ student_id: identity.id, course_id: 1 }),
  });
  if (response.status === 201) enrolledStudentIds.push(identity.id);
  if (enrolledStudentIds.length === 2) break;
}
assert.equal(enrolledStudentIds.length, 2, "Two students must be enrolled so that journal rows exist");

const journalsList = await (await fetch(`${apiOrigin}/courses/1/journals`, { headers: mentorHeaders })).json();
const orderedJournals = [...journalsList].sort((a, b) => a.period_start.localeCompare(b.period_start));
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const targetJournal = orderedJournals.find((journal) => journal.period_end >= today) ?? orderedJournals[orderedJournals.length - 1];
const journalId = targetJournal.id;

async function getDetail() {
  const response = await fetch(`${apiOrigin}/journals/${journalId}`, { headers: mentorHeaders });
  assert.equal(response.status, 200);
  return response.json();
}

const initialDetail = await getDetail();
const studentsWithRows = initialDetail.students.filter((student) => student.entries.length === initialDetail.lesson_dates.length);
const studentsWithoutRows = initialDetail.students.filter((student) => student.entries.length === 0);
assert.ok(studentsWithRows.length >= 2, "Two students with journal rows are required");
assert.ok(studentsWithoutRows.length >= 1, "One student without journal rows is required for the unavailable entry");
const [studentA, studentB] = studentsWithRows;
const studentMissing = studentsWithoutRows[0];
const dates = initialDetail.lesson_dates;
assert.ok(dates.length >= 3, "Three lesson dates are required");

const nameOf = (student) => `${student.first_name} ${student.last_name}`;

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];
const pageErrors = [];

function registerProbe(probe) {
  if (!probe.passed) console.error("PROBE_FAIL", JSON.stringify(probe));
  assert.ok(probe.passed, `Probe failed: ${probe.probe} ${JSON.stringify(probe)}`);
  probes.push(probe);
}

async function settleAnimations(page) {
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
  if (!options.immediate) await settleAnimations(page);
  await page.screenshot({ path: `${screenshotsDir}/${filename}`, fullPage: false });
  manifest.push({ file: filename, ...meta });
}

async function useTheme(page, theme) {
  await page.evaluate((value) => {
    document.documentElement.classList.toggle("dark", value === "dark");
    document.documentElement.setAttribute("data-theme", value);
    localStorage.setItem("imkon_theme", value);
  }, theme);
}

const holdRequests = { milliseconds: 0 };
const sessionWrites = [];

async function attachRecorder(page) {
  const writes = [];
  sessionWrites.push(writes);
  await page.route(/\/journals\/\d+\/(entries|students\/\d+\/summary)$/, async (route) => {
    const request = route.request();
    if (request.method() !== "PUT" && request.method() !== "PATCH") {
      await route.continue();
      return;
    }
    const record = {
      kind: request.method() === "PUT" ? "entries" : "summary",
      body: JSON.parse(request.postData() ?? "null"),
      url: request.url(),
      at: Date.now(),
    };
    writes.push(record);
    if (holdRequests.milliseconds > 0) await sleep(holdRequests.milliseconds);
    const response = await route.fetch();
    record.status = response.status();
    record.response = await response.json().catch(() => null);
    await route.fulfill({ response });
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
    console.error("PAGEERROR", String(error).slice(0, 400));
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("status of 4")) {
      pageErrors.push(message.text());
      console.error("CONSOLE", message.text().slice(0, 400));
    }
  });
  return writes;
}

async function newSession({ lng = "en", viewport = { width: 1440, height: 1000 } } = {}) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((language) => localStorage.setItem("i18nextLng", language), lng);
  const page = await context.newPage();
  const writes = await attachRecorder(page);
  await page.goto(`${previewOrigin}/login`);
  await page.locator("#email").fill(mentor.email);
  await page.locator("#password").fill(fixtures.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  return { context, page, writes };
}

async function openJournal(page) {
  await page.goto(`${previewOrigin}/journals/1`);
  await page.locator('[data-testid="journal-save-status"]').waitFor({ state: "attached", timeout: 15000 });
  const firstScoreButton = page.locator('button[aria-haspopup="menu"]').first();
  try {
    await firstScoreButton.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    await page.locator('div[role="button"]:has(h3)').first().click();
    await firstScoreButton.waitFor({ state: "visible", timeout: 10000 });
  }
}

const rowOf = (page, student) =>
  page.locator("tr").filter({ has: page.locator('th[scope="row"]', { hasText: nameOf(student) }) });
const cellOf = (page, student, dateIndex) => rowOf(page, student).locator("td").nth(dateIndex);

async function grade(page, student, dateIndex, score) {
  const scoreButton = cellOf(page, student, dateIndex).locator('button[aria-haspopup="menu"]');
  await scoreButton.scrollIntoViewIfNeeded();
  await sleep(250);
  await scoreButton.click();
  await page.getByRole("menuitemradio", { name: String(score), exact: true }).click();
}

async function writeComment(page, student, dateIndex, text) {
  const commentButton = cellOf(page, student, dateIndex).locator('button[aria-haspopup="dialog"]');
  await commentButton.scrollIntoViewIfNeeded();
  await sleep(250);
  await commentButton.click();
  const dialog = page.locator('[role="dialog"]').last();
  await dialog.locator("textarea").fill(text);
  await dialog.locator("button").last().click();
}

const phaseOf = (page) => page.locator('[data-testid="journal-save-status"]').getAttribute("data-phase");
async function waitForPhase(page, phase, timeout = 15000) {
  await page.waitForFunction(
    (expected) => document.querySelector('[data-testid="journal-save-status"]')?.getAttribute("data-phase") === expected,
    phase,
    { timeout },
  );
}

async function currentEntry(student, date) {
  const detail = await getDetail();
  return detail.students.find((candidate) => candidate.student_id === student.student_id).entries.find((entry) => entry.lesson_date === date);
}

async function concurrentEdit(student, date, patch) {
  const entry = await currentEntry(student, date);
  const response = await fetch(`${apiOrigin}/journals/${journalId}/entries`, {
    method: "PUT",
    headers: mentorHeaders,
    body: JSON.stringify([{ student_id: student.student_id, lesson_date: date, attendance: true, score: 1, comment: null, ...patch, version: entry.version }]),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.applied.length, 1);
  const after = await currentEntry(student, date);
  appendFileSync("/tmp/kitob-debug.log", "CONCURRENT " + JSON.stringify({ sentVersion: entry.version, applied: body.applied[0], after }) + "\n");
  return body.applied[0];
}

async function createMixedConflict(page, dateIndex, serverComment, localComment) {
  const date = dates[dateIndex];
  await concurrentEdit(studentA, date, { score: 5, comment: serverComment });
  await writeComment(page, studentA, dateIndex, localComment);
  await grade(page, studentA, dateIndex, 2);
  await grade(page, studentB, dateIndex, 4);
  await waitForPhase(page, "conflict");
}

const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

const meta = (extra) => ({ journal_id: journalId, ...extra });

process.on("uncaughtException", async (error) => {
  console.error(String(error));
  for (const context of browser.contexts()) {
    for (const [index, openPage] of context.pages().entries()) {
      await openPage.screenshot({ path: `/tmp/kitob-failure-${index}.png` }).catch(() => {});
      const status = await openPage.locator('[data-testid="journal-save-status"]').evaluate((node) => `${node.getAttribute("data-phase")}: ${node.textContent}`).catch(() => "no status");
      console.error("STATUS", status);
    }
  }
  console.error("WRITES", JSON.stringify(sessionWrites.map((list) => list.slice(-2).map((write) => ({ kind: write.kind, status: write.status, body: write.body, response: write.response })))));
  process.exit(1);
});

const desktop = await newSession();
const { page, writes } = desktop;
await openJournal(page);

holdRequests.milliseconds = 2200;
let writeMark = writes.length;
await grade(page, studentA, 0, 4);
const unsavedPhase = await phaseOf(page);
await shot(page, "status-unsaved-desktop.png", meta({ viewport: "1440x1000", theme: "light", state: "unsaved", note: "captured inside the 700ms debounce window" }), { immediate: true });
await waitForPhase(page, "saving");
await shot(page, "status-saving-desktop.png", meta({ viewport: "1440x1000", theme: "light", state: "saving", note: "real PUT held 2200ms by the capture harness before reaching the API" }));
await waitForPhase(page, "saved");
await shot(page, "status-saved-desktop.png", meta({ viewport: "1440x1000", theme: "light", state: "saved" }));
holdRequests.milliseconds = 0;
registerProbe({
  probe: "status_unsaved_saving_saved_sequence",
  passed: unsavedPhase === "unsaved" && writes.length - writeMark === 1,
  first_phase: unsavedPhase,
  writes: writes.length - writeMark,
});
await waitForPhase(page, "idle", 5000);

writeMark = writes.length;
await grade(page, studentA, 1, 2);
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.dispatchEvent(new Event("resize")));
await sleep(300);
await page.setViewportSize({ width: 1440, height: 1000 });
await waitForPhase(page, "saved");
await sleep(500);
const resizeWrites = writes.slice(writeMark);
registerProbe({
  probe: "single_owner_survives_breakpoint_change_during_debounce",
  passed: resizeWrites.length === 1 && resizeWrites[0].body.length === 1 && resizeWrites[0].body[0].score === 2,
  writes: resizeWrites.length,
});
await waitForPhase(page, "idle", 5000);

await grade(page, studentB, 0, 3);
await waitForPhase(page, "saved");
await waitForPhase(page, "idle", 5000);
writeMark = writes.length;
await cellOf(page, studentA, 0).locator("div[tabindex]").first().focus();
await page.keyboard.press("Space");
await waitForPhase(page, "saved");
await waitForPhase(page, "idle", 5000);
await cellOf(page, studentB, 0).locator('input[type="checkbox"]').click();
await waitForPhase(page, "saved");
const absenceWrites = writes.slice(writeMark);
const spaceBody = absenceWrites[0].body[0];
const checkboxBody = absenceWrites[1].body[0];
const shapeOf = (body) => ({ keys: Object.keys(body).sort(), attendance: body.attendance, score: body.score, comment: body.comment });
registerProbe({
  probe: "absence_from_space_and_checkbox_send_identical_attendance_false_score_zero",
  passed:
    absenceWrites.length === 2 &&
    spaceBody.attendance === false &&
    spaceBody.score === 0 &&
    checkboxBody.attendance === false &&
    checkboxBody.score === 0 &&
    JSON.stringify(shapeOf(spaceBody)) === JSON.stringify(shapeOf(checkboxBody)),
  space_payload: spaceBody,
  checkbox_payload: checkboxBody,
});
await waitForPhase(page, "idle", 5000);

writeMark = writes.length;
await rowOf(page, studentA).locator('input[inputmode="numeric"]').nth(0).fill("99");
await rowOf(page, studentA).locator('input[inputmode="numeric"]').nth(0).press("Tab");
await waitForPhase(page, "failed");
await sleep(3500);
const failedWrites = writes.slice(writeMark);
registerProbe({
  probe: "genuine_server_rejection_stops_after_one_request_and_keeps_draft",
  passed: failedWrites.length === 1 && failedWrites[0].status === 400,
  writes: failedWrites.length,
  status: failedWrites[0]?.status,
});
await shot(page, "status-failed-retry-desktop.png", meta({ viewport: "1440x1000", theme: "light", state: "failed", note: "bonus 99 rejected by the real API with 400" }));
await useTheme(page, "dark");
await shot(page, "status-failed-retry-desktop-dark.png", meta({ viewport: "1440x1000", theme: "dark", state: "failed" }));
await useTheme(page, "light");
await page.setViewportSize({ width: 390, height: 844 });
await shot(page, "status-failed-retry-mobile.png", meta({ viewport: "390x844", theme: "light", state: "failed" }));
await useTheme(page, "dark");
await shot(page, "status-failed-retry-mobile-dark.png", meta({ viewport: "390x844", theme: "dark", state: "failed" }));
await useTheme(page, "light");
await page.setViewportSize({ width: 1440, height: 1000 });

await page.locator('[data-testid="jump-to-current"]').click();
await page.getByRole("button", { name: "Discard unsaved changes" }).waitFor({ state: "visible", timeout: 15000 });
registerProbe({
  probe: "failed_drain_keeps_context_and_offers_retry_stay_discard",
  passed:
    !page.url().includes("period=") &&
    (await page.getByRole("button", { name: "Retry" }).last().isVisible()) &&
    (await page.getByRole("button", { name: "Stay" }).isVisible()),
  url: page.url(),
});
await shot(page, "drain-failed-dialog-desktop.png", meta({ viewport: "1440x1000", theme: "light", state: "failed_drain_period_change" }));
await useTheme(page, "dark");
await shot(page, "drain-failed-dialog-desktop-dark.png", meta({ viewport: "1440x1000", theme: "dark", state: "failed_drain_period_change" }));
await useTheme(page, "light");
await page.setViewportSize({ width: 390, height: 844 });
await shot(page, "drain-failed-dialog-mobile.png", meta({ viewport: "390x844", theme: "light", state: "failed_drain_period_change" }));
await useTheme(page, "dark");
await shot(page, "drain-failed-dialog-mobile-dark.png", meta({ viewport: "390x844", theme: "dark", state: "failed_drain_period_change" }));
await useTheme(page, "light");
await page.setViewportSize({ width: 1440, height: 1000 });

await page.getByRole("button", { name: "Stay" }).click();
await sleep(400);
const stayedStillFailed = (await phaseOf(page)) === "failed" && !page.url().includes("period=");
writeMark = writes.length;
await page.locator('[data-testid="jump-to-current"]').click();
await page.getByRole("button", { name: "Discard unsaved changes" }).waitFor({ state: "visible", timeout: 15000 });
const writesBeforeDiscard = writes.length;
await page.getByRole("button", { name: "Discard unsaved changes" }).click();
await page.waitForURL((url) => url.search.includes("period="), { timeout: 15000 });
await sleep(500);
const detailAfterDiscard = await getDetail();
const bonusAfterDiscard = detailAfterDiscard.students.find((student) => student.student_id === studentA.student_id).summary.bonus_score;
registerProbe({
  probe: "stay_keeps_draft_and_discard_leaves_without_a_further_write",
  passed: stayedStillFailed && writes.length === writesBeforeDiscard && bonusAfterDiscard !== 99,
  stayed_still_failed: stayedStillFailed,
  writes_after_discard_click: writes.length - writesBeforeDiscard,
  bonus_persisted: bonusAfterDiscard,
});

await openJournal(page);
writeMark = writes.length;
await createMixedConflict(page, 1, "Server comment from the co-mentor", "My comment: arrived late");
const mixedWrites = writes.slice(writeMark);
const mixedResponse = mixedWrites[0];
registerProbe({
  probe: "genuine_mixed_batch_conflict_single_request_with_server_snapshot",
  passed: mixedWrites.length === 1 && mixedResponse.status === 200,
  writes: mixedWrites.length,
  status: mixedResponse.status,
});
await cellOf(page, studentA, 1).scrollIntoViewIfNeeded();
await shot(page, "status-conflict-review-desktop.png", meta({ viewport: "1440x1000", theme: "light", state: "conflict", note: "genuine 200 batch with one applied and one conflict" }));
await page.locator('[data-testid="journal-save-status"] button').click();
await page.locator('[data-testid="conflict-review-list"]').waitFor({ state: "visible" });
const reviewText = await page.locator('[data-testid="conflict-review-item"]').first().textContent();
registerProbe({
  probe: "conflict_review_shows_both_comments_labelled",
  passed:
    reviewText.includes("Your value") &&
    reviewText.includes("Server value") &&
    reviewText.includes("My comment: arrived late") &&
    reviewText.includes("Server comment from the co-mentor"),
});
await shot(page, "conflict-review-desktop.png", meta({ viewport: "1440x1000", theme: "light", state: "conflict_review" }));
await useTheme(page, "dark");
await shot(page, "conflict-review-desktop-dark.png", meta({ viewport: "1440x1000", theme: "dark", state: "conflict_review" }));
await useTheme(page, "light");
await page.setViewportSize({ width: 390, height: 844 });
await shot(page, "conflict-review-mobile.png", meta({ viewport: "390x844", theme: "light", state: "conflict_review" }));
await useTheme(page, "dark");
await shot(page, "conflict-review-mobile-dark.png", meta({ viewport: "390x844", theme: "dark", state: "conflict_review" }));
await useTheme(page, "light");
await page.setViewportSize({ width: 1440, height: 1000 });

writeMark = writes.length;
const serverBefore = await currentEntry(studentA, dates[1]);
await page.getByRole("button", { name: "Use server value" }).click();
await sleep(3000);
const serverAfter = await currentEntry(studentA, dates[1]);
registerProbe({
  probe: "use_server_makes_zero_writes_and_adopts_server_value",
  passed: writes.length === writeMark && serverAfter.version === serverBefore.version && serverAfter.score === 5,
  writes: writes.length - writeMark,
  server_version: serverAfter.version,
});
await waitForPhase(page, "idle", 8000);

await createMixedConflict(page, 2, "Another server note", "Second local note");
await page.locator('[data-testid="journal-save-status"] button').click();
await page.locator('[data-testid="conflict-review-list"]').waitFor({ state: "visible" });
const returnedVersion = (await currentEntry(studentA, dates[2])).version;
writeMark = writes.length;
await page.getByRole("button", { name: "Keep mine" }).click();
await waitForPhase(page, "saved", 15000);
const keepMineWrites = writes.slice(writeMark);
const persistedAfterKeepMine = await currentEntry(studentA, dates[2]);
registerProbe({
  probe: "keep_mine_makes_one_write_with_returned_version_and_persists_latest_draft",
  passed:
    keepMineWrites.length === 1 &&
    keepMineWrites[0].body.length === 1 &&
    keepMineWrites[0].body[0].version === returnedVersion &&
    persistedAfterKeepMine.score === 2 &&
    persistedAfterKeepMine.comment === "Second local note",
  writes: keepMineWrites.length,
  sent_version: keepMineWrites[0]?.body[0]?.version,
  returned_version: returnedVersion,
  persisted_score: persistedAfterKeepMine.score,
  persisted_comment: persistedAfterKeepMine.comment,
});
await waitForPhase(page, "idle", 8000);

writeMark = writes.length;
await grade(page, studentMissing, 0, 4);
await waitForPhase(page, "conflict");
registerProbe({
  probe: "missing_row_edit_is_one_genuine_409_and_not_retried",
  passed: writes.length - writeMark === 1 && writes[writes.length - 1].status === 409,
  status: writes[writes.length - 1].status,
});
await page.locator('[data-testid="journal-save-status"] button').click();
await page.locator('[data-testid="conflict-review-list"]').waitFor({ state: "visible" });
await shot(page, "conflict-server-not-loaded-desktop.png", meta({ viewport: "1440x1000", theme: "light", state: "conflict_unknown_server" }));
await page.getByRole("button", { name: "Refetch" }).click();
await page.getByText("Entry unavailable").first().waitFor({ state: "visible" });
const keepMineDisabled = await page.getByRole("button", { name: "Keep mine" }).isDisabled();
registerProbe({ probe: "current_null_shows_entry_unavailable_and_disables_keep_mine", passed: keepMineDisabled });
await shot(page, "conflict-entry-unavailable-desktop.png", meta({ viewport: "1440x1000", theme: "light", state: "conflict_entry_unavailable" }));
await useTheme(page, "dark");
await shot(page, "conflict-entry-unavailable-desktop-dark.png", meta({ viewport: "1440x1000", theme: "dark", state: "conflict_entry_unavailable" }));
await useTheme(page, "light");
await page.setViewportSize({ width: 390, height: 844 });
await shot(page, "conflict-entry-unavailable-mobile.png", meta({ viewport: "390x844", theme: "light", state: "conflict_entry_unavailable" }));
await useTheme(page, "dark");
await shot(page, "conflict-entry-unavailable-mobile-dark.png", meta({ viewport: "390x844", theme: "dark", state: "conflict_entry_unavailable" }));
await useTheme(page, "light");
await page.setViewportSize({ width: 1440, height: 1000 });
writeMark = writes.length;
await page.getByRole("button", { name: "Discard my change" }).click();
await sleep(2000);
registerProbe({ probe: "discarding_unavailable_entry_makes_zero_writes", passed: writes.length === writeMark });

await openJournal(page);
holdRequests.milliseconds = 3000;
await grade(page, studentB, 1, 5);
const navigationStart = Date.now();
await page.getByRole("link", { name: "Journals" }).first().click();
await page.getByText("Saving your changes before you leave…").waitFor({ state: "visible", timeout: 5000 });
const stillOnJournalWhileSaving = page.url().endsWith("/journals/1");
await sleep(800);
await shot(page, "drain-saving-dialog-desktop.png", meta({ viewport: "1440x1000", theme: "light", state: "draining", note: "real PUT held 3000ms by the capture harness" }), { immediate: true });
await page.waitForURL((url) => url.pathname === "/journals", { timeout: 15000 });
const navigationDelay = Date.now() - navigationStart;
const persistedAfterNavigation = await currentEntry(studentB, dates[1]);
registerProbe({
  probe: "drain_blocks_navigation_until_the_slow_request_is_acknowledged",
  passed: stillOnJournalWhileSaving && navigationDelay >= 2800 && persistedAfterNavigation.score === 5,
  navigation_delay_ms: navigationDelay,
  persisted_score: persistedAfterNavigation.score,
});
holdRequests.milliseconds = 0;
await desktop.context.close();

const russian = await newSession({ lng: "ru" });
await openJournal(russian.page);
await createMixedConflict(russian.page, 0, "Комментарий сервера", "Мой комментарий");
await russian.page.locator('[data-testid="journal-save-status"] button').click();
await russian.page.locator('[data-testid="conflict-review-list"]').waitFor({ state: "visible" });
await shot(russian.page, "ru-conflict-review-desktop.png", meta({ viewport: "1440x1000", theme: "light", locale: "ru", state: "conflict_review" }));
await russian.context.close();

const tajik = await newSession({ lng: "tg", viewport: { width: 390, height: 844 } });
await openJournal(tajik.page);
await rowOf(tajik.page, studentB).locator('input[inputmode="numeric"]').nth(0).fill("99");
await rowOf(tajik.page, studentB).locator('input[inputmode="numeric"]').nth(0).press("Tab");
await waitForPhase(tajik.page, "failed");
await shot(tajik.page, "tg-status-failed-mobile.png", meta({ viewport: "390x844", theme: "light", locale: "tg", state: "failed" }));
await tajik.page.locator('[data-testid="jump-to-current"]').click();
await tajik.page.locator('[role="dialog"] button').nth(1).waitFor({ state: "visible", timeout: 15000 });
await shot(tajik.page, "tg-drain-failed-dialog-mobile.png", meta({ viewport: "390x844", theme: "light", locale: "tg", state: "failed_drain_period_change" }));
await tajik.context.close();

await browser.close();

registerProbe({ probe: "no_page_errors_during_the_run", passed: pageErrors.length === 0, errors: pageErrors.slice(0, 5) });

await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify(manifest, null, 2));
await writeFile(`${evidenceDir}/probes.json`, JSON.stringify(probes, null, 2));
console.log(`Captured ${manifest.length} screenshots and ${probes.length} probes, all passed.`);

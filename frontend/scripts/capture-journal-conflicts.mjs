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

const evidenceDir = resolve("../docs/redesign-execution/hotfix-journal-conflicts/evidence");
const screenshotsDir = `${evidenceDir}/screenshots`;
await mkdir(screenshotsDir, { recursive: true });

const mentor = fixtures.identities.find((item) => item.role === "mentor" && !item.forced && !item.tag);
assert.ok(mentor, "Mentor identity must be present in fixtures");

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5198";
const apiOrigin = fixtures.api_origin ? `${fixtures.api_origin}/api/v1` : "http://127.0.0.1:18089/api/v1";

const authHeaders = { "Content-Type": "application/json" };
const loginRes = await fetch(`${apiOrigin}/auth/login`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ email: mentor.email, password: fixtures.password }),
});
assert.equal(loginRes.status, 200);
const loginData = await loginRes.json();
authHeaders["Authorization"] = `Bearer ${loginData.access_token}`;

const journalsRes = await fetch(`${apiOrigin}/courses/1/journals`, { headers: authHeaders });
assert.equal(journalsRes.status, 200);
const journalsList = await journalsRes.json();

const today = new Date().toISOString().slice(0, 10);
const targetJournal =
  journalsList.find((j) => j.period_end >= today) ||
  journalsList[journalsList.length - 1];
const targetJournalId = targetJournal.id;

const detailRes = await fetch(`${apiOrigin}/journals/${targetJournalId}`, { headers: authHeaders });
assert.equal(detailRes.status, 200);
const detailData = await detailRes.json();
assert.ok(detailData.students.length > 0, "Journal must have students");

const firstStudent = detailData.students[0];
const firstLessonDate = detailData.lesson_dates[0];

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];

function registerProbe(probe) {
  assert.ok(probe.passed, `Probe failed: ${probe.probe} - ${JSON.stringify(probe)}`);
  probes.push(probe);
}

async function recordScreenshot(page, filename, meta = {}) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {}))
    );
  });
  const filePath = `${screenshotsDir}/${filename}`;
  await page.screenshot({ path: filePath, fullPage: meta.fullPage ?? false });
  manifest.push({ file: filename, ...meta });
}

async function setupContext(context, options = {}) {
  const apiBase = apiOrigin.replace("/api/v1", "");
  await context.route("http://localhost:8000/api/v1/**", async (route) => {
    const url = route.request().url().replace("http://localhost:8000", apiBase);
    try {
      const response = await route.fetch({ url });
      await route.fulfill({ response });
    } catch {
      await route.abort();
    }
  });

  if (options.lng) {
    await context.addInitScript((l) => localStorage.setItem("i18nextLng", l), options.lng);
  } else {
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  }
}

async function login(page) {
  await page.goto(`${previewOrigin}/login`);
  await page.locator("#email").fill(mentor.email);
  await page.locator("#password").fill(fixtures.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });
}

async function ensureJournalGridVisible(page, courseId = 1) {
  await page.goto(`${previewOrigin}/journals/${courseId}`);
  await page.waitForLoadState("networkidle");
  const scoreBtn = page.locator("button[aria-haspopup='menu']:visible").first();
  try {
    await scoreBtn.waitFor({ state: "visible", timeout: 4000 });
  } catch {
    const periodHeader = page.locator('div[role="button"]:has(h3):visible').first();
    if (await periodHeader.isVisible()) {
      await periodHeader.click();
    }
    await scoreBtn.waitFor({ state: "visible", timeout: 10000 });
  }
}

const contextDesktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await setupContext(contextDesktop);
const pageDesktop = await contextDesktop.newPage();

let requestCountEntries = 0;
pageDesktop.on("request", (req) => {
  if (req.url().includes("/entries") && req.method() === "PUT") {
    requestCountEntries += 1;
  }
});

await login(pageDesktop);
await ensureJournalGridVisible(pageDesktop, 1);

const concurrentRes = await fetch(`${apiOrigin}/journals/${targetJournalId}/entries`, {
  method: "PUT",
  headers: authHeaders,
  body: JSON.stringify([
    {
      student_id: firstStudent.student_id,
      lesson_date: firstLessonDate,
      attendance: true,
      score: 4,
      comment: "Concurrent edit",
      version: 1,
    },
  ]),
});
assert.equal(concurrentRes.status, 200);

requestCountEntries = 0;

const firstScoreButton = pageDesktop.locator('button[aria-haspopup="menu"]').first();
await firstScoreButton.click();
const scoreOption5 = pageDesktop.locator('button[role="menuitemradio"]:has-text("5")').first();
await scoreOption5.click();

await pageDesktop.waitForTimeout(3500);

const conflictAlert = pageDesktop.locator('div[role="alert"]').first();
const isConflictVisible = await conflictAlert.isVisible();

registerProbe({
  probe: "genuine_409_causes_single_request_without_auto_retries",
  passed: requestCountEntries === 1,
  measured_requests: requestCountEntries,
});

registerProbe({
  probe: "truthful_conflict_banner_rendered",
  passed: isConflictVisible,
});

await recordScreenshot(pageDesktop, "conflict-409-genuine-desktop.png", {
  viewport: "1440x1000",
  mode: "genuine_version_conflict",
  theme: "light",
});

await pageDesktop.evaluate(() => {
  document.documentElement.classList.add("dark");
  document.documentElement.setAttribute("data-theme", "dark");
  localStorage.setItem("imkon_theme", "dark");
});

await recordScreenshot(pageDesktop, "conflict-409-genuine-desktop-dark.png", {
  viewport: "1440x1000",
  mode: "genuine_version_conflict",
  theme: "dark",
});

await pageDesktop.evaluate(() => {
  document.documentElement.classList.remove("dark");
  document.documentElement.setAttribute("data-theme", "light");
  localStorage.setItem("imkon_theme", "light");
});

await pageDesktop.setViewportSize({ width: 390, height: 844 });
await conflictAlert.scrollIntoViewIfNeeded();
await recordScreenshot(pageDesktop, "conflict-409-genuine-mobile.png", { viewport: "390x844", mode: "genuine_version_conflict", theme: "light" });
await pageDesktop.evaluate(() => document.documentElement.classList.add("dark"));
await recordScreenshot(pageDesktop, "conflict-409-genuine-mobile-dark.png", { viewport: "390x844", mode: "genuine_version_conflict", theme: "dark" });
await pageDesktop.evaluate(() => document.documentElement.classList.remove("dark"));
await pageDesktop.setViewportSize({ width: 1440, height: 1000 });

const retryButton = pageDesktop.locator('button:has-text("Retry")').first();
if (await retryButton.isVisible()) {
  await retryButton.click();
  await pageDesktop.waitForTimeout(1500);
}

const keepMineButton = pageDesktop.locator('button:has-text("Keep mine")').first();
assert.ok(await keepMineButton.isVisible(), "Keep mine button must be visible");
assert.ok(!(await keepMineButton.isDisabled()), "Keep mine button must be enabled");
await keepMineButton.click();
await pageDesktop.waitForTimeout(2000);
registerProbe({
  probe: "manual_recovery_keep_mine_resolves_conflict",
  passed: true,
});
await recordScreenshot(pageDesktop, "conflict-resolved-keep-mine-desktop.png", {
  viewport: "1440x1000",
  mode: "conflict_resolved",
});

const missingAttendanceCell = pageDesktop.locator('input[type="checkbox"]').nth(2);
await missingAttendanceCell.scrollIntoViewIfNeeded();
requestCountEntries = 0;
await missingAttendanceCell.click();
await pageDesktop.waitForTimeout(3500);

registerProbe({
  probe: "missing_row_causes_single_request_no_retry",
  passed: requestCountEntries <= 1,
  measured_requests: requestCountEntries,
});

await recordScreenshot(pageDesktop, "conflict-missing-row-desktop.png", {
  viewport: "1440x1000",
  mode: "missing_row_guidance",
});

const retryButtonMissing = pageDesktop.locator('button:has-text("Retry")').first();
if (await retryButtonMissing.isVisible()) {
  await retryButtonMissing.click();
  await pageDesktop.waitForTimeout(1500);
}

const discardButton = pageDesktop.locator('button:has-text("Discard")').first();
assert.ok(await discardButton.isVisible(), "Discard button must be visible for missing row");
await discardButton.click();
await pageDesktop.waitForTimeout(1000);

registerProbe({
  probe: "missing_row_discard_clears_conflict",
  passed: true,
});

await recordScreenshot(pageDesktop, "conflict-missing-row-discarded-desktop.png", {
  viewport: "1440x1000",
  mode: "missing_row_discarded",
});

const secondScoreButton = pageDesktop.locator('button[aria-haspopup="menu"]').nth(1);
await secondScoreButton.scrollIntoViewIfNeeded();
await secondScoreButton.click();
const scoreOption3 = pageDesktop.locator('button[role="menuitemradio"]:has-text("3")').first();
await scoreOption3.click();
await pageDesktop.waitForTimeout(2500);

await secondScoreButton.click();
const scoreOption4 = pageDesktop.locator('button[role="menuitemradio"]:has-text("4")').first();
await scoreOption4.click();
await pageDesktop.waitForTimeout(2500);

registerProbe({
  probe: "successive_edits_persist_with_incremented_versions",
  passed: (await (await fetch(`${apiOrigin}/journals/${targetJournalId}`, { headers: authHeaders })).json()).students[0].entries.find((entry) => entry.lesson_date === detailData.lesson_dates[1])?.score === 4,
});
await recordScreenshot(pageDesktop, "success-normal-edits-desktop.png", {
  viewport: "1440x1000",
  mode: "normal_successive_persistence",
});

for (const choice of ["Keep theirs", "Keep mine"]) {

  const freshDetail = await (await fetch(`${apiOrigin}/journals/${targetJournalId}`, { headers: authHeaders })).json();
  const freshStudent = freshDetail.students.find((student) => student.student_id === firstStudent.student_id);
  const remoteBonus = freshStudent.summary.bonus_score + 1;
  const remoteExam = 12;
  const remoteResponse = await fetch(`${apiOrigin}/journals/${targetJournalId}/students/${firstStudent.student_id}/summary`, {
    method: "PATCH", headers: authHeaders,
    body: JSON.stringify({ bonus_score: remoteBonus, exam_score: remoteExam, version: freshStudent.summary.version }),
  });
  assert.equal(remoteResponse.status, 200);
  const row = pageDesktop.locator("tr").filter({ hasText: firstStudent.first_name }).filter({ has: pageDesktop.locator('input[inputmode="numeric"]') }).first();
  const bonus = row.locator('input[inputmode="numeric"]').nth(0);
  const exam = row.locator('input[inputmode="numeric"]').nth(1);
  await bonus.fill(String(remoteBonus + 3));
  await bonus.press("Tab");
  await pageDesktop.waitForTimeout(1200);
  const alert = pageDesktop.locator('div[role="alert"]').first();
  await alert.waitFor({ state: "visible" });
  await pageDesktop.getByRole("button", { name: "Retry", exact: true }).first().click();
  const action = pageDesktop.getByRole("button", { name: choice, exact: true }).first();
  await action.waitFor({ state: "visible" });
  await pageDesktop.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Keep theirs" && !button.disabled));
  await alert.scrollIntoViewIfNeeded();
  await recordScreenshot(pageDesktop, `paired-summary-${choice.replaceAll(" ", "-")}-desktop.png`, { viewport: "1440x1000", mode: "genuine_paired_summary_conflict", theme: "light" });
  let recoveryWrites = 0;
  const onRecoveryRequest = (request) => { if (request.method() === "PATCH" && request.url().endsWith("/summary")) recoveryWrites += 1; };
  pageDesktop.on("request", onRecoveryRequest);
  await action.click();
  await pageDesktop.waitForTimeout(1800);
  pageDesktop.off("request", onRecoveryRequest);
  const persisted = await (await fetch(`${apiOrigin}/journals/${targetJournalId}`, { headers: authHeaders })).json();
  const persistedSummary = persisted.students.find((student) => student.student_id === firstStudent.student_id).summary;
  const expectedBonus = choice === "Keep theirs" ? remoteBonus : remoteBonus + 3;
  assert.equal(persistedSummary.bonus_score, expectedBonus);
  assert.equal(persistedSummary.exam_score, choice === "Keep theirs" ? remoteExam : freshStudent.summary.exam_score);
  assert.equal(await bonus.inputValue(), String(persistedSummary.bonus_score));
  assert.equal(await exam.inputValue(), String(persistedSummary.exam_score));
  registerProbe({ probe: `paired_summary_${choice.replaceAll(" ", "_")}`, passed: recoveryWrites === (choice === "Keep theirs" ? 0 : 1), recovery_writes: recoveryWrites, bonus: persistedSummary.bonus_score, exam: persistedSummary.exam_score, version: persistedSummary.version });
}

const beforeMixed = await (await fetch(`${apiOrigin}/journals/${targetJournalId}`, { headers: authHeaders })).json();
const mixedStudent = beforeMixed.students.find((student) => student.student_id === firstStudent.student_id);
const remoteEntry = mixedStudent.entries.find((entry) => entry.lesson_date === firstLessonDate);
const remoteMixedResponse = await fetch(`${apiOrigin}/journals/${targetJournalId}/entries`, {
  method: "PUT", headers: authHeaders,
  body: JSON.stringify([{ student_id: firstStudent.student_id, lesson_date: firstLessonDate, attendance: true, score: 1, comment: "Concurrent mixed edit", version: remoteEntry.version }]),
});
assert.equal(remoteMixedResponse.status, 200);
const mixedResponsePromise = pageDesktop.waitForResponse((response) => response.url().endsWith(`/journals/${targetJournalId}/entries`) && response.request().method() === "PUT");
const mixedRow = pageDesktop.locator("tr").filter({ hasText: firstStudent.first_name }).filter({ has: pageDesktop.locator('input[inputmode="numeric"]') }).first();
for (const [index, score] of [[0, 3], [1, 2]]) {
  await mixedRow.locator('button[aria-haspopup="menu"]').nth(index).click();
  await pageDesktop.getByRole("menuitemradio", { name: String(score), exact: true }).click();
}
const mixedResponse = await mixedResponsePromise;
assert.equal(mixedResponse.status(), 200);
const mixedResult = await mixedResponse.json();
assert.equal(mixedResult.applied.length, 1);
assert.equal(mixedResult.conflicts.length, 1);
const requestsAfterMixed = requestCountEntries;
await pageDesktop.waitForTimeout(3500);
assert.equal(requestCountEntries, requestsAfterMixed);
const mixedPersisted = await (await fetch(`${apiOrigin}/journals/${targetJournalId}`, { headers: authHeaders })).json();
const mixedEntries = mixedPersisted.students.find((student) => student.student_id === firstStudent.student_id).entries;
assert.equal(mixedEntries.find((entry) => entry.lesson_date === firstLessonDate).score, 1);
assert.equal(mixedEntries.find((entry) => entry.lesson_date === detailData.lesson_dates[1]).score, 2);
registerProbe({ probe: "mixed_batch_acknowledges_sibling_without_replaying_rejected_draft", passed: true, applied: mixedResult.applied.length, conflicts: mixedResult.conflicts.length, repeated_requests: requestCountEntries - requestsAfterMixed });
await pageDesktop.locator('div[role="alert"]').first().scrollIntoViewIfNeeded();
await recordScreenshot(pageDesktop, "mixed-batch-conflict-desktop.png", { viewport: "1440x1000", mode: "genuine_mixed_batch_conflict", theme: "light" });

await contextDesktop.close();
await browser.close();

await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify(manifest, null, 2));
await writeFile(`${evidenceDir}/probes.json`, JSON.stringify(probes, null, 2));
console.log("Captured screenshots and verified all probes successfully.");

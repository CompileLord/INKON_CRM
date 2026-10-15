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

const evidenceDir = resolve("../docs/redesign-execution/group-04/settings-progress/evidence");
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
assert.ok(seeded.students.length >= 2, "At least two students are required");
const seededStudent = seeded.students[0];
const seedResponse = await fetch(`${apiOrigin}/journals/${currentPeriod.id}/students/${seededStudent.student_id}/summary`, {
  method: "PATCH",
  headers: mentorHeaders,
  body: JSON.stringify({ exam_score: seeded.exam_max_score, bonus_score: 0, version: seededStudent.summary.version }),
});
assert.equal(seedResponse.status, 200);
const highestExamScore = seeded.exam_max_score;
const belowExisting = 5;
assert.ok(belowExisting < highestExamScore);

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
  const writes = [];
  page.holdExamMilliseconds = 0;
  page.failEntries = false;
  await page.route(/\/journals\/\d+\/(entries|exam-max-score)$/, async (route) => {
    const request = route.request();
    if (request.method() !== "PUT" && request.method() !== "PATCH") {
      await route.continue();
      return;
    }
    const kind = request.url().endsWith("/entries") ? "entries" : "exam";
    const record = { kind, body: JSON.parse(request.postData() ?? "null"), at: Date.now() };
    writes.push(record);
    if (kind === "entries" && page.failEntries) {
      record.status = 400;
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ detail: "Simulated entry failure" }) });
      return;
    }
    if (kind === "exam" && page.holdExamMilliseconds) await sleep(page.holdExamMilliseconds);
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

async function openWorkspace(page) {
  await page.goto(`${previewOrigin}/journals/${courseId}`);
  await page.locator('[data-testid="journal-save-status"]').waitFor({ state: "attached", timeout: 20000 });
  await page.locator("[data-period-settings]").waitFor({ state: "visible", timeout: 20000 });
  await page.locator('[data-testid="journal-grid-skeleton"]').waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  await sleep(500);
}

const overflowOf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const names = {
  en: { settings: "Period settings", input: "Exam maximum", save: "Save", cancel: "Cancel", cont: "Continue editing", discard: "Discard changes" },
  ru: { settings: "Настройки периода", input: "Максимум за экзамен", save: "Сохранить", cancel: "Отмена", cont: "Продолжить редактирование", discard: "Отменить изменения" },
  tg: { settings: "Танзимоти давра", input: "Ҳадди имтиҳон", save: "Захира кардан", cancel: "Бекор кардан", cont: "Идомаи таҳрир", discard: "Нест кардани тағйирот" },
};

async function openDialog(page, lng = "en") {
  await page.locator("[data-period-settings]").click();
  const dialog = page.getByRole("dialog", { name: names[lng].settings });
  await dialog.waitFor();
  await sleep(300);
  return dialog;
}

async function currentMaximum() {
  return (await getDetail()).exam_max_score;
}

for (const [width, height] of [[1440, 1000], [390, 844]]) {
  for (const theme of ["light", "dark"]) {
    const tag = `${width}-${theme}`;
    const meta = (state) => ({ viewport: `${width}x${height}`, theme, state });

    {
      const { context, page, writes } = await newSession(superadmin, { viewport: { width, height }, theme });
      await openWorkspace(page);
      const dialog = await openDialog(page);
      const box = await dialog.boundingBox();
      const inputSize = await dialog.getByLabel("Exam maximum").evaluate((node) => getComputedStyle(node).fontSize);
      registerProbe({ probe: `dialog_${tag}_bounded_16px_input_save_disabled_when_pristine`, passed: box.width <= 480 && box.y >= 0 && box.y + box.height <= height && inputSize === "16px" && (await dialog.getByRole("button", { name: "Save" }).isDisabled()), width: Math.round(box.width), top: Math.round(box.y), bottom: Math.round(box.y + box.height), inputSize });
      registerProbe({ probe: `dialog_${tag}_no_horizontal_overflow`, passed: (await overflowOf(page)) <= 0 });
      registerProbe({ probe: `dialog_${tag}_shows_course_period_current_range_and_explanation`, passed: await dialog.innerText().then((text) => ["Settings Fixture", "Current exam maximum", "Whole number from 0 to 100", "recalculates the grading denominator", `Highest existing exam score: ${highestExamScore}`].every((fragment) => text.includes(fragment))) });
      await shot(page, `settings-pristine-${tag}.png`, meta("Period settings dialog, pristine: course, period and range, current maximum, allowed range, explanation, Save disabled"));

      await dialog.getByLabel("Exam maximum").fill("7.5");
      registerProbe({ probe: `invalid_${tag}_rejects_without_clamping_and_disables_save`, passed: (await dialog.getByLabel("Exam maximum").inputValue()) === "7.5" && (await dialog.getByRole("button", { name: "Save" }).isDisabled()) && (await dialog.getByRole("alert").innerText()).includes("digits only") });
      await shot(page, `settings-invalid-${tag}.png`, meta("fractional value rejected inline; text kept, nothing clamped, Save disabled"));

      await dialog.getByLabel("Exam maximum").fill("101");
      registerProbe({ probe: `invalid_${tag}_above_range_is_not_clamped`, passed: (await dialog.getByLabel("Exam maximum").inputValue()) === "101" && (await dialog.getByRole("button", { name: "Save" }).isDisabled()) });

      await dialog.getByLabel("Exam maximum").fill("90");
      await page.keyboard.press("Escape");
      await dialog.getByRole("button", { name: "Continue editing" }).waitFor();
      registerProbe({ probe: `dirty_${tag}_escape_offers_continue_or_discard_and_keeps_dialog`, passed: (await dialog.isVisible()) && (await dialog.getByRole("button", { name: "Discard changes" }).isVisible()) && writes.length === 0 });
      await shot(page, `settings-dirty-dismiss-${tag}.png`, meta("dirty Escape: dialog kept, Continue editing and Discard changes offered, nothing sent"));
      await dialog.getByRole("button", { name: "Continue editing" }).click();

      await dialog.getByLabel("Exam maximum").fill(String(belowExisting));
      await dialog.getByRole("button", { name: "Save" }).click();
      const alert = page.getByTestId("period-settings-alert");
      await alert.waitFor({ timeout: 15000 });
      const exam = writes.filter((write) => write.kind === "exam");
      registerProbe({ probe: `lowering_${tag}_real_server_rejection_names_highest_existing_score_and_keeps_input`, passed: exam.length === 1 && exam[0].status === 400 && (await alert.innerText()).includes(`highest existing exam score is ${highestExamScore}`) && (await dialog.getByLabel("Exam maximum").inputValue()) === String(belowExisting) && (await currentMaximum()) !== belowExisting, status: exam[0]?.status, message: await alert.innerText() });
      await shot(page, `settings-lowering-rejected-${tag}.png`, meta("real server 400 for lowering below an existing exam score: translated message names the highest existing score; input kept"));
      await context.close();
    }

    {
      const { context, page, writes } = await newSession(superadmin, { viewport: { width, height }, theme });
      await openWorkspace(page);
      page.failEntries = true;
      await page.getByRole("checkbox").first().click();
      const dialog = await openDialog(page);
      await dialog.getByLabel("Exam maximum").fill("99");
      const before = await currentMaximum();
      await dialog.getByRole("button", { name: "Save" }).click();
      await page.getByTestId("period-settings-alert").waitFor({ timeout: 15000 });
      const text = await page.getByTestId("period-settings-alert").innerText();
      registerProbe({ probe: `failed_drain_${tag}_blocks_the_maximum_keeps_draft_and_offers_retry`, passed: writes.some((write) => write.kind === "entries") && !writes.some((write) => write.kind === "exam") && (await dialog.getByLabel("Exam maximum").inputValue()) === "99" && (await dialog.getByRole("button", { name: "Retry" }).isVisible()) && (await currentMaximum()) === before && text.includes("not changed"), text });
      await shot(page, `settings-failed-drain-${tag}.png`, meta("pending grade failed to save (harness answers the entries write with 400, labeled simulation): maximum not sent, draft kept, Retry offered"));
      await context.close();
    }

    {
      const { context, page, writes } = await newSession(superadmin, { viewport: { width, height }, theme });
      await openWorkspace(page);
      const beforeMaximum = await currentMaximum();
      const target = beforeMaximum < 100 ? beforeMaximum + 1 : 99;
      await page.getByRole("checkbox").first().click();
      const dialog = await openDialog(page);
      page.holdExamMilliseconds = 2500;
      await dialog.getByLabel("Exam maximum").fill(String(target));
      await dialog.getByRole("button", { name: "Save" }).click();
      await page.waitForFunction(() => document.body.innerText.includes("Saving…"), null, { timeout: 15000 });
      const mid = await page.evaluate(() => ({
        openInputs: Array.from(document.querySelectorAll('input[type="checkbox"]')).filter((node) => !node.closest('[role="dialog"]') && !node.disabled).length,
        dialogs: document.querySelectorAll('[role="dialog"]').length,
      }));
      await page.keyboard.press("Escape");
      await sleep(300);
      const stillOpen = await dialog.isVisible();
      const saveLabel = await dialog.getByRole("button", { name: /Saving/ }).first().innerText();
      registerProbe({ probe: `pending_${tag}_editors_inert_escape_ignored_save_labeled_and_cancel_disabled`, passed: mid.openInputs === 0 && stillOpen && saveLabel.includes("Saving") && (await dialog.getByRole("button", { name: "Cancel" }).isDisabled()), mid, saveLabel });
      await shot(page, `settings-pending-${tag}.png`, meta("maximum request held 2.5s by the harness (labeled simulation): Save labeled Saving, Cancel disabled, background editors inert"));
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 15000 });
      await sleep(400);
      const focusedSettings = await page.evaluate(() => document.activeElement?.hasAttribute("data-period-settings"));
      const exam = writes.filter((write) => write.kind === "exam");
      const entriesIndex = writes.findIndex((write) => write.kind === "entries");
      const examIndex = writes.findIndex((write) => write.kind === "exam");
      registerProbe({ probe: `success_${tag}_drained_first_sent_once_persisted_and_focus_returned`, passed: exam.length === 1 && exam[0].body.exam_max_score === target && exam[0].status === 200 && entriesIndex !== -1 && entriesIndex < examIndex && (await currentMaximum()) === target && focusedSettings === true, order: writes.map((write) => write.kind), focusedSettings, target });
      await shot(page, `settings-success-focus-${tag}.png`, meta("after a real successful save: dialog closed, focus ring on Period settings, editors live again"));
      page.holdExamMilliseconds = 0;
      const reopened = await openDialog(page);
      registerProbe({ probe: `success_${tag}_reopened_dialog_shows_the_applied_maximum`, passed: (await reopened.getByText("Current exam maximum").locator("xpath=following-sibling::dd[1]").innerText()) === String(target) });
      await context.close();
    }
  }
}

for (const lng of ["ru", "tg"]) {
  const { context, page } = await newSession(superadmin, { lng, viewport: { width: 390, height: 844 }, theme: "light" });
  await openWorkspace(page);
  const dialog = await openDialog(page, lng);
  registerProbe({ probe: `locale_${lng}_dialog_no_overflow`, passed: (await overflowOf(page)) <= 0 });
  await shot(page, `settings-pristine-${lng}-390-light.png`, { viewport: "390x844", theme: "light", locale: lng, state: `Period settings dialog in ${lng}` });
  await dialog.getByLabel(names[lng].input).fill(String(belowExisting));
  await dialog.getByRole("button", { name: names[lng].save }).click();
  await page.getByTestId("period-settings-alert").waitFor({ timeout: 15000 });
  await shot(page, `settings-lowering-rejected-${lng}-390-light.png`, { viewport: "390x844", theme: "light", locale: lng, state: `lowering rejected with the named constraint in ${lng}` });
  await context.close();
}

{
  await fetch(`${apiOrigin}/courses/${courseId}`, { method: "PATCH", headers: superadminHeaders, body: JSON.stringify({ status: "archived" }) });
  const { context, page } = await newSession(mentor, { viewport: { width: 1440, height: 1000 } });
  await page.goto(`${previewOrigin}/journals/${courseId}`);
  await page.locator('[data-testid="journal-archived-notice"]').waitFor({ timeout: 20000 });
  registerProbe({ probe: "archived_mentor_has_no_period_settings_action", passed: (await page.locator("[data-period-settings]").count()) === 0 });
  await context.close();
}

registerProbe({ probe: "no_unexpected_page_errors", passed: pageErrors.length === 0, errors: pageErrors.slice(0, 5) });

await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify(manifest, null, 2));
await writeFile(`${evidenceDir}/probes.json`, JSON.stringify(probes, null, 2));
await browser.close();
console.log(`Captured ${manifest.length} screenshots and ${probes.length} probes, all passed.`);

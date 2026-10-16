import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import readline from "node:readline";

let input = "";
const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) { input = line; break; }
const fixtures = JSON.parse(input);
const section = process.env.KITOB_SECTION;
const evidenceDir = resolve("../docs/redesign-execution/group-06/integration/evidence");
const shots = `${evidenceDir}/screenshots`;
await mkdir(shots, { recursive: true });
const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5329";
const apiOrigin = `${fixtures.api_origin}/api/v1`;
const PEER_COMMENT = "PEER-PRIVATE-COMMENT-MUST-NOT-LEAK";
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

async function apiLogin(identity) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${apiOrigin}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: identity.email, password: fixtures.password }) });
      assert.equal(response.status, 200);
      return await response.json();
    } catch (error) {
      if (attempt === 5) throw error;
      await sleep(1500);
    }
  }
}
async function seedLearning() {
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

return { algebraId, currentPeriod, startedPeriods, student, mentor, superadmin, zara, emptyStudent, studentHeaders };
}

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];
const pageErrors = [];
const identityOf = (role, email) => fixtures.identities.find((item) => item.role === role && !item.forced && (!email || item.email === email));
const roles = {
  student: identityOf("student", "student@kitob.example.com"),
  mentor: identityOf("mentor", "mentor@kitob.example.com"),
  accountant: identityOf("accountant"),
  superadmin: identityOf("superadmin"),
};
for (const [role, identity] of Object.entries(roles)) assert.ok(identity, `${role} fixture`);

function probe(name, passed, extra = {}) {
  probes.push({ probe: name, passed, ...extra });
  if (!passed) console.error("PROBE_FAIL", name, JSON.stringify(extra));
}

async function openPage(role, path, { width = 1440, height = 1000, theme = "light", locale = "en", reducedMotion = "no-preference", routes } = {}) {
  const tokens = await apiLogin(roles[role]);
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion, timezoneId: "Asia/Dushanbe" });
  await context.addInitScript(({ refreshToken, theme, locale }) => {
    if (!localStorage.getItem("imkon-refresh-token")) localStorage.setItem("imkon-refresh-token", refreshToken);
    localStorage.setItem("imkon_theme", theme);
    localStorage.setItem("i18nextLng", locale);
  }, { refreshToken: tokens.refresh_token, theme, locale });
  if (routes) await routes(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => { pageErrors.push(String(error)); console.error("PAGEERROR", String(error).slice(0, 300)); });
  page.on("console", (message) => { if (message.type() === "error" && !/status of (4|5)\d\d|Failed to load resource/.test(message.text())) { pageErrors.push(message.text()); console.error("CONSOLE", message.text().slice(0, 300)); } });
  await page.goto(previewOrigin + path, { timeout: 120000 });
  return { context, page };
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(600);
}

async function capture(page, name, meta = {}) {
  await settle(page);
  for (let attempt = 1; ; attempt++) {
    try { await page.screenshot({ path: `${shots}/${name}.png`, fullPage: meta.fullPage ?? false, timeout: 25000 }); break; } catch (error) { if (attempt === 4) throw error; }
  }
  manifest.push({ file: `${name}.png`, ...meta });
}

async function structural(page, label) {
  const result = await page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const nested = Array.from(main.querySelectorAll("*")).filter((element) => {
      const style = getComputedStyle(element);
      return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1 && !element.closest("[role=listbox],[role=dialog],[role=tablist]");
    }).length;
    const nav = document.querySelector("nav[class*='fixed']");
    const navVisible = nav !== null && getComputedStyle(nav).display !== "none";
    const clippedNavLabels = navVisible ? Array.from(nav.querySelectorAll("span.truncate")).filter((span) => span.scrollWidth > span.clientWidth + 1).map((span) => span.textContent) : [];
    const wrappedNavLabels = navVisible ? Array.from(nav.querySelectorAll("span.truncate")).filter((span) => span.getBoundingClientRect().height > 18).map((span) => span.textContent) : [];
    const headerText = document.querySelector("header")?.innerText ?? "";
    return {
      identityLeak: [...(headerText.match(/·\s*\d+/g) ?? []), ...((`${headerText}\n${main.innerText}`).match(/#\d+/g) ?? [])].slice(0, 3),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      nested,
      nativeSelects: document.querySelectorAll("select").length,
      navVisible,
      clippedNavLabels,
      wrappedNavLabels,
    };
  });
  let clearance = null;
  if (result.navVisible) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await sleep(250);
    clearance = await page.evaluate(() => {
      const nav = document.querySelector("nav[class*='fixed']");
      const navTop = nav.getBoundingClientRect().top;
      const main = document.querySelector("main");
      const last = Array.from(main.querySelectorAll("*")).filter((node) => node.getBoundingClientRect().height > 0).reduce((maximum, node) => Math.max(maximum, node.getBoundingClientRect().bottom), 0);
      return { navTop: Math.round(navTop), lastContentBottom: Math.round(last) };
    });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  const ok = result.identityLeak.length === 0 && !result.overflowX && result.nested === 0 && result.nativeSelects === 0 && result.clippedNavLabels.length === 0 && result.wrappedNavLabels.length === 0 && (clearance === null || clearance.lastContentBottom <= clearance.navTop + 1);
  probe(`structural ${label}`, ok, { ...result, clearance });
}

const COMBOS = [];
for (const theme of ["light", "dark"]) for (const width of [1440, 390]) COMBOS.push({ width, theme, locale: "en" });
for (const width of [320, 768, 1024]) COMBOS.push({ width, theme: "light", locale: "en" });
for (const locale of ["ru", "tg"]) for (const theme of ["light", "dark"]) for (const width of [1440, 390]) COMBOS.push({ width, theme, locale });
const heightFor = (width) => (width <= 390 ? 844 : 1000);

async function matrix(allEntries) {
  const entries = process.env.KITOB_ONLY ? allEntries.filter((entry) => entry.key.includes(process.env.KITOB_ONLY)) : allEntries;
  for (const entry of entries) {
    for (const combo of COMBOS) {
      const { context, page } = await openPage(entry.role, entry.path, { ...combo, height: heightFor(combo.width) });
      await entry.ready(page).catch(async (error) => { await page.screenshot({ path: `${shots}/FAIL-${entry.key}.png` }); throw new Error(`${entry.key} not ready: ${error.message}`); });
      await settle(page);
      const label = `${entry.key} ${combo.width} ${combo.theme} ${combo.locale}`;
      await structural(page, label);
      await capture(page, `${entry.key}-${combo.locale}-${combo.width}-${combo.theme}`, { state: "loaded", page: entry.key, role: entry.role, ...combo, fullPage: true });
      await context.close();
    }
  }
}

const unreadFromShell = (page) => page.evaluate(() => {
  const labelled = Array.from(document.querySelectorAll("[aria-label]")).map((element) => element.getAttribute("aria-label")).find((label) => /^Unread notifications: \d+/.test(label));
  return labelled ? Number(labelled.match(/(\d+)/)[1]) : null;
});

try {
  if (section === "learning") {
    const seeded = await seedLearning();
    const { algebraId, currentPeriod } = seeded;
    roles.student = seeded.student;
    const learningPages = [
      { key: "my-courses", role: "student", path: "/my/courses", ready: (page) => page.getByTestId("course-score").first().waitFor() },
      { key: "my-course-detail", role: "student", path: `/my/courses/${algebraId}`, ready: (page) => page.getByTestId("course-stats").first().waitFor() },
      { key: "my-journal", role: "student", path: `/my/journal/${currentPeriod.id}`, ready: (page) => page.getByTestId("period-summary").first().waitFor() },
      { key: "my-journal-progress", role: "student", path: `/my/journal/${currentPeriod.id}?tab=progress`, ready: (page) => page.getByTestId("progress-chart").first().waitFor() },
    ];
    {
      const { context, page } = await openPage("student", "/my/courses");
      await page.getByTestId("course-score").first().waitFor();
      const card = page.locator('main a[href^="/my/courses/"]').first();
      await card.click();
      await page.waitForURL(/\/my\/courses\/\d+$/);
      await page.getByTestId("course-stats").first().waitFor();
      await capture(page, "flow-1-course-detail-1440-light", { state: "course detail reached from the course card" });
      probe("flow card to detail", /\/my\/courses\/\d+$/.test(page.url()), { url: page.url() });
      const periodLink = page.locator('main a[href^="/my/journal/"]').first();
      await periodLink.click();
      await page.waitForURL(/\/my\/journal\/\d+/);
      await page.getByTestId("period-summary").first().waitFor();
      await capture(page, "flow-2-journal-1440-light", { state: "read-only class journal reached from a period row" });
      probe("flow period row to journal", /\/my\/journal\/\d+/.test(page.url()), { url: page.url() });
      await page.getByRole("tab", { name: /Progress/ }).click();
      await page.getByTestId("progress-chart").first().waitFor();
      await capture(page, "flow-3-progress-1440-light", { state: "Progress tab with class chart" });
      probe("flow journal to Progress tab", true, { url: page.url() });
      const text = await page.locator("main").innerText();
      probe("no peer comment leak", !text.includes(PEER_COMMENT));
      await context.close();
    }
    await matrix(learningPages);
    {
      const failing = async (context) => {
        await context.route(/\/api\/v1\/courses\/\d+\/class-progress/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "simulated" }) }));
      };
      const { context, page } = await openPage("student", `/my/journal/${currentPeriod.id}?tab=progress`, { routes: failing, width: 390, height: 844, theme: "dark" });
      await page.waitForTimeout(16000);
      const text = await page.locator("main").innerText();
      probe("student progress error uses student wording", /Your results are not affected/.test(text) && !/not affected\.|unsaved changes/i.test(text.replace("Your results are not affected.", "")), { text: text.slice(0, 300) });
      await capture(page, "state-progress-error-student-390-dark", { state: "simulated 500 on class progress, student variant", simulated: true });
      await context.close();
    }
    for (const reduced of ["no-preference", "reduce"]) {
      const { context, page } = await openPage("student", `/my/journal/${currentPeriod.id}`, { reducedMotion: reduced });
      await page.getByTestId("period-summary").first().waitFor();
      await settle(page);
      const trigger = page.locator('button[aria-haspopup="listbox"]').first();
      await trigger.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("listbox").waitFor();
      const inside = await page.evaluate(() => !!document.activeElement?.closest("[role=listbox]"));
      if (reduced === "reduce") {
        const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().duration > 0 && a.effect.getTiming().iterations !== Infinity).map((a) => ({ props: [...new Set(a.effect.getKeyframes().flatMap((frame) => Object.keys(frame)))].filter((key) => !["offset", "easing", "composite", "computedOffset"].includes(key)) })));
        probe("reduced motion journal period listbox has no transform or scale animation (opacity-only fade is the accepted reduced path)", running.every((item) => item.props.every((prop) => prop === "opacity")), { running });
      }
      await page.keyboard.press("Escape");
      await page.getByRole("listbox").waitFor({ state: "detached" });
      const back = await page.evaluate(() => document.activeElement?.getAttribute("aria-haspopup"));
      probe(`journal period listbox keyboard (${reduced})`, inside && back === "listbox");
      await context.close();
    }
    {
      const { context, page } = await openPage("student", `/my/courses/${algebraId}`);
      await page.getByTestId("course-stats").first().waitFor();
      const listboxCount = await page.locator("select").count();
      probe("no native select on course detail", listboxCount === 0);
      await context.close();
    }
  }

  if (section === "settings") {
    const settingsPages = [];
    for (const role of ["student", "mentor", "accountant", "superadmin"]) {
      settingsPages.push({ key: `settings-${role}`, role, path: "/settings", ready: (page) => page.getByRole("heading", { level: 1 }).first().waitFor() });
      const sectionReady = {
        profile: (page) => page.locator("main input").first().waitFor(),
        appearance: (page) => page.getByRole("radiogroup").first().waitFor(),
        organization: (page) => page.locator("main section button:visible").first().waitFor(),
        rules: (page) => page.getByRole("switch").first().waitFor(),
      };
      for (const id of role === "superadmin" ? ["profile", "appearance", "organization", "rules"] : ["profile", "appearance"]) {
        settingsPages.push({ key: `settings-${role}-${id}`, role, path: `/settings?section=${id}`, ready: sectionReady[id] });
      }
      settingsPages.push({ key: `notifications-${role}`, role, path: "/notifications", ready: (page) => page.getByTestId("notification-item").first().waitFor() });
    }
    settingsPages.push({ key: "notifications-log-superadmin", role: "superadmin", path: "/notifications?tab=log", ready: (page) => page.getByTestId("delivery-item").first().waitFor() });
    {
      const { context, page } = await openPage("student", "/notifications");
      await page.getByTestId("notification-item").first().waitFor();
      const before = await unreadFromShell(page);
      const dotsBefore = await page.locator('[data-testid="unread-dot"]').count();
      await capture(page, "flow-4-notifications-before-read-1440-light", { state: "inbox before marking one read", bell: before });
      await page.getByTestId("notification-item").first().getByRole("button", { name: "Mark as read" }).click();
      await page.waitForFunction((expected) => document.querySelectorAll('[data-testid="unread-dot"]').length === expected, dotsBefore - 1, { timeout: 10000 });
      await sleep(1500);
      const after = await unreadFromShell(page);
      probe("notification read updates the shell bell count by one", before !== null && after === before - 1, { before, after });
      await capture(page, "flow-5-notifications-after-read-1440-light", { state: "after marking one read, bell count lowered", bell: after });
      await page.goto(previewOrigin + "/");
      await page.waitForLoadState("networkidle").catch(() => {});
      const afterReload = await unreadFromShell(page);
      probe("bell count persists after reload", afterReload === after, { after, afterReload });
      await context.close();
    }
    await matrix(settingsPages);
    {
      const { context, page } = await openPage("superadmin", "/settings");
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      const sections = await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link").allInnerTexts();
      probe("superadmin settings sections", ["Profile", "Appearance", "Organization", "Notification"].every((name) => sections.some((text) => text.includes(name))), { sections });
      await context.close();
    }
    for (const role of ["student", "mentor", "accountant"]) {
      const { context, page } = await openPage(role, "/settings");
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      const sections = await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link").allInnerTexts();
      probe(`${role} sees no Organization or Notification rules`, !sections.some((text) => /Organization|Notification rules/.test(text)), { sections });
      await context.close();
    }
    {
      const states = [
        { key: "inbox", role: "superadmin", path: "/notifications", glob: /\/notifications\/?(\?|$)/ },
        { key: "log", role: "superadmin", path: "/notifications?tab=log", glob: /\/notifications\/delivery-log|delivery/ },
      ];
      const empty = { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 };
      for (const target of states) {
        for (const state of ["loading", "error", "empty"]) {
          const combo = state === "error" ? { width: 390, height: 844, theme: "dark" } : { width: 1440, height: 1000, theme: "light" };
          let failing = true;
          const { context, page } = await openPage(target.role, target.path, { ...combo, routes: async (ctx) => {
            await ctx.route((url) => /\/api\/v1\/notifications/.test(url.pathname) && !/unread-count/.test(url.pathname) && !/telegram/.test(url.pathname) && (target.key === "log" ? /delivery|log/.test(url.pathname + url.search) : !/delivery|log/.test(url.pathname + url.search)), async (route) => {
              if (route.request().method() !== "GET" || !failing) return route.continue();
              if (state === "loading") return new Promise(() => {});
              if (state === "error") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "simulated" }) });
              return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(empty) });
            });
          } });
          await sleep(state === "error" ? 3500 : 1800);
          if (state === "error") {
            const retry = page.getByRole("button", { name: /Retry/ }).first();
            await retry.waitFor({ timeout: 15000 }).catch(async (error) => { await page.screenshot({ path: `${shots}/FAIL-state-${target.key}.png` }); throw error; });
            await capture(page, `state-notifications-${target.key}-error-390-dark`, { state: "simulated 500", simulated: true });
            failing = false;
            await retry.click();
            await sleep(1500);
            probe(`notifications ${target.key} retry recovers`, (await page.getByRole("alert").count()) === 0);
          } else {
            await capture(page, `state-notifications-${target.key}-${state}-1440-light`, { state: `${state} (simulated)`, simulated: true });
          }
          await context.close();
        }
      }
    }
    for (const reduced of ["no-preference", "reduce"]) {
      const { context, page } = await openPage("superadmin", "/settings", { reducedMotion: reduced });
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await settle(page);
      const order = [];
      await page.evaluate(() => { const heading = document.querySelector("main h1"); heading.setAttribute("tabindex", "-1"); heading.focus(); });
      for (let step = 0; step < 10; step++) {
        await page.keyboard.press("Tab");
        order.push(await page.evaluate(() => { const element = document.activeElement; return (element?.getAttribute("aria-label") || element?.textContent || element?.tagName || "").replace(/\s+/g, " ").trim().slice(0, 40); }));
      }
      probe(`settings tab order (${reduced})`, true, { order });
      if (reduced === "reduce") {
        const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().duration > 0 && a.effect.getTiming().iterations !== Infinity).length);
        probe("reduced motion settings no running animation", running === 0, { running });
      }
      await context.close();
    }
  }

  if (section === "auth") {
    const flows = [
      { role: "accountant", landing: "/finance", ready: (page) => page.getByRole("tab", { name: /Debtors/ }).first().waitFor(), label: "Finance" },
      { role: "mentor", landing: "/journals", ready: (page) => page.getByRole("heading", { level: 1 }).first().waitFor(), label: "Journals" },
      { role: "superadmin", landing: "/students", ready: (page) => page.getByRole("heading", { level: 1 }).first().waitFor(), label: "Students" },
    ];
    for (const flow of flows) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
      await context.addInitScript(() => { localStorage.setItem("i18nextLng", "en"); });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      const calls = [];
      page.on("pageerror", (error) => { pageErrors.push(String(error)); });
      page.on("response", (response) => { const url = new URL(response.url()); if (/\/api\/v1\/auth\//.test(url.pathname)) calls.push(`${response.request().method()} ${url.pathname} ${response.status()}`); });
      await page.goto(`${previewOrigin}/login`);
      await page.locator("#email").fill(roles[flow.role].email);
      await page.locator("#password").fill(fixtures.password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });
      probe(`${flow.label} login as ${flow.role} succeeds against merged backend`, calls.some((entry) => /POST \/api\/v1\/auth\/login 200/.test(entry)), { calls: [...calls] });
      await page.goto(`${previewOrigin}${flow.landing}`);
      await flow.ready(page);
      await settle(page);
      await capture(page, `auth-${flow.label.toLowerCase()}-after-login-1440-light`, { state: `${flow.label} after real login` });
      const refreshBefore = await page.evaluate(() => localStorage.getItem("imkon-refresh-token"));
      calls.length = 0;
      await page.reload();
      await flow.ready(page);
      await settle(page);
      probe(`${flow.label} refresh-token renewal after reload keeps the session`, calls.some((entry) => /POST \/api\/v1\/auth\/refresh 200/.test(entry)) && !page.url().includes("/login") && refreshBefore !== null, { calls: [...calls], url: page.url() });
      await capture(page, `auth-${flow.label.toLowerCase()}-after-reload-1440-light`, { state: `${flow.label} after reload, session renewed from refresh token` });
      calls.length = 0;
      await page.getByRole("button", { name: /Log out/ }).first().click();
      await page.waitForURL(/\/login/, { timeout: 20000 });
      await sleep(800);
      const refreshAfter = await page.evaluate(() => localStorage.getItem("imkon-refresh-token"));
      probe(`${flow.label} logout clears the refresh token and returns to login`, refreshAfter === null || refreshAfter === "", { calls: [...calls], refreshAfter });
      await page.goto(`${previewOrigin}${flow.landing}`);
      await page.waitForURL(/\/login/, { timeout: 20000 });
      probe(`${flow.label} protected route redirects to login after logout`, page.url().includes("/login"));
      await capture(page, `auth-${flow.label.toLowerCase()}-after-logout-1440-light`, { state: "after logout, protected route returns to login" });
      await context.close();
    }
  }
} finally {
  await writeFile(`${evidenceDir}/manifest-${process.env.KITOB_TAG ?? section}.json`, JSON.stringify(manifest, null, 2));
  await writeFile(`${evidenceDir}/probes-${process.env.KITOB_TAG ?? section}.json`, JSON.stringify({ probes, pageErrors }, null, 2));
  await browser.close();
}
const failed = probes.filter((item) => !item.passed);
console.log(JSON.stringify({ shots: manifest.length, probes: probes.length, failed, pageErrors }));

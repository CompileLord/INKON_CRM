import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
const evidence = `${homedir()}/.local/state/imkon-remediation/fer`;
const browser = await chromium.launch({ channel: "chrome" });
const scenes = process.env.FER_SCENES?.split(",") ?? ["history", "history-empty", "mentor", "phone-error"];
const probes = [];
const errors = [];
const user = { id: 42, role: "student", first_name: "Aziza", last_name: "Karimova", email: "aziza@example.test", phone: "992901234567", date_of_birth: null, parent_phone: null, parent_telegram_chat_id: null, payment_day_of_month: null, photo_path: null, thumbnail_path: null, must_set_password: false, is_deleted: false, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
const course = { id: 4, title: "Mathematics", mentor_id: 10, description: "", photo_path: null, start_date: "2026-01-01", end_date: "2026-12-31", exam_type: "monthly", price: "100.00", status: "active", is_deleted: false, created_at: user.created_at, updated_at: user.updated_at };
const performance = { scope: "single_course", measured_population: "single_course_recorded_period_summaries", denominator_basis: "stored_period_total_lessons", grading_state: "unknown", grading_provenance: "unknown", raw_avg_percentage: 80, attendance_percentage: 80, attendance_denominator: 100, attended_lessons: 80, absences: 20, total_lessons: 100, period_summaries_count: 150, periods_with_max_score_count: 150 };
const profile = { user, totals: { avg_percentage: 80, attendance_percentage: 80, absences: 20, total_lessons: 100, active_course_count: 1, archived_course_count: 0 }, courses: [{ course, enrollment_status: "active", bucket: "active", my_avg_percentage: 80, my_total_score: 800, my_total_max_score: 1000, attendance_percentage: 80, absences: 20, periods_total: 150, periods_graded: 150, my_rank: 1, class_size: 1, class_avg_percentage: 80, next_lesson_at: null, performance }], performance: { ...performance, scope: "all_recorded_student_period_summaries", measured_population: "all_recorded_student_period_summaries" } };
const periods = [3, 2, 1].map(id => ({ journal_id: id, course_id: 4, course_title: "Mathematics", period_label: `Week ${id}`, period_start: `2026-09-${String(id * 7).padStart(2, "0")}`, period_end: `2026-09-${String(id * 7 + 6).padStart(2, "0")}`, sum_score: id * 20, max_period_score: 100, percentage: id * 20, attendance_count: 4, total_lessons: 5, state: "graded" }));
try {
  for (const theme of ["light", "dark"]) for (const [size, width, height] of [["desktop", 1280, 800], ["mobile", 390, 844]]) for (const scene of scenes) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: "reduce" });
    await context.addInitScript(({ theme }) => { localStorage.setItem("imkon-refresh-token", "mock-session"); localStorage.setItem("imkon_theme", theme); localStorage.setItem("i18nextLng", "en"); }, { theme });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    const requests = [];
    await page.route("**/api/v1/**", async route => {
      const url = new URL(route.request().url());
      requests.push(url.pathname + url.search);
      let body = {};
      if (url.pathname.endsWith("/auth/refresh")) body = { access_token: `e30.${Buffer.from(JSON.stringify({ sub: "42", role: "student", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.mock`, refresh_token: "mock-session", token_type: "bearer", must_set_password: false };
      else if (url.pathname.endsWith("/users/me")) body = user;
      else if (/\/students\/(42|me)\/profile$/.test(url.pathname)) body = scene === "profile-phone" ? { ...profile, user: { ...user, parent_phone: "992901234568" } } : profile;
      else if (url.pathname.endsWith("/students/me/journals/page")) body = { items: scene === "history-empty" ? [] : url.searchParams.has("cursor") ? [periods[2]] : periods.slice(0, 2), next_cursor: scene === "history-empty" || url.searchParams.has("cursor") ? null : "signed-next", has_upcoming_periods: false };
      else if (url.pathname.endsWith("/mentors/10/profile")) body = { user: { id: 10, first_name: "Alisher", last_name: "Navoiy", photo_path: null, thumbnail_path: null }, active_courses: [{ id: 4, title: "Mathematics", photo_path: null }] };
      else if (url.pathname.endsWith("/settings/org")) body = { org_name: "Kitob", notify_payments: true, notify_debts: true };
      else if (/notifications|documents/.test(url.pathname)) body = { items: [], total: 0, page: 1, page_size: 20, total_pages: 0, unread_count: 0 };
      else if (/schedule/.test(url.pathname)) body = [];
      await route.fulfill({ json: body });
    });
    const path = scene === "profile-phone" ? "/students/42" : scene.startsWith("history") ? "/students/42?tab=performance" : scene === "mentor" ? "/mentors/10" : "/settings";
    await page.goto(`http://127.0.0.1:4173${path}`);
    if (scene === "history") { await page.getByRole("button", { name: "Load more", exact: true }).waitFor(); await page.getByTestId("student-history").scrollIntoViewIfNeeded(); }
    if (scene === "history-empty") { await page.getByText("No history yet", { exact: true }).waitFor(); await page.getByTestId("student-history").scrollIntoViewIfNeeded(); }
    if (scene === "history-empty") assert.equal(await page.getByTestId("student-history").getByText(/All .* started periods loaded|Showing .* periods/).count(), 0);
    if (scene === "profile-phone") {
      await page.locator("[data-entity-header]").getByText("+992901234567", { exact: true }).waitFor();
      await page.locator("[data-entity-header]").getByText("Parent: +992901234568", { exact: true }).waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    if (scene === "mentor") await page.getByRole("heading", { name: "Alisher Navoiy" }).waitFor();
    if (scene === "phone-error") { await page.getByLabel("Phone", { exact: true }).fill(" +99290 "); await page.getByLabel("Phone", { exact: true }).evaluate(element => element.scrollIntoView({ block: "center" })); await page.getByRole("alert").waitFor(); }
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    if (dimensions.scroll > dimensions.width) { await page.screenshot({ path: `${evidence}/screens/overflow.png` }); console.log(await page.evaluate(() => Array.from(document.querySelectorAll("body *")).map(element => ({ tag: element.tagName, cls: element.className, right: element.getBoundingClientRect().right, text: element.textContent?.slice(0, 50) })).filter(item => item.right > 391))); }
    assert.ok(dimensions.scroll <= dimensions.width, JSON.stringify({ scene, theme, size, dimensions }));
    if (scene === "mentor") assert.ok(!requests.some(path => /analytics|documents/.test(path)));
    if (scene === "history") { assert.equal(requests.filter(path => path.includes("journals/page")).length, 1); }
    await page.screenshot({ path: `${evidence}/screens/${scene}-${theme}-${size}.png` });
    if (scene === "history") { await page.getByRole("button", { name: "Load more", exact: true }).click(); await page.getByText("All 3 started periods loaded.", { exact: true }).waitFor(); }
    probes.push({ scene, theme, size, dimensions, requests });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${evidence}/screens/${process.env.FER_SCENES ? "audit-fixes-probes" : "probes"}.json`, JSON.stringify({ probes, errors }, null, 2));
  console.log(`PASS ${probes.length} screenshots; no horizontal overflow; cursor interaction and privacy checks passed`);
} finally { await browser.close(); }

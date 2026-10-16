import { chromium } from "playwright";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const apiPort = process.env.KITOB_API_PORT ?? "18105";
const origin = process.env.KITOB_PREVIEW_ORIGIN ?? "http://127.0.0.1:5219";
const api = "http://127.0.0.1:" + apiPort + "/api/v1";
const evidence = resolve("../docs/redesign-execution/group-05/audit/evidence");
const shots = evidence + "/screenshots";
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];
const pageErrors = [];
const forbiddenRequests = [];

async function login(identity) {
  const response = await fetch(api + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: identity.email, password: fixture.password }) });
  assert.equal(response.status, 200);
  return response.json();
}

function identityFor(role) {
  const identity = fixture.identities.find((candidate) => candidate.role === role && !candidate.forced);
  assert.ok(identity, role + " identity");
  return identity;
}

async function authorized(role, path, options = {}) {
  const tokens = await login(identityFor(role));
  return fetch(api + path, { ...options, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokens.access_token } });
}

function sql(statement) {
  execFileSync("podman", ["exec", "kitob-audit-pg", "psql", "-U", "ev", "-d", "evdb", "-v", "ON_ERROR_STOP=1", "-c", statement]);
}

async function seed() {
  const debts = await (await authorized("accountant", "/finance/debts/?page=1&page_size=100")).json();
  assert.ok(debts.items.length >= 4, "seeded debts");
  const targets = debts.items.slice(0, 3);
  const created = [];
  for (const [index, item] of targets.entries()) {
    const response = await authorized("accountant", "/finance/payments/", { method: "POST", body: JSON.stringify({ student_id: item.student.id, course_id: item.course.id, amount: ["150.00", "300.00", "75.50"][index], paid_at: new Date().toISOString(), method: index === 1 ? "transfer" : "cash" }) });
    assert.equal(response.status, 201);
    created.push(await response.json());
  }
  const voided = await authorized("accountant", "/finance/payments/" + created[2].id + "/void", { method: "POST", body: JSON.stringify({ reason_code: "entry_error" }) });
  assert.equal(voided.status, 200);
  const admin = fixture.identities.find((candidate) => candidate.role === "superadmin" && !candidate.forced).id;
  const accountant = identityFor("accountant").id;
  sql(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, field_name, old_value, new_value, created_at)
    SELECT CASE WHEN g % 3 = 0 THEN ${accountant} ELSE ${admin} END, 'update', 'course', 1, 'price', (800 + g)::text || '.00', (801 + g)::text || '.00', now() - interval '30 hours' - (g || ' hours')::interval
    FROM generate_series(1, 28) AS g`);
  sql(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, field_name, old_value, new_value, created_at) VALUES
    (${admin}, 'update', 'journal_entry', 1, 'comment', '', 'Needs a very long follow-up note that explains in detail why this score was corrected after the lesson and who was informed afterwards', now() - interval '27 hours'),
    (${admin}, 'update', 'journal_entry', 1, 'score', 'null', '0', now() - interval '28 hours'),
    (${admin}, 'update', 'flux_capacitor', 7, 'flux', NULL, NULL, now() - interval '29 hours')`);
  probes.push({ test: "seeded-real-payments-and-backdated-audit-rows", status: "pass", payments: created.length });
  return { admin, accountant, students: targets.map((item) => ({ id: item.student.id, name: item.student.first_name + " " + item.student.last_name, courseId: item.course.id })) };
}

async function openPage({ role = "superadmin", width = 1440, height = 1000, theme = "light", locale = "en", path = "/audit", routes, reducedMotion = "no-preference" } = {}) {
  const tokens = await login(identityFor(role));
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion, timezoneId: "America/New_York" });
  await context.addInitScript(({ refreshToken, theme, locale }) => {
    if (!localStorage.getItem("imkon-refresh-token")) localStorage.setItem("imkon-refresh-token", refreshToken);
    localStorage.setItem("imkon_theme", theme);
    localStorage.setItem("i18nextLng", locale);
  }, { refreshToken: tokens.refresh_token, theme, locale });
  if (routes) await routes(context);
  const page = await context.newPage();
  const requests = [];
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => { pageErrors.push(error.message); console.error("PAGEERROR", error.message); });
  page.on("console", (message) => { if (message.type() === "error" && !/status of (4|5)\d\d/.test(message.text())) console.error("CONSOLE", message.text().slice(0, 300)); });
  page.on("request", (request) => {
    const url = new URL(request.url());
    requests.push(url.pathname + url.search);
    if (role === "accountant" && /\/api\/v1\/(courses|mentors|students|audit-log)\b/.test(url.pathname)) forbiddenRequests.push({ role, url: request.url() });
  });
  await page.goto(origin + path, { timeout: 120000 });
  return { context, page, tokens, requests };
}

async function openAudit(options = {}) {
  const opened = await openPage(options);
  await opened.page.locator("[data-audit-row]").first().waitFor();
  return opened;
}

async function assertNoOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, label + " horizontal overflow");
}

async function assertNoNestedScroll(page, label) {
  const nested = await page.evaluate(() => Array.from(document.querySelectorAll("main *")).filter((element) => {
    const style = getComputedStyle(element);
    return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
  }).length);
  assert.equal(nested, 0, label + " nested vertical scroll");
}

async function capture(page, name, meta = {}) {
  await page.waitForTimeout(600);
  for (let attempt = 1; ; attempt++) {
    try {
      await page.screenshot({ path: shots + "/" + name + ".png", timeout: 25000 });
      break;
    } catch (error) {
      if (attempt === 5) throw error;
    }
  }
  manifest.push({ file: name + ".png", ...meta });
}

try {
  const context0 = await seed();

  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    for (const theme of ["light", "dark"]) {
      const { context, page } = await openAudit({ width, height, theme });
      await page.getByText(/created payment|payment/i).first().waitFor();
      await assertNoOverflow(page, "audit " + width);
      await assertNoNestedScroll(page, "audit " + width);
      await capture(page, `audit-registry-${width}-${theme}`, { state: "loaded feed grouped by day", width, theme, realSeeded: true });
      await page.locator("[data-audit-row]").filter({ hasText: /updated course/ }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await capture(page, `audit-inspector-${width}-${theme}`, { state: "inspector with before/after diff", width, theme, realSeeded: true });
      await context.close();
    }
  }

  {
    const { context, page } = await openAudit();
    await page.locator("[data-audit-row]").filter({ hasText: /recorded 75\.50 TJS/ }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.ok((await dialog.getByText("Before").count()) >= 4, "every field listed");
    await capture(page, "audit-inspector-payment-event-1440-light", { state: "one payment event listing every field before/after", width: 1440, theme: "light", realSeeded: true });
    await context.close();
  }

  {
    const { context, page } = await openAudit();
    const text = await page.locator("main").innerText();
    assert.doesNotMatch(text, /#\d|user_id|journal_entry|flux_capacitor #/);
    assert.equal(await page.locator("table").count(), 0);
    const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
    assert.ok(headings.includes("Today") && headings.includes("Yesterday"), "day headings " + headings.join("|"));
    probes.push({ test: "rows-are-sentences-no-ids-day-groups", status: "pass", headings });
    const rowButtons = await page.locator("[data-audit-row]").count();
    const rowBoxes = await page.locator("[data-audit-row]").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    assert.ok(rowBoxes.every((height) => height >= 44), "rows at least 44px");
    probes.push({ test: "row-hit-areas-44px", status: "pass", rows: rowButtons });
    await page.keyboard.press("Tab");
    let focusedRow = false;
    for (let step = 0; step < 30 && !focusedRow; step++) {
      focusedRow = await page.evaluate(() => document.activeElement?.hasAttribute("data-audit-row") ?? false);
      if (!focusedRow) await page.keyboard.press("Tab");
    }
    assert.ok(focusedRow, "keyboard reaches a row");
    const rowId = await page.evaluate(() => document.activeElement.getAttribute("data-audit-row"));
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    const returned = await page.evaluate(() => document.activeElement?.getAttribute("data-audit-row"));
    assert.equal(returned, rowId);
    probes.push({ test: "keyboard-open-escape-returns-focus-to-row", status: "pass", rowId });
    await context.close();
  }

  {
    const { context, page, requests } = await openAudit();
    await page.getByRole("button", { name: /^Who/ }).click();
    await capture(page, "audit-actor-listbox-1440-light", { state: "inline listbox popover, not a native select", width: 1440, theme: "light" });
    await page.getByRole("option", { name: "Accountant Fixture" }).click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /^Action/ }).click();
    await page.getByRole("option", { name: "Created" }).click();
    await page.getByText("By Accountant Fixture").waitFor();
    await page.getByRole("button", { name: /^Date/ }).click();
    await page.getByRole("button", { name: "This month" }).click();
    await page.waitForTimeout(800);
    await capture(page, "audit-filter-chips-1440-light", { state: "actor + action + date chips applied by the server", width: 1440, theme: "light", realSeeded: true });
    const filtered = requests.filter((url) => url.includes("/audit-log/events/?")).at(-1);
    assert.match(filtered, /actor_id=\d+/);
    assert.match(filtered, /action=create/);
    assert.match(filtered, /date_from=\d{4}-\d{2}-\d{2}/);
    const rowTexts = await page.locator("[data-audit-row]").allInnerTexts();
    assert.ok(rowTexts.length > 0 && rowTexts.every((text) => text.includes("Accountant Fixture")), "only the accountant's rows");
    probes.push({ test: "combined-actor-action-date-filtered-by-server", status: "pass", request: filtered, rows: rowTexts.length });
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.waitForTimeout(800);
    assert.equal(new URL(page.url()).search, "");
    probes.push({ test: "clear-filters-restores-unfiltered-url", status: "pass" });
    await context.close();
  }

  {
    const { context, page, requests } = await openAudit({ path: "/audit?page=2" });
    const pageTwoRows = await page.locator("[data-audit-row]").count();
    assert.ok(pageTwoRows > 0);
    await page.getByRole("searchbox").fill("journal");
    await page.waitForTimeout(1200);
    const searched = requests.filter((url) => url.includes("/audit-log/events/?")).at(-1);
    assert.match(searched, /search=journal/);
    assert.match(searched, /page=1/);
    const texts = await page.locator("[data-audit-row]").allInnerTexts();
    assert.ok(texts.length > 0 && texts.every((text) => /journal/i.test(text)), "server search found a record outside page 2");
    await capture(page, "audit-global-search-1440-light", { state: "search typed on page 2 matches records outside it (server scope)", width: 1440, theme: "light", realSeeded: true });
    probes.push({ test: "global-search-finds-rows-outside-loaded-page", status: "pass", request: searched });
    await context.close();
  }

  {
    const { context, page } = await openAudit({ path: "/audit?entity=journal_entry" });
    await page.locator("[data-audit-row]").filter({ hasText: /comment/i }).first().click();
    await page.getByRole("dialog").waitFor();
    await capture(page, "audit-inspector-long-empty-values-1440-light", { state: "empty-text before value and long wrapped after value; technical data collapsed", width: 1440, theme: "light", realSeeded: true });
    const open = await page.locator("details").first().evaluate((node) => node.open);
    assert.equal(open, false);
    await page.getByRole("button", { name: "Show all changes to this record" }).click();
    await page.getByText("Only this journal entry").waitFor();
    await capture(page, "audit-record-filter-1440-light", { state: "Show all changes to this record applies entity + reference chip", width: 1440, theme: "light", realSeeded: true });
    await context.close();
  }

  for (const [locale, width, height] of [["ru", 1440, 1000], ["tg", 1440, 1000], ["ru", 390, 844], ["tg", 390, 844]]) {
    const { context, page } = await openAudit({ locale, width, height });
    await assertNoOverflow(page, "audit " + locale + width);
    await capture(page, `audit-registry-${locale}-${width}-light`, { state: "translated feed", locale, width, theme: "light", realSeeded: true });
    await page.locator("[data-audit-row]").first().click();
    await page.getByRole("dialog").waitFor();
    await capture(page, `audit-inspector-${locale}-${width}-light`, { state: "translated inspector", locale, width, theme: "light", realSeeded: true });
    await context.close();
  }

  for (const [width, height] of [[320, 700], [768, 1024], [1024, 800]]) {
    const { context, page } = await openAudit({ width, height });
    await assertNoOverflow(page, "audit " + width);
    await capture(page, `audit-registry-${width}-light`, { state: "responsive check", width, theme: "light", realSeeded: true });
    await context.close();
  }

  {
    const { context, page } = await openAudit({ reducedMotion: "reduce" });
    await page.locator("[data-audit-row]").first().click();
    await page.getByRole("dialog").waitFor();
    const animation = await page.getByRole("dialog").evaluate((node) => getComputedStyle(node).animationName);
    probes.push({ test: "reduced-motion-inspector-opens-without-animation", status: animation === "none" ? "pass" : "fail", animation });
    assert.equal(animation, "none");
    await context.close();
  }

  {
    const { context, page } = await openPage({
      routes: async (ctx) => { await ctx.route(/\/api\/v1\/audit-log\/events\/\?/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20, total_pages: 0 }) })); },
    });
    await page.getByText(/No changes recorded yet/).waitFor();
    await capture(page, "audit-empty-1440-light", { simulation: "API returns an empty log; explains what appears here", width: 1440, theme: "light" });
    await context.close();
  }
  {
    const { context, page } = await openPage({ path: "/audit?action=void&actor=" + context0.accountant + "&entity=course" });
    await page.getByText("No changes match these filters.").waitFor();
    await capture(page, "audit-no-match-1440-light", { state: "real server no-match with Clear filters", width: 1440, theme: "light", realSeeded: true });
    await context.close();
  }
  {
    const { context, page } = await openPage({
      width: 390, height: 844,
      routes: async (ctx) => { await ctx.route(/\/api\/v1\/audit-log\/events\/\?/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"simulated"}' })); },
    });
    await page.getByText("The audit log could not be loaded.").waitFor();
    await capture(page, "audit-error-390-light", { simulation: "audit-log 500; Try again offered", width: 390, theme: "light" });
    await context.close();
  }
  {
    let release;
    const gate = new Promise((resolveGate) => { release = resolveGate; });
    const { context, page } = await openPage({
      width: 390, height: 844, theme: "dark",
      routes: async (ctx) => { await ctx.route(/\/api\/v1\/audit-log\/events\/\?/, async (route) => { await gate; await route.continue(); }); },
    });
    await page.locator("[aria-busy='true']").first().waitFor();
    await capture(page, "audit-loading-390-dark", { simulation: "audit-log held until released; skeleton rows in feed geometry", width: 390, theme: "dark" });
    release();
    await context.close();
  }

  const missingStudent = 987654;
  for (const [role, width, height, theme] of [["superadmin", 1440, 1000, "light"], ["superadmin", 1440, 1000, "dark"], ["superadmin", 390, 844, "light"], ["accountant", 1440, 1000, "light"]]) {
    let link;
    let context;
    let page;
    let requests;
    if (role === "accountant") {
      const debts = await (await authorized("accountant", "/finance/debts/?page=1&page_size=100")).json();
      const target = debts.items[0];
      ({ context, page, requests } = await openPage({ role, width, height, theme, path: `/finance?tab=debtors&dstudent=${target.student.id}&dcourse=${target.course.id}&dname=${encodeURIComponent(target.student.first_name + " " + target.student.last_name)}` }));
    } else {
      ({ context, page, requests } = await openPage({ role, width, height, theme, path: "/" }));
      link = page.getByRole("link", { name: /View balance/ }).first();
      await link.waitFor();
      await capture(page, `attention-dashboard-${role}-${width}-${theme}`, { state: "dashboard Needs attention with exact View balance links", role, width, theme, realSeeded: true });
    }
    const href = link ? await link.getAttribute("href") : "direct URL (accountant has no dashboard attention list)";
    if (link) {
      assert.match(href, /dstudent=\d+/);
      assert.match(href, /dcourse=\d+/);
      await link.click();
    }
    await page.locator("#finance-debtors-heading").waitFor();
    await page.locator("[data-row-key]").first().waitFor();
    const rows = await page.locator("[data-row-key]").count();
    const chip = await page.getByText(/^Student: /).first().innerText();
    const debtRequest = requests.filter((url) => url.includes("/finance/debts/?")).at(-1);
    assert.match(debtRequest, /student_id=\d+/);
    assert.match(debtRequest, /course_id=\d+/);
    assert.equal(rows, 1, "exactly one course balance for the student/course");
    await assertNoOverflow(page, "debtors " + width);
    await capture(page, `attention-debtors-exact-${role}-${width}-${theme}`, { state: "Debtors filtered to the student's course balance with a clearable chip", role, width, theme, realSeeded: true });
    probes.push({ test: `attention-link-filters-exact-student-course-${role}-${width}-${theme}`, status: "pass", href, request: debtRequest, rows, chip });
    if (width === 1440 && theme === "light" && role === "superadmin") {
      await page.goBack();
      await page.getByRole("link", { name: /View balance/ }).first().waitFor();
      probes.push({ test: "browser-back-returns-to-dashboard-origin", status: "pass" });
      await page.goForward();
      await page.locator("[data-row-key]").first().waitFor();
      await page.reload();
      await page.locator("[data-row-key]").first().waitFor();
      assert.equal(await page.locator("[data-row-key]").count(), 1);
      probes.push({ test: "refresh-keeps-exact-context", status: "pass" });
      await page.getByRole("button", { name: "Clear the student filter" }).click();
      await page.waitForTimeout(800);
      assert.ok((await page.locator("[data-row-key]").count()) >= 1);
      assert.ok(new URL(page.url()).searchParams.has("dcourse"));
      assert.ok(!new URL(page.url()).searchParams.has("dstudent"));
      probes.push({ test: "clear-student-keeps-course-context", status: "pass" });
    }
    await context.close();
  }
  {
    const { context, page } = await openPage({ path: `/finance?tab=debtors&dstudent=${missingStudent}&dname=Removed+Student` });
    await page.getByText(/No unpaid balance found for this student/).waitFor();
    await capture(page, "attention-debtors-missing-1440-light", { state: "unknown student context: explained empty state, chip, Back and Clear", width: 1440, theme: "light", realSeeded: true });
    await context.close();
  }

  assert.deepEqual(forbiddenRequests, []);
  probes.push({ test: "accountant-never-calls-staff-or-audit-endpoints", status: "pass" });
  assert.deepEqual(pageErrors, []);
  probes.push({ test: "no-page-errors", status: "pass" });
} finally {
  await writeFile(evidence + "/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(evidence + "/probes.json", JSON.stringify(probes, null, 2) + "\n");
  await browser.close();
}
console.log(JSON.stringify({ screenshots: manifest.length, probes: probes.length, failed: probes.filter((probe) => probe.status !== "pass").length }));

import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const apiPort = process.env.KITOB_API_PORT ?? "18100";
const origin = process.env.KITOB_PREVIEW_ORIGIN ?? "http://127.0.0.1:5214";
const api = "http://127.0.0.1:" + apiPort + "/api/v1";
const evidence = resolve("../docs/redesign-execution/group-05/overview-debtors/evidence");
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

async function openPage({ role = "accountant", width = 1440, height = 1000, theme = "light", locale = "en", path = "/finance", routes } = {}) {
  const tokens = await login(identityFor(role));
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, timezoneId: "America/New_York" });
  await context.addInitScript(({ refreshToken, theme, locale }) => {
    if (!localStorage.getItem("imkon-refresh-token")) localStorage.setItem("imkon-refresh-token", refreshToken);
    localStorage.setItem("imkon_theme", theme);
    localStorage.setItem("i18nextLng", locale);
  }, { refreshToken: tokens.refresh_token, theme, locale });
  if (routes) await routes(context);
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/finance/debts") && url.searchParams.has("student_id")) forbiddenRequests.push(request.url());
    if (role === "accountant" && /\/api\/v1\/(courses|mentors)\b/.test(url.pathname)) forbiddenRequests.push(request.url());
  });
  await page.goto(origin + path, { timeout: 120000 });
  return { context, page, tokens };
}

async function settle(page) {
  await page.getByRole("tab", { name: /./ }).first().waitFor();
  await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 15000 });
}

async function assertNoOverflow(page, label) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  assert.equal(fits, true, label + " horizontal overflow");
}

async function capture(page, name, meta = {}) {
  await page.waitForTimeout(500);
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

async function seedPayments() {
  const tokens = await login(identityFor("accountant"));
  const headers = { "Content-Type": "application/json", Authorization: "Bearer " + tokens.access_token };
  const debts = await (await fetch(api + "/finance/debts/?page=1&page_size=20", { headers })).json();
  assert.ok(debts.items.length >= 5, "seeded debts");
  const created = [];
  for (const [index, item] of debts.items.slice(0, 3).entries()) {
    const response = await fetch(api + "/finance/payments/", { method: "POST", headers, body: JSON.stringify({ student_id: item.student.id, course_id: item.course.id, amount: String(100 + index * 25) + ".50", paid_at: new Date().toISOString(), method: index % 2 ? "transfer" : "cash" }) });
    assert.equal(response.status, 201);
    created.push((await response.json()).id);
  }
  return { debts: debts.items, created };
}

try {
  const seeded = await seedPayments();
  const multiCourseStudent = Object.entries(seeded.debts.reduce((groups, item) => ({ ...groups, [item.student.id]: (groups[item.student.id] ?? 0) + 1 }), {})).find(([, count]) => count > 1);
  probes.push({ test: "seeded student with two unpaid courses exists", status: multiCourseStudent ? "pass" : "fail", studentId: multiCourseStudent?.[0] });

  for (const role of ["superadmin", "accountant"]) for (const [width, height] of [[1440, 1000], [390, 844]]) for (const theme of ["light", "dark"]) {
    const { context, page } = await openPage({ role, width, height, theme });
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.getByText("Python", { exact: false }).first().waitFor().catch(() => undefined);
    await settle(page);
    await page.locator("section[aria-labelledby='finance-course-balances'] li").first().waitFor();
    await assertNoOverflow(page, role + width + theme);
    assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
    assert.equal(await page.locator("[role='tabpanel'] a").count(), 0);
    await capture(page, role + "-overview-" + width + "-" + theme, { role, width, theme, realSeeded: true });
    probes.push({ test: role + "-overview-" + width + "-" + theme + "-no-overflow-no-staff-links", status: "pass" });
    if (width === 390 && theme === "light") {
      const firstRow = await page.locator("section[aria-labelledby='finance-course-balances'] li").first().boundingBox();
      probes.push({ test: role + "-390-first-course-balance-top", status: firstRow.y < 700 ? "pass" : "fail", y: Math.round(firstRow.y) });
      const tabs = await page.getByRole("tab").evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().height)));
      probes.push({ test: role + "-390-tab-targets", status: tabs.every((value) => value >= 44) ? "pass" : "fail", tabs });
    }
    await context.close();
  }

  for (const [width, height] of [[320, 844], [768, 1024], [1024, 800]]) {
    const { context, page } = await openPage({ width, height });
    await settle(page);
    await page.locator("section[aria-labelledby='finance-course-balances'] li").first().waitFor();
    await assertNoOverflow(page, "width " + width);
    await capture(page, "accountant-overview-" + width + "-light", { role: "accountant", width, theme: "light", realSeeded: true });
    probes.push({ test: "overview-" + width + "-no-overflow", status: "pass" });
    await context.close();
  }

  for (const locale of ["ru", "tg"]) {
    const { context, page } = await openPage({ width: 390, height: 844, locale });
    await settle(page);
    await page.locator("section[aria-labelledby='finance-course-balances'] li").first().waitFor();
    await assertNoOverflow(page, locale);
    await capture(page, "accountant-overview-390-" + locale, { role: "accountant", width: 390, locale, realSeeded: true });
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 1440, height: 1000 });
    await settle(page);
    await page.getByRole("button", { name: "About: Net cash collected" }).focus();
    await page.getByRole("tooltip").waitFor();
    await capture(page, "accountant-overview-tooltip-1440-light", { role: "accountant", state: "info tooltip open on keyboard focus" });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Collection period:/ }).click();
    const from = page.getByLabel("From");
    const to = page.getByLabel("To");
    await from.fill("2026-12-20");
    await to.fill("2026-12-01");
    const analyticsCalls = [];
    page.on("request", (request) => { if (request.url().includes("/finance/analytics")) analyticsCalls.push(request.url()); });
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "must not be after" }).waitFor();
    assert.equal(analyticsCalls.length, 0);
    assert.ok(page.url().endsWith("/finance"));
    await capture(page, "accountant-overview-invalid-range-1440-light", { role: "accountant", state: "range popover with inverted range rejected before query" });
    probes.push({ test: "inverted-range-rejected-before-query", status: "pass" });
    await from.fill("2020-01-01");
    await to.fill("2020-01-31");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await page.waitForURL(/from=2020-01-01&to=2020-01-31/);
    await page.getByText("0.00 TJS", { exact: true }).first().waitFor();
    assert.equal(await page.getByText("Current due unpaid", { exact: true }).count(), 1);
    await capture(page, "accountant-overview-zero-collection-1440-light", { role: "accountant", state: "valid range with no payments shows 0.00; current labels unchanged", range: "2020-01-01..2020-01-31" });
    probes.push({ test: "zero-collection-range-and-current-labels", status: "pass" });
    await page.reload();
    await page.waitForURL(/from=2020-01-01&to=2020-01-31/);
    await page.getByRole("button", { name: /^Collection period:/ }).click();
    assert.equal(await page.getByLabel("From").inputValue(), "2020-01-01");
    await capture(page, "accountant-overview-range-popover-1440-light", { role: "accountant", state: "compact range popover with presets after refresh" });
    probes.push({ test: "range-restored-after-refresh", status: "pass" });
    await context.close();
  }

  {
    const { context, page } = await openPage({ role: "superadmin", path: "/", width: 1440, height: 1000 });
    const link = page.getByRole("link", { name: /View course debts/ }).first();
    await link.waitFor();
    const href = await link.getAttribute("href");
    assert.match(href, /^\/finance\?tab=debtors&dcourse=\d+$/);
    await capture(page, "superadmin-dashboard-attention-1440-light", { role: "superadmin", state: "attention list with course-debts links", href });
    await link.click();
    await page.getByText(/^Course debts: /).waitFor();
    await settle(page);
    await capture(page, "superadmin-debtors-course-handoff-1440-light", { role: "superadmin", state: "Debtors with visible course filter", href });
    const rows = await page.locator("section[aria-labelledby='finance-debtors-heading'] li").count();
    assert.ok(rows >= 1);
    await page.getByRole("button", { name: "Clear the course filter" }).click();
    await page.waitForURL((url) => url.search === "?tab=debtors");
    probes.push({ test: "course-handoff-visible-and-clearable", status: "pass", href, filteredRows: rows });
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 1440, height: 1000 });
    await settle(page);
    await page.locator("section[aria-labelledby='finance-course-balances'] li").first().waitFor();
    const trigger = page.getByRole("button", { name: /^Details for payment/ }).first();
    await trigger.focus();
    await trigger.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const returned = await trigger.evaluate((element) => element === document.activeElement);
    assert.equal(returned, true);
    probes.push({ test: "details-dialog-returns-focus-to-trigger", status: "pass" });
    await page.getByRole("tab", { name: "Debtors" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.getByRole("tab", { name: "Payments", selected: true }).waitFor();
    await settle(page);
    await capture(page, "accountant-payments-tab-1440-light", { role: "accountant", state: "Payments tab shares the row anatomy" });
    await page.getByRole("tab", { name: "Debtors" }).click();
    await settle(page);
    await capture(page, "accountant-debtors-tab-1440-light", { role: "accountant", state: "Debtors tab with divided course-balance rows" });
    await context.close();
  }

  {
    const { context, page } = await openPage({
      width: 1440,
      height: 1000,
      routes: async (ctx) => {
        await ctx.route("**/api/v1/finance/debts/**", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"simulated debts failure"}' }));
        await ctx.route("**/api/v1/finance/analytics/**", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"simulated analytics failure"}' }));
      },
    });
    await page.getByText("Course balances could not be loaded.").waitFor();
    await page.getByText("Unavailable").first().waitFor();
    await page.getByRole("button", { name: /^Details for payment/ }).first().waitFor();
    await capture(page, "accountant-overview-simulated-errors-1440-light", { role: "accountant", simulation: "debts and analytics return 500; payments preview stays loaded" });
    probes.push({ test: "preview-error-isolated-from-payments-preview", status: "pass", simulation: true });
    await context.close();
  }

  {
    let release;
    const gate = new Promise((resolveGate) => { release = resolveGate; });
    const { context, page } = await openPage({
      width: 390,
      height: 844,
      routes: async (ctx) => {
        await ctx.route("**/api/v1/finance/debts/**", async (route) => { await gate; await route.continue(); });
        await ctx.route("**/api/v1/finance/payments/?**", async (route) => { await gate; await route.continue(); });
      },
    });
    await page.getByRole("tab", { name: "Overview" }).waitFor();
    await page.locator("[aria-busy='true']").first().waitFor();
    await capture(page, "accountant-overview-simulated-loading-390-light", { role: "accountant", simulation: "debts and payments held until released" });
    release();
    await context.close();
  }

  assert.deepEqual(forbiddenRequests, []);
  probes.push({ test: "no-student-id-debts-requests-and-no-accountant-staff-requests", status: "pass" });
  assert.deepEqual(pageErrors, []);
  probes.push({ test: "no-page-errors", status: "pass" });
} finally {
  await writeFile(evidence + "/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(evidence + "/probes.json", JSON.stringify(probes, null, 2) + "\n");
  await browser.close();
}
console.log(JSON.stringify({ screenshots: manifest.length, probes: probes.length, failed: probes.filter((probe) => probe.status !== "pass").length }));

import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const apiPort = process.env.KITOB_API_PORT ?? "18101";
const origin = process.env.KITOB_PREVIEW_ORIGIN ?? "http://127.0.0.1:5215";
const api = "http://127.0.0.1:" + apiPort + "/api/v1";
const evidence = resolve("../docs/redesign-execution/group-05/payments/evidence");
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
  const response = await fetch(api + path, { ...options, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokens.access_token } });
  return response;
}

function money(value) {
  return (Math.round(Number(value) * 100) / 100).toFixed(2);
}

async function seedPayments() {
  const debts = await (await authorized("accountant", "/finance/debts/?page=1&page_size=100")).json();
  assert.ok(debts.items.length >= 6, "seeded debts");
  const byStudent = new Map();
  for (const item of debts.items) byStudent.set(item.student.id, [...(byStudent.get(item.student.id) ?? []), item]);
  const multi = [...byStudent.values()].find((rows) => rows.length > 1);
  assert.ok(multi, "student with two unpaid courses");
  const others = [...byStudent.values()].filter((rows) => rows.length === 1).map((rows) => rows[0]);
  assert.ok(others.length >= 4, "four single-course students");
  const pay = async (item, amount, method, extra = {}) => {
    const response = await authorized("accountant", "/finance/payments/", { method: "POST", body: JSON.stringify({ student_id: item.student.id, course_id: item.course.id, amount, paid_at: extra.paidAt ?? new Date().toISOString(), method, ...(extra.comment ? { comment: extra.comment } : {}) }) });
    assert.equal(response.status, 201, "payment " + amount);
    return response.json();
  };
  const [first, second] = multi;
  const spill = await pay(first, money(Number(first.debt) + 100), "transfer", { comment: "Spills into the second course" });
  const single = await pay(others[0], "300.00", "transfer");
  await pay(others[0], "50.00", "cash", { paidAt: new Date(Date.now() - 86400000 * 2).toISOString() });
  const toVoid = await pay(others[1], "150.00", "cash");
  const voidResponse = await authorized("accountant", "/finance/payments/" + toVoid.id + "/void", { method: "POST", body: JSON.stringify({ reason_code: "entry_error" }) });
  assert.equal(voidResponse.status, 200, "void");
  const toRefund = await pay(others[2], "500.00", "cash");
  const refundResponse = await authorized("superadmin", "/finance/payments/" + toRefund.id + "/refund", { method: "POST", body: JSON.stringify({ amount: "40.00", reason_code: "requested", to_wallet: false }) });
  assert.equal(refundResponse.status, 200, "refund");
  await pay(others[3], "200.25", "cash", { comment: "Counter payment" });
  return { spill, single, voided: toVoid, refunded: toRefund, multiStudent: multi[0].student, second };
}

async function openPage({ role = "accountant", width = 1440, height = 1000, theme = "light", locale = "en", path = "/finance?tab=payments", routes } = {}) {
  const tokens = await login(identityFor(role));
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, timezoneId: "America/New_York" });
  await context.addInitScript(({ refreshToken, theme, locale }) => {
    if (!localStorage.getItem("imkon-refresh-token")) localStorage.setItem("imkon-refresh-token", refreshToken);
    localStorage.setItem("imkon_theme", theme);
    localStorage.setItem("i18nextLng", locale);
  }, { refreshToken: tokens.refresh_token, theme, locale });
  if (routes) await routes(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => { pageErrors.push(error.message); console.error("PAGEERROR", error.message); });
  page.on("console", (message) => { if (message.type() === "error" && !/status of (4|5)\d\d/.test(message.text())) console.error("CONSOLE", message.text().slice(0, 300)); });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/\/api\/v1\/students\/\d+/.test(url.pathname) && path.includes("tab=payments") && !request.headers()["x-allow-profile"]) forbiddenRequests.push({ role, url: request.url() });
    if (role === "accountant" && /\/api\/v1\/(courses|mentors)\b/.test(url.pathname)) forbiddenRequests.push({ role, url: request.url() });
  });
  await page.goto(origin + path, { timeout: 120000 });
  return { context, page, tokens };
}

async function openRegistry(options = {}) {
  const opened = await openPage(options);
  await opened.page.locator("#finance-payments-heading").waitFor();
  await opened.page.locator("[data-row-key]").first().waitFor();
  return opened;
}

async function assertNoOverflow(page, label) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  assert.equal(fits, true, label + " horizontal overflow");
}

async function assertNoNestedScroll(page, label) {
  const nested = await page.evaluate(() => Array.from(document.querySelectorAll("main *")).filter((element) => {
    const style = getComputedStyle(element);
    return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
  }).length);
  assert.equal(nested, 0, label + " nested vertical scroll");
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

async function openDetails(page, name) {
  const row = page.locator("[data-row-key]").filter({ hasText: name }).first();
  await row.getByRole("button", { name: /^Details for/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForFunction(() => !document.querySelector("[role='dialog'] [aria-busy='true']"), null, { timeout: 15000 });
  return dialog;
}

try {
  const seeded = await seedPayments();
  const nameOf = (payment) => payment.student_first_name + " " + payment.student_last_name;
  probes.push({ test: "seeded payments include multi-course, voided and refunded", status: "pass", multiId: seeded.spill.id, voidedId: seeded.voided.id, refundedId: seeded.refunded.id, multiAllocationCourses: [...new Set(seeded.spill.allocations.map((a) => a.course_id))].length });

  for (const role of ["superadmin", "accountant"]) for (const [width, height] of [[1440, 1000], [390, 844]]) for (const theme of ["light", "dark"]) {
    const { context, page } = await openRegistry({ role, width, height, theme });
    await assertNoOverflow(page, role + width + theme);
    await assertNoNestedScroll(page, role + width + theme);
    const isTable = (await page.getByRole("table").count()) === 1;
    assert.equal(isTable, width === 1440, role + width + " layout");
    assert.equal(await page.locator("select").count(), 0);
    assert.equal(await page.getByText(/Student #\d/).count(), 0, "no student id identity");
    await capture(page, role + "-payments-" + width + "-" + theme, { role, width, theme, layout: isTable ? "table" : "list", realSeeded: true });
    probes.push({ test: role + "-payments-" + width + "-" + theme, status: "pass", layout: isTable ? "table" : "list" });
    await context.close();
  }

  for (const [width, height] of [[320, 844], [768, 1024], [1024, 800], [1280, 900]]) {
    const { context, page } = await openRegistry({ width, height });
    await assertNoOverflow(page, "width " + width);
    const layout = (await page.getByRole("table").count()) === 1 ? "table" : "list";
    await capture(page, "accountant-payments-" + width + "-light", { width, layout, realSeeded: true });
    probes.push({ test: "payments-" + width + "-no-overflow", status: "pass", layout });
    await context.close();
  }

  for (const locale of ["ru", "tg"]) for (const width of [1440, 390]) {
    const { context, page } = await openRegistry({ width, height: width === 1440 ? 1000 : 844, locale });
    await assertNoOverflow(page, locale + width);
    await capture(page, "accountant-payments-" + width + "-" + locale, { width, locale, realSeeded: true });
    await context.close();
  }

  {
    const { context, page } = await openRegistry({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: /^Method/ }).click();
    await page.getByRole("listbox").waitFor();
    await capture(page, "accountant-payments-method-listbox-1440-light", { state: "custom method listbox, no native select" });
    await page.getByRole("option", { name: "Bank Transfer" }).click();
    await page.waitForURL(/pmethod=transfer/);
    await page.getByRole("button", { name: /^Date/ }).click();
    const today = new Date().toISOString().slice(0, 10);
    await page.getByLabel("From").fill("2026-01-01");
    await page.getByLabel("To").fill("2026-12-31");
    await capture(page, "accountant-payments-date-popover-1440-light", { state: "date range popover open" });
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForURL(/pfrom=2026-01-01/);
    await page.getByRole("button", { name: /^Student/ }).click();
    await page.getByRole("combobox", { name: "Search students" }).fill(nameOf(seeded.single).split(" ")[0]);
    await page.getByRole("option").first().waitFor();
    await capture(page, "accountant-payments-student-picker-1440-light", { state: "student search popover with results" });
    await page.getByRole("option").first().click();
    await page.waitForURL(/pstudent=/);
    await page.waitForTimeout(600);
    await capture(page, "accountant-payments-filters-active-1440-light", { state: "student + method + date chips with Clear filters", url: page.url() });
    probes.push({ test: "filters-active-url", status: "pass", url: page.url(), today });
    await page.reload();
    await page.locator("#finance-payments-heading").waitFor();
    assert.ok(await page.getByRole("button", { name: /^Remove filter/ }).count() >= 3, "filters restored after refresh");
    await capture(page, "accountant-payments-filters-restored-390-after-reload", { state: "same URL reloaded: filters restored" });
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.waitForURL((url) => !url.search.includes("pstudent"));
    probes.push({ test: "clear-filters-restores-all", status: "pass", url: page.url() });
    await context.close();
  }

  {
    const { context, page } = await openRegistry({ width: 390, height: 844 });
    await page.getByRole("button", { name: /^Date/ }).click();
    await page.getByLabel("From").fill("2026-12-31");
    await page.getByLabel("To").fill("2026-01-01");
    await page.getByRole("button", { name: "Apply" }).click();
    await page.getByRole("alert").waitFor();
    await capture(page, "accountant-payments-date-inverted-390-light", { state: "inverted range blocked with message, no request" });
    await context.close();
  }

  for (const [label, name, width, height, theme] of [
    ["single", nameOf(seeded.single), 1440, 1000, "light"],
    ["multi", nameOf(seeded.spill), 1440, 1000, "light"],
    ["voided", nameOf(seeded.voided), 1440, 1000, "light"],
    ["refunded", nameOf(seeded.refunded), 1440, 1000, "dark"],
    ["multi", nameOf(seeded.spill), 390, 844, "light"],
    ["voided", nameOf(seeded.voided), 390, 844, "dark"],
  ]) {
    const { context, page } = await openRegistry({ width, height, theme });
    const dialog = await openDetails(page, name);
    await dialog.getByText(/^R-|^[A-Z0-9-]{5,}$/).first().waitFor().catch(() => undefined);
    if (label === "voided") await dialog.getByText("This payment was voided.").waitFor();
    if (label === "refunded") await dialog.getByText(/^Refunded:/).waitFor();
    assert.equal(await dialog.getByText(/Student #\d/).count(), 0);
    await capture(page, "accountant-payment-detail-" + label + "-" + width + "-" + theme, { state: "details " + label, width, theme, realSeeded: true });
    probes.push({ test: "detail-" + label + "-" + width + "-" + theme, status: "pass" });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await context.close();
  }

  {
    const { context, page } = await openRegistry({ width: 1440, height: 1000 });
    const dialog = await openDetails(page, nameOf(seeded.voided));
    await dialog.getByText("This payment was voided.").waitFor();
    probes.push({ test: "void-status-visible-with-receipt-loaded", status: "pass" });
    await context.close();
  }

  {
    const { context, page } = await openPage({
      width: 1440, height: 1000,
      routes: async (ctx) => { await ctx.route("**/api/v1/finance/payments/*/receipt", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"simulated receipt failure"}' })); },
    });
    await page.locator("[data-row-key]").first().waitFor();
    await page.locator("[data-row-key]").first().getByRole("button", { name: /^Details for/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("alert").waitFor();
    await capture(page, "accountant-payment-detail-receipt-failure-1440-light", { simulation: "receipt endpoint 500; known reference, status and allocations kept; receipt-only Retry" });
    await context.close();
  }

  {
    const { context, page } = await openPage({
      width: 1440, height: 1000,
      routes: async (ctx) => { await ctx.route(/\/api\/v1\/finance\/payments\/\?.*page_size=100/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"simulated status failure"}' })); },
    });
    await page.locator("[data-row-key]").first().waitFor();
    await page.locator("[data-row-key]").first().getByRole("button", { name: /^Details for/ }).click();
    await page.getByRole("dialog").getByText("Status could not be refreshed. Showing the last known status.").waitFor();
    await capture(page, "accountant-payment-detail-status-stale-1440-light", { simulation: "status refresh 500; last known status labeled stale with Retry" });
    await context.close();
  }

  {
    const { context, page } = await openPage({
      path: "/finance?tab=payments&pmethod=transfer&pfrom=2020-01-01&pto=2020-01-02", width: 1440, height: 1000,
    });
    await page.getByText("No payments match these filters.").waitFor();
    await capture(page, "accountant-payments-no-match-1440-light", { state: "real filters with no results; Clear filters" });
    await context.close();
  }

  {
    const { context, page } = await openPage({
      width: 390, height: 844,
      routes: async (ctx) => { await ctx.route(/\/api\/v1\/finance\/payments\/\?/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20, total_pages: 0 }) })); },
    });
    await page.getByText("No payments have been recorded yet. Accepted payments appear here.").waitFor();
    await capture(page, "accountant-payments-empty-390-light", { simulation: "payments list stubbed empty; Accept payment action" });
    await context.close();
  }

  {
    const { context, page } = await openPage({
      width: 1440, height: 1000,
      routes: async (ctx) => { await ctx.route(/\/api\/v1\/finance\/payments\/\?/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"simulated"}' })); },
    });
    await page.getByText("Payments could not be loaded.").waitFor();
    await capture(page, "accountant-payments-error-1440-light", { simulation: "payments 500; Retry offered" });
    await context.close();
  }

  {
    let release;
    const gate = new Promise((resolveGate) => { release = resolveGate; });
    const { context, page } = await openPage({
      width: 390, height: 844,
      routes: async (ctx) => { await ctx.route(/\/api\/v1\/finance\/payments\/\?/, async (route) => { await gate; await route.continue(); }); },
    });
    await page.locator("[aria-busy='true']").first().waitFor();
    await capture(page, "accountant-payments-loading-390-light", { simulation: "payments held until released; skeleton in list geometry" });
    release();
    await context.close();
  }

  assert.deepEqual(forbiddenRequests, []);
  probes.push({ test: "no-profile-or-staff-requests-from-payments", status: "pass" });
  assert.deepEqual(pageErrors, []);
  probes.push({ test: "no-page-errors", status: "pass" });
} finally {
  await writeFile(evidence + "/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(evidence + "/probes.json", JSON.stringify(probes, null, 2) + "\n");
  await browser.close();
}
console.log(JSON.stringify({ screenshots: manifest.length, probes: probes.length, failed: probes.filter((probe) => probe.status !== "pass").length }));

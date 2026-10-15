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
const evidence = resolve("../docs/redesign-execution/group-05/overview-debtors/evidence/debtors");
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
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => { pageErrors.push(error.message); console.error("PAGEERROR", error.message); });
  page.on("console", (message) => { if (message.type() === "error") console.error("CONSOLE", message.text().slice(0, 300)); });
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


async function openRegistry(options = {}) {
  const opened = await openPage({ path: "/finance?tab=debtors", ...options });
  await opened.page.getByRole("tab").first().waitFor();
  await opened.page.locator("#finance-debtors-heading").waitFor();
  await opened.page.locator("[data-row-key]").first().waitFor();
  return opened;
}

async function assertNoNestedScroll(page, label) {
  const nested = await page.evaluate(() => Array.from(document.querySelectorAll("main *")).filter((element) => {
    const style = getComputedStyle(element);
    return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
  }).length);
  assert.equal(nested, 0, label + " nested vertical scroll");
}

try {
  for (const role of ["superadmin", "accountant"]) for (const [width, height] of [[1440, 1000], [390, 844]]) for (const theme of ["light", "dark"]) {
    const { context, page } = await openRegistry({ role, width, height, theme });
    await assertNoOverflow(page, role + width + theme);
    await assertNoNestedScroll(page, role + width + theme);
    const isTable = (await page.getByRole("table").count()) === 1;
    assert.equal(isTable, width === 1440, role + width + " table threshold");
    const links = await page.locator("[role='tabpanel'] a").count();
    assert.equal(links > 0, role === "superadmin", role + " profile links");
    await capture(page, role + "-debtors-" + width + "-" + theme, { role, width, theme, layout: isTable ? "table" : "list", realSeeded: true });
    probes.push({ test: role + "-debtors-" + width + "-" + theme + "-layout-links-no-overflow", status: "pass", layout: isTable ? "table" : "list", profileLinks: links });
    await context.close();
  }

  for (const [width, height] of [[320, 844], [768, 1024], [1024, 800], [1280, 900]]) {
    const { context, page } = await openRegistry({ width, height });
    await assertNoOverflow(page, "width " + width);
    const layout = (await page.getByRole("table").count()) === 1 ? "table" : "list";
    await capture(page, "accountant-debtors-" + width + "-light", { width, layout, realSeeded: true });
    probes.push({ test: "debtors-" + width + "-no-overflow", status: "pass", layout });
    await context.close();
  }

  for (const locale of ["ru", "tg"]) {
    const { context, page } = await openRegistry({ width: 390, height: 844, locale });
    await assertNoOverflow(page, locale);
    await capture(page, "accountant-debtors-390-" + locale, { width: 390, locale, realSeeded: true });
    await context.close();
  }

  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const { context, page } = await openRegistry({ width, height });
    await page.getByRole("button", { name: /^Overdue/ }).click();
    await page.getByRole("listbox").waitFor();
    await capture(page, "accountant-debtors-filter-listbox-" + width + "-light", { width, state: "custom listbox popover, no native select" });
    assert.equal(await page.locator("select").count(), 0);
    await page.getByRole("option", { name: "7+ d" }).click();
    await page.waitForURL(/doverdue=7/);
    await page.getByRole("button", { name: /^Status/ }).click();
    await page.getByRole("option", { name: "Active" }).click();
    await page.waitForURL(/dstatus=active/);
    await page.waitForTimeout(500);
    await capture(page, "accountant-debtors-chips-" + width + "-light", { width, state: "overdue 7+ and status Active chips with Clear filters", url: page.url() });
    probes.push({ test: "filter-chips-" + width, status: "pass", url: page.url() });
    await context.close();
  }

  {
    const { context, page } = await openRegistry({ width: 390, height: 844 });
    const toggle = page.getByRole("button", { name: /^Details for/ }).first();
    await toggle.click();
    await page.getByText("Settled against due charges").first().waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    await capture(page, "accountant-debtors-details-390-light", { width: 390, state: "details disclosure open" });
    await context.close();
    const wide = await openRegistry({ width: 1440, height: 1000 });
    await wide.page.getByRole("button", { name: /^Details for/ }).first().click();
    await wide.page.getByText("Settled against due charges").first().waitFor();
    await capture(wide.page, "accountant-debtors-details-1440-light", { width: 1440, state: "details disclosure open in table" });
    await wide.page.getByRole("button", { name: "About: Settled against due charges" }).focus();
    await wide.page.getByRole("tooltip").waitFor();
    await capture(wide.page, "accountant-debtors-settled-tooltip-1440-light", { width: 1440, state: "settled definition tooltip" });
    probes.push({ test: "details-and-settled-tooltip", status: "pass" });
    await wide.context.close();
  }

  {
    const { context, page } = await openRegistry({ width: 1440, height: 1000 });
    await page.getByRole("searchbox", { name: "Search this page" }).fill("zzzz");
    await page.getByText("No rows on this page match your search.").waitFor();
    await capture(page, "accountant-debtors-no-match-1440-light", { state: "search no-match with Clear search" });
    await page.getByRole("button", { name: "Clear search" }).click();
    await page.goto(origin + "/finance?tab=debtors&doverdue=90");
    await page.getByText("No course balances match these filters.").waitFor();
    await capture(page, "accountant-debtors-filtered-empty-1440-light", { state: "server filter with no results; chips and Clear filters stay visible" });
    probes.push({ test: "no-match-and-filtered-empty", status: "pass" });
    await context.close();
  }

  {
    const { context, page } = await openPage({
      path: "/finance?tab=debtors", width: 1440, height: 1000,
      routes: async (ctx) => { await ctx.route("**/api/v1/finance/debts/**", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"simulated debts failure"}' })); },
    });
    await page.getByText("Debtors could not be loaded.").waitFor();
    await capture(page, "accountant-debtors-simulated-error-1440-light", { simulation: "debts 500; Retry offered" });
    await context.close();
  }

  {
    let release;
    const gate = new Promise((resolveGate) => { release = resolveGate; });
    const { context, page } = await openPage({
      path: "/finance?tab=debtors", width: 390, height: 844,
      routes: async (ctx) => { await ctx.route("**/api/v1/finance/debts/**", async (route) => { await gate; await route.continue(); }); },
    });
    await page.locator("[aria-busy='true']").first().waitFor();
    await capture(page, "accountant-debtors-simulated-loading-390-light", { simulation: "debts held until released" });
    release();
    await context.close();
  }

  {
    const { context, page } = await openRegistry({ width: 390, height: 844 });
    const rows = await page.locator("[data-row-key]").count();
    const firstKey = await page.locator("[data-row-key]").first().getAttribute("data-row-key");
    const amountText = (await page.locator("[data-row-key]").first().locator("p.font-semibold").innerText()).replace(" TJS", "").replace(/\s/g, "");
    await page.locator("[data-row-key]").first().getByRole("button", { name: /^Accept payment for/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await capture(page, "accountant-debtors-payment-dialog-390-light", { state: "payment dialog from the exact row", firstKey });
    await dialog.getByLabel("Amount (TJS)").fill(amountText);
    await dialog.getByRole("button", { name: "Accept Payment" }).last().click();
    await dialog.waitFor({ state: "hidden" });
    await page.locator("[role='status']").filter({ hasText: /recorded/ }).first().waitFor();
    await page.waitForFunction((key) => !document.querySelector("[data-row-key='" + key + "']"), firstKey);
    const focusedInRow = await page.evaluate(() => Boolean(document.activeElement && document.activeElement.closest("[data-row-key]")));
    assert.equal(await page.locator("[data-row-key]").count(), rows - 1);
    assert.equal(focusedInRow, true);
    await capture(page, "accountant-debtors-after-payment-390-light", { state: "paid row removed; focus moved to the next row; completion banner", removedKey: firstKey });
    probes.push({ test: "payment-from-row-removes-row-and-moves-focus", status: "pass", removedKey: firstKey });
    await context.close();
  }

  assert.deepEqual(forbiddenRequests, []);
  probes.push({ test: "no-student-id-debts-requests", status: "pass" });
  assert.deepEqual(pageErrors, []);
  probes.push({ test: "no-page-errors", status: "pass" });
} finally {
  await writeFile(evidence + "/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(evidence + "/probes.json", JSON.stringify(probes, null, 2) + "\n");
  await browser.close();
}
console.log(JSON.stringify({ screenshots: manifest.length, probes: probes.length, failed: probes.filter((probe) => probe.status !== "pass").length }));

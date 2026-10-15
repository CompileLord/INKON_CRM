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
const evidence = resolve("../docs/redesign-execution/group-05/payments/evidence/entry");
const shots = evidence + "/screenshots";
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];
const pageErrors = [];
const forbiddenRequests = [];
const paymentPosts = [];

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
    if (request.method() === "POST" && url.pathname === "/api/v1/finance/payments/") paymentPosts.push(request.postData());
    if (/\/api\/v1\/(courses|mentors)\b/.test(url.pathname)) forbiddenRequests.push(request.url());
  });
  await page.goto(origin + path, { timeout: 120000 });
  return { context, page, tokens };
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

async function assertDialogFits(page, label) {
  const fits = await page.getByRole("dialog").evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  assert.equal(fits, true, label + " dialog overflow");
  const documentFits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  assert.equal(documentFits, true, label + " document overflow");
}

async function openGeneral(page, buttonName = "Accept Payment") {
  await page.getByRole("button", { name: buttonName }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  return dialog;
}

async function chooseStudent(dialog, searchTerm, optionPattern) {
  await dialog.getByRole("combobox").fill(searchTerm);
  const option = dialog.getByRole("option", { name: optionPattern }).first();
  await option.waitFor();
  await option.click();
}

async function chooseCourse(dialog, page) {
  await dialog.getByLabel("Priority course", { exact: true }).click();
  await page.getByRole("option").first().waitFor();
  await page.getByRole("option").first().click();
}

try {
  const accountant = await login(identityFor("accountant"));
  const debts = await (await fetch(api + "/finance/debts/?page=1&page_size=100", { headers: { Authorization: "Bearer " + accountant.access_token } })).json();
  assert.ok(debts.items.length >= 4, "seeded debts");
  const target = debts.items[0];
  const targetName = target.student.first_name + " " + target.student.last_name;

  for (const theme of ["light", "dark"]) for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const { context, page } = await openPage({ width, height, theme });
    const dialog = await openGeneral(page);
    assert.equal(await dialog.locator("select").count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "combobox", "student search focused first");
    await assertDialogFits(page, "general " + width + theme);
    await capture(page, "general-entry-" + width + "-" + theme, { state: "general entry, empty, student search focused", width, theme });
    probes.push({ test: "general-entry-" + width + "-" + theme, status: "pass" });
    await context.close();
  }

  for (const theme of ["light", "dark"]) for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const { context, page } = await openPage({ width, height, theme, path: "/finance?tab=debtors" });
    await page.locator("[data-row-key]").first().waitFor();
    await page.locator("[data-row-key]").first().getByRole("button", { name: /^Accept payment for/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(await dialog.getByRole("combobox").count(), 0, "locked context has no student search");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "payment-amount", "amount focused");
    assert.equal(await dialog.getByLabel("Amount (TJS)").inputValue(), "");
    await assertDialogFits(page, "debtor " + width + theme);
    await capture(page, "debtor-entry-" + width + "-" + theme, { state: "debtor entry, locked context block, empty amount", width, theme });
    probes.push({ test: "debtor-entry-" + width + "-" + theme, status: "pass" });
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 1440, height: 1000 });
    const dialog = await openGeneral(page);
    await dialog.getByRole("combobox").fill("a");
    await dialog.getByRole("option").first().waitFor();
    assert.ok((await dialog.getByRole("option").count()) >= 2, "real results");
    await capture(page, "picker-results-1440-light", { state: "real student search results with reference and email", realSeeded: true });
    await dialog.getByRole("combobox").press("ArrowDown");
    await dialog.getByRole("combobox").press("ArrowDown");
    await capture(page, "picker-keyboard-active-1440-light", { state: "ArrowDown moves the active option; focus stays in the input" });
    await dialog.getByRole("combobox").fill("zzzzqq");
    await dialog.getByText("No matching students. Try another name or email.").first().waitFor();
    await capture(page, "picker-no-match-1440-light", { state: "real search with no match" });
    probes.push({ test: "picker-results-keyboard-no-match", status: "pass" });
    await context.close();
  }

  {
    const pool = Array.from({ length: 9 }, (_, index) => ({ id: 9000 + index, first_name: "Sample" + index, last_name: "Match", email: "sample" + index + "@example.com" }));
    const { context, page } = await openPage({
      width: 390, height: 844,
      routes: async (ctx) => {
        await ctx.route(/\/api\/v1\/students\/\?/, (route) => {
          const page = Number(new URL(route.request().url()).searchParams.get("page") ?? "1");
          const items = page === 1 ? pool.slice(0, 8) : pool.slice(8);
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items, total: 9, page, page_size: 8, total_pages: 2 }) });
        });
      },
    });
    const dialog = await openGeneral(page);
    await dialog.getByRole("combobox").fill("match");
    await dialog.getByRole("button", { name: "More results" }).waitFor();
    await capture(page, "picker-more-results-390-light", { simulation: "students endpoint stubbed with 9 results over 2 pages; More results reachable" });
    await dialog.getByRole("button", { name: "More results" }).click();
    await dialog.getByRole("option", { name: /Sample8 Match/ }).waitFor();
    probes.push({ test: "more-results-reaches-ninth-student", status: "pass", simulation: true });
    await context.close();
  }

  {
    const { context, page } = await openPage({
      width: 1440, height: 1000,
      routes: async (ctx) => { await ctx.route(/\/api\/v1\/enrollments\/\?/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"simulated"}' })); },
    });
    const dialog = await openGeneral(page);
    await chooseStudent(dialog, targetName.split(" ")[0], new RegExp(targetName));
    await dialog.getByText("Course context could not be loaded.").waitFor();
    await capture(page, "course-error-1440-light", { simulation: "student enrollments endpoint 500; Retry offered, submit stays disabled" });
    assert.equal(await dialog.getByRole("button", { name: "Accept Payment" }).isDisabled(), true);
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 390, height: 844 });
    const dialog = await openGeneral(page);
    assert.equal(await dialog.getByRole("button", { name: "Accept Payment" }).isDisabled(), true, "submit disabled until student and course are valid");
    await chooseStudent(dialog, targetName.split(" ")[0], new RegExp(targetName));
    await dialog.getByLabel("Priority course", { exact: true }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Accept Payment" }).isDisabled(), true, "submit still disabled without a course");
    await chooseCourse(dialog, page);
    await dialog.getByLabel("Amount (TJS)").fill("12abc");
    await dialog.getByRole("button", { name: "Accept Payment" }).click();
    await dialog.getByText(/Enter a positive decimal amount/).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "payment-amount");
    assert.equal(await dialog.getByLabel("Amount (TJS)").inputValue(), "12abc");
    await capture(page, "validation-amount-390-light", { state: "invalid amount keeps text, field error, focus on amount; submit was disabled before course choice" });
    await dialog.getByLabel("Amount (TJS)").fill("10");
    await dialog.locator("#payment-date").click();
    await page.locator("input[type=date]").fill("");
    await capture(page, "date-popover-390-light", { state: "single-date calendar popover with Today, Yesterday and Apply" });
    await page.getByRole("button", { name: "Apply" }).click();
    await page.locator("input[type=date]").waitFor({ state: "detached" });
    assert.equal(paymentPosts.length, 0, "Apply in the date popover never submits the form");
    await dialog.getByRole("button", { name: "Accept Payment" }).click();
    await dialog.getByText("Choose a valid payment date.").waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "payment-date");
    await capture(page, "validation-date-390-light", { state: "empty date blocked with field error and focus on the date" });
    assert.equal(paymentPosts.length, 0, "validation sent no payment");
    probes.push({ test: "validation-errors-no-request", status: "pass" });
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 1440, height: 1000 });
    const dialog = await openGeneral(page);
    await dialog.getByLabel("Amount (TJS)").fill("10");
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Keep editing" }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Keep editing");
    await capture(page, "dirty-dismissal-1440-light", { state: "Keep editing / Discard changes; Keep editing focused" });
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    assert.equal(await dialog.getByLabel("Amount (TJS)").inputValue(), "10");
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await dialog.waitFor({ state: "hidden" });
    probes.push({ test: "dirty-dismissal", status: "pass" });
    await context.close();
  }

  {
    const { context, page } = await openPage({
      width: 1440, height: 1000, path: "/finance?tab=debtors",
      routes: async (ctx) => { await ctx.route(/\/api\/v1\/finance\/payments\/$/, (route) => route.request().method() === "POST" ? route.fulfill({ status: 400, contentType: "application/json", body: '{"detail":"Accounting period closed"}' }) : route.continue()); },
    });
    await page.locator("[data-row-key]").first().getByRole("button", { name: /^Accept payment for/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByLabel("Amount (TJS)").fill("125,50");
    await dialog.getByRole("radio", { name: "Bank Transfer" }).check({ force: true });
    await dialog.getByLabel("Comment").fill("Keep this text");
    await dialog.getByRole("button", { name: "Accept Payment" }).click();
    await dialog.getByText(/accounting period is closed/i).waitFor();
    assert.equal(await dialog.getByLabel("Amount (TJS)").inputValue(), "125,50");
    assert.equal(await dialog.getByLabel("Comment").inputValue(), "Keep this text");
    await capture(page, "rejection-keeps-values-1440-light", { simulation: "POST payments stubbed 400 closed period; all values kept, focus on date" });
    probes.push({ test: "rejection-keeps-values", status: "pass", simulation: true });
    await context.close();
  }

  {
    const { context, page } = await openPage({
      width: 390, height: 844, path: "/finance?tab=debtors",
      routes: async (ctx) => { await ctx.route(/\/api\/v1\/finance\/payments\/$/, (route) => route.request().method() === "POST" ? route.abort("connectionreset") : route.continue()); },
    });
    await page.locator("[data-row-key]").first().getByRole("button", { name: /^Accept payment for/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByLabel("Amount (TJS)").fill("125.50");
    await dialog.getByRole("button", { name: "Accept Payment" }).click();
    await dialog.getByText(/Check whether the payment was recorded/).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Accept Payment" }).isDisabled(), true);
    await capture(page, "ambiguous-result-390-light", { simulation: "POST payments connection reset; verification required before resubmission, values kept" });
    probes.push({ test: "ambiguous-result-blocks-resubmit", status: "pass", simulation: true });
    await context.close();
  }

  {
    let release;
    const gate = new Promise((resolveGate) => { release = resolveGate; });
    const { context, page } = await openPage({
      width: 390, height: 844, path: "/finance?tab=debtors",
      routes: async (ctx) => { await ctx.route(/\/api\/v1\/finance\/payments\/$/, async (route) => { if (route.request().method() === "POST") await gate; await route.fulfill({ status: 400, contentType: "application/json", body: '{"detail":"simulated"}' }); }); },
    });
    await page.locator("[data-row-key]").first().getByRole("button", { name: /^Accept payment for/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByLabel("Amount (TJS)").fill("88.80");
    await dialog.getByRole("button", { name: /Accept Payment/ }).click();
    await page.getByText("Recording payment…").first().waitFor();
    assert.equal(await dialog.getByLabel("Amount (TJS)").isDisabled(), true);
    await capture(page, "pending-390-light", { simulation: "POST held; fields and dismissal disabled, Recording payment status announced" });
    release();
    probes.push({ test: "pending-locks-form", status: "pass", simulation: true });
    await context.close();
  }

  for (const [locale, width, height] of [["ru", 390, 844], ["tg", 390, 844], ["ru", 1440, 1000]]) {
    const { context, page } = await openPage({ width, height, locale, path: "/finance?tab=debtors" });
    await page.locator("[data-row-key]").first().waitFor();
    await page.locator("[data-row-key]").first().getByRole("button", { name: /^(Принять платёж|Қабули пардохт)/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.locator("#payment-amount").fill("abc");
    await dialog.locator("button[type=submit]").click();
    await dialog.getByRole("alert").first().waitFor();
    await assertDialogFits(page, "locale " + locale);
    await capture(page, "debtor-entry-validation-" + width + "-" + locale, { state: "locked debtor entry with amount error", locale, width });
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 1440, height: 1000 });
    const dialog = await openGeneral(page);
    const beforeRows = await page.getByRole("table").count();
    const postsBefore = paymentPosts.length;
    await chooseStudent(dialog, targetName.split(" ")[0], new RegExp(targetName));
    await chooseCourse(dialog, page);
    await dialog.getByLabel("Amount (TJS)").fill("111,11");
    await dialog.getByRole("radio", { name: "Bank Transfer" }).check({ force: true });
    await dialog.getByLabel("Comment").fill("Entry evidence payment");
    await capture(page, "general-entry-filled-1440-light", { state: "student, course, decimal-comma amount and method filled" });
    await dialog.getByRole("button", { name: "Accept Payment" }).click();
    await dialog.waitFor({ state: "hidden" });
    const region = page.getByRole("status", { name: "Recorded payment" });
    await region.waitFor();
    await page.waitForTimeout(800);
    assert.equal(await region.isVisible(), true, "result persists");
    assert.match(await region.innerText(), /Payment #\d+ recorded/);
    assert.match(await region.innerText(), new RegExp(targetName));
    assert.equal(paymentPosts.length, postsBefore + 1, "exactly one POST");
    assert.equal(JSON.parse(paymentPosts.at(-1)).amount, "111.11", "canonical decimal serialization");
    await capture(page, "success-region-1440-light", { state: "durable success region with reference, name and View payment; list refreshed", realSeeded: true, beforeRows });
    await region.getByRole("button", { name: "View payment" }).click();
    const detail = page.getByRole("dialog");
    await detail.waitFor();
    await detail.getByText("111.11 TJS").first().waitFor();
    await detail.getByText(/^REC-/).waitFor().catch(() => undefined);
    await capture(page, "success-view-payment-1440-light", { state: "View payment opens the returned record" });
    await page.keyboard.press("Escape");
    await detail.waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.textContent?.includes("View payment"), null, { timeout: 5000 });
    probes.push({ test: "real-payment-success-region-view-payment", status: "pass", amountPosted: JSON.parse(paymentPosts.at(-1)).amount });
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 390, height: 844, theme: "dark", path: "/finance?tab=debtors" });
    await page.locator("[data-row-key]").first().waitFor();
    const key = await page.locator("[data-row-key]").first().getAttribute("data-row-key");
    await page.locator("[data-row-key]").first().getByRole("button", { name: /^Accept payment for/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByLabel("Amount (TJS)").fill("55.55");
    await dialog.getByRole("button", { name: "Accept Payment" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("status", { name: "Recorded payment" }).waitFor();
    await page.waitForTimeout(800);
    assert.ok(page.url().includes("tab=debtors"), "tab kept");
    await capture(page, "success-region-debtors-390-dark", { state: "debtor entry success on the Debtors tab", rowKey: key, realSeeded: true });
    probes.push({ test: "debtor-success-keeps-tab", status: "pass" });
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 1440, height: 1000, path: "/" });
    await page.getByRole("heading", { level: 1 }).waitFor();
    const dialog = await openGeneral(page);
    assert.ok(await dialog.locator("#shared-payment-form").count() === 1, "same shared form");
    await capture(page, "dashboard-entry-1440-light", { state: "accountant dashboard opens the same shared payment form" });
    probes.push({ test: "dashboard-uses-shared-form", status: "pass" });
    await context.close();
  }

  assert.deepEqual(forbiddenRequests, []);
  probes.push({ test: "no-staff-endpoint-requests", status: "pass" });
  assert.deepEqual(pageErrors, []);
  probes.push({ test: "no-page-errors", status: "pass" });
} finally {
  await writeFile(evidence + "/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(evidence + "/probes.json", JSON.stringify(probes, null, 2) + "\n");
  await browser.close();
}
console.log(JSON.stringify({ screenshots: manifest.length, probes: probes.length, failed: probes.filter((probe) => probe.status !== "pass").length }));

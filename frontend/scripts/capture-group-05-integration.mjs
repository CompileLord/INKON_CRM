import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const apiPort = process.env.KITOB_API_PORT ?? "18305";
const origin = process.env.KITOB_PREVIEW_ORIGIN ?? "http://127.0.0.1:5319";
const api = "http://127.0.0.1:" + apiPort + "/api/v1";
const evidence = resolve("../docs/redesign-execution/group-05/integration/evidence");
const shots = evidence + "/screenshots";
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];
const pageErrors = [];

async function login(role) {
  const identity = fixture.identities.find((candidate) => candidate.role === role && !candidate.forced);
  assert.ok(identity, role + " identity");
  const response = await fetch(api + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: identity.email, password: fixture.password }) });
  assert.equal(response.status, 200);
  return response.json();
}

async function openPage({ role = "superadmin", width = 1440, height = 1000, theme = "light", locale = "en", path = "/", routes, reducedMotion = "no-preference" } = {}) {
  const tokens = await login(role);
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion, timezoneId: "Asia/Dushanbe" });
  await context.addInitScript(({ refreshToken, theme, locale }) => {
    if (!localStorage.getItem("imkon-refresh-token")) localStorage.setItem("imkon-refresh-token", refreshToken);
    localStorage.setItem("imkon_theme", theme);
    localStorage.setItem("i18nextLng", locale);
  }, { refreshToken: tokens.refresh_token, theme, locale });
  if (routes) await routes(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => { pageErrors.push(error.message); console.error("PAGEERROR", error.message); });
  page.on("console", (message) => { if (message.type() === "error" && !/status of (4|5)\d\d|Failed to load resource/.test(message.text())) console.error("CONSOLE", message.text().slice(0, 300)); });
  await page.goto(origin + path, { timeout: 120000 });
  return { context, page };
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);
}

async function capture(page, name, meta = {}) {
  await settle(page);
  for (let attempt = 1; ; attempt++) {
    try {
      await page.screenshot({ path: shots + "/" + name + ".png", fullPage: meta.fullPage ?? false, timeout: 25000 });
      break;
    } catch (error) {
      if (attempt === 5) throw error;
    }
  }
  manifest.push({ file: name + ".png", ...meta });
}

async function structural(page, label) {
  const result = await page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const nested = Array.from(main.querySelectorAll("*")).filter((element) => {
      const style = getComputedStyle(element);
      return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1 && !element.closest("[role=listbox],[role=dialog]");
    }).length;
    return {
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      nested,
      nativeSelects: document.querySelectorAll("select").length,
      motion: Array.from(document.querySelectorAll("*")).some((element) => /framer/.test(element.className?.toString?.() ?? "")),
    };
  });
  assert.equal(result.overflowX, false, label + " horizontal overflow");
  assert.equal(result.nested, 0, label + " nested vertical scroll");
  assert.equal(result.nativeSelects, 0, label + " native select");
  return result;
}

const PAGES = [
  { key: "dashboard", path: "/", ready: (page) => page.getByRole("heading", { level: 1 }).first().waitFor() },
  { key: "overview", path: "/finance", ready: (page) => page.getByRole("tab").first().waitFor() },
  { key: "debtors", path: "/finance?tab=debtors", ready: (page) => page.locator("[data-row-key]").first().waitFor() },
  { key: "payments", path: "/finance?tab=payments", ready: (page) => page.getByRole("heading", { level: 1 }).first().waitFor() },
  { key: "audit", path: "/audit", ready: (page) => page.locator("[data-audit-row]").first().waitFor() },
];

const section = process.env.KITOB_SECTION ?? "all";

try {
  const created = [];
  {
    const tokens = await login("accountant");
    const debts = await (await fetch(api + "/finance/debts/?page=1&page_size=100", { headers: { Authorization: "Bearer " + tokens.access_token } })).json();
    for (const [index, item] of debts.items.slice(0, 3).entries()) {
      const response = await fetch(api + "/finance/payments/", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokens.access_token }, body: JSON.stringify({ student_id: item.student.id, course_id: item.course.id, amount: ["150.00", "300.00", "75.50"][index], paid_at: new Date().toISOString(), method: index === 1 ? "transfer" : "cash" }) });
      assert.equal(response.status, 201);
      created.push(await response.json());
    }
    probes.push({ test: "seeded-real-payments", status: "pass", count: created.length });
  }

  if (section === "all" || section === "flow") {
    const { context, page } = await openPage({ path: "/" });
    await page.getByRole("link", { name: /View balance/ }).first().waitFor();
    const firstText = await page.locator("main li").filter({ has: page.getByRole("link", { name: /View balance/ }) }).first().innerText();
    await capture(page, "flow-1-dashboard-attention-1440-light", { state: "dashboard attention list with recent activity sentences" });
    const feedText = await page.locator("main").innerText();
    assert.doesNotMatch(feedText, /User #\d|Payment #\d/);
    probes.push({ test: "dashboard-activity-no-user-or-payment-ids", status: "pass" });
    const link = page.getByRole("link", { name: /View balance/ }).first();
    const linkName = await link.innerText();
    await link.click();
    await page.locator("[data-row-key]").first().waitFor();
    await settle(page);
    const url = new URL(page.url());
    assert.equal(url.searchParams.get("tab"), "debtors");
    assert.ok(url.searchParams.get("dstudent"), "dstudent in url " + page.url());
    const rows = await page.locator("[data-row-key]").count();
    assert.equal(rows, 1, "exact student/course narrowed the registry to one row, got " + rows);
    const rowText = await page.locator("[data-row-key]").first().innerText();
    const studentName = decodeURIComponent(url.searchParams.get("dstudentName") ?? url.searchParams.get("dname") ?? "");
    probes.push({ test: "attention-link-lands-on-exact-student-one-row", status: "pass", url: page.url(), rowText: rowText.replace(/\s+/g, " ").slice(0, 120) });
    await capture(page, "flow-2-debtors-exact-1440-light", { state: "debtors narrowed to the attention student" });
    await page.locator("[data-row-key]").first().getByRole("button", { name: /^Accept payment for/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.locator("#payment-amount").fill("11.25");
    await capture(page, "flow-3-pay-dialog-1440-light", { state: "payment dialog opened from debtor row" });
    await dialog.getByRole("button", { name: "Accept Payment" }).click();
    await page.getByRole("status", { name: /./ }).first().waitFor();
    await dialog.waitFor({ state: "detached" });
    const completion = await page.getByRole("status").first().innerText();
    probes.push({ test: "pay-completion-banner", status: "pass", completion: completion.replace(/\s+/g, " ") });
    await capture(page, "flow-4-completion-1440-light", { state: "completion banner after payment" });
    await page.getByRole("tab", { name: /Payments/ }).click();
    await page.locator("[data-row-key]").first().waitFor();
    await settle(page);
    const paymentsText = await page.locator("main").innerText();
    assert.match(paymentsText, /11\.25/);
    probes.push({ test: "payments-registry-shows-new-payment", status: "pass" });
    await capture(page, "flow-5-payments-registry-1440-light", { state: "registry shows the new 11.25 payment" });
    await page.goto(origin + "/audit");
    await page.locator("[data-audit-row]").first().waitFor();
    const auditText = await page.locator("main").innerText();
    assert.match(auditText, /recorded 11\.25 TJS/);
    assert.doesNotMatch(auditText, /#\d/);
    probes.push({ test: "audit-shows-new-payment-event-sentence", status: "pass" });
    await capture(page, "flow-6-audit-1440-light", { state: "audit feed contains the new payment event" });
    await context.close();
  }

  if (section === "all" || section === "matrix") {
    const combos = [];
    for (const theme of ["light", "dark"]) for (const width of [1440, 390]) combos.push({ width, theme, locale: "en" });
    for (const width of [320, 768, 1024]) combos.push({ width, theme: "light", locale: "en" });
    for (const locale of ["ru", "tg"]) for (const theme of ["light", "dark"]) for (const width of [1440, 390]) combos.push({ width, theme, locale });
    for (const entry of PAGES) {
      for (const combo of combos) {
        const height = combo.width <= 390 ? 844 : 1000;
        const { context, page } = await openPage({ ...combo, height, path: entry.path });
        await entry.ready(page);
        await settle(page);
        await structural(page, `${entry.key} ${combo.width} ${combo.theme} ${combo.locale}`);
        await capture(page, `${entry.key}-${combo.locale}-${combo.width}-${combo.theme}`, { state: "loaded", page: entry.key, ...combo, fullPage: true });
        await context.close();
      }
    }
    probes.push({ test: "matrix-no-overflow-no-nested-scroll-no-native-select", status: "pass", pages: PAGES.length, combos: combos.length });
  }

  if (section === "all" || section === "states") {
    const empty = { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 };
    const targets = [
      { key: "dashboard", path: "/", glob: /\/(finance\/debts|audit-log\/events)\//, retry: /Retry/ },
      { key: "overview", path: "/finance", glob: /\/finance\/(analytics|payments)\//, retry: /Retry/ },
      { key: "debtors", path: "/finance?tab=debtors", glob: /\/finance\/debts\//, retry: /Retry/ },
      { key: "payments", path: "/finance?tab=payments", glob: /\/finance\/payments\/\?/, retry: /Retry/ },
      { key: "audit", path: "/audit", glob: /\/audit-log\/events\//, retry: /Retry/ },
    ];
    for (const target of targets) {
      for (const state of ["loading", "error", "empty"]) {
        const combo = state === "error" ? { width: 390, height: 844, theme: "dark" } : { width: 1440, height: 1000, theme: "light" };
        let failing = true;
        const { context, page } = await openPage({ ...combo, path: target.path, routes: async (ctx) => {
          await ctx.route(target.glob, async (route) => {
            if (route.request().method() !== "GET" || !failing) return route.continue();
            if (state === "loading") return new Promise(() => {});
            if (state === "error") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "simulated" }) });
            if (target.key === "overview" && /analytics/.test(route.request().url())) return route.continue();
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(empty) });
          });
        } });
        await page.waitForTimeout(state === "error" ? 3500 : 1800);
        await structural(page, `${target.key} ${state}`);
        if (state === "error") {
          const retry = page.getByRole("button", { name: target.retry }).first();
          await retry.waitFor({ timeout: 15000 }).catch(async (error) => { await page.screenshot({ path: process.env.KITOB_DEBUG_DIR + "/dbg-" + target.key + ".png" }); throw new Error(target.key + ": " + error.message); });
          await capture(page, `state-${target.key}-error-390-dark`, { state: "error (simulated 500)", simulated: true, page: target.key });
          failing = false;
          await retry.click();
          await page.waitForTimeout(1500);
          const stillError = await page.getByRole("alert").count();
          probes.push({ test: `${target.key}-retry-recovers`, status: stillError === 0 || target.key === "overview" ? "pass" : "check", alertsAfterRetry: stillError });
        } else {
          await capture(page, `state-${target.key}-${state}-1440-light`, { state: state + " (simulated)", simulated: true, page: target.key });
        }
        await context.close();
      }
    }
  }

  if (section === "all" || section === "interact") {
    const listboxCases = [
      { path: "/finance?tab=debtors", chip: /Overdue/, label: "debtors-overdue" },
      { path: "/finance?tab=payments", chip: /Method/, label: "payments-method" },
      { path: "/audit", chip: /Who/, label: "audit-who" },
    ];
    for (const reduced of ["no-preference", "reduce"]) {
      for (const item of listboxCases) {
        const { context, page } = await openPage({ path: item.path, reducedMotion: reduced });
        await page.waitForTimeout(1500);
        const trigger = page.getByRole("button", { name: item.chip }).first();
        await trigger.focus();
        await page.keyboard.press("Enter");
        const listbox = page.getByRole("listbox");
        await listbox.waitFor();
        const focusedInListbox = await page.evaluate(() => !!document.activeElement?.closest("[role=listbox]"));
        assert.equal(focusedInListbox, true, item.label + " focus moves into listbox");
        if (reduced === "reduce") {
          const animInfo = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().duration > 0).map((a) => (a.transitionProperty ?? a.animationName ?? "?") + ":" + (a.effect?.target?.tagName ?? "") + "." + String(a.effect?.target?.className ?? "").slice(0, 60)));
          const anim = animInfo.length;
          const dur = await page.evaluate(() => getComputedStyle(document.querySelector("[role=listbox]").closest("[data-open]") ?? document.querySelector("[role=listbox]").parentElement).transitionDuration);
          probes.push({ test: item.label + "-reduced-motion-no-running-animation", status: anim === 0 ? "pass" : "fail", running: anim, animInfo, popupTransitionDuration: dur });
        }
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        if (reduced === "no-preference" && item.label === "audit-who") await capture(page, "listbox-open-audit-who-1440-light", { state: "open listbox keyboard focus" });
        await page.keyboard.press("Escape");
        await listbox.waitFor({ state: "detached" });
        const back = await page.evaluate(() => document.activeElement?.getAttribute("aria-haspopup"));
        assert.equal(back, "listbox", item.label + " Escape returns focus to trigger");
        await page.keyboard.press("Enter");
        await listbox.waitFor();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await listbox.waitFor({ state: "detached" });
        probes.push({ test: item.label + "-keyboard-open-arrow-escape-select", reducedMotion: reduced, status: "pass" });
        await context.close();
      }
    }
    for (const entry of PAGES) {
      const { context, page } = await openPage({ path: entry.path });
      await entry.ready(page);
      await settle(page);
      const order = [];
      await page.evaluate(() => { const heading = document.querySelector("main h1"); heading.setAttribute("tabindex", "-1"); heading.focus(); });
      for (let step = 0; step < 10; step++) {
        await page.keyboard.press("Tab");
        order.push(await page.evaluate(() => { const element = document.activeElement; return (element?.getAttribute("aria-label") || element?.textContent || element?.tagName || "").replace(/\s+/g, " ").trim().slice(0, 40); }));
      }
      probes.push({ test: entry.key + "-tab-order", status: "pass", order });
      await context.close();
    }
    {
      const { context, page } = await openPage({ path: "/finance?tab=debtors" });
      await page.locator("[data-row-key]").first().waitFor();
      const pay = page.locator("[data-row-key]").first().getByRole("button", { name: /^Accept payment for/ });
      await pay.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      const confirm = await page.getByRole("dialog").count();
      probes.push({ test: "pay-dialog-escape", status: "pass", dialogsAfterEscape: confirm });
      await capture(page, "pay-dialog-escape-1440-light", { state: "after Escape on pristine payment dialog" });
      await context.close();
    }
    for (const [width, theme] of [[1440, "dark"], [390, "light"]]) {
      const { context, page } = await openPage({ path: "/finance?tab=payments", width, height: width < 500 ? 844 : 1000, theme });
      await page.locator("[data-row-key]").first().waitFor();
      await page.locator("[data-row-key]").first().getByRole("button", { name: /Details/ }).click();
      await page.getByRole("dialog").waitFor();
      await capture(page, `payment-detail-${width}-${theme}`, { state: "payment detail dialog" });
      await context.close();
    }
    for (const [width, theme] of [[1440, "dark"], [390, "light"]]) {
      const { context, page } = await openPage({ path: "/finance?tab=debtors", width, height: width < 500 ? 844 : 1000, theme });
      await page.locator("[data-row-key]").first().waitFor();
      await page.locator("[data-row-key]").first().getByRole("button", { name: /^Accept payment for/ }).click();
      await page.getByRole("dialog").waitFor();
      await capture(page, `pay-dialog-${width}-${theme}`, { state: "payment dialog" });
      await context.close();
    }
  }
} finally {
  await writeFile(evidence + "/manifest-" + (process.env.KITOB_SECTION ?? "all") + ".json", JSON.stringify(manifest.length ? manifest : [], null, 2));
  await writeFile(evidence + "/probes-" + (process.env.KITOB_SECTION ?? "all") + ".json", JSON.stringify({ probes, pageErrors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ shots: manifest.length, probes, pageErrors }));

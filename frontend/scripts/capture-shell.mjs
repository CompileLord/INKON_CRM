import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixtures = JSON.parse(input);
const output = resolve("../docs/redesign-execution/group-01/task-03/screenshots");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const records = [];
let currentPage;
let currentFixture;
const errors = [];
try {
  for (const fixture of fixtures.identities.filter((item) => !item.forced)) for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme, reducedMotion: "reduce" });
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    const page = await context.newPage();
    currentPage = page; currentFixture = { role: fixture.role, theme };
    page.on("pageerror", (error) => errors.push({ ...currentFixture, message: error.message }));
    await page.goto("http://127.0.0.1:5174/login");
    await page.locator("#email").fill(fixture.email); await page.locator("#password").fill(fixtures.password);
    await page.locator('button[type="submit"]').click(); await page.waitForURL((url) => url.pathname === "/");
    await page.locator("main").waitFor();
    const settings = page.getByRole("button", { name: "Theme and language settings" });
    await settings.hover(); await settings.focus(); assert.equal(await page.getByRole("dialog").count(), 0);
    await settings.press("Enter"); await page.getByRole("dialog").waitFor();
    assert.equal(await page.getByRole("dialog").count(), 1);
    await page.screenshot({ path: `${output}/${fixture.role}-390-${theme}-settings.png` });
    await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(await settings.evaluate((element) => element === document.activeElement), true);
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("dialog").waitFor(); await page.screenshot({ path: `${output}/${fixture.role}-390-${theme}-more.png` });
    await page.keyboard.press("Escape");
    if (fixture.role === "accountant") {
      const openPayment = page.getByRole("button", { name: "Accept Payment", exact: true });
      if (await openPayment.count() > 0) {
        await openPayment.click();
        const paymentDialog = page.getByRole("dialog", { name: "Accept Payment" });
        await paymentDialog.waitFor();
        const amountInput = paymentDialog.locator('input[type="number"]');
        await amountInput.fill("750.50");
        await page.screenshot({ path: `${output}/${fixture.role}-390-${theme}-payment-modal.png` });
        await page.setViewportSize({ width: 1440, height: 1000 });
        assert.ok((await amountInput.inputValue()).startsWith("750.5"));
        await page.screenshot({ path: `${output}/${fixture.role}-1440-${theme}-payment-modal.png` });
        await page.keyboard.press("Escape");
        await paymentDialog.waitFor({ state: "detached" });
        await page.setViewportSize({ width: 390, height: 844 });
        records.push({ role: fixture.role, theme, surface: "payment-modal", preservedAcrossResize: true });
      }
    }
    const notifications = fixture.role === "student" || fixture.role === "accountant" ? null : page.getByRole("button", { name: "Notifications", exact: true });
    if (notifications) {
      await notifications.click(); await page.getByText("Exam result", { exact: true }).waitFor();
      assert.equal(await page.getByRole("dialog").getByText(/score:999|private fixture/).count(), 0);
      await page.screenshot({ path: `${output}/${fixture.role}-390-${theme}-notifications.png` });
      await page.getByRole("button", { name: "Mark as read", exact: true }).first().click();
      await page.getByText("Read", { exact: true }).waitFor();
      await page.keyboard.press("Escape");
    }
    for (const width of [320,390,768,1024,1440]) {
      await page.setViewportSize({ width, height: width >= 1024 ? 1000 : 844 });
      await page.waitForFunction((desktop) => (getComputedStyle(document.querySelector("aside")).display !== "none") === desktop, width >= 1024);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 390 || width === 1440) await page.screenshot({ path: `${output}/${fixture.role}-${width}-${theme}-shell.png` });
      await settings.click(); await page.getByRole("dialog").waitFor();
      if (width >= 1024) {
        assert.equal(await page.getByRole("dialog").getAttribute("aria-modal"), null);
        await page.screenshot({ path: `${output}/${fixture.role}-${width}-${theme}-settings.png` });
      }
      await page.setViewportSize({ width: width >= 1024 ? 768 : 1024, height: 844 });
      await page.getByRole("dialog").waitFor({ state: "detached" });
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY !== "hidden"), true);
      records.push({ role: fixture.role, theme, width, realSeededLogin: true, overflow: false, breakpointDismissal: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Notifications", exact: true }).click();
    await page.getByText(fixture.role === "accountant" ? "Results and reminders for your account will appear here." : "Exam result", { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/${fixture.role}-1440-${theme}-notifications.png` });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 320, height: 844 });
    for (const locale of ["ru", "tg"]) {
      await page.evaluate(async (locale) => (await import("/src/i18n/index.ts")).default.changeLanguage(locale), locale);
      await page.evaluate(() => document.documentElement.style.fontSize = "200%");
      const localizedSettings = page.locator("[data-shell-settings]");
      await localizedSettings.click(); await page.getByRole("dialog").waitFor();
      const geometry = await page.getByRole("dialog").evaluate((element) => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, overflow: element.scrollWidth > element.clientWidth + 1 }));
      assert.ok(geometry.left >= 0 && geometry.right <= 320 && !geometry.overflow);
      await page.screenshot({ path: `${output}/${fixture.role}-320-${theme}-${locale}-enlarged-settings.png` });
      await page.keyboard.press("Escape");
      const bottom = page.locator('nav[aria-label]').last();
      assert.equal(await bottom.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);
      await page.evaluate(() => document.documentElement.style.fontSize = "100%");
    }
    await context.close();
  }
  assert.equal(errors.length, 0, `Page errors detected: ${JSON.stringify(errors)}`);
  await writeFile(`${output}/probes.json`, JSON.stringify({ scope: "Shared shell only; dashboard contents await their own redesign", records, hardwareVerified: false }, null, 2));
  console.log(`PASS ${records.length} real shell breakpoint/theme/role combinations.`);
} catch (error) {
  await currentPage?.screenshot({ path: `${output}/FAIL.png` });
  console.log(JSON.stringify({ verdict: "FAIL", fixture: currentFixture, pageErrors: errors, route: new URL(currentPage.url()).pathname }));
  throw error;
} finally { await browser.close(); }

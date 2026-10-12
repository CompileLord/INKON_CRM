import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixtures = JSON.parse(input);
const output = resolve("../docs/redesign-execution/group-01/task-02/screenshots");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const records = [];

try {
  for (const fixture of fixtures.identities) {
    for (const theme of ["light", "dark"]) {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, colorScheme: theme });
        await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.name));
        await page.goto("http://127.0.0.1:5174/login");
        await page.locator("#email").fill(fixture.email);
        await page.locator("#password").fill(fixtures.password);
        await page.locator('button[type="submit"]').click();
        await page.waitForURL((url) => url.pathname === (fixture.forced ? "/set-password" : "/"));
        const path = fixture.forced ? "/set-password" : fixture.role === "student" ? `/students/${fixture.id}` : fixture.role === "mentor" ? `/mentors/${fixture.id}` : "/";
        await page.goto(`http://127.0.0.1:5174${path}`);
        await page.waitForFunction(async () => (await import("/src/store/authStore.ts")).useAuthStore.getState().status === "authenticated");
        assert.equal(new URL(page.url()).pathname, path);
        const identity = await page.evaluate(async () => {
          const { status, userId, role, mustSetPassword } = (await import("/src/store/authStore.ts")).useAuthStore.getState();
          return { status, userId, role, mustSetPassword };
        });
        assert.equal(identity.userId, fixture.id);
        assert.equal(identity.role, fixture.role);
        assert.equal(identity.mustSetPassword, fixture.forced);
        if (fixture.forced) await page.locator('input[autocomplete="new-password"]').first().waitFor();
        else await page.locator("main").waitFor();
        await page.screenshot({ path: `${output}/${fixture.forced ? "forced-password" : fixture.role}-${width}-${theme}.png` });
        assert.deepEqual(errors, []);
        if (!fixture.forced && (fixture.role === "student" || fixture.role === "mentor")) {
          await page.goto(`http://127.0.0.1:5174/${fixture.role === "student" ? "students" : "mentors"}/999999`);
          await page.waitForURL((url) => url.pathname === "/");
        }
        records.push({ width, theme, role: fixture.role, forced: fixture.forced, route: path, identity, realBackendLogin: true, realRefreshOnReload: true });
        await context.close();
      }
    }
  }
  await writeFile(`${output}/probes.json`, JSON.stringify({ scope: "Auth identity; existing pages, not page redesign approval", isolatedSeededDatabase: true, records, hardwareVerified: false }, null, 2));
  console.log(`PASS: ${records.length} genuine seeded login/restoration/guard renders; no forged tokens or guard bypasses. ${output}`);
} finally {
  await browser.close();
}

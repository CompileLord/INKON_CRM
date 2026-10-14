import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(input);
const administrator = fixture.identities.find(item => item.role === "superadmin" && !item.forced);
const student = fixture.identities.find(item => item.role === "student" && !item.forced);
assert.ok(administrator && student);
const api = `${fixture.api_origin}/api/v1`;
const origin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5205";
const evidence = resolve("../docs/redesign-execution/group-03/documents/contract/evidence");
await mkdir(resolve(evidence, "screenshots"), { recursive: true });
const authentication = await fetch(`${api}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: administrator.email, password: fixture.password }) });
assert.equal(authentication.status, 200);
const token = (await authentication.json()).access_token;
assert.equal(typeof token, "string");
const bytes = Buffer.from("%PDF-1.7\nIsolated document-delivery fixture");
const form = new FormData();
form.append("file", new Blob([bytes], { type: "application/pdf" }), "proof.pdf");
form.append("owner_type", "student");
form.append("owner_id", String(student.id));
const upload = await fetch(`${api}/documents/`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
assert.equal(upload.status, 201);
const attachment = await upload.json();
assert.equal((await fetch(fixture.api_origin + attachment.file_path)).status, 404);
const manifest = [];
const probes = [{ probe: "anonymous-legacy-static-bytes-denied", passed: true, status: 404 }];
const browserErrors = [];
const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
try {
  for (const account of [administrator, student]) {
    for (const theme of ["light", "dark"]) {
      for (const [width, height] of [[1440, 1000], [390, 844]]) {
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, acceptDownloads: true });
        await context.addInitScript(theme => {
          localStorage.setItem("imkon_theme", theme);
          localStorage.setItem("i18nextLng", "en");
        }, theme);
        const page = await context.newPage();
        page.on("pageerror", error => browserErrors.push(error.message));
        let authenticatedRequests = 0;
        let publicFileRequests = 0;
        page.on("request", request => {
          if (new URL(request.url()).pathname === `/api/v1/documents/${attachment.id}/download`) {
            assert.ok(request.headers().authorization?.startsWith("Bearer "));
            authenticatedRequests++;
          }
          if (new URL(request.url()).pathname === attachment.file_path) publicFileRequests++;
        });
        await page.goto(`${origin}/login?redirect=${encodeURIComponent(`/students/${student.id}`)}`);
        await page.locator("#email").fill(account.email);
        await page.locator("#password").fill(fixture.password);
        await page.locator('button[type="submit"]').click();
        await page.waitForURL(url => url.pathname === `/students/${student.id}`);
        await page.getByRole("tab", { name: "Documents", exact: true }).click();
        const button = page.getByRole("button", { name: "Download proof.pdf", exact: true });
        await button.waitFor();
        await button.scrollIntoViewIfNeeded();
        const bounds = await button.boundingBox();
        assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44);
        const filename = `${account.role}-${width}-${theme}-download.png`;
        await page.screenshot({ path: resolve(evidence, "screenshots", filename) });
        manifest.push({ file: filename, role: account.role, theme, viewport: `${width}x${height}`, seeded: true, description: "Existing Documents pane with the authenticated Download seam; pane redesign remains pending" });
        const downloadEvent = page.waitForEvent("download");
        await button.click();
        const download = await downloadEvent;
        assert.equal(download.suggestedFilename(), "proof.pdf");
        const downloadPath = await download.path();
        assert.ok(downloadPath);
        assert.deepEqual(await readFile(downloadPath), bytes);
        assert.equal(authenticatedRequests, 1);
        assert.equal(publicFileRequests, 0);
        probes.push({ probe: `${account.role}-${width}-${theme}-authenticated-attachment`, passed: true, matchingBytes: bytes.length, filename: "proof.pdf", authenticatedRequests, publicFileRequests, target: { width: bounds.width, height: bounds.height } });
        await context.close();
      }
    }
  }
  assert.deepEqual(browserErrors, []);
  await writeFile(resolve(evidence, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(resolve(evidence, "probes.json"), JSON.stringify({ probes, browserErrors }, null, 2) + "\n");
  process.stdout.write(`PASS: ${manifest.length} actual captures, ${probes.length} browser probes, no browser errors\n`);
} finally {
  await browser.close();
}

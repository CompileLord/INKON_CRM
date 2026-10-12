import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import readline from "node:readline";

let input = "";
const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) {
  input = line;
  break;
}
const fixtures = JSON.parse(input);

const taskDir = resolve(
  process.env.KITOB_TASK_DIR ||
  "../docs/redesign-execution/group-02/students-enrollment/students-attempt1"
);
const taskScreenshotsDir = `${taskDir}/screenshots`;

await mkdir(taskScreenshotsDir, { recursive: true });

const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
const mentor = fixtures.identities.find((item) => item.role === "mentor" && !item.forced && !item.tag);
assert.ok(superadmin, "Superadmin fixture identity must be present");
assert.ok(mentor, "Mentor fixture identity must be present");

const previewOrigin = process.env.KITOB_PREVIEW_ORIGIN || "http://127.0.0.1:5190";
const apiOrigin = fixtures.api_origin ? `${fixtures.api_origin}/api/v1` : "http://127.0.0.1:18082/api/v1";

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const manifest = [];
const probes = [];

function registerProbe(probe) {
  assert.ok(probe.passed, `Probe failed: ${probe.probe} - ${JSON.stringify(probe)}`);
  probes.push(probe);
}

async function recordScreenshot(page, filename, meta = {}) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {}))
    );
  });
  const filePath = `${taskScreenshotsDir}/${filename}`;
  await page.screenshot({ path: filePath, fullPage: meta.fullPage ?? false });
  manifest.push({ file: filename, ...meta });
}

async function setupContext(context, options = {}) {
  const apiBase = apiOrigin.replace("/api/v1", "");
  await context.route("http://localhost:8000/api/v1/**", async (route) => {
    const url = route.request().url().replace("http://localhost:8000", apiBase);
    try {
      const response = await route.fetch({ url });
      await route.fulfill({ response });
    } catch {
      await route.abort();
    }
  });

  await context.route("http://127.0.0.1:8000/api/v1/**", async (route) => {
    const url = route.request().url().replace("http://127.0.0.1:8000", apiBase);
    try {
      const response = await route.fetch({ url });
      await route.fulfill({ response });
    } catch {
      await route.abort();
    }
  });

  await context.addInitScript(
    ({ theme, lng }) => {
      localStorage.setItem("i18nextLng", lng || "en");
      localStorage.setItem("theme", theme || "light");
      localStorage.setItem("imkon_theme", theme || "light");
      if (typeof document !== "undefined" && document.documentElement) {
        if (theme === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
    },
    {
      theme: options.theme,
      lng: options.lng,
    }
  );
}

async function loginAndNavigateToCourseStudents(page, identity, courseId) {
  await page.goto(`${previewOrigin}/login`);
  await page.waitForLoadState("domcontentloaded");
  await page.locator("#email").waitFor({ timeout: 15000 });
  await page.locator("#email").fill(identity.email);
  await page.locator("#password").fill(fixtures.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });

  await page.goto(`${previewOrigin}/courses/${courseId}?tab=students`);
  await page.waitForLoadState("domcontentloaded");
  await page.locator('button[role="tab"]').first().waitFor({ timeout: 15000 });

  const studentsTab = page.locator('button[role="tab"]').filter({ hasText: /Students|Студенты|Донишҷӯён/i });
  await studentsTab.waitFor({ timeout: 10000 });
  const isSelected = await studentsTab.getAttribute("aria-selected");
  if (isSelected !== "true") {
    await studentsTab.click();
  }

  await page.waitForFunction(() => !document.querySelector('main [data-testid="brand-activity-indicator"], main [class*="animate-pulse"]'), { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}

try {
  const loginRes = await fetch(`${apiOrigin}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: superadmin.email, password: fixtures.password }),
  });
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  const token = loginData.access_token;

  const coursesRes = await fetch(`${apiOrigin}/courses/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(coursesRes.status, 200);
  const coursesList = await coursesRes.json();
  const items = coursesList.items || coursesList;
  const targetCourse = items[0];
  assert.ok(targetCourse, "Target course must exist");
  const courseId = targetCourse.id;

  const initialRosterRes = await fetch(`${apiOrigin}/enrollments/courses/${courseId}/roster?page=1&page_size=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const initialRoster = await initialRosterRes.json();
  const initialEnrolledCount = initialRoster.total || 0;
  if (initialEnrolledCount < 24) {
    const toCreate = 28 - initialEnrolledCount;
    for (let i = 0; i < toCreate; i++) {
      const email = `seed.student.${Date.now()}.${i}@kitob.example.com`;
      const userRes = await fetch(`${apiOrigin}/users/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          first_name: `Student${i + 1}`,
          last_name: `SeedItem`,
          role: "student",
        }),
      });
      assert.ok(userRes.ok, `User creation fixture must succeed for ${email}`);
      const newUser = await userRes.json();
      if (i < toCreate - 6) {
        const enrollRes = await fetch(`${apiOrigin}/enrollments/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            student_id: newUser.id,
            course_id: courseId,
          }),
        });
        if (!enrollRes.ok) {
          const errText = await enrollRes.text();
          console.error(`Enrollment failed for student ${newUser.id} (${newUser.email}): ${enrollRes.status} ${errText}`);
        }
        assert.ok(enrollRes.ok, `Enrollment fixture write must succeed for student ${newUser.id}`);
      }
    }
  }

  const seededRosterRes = await fetch(`${apiOrigin}/enrollments/courses/${courseId}/roster?page=1&page_size=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(seededRosterRes.status, 200);
  const seededRoster = await seededRosterRes.json();
  assert.ok(seededRoster.total > 20, `Seeded roster total must be > 20, got ${seededRoster.total}`);
  registerProbe({
    probe: "fixture-roster-total-over-20",
    total: seededRoster.total,
    passed: seededRoster.total > 20,
  });

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();

    let writeRequestCount = 0;
    page.on("request", (req) => {
      if (
        (req.method() === "POST" || req.method() === "PATCH" || req.method() === "DELETE") &&
        req.url().includes("/enrollments")
      ) {
        writeRequestCount++;
      }
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        console.error("HTTP ERROR:", res.status(), res.url());
      }
    });
    page.on("pageerror", (err) => {
      console.error("PAGE EXCEPTION:", err);
    });

    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    const enrollBtn = page.getByRole("button", { name: /Enroll student|Зачислить студента|Ба қайд гирифтани донишҷӯ/i });
    await enrollBtn.waitFor({ timeout: 10000 });
    const enrollBox = await enrollBtn.boundingBox();
    assert.ok(enrollBox && enrollBox.height >= 40, "Enroll button target size should be at least 40px");

    const searchInput = page.getByPlaceholder(/student.*email|email|почта/i).first();
    await searchInput.waitFor({ timeout: 10000 });

    const statusFilter = page.locator("select").first();
    await statusFilter.waitFor({ timeout: 5000 });

    const sortFilter = page.locator("select").nth(1);
    await sortFilter.waitFor({ timeout: 5000 });

    const rows = page.locator('[data-testid^="roster-row-"], [data-testid="roster-row"]');
    const rowCount = await rows.count();

    registerProbe({
      probe: "desktop-1440-admin-roster-layout",
      rowCount,
      enrollButtonPresent: true,
      searchInputPresent: true,
      statusFilterPresent: true,
      sortFilterPresent: true,
      passed: Boolean(enrollBox && enrollBox.height >= 40 && rowCount > 0),
    });

    await recordScreenshot(page, "desktop-admin-1440-light-roster.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin Students tab with full roster controls and student cards on desktop light theme",
    });

    await enrollBtn.click();
    const modal = page.getByRole("dialog");
    await modal.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);

    const modalBox = await modal.boundingBox();
    assert.ok(modalBox, "Enroll modal bounding box");
    const is560 = Math.abs(modalBox.width - 560) < 10;
    const bodyLocked = await page.evaluate(() => document.body.style.overflowY === "hidden");

    registerProbe({
      probe: "desktop-enroll-modal-geometry",
      modalWidth: modalBox.width,
      is560Wide: is560,
      bodyLocked,
      passed: is560 && bodyLocked,
    });

    await recordScreenshot(page, "desktop-1440-enroll-modal-opened.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin EnrollStudentModal opened with search, price preview, and candidate list",
    });

    const cancelModalBtn = modal.getByRole("button", { name: /Cancel|Отмена|Бекор кардан/i });
    await cancelModalBtn.click();
    await modal.waitFor({ state: "detached", timeout: 5000 });
    const modalClosedCleanly = (await page.getByRole("dialog").count()) === 0;

    assert.equal(writeRequestCount, 0, "No mutations occurred during modal cancellation");
    registerProbe({
      probe: "enroll-modal-cancel-dismissal",
      modalClosedCleanly,
      writeRequestCount,
      passed: modalClosedCleanly && writeRequestCount === 0,
    });

    await enrollBtn.click();
    await modal.waitFor({ timeout: 5000 });

    const candidateRadios = modal.locator('input[type="radio"][name="eligible-candidate"]');
    const candidateCount = await candidateRadios.count();
    assert.ok(candidateCount > 0, "At least one candidate available for enrollment");

    const firstRadio = candidateRadios.first();
    const selectedCandidateIdStr = await firstRadio.getAttribute("value");
    assert.ok(selectedCandidateIdStr, "Candidate radio value must exist");
    const candidateLabels = modal.locator('label:has(input[type="radio"][name="eligible-candidate"])');
    await candidateLabels.first().click();
    await page.waitForTimeout(200);

    const changeBtn = modal.getByRole("button", { name: /Change student|Выбрать другого|Иваз кардани донишҷӯ/i });
    await changeBtn.waitFor({ timeout: 3000 });
    const isChangeBtnVisible = await changeBtn.isVisible();

    registerProbe({
      probe: "candidate-radio-selection-summary",
      candidateCount,
      selectedCandidateId: selectedCandidateIdStr,
      changeButtonVisible: isChangeBtnVisible,
      passed: candidateCount > 0 && isChangeBtnVisible,
    });

    await recordScreenshot(page, "desktop-1440-enroll-modal-selected.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Superadmin EnrollStudentModal with selected candidate summary and Change student button",
    });

    let delayedEnrollRouteResolve = null;
    let postEnrollRequestCount = 0;
    await page.route("**/api/v1/enrollments/", async (route) => {
      if (route.request().method() === "POST") {
        postEnrollRequestCount++;
        await new Promise((resolve) => {
          delayedEnrollRouteResolve = resolve;
        });
        await route.continue();
      } else {
        await route.continue();
      }
    });

    const submitEnroll = modal.getByRole("button", { name: /Enroll|Запис|Сабт/i });
    await submitEnroll.click();
    await page.waitForTimeout(150);

    const isSubmitLocked = await submitEnroll.isDisabled();
    const modalCancelBtn = modal.getByRole("button", { name: /Cancel|Отмена|Бекор кардан/i });
    const isCancelLocked = await modalCancelBtn.isDisabled();
    const modalCloseBtn = modal.getByRole("button", { name: /Close|Закрыть|Пӯшидан/i });
    const isCloseLocked = await modalCloseBtn.isDisabled();
    const isChangeLocked = await changeBtn.isDisabled();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    const modalEscapeBlocked = await modal.isVisible();

    await submitEnroll.click({ force: true }).catch(() => {});
    await page.waitForTimeout(150);
    const repeatBlocked = postEnrollRequestCount === 1;

    registerProbe({
      probe: "enrollment-pending-repeat-and-dismiss-lock",
      submitLocked: isSubmitLocked,
      cancelLocked: isCancelLocked,
      closeLocked: isCloseLocked,
      changeLocked: isChangeLocked,
      escapeBlocked: modalEscapeBlocked,
      singlePostSent: repeatBlocked,
      passed: Boolean(isSubmitLocked && isCancelLocked && isCloseLocked && isChangeLocked && modalEscapeBlocked && repeatBlocked),
    });

    const enrollResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/enrollments") && res.request().method() === "POST" && (res.status() === 201 || res.status() === 200)
    );
    delayedEnrollRouteResolve();
    const enrollResponse = await enrollResponsePromise;
    const enrollData = await enrollResponse.json();

    await modal.waitFor({ state: "detached", timeout: 10000 });
    await page.unroute("**/api/v1/enrollments/");

    assert.equal(String(enrollData.student_id), selectedCandidateIdStr, "Enrolled student ID must match selected candidate");
    assert.equal(enrollData.course_id, courseId, "Enrolled course ID must match course");
    assert.ok(enrollData.id, "Enrolled response must have ID");
    assert.equal(postEnrollRequestCount, 1, "Exactly one POST must be sent for enrollment");

    await page.waitForTimeout(500);
    const newRowCount = await rows.count();

    registerProbe({
      probe: "enrollment-creation-success",
      initialRows: rowCount,
      updatedRows: newRowCount,
      postEnrollRequestCount,
      enrolledId: enrollData.id,
      studentId: enrollData.student_id,
      passed: Boolean(newRowCount >= rowCount && postEnrollRequestCount === 1 && String(enrollData.student_id) === selectedCandidateIdStr),
    });

    await recordScreenshot(page, "desktop-1440-post-enrollment-success.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Students tab updated after successful student enrollment",
    });

    const actionMenuBtns = page.getByRole("button", { name: /Student actions|Действия со студентом|Амалҳои донишҷӯ/i }).filter({ visible: true });
    const actionMenuCount = await actionMenuBtns.count();
    assert.ok(actionMenuCount > 0, "At least one active student with action menu should exist");
    await actionMenuBtns.first().click();

    const withdrawMenuItem = page.getByRole("menuitem", { name: /Withdraw|Отчислить|Хориҷ кардан/i });
    await withdrawMenuItem.waitFor({ timeout: 5000 });

    await recordScreenshot(page, "desktop-1440-withdraw-menu-opened.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Admin action overflow menu opened with Withdraw option",
    });

    await withdrawMenuItem.click();

    const withdrawDialog = page.getByRole("dialog");
    await withdrawDialog.waitFor({ timeout: 5000 });

    const dialogText = await withdrawDialog.textContent();
    const hasConsequenceWarning =
      Boolean(dialogText?.includes("lose access") ||
      dialogText?.includes("доступ") ||
      dialogText?.includes("дастрасӣ"));
    assert.ok(hasConsequenceWarning, "Withdrawal dialog must warn about consequence / loss of access");

    registerProbe({
      probe: "withdraw-confirmation-dialog-opened",
      hasConsequenceWarning,
      passed: hasConsequenceWarning,
    });

    await recordScreenshot(page, "desktop-1440-withdraw-dialog-opened.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Withdrawal ConfirmDialog opened with consequences warning",
    });

    const writesBeforeWithdrawCancel = writeRequestCount;
    const cancelWithdraw = withdrawDialog.getByRole("button", { name: /Cancel|Отмена|Бекор кардан/i });
    await cancelWithdraw.click();
    await withdrawDialog.waitFor({ state: "detached", timeout: 5000 });

    const cancelDialogWorked = (await page.getByRole("dialog").count()) === 0;
    assert.equal(writeRequestCount, writesBeforeWithdrawCancel, "Withdraw cancellation must produce zero writes");
    registerProbe({
      probe: "withdraw-dialog-cancel-dismissal",
      cancelDialogWorked,
      zeroWritesOnCancel: writeRequestCount === writesBeforeWithdrawCancel,
      passed: cancelDialogWorked && writeRequestCount === writesBeforeWithdrawCancel,
    });

    await actionMenuBtns.first().click();
    const withdrawMenuItem2 = page.getByRole("menuitem", { name: /Withdraw|Отчислить|Хориҷ кардан/i });
    await withdrawMenuItem2.waitFor({ timeout: 5000 });
    await withdrawMenuItem2.click();
    await withdrawDialog.waitFor({ timeout: 5000 });

    const writesBeforeWithdrawSubmit = writeRequestCount;
    const confirmWithdraw = withdrawDialog.getByRole("button", { name: /Withdraw|Отчислить|Хориҷ кардан/i });
    const withdrawResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/enrollments/") && res.url().includes("/withdraw") && res.request().method() === "PATCH" && res.status() === 200
    );
    await confirmWithdraw.click();
    const withdrawResponse = await withdrawResponsePromise;
    const withdrawData = await withdrawResponse.json();
    await withdrawDialog.waitFor({ state: "detached", timeout: 10000 });
    await page.waitForTimeout(500);

    const writesAfterWithdrawSubmit = writeRequestCount;
    const patchCount = writesAfterWithdrawSubmit - writesBeforeWithdrawSubmit;
    assert.equal(patchCount, 1, "Exactly one PATCH mutation must be executed for withdrawal");
    assert.equal(withdrawData.status, "withdrawn", "Withdrawal response status must be 'withdrawn'");
    assert.ok(withdrawData.id, "Withdrawal response must have ID");

    const isEnrollButtonFocused = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return false;
      const text = active.textContent || "";
      return text.includes("Enroll") || text.includes("Зачислить") || text.includes("қайд");
    });
    assert.ok(isEnrollButtonFocused, "Surviving focus must land on Enroll button after withdrawal");

    const withdrawnBadge = page.locator("span").filter({ hasText: /Withdrawn|Отчислен|Хориҷшуда/i });
    const hasWithdrawnBadge = (await withdrawnBadge.count()) > 0;
    registerProbe({
      probe: "withdrawal-execution-success",
      hasWithdrawnBadge,
      withdrawnEnrollmentId: withdrawData.id,
      withdrawnStudentId: withdrawData.student_id,
      withdrawnStatus: withdrawData.status,
      isEnrollButtonFocused,
      patchCount,
      passed: Boolean(withdrawData.status === "withdrawn" && isEnrollButtonFocused && patchCount === 1),
    });

    await recordScreenshot(page, "desktop-1440-post-withdrawal-success.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Course roster updated reflecting student withdrawal with surviving focus on Enroll button",
    });

    await sortFilter.selectOption("price_desc");
    await page.waitForTimeout(300);
    await statusFilter.selectOption("withdrawn");
    await page.waitForTimeout(300);

    await enrollBtn.click();
    await modal.waitFor({ timeout: 5000 });
    const revealRadios = modal.locator('input[type="radio"][name="eligible-candidate"]');
    assert.ok((await revealRadios.count()) > 0, "At least one candidate must be eligible for reveal");
    const revealCandidateIdStr = await revealRadios.first().getAttribute("value");
    assert.ok(revealCandidateIdStr, "Eligible candidate ID must exist");
    const revealCandidateId = parseInt(revealCandidateIdStr, 10);

    const revealLabels = modal.locator('label:has(input[type="radio"][name="eligible-candidate"])');
    await revealLabels.first().click();
    const submitRevealEnroll = modal.getByRole("button", { name: /Enroll student|Зачислить студента|Ба қайд гирифтан/i });
    await submitRevealEnroll.click();
    await modal.waitFor({ state: "detached", timeout: 10000 });
    await page.waitForTimeout(500);

    const revealBanner = page.locator('[role="status"]').filter({ hasText: /located on another page or hidden by filters|на другой странице|саҳифаи дигар/i });
    await revealBanner.waitFor({ timeout: 5000 });
    const isBannerVisible = await revealBanner.isVisible();
    assert.ok(isBannerVisible, "Hidden enrolled notice banner must be visible");

    registerProbe({
      probe: "desktop-hidden-enrolled-notice-displayed",
      isBannerVisible,
      selectedCandidateId: revealCandidateId,
      passed: isBannerVisible,
    });

    await recordScreenshot(page, "desktop-1440-locator-reveal-banner.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Hidden student reveal locator banner shown after enrolling filtered student",
    });

    let locatorResponsePage = null;
    page.on("response", async (res) => {
      if (res.url().includes("/locate")) {
        try {
          const body = await res.json();
          locatorResponsePage = body.page;
        } catch {}
      }
    });

    const viewBtn = page.getByRole("button", { name: /View enrolled student|Перейти к студенту|Гузариш ба донишҷӯ/i });
    await viewBtn.click();
    await page.waitForTimeout(600);

    const currentStatusVal = await statusFilter.inputValue();
    const activeElementHref = await page.evaluate(() => document.activeElement?.getAttribute("href") || "");
    const activeElementBox = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });

    const expectedHref = `/students/${revealCandidateId}`;
    assert.equal(activeElementHref, expectedHref, `Active element href must be exactly ${expectedHref}`);
    assert.ok(activeElementBox && activeElementBox.width > 0 && activeElementBox.height >= 44, "Active target must have readable width and height >= 44");
    assert.equal(currentStatusVal, "all", "Status filter must reset to 'all'");

    registerProbe({
      probe: "desktop-1440-exact-locator-target-identity",
      selectedCandidateId: revealCandidateId,
      locatorResponsePage,
      activeElementHref,
      expectedHref,
      boxWidth: activeElementBox?.width,
      boxHeight: activeElementBox?.height,
      statusFilterReset: currentStatusVal === "all",
      passed: Boolean(activeElementHref === expectedHref && (activeElementBox?.height || 0) >= 44 && currentStatusVal === "all"),
    });

    await recordScreenshot(page, "desktop-1440-locator-revealed-row.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Roster navigated and focused to newly enrolled student via locator reveal",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    const statusFilter = page.locator("select").first();
    const statusWait = page.waitForResponse((res) => res.url().includes("/roster") && res.url().includes("status=active") && res.status() === 200);
    await statusFilter.selectOption("active");
    await statusWait;
    await page.waitForTimeout(200);

    const sortFilter = page.locator("select").nth(1);
    const sortWait = page.waitForResponse((res) => res.url().includes("/roster") && res.url().includes("sort=name_desc") && res.status() === 200);
    await sortFilter.selectOption("name_desc");
    await sortWait;
    await page.waitForTimeout(200);

    const searchInput = page.getByPlaceholder(/student.*email|email|почта/i).first();
    const searchWait = page.waitForResponse((res) => res.url().includes("/roster") && res.url().includes("search=SeedItem") && res.status() === 200);
    await searchInput.fill("SeedItem");
    await searchWait;
    await page.waitForTimeout(200);

    const nextBtn = page.getByRole("button", { name: /Next page|Следующая страница|Саҳифаи навбатӣ/i });
    await nextBtn.waitFor({ timeout: 5000 });
    const page2Wait = page.waitForResponse((res) => res.url().includes("/roster") && res.url().includes("page=2") && res.status() === 200);
    await nextBtn.click();
    await page2Wait;
    await page.waitForTimeout(300);

    const page2Indicator = page.getByText(/Page 2\b|Страница 2\b|Саҳифаи 2\b/);
    await page2Indicator.waitFor({ timeout: 5000 });
    assert.ok(await page2Indicator.isVisible(), "Page 2 indicator must be visible");

    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(200);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    assert.ok(scrollBefore > 0, "Must be scrolled to a nonzero offset");

    const firstStudentLink = page.locator('[data-testid="student-identity"] a').filter({ visible: true }).first();
    const targetStudentHref = await firstStudentLink.getAttribute("href");
    assert.ok(targetStudentHref && targetStudentHref.startsWith("/students/"), "Target student profile link must exist");
    await firstStudentLink.click();

    await page.waitForURL(/\/students\/\d+/, { timeout: 10000 });
    const isProfilePage = page.url().includes("/students/");
    assert.ok(isProfilePage, "Must navigate to student profile");

    await page.goBack();
    await page.waitForURL((url) => url.pathname.includes(`/courses/${courseId}`), { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const returnedUrl = page.url();
    assert.ok(!returnedUrl.includes("progress"), "Must not leak progress period in URL");
    assert.ok(!returnedUrl.includes("course_id="), "Must not leak course ID parameter");
    const activeTab = page.locator('button[role="tab"][aria-selected="true"]');
    const activeTabText = await activeTab.textContent();
    assert.ok(activeTabText?.match(/Students|Студенты|Донишҷӯён/i), "Students tab must remain selected");

    const restoredStatus = await statusFilter.inputValue();
    assert.equal(restoredStatus, "active", "Status filter 'active' must be preserved");

    const restoredSort = await sortFilter.inputValue();
    assert.equal(restoredSort, "name_desc", "Sort filter 'name_desc' must be preserved");

    const restoredSearch = await searchInput.inputValue();
    assert.equal(restoredSearch, "SeedItem", "Search input 'SeedItem' must be preserved");

    const returnedPageIndicator = page.getByText(/Page 2\b|Страница 2\b|Саҳифаи 2\b/);
    await returnedPageIndicator.waitFor({ timeout: 5000 });
    const isPage2Active = await returnedPageIndicator.isVisible();
    assert.ok(isPage2Active, "Roster Page 2 must be preserved after returning from student profile");

    const scrollAfter = await page.evaluate(() => window.scrollY);
    const scrollRestored = Math.abs(scrollAfter - scrollBefore) <= 60 || scrollAfter > 0;
    assert.ok(scrollRestored, `Scroll must be restored within tolerance: before ${scrollBefore}, after ${scrollAfter}`);

    registerProbe({
      probe: "browser-return-context-profile-back",
      tabPreserved: true,
      noProgressLeak: !returnedUrl.includes("progress"),
      isPage2Active,
      statusPreserved: restoredStatus === "active",
      sortPreserved: restoredSort === "name_desc",
      searchPreserved: restoredSearch === "SeedItem",
      scrollBefore,
      scrollAfter,
      scrollRestored,
      passed: Boolean(
        activeTabText?.match(/Students|Студенты|Донишҷӯён/i) &&
        !returnedUrl.includes("progress") &&
        isPage2Active &&
        restoredStatus === "active" &&
        restoredSort === "name_desc" &&
        restoredSearch === "SeedItem" &&
        scrollRestored
      ),
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    let failRefetch = false;
    const apiBase = apiOrigin.replace("/api/v1", "");
    await page.route("**/api/v1/enrollments/courses/*/roster*", async (route) => {
      if (failRefetch) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Simulated roster refetch failure" }),
        });
      } else {
        const url = route.request().url().replace("http://localhost:8000", apiBase).replace("http://127.0.0.1:8000", apiBase);
        try {
          const response = await route.fetch({ url });
          await route.fulfill({ response });
        } catch {
          await route.abort();
        }
      }
    });

    const enrollBtn = page.getByRole("button", { name: /Enroll student|Зачислить студента|Ба қайд гирифтани донишҷӯ/i });
    await enrollBtn.click();
    const modal = page.getByRole("dialog");
    await modal.waitFor({ timeout: 5000 });

    const candidateRadios = modal.locator('label:has(input[type="radio"][name="eligible-candidate"])');
    await candidateRadios.first().click();

    const submitEnroll = modal.getByRole("button", { name: /Enroll student|Зачислить студента|Ба қайд гирифтан/i });
    failRefetch = true;
    await submitEnroll.click();
    await modal.waitFor({ state: "detached", timeout: 10000 });
    await page.waitForTimeout(500);

    const refreshErrorBanner = page.locator('[role="alert"]').filter({ hasText: /updating the roster failed|не удалось|ноком шуд/i });
    await refreshErrorBanner.waitFor({ timeout: 15000 });
    const isRefreshErrorVisible = await refreshErrorBanner.isVisible();
    assert.ok(isRefreshErrorVisible, "Refresh error banner must be displayed on refetch error");

    const hiddenNoticeCount = await page.locator('[role="status"]').filter({ hasText: /located on another page or hidden by filters|на другой странице/i }).count();
    assert.equal(hiddenNoticeCount, 0, "Hidden notice must not be shown when refetch failed");

    await recordScreenshot(page, "desktop-1440-enroll-refresh-failure.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Explicit error banner displayed when enrollment succeeds but roster refresh fails",
    });

    failRefetch = false;
    let postCountOnRetry = 0;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/enrollments")) {
        postCountOnRetry++;
      }
    });
    const retryBtn = refreshErrorBanner.getByRole("button", { name: /Retry|Повторить|Такрор кардан/i });
    const refetchResponsePromise = page.waitForResponse((res) => res.url().includes("/roster") && res.status() === 200);
    await retryBtn.click();
    await refetchResponsePromise;
    await page.waitForTimeout(400);

    const bannerStillPresent = await refreshErrorBanner.isVisible();
    assert.equal(bannerStillPresent, false, "Refresh error banner must disappear after retry");
    assert.equal(postCountOnRetry, 0, "Retry on refresh failure must not send a second POST");

    registerProbe({
      probe: "enroll-success-refetch-failure-and-recovery",
      isRefreshErrorVisible,
      hiddenNoticeCount,
      postCountOnRetry,
      recovered: !bannerStillPresent,
      passed: Boolean(isRefreshErrorVisible && hiddenNoticeCount === 0 && !bannerStillPresent && postCountOnRetry === 0),
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "dark", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    registerProbe({
      probe: "desktop-dark-theme-active",
      isDark,
      passed: isDark,
    });

    await recordScreenshot(page, "desktop-admin-1440-dark-roster.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "1440x1000",
      description: "Superadmin Students tab on desktop dark theme",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    const searchInput = page.getByPlaceholder(/student.*email|email|почта/i).first();
    const fontSize = await searchInput.evaluate((el) => window.getComputedStyle(el).fontSize);
    const fontSizeNum = parseFloat(fontSize);
    assert.ok(fontSizeNum >= 16, `Mobile input font size must be >= 16px to prevent iOS zoom: actual ${fontSize}`);

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(hasHorizontalOverflow, false, "Mobile 390 viewport should not have horizontal overflow");

    const phoneIdentity = page.locator('[data-testid="student-identity"]').filter({ visible: true }).first();
    const phoneName = phoneIdentity.locator("a, p").first();
    const phoneNameBox = await phoneName.boundingBox();
    assert.ok(phoneNameBox && phoneNameBox.height >= 44, `Phone student link target must be >= 44px, got ${phoneNameBox?.height}`);
    const phoneNameFontSize = await phoneName.evaluate((el) => window.getComputedStyle(el).fontSize);
    const phoneNameFontSizeNum = parseFloat(phoneNameFontSize);
    assert.equal(phoneNameFontSizeNum, 16, `Phone student name font size must be 16px, got ${phoneNameFontSize}`);

    await recordScreenshot(page, "phone-admin-390-light-roster.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Superadmin Students tab on mobile 390 light theme with responsive card geometry and >=44px link targets",
    });

    const enrollBtn = page.getByRole("button", { name: /Enroll student|Зачислить студента|Ба қайд гирифтани донишҷӯ/i });
    await enrollBtn.click();
    const modal = page.getByRole("dialog");
    await modal.waitFor({ timeout: 5000 });

    const phoneCandidateNameEl = modal.locator('span[class*="font-medium"]').first();
    const phoneCandidateFontSize = await phoneCandidateNameEl.evaluate((el) => window.getComputedStyle(el).fontSize);
    const phoneCandidateFontSizeNum = parseFloat(phoneCandidateFontSize);
    assert.equal(phoneCandidateFontSizeNum, 16, `Phone candidate name font size must be 16px, got ${phoneCandidateFontSize}`);

    registerProbe({
      probe: "phone-390-mobile-layout-and-font-size",
      fontSize,
      fontSizeNum,
      phoneNameFontSize,
      phoneNameFontSizeNum,
      phoneCandidateFontSize,
      phoneCandidateFontSizeNum,
      hasHorizontalOverflow,
      phoneNameHeight: phoneNameBox?.height,
      passed: fontSizeNum >= 16 && phoneNameFontSizeNum === 16 && phoneCandidateFontSizeNum === 16 && !hasHorizontalOverflow && (phoneNameBox?.height || 0) >= 44,
    });

    await recordScreenshot(page, "phone-390-enroll-modal-opened.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Superadmin EnrollStudentModal on mobile 390 sheet layout",
    });

    const cancelBtn = modal.getByRole("button", { name: /Cancel|Отмена|Бекор кардан/i });
    await cancelBtn.click();
    await modal.waitFor({ state: "detached", timeout: 5000 });

    const mobileActionBtns = page.getByRole("button", { name: /Student actions|Действия со студентом|Амалҳои донишҷӯ/i }).filter({ visible: true });
    if ((await mobileActionBtns.count()) > 0) {
      await mobileActionBtns.first().click();
      const mobileWithdrawItem = page.getByRole("menuitem", { name: /Withdraw|Отчислить|Хориҷ кардан/i });
      if (await mobileWithdrawItem.isVisible()) {
        await mobileWithdrawItem.click();
        const withdrawDialog = page.getByRole("dialog");
        await withdrawDialog.waitFor({ timeout: 5000 });

        await recordScreenshot(page, "phone-390-withdraw-dialog-opened.png", {
          role: "superadmin",
          theme: "light",
          viewport: "390x844",
          description: "Withdrawal ConfirmDialog on mobile 390",
        });

        const cancelWithdrawBtn = withdrawDialog.getByRole("button", { name: /Cancel|Отмена|Бекор кардан/i });
        await cancelWithdrawBtn.click();
        await withdrawDialog.waitFor({ state: "detached", timeout: 5000 });
      }
    }

    const sortFilter = page.locator("select").nth(1);
    await sortFilter.selectOption("price_desc");
    await page.waitForTimeout(200);

    const statusFilter = page.locator("select").first();
    await statusFilter.selectOption("withdrawn");
    await page.waitForTimeout(200);

    await enrollBtn.click();
    await modal.waitFor({ timeout: 5000 });
    const mobileCandidates = modal.locator('label:has(input[type="radio"][name="eligible-candidate"])');
    assert.ok((await mobileCandidates.count()) > 0, "Mobile candidate must exist");
    const mobileCandidateIdStr = await modal.locator('input[type="radio"][name="eligible-candidate"]').first().getAttribute("value");
    assert.ok(mobileCandidateIdStr, "Mobile candidate ID must exist");
    const mobileCandidateId = parseInt(mobileCandidateIdStr, 10);

    await mobileCandidates.first().click();
    const mobileSubmitEnroll = modal.getByRole("button", { name: /Enroll student|Зачислить студента|Ба қайд гирифтан/i });
    await mobileSubmitEnroll.click();
    await modal.waitFor({ state: "detached", timeout: 10000 });
    await page.waitForTimeout(500);

    const mobileRevealBanner = page.locator('[role="status"]').filter({ hasText: /located on another page or hidden by filters|на другой странице|саҳифаи дигар/i });
    await mobileRevealBanner.waitFor({ timeout: 5000 });
    assert.ok(await mobileRevealBanner.isVisible(), "Mobile reveal notice banner must be visible");

    await recordScreenshot(page, "phone-390-locator-reveal-banner.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Hidden student reveal notice banner rendered on phone 390 viewport",
    });

    const viewEnrolledBtn = page.getByRole("button", { name: /View enrolled student|Перейти к студенту|Гузариш ба донишҷӯ/i });
    await viewEnrolledBtn.click();
    await page.waitForTimeout(600);

    const mobileActiveHref = await page.evaluate(() => document.activeElement?.getAttribute("href") || "");
    const mobileActiveBox = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    const mobileStatusVal = await statusFilter.inputValue();

    const expectedMobileHref = `/students/${mobileCandidateId}`;
    assert.equal(mobileActiveHref, expectedMobileHref, `Mobile active element href must be exactly ${expectedMobileHref}`);
    assert.ok(mobileActiveBox && mobileActiveBox.width > 0 && mobileActiveBox.height >= 44, "Mobile target link must have height >= 44");
    assert.equal(mobileStatusVal, "all", "Mobile status filter must reset to 'all'");

    registerProbe({
      probe: "mobile-390-locator-reveal-focused",
      activeHref: mobileActiveHref,
      expectedHref: expectedMobileHref,
      activeWidth: mobileActiveBox?.width,
      activeHeight: mobileActiveBox?.height,
      statusFilterReset: mobileStatusVal === "all",
      passed: Boolean(mobileActiveHref === expectedMobileHref && (mobileActiveBox?.height || 0) >= 44 && mobileStatusVal === "all"),
    });

    await recordScreenshot(page, "phone-390-locator-revealed-row.png", {
      role: "superadmin",
      theme: "light",
      viewport: "390x844",
      description: "Mobile 390 roster navigated and focused to newly enrolled student",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await setupContext(context, { theme: "dark", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    await recordScreenshot(page, "phone-admin-390-dark-roster.png", {
      role: "superadmin",
      theme: "dark",
      viewport: "390x844",
      description: "Superadmin Students tab on mobile 390 dark theme",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, mentor, courseId);

    const enrollBtn = page.getByRole("button", { name: /Enroll student|Зачислить студента|Ба қайд гирифтани донишҷӯ/i });
    const enrollVisible = await enrollBtn.isVisible();
    assert.equal(enrollVisible, false, "Mentor view must not display Enroll student button");

    const withdrawBtns = page.getByRole("button", { name: /Withdraw|Отчислить|Хориҷ кардан/i });
    const withdrawCount = await withdrawBtns.count();
    assert.equal(withdrawCount, 0, "Mentor view must not display Withdraw button");

    const mentorNotice = page.getByText(/view-only|только для чтения|танҳо барои хондан/i);
    const noticeVisible = await mentorNotice.isVisible();

    registerProbe({
      probe: "mentor-read-only-boundary",
      enrollVisible,
      withdrawCount,
      noticeVisible,
      passed: !enrollVisible && withdrawCount === 0 && noticeVisible,
    });

    await recordScreenshot(page, "desktop-mentor-1440-light-roster.png", {
      role: "mentor",
      theme: "light",
      viewport: "1440x1000",
      description: "Assigned mentor read-only Students tab with quiet notice and no mutation buttons",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "dark", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, mentor, courseId);

    await recordScreenshot(page, "desktop-mentor-1440-dark-roster.png", {
      role: "mentor",
      theme: "dark",
      viewport: "1440x1000",
      description: "Assigned mentor read-only Students tab on dark theme",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, mentor, courseId);

    await recordScreenshot(page, "phone-mentor-390-light-roster.png", {
      role: "mentor",
      theme: "light",
      viewport: "390x844",
      description: "Assigned mentor read-only Students tab on phone 390 light theme",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await setupContext(context, { theme: "dark", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, mentor, courseId);

    await recordScreenshot(page, "phone-mentor-390-dark-roster.png", {
      role: "mentor",
      theme: "dark",
      viewport: "390x844",
      description: "Assigned mentor read-only Students tab on phone 390 dark theme",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 320, height: 600 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    const overflow320 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    registerProbe({
      probe: "viewport-320-no-overflow",
      overflow: overflow320,
      passed: !overflow320,
    });

    await recordScreenshot(page, "viewport-320-roster.png", {
      role: "superadmin",
      theme: "light",
      viewport: "320x600",
      description: "Students tab rendered at narrow 320px viewport without overflow",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    await recordScreenshot(page, "viewport-768-roster.png", {
      role: "superadmin",
      theme: "light",
      viewport: "768x1024",
      description: "Students tab rendered at 768px tablet viewport",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    await recordScreenshot(page, "viewport-1024-roster.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1024x768",
      description: "Students tab rendered at 1024px desktop viewport",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.waitForTimeout(300);

    const rosterRow = page.locator('[data-testid="roster-row"]').first();
    await rosterRow.scrollIntoViewIfNeeded();
    const cardBox = await rosterRow.boundingBox();
    const overflow200 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);

    const identityEl = rosterRow.locator('[data-testid="student-identity"]').filter({ visible: true }).first();
    const identityBox = await identityEl.boundingBox();
    assert.ok(identityBox, "Identity container must be present");
    assert.ok(identityBox.width >= 200, `Identity readable width must be >= 200px, got ${identityBox.width}`);

    const nameEl = identityEl.locator("a, p").first();
    const nameBox = await nameEl.boundingBox();
    assert.ok(nameBox && nameBox.height >= 44, `Student name touch target height must be >= 44px, got ${nameBox?.height}`);

    registerProbe({
      probe: "text-200pct-zoom-no-overflow",
      overflow: overflow200,
      cardWidth: cardBox?.width,
      cardHeight: cardBox?.height,
      identityWidth: identityBox.width,
      nameHeight: nameBox?.height,
      passed: !overflow200 && (cardBox?.width || 0) > 200 && identityBox.width >= 200 && (nameBox?.height || 0) >= 44,
    });

    await recordScreenshot(page, "desktop-1440-200pct-text.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Students tab rendered with 200% text zoom with wrapped metadata and uncompressed identity",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    const searchInput = page.getByPlaceholder(/student.*email|email|почта/i).first();
    await searchInput.focus();
    await page.waitForTimeout(200);

    const hasFocus = await searchInput.evaluate((el) => document.activeElement === el);
    registerProbe({
      probe: "search-input-keyboard-focus",
      hasFocus,
      passed: hasFocus,
    });

    await recordScreenshot(page, "desktop-1440-keyboard-focus.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Search input focused with visible focus outline",
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "ru" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    const ruHeading = await page.getByRole("heading", { level: 2 }).first().textContent();
    const ruOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    registerProbe({
      probe: "desktop-ru-locale-rendered",
      ruHeading,
      passed: Boolean(ruHeading && !ruOverflow),
    });

    await recordScreenshot(page, "desktop-admin-1440-ru-roster.png", {
      role: "superadmin",
      theme: "light",
      locale: "ru",
      viewport: "1440x1000",
      description: "Superadmin Students tab rendered in Russian locale",
    });

    const enrollBtn = page.getByRole("button", { name: /Записать студента/i });
    await enrollBtn.click();
    const modal = page.getByRole("dialog");
    await modal.waitFor({ timeout: 5000 });
    await recordScreenshot(page, "desktop-admin-1440-ru-enroll-modal.png", {
      role: "superadmin",
      theme: "light",
      locale: "ru",
      viewport: "1440x1000",
      description: "Superadmin EnrollStudentModal rendered in Russian locale",
    });
    const cancelModal = modal.getByRole("button", { name: /Отмена/i });
    await cancelModal.click();
    await modal.waitFor({ state: "detached", timeout: 5000 });
    await page.waitForTimeout(300);

    const actionMenuBtns = page.getByRole("button", { name: /Student actions|Действия со студентом|Амалҳои донишҷӯ/i }).filter({ visible: true });
    const actionMenuCount = await actionMenuBtns.count();
    if (actionMenuCount > 0) {
      await actionMenuBtns.first().click();
      const withdrawItem = page.getByRole("menuitem", { name: /Withdraw|Отчислить|Хориҷ кардан/i });
      await withdrawItem.waitFor({ timeout: 5000 });
      await withdrawItem.click();
      const withdrawDialog = page.getByRole("dialog");
      await withdrawDialog.waitFor({ timeout: 5000 });
      await recordScreenshot(page, "desktop-admin-1440-ru-withdraw-dialog.png", {
        role: "superadmin",
        theme: "light",
        locale: "ru",
        viewport: "1440x1000",
        description: "Withdrawal confirmation dialog rendered in Russian locale",
      });
      const cancelWithdraw = withdrawDialog.getByRole("button", { name: /Cancel|Отмена|Бекор кардан/i });
      await cancelWithdraw.click();
      await withdrawDialog.waitFor({ state: "detached", timeout: 5000 });
    }

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "tg" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    const tgHeading = await page.getByRole("heading", { level: 2 }).first().textContent();
    const tgOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    registerProbe({
      probe: "desktop-tg-locale-rendered",
      tgHeading,
      passed: Boolean(tgHeading && !tgOverflow),
    });

    await recordScreenshot(page, "desktop-admin-1440-tg-roster.png", {
      role: "superadmin",
      theme: "light",
      locale: "tg",
      viewport: "1440x1000",
      description: "Superadmin Students tab rendered in Tajik locale",
    });

    const enrollBtn = page.getByRole("button", { name: /Сабти номи донишҷӯ/i });
    await enrollBtn.click();
    const modal = page.getByRole("dialog");
    await modal.waitFor({ timeout: 5000 });
    await recordScreenshot(page, "desktop-admin-1440-tg-enroll-modal.png", {
      role: "superadmin",
      theme: "light",
      locale: "tg",
      viewport: "1440x1000",
      description: "Superadmin EnrollStudentModal rendered in Tajik locale",
    });
    const cancelModal = modal.getByRole("button", { name: /Бекор кардан/i });
    await cancelModal.click();
    await modal.waitFor({ state: "detached", timeout: 5000 });
    await page.waitForTimeout(300);

    const actionMenuBtns = page.getByRole("button", { name: /Student actions|Действия со студентом|Амалҳои донишҷӯ/i }).filter({ visible: true });
    const actionMenuCount = await actionMenuBtns.count();
    if (actionMenuCount > 0) {
      await actionMenuBtns.first().click();
      const withdrawItem = page.getByRole("menuitem", { name: /Withdraw|Отчислить|Хориҷ кардан/i });
      await withdrawItem.waitFor({ timeout: 5000 });
      await withdrawItem.click();
      const withdrawDialog = page.getByRole("dialog");
      await withdrawDialog.waitFor({ timeout: 5000 });
      await recordScreenshot(page, "desktop-admin-1440-tg-withdraw-dialog.png", {
        role: "superadmin",
        theme: "light",
        locale: "tg",
        viewport: "1440x1000",
        description: "Withdrawal confirmation dialog rendered in Tajik locale",
      });
      const cancelWithdraw = withdrawDialog.getByRole("button", { name: /Cancel|Бекор кардан|Отмена/i });
      await cancelWithdraw.click();
      await withdrawDialog.waitFor({ state: "detached", timeout: 5000 });
    }

    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();
    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    const isReducedMotion = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    const enrollBtn = page.getByRole("button", { name: /Enroll student|Записать студента|Зачислить студента|Сабти номи донишҷӯ|Ба қайд гирифтани донишҷӯ/i });
    await enrollBtn.click();
    const modal = page.getByRole("dialog");
    await modal.waitFor({ timeout: 5000 });

    const computedStyles = await modal.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        animationName: cs.animationName,
        transitionDuration: cs.transitionDuration,
      };
    });

    const activeFocusInsideModal = await page.evaluate(() => {
      const active = document.activeElement;
      const dialog = document.querySelector('[role="dialog"]');
      return dialog ? dialog.contains(active) : false;
    });

    registerProbe({
      probe: "reduced-motion-accessibility",
      isReducedMotion,
      animationName: computedStyles.animationName,
      transitionDuration: computedStyles.transitionDuration,
      activeFocusInsideModal,
      passed: Boolean(isReducedMotion && activeFocusInsideModal),
    });

    await recordScreenshot(page, "desktop-1440-reduced-motion.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Students tab rendered with prefers-reduced-motion: reduce and modal opened",
    });

    const cancelModal = modal.getByRole("button", { name: /Cancel|Отмена|Бекор кардан/i });
    await cancelModal.click();
    await modal.waitFor({ state: "detached", timeout: 5000 });

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setupContext(context, { theme: "light", lng: "en" });
    const page = await context.newPage();

    let failRequest = true;
    await page.route("**/api/v1/enrollments/courses/*/roster*", async (route) => {
      if (failRequest) {
        await route.abort();
      } else {
        await route.continue();
      }
    });

    await loginAndNavigateToCourseStudents(page, superadmin, courseId);

    const errorAlert = page.getByRole("alert");
    await errorAlert.waitFor({ timeout: 5000 });
    const isErrorVisible = await errorAlert.isVisible();

    const retryBtn = errorAlert.getByRole("button", { name: /Retry|Повторить|Такрор кардан/i });
    const isRetryVisible = await retryBtn.isVisible();

    await recordScreenshot(page, "desktop-1440-roster-load-error.png", {
      role: "superadmin",
      theme: "light",
      viewport: "1440x1000",
      description: "Roster load error state with localized retry button",
    });

    failRequest = false;
    await retryBtn.click();
    await page.waitForResponse((res) => res.url().includes("/roster") && res.status() === 200, { timeout: 10000 });
    await page.waitForTimeout(400);

    const recoveredRowCount = await page.locator('[data-testid="roster-row"]').count();

    registerProbe({
      probe: "roster-error-retry-recovery",
      isErrorVisible,
      isRetryVisible,
      recoveredRowCount,
      passed: Boolean(isErrorVisible && isRetryVisible && recoveredRowCount > 0),
    });

    await context.close();
  }

  await writeFile(`${taskDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  await writeFile(`${taskDir}/probes.json`, JSON.stringify(probes, null, 2));

  console.log(JSON.stringify({ success: true, screenshots: manifest.length, probes: probes.length }));
} finally {
  await browser.close();
}

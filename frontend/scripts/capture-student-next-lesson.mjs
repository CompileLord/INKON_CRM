import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const fixtures = JSON.parse(input);

const taskDir = resolve("../docs/redesign-execution/group-01/task-09");
const attemptDir = resolve("../docs/redesign-execution/group-01/task-09/attempt4");
const outputDir = resolve("../docs/redesign-execution/group-01/task-09/screenshots");
const attemptOutputDir = resolve("../docs/redesign-execution/group-01/task-09/attempt4/screenshots");

await mkdir(taskDir, { recursive: true });
await mkdir(attemptDir, { recursive: true });
await mkdir(outputDir, { recursive: true });
await mkdir(attemptOutputDir, { recursive: true });

const student = fixtures.identities.find((item) => item.role === "student" && !item.forced);
const mentor = fixtures.identities.find((item) => item.role === "mentor" && !item.forced);
const superadmin = fixtures.identities.find((item) => item.role === "superadmin" && !item.forced);
const otherStudent = fixtures.identities.find((item) => item.role === "student" && item.email.includes("zara"));
const secondMentor = fixtures.identities.find((item) => item.role === "mentor" && item.email.includes("second.mentor"));

assert.ok(student, "Student fixture identity must be present");
assert.ok(mentor, "Mentor fixture identity must be present");
assert.ok(superadmin, "Superadmin fixture identity must be present");
assert.ok(otherStudent, "Other student fixture identity must be present");
assert.ok(secondMentor, "Second mentor fixture identity must be present");

const browser = await chromium.launch({ channel: "chrome", chromiumSandbox: true });
const probes = [];
const manifest = [];
const pageErrors = [];
const unexpectedHttpErrors = [];

function formatExpectedSchoolDateTime(isoDateString, lng = "ru") {
  const d = new Date(isoDateString);
  const localeMap = { ru: "ru-RU", en: "en-US", tg: "tg-TJ" };
  const locale = localeMap[lng] || "ru-RU";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dushanbe",
  }).format(d);
}

async function recordScreenshot(page, filename, meta = {}) {
  const filePath = `${outputDir}/${filename}`;
  const attemptFilePath = `${attemptOutputDir}/${filename}`;
  await page.screenshot({ path: filePath, fullPage: meta.mode === "extreme-wrapping" });
  await page.screenshot({ path: attemptFilePath, fullPage: meta.mode === "extreme-wrapping" });
  manifest.push({ file: filename, ...meta });
}

async function setupContext(context, options = {}) {
  await context.route("http://localhost:8000/api/v1/**", async (route) => {
    const url = route.request().url().replace("http://localhost:8000", "http://127.0.0.1:18080");
    try {
      const response = await route.fetch({ url });
      await route.fulfill({ response });
    } catch {
      await route.abort();
    }
  });

  if (options.lng) {
    await context.addInitScript((l) => localStorage.setItem("i18nextLng", l), options.lng);
  } else {
    await context.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  }

  if (options.theme) {
    await context.addInitScript((th) => localStorage.setItem("imkon_theme", th), options.theme);
  } else {
    await context.addInitScript(() => localStorage.setItem("imkon_theme", "light"));
  }
}

async function loginAsStudent(page, allowedErrorUrls = []) {
  page.on("pageerror", (err) => {
    console.error("PAGE ERROR:", err.message);
    pageErrors.push(err.message);
  });

  page.on("response", (res) => {
    if (res.status() >= 400) {
      const url = res.url();
      const isAllowed = allowedErrorUrls.some((pattern) => url.includes(pattern));
      if (!isAllowed) {
        console.error("UNEXPECTED HTTP ERROR:", res.status(), url);
        unexpectedHttpErrors.push({ status: res.status(), url });
      }
    }
  });

  await page.goto("http://127.0.0.1:5174/login?redirect=/");
  await page.locator("#email").fill(student.email);
  await page.locator("#password").fill(fixtures.password);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/my/courses", { timeout: 10000 });
  if (new URL(page.url()).pathname !== "/") {
    await page.goto("http://127.0.0.1:5174/");
  }
}

async function getBearerToken(email, password) {
  const loginRes = await fetch("http://127.0.0.1:18080/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(loginRes.status, 200, `Login failed for ${email}`);
  const data = await loginRes.json();
  return data.access_token;
}

try {
  const studentToken = await getBearerToken(student.email, fixtures.password);
  const profileRes = await fetch("http://127.0.0.1:18080/api/v1/students/me/profile", {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert.equal(profileRes.status, 200);
  const profileData = await profileRes.json();

  const courses = profileData.courses;
  assert.ok(courses && courses.length > 0, "Student must have enrolled courses");

  const activeCourses = courses.filter((c) => c.bucket === "active");
  const archivedCourses = courses.filter((c) => c.bucket === "archive");

  assert.ok(activeCourses.length > 0, "Student must have active courses");

  const activeWithLesson = activeCourses.filter((c) => c.next_lesson_at !== null);
  const activeWithoutLesson = activeCourses.filter((c) => c.next_lesson_at === null);

  assert.ok(activeWithLesson.length >= 1, "Must have active courses with upcoming lesson");
  assert.ok(activeWithoutLesson.length >= 1, "Must have active courses with null next_lesson_at (dated-expired or no-schedule)");

  const activeExpiredCourse = courses.find((c) => c.course.title === "Active Expired Course");
  assert.ok(activeExpiredCourse, "Active Expired Course fixture must be present in profile");
  assert.equal(activeExpiredCourse.bucket, "active", "Active Expired Course must retain bucket active");
  assert.equal(activeExpiredCourse.next_lesson_at, null, "Active Expired Course must have next_lesson_at null");

  const archivedCourse = courses.find((c) => c.course.title === "Archived Foundation");
  assert.ok(archivedCourse, "Archived Foundation fixture must be present in profile");
  assert.equal(archivedCourse.bucket, "archive", "Archived Foundation must have bucket archive");
  assert.equal(archivedCourse.next_lesson_at, null, "Archived Foundation must have next_lesson_at null");

  const noScheduleCourse = courses.find((c) => c.course.title === "No Schedule Active Course");
  assert.ok(noScheduleCourse, "No Schedule Active Course fixture must be present in profile");
  assert.equal(noScheduleCourse.bucket, "active", "No Schedule Active Course must have bucket active");
  assert.equal(noScheduleCourse.next_lesson_at, null, "No Schedule Active Course must have next_lesson_at null");

  for (const ac of activeWithLesson) {
    const lessonDate = new Date(ac.next_lesson_at);
    assert.ok(!isNaN(lessonDate.getTime()), "next_lesson_at must be valid ISO date");
    assert.ok(lessonDate.getTime() > Date.now(), "next_lesson_at must be strictly in the future");

    const lessonLocalDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dushanbe" }).format(lessonDate);
    assert.ok(lessonLocalDateStr >= ac.course.start_date, `Lesson date ${lessonLocalDateStr} must be on or after start_date ${ac.course.start_date}`);
    assert.ok(lessonLocalDateStr <= ac.course.end_date, `Lesson date ${lessonLocalDateStr} must be on or before end_date ${ac.course.end_date}`);
  }

  for (const arc of archivedCourses) {
    assert.equal(arc.next_lesson_at, null, `Archived course ${arc.course.title} must have next_lesson_at null`);
  }

  const soonestLessonCourse = [...activeWithLesson].sort(
    (a, b) => new Date(a.next_lesson_at).getTime() - new Date(b.next_lesson_at).getTime()
  )[0];
  assert.ok(soonestLessonCourse, "Must have an earliest eligible active course");

  probes.push({ test: "api-profile-next-lesson-correctness", status: "pass" });

  const otherToken = await getBearerToken(otherStudent.email, fixtures.password);
  const crossStudentRes = await fetch(`http://127.0.0.1:18080/api/v1/students/${student.id}/profile`, {
    headers: { Authorization: `Bearer ${otherToken}` },
  });
  assert.equal(crossStudentRes.status, 403, "Other student must be denied access to student profile");

  const secondMentorToken = await getBearerToken(secondMentor.email, fixtures.password);
  const unassignedRes = await fetch(`http://127.0.0.1:18080/api/v1/students/${student.id}/profile`, {
    headers: { Authorization: `Bearer ${secondMentorToken}` },
  });
  assert.equal(unassignedRes.status, 403, "Unassigned mentor must be denied access to student profile");

  const superadminToken = await getBearerToken(superadmin.email, fixtures.password);
  const superadminProfileRes = await fetch(`http://127.0.0.1:18080/api/v1/students/${student.id}/profile`, {
    headers: { Authorization: `Bearer ${superadminToken}` },
  });
  assert.equal(superadminProfileRes.status, 200);
  const superadminData = await superadminProfileRes.json();
  const superadminActiveWithLesson = superadminData.courses.find((c) => c.course.id === soonestLessonCourse.course.id);
  assert.equal(
    superadminActiveWithLesson.next_lesson_at,
    soonestLessonCourse.next_lesson_at,
    "Superadmin must receive identical next_lesson_at instant"
  );

  const mentorToken = await getBearerToken(mentor.email, fixtures.password);
  const mentorProfileRes = await fetch(`http://127.0.0.1:18080/api/v1/students/${student.id}/profile`, {
    headers: { Authorization: `Bearer ${mentorToken}` },
  });
  assert.equal(mentorProfileRes.status, 200);
  const mentorData = await mentorProfileRes.json();
  const mentorActiveWithLesson = mentorData.courses.find((c) => c.course.id === soonestLessonCourse.course.id);
  assert.equal(
    mentorActiveWithLesson.next_lesson_at,
    soonestLessonCourse.next_lesson_at,
    "Assigned mentor must receive identical next_lesson_at instant"
  );

  probes.push({ test: "api-profile-authorization-guards", status: "pass" });

  const expectedRuFormatted = formatExpectedSchoolDateTime(soonestLessonCourse.next_lesson_at, "ru");

  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
  });
  await setupContext(desktopContext, { theme: "light", lng: "ru" });
  const desktopPage = await desktopContext.newPage();
  await loginAsStudent(desktopPage);
  await desktopPage.locator('h2:has-text("Student Fixture")').waitFor({ timeout: 10000 });
  await desktopPage.locator('span:has-text("Следующее занятие")').waitFor({ timeout: 10000 });

  const desktopTitle = (await desktopPage.locator('h4.text-sm.font-semibold.text-ink').first().innerText()).trim();
  assert.equal(desktopTitle, soonestLessonCourse.course.title, "Desktop light rendered card title must match earliest eligible course title");

  const desktopRendered = (await desktopPage.locator('div:has(> svg.lucide-calendar)').innerText()).trim();
  assert.equal(desktopRendered, expectedRuFormatted, "Desktop light rendered date/time must match school Asia/Dushanbe instant");

  await recordScreenshot(desktopPage, "student-dashboard-desktop-1440x1000-light.png", {
    viewport: "1440x1000",
    theme: "light",
    locale: "ru",
  });
  probes.push({ test: "student-dashboard-desktop-1440x1000-light", status: "pass" });
  await desktopContext.close();

  const desktopDarkContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
  });
  await setupContext(desktopDarkContext, { theme: "dark", lng: "ru" });
  const desktopDarkPage = await desktopDarkContext.newPage();
  await loginAsStudent(desktopDarkPage);
  await desktopDarkPage.locator('span:has-text("Следующее занятие")').waitFor({ timeout: 10000 });

  const darkTitle = (await desktopDarkPage.locator('h4.text-sm.font-semibold.text-ink').first().innerText()).trim();
  assert.equal(darkTitle, soonestLessonCourse.course.title, "Desktop dark rendered card title must match earliest eligible course title");

  const darkRendered = (await desktopDarkPage.locator('div:has(> svg.lucide-calendar)').innerText()).trim();
  assert.equal(darkRendered, expectedRuFormatted, "Desktop dark rendered date/time must match school Asia/Dushanbe instant");

  await recordScreenshot(desktopDarkPage, "student-dashboard-desktop-1440x1000-dark.png", {
    viewport: "1440x1000",
    theme: "dark",
    locale: "ru",
  });
  probes.push({ test: "student-dashboard-desktop-1440x1000-dark", status: "pass" });
  await desktopDarkContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
  });
  await setupContext(mobileContext, { theme: "light", lng: "ru" });
  const mobilePage = await mobileContext.newPage();
  await loginAsStudent(mobilePage);
  await mobilePage.locator('span:has-text("Следующее занятие")').waitFor({ timeout: 10000 });

  const mobileTitle = (await mobilePage.locator('h4.text-sm.font-semibold.text-ink').first().innerText()).trim();
  assert.equal(mobileTitle, soonestLessonCourse.course.title, "Mobile light rendered card title must match earliest eligible course title");

  const mobileRendered = (await mobilePage.locator('div:has(> svg.lucide-calendar)').innerText()).trim();
  assert.equal(mobileRendered, expectedRuFormatted, "Mobile light rendered date/time must match school Asia/Dushanbe instant");

  await recordScreenshot(mobilePage, "student-dashboard-mobile-390x844-light.png", {
    viewport: "390x844",
    theme: "light",
    locale: "ru",
  });
  probes.push({ test: "student-dashboard-mobile-390x844-light", status: "pass" });
  await mobileContext.close();

  const mobileDarkContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
  });
  await setupContext(mobileDarkContext, { theme: "dark", lng: "ru" });
  const mobileDarkPage = await mobileDarkContext.newPage();
  await loginAsStudent(mobileDarkPage);
  await mobileDarkPage.locator('span:has-text("Следующее занятие")').waitFor({ timeout: 10000 });

  const mobileDarkTitle = (await mobileDarkPage.locator('h4.text-sm.font-semibold.text-ink').first().innerText()).trim();
  assert.equal(mobileDarkTitle, soonestLessonCourse.course.title, "Mobile dark rendered card title must match earliest eligible course title");

  const mobileDarkRendered = (await mobileDarkPage.locator('div:has(> svg.lucide-calendar)').innerText()).trim();
  assert.equal(mobileDarkRendered, expectedRuFormatted, "Mobile dark rendered date/time must match school Asia/Dushanbe instant");

  await recordScreenshot(mobileDarkPage, "student-dashboard-mobile-390x844-dark.png", {
    viewport: "390x844",
    theme: "dark",
    locale: "ru",
  });
  probes.push({ test: "student-dashboard-mobile-390x844-dark", status: "pass" });
  await mobileDarkContext.close();

  for (const lng of ["en", "tg"]) {
    const lngContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await setupContext(lngContext, { theme: "light", lng });
    const lngPage = await lngContext.newPage();
    await loginAsStudent(lngPage);
    await lngPage.locator("div.tabular-nums").first().waitFor({ timeout: 10000 });

    const lngTitle = (await lngPage.locator('h4.text-sm.font-semibold.text-ink').first().innerText()).trim();
    assert.equal(lngTitle, soonestLessonCourse.course.title, `Desktop ${lng} rendered card title must match earliest eligible course title`);

    const expectedLngFormatted = await lngPage.evaluate(
      ({ dateStr, targetLng }) => {
        const localeMap = { ru: "ru-RU", en: "en-US", tg: "tg-TJ" };
        return new Intl.DateTimeFormat(localeMap[targetLng] || "ru-RU", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Dushanbe",
        }).format(new Date(dateStr));
      },
      { dateStr: soonestLessonCourse.next_lesson_at, targetLng: lng }
    );
    const lngRendered = (await lngPage.locator('div:has(> svg.lucide-calendar)').innerText()).trim();
    assert.equal(lngRendered, expectedLngFormatted, `Desktop ${lng} rendered date/time must match school Asia/Dushanbe instant`);

    await recordScreenshot(lngPage, `student-dashboard-desktop-1440x1000-${lng}.png`, {
      viewport: "1440x1000",
      theme: "light",
      locale: lng,
    });
    probes.push({ test: `student-dashboard-desktop-1440x1000-${lng}`, status: "pass" });
    await lngContext.close();
  }

  const nyContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    timezoneId: "America/New_York",
  });
  await setupContext(nyContext, { theme: "light", lng: "ru" });
  const nyPage = await nyContext.newPage();
  await loginAsStudent(nyPage);
  await nyPage.locator('span:has-text("Следующее занятие")').waitFor({ timeout: 10000 });

  const nyTitle = (await nyPage.locator('h4.text-sm.font-semibold.text-ink').first().innerText()).trim();
  assert.equal(nyTitle, soonestLessonCourse.course.title, "New York rendered card title must match earliest eligible course title");

  const nyDateText = (await nyPage.locator('div:has(> svg.lucide-calendar)').innerText()).trim();
  assert.equal(
    nyDateText,
    expectedRuFormatted,
    `Lesson time in America/New_York browser must exactly match school Asia/Dushanbe local time: expected ${expectedRuFormatted}, got ${nyDateText}`
  );

  await recordScreenshot(nyPage, "student-dashboard-simulated-client-tz-new-york.png", {
    viewport: "1440x1000",
    theme: "light",
    locale: "ru",
    mode: "simulated-client-tz-new-york",
  });
  probes.push({ test: "student-dashboard-simulated-client-tz-new-york", status: "pass" });
  await nyContext.close();

  const utcContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    timezoneId: "UTC",
  });
  await setupContext(utcContext, { theme: "light", lng: "ru" });
  const utcPage = await utcContext.newPage();
  await loginAsStudent(utcPage);
  await utcPage.locator('span:has-text("Следующее занятие")').waitFor({ timeout: 10000 });

  const utcTitle = (await utcPage.locator('h4.text-sm.font-semibold.text-ink').first().innerText()).trim();
  assert.equal(utcTitle, soonestLessonCourse.course.title, "UTC rendered card title must match earliest eligible course title");

  const utcDateText = (await utcPage.locator('div:has(> svg.lucide-calendar)').innerText()).trim();
  assert.equal(
    utcDateText,
    expectedRuFormatted,
    `Lesson time in UTC browser must exactly match school Asia/Dushanbe local time: expected ${expectedRuFormatted}, got ${utcDateText}`
  );

  await recordScreenshot(utcPage, "student-dashboard-simulated-client-tz-utc.png", {
    viewport: "1440x1000",
    theme: "light",
    locale: "ru",
    mode: "simulated-client-tz-utc",
  });
  probes.push({ test: "student-dashboard-simulated-client-tz-utc", status: "pass" });
  await utcContext.close();

  const kbContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
  });
  await setupContext(kbContext, { theme: "light", lng: "ru" });
  const kbPage = await kbContext.newPage();
  await loginAsStudent(kbPage);
  await kbPage.locator('span:has-text("Следующее занятие")').waitFor({ timeout: 10000 });

  for (let i = 0; i < 6; i++) {
    await kbPage.keyboard.press("Tab");
  }

  const focusedElement = await kbPage.evaluate(() => {
    const el = document.activeElement;
    return el && el !== document.body ? el.tagName : null;
  });
  assert.ok(focusedElement, "Keyboard tab navigation must focus an interactive element");

  await recordScreenshot(kbPage, "student-dashboard-controls-keyboard-focus.png", {
    viewport: "1440x1000",
    theme: "light",
    mode: "keyboard-focus",
  });
  probes.push({ test: "student-dashboard-controls-keyboard-focus", status: "pass" });
  await kbContext.close();

} finally {
  await browser.close();
}

assert.equal(unexpectedHttpErrors.length, 0, `Captured unexpected HTTP errors: ${JSON.stringify(unexpectedHttpErrors)}`);
assert.equal(pageErrors.length, 0, `Captured unexpected page errors: ${pageErrors.join("; ")}`);

const probesJson = JSON.stringify(probes, null, 2);
const manifestJson = JSON.stringify(manifest, null, 2);

await writeFile(`${taskDir}/probes.json`, probesJson);
await writeFile(`${taskDir}/manifest.json`, manifestJson);
await writeFile(`${attemptDir}/probes.json`, probesJson);
await writeFile(`${attemptDir}/manifest.json`, manifestJson);

console.log(`Successfully verified ${probes.length} probes and recorded ${manifest.length} screenshots.`);

export interface CourseListReturnContext {
  pathname: "/courses";
  search: string;
  scrollY: number;
  timestamp: number;
}

const SCROLL_STORAGE_PREFIX = "kitob_course_list_scroll:";
const LAST_VALID_URL_KEY = "kitob_course_list_last_url";

export function isValidCourseListOrigin(path: unknown): boolean {
  if (typeof path !== "string") return false;
  const trimmed = path.trim();
  if (
    trimmed.startsWith("//") ||
    trimmed.includes("://") ||
    trimmed.includes("\\") ||
    trimmed.includes("/../") ||
    trimmed.includes("/..")
  ) {
    return false;
  }
  const cleanPath = trimmed.split("?")[0].split("#")[0];
  return cleanPath === "/courses";
}

export function parseSafePageParam(rawPage: unknown): number {
  if (typeof rawPage !== "string") return 1;
  const trimmed = rawPage.trim();
  if (!/^\d+$/.test(trimmed)) return 1;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

export function validateAndSanitizeCourseListSearch(search: unknown): string {
  if (typeof search !== "string" && !(search instanceof URLSearchParams)) return "";
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : new URLSearchParams(search);

  const cleanParams = new URLSearchParams();

  const status = params.get("status");
  if (status === "active" || status === "archived") {
    cleanParams.set("status", status);
  }

  const pageStr = params.get("page");
  if (pageStr) {
    const pageNum = parseSafePageParam(pageStr);
    if (pageNum > 1) {
      cleanParams.set("page", String(pageNum));
    }
  }

  const q = params.get("q");
  if (q) {
    const cleanQ = q.replace(/[\r\n\0]/g, "").trim();
    if (cleanQ.length > 0) {
      cleanParams.set("q", cleanQ);
    }
  }

  const sort = params.get("sort");
  if (sort === "price") {
    cleanParams.set("sort", sort);
  }

  const view = params.get("view");
  if (view === "list" || view === "grid") {
    cleanParams.set("view", view);
  }

  const queryString = cleanParams.toString();
  return queryString ? `?${queryString}` : "";
}

export function buildValidatedCourseListUrl(rawSearch: unknown): string {
  const cleanSearch = validateAndSanitizeCourseListSearch(rawSearch);
  return `/courses${cleanSearch}`;
}

export function getStorageKeyForListUrl(listUrl: string): string {
  return `${SCROLL_STORAGE_PREFIX}${listUrl}`;
}

function isCourseListReturnContext(value: unknown): value is CourseListReturnContext {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.pathname === "/courses" &&
    typeof candidate.search === "string" &&
    typeof candidate.scrollY === "number" &&
    Number.isFinite(candidate.scrollY) &&
    candidate.scrollY >= 0 &&
    typeof candidate.timestamp === "number" &&
    Number.isFinite(candidate.timestamp)
  );
}

export function recordCourseListNavigation(
  currentSearch: string | URLSearchParams = "",
  customScrollY?: number,
): CourseListReturnContext {
  const validatedSearch = validateAndSanitizeCourseListSearch(currentSearch);
  const validatedListUrl = `/courses${validatedSearch}`;

  let scrollY = 0;
  if (typeof customScrollY === "number" && Number.isFinite(customScrollY) && customScrollY >= 0) {
    scrollY = customScrollY;
  } else if (typeof window !== "undefined") {
    const windowY = window.scrollY;
    if (typeof windowY === "number" && Number.isFinite(windowY) && windowY >= 0) {
      scrollY = windowY;
    }
  }

  const context: CourseListReturnContext = {
    pathname: "/courses",
    search: validatedSearch,
    scrollY,
    timestamp: Date.now(),
  };

  if (typeof window !== "undefined") {
    try {
      const storageKey = getStorageKeyForListUrl(validatedListUrl);
      window.sessionStorage.setItem(storageKey, JSON.stringify(context));
      window.sessionStorage.setItem(LAST_VALID_URL_KEY, validatedListUrl);
    } catch {}
  }

  return context;
}

export function getSavedScrollForCourseList(
  currentSearch: string | URLSearchParams = "",
): number | null {
  if (typeof window === "undefined") return null;
  const validatedSearch = validateAndSanitizeCourseListSearch(currentSearch);
  const validatedListUrl = `/courses${validatedSearch}`;
  const storageKey = getStorageKeyForListUrl(validatedListUrl);

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isCourseListReturnContext(parsed) && parsed.search === validatedSearch) {
      return parsed.scrollY;
    }
  } catch {
    return null;
  }
  return null;
}

export function clearSavedScrollForCourseList(
  currentSearch: string | URLSearchParams = "",
): void {
  if (typeof window === "undefined") return;
  const validatedSearch = validateAndSanitizeCourseListSearch(currentSearch);
  const validatedListUrl = `/courses${validatedSearch}`;
  const storageKey = getStorageKeyForListUrl(validatedListUrl);

  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {}
}

function sanitizeOriginUrl(rawUrl: string): string {
  if (!isValidCourseListOrigin(rawUrl)) return "/courses";
  const parts = rawUrl.split("?");
  const search = parts[1] ? `?${parts[1]}` : "";
  return `/courses${validateAndSanitizeCourseListSearch(search)}`;
}

export function getSafeCourseReturnUrl(fallbackUrl: string = "/courses"): string {
  if (typeof window === "undefined") {
    return sanitizeOriginUrl(fallbackUrl);
  }
  try {
    const lastUrl = window.sessionStorage.getItem(LAST_VALID_URL_KEY);
    if (lastUrl && isValidCourseListOrigin(lastUrl)) {
      return sanitizeOriginUrl(lastUrl);
    }
  } catch {
    return "/courses";
  }
  return sanitizeOriginUrl(fallbackUrl);
}

export interface CourseDetailReturnContext {
  courseId: number;
  tab: "overview" | "students" | "progress";
  periodId?: number;
  search?: string;
  sort?: string;
  view?: "matrix" | "table";
  rosterPage?: number;
  rosterStatus?: "all" | "active" | "withdrawn" | "completed";
  scrollY: number;
  timestamp: number;
}

const DETAIL_RETURN_STORAGE_PREFIX = "kitob_course_detail_return:";
const SUPPORTED_DETAIL_SORTS = new Set([
  "avg_desc",
  "name_asc",
  "latest_desc",
  "price",
  "newest",
  "enrolled_desc",
  "enrolled_asc",
  "name_desc",
  "price_asc",
  "price_desc",
  "score_desc",
  "score_asc",
]);

export function recordCourseDetailNavigation(
  courseId: number,
  options: {
    tab?: "overview" | "students" | "progress";
    periodId?: number;
    search?: string;
    sort?: string;
    view?: "matrix" | "table";
    rosterPage?: number;
    rosterStatus?: "all" | "active" | "withdrawn" | "completed";
    scrollY?: number;
  } = {},
): CourseDetailReturnContext {
  let scrollY = 0;
  if (typeof options.scrollY === "number" && Number.isFinite(options.scrollY) && options.scrollY >= 0) {
    scrollY = options.scrollY;
  } else if (typeof window !== "undefined") {
    const windowY = window.scrollY;
    if (typeof windowY === "number" && Number.isFinite(windowY) && windowY >= 0) {
      scrollY = windowY;
    }
  }

  const validPeriodId =
    typeof options.periodId === "number" && Number.isSafeInteger(options.periodId) && options.periodId > 0
      ? options.periodId
      : undefined;

  const validSearch =
    typeof options.search === "string" ? options.search.slice(0, 500) : undefined;

  const validSort =
    typeof options.sort === "string" && SUPPORTED_DETAIL_SORTS.has(options.sort)
      ? options.sort
      : undefined;

  const validView =
    options.view === "matrix" || options.view === "table" ? options.view : undefined;

  const validRosterPage =
    typeof options.rosterPage === "number" && Number.isSafeInteger(options.rosterPage) && options.rosterPage > 0
      ? options.rosterPage
      : undefined;

  const validRosterStatus =
    options.rosterStatus === "all" ||
    options.rosterStatus === "active" ||
    options.rosterStatus === "withdrawn" ||
    options.rosterStatus === "completed"
      ? options.rosterStatus
      : undefined;

  const context: CourseDetailReturnContext = {
    courseId,
    tab: options.tab || "overview",
    periodId: validPeriodId,
    search: validSearch,
    sort: validSort,
    view: validView,
    rosterPage: validRosterPage,
    rosterStatus: validRosterStatus,
    scrollY,
    timestamp: Date.now(),
  };

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(
        `${DETAIL_RETURN_STORAGE_PREFIX}${courseId}`,
        JSON.stringify(context),
      );
    } catch {}
  }

  return context;
}

export function getSavedCourseDetailContext(courseId: number): CourseDetailReturnContext | null {
  if (typeof window === "undefined") return null;
  if (typeof courseId !== "number" || !Number.isSafeInteger(courseId) || courseId <= 0) return null;
  try {
    const raw = window.sessionStorage.getItem(`${DETAIL_RETURN_STORAGE_PREFIX}${courseId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const candidate = parsed as Record<string, unknown>;

    if (
      typeof candidate.courseId !== "number" ||
      !Number.isSafeInteger(candidate.courseId) ||
      candidate.courseId !== courseId
    ) {
      return null;
    }

    if (
      candidate.tab !== "overview" &&
      candidate.tab !== "students" &&
      candidate.tab !== "progress"
    ) {
      return null;
    }

    let validPeriodId: number | undefined = undefined;
    if ("periodId" in candidate && candidate.periodId !== undefined) {
      if (
        typeof candidate.periodId !== "number" ||
        !Number.isSafeInteger(candidate.periodId) ||
        candidate.periodId <= 0
      ) {
        return null;
      }
      validPeriodId = candidate.periodId;
    }

    if (
      typeof candidate.scrollY !== "number" ||
      !Number.isFinite(candidate.scrollY) ||
      candidate.scrollY < 0
    ) {
      return null;
    }

    if (
      typeof candidate.timestamp !== "number" ||
      !Number.isFinite(candidate.timestamp) ||
      candidate.timestamp <= 0
    ) {
      return null;
    }

    let validSearch: string | undefined = undefined;
    if ("search" in candidate && candidate.search !== undefined) {
      if (typeof candidate.search !== "string" || candidate.search.length > 500) {
        return null;
      }
      validSearch = candidate.search;
    }

    let validSort: string | undefined = undefined;
    if ("sort" in candidate && candidate.sort !== undefined) {
      if (typeof candidate.sort !== "string" || !SUPPORTED_DETAIL_SORTS.has(candidate.sort)) {
        return null;
      }
      validSort = candidate.sort;
    }

    let validView: "matrix" | "table" | undefined = undefined;
    if ("view" in candidate && candidate.view !== undefined) {
      if (candidate.view !== "matrix" && candidate.view !== "table") {
        return null;
      }
      validView = candidate.view;
    }

    let validRosterPage: number | undefined = undefined;
    if ("rosterPage" in candidate && candidate.rosterPage !== undefined) {
      if (
        typeof candidate.rosterPage !== "number" ||
        !Number.isSafeInteger(candidate.rosterPage) ||
        candidate.rosterPage <= 0
      ) {
        return null;
      }
      validRosterPage = candidate.rosterPage;
    }

    let validRosterStatus: "all" | "active" | "withdrawn" | "completed" | undefined = undefined;
    if ("rosterStatus" in candidate && candidate.rosterStatus !== undefined) {
      if (
        candidate.rosterStatus !== "all" &&
        candidate.rosterStatus !== "active" &&
        candidate.rosterStatus !== "withdrawn" &&
        candidate.rosterStatus !== "completed"
      ) {
        return null;
      }
      validRosterStatus = candidate.rosterStatus;
    }

    return {
      courseId: candidate.courseId,
      tab: candidate.tab,
      periodId: validPeriodId,
      scrollY: candidate.scrollY,
      timestamp: candidate.timestamp,
      search: validSearch,
      sort: validSort,
      view: validView,
      rosterPage: validRosterPage,
      rosterStatus: validRosterStatus,
    };
  } catch {
    return null;
  }
}

export function clearSavedCourseDetailContext(courseId: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(`${DETAIL_RETURN_STORAGE_PREFIX}${courseId}`);
  } catch {}
}

export function consumeSavedCourseDetailContext(courseId: number): CourseDetailReturnContext | null {
  const context = getSavedCourseDetailContext(courseId);
  if (context) {
    clearSavedCourseDetailContext(courseId);
  }
  return context;
}

export function isInternalReturnSignal(
  locationState: unknown,
  searchParams?: URLSearchParams | null,
): boolean {
  if (
    typeof locationState === "object" &&
    locationState !== null &&
    (locationState as { fromInternalReturn?: boolean }).fromInternalReturn === true
  ) {
    return true;
  }
  if (searchParams) {
    if (searchParams.get("return") === "1" || searchParams.get("returned") === "1") {
      return true;
    }
  }
  return false;
}

export function buildCourseJournalUrl(courseId: number): string {
  return `/journals/${courseId}`;
}

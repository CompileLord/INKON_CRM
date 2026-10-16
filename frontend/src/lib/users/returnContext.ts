import { onLogout } from "../auth/session";

export interface StudentsDirectoryReturnContext {
  pathname: "/students";
  search: string;
  query: string;
  page: number;
  pageSize: number;
  scrollY: number;
  studentId?: number;
  role: string;
  userId?: number | null;
  timestamp: number;
}

export interface MentorsDirectoryReturnContext {
  pathname: "/mentors";
  search: string;
  query: string;
  page: number;
  pageSize: number;
  scrollY: number;
  mentorId?: number;
  role: string;
  userId?: number | null;
  timestamp: number;
}

const CONTEXT_MAX_AGE_MS = 30 * 60 * 1000;

let inMemoryContext: StudentsDirectoryReturnContext | null = null;
let inMemoryMentorsContext: MentorsDirectoryReturnContext | null = null;

onLogout(() => {
  inMemoryContext = null;
  inMemoryMentorsContext = null;
});

export function parseSafePageParam(rawPage: unknown): number {
  if (typeof rawPage !== "string" && typeof rawPage !== "number") return 1;
  const parsed = Number(rawPage);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

export function parseSafePageSizeParam(rawSize: unknown): number {
  if (typeof rawSize !== "string" && typeof rawSize !== "number") return 20;
  const parsed = Number(rawSize);
  if (parsed === 10 || parsed === 20 || parsed === 50 || parsed === 100) return parsed;
  return 20;
}

export function validateAndSanitizeStudentsSearch(rawSearch: unknown): {
  query: string;
  page: number;
  pageSize: number;
  searchString: string;
} {
  const params =
    rawSearch instanceof URLSearchParams
      ? rawSearch
      : typeof rawSearch === "string"
        ? new URLSearchParams(rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch)
        : new URLSearchParams();

  const query = (params.get("q") ?? "").trim();
  const page = parseSafePageParam(params.get("page"));
  const pageSize = parseSafePageSizeParam(params.get("pageSize"));

  const cleanParams = new URLSearchParams();
  if (query) {
    cleanParams.set("q", query);
  }
  if (page > 1) {
    cleanParams.set("page", String(page));
  }
  if (pageSize !== 20) {
    cleanParams.set("pageSize", String(pageSize));
  }

  const searchString = cleanParams.toString() ? `?${cleanParams.toString()}` : "";

  return {
    query,
    page,
    pageSize,
    searchString,
  };
}

export function recordStudentsNavigation(params: {
  query: string;
  page: number;
  pageSize: number;
  scrollY?: number;
  studentId?: number;
  role: string;
  userId?: number | null;
}): StudentsDirectoryReturnContext {
  let scrollY = 0;
  if (typeof params.scrollY === "number" && Number.isFinite(params.scrollY) && params.scrollY >= 0) {
    scrollY = params.scrollY;
  } else if (typeof window !== "undefined") {
    scrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
  }

  const clean = validateAndSanitizeStudentsSearch(
    `?q=${encodeURIComponent(params.query)}&page=${params.page}&pageSize=${params.pageSize}`,
  );

  const context: StudentsDirectoryReturnContext = {
    pathname: "/students",
    search: clean.searchString,
    query: clean.query,
    page: clean.page,
    pageSize: clean.pageSize,
    scrollY,
    studentId: params.studentId,
    role: params.role,
    userId: params.userId,
    timestamp: Date.now(),
  };

  inMemoryContext = context;
  return context;
}

export function getSavedStudentsReturnContext(
  expectedRole?: string | null,
  expectedUserId?: number | null,
): StudentsDirectoryReturnContext | null {
  if (!inMemoryContext) return null;

  const targetRole = expectedRole || "superadmin";
  if (inMemoryContext.role !== targetRole) {
    inMemoryContext = null;
    return null;
  }

  if (
    expectedUserId !== undefined &&
    expectedUserId !== null &&
    inMemoryContext.userId !== undefined &&
    inMemoryContext.userId !== null &&
    inMemoryContext.userId !== expectedUserId
  ) {
    inMemoryContext = null;
    return null;
  }

  if (Date.now() - inMemoryContext.timestamp > CONTEXT_MAX_AGE_MS) {
    inMemoryContext = null;
    return null;
  }

  return inMemoryContext;
}

export function clearSavedStudentsReturnContext(): void {
  inMemoryContext = null;
}

export function restoreStudentsScrollAndFocus(studentId?: number, scrollY?: number): void {
  if (typeof window === "undefined") return;

  if (typeof scrollY === "number" && scrollY > 0) {
    window.scrollTo({ top: scrollY, behavior: "instant" });
  }

  requestAnimationFrame(() => {
    if (typeof scrollY === "number" && scrollY > 0) {
      window.scrollTo({ top: scrollY, behavior: "instant" });
    }
    const isMobileOrTablet = window.innerWidth < 1024;
    let targetElement: HTMLElement | null = null;

    if (studentId) {
      if (isMobileOrTablet) {
        targetElement = document.getElementById(`student-card-${studentId}`);
      } else {
        targetElement = document.getElementById(`student-row-${studentId}`);
      }
    }

    if (!targetElement) {
      if (isMobileOrTablet) {
        targetElement = document.querySelector<HTMLElement>('[id^="student-card-"]');
      } else {
        targetElement = document.querySelector<HTMLElement>('[id^="student-row-"]');
      }
    }

    if (targetElement) {
      const focusable = targetElement.querySelector<HTMLElement>("a, button");
      if (focusable) {
        focusable.focus({ preventScroll: true });
        return;
      }
      targetElement.tabIndex = -1;
      targetElement.focus({ preventScroll: true });
      return;
    }

    const heading = document.querySelector<HTMLElement>("h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  });
}

export function validateAndSanitizeMentorsSearch(rawSearch: unknown): {
  query: string;
  page: number;
  pageSize: number;
  searchString: string;
} {
  const params =
    rawSearch instanceof URLSearchParams
      ? rawSearch
      : typeof rawSearch === "string"
        ? new URLSearchParams(rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch)
        : new URLSearchParams();

  const query = (params.get("q") ?? "").trim();
  const page = parseSafePageParam(params.get("page"));
  const pageSize = parseSafePageSizeParam(params.get("pageSize"));

  const cleanParams = new URLSearchParams();
  if (query) {
    cleanParams.set("q", query);
  }
  if (page > 1) {
    cleanParams.set("page", String(page));
  }
  if (pageSize !== 20) {
    cleanParams.set("pageSize", String(pageSize));
  }

  const searchString = cleanParams.toString() ? `?${cleanParams.toString()}` : "";

  return {
    query,
    page,
    pageSize,
    searchString,
  };
}

export function recordMentorsNavigation(params: {
  query: string;
  page: number;
  pageSize: number;
  scrollY?: number;
  mentorId?: number;
  role: string;
  userId?: number | null;
}): MentorsDirectoryReturnContext {
  let scrollY = 0;
  if (typeof params.scrollY === "number" && Number.isFinite(params.scrollY) && params.scrollY >= 0) {
    scrollY = params.scrollY;
  } else if (typeof window !== "undefined") {
    scrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
  }

  const clean = validateAndSanitizeMentorsSearch(
    `?q=${encodeURIComponent(params.query)}&page=${params.page}&pageSize=${params.pageSize}`,
  );

  const context: MentorsDirectoryReturnContext = {
    pathname: "/mentors",
    search: clean.searchString,
    query: clean.query,
    page: clean.page,
    pageSize: clean.pageSize,
    scrollY,
    mentorId: params.mentorId,
    role: params.role,
    userId: params.userId,
    timestamp: Date.now(),
  };

  inMemoryMentorsContext = context;
  return context;
}

export function getSavedMentorsReturnContext(
  expectedRole?: string | null,
  expectedUserId?: number | null,
): MentorsDirectoryReturnContext | null {
  if (!inMemoryMentorsContext) return null;

  const targetRole = expectedRole || "superadmin";
  if (inMemoryMentorsContext.role !== targetRole) {
    inMemoryMentorsContext = null;
    return null;
  }

  if (
    expectedUserId !== undefined &&
    expectedUserId !== null &&
    inMemoryMentorsContext.userId !== undefined &&
    inMemoryMentorsContext.userId !== null &&
    inMemoryMentorsContext.userId !== expectedUserId
  ) {
    inMemoryMentorsContext = null;
    return null;
  }

  if (Date.now() - inMemoryMentorsContext.timestamp > CONTEXT_MAX_AGE_MS) {
    inMemoryMentorsContext = null;
    return null;
  }

  return inMemoryMentorsContext;
}

export function clearSavedMentorsReturnContext(): void {
  inMemoryMentorsContext = null;
}

export function restoreMentorsScrollAndFocus(mentorId?: number, scrollY?: number): void {
  if (typeof window === "undefined") return;

  if (typeof scrollY === "number" && scrollY > 0) {
    window.scrollTo({ top: scrollY, behavior: "instant" });
  }

  requestAnimationFrame(() => {
    if (typeof scrollY === "number" && scrollY > 0) {
      window.scrollTo({ top: scrollY, behavior: "instant" });
    }
    const isMobileOrTablet = window.innerWidth < 1024;
    let targetElement: HTMLElement | null = null;

    if (mentorId) {
      if (isMobileOrTablet) {
        targetElement = document.getElementById(`mentor-card-${mentorId}`);
      } else {
        targetElement = document.getElementById(`mentor-row-${mentorId}`);
      }
    }

    if (!targetElement) {
      if (isMobileOrTablet) {
        targetElement = document.querySelector<HTMLElement>('[id^="mentor-card-"]');
      } else {
        targetElement = document.querySelector<HTMLElement>('[id^="mentor-row-"]');
      }
    }

    if (targetElement) {
      const focusable = targetElement.querySelector<HTMLElement>("a, button");
      if (focusable) {
        focusable.focus({ preventScroll: true });
        return;
      }
      targetElement.tabIndex = -1;
      targetElement.focus({ preventScroll: true });
      return;
    }

    const heading = document.querySelector<HTMLElement>("h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  });
}

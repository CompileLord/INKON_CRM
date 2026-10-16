import { getSavedStudentsReturnContext, parseSafePageParam, parseSafePageSizeParam } from "../users/returnContext";
import { getSavedCourseDetailContext } from "../courses/returnContext";
import type { CourseDetailReturnContext } from "../courses/returnContext";

const MAX_COURSE_RETURN_AGE_MS = 5 * 60 * 1000;

export interface StudentProfileReturnTarget {
  to: string;
  labelKey: string;
  state?: unknown;
}

export interface StudentCourseLinkInfo {
  isNavigable: boolean;
  to: string;
}

export interface StudentAssignedCourse {
  id: number;
  mentorId: number;
}

export type StudentProfileTabId = "courses" | "performance" | "documents";

function isLocationStateRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseStudentProfileTab(value: unknown): StudentProfileTabId | undefined {
  if (!isLocationStateRecord(value)) return undefined;
  const tab = value.profileTab;
  return tab === "courses" || tab === "performance" || tab === "documents" ? tab : undefined;
}

export function getStudentProfileLocationState(value: unknown): Record<string, unknown> {
  return isLocationStateRecord(value) ? value : {};
}

export function getStudentProfileReturnTarget(
  role: string | null | undefined,
  userId: number | null | undefined,
  locationState: unknown,
  profileCourses: StudentAssignedCourse[] = [],
): StudentProfileReturnTarget {
  if (role === "superadmin") {
    const typedState = getStudentProfileLocationState(locationState);
    const rawDirectory = typedState.fromDirectory;
    const fromDirectory = isLocationStateRecord(rawDirectory)
      ? rawDirectory
      : undefined;

    if (fromDirectory) {
      const queryParams = new URLSearchParams();
      if (typeof fromDirectory.search === "string") {
        const search = fromDirectory.search.replace(/[\r\n\0]/g, " ").trim();
        if (search) queryParams.set("q", search);
      }
      const page = parseSafePageParam(fromDirectory.page);
      if (page > 1) {
        queryParams.set("page", String(page));
      }
      const pageSize = parseSafePageSizeParam(fromDirectory.pageSize);
      if (pageSize !== 20) {
        queryParams.set("pageSize", String(pageSize));
      }
      const searchStr = queryParams.toString() ? `?${queryParams.toString()}` : "";
      return {
        to: `/students${searchStr}`,
        labelKey: "students:backToStudents",
        state: {
          studentId: typeof fromDirectory.studentId === "number" && Number.isSafeInteger(fromDirectory.studentId) && fromDirectory.studentId > 0
            ? fromDirectory.studentId
            : typeof typedState.studentId === "number" && Number.isSafeInteger(typedState.studentId) && typedState.studentId > 0
              ? typedState.studentId
              : undefined,
        },
      };
    }

    const savedContext = getSavedStudentsReturnContext("superadmin", userId);
    if (savedContext) {
      return {
        to: `/students${savedContext.search}`,
        labelKey: "students:backToStudents",
        state: { studentId: savedContext.studentId },
      };
    }

    return {
      to: "/students",
      labelKey: "students:backToStudents",
    };
  }

  if (role === "mentor") {
    const typedState = getStudentProfileLocationState(locationState);
    const from = typedState?.from;
    const courseReturn = typeof from === "string" ? from.match(/^\/courses\/(\d+)$/) : null;
    const requestedCourseId = Number(courseReturn?.[1]);

    if (
      Number.isSafeInteger(requestedCourseId) &&
      requestedCourseId > 0 &&
      profileCourses.some((course) => course.id === requestedCourseId && course.mentorId === userId)
    ) {
      return {
        to: `/courses/${requestedCourseId}`,
        labelKey: "students:backToCourse",
        state: { fromInternalReturn: true },
      };
    }

    const recentAssignedCourse = profileCourses
      .filter((course) => course.mentorId === userId)
      .map((course) => getSavedCourseDetailContext(course.id))
      .filter(
        (context): context is CourseDetailReturnContext =>
          context !== null &&
          Date.now() - context.timestamp <= MAX_COURSE_RETURN_AGE_MS,
      )
      .sort((left, right) => right.timestamp - left.timestamp)[0];

    if (recentAssignedCourse) {
      return {
        to: `/courses/${recentAssignedCourse.courseId}`,
        labelKey: "students:backToCourse",
        state: { fromInternalReturn: true },
      };
    }
    return {
      to: "/",
      labelKey: "students:backToDashboard",
    };
  }

  if (role === "student") {
    const typedState = getStudentProfileLocationState(locationState);
    if (typedState?.from === "/my/courses") {
      return {
        to: "/my/courses",
        labelKey: "students:backToMyCourses",
      };
    }
    return {
      to: "/",
      labelKey: "students:backToDashboard",
    };
  }

  return {
    to: "/",
    labelKey: "students:backToDashboard",
  };
}

export function getStudentCourseLink(
  courseId: number,
  courseMentorId: number,
  role: string | null | undefined,
  currentUserId: number | null | undefined,
): StudentCourseLinkInfo {
  if (role === "superadmin") {
    return {
      isNavigable: true,
      to: `/courses/${courseId}`,
    };
  }

  if (role === "student") {
    return {
      isNavigable: true,
      to: `/my/courses/${courseId}`,
    };
  }

  if (role === "mentor") {
    if (
      typeof currentUserId === "number" &&
      Number.isFinite(currentUserId) &&
      courseMentorId === currentUserId
    ) {
      return {
        isNavigable: true,
        to: `/courses/${courseId}`,
      };
    }
    return {
      isNavigable: false,
      to: "",
    };
  }

  return {
    isNavigable: false,
    to: "",
  };
}

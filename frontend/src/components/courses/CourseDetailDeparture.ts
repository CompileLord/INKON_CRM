import { recordCourseDetailNavigation } from "../../lib/courses/returnContext";

type RecordOptions = Parameters<typeof recordCourseDetailNavigation>[1];

export class CourseDetailDeparture {
  static record(courseId: number, options: RecordOptions): void {
    recordCourseDetailNavigation(courseId, { ...options, scrollY: window.scrollY });
    try {
      const currentState: unknown = window.history.state;
      const usr: Record<string, unknown> =
        typeof currentState === "object" && currentState !== null && "usr" in currentState
          ? (currentState as { usr: Record<string, unknown> }).usr
          : {};
      window.history.replaceState({ ...(currentState as object), usr: { ...usr, fromInternalReturn: true } }, "");
    } catch {
      return;
    }
  }
}

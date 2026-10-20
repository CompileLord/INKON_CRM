import type { StudentCourseProfile } from "../../lib/users/types";

export class ActiveCourseScores {
  static totals(courses: StudentCourseProfile[]): { score: number; max: number } | null {
    const graded: StudentCourseProfile[] = courses.filter(
      (item: StudentCourseProfile) => item.bucket === "active" && typeof item.my_total_score === "number" && typeof item.my_total_max_score === "number" && item.my_total_max_score > 0,
    );
    if (graded.length === 0) return null;
    return {
      score: graded.reduce((sum: number, item: StudentCourseProfile) => sum + (item.my_total_score as number), 0),
      max: graded.reduce((sum: number, item: StudentCourseProfile) => sum + (item.my_total_max_score as number), 0),
    };
  }
}

import type {
  CourseProgressChartResponse,
  StaffCourseProgressChartResponse,
  StudentCourseProgressChartResponse,
} from "./types";

export class CourseChartResponses {
  static isStudent(chart: CourseProgressChartResponse): chart is StudentCourseProgressChartResponse {
    return "my_series" in chart;
  }

  static isStaff(chart: CourseProgressChartResponse): chart is StaffCourseProgressChartResponse {
    return "datasets" in chart;
  }

  static hasRank(chart: StudentCourseProgressChartResponse): boolean {
    return chart.my_rank !== null;
  }
}

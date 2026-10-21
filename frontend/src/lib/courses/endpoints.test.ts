import MockAdapter from "axios-mock-adapter";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/tokenStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/tokenStorage")>();
  return { ...actual, tokenStorage: actual.createMemoryTokenStorage() };
});

import type {
  CourseProgressChartResponse,
  StaffCourseProgressChartResponse,
  StudentCourseProgressChartResponse,
} from "./types";
import { CourseChartResponses } from "./CourseChartResponses";

const { httpClient } = await import("../auth/httpClient");
const { tokenStorage } = await import("../auth/tokenStorage");
const {
  createCourse,
  listCourses,
  getCourse,
  updateCourse,
  deleteCourse,
  getCourseSchedule,
  copyCourse,
  getCourseMentorHistory,
  getCourseProgressChart,
  getCourseJournals,
  getCourseStaffProgress,
} = await import("./endpoints");

const mock = new MockAdapter(httpClient);

// A real value shape from the live server — 40+ fractional digits, well
// beyond float64 precision.
const HUGE_PRICE = "436688811034941926602435971499369190867.07";

const sampleCourse = {
  id: 1,
  title: "Английский B1",
  description: "Разговорный курс",
  photo_path: null,
  start_date: "2026-01-10",
  end_date: "2026-06-10",
  exam_type: "weekly",
  price: HUGE_PRICE,
  mentor_id: 5,
  status: "active",
  is_deleted: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  mock.reset();
  tokenStorage.clear();
  tokenStorage.setTokens({ accessToken: "token-abc", refreshToken: "refresh-abc" });
});

afterEach(() => {
  mock.resetHistory();
  vi.restoreAllMocks();
});

describe("createCourse", () => {
  it("posts CourseCreate and returns the created course, preserving full price precision", async () => {
    const payload = {
      title: "Английский B1",
      description: "Разговорный курс",
      photo_path: null,
      start_date: "2026-01-10",
      end_date: "2026-06-10",
      exam_type: "weekly" as const,
      price: HUGE_PRICE,
      mentor_id: 5,
      schedules: [{ day_of_week: 1, time_start: "18:00:00", time_end: "19:30:00" }],
    };

    mock.onPost("/courses/").reply((config) => {
      expect(JSON.parse(config.data)).toEqual(payload);
      expect(config.headers?.Authorization).toBe("Bearer token-abc");
      return [201, sampleCourse];
    });

    const result = await createCourse(payload);
    expect(result.price).toBe(HUGE_PRICE);
  });
});

describe("listCourses", () => {
  it("gets the paginated course list with query params", async () => {
    mock.onGet("/courses/").reply((config) => {
      expect(config.params).toEqual({ status: "active", page: 2, page_size: 10 });
      return [200, { items: [sampleCourse], total: 1, page: 2, page_size: 10, total_pages: 1 }];
    });

    const result = await listCourses({ status: "active", page: 2, page_size: 10 });
    expect(result.items).toEqual([sampleCourse]);
  });
});

describe("getCourse", () => {
  it("fetches a single course by id", async () => {
    mock.onGet("/courses/1").reply(200, sampleCourse);
    await expect(getCourse(1)).resolves.toEqual(sampleCourse);
  });
});

describe("updateCourse", () => {
  it("patches only the given fields", async () => {
    mock.onPatch("/courses/1").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ title: "Английский B2" });
      return [200, { ...sampleCourse, title: "Английский B2" }];
    });

    const result = await updateCourse(1, { title: "Английский B2" });
    expect(result.title).toBe("Английский B2");
  });
});

describe("deleteCourse", () => {
  it("deletes by id and resolves on 204", async () => {
    mock.onDelete("/courses/1").reply(204);
    await expect(deleteCourse(1)).resolves.toBeUndefined();
  });
});

describe("getCourseSchedule", () => {
  it("fetches the bare-array schedule response", async () => {
    const schedule = [{ id: 1, course_id: 1, day_of_week: 1, time_start: "18:00:00", time_end: "19:30:00" }];
    mock.onGet("/courses/1/schedule").reply(200, schedule);
    await expect(getCourseSchedule(1)).resolves.toEqual(schedule);
  });
});

describe("copyCourse", () => {
  it("posts a full CourseCreate body to the copy endpoint", async () => {
    const payload = {
      title: "Английский B1 (копия)",
      description: "Разговорный курс",
      photo_path: null,
      start_date: "2026-01-10",
      end_date: "2026-06-10",
      exam_type: "weekly" as const,
      price: HUGE_PRICE,
      mentor_id: 5,
      schedules: [{ day_of_week: 1, time_start: "18:00:00", time_end: "19:30:00" }],
    };

    mock.onPost("/courses/1/copy/").reply((config) => {
      expect(JSON.parse(config.data)).toEqual(payload);
      return [201, { ...sampleCourse, id: 2, title: payload.title }];
    });

    const result = await copyCourse(1, payload);
    expect(result.id).toBe(2);
  });
});

describe("getCourseMentorHistory", () => {
  it("fetches the bare-array mentor history response", async () => {
    const history = [
      {
        id: 1,
        course_id: 1,
        mentor_id: 5,
        assigned_from: "2026-01-01T00:00:00Z",
        assigned_to: null,
        mentor: { id: 5, first_name: "Азиз", last_name: "Каримов", email: "a@example.com", is_deleted: false },
      },
    ];
    mock.onGet("/courses/1/mentor-history").reply(200, history);
    await expect(getCourseMentorHistory(1)).resolves.toEqual(history);
  });
});

describe("getCourseProgressChart", () => {
  const staffChart: StaffCourseProgressChartResponse = {
    labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
    periods: [
      { id: 1, period_label: "Week 1" },
      { id: 2, period_label: "Week 2" },
      { id: 3, period_label: "Week 3" },
      { id: 4, period_label: "Week 4" },
    ],
    datasets: [
      {
        student_id: 1,
        name: "Ayub Gulmadov",
        color_hex: "#FF0000",
        scores: [0, null, 8, null],
        max_scores: [10, null, 10, null],
        percentages: [0, null, 80, null],
        grading_states: ["graded", "missing", "graded", "upcoming"],
        graded_periods_count: 2,
        eligible_periods_count: 3,
      },
      {
        student_id: 2,
        name: "Zero Eligible",
        color_hex: "#00FF00",
        scores: [null, null, null, null],
        max_scores: [null, null, null, null],
        percentages: [null, null, null, null],
        grading_states: ["unknown", "ungraded", "unknown", "upcoming"],
        graded_periods_count: 0,
        eligible_periods_count: 0,
      },
    ],
    class_avg_series: [0, null, 80, null],
    class_eligible_counts: [1, 0, 1, 0],
  };

  const studentChart: StudentCourseProgressChartResponse = {
    periods: [
      { id: 1, period_label: "Week 1" },
      { id: 2, period_label: "Week 2" },
      { id: 3, period_label: "Week 3" },
    ],
    my_series: [0, null, null],
    class_avg_series: [55, 60, null],
    my_grading_states: ["graded", "missing", "upcoming"],
    my_graded_periods_count: 1,
    my_eligible_periods_count: 2,
    class_eligible_counts: [4, 4, 0],
    my_rank: null,
    class_size: 4,
  };

  it("returns the complete staff payload with graded zero preserved and gaps as null", async () => {
    mock.onGet("/courses/1/progress-chart").reply(200, staffChart);
    const chart: CourseProgressChartResponse = await getCourseProgressChart(1);
    expect(CourseChartResponses.isStaff(chart)).toBe(true);
    expect(CourseChartResponses.isStudent(chart)).toBe(false);
    if (!CourseChartResponses.isStaff(chart)) throw new Error("expected staff chart");
    expect(chart.datasets[0].scores).toEqual([0, null, 8, null]);
    expect(chart.datasets[0].scores[0]).toBe(0);
    expect(chart.datasets[0].scores[1]).toBeNull();
    expect(chart.datasets[0].percentages[0]).toBe(0);
    expect(chart.class_avg_series[0]).toBe(0);
    expect(chart.class_avg_series[1]).toBeNull();
    expect(chart.class_eligible_counts).toEqual([1, 0, 1, 0]);
  });

  it("keeps period alignment and states for every dataset and the class series", async () => {
    mock.onGet("/courses/1/progress-chart").reply(200, staffChart);
    const chart: CourseProgressChartResponse = await getCourseProgressChart(1);
    if (!CourseChartResponses.isStaff(chart)) throw new Error("expected staff chart");
    const periodCount: number = chart.periods.length;
    for (const dataset of chart.datasets) {
      expect(dataset.scores).toHaveLength(periodCount);
      expect(dataset.max_scores).toHaveLength(periodCount);
      expect(dataset.percentages).toHaveLength(periodCount);
      expect(dataset.grading_states).toHaveLength(periodCount);
    }
    expect(chart.class_avg_series).toHaveLength(periodCount);
    expect(chart.class_eligible_counts).toHaveLength(periodCount);
  });

  it("reports zero eligible periods without inventing scores", async () => {
    mock.onGet("/courses/1/progress-chart").reply(200, staffChart);
    const chart: CourseProgressChartResponse = await getCourseProgressChart(1);
    if (!CourseChartResponses.isStaff(chart)) throw new Error("expected staff chart");
    const idle = chart.datasets[1];
    expect(idle.eligible_periods_count).toBe(0);
    expect(idle.graded_periods_count).toBe(0);
    expect(idle.percentages.every((value: number | null) => value === null)).toBe(true);
  });

  it("marks future periods upcoming with null values", async () => {
    mock.onGet("/courses/1/progress-chart").reply(200, staffChart);
    const chart: CourseProgressChartResponse = await getCourseProgressChart(1);
    if (!CourseChartResponses.isStaff(chart)) throw new Error("expected staff chart");
    const upcomingIndex: number = chart.datasets[0].grading_states.indexOf("upcoming");
    expect(upcomingIndex).toBe(3);
    expect(chart.datasets[0].scores[upcomingIndex]).toBeNull();
    expect(chart.class_avg_series[upcomingIndex]).toBeNull();
    expect(chart.class_eligible_counts[upcomingIndex]).toBe(0);
  });

  it("returns the student payload with only the caller series and nullable rank", async () => {
    mock.onGet("/courses/1/progress-chart").reply(200, studentChart);
    const chart: CourseProgressChartResponse = await getCourseProgressChart(1);
    expect(CourseChartResponses.isStudent(chart)).toBe(true);
    if (!CourseChartResponses.isStudent(chart)) throw new Error("expected student chart");
    expect(chart.my_series).toEqual([0, null, null]);
    expect(chart.my_series[0]).toBe(0);
    expect(chart.my_grading_states).toEqual(["graded", "missing", "upcoming"]);
    expect(chart.my_graded_periods_count).toBe(1);
    expect(chart.my_eligible_periods_count).toBe(2);
    expect(chart.class_avg_series).toEqual([55, 60, null]);
    expect(chart.class_eligible_counts).toEqual([4, 4, 0]);
  });

  it("treats a null rank as unavailable and a numeric rank as available", async () => {
    mock.onGet("/courses/1/progress-chart").reply(200, studentChart);
    const unranked: CourseProgressChartResponse = await getCourseProgressChart(1);
    if (!CourseChartResponses.isStudent(unranked)) throw new Error("expected student chart");
    expect(unranked.my_rank).toBeNull();
    expect(CourseChartResponses.hasRank(unranked)).toBe(false);
    expect(CourseChartResponses.hasRank({ ...unranked, my_rank: 2 })).toBe(true);
  });

  it("exposes no peer identities in the student payload", async () => {
    mock.onGet("/courses/1/progress-chart").reply(200, studentChart);
    const chart: CourseProgressChartResponse = await getCourseProgressChart(1);
    expect(CourseChartResponses.isStaff(chart)).toBe(false);
    const serialized: string = JSON.stringify(chart);
    for (const forbidden of ["datasets", "student_id", "name", "color_hex"]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
    expect(Object.keys(chart).sort()).toEqual(Object.keys(studentChart).sort());
  });
});

describe("getCourseJournals", () => {
  it("fetches the ordered list of a course's journal periods", async () => {
    const journals = [
      { id: 10, course_id: 1, period_label: "Week 1", period_start: "2026-01-05", period_end: "2026-01-11", period_type: "week" },
      { id: 11, course_id: 1, period_label: "Week 2", period_start: "2026-01-12", period_end: "2026-01-18", period_type: "week" },
    ];
    mock.onGet("/courses/1/journals").reply(200, journals);
    await expect(getCourseJournals(1)).resolves.toEqual(journals);
  });
});

describe("getCourseStaffProgress", () => {
  it("fetches course staff progress with stable periods, factual scores and nullable percentages", async () => {
    const sampleStaffProgress = {
      course_id: 1,
      periods: [
        {
          id: 10,
          period_label: "Week 1",
          period_start: "2026-08-01",
          period_end: "2026-08-07",
        },
      ],
      students: [
        {
          student_id: 101,
          first_name: "Ali",
          last_name: "Valiyev",
          period_results: [
            {
              period_id: 10,
              grading_state: "unknown",
              score: 85,
              max_score: 80,
              percentage: 106.25,
            },
          ],
          grading_provenance: "unknown",
        },
        {
          student_id: 102,
          first_name: "Zara",
          last_name: "Karimova",
          period_results: [
            {
              period_id: 10,
              grading_state: "missing",
              score: null,
              max_score: null,
              percentage: null,
            },
          ],
          grading_provenance: "unknown",
        },
      ],
    };

    mock.onGet("/courses/1/staff-progress").reply(200, sampleStaffProgress);

    const result = await getCourseStaffProgress(1);
    expect(result).toEqual(sampleStaffProgress);
    expect(result.students[0].period_results[0].grading_state).toBe("unknown");
    expect(result.students[0].period_results[0].percentage).toBe(106.25);
    expect(result.students[1].period_results[0].grading_state).toBe("missing");
    expect(result.students[1].period_results[0].score).toBeNull();
  });
});

describe("403 handling", () => {
  it("does not trigger a refresh for a 403 and surfaces it as AuthApiError", async () => {
    const { AuthApiError } = await import("../auth/errors");
    mock.onDelete("/courses/1").reply(403, { detail: "Insufficient permissions" });
    mock.onPost("/auth/refresh").reply(200, {
      access_token: "should-not-be-used",
      refresh_token: null,
      token_type: "bearer",
      must_set_password: false,
    });

    const err = await deleteCourse(1).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AuthApiError);
    expect((err as InstanceType<typeof AuthApiError>).status).toBe(403);
    expect(mock.history.post.filter((r) => r.url === "/auth/refresh")).toHaveLength(0);
  });
});

describe("422 field mapping", () => {
  it("maps validation errors onto fieldErrors keyed by the last loc segment", async () => {
    const { AuthApiError } = await import("../auth/errors");
    mock.onPost("/courses/").reply(422, {
      detail: [
        { loc: ["body", "price"], msg: "Price must be greater than 0", type: "value_error" },
        { loc: ["body", "schedules", 0, "day_of_week"], msg: "Invalid day", type: "value_error" },
      ],
    });

    const err = (await createCourse({
      title: "x",
      description: "y",
      start_date: "2026-01-01",
      end_date: "2026-02-01",
      exam_type: "weekly",
      price: "-1",
      mentor_id: 1,
      schedules: [{ day_of_week: 9, time_start: "10:00:00", time_end: "11:00:00" }],
    }).catch((e: unknown) => e)) as InstanceType<typeof AuthApiError>;

    expect(err).toBeInstanceOf(AuthApiError);
    expect(err.status).toBe(422);
    expect(err.fieldErrors.price).toBe("Price must be greater than 0");
    expect(err.fieldErrors.day_of_week).toBe("Invalid day");
  });
});

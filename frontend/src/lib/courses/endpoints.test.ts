import MockAdapter from "axios-mock-adapter";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/tokenStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/tokenStorage")>();
  return { ...actual, tokenStorage: actual.createMemoryTokenStorage() };
});

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
  it("fetches the typed progress-chart payload as-is", async () => {
    const chart = {
      labels: ["Week 1", "Week 2", "Average"],
      datasets: [{ student_id: 1, name: "Ayub Gulmadov", color_hex: "#FF0000", scores: [70, 85, 77.5] }],
    };
    mock.onGet("/courses/1/progress-chart").reply(200, chart);
    await expect(getCourseProgressChart(1)).resolves.toEqual(chart);
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

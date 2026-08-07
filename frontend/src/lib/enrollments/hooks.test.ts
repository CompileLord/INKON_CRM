import MockAdapter from "axios-mock-adapter";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/tokenStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/tokenStorage")>();
  return { ...actual, tokenStorage: actual.createMemoryTokenStorage() };
});

const { httpClient } = await import("../auth/httpClient");
const { tokenStorage } = await import("../auth/tokenStorage");
const { fetchFilteredEnrollments, buildRoster } = await import("./hooks");

const mock = new MockAdapter(httpClient);

function enrollment(id: number, studentId: number, courseId: number) {
  return {
    id,
    student_id: studentId,
    course_id: courseId,
    price_at_enrollment: "100.00",
    color_hex: "#2A78D6",
    enrolled_at: "2026-01-05T12:00:00Z",
    status: "active" as const,
    is_deleted: false,
  };
}

beforeEach(() => {
  mock.reset();
  tokenStorage.clear();
  tokenStorage.setTokens({ accessToken: "token-abc", refreshToken: "refresh-abc" });
});

afterEach(() => {
  mock.resetHistory();
  vi.restoreAllMocks();
});

describe("fetchFilteredEnrollments", () => {
  it("trusts a server-side course_id filter when every returned item matches it", async () => {
    mock.onGet("/enrollments/").reply((config) => {
      expect(config.params).toMatchObject({ course_id: 20 });
      return [
        200,
        {
          items: [enrollment(1, 10, 20), enrollment(2, 11, 20)],
          total: 2,
          page: 1,
          page_size: 100,
          total_pages: 1,
        },
      ];
    });

    const result = await fetchFilteredEnrollments({ course_id: 20 });

    expect(result).toHaveLength(2);
    expect(mock.history.get).toHaveLength(1); // only the single filtered page — no fallback fetch
  });

  it("falls back to paging through everything and filtering client-side when the server ignores the filter", async () => {
    // The server ignores course_id=20 and returns a mixed page — our
    // heuristic must detect this and re-fetch unfiltered.
    mock.onGet("/enrollments/").reply((config) => {
      if (config.params.course_id === 20) {
        return [
          200,
          {
            items: [enrollment(1, 10, 20), enrollment(2, 11, 99)], // course_id 99 leaked in — filter was ignored
            total: 3,
            page: 1,
            page_size: 100,
            total_pages: 1,
          },
        ];
      }
      // Unfiltered fallback fetch
      return [
        200,
        {
          items: [enrollment(1, 10, 20), enrollment(2, 11, 99), enrollment(3, 12, 20)],
          total: 3,
          page: 1,
          page_size: 100,
          total_pages: 1,
        },
      ];
    });

    const result = await fetchFilteredEnrollments({ course_id: 20 });

    expect(result.map((e) => e.id).sort()).toEqual([1, 3]);
    expect(result.every((e) => e.course_id === 20)).toBe(true);
    expect(mock.history.get).toHaveLength(2); // the failed filtered attempt + the unfiltered fallback
  });

  it("filters by student_id the same way", async () => {
    mock.onGet("/enrollments/").reply(200, {
      items: [enrollment(1, 10, 20), enrollment(2, 10, 21)],
      total: 2,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });

    const result = await fetchFilteredEnrollments({ student_id: 10 });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.student_id === 10)).toBe(true);
  });
});

describe("buildRoster", () => {
  function profile(studentId: number) {
    return {
      user: {
        id: studentId,
        email: `student${studentId}@example.com`,
        first_name: "Aziz",
        last_name: "Rahimov",
        role: "student" as const,
        date_of_birth: null,
        phone: null,
        parent_telegram_chat_id: null,
        parent_phone: null,
        photo_path: null,
        thumbnail_path: null,
        payment_day_of_month: null,
        must_set_password: false,
        is_deleted: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      courses: [],
      totals: {
        avg_percentage: 90,
        attendance_percentage: 100,
        absences: 0,
        total_lessons: 10,
        active_course_count: 1,
        archived_course_count: 0,
      },
      avg_score: 4.5,
      absences: 0,
      total_lessons: 10,
    };
  }

  it("pairs every enrollment with its resolved profile when all resolve", () => {
    const enrollments = [enrollment(1, 10, 20), enrollment(2, 11, 20)];
    const result = buildRoster(enrollments, [profile(10), profile(11)]);

    expect(result.rows).toHaveLength(2);
    expect(result.unresolvedCount).toBe(0);
    expect(result.rows[0].student.id).toBe(10);
  });

  it("omits a row whose profile failed to resolve instead of failing the whole roster", () => {
    // Regression test: one 404'd student profile (e.g. an old enrollment
    // for a student who was later deleted) used to flip isError for the
    // entire roster, breaking pages that only had one bad row.
    const enrollments = [enrollment(1, 10, 20), enrollment(2, 11, 20), enrollment(3, 12, 20)];
    const result = buildRoster(enrollments, [profile(10), undefined, profile(12)]);

    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.student.id)).toEqual([10, 12]);
    expect(result.unresolvedCount).toBe(1);
  });

  it("returns an empty roster with an accurate count when every profile fails to resolve", () => {
    const enrollments = [enrollment(1, 10, 20), enrollment(2, 11, 20)];
    const result = buildRoster(enrollments, [undefined, undefined]);

    expect(result.rows).toEqual([]);
    expect(result.unresolvedCount).toBe(2);
  });
});

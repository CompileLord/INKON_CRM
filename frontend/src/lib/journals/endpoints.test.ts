import MockAdapter from "axios-mock-adapter";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/tokenStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/tokenStorage")>();
  return { ...actual, tokenStorage: actual.createMemoryTokenStorage() };
});

const { httpClient } = await import("../auth/httpClient");
const { tokenStorage } = await import("../auth/tokenStorage");
const { getJournal, batchUpdateJournalEntries, updateJournalStudentSummary } = await import("./endpoints");

const mock = new MockAdapter(httpClient);

beforeEach(() => {
  mock.reset();
  tokenStorage.clear();
  tokenStorage.setTokens({ accessToken: "token-abc", refreshToken: "refresh-abc" });
});

afterEach(() => {
  mock.resetHistory();
  vi.restoreAllMocks();
});

describe("getJournal", () => {
  it("fetches the typed per-period journal detail payload as-is", async () => {
    const detail = {
      journal_id: 1,
      course_id: 7,
      period_label: "Week 1",
      period_start: "2026-01-05",
      period_end: "2026-01-11",
      period_type: "week",
      lesson_dates: ["2026-01-05", "2026-01-07"],
      students: [
        {
          student_id: 1,
          first_name: "Ayub",
          last_name: "Gulmadov",
          email: "ayub@example.com",
          color_hex: "#FF0000",
          entries: [
            { id: 1, lesson_date: "2026-01-05", attendance: true, score: 5, comment: null, has_comment: false, version: 1 },
          ],
          summary: {
            id: 1,
            exam_score: 60,
            bonus_score: 0,
            sum_score: 95,
            attendance_count: 5,
            total_lessons: 5,
            version: 1,
          },
        },
      ],
    };
    mock.onGet("/journals/1").reply(200, detail);
    await expect(getJournal(1)).resolves.toEqual(detail);
  });
});

describe("batchUpdateJournalEntries", () => {
  it("puts the array of entry updates and includes the auth header", async () => {
    const payload = [
      { student_id: 1, lesson_date: "2026-01-05", attendance: true, score: 5, comment: null, version: 1 },
      { student_id: 2, lesson_date: "2026-01-05", attendance: false, score: 0, comment: null, version: 0 },
    ];

    const response = { applied: [{ student_id: 1, lesson_date: "2026-01-05", attendance: true, score: 5, comment: null, version: 2 }], conflicts: [], summaries: [] };

    mock.onPut("/journals/1/entries").reply((config) => {
      expect(JSON.parse(config.data)).toEqual(payload);
      expect(config.headers?.Authorization).toBe("Bearer token-abc");
      return [200, response];
    });

    const result = await batchUpdateJournalEntries(1, payload);
    expect(result).toEqual(response);
  });
});

describe("updateJournalStudentSummary", () => {
  it("patches exam/bonus scores for a student and returns the typed summary", async () => {
    const payload = { exam_score: 88, bonus_score: 2, version: 3 };
    const response = {
      id: 10,
      journal_id: 1,
      student_id: 5,
      exam_score: 88,
      bonus_score: 2,
      sum_score: 90,
      attendance_count: 12,
      total_lessons: 14,
      version: 4,
    };

    mock.onPatch("/journals/1/students/5/summary").reply((config) => {
      expect(JSON.parse(config.data)).toEqual(payload);
      return [200, response];
    });

    await expect(updateJournalStudentSummary(1, 5, payload)).resolves.toEqual(response);
  });
});

describe("422 field mapping", () => {
  it("maps validation errors onto fieldErrors keyed by the last loc segment", async () => {
    const { AuthApiError } = await import("../auth/errors");
    mock.onPatch("/journals/1/students/5/summary").reply(422, {
      detail: [{ loc: ["body", "version"], msg: "Version mismatch", type: "value_error" }],
    });

    const err = (await updateJournalStudentSummary(1, 5, { exam_score: 1, bonus_score: 0, version: 0 }).catch(
      (e: unknown) => e,
    )) as InstanceType<typeof AuthApiError>;

    expect(err).toBeInstanceOf(AuthApiError);
    expect(err.fieldErrors.version).toBe("Version mismatch");
  });
});

import MockAdapter from "axios-mock-adapter";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/tokenStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/tokenStorage")>();
  return { ...actual, tokenStorage: actual.createMemoryTokenStorage() };
});

const { httpClient } = await import("../auth/httpClient");
const { tokenStorage } = await import("../auth/tokenStorage");
const { createEnrollment, listEnrollments, withdrawEnrollment } = await import("./endpoints");

const mock = new MockAdapter(httpClient);

const HUGE_PRICE = "436688811034941926602435971499369190867.07";

const sampleEnrollment = {
  id: 1,
  student_id: 10,
  course_id: 20,
  price_at_enrollment: HUGE_PRICE,
  color_hex: "#2A78D6",
  enrolled_at: "2026-01-05T12:00:00Z",
  status: "active",
  is_deleted: false,
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

describe("createEnrollment", () => {
  it("posts EnrollmentCreate and returns the created enrollment, preserving price precision", async () => {
    mock.onPost("/enrollments/").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ student_id: 10, course_id: 20 });
      expect(config.headers?.Authorization).toBe("Bearer token-abc");
      return [201, sampleEnrollment];
    });

    const result = await createEnrollment({ student_id: 10, course_id: 20 });
    expect(result.price_at_enrollment).toBe(HUGE_PRICE);
  });
});

describe("listEnrollments", () => {
  it("gets the paginated enrollment list with query params", async () => {
    mock.onGet("/enrollments/").reply((config) => {
      expect(config.params).toEqual({ page: 1, page_size: 20 });
      return [200, { items: [sampleEnrollment], total: 1, page: 1, page_size: 20, total_pages: 1 }];
    });

    const result = await listEnrollments({ page: 1, page_size: 20 });
    expect(result.items).toEqual([sampleEnrollment]);
  });
});

describe("withdrawEnrollment", () => {
  it("patches the withdraw endpoint with no body", async () => {
    mock.onPatch("/enrollments/1/withdraw").reply(200, { ...sampleEnrollment, status: "withdrawn" });
    const result = await withdrawEnrollment(1);
    expect(result.status).toBe("withdrawn");
  });
});

describe("422 field mapping", () => {
  it("maps validation errors onto fieldErrors keyed by the last loc segment", async () => {
    const { AuthApiError } = await import("../auth/errors");
    mock.onPost("/enrollments/").reply(422, {
      detail: [{ loc: ["body", "course_id"], msg: "Course not found", type: "value_error" }],
    });

    const err = (await createEnrollment({ student_id: 10, course_id: 999 }).catch(
      (e: unknown) => e,
    )) as InstanceType<typeof AuthApiError>;

    expect(err).toBeInstanceOf(AuthApiError);
    expect(err.fieldErrors.course_id).toBe("Course not found");
  });
});

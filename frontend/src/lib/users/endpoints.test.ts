import MockAdapter from "axios-mock-adapter";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/tokenStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/tokenStorage")>();
  return { ...actual, tokenStorage: actual.createMemoryTokenStorage() };
});

const { httpClient } = await import("../auth/httpClient");
const { tokenStorage } = await import("../auth/tokenStorage");
const {
  createUser,
  updateUser,
  deleteUser,
  uploadAvatar,
  getStudents,
  getMentors,
  getMyStudentProfile,
  getStudentProfile,
  getMyMentorProfile,
  getMentorProfile,
} = await import("./endpoints");

const mock = new MockAdapter(httpClient);

const sampleUser = {
  id: 1,
  email: "student@example.com",
  first_name: "Азиз",
  last_name: "Рахимов",
  role: "student",
  date_of_birth: null,
  phone: null,
  parent_telegram_chat_id: null,
  photo_path: null,
  thumbnail_path: null,
  payment_day_of_month: null,
  must_set_password: true,
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

describe("createUser", () => {
  it("posts UserCreate with the Authorization header and returns the created user", async () => {
    mock.onPost("/users/").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({
        email: "student@example.com",
        first_name: "Азиз",
        last_name: "Рахимов",
        role: "student",
      });
      expect(config.headers?.Authorization).toBe("Bearer token-abc");
      return [201, sampleUser];
    });

    await expect(
      createUser({
        email: "student@example.com",
        first_name: "Азиз",
        last_name: "Рахимов",
        role: "student",
      }),
    ).resolves.toEqual(sampleUser);
  });
});

describe("updateUser", () => {
  it("patches the given user by id", async () => {
    mock.onPatch("/users/1").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ phone: "+992901234567" });
      return [200, { ...sampleUser, phone: "+992901234567" }];
    });

    const result = await updateUser(1, { phone: "+992901234567" });
    expect(result.phone).toBe("+992901234567");
  });
});

describe("deleteUser", () => {
  it("deletes by id and resolves on 204", async () => {
    mock.onDelete("/users/1").reply(204);
    await expect(deleteUser(1)).resolves.toBeUndefined();
  });
});

describe("uploadAvatar", () => {
  it("sends a multipart FormData body with field name 'file' and clears the client's JSON default", async () => {
    mock.onPost("/users/1/avatar/").reply((config) => {
      expect(config.data).toBeInstanceOf(FormData);
      expect((config.data as FormData).get("file")).toBeInstanceOf(File);
      // axios-mock-adapter replaces the real transport, so it never runs the
      // adapter code that would set "multipart/form-data; boundary=...";
      // this only proves our own JSON default got cleared, not the final
      // header axios would send for a real request (covered by the smoke test).
      expect(config.headers?.["Content-Type"]).not.toBe("application/json");
      return [200, { ...sampleUser, photo_path: "/media/avatars/1.jpg" }];
    });

    const file = new File(["fake-image-bytes"], "avatar.jpg", { type: "image/jpeg" });
    const result = await uploadAvatar(1, file);
    expect(result.photo_path).toBe("/media/avatars/1.jpg");
  });

  it("threads onUploadProgress and signal through to the request", async () => {
    const postSpy = vi.spyOn(httpClient, "post").mockResolvedValue({ data: sampleUser });
    const controller = new AbortController();
    const onUploadProgress = vi.fn();
    const file = new File(["fake-image-bytes"], "avatar.jpg", { type: "image/jpeg" });

    await uploadAvatar(1, file, { signal: controller.signal, onUploadProgress });

    expect(postSpy).toHaveBeenCalledWith(
      "/users/1/avatar/",
      expect.any(FormData),
      expect.objectContaining({ signal: controller.signal, onUploadProgress }),
    );
  });
});

describe("getStudents", () => {
  it("gets the paginated student list with query params", async () => {
    mock.onGet("/students/").reply((config) => {
      expect(config.params).toEqual({ search: "aziz", page: 2, page_size: 10 });
      return [200, { items: [sampleUser], total: 1, page: 2, page_size: 10, total_pages: 1 }];
    });

    const result = await getStudents({ search: "aziz", page: 2, page_size: 10 });
    expect(result.items).toEqual([sampleUser]);
  });
});

describe("getMentors", () => {
  it("gets the paginated mentor list", async () => {
    mock
      .onGet("/mentors/")
      .reply(200, { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 });

    const result = await getMentors();
    expect(result.total).toBe(0);
  });
});

describe("profile endpoints", () => {
  const studentProfile = {
    user: sampleUser,
    courses: [],
    avg_score: 4.2,
    absences: 1,
    total_lessons: 20,
  };
  const mentorProfile = {
    user: { ...sampleUser, role: "mentor" },
    active_courses: [],
    active_students_count: 5,
    avg_score: 4.7,
  };

  it("getMyStudentProfile fetches /students/me/profile with no id", async () => {
    mock.onGet("/students/me/profile").reply(200, studentProfile);
    await expect(getMyStudentProfile()).resolves.toEqual(studentProfile);
  });

  it("getStudentProfile fetches /students/{id}/profile", async () => {
    mock.onGet("/students/1/profile").reply(200, studentProfile);
    await expect(getStudentProfile(1)).resolves.toEqual(studentProfile);
  });

  it("getMyMentorProfile fetches /mentors/me/profile with no id", async () => {
    mock.onGet("/mentors/me/profile").reply(200, mentorProfile);
    await expect(getMyMentorProfile()).resolves.toEqual(mentorProfile);
  });

  it("getMentorProfile fetches /mentors/{id}/profile", async () => {
    mock.onGet("/mentors/1/profile").reply(200, mentorProfile);
    await expect(getMentorProfile(1)).resolves.toEqual(mentorProfile);
  });
});

describe("403 handling", () => {
  it("does not trigger a refresh for a 403 and surfaces it as AuthApiError", async () => {
    const { AuthApiError } = await import("../auth/errors");
    mock.onDelete("/users/1").reply(403, { detail: "Insufficient permissions" });
    mock.onPost("/auth/refresh").reply(200, {
      access_token: "should-not-be-used",
      refresh_token: null,
      token_type: "bearer",
      must_set_password: false,
    });

    const err = await deleteUser(1).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AuthApiError);
    expect((err as InstanceType<typeof AuthApiError>).status).toBe(403);
    expect(mock.history.post.filter((r) => r.url === "/auth/refresh")).toHaveLength(0);
  });
});

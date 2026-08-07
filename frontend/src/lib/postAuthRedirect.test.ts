import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./users/endpoints", () => ({
  getMyStudentProfile: vi.fn(),
  getMyMentorProfile: vi.fn(),
}));

const { getMyStudentProfile, getMyMentorProfile } = await import("./users/endpoints");
const { resolveLandingPath } = await import("./postAuthRedirect");

beforeEach(() => {
  vi.mocked(getMyStudentProfile).mockReset();
  vi.mocked(getMyMentorProfile).mockReset();
});

describe("resolveLandingPath", () => {
  it("returns the student profile path when getMyStudentProfile succeeds", async () => {
    vi.mocked(getMyStudentProfile).mockResolvedValue({
      user: { id: 42 },
    } as Awaited<ReturnType<typeof getMyStudentProfile>>);

    await expect(resolveLandingPath()).resolves.toBe("/students/42");
    expect(getMyMentorProfile).not.toHaveBeenCalled();
  });

  it("falls back to the mentor profile path when the student lookup fails", async () => {
    vi.mocked(getMyStudentProfile).mockRejectedValue(new Error("not a student"));
    vi.mocked(getMyMentorProfile).mockResolvedValue({
      user: { id: 7 },
    } as Awaited<ReturnType<typeof getMyMentorProfile>>);

    await expect(resolveLandingPath()).resolves.toBe("/mentors/7");
  });

  it("falls back to the dashboard when neither lookup succeeds", async () => {
    vi.mocked(getMyStudentProfile).mockRejectedValue(new Error("nope"));
    vi.mocked(getMyMentorProfile).mockRejectedValue(new Error("nope"));

    await expect(resolveLandingPath()).resolves.toBe("/");
  });
});

import { describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n";
import { AuthApiError, NetworkError } from "../lib/auth/errors";
import { useAuthStore } from "../store/authStore";
import * as userHooks from "../lib/users/hooks";
import * as userEndpoints from "../lib/users/endpoints";
import type { StudentProfileResponse } from "../lib/users/types";
import { mockStudentUser, mockProfileResponse, renderStudentProfile, registerStudentProfileHooks } from "./StudentProfileTestSupport";

registerStudentProfileHooks();

describe("StudentProfile Component", () => {
  it.each([new NetworkError(), new AuthApiError(503, "Unavailable")])("retains matching loaded identity and tab through transient refresh error %s with a working retry", async (refreshError) => {
    vi.mocked(userHooks.useStudentProfile).mockRestore();
    const getProfile = vi.spyOn(userEndpoints, "getStudentProfile").mockResolvedValueOnce(mockProfileResponse).mockRejectedValueOnce(refreshError).mockResolvedValue(mockProfileResponse);
    const user = userEvent.setup();
    const { queryClient } = renderStudentProfile();
    await screen.findByRole("heading", { name: "Rustam Karimov" });
    await user.click(screen.getByRole("tab", { name: "Progress" }));
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["users", "students", "profile", 42] }); });
    expect(screen.getByRole("heading", { name: "Rustam Karimov" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Progress" }).getAttribute("aria-selected")).toBe("true");
    expect((await screen.findByRole("alert")).textContent).toContain(i18n.t("studentProfile:state.refreshError"));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(getProfile).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403, 404])("clears cached identity and dirty edit when refresh returns %s", async (status) => {
    vi.mocked(userHooks.useStudentProfile).mockRestore();
    vi.spyOn(userEndpoints, "getStudentProfile").mockResolvedValueOnce(mockProfileResponse).mockRejectedValueOnce(new AuthApiError(status, "Denied")).mockResolvedValue(mockProfileResponse);
    const user = userEvent.setup();
    const { queryClient } = renderStudentProfile();
    await screen.findByRole("heading", { name: "Rustam Karimov" });
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    await user.type(screen.getByLabelText(/First Name/i), " dirty");
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["users", "students", "profile", 42] }); });
    expect(screen.queryByRole("heading", { name: "Rustam Karimov" })).toBeNull();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByText(i18n.t("studentProfile:state.refreshError"))).toBeNull();
    const expectedKind = status === 404 ? "notFound" : "forbidden";
    expect(screen.getByRole("heading", { name: i18n.t(`studentProfile:state.${expectedKind}Title`) })).toBeDefined();
    expect(screen.getByText(i18n.t(`studentProfile:state.${expectedKind}Body`))).toBeDefined();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByText("Rustam Karimov")).toBeNull();
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
  });

  it("shows a distinct not-found state without Retry for an invalid profile id", () => {
    renderStudentProfile(["/students/abc"]);
    expect(screen.getByRole("heading", { name: i18n.t("studentProfile:state.notFoundTitle") })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows the could-not-load state with Retry and the return link for a 503, and Retry refetches", async () => {
    vi.mocked(userHooks.useStudentProfile).mockRestore();
    const getProfile = vi.spyOn(userEndpoints, "getStudentProfile").mockRejectedValueOnce(new AuthApiError(503, "Unavailable")).mockResolvedValue(mockProfileResponse);
    const user = userEvent.setup();
    renderStudentProfile();
    expect(await screen.findByRole("heading", { name: i18n.t("studentProfile:state.failedTitle") })).toBeDefined();
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Rustam Karimov" });
    expect(getProfile).toHaveBeenCalledTimes(2);
  });

  it("hides loaded data when the auth owner loses profile ownership", async () => {
    const user = userEvent.setup();
    renderStudentProfile();
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    act(() => useAuthStore.setState({ role: "student", userId: 43 }));
    expect(screen.queryByRole("heading", { name: "Rustam Karimov" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("retains dirty identity after a successful independent photo save and failed profile refresh, then Cancel discards only identity", async () => {
    vi.mocked(userHooks.useStudentProfile).mockRestore();
    vi.spyOn(userEndpoints, "getStudentProfile").mockResolvedValueOnce(mockProfileResponse).mockRejectedValue(new AuthApiError(503, "Unavailable"));
    const savedPhotoUser = { ...mockStudentUser, photo_path: "/uploads/saved-photo.jpg", thumbnail_path: "/uploads/saved-thumb.jpg" };
    const uploadPhoto = vi.spyOn(userEndpoints, "uploadAvatar").mockResolvedValue(savedPhotoUser);
    const saveIdentity = vi.fn();
    vi.spyOn(userHooks, "useUpdateUser").mockReturnValue({ mutateAsync: saveIdentity, isPending: false } as unknown as ReturnType<typeof userHooks.useUpdateUser>);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:independent-photo");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
    const user = userEvent.setup();
    const { queryClient } = renderStudentProfile();
    await screen.findByRole("heading", { name: "Rustam Karimov" });
    await user.click(screen.getByRole("tab", { name: "Progress" }));
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    const firstName = screen.getByLabelText<HTMLInputElement>(/First Name/i);
    await user.clear(firstName);
    await user.type(firstName, "Dirty Name");
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error("The photo input must exist");
    await user.upload(fileInput, new File([new Uint8Array([0xff, 0xd8, 0xff])], "avatar.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(queryClient.getQueryState(["users", "students", "profile", 42])?.status).toBe("error"));
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Edit Student" })).toBeDefined();
    expect(screen.getByLabelText<HTMLInputElement>(/First Name/i).value).toBe("Dirty Name");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(saveIdentity).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Edit Student" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Progress" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Rustam Karimov" })).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain(i18n.t("studentProfile:state.refreshError"));
  });

  it("renders error state with functional retry button", async () => {
    const user = userEvent.setup();
    const refetchMock = vi.fn();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => {
      return {
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: refetchMock,
      } as unknown as ReturnType<typeof userHooks.useStudentProfile>;
    });

    renderStudentProfile();

    const retryBtn = screen.getByRole("button", { name: /Retry/i });
    expect(retryBtn).toBeDefined();
    await user.click(retryBtn);

    expect(refetchMock).toHaveBeenCalled();
  });

  it("renders empty courses state explaining no courses are enrolled", () => {
    const emptyCoursesProfile: StudentProfileResponse = {
      ...mockProfileResponse,
      courses: [],
    };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => {
      return {
        data: emptyCoursesProfile,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof userHooks.useStudentProfile>;
    });

    renderStudentProfile();

    expect(screen.getByText("No courses")).toBeDefined();
    expect(screen.getByText(/This student isn't enrolled in any course/i)).toBeDefined();
  });

  it("shows the one-time parent link code from creation state with a copy action, then drops it from history state", async () => {
    renderStudentProfile([
      {
        pathname: "/students/42",
        state: { createdStudentId: 42, createdParentLinkCode: "12A345" },
      },
    ]);

    expect(screen.getByText("12A345")).toBeDefined();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDefined();
  });

  it("renders creation banner when createdStudentId is passed in location state and dismisses it", async () => {
    const user = userEvent.setup();
    renderStudentProfile([
      {
        pathname: "/students/42",
        state: { createdStudentId: 42, createdPasswordSmsDestination: "parent_phone" },
      },
    ]);

    expect(screen.getByText("The password was sent by SMS to the parent phone.")).toBeDefined();

    const closeBtn = screen.getByRole("button", { name: /Close/i });
    await user.click(closeBtn);

    expect(screen.queryByText("The password was sent by SMS to the parent phone.")).toBeNull();
  });
});

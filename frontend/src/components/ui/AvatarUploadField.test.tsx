import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AvatarUploadField,
} from "./AvatarUploadField";
import * as endpoints from "../../lib/users/endpoints";
import type { User } from "../../lib/users/types";
import i18n from "../../i18n";

vi.mock("../../lib/users/endpoints", () => ({
  uploadAvatar: vi.fn(),
}));

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    role: "student",
    first_name: "Mock",
    last_name: "User",
    email: "mock@example.com",
    date_of_birth: null,
    phone: "+992900000000",
    parent_phone: null,
    photo_path: null,
    thumbnail_path: null,
    payment_day_of_month: null,
    must_set_password: false,
    is_deleted: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("AvatarUploadField", () => {
  let queryClient: QueryClient;
  const mockUploadAvatar = vi.mocked(endpoints.uploadAvatar);
  const createdObjectUrls: string[] = [];
  const revokedObjectUrls: string[] = [];

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
    createdObjectUrls.length = 0;
    revokedObjectUrls.length = 0;

    let objectUrlCounter = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      objectUrlCounter += 1;
      const url = `blob:http://localhost/mock-avatar-${objectUrlCounter}`;
      createdObjectUrls.push(url);
      return url;
    });

    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => {
      revokedObjectUrls.push(url);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderField(props: Partial<Parameters<typeof AvatarUploadField>[0]> = {}) {
    const onUploaded = props.onUploaded ?? vi.fn();
    const onBusyChange = props.onBusyChange ?? vi.fn();
    const onOperationStateChange = props.onOperationStateChange ?? vi.fn();

    const view = render(
      <QueryClientProvider client={queryClient}>
        <AvatarUploadField
          userId={props.userId ?? 10}
          role={props.role ?? "student"}
          currentPhotoUrl={
            props.currentPhotoUrl !== undefined
              ? props.currentPhotoUrl
              : "http://example.com/initial.jpg"
          }
          firstName={props.firstName ?? "Ali"}
          lastName={props.lastName ?? "Valiev"}
          onUploaded={onUploaded}
          onBusyChange={onBusyChange}
          onOperationStateChange={onOperationStateChange}
        />
      </QueryClientProvider>,
    );

    return {
      ...view,
      onUploaded,
      onBusyChange,
      onOperationStateChange,
    };
  }

  it("retains prior photo and shows inline retry and reselect when upload fails", async () => {
    const user = userEvent.setup();
    let rejectUpload: (err: unknown) => void = () => {};
    mockUploadAvatar.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectUpload = reject;
        }),
    );

    const initialPhoto = "http://example.com/initial-photo.jpg";
    const { onBusyChange, onOperationStateChange } = renderField({
      currentPhotoUrl: initialPhoto,
    });

    const file = new File(["valid-binary-content"], "avatar.png", {
      type: "image/png",
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(onBusyChange).toHaveBeenCalledWith(true);

    rejectUpload(new Error("Server upload failure"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });

    const avatarImage = screen.getByRole("img") as HTMLImageElement;
    expect(avatarImage.getAttribute("src")).toBe(initialPhoto);

    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose another file" })).toBeTruthy();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);

    expect(onOperationStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "error",
        isBusy: false,
        userId: 10,
        savedUser: null,
      }),
    );
  });

  it("prevents old owner late completion from replacing new owner photo or status", async () => {
    const user = userEvent.setup();
    let resolveFirstOwnerUpload: (res: User) => void = () => {};

    mockUploadAvatar.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirstOwnerUpload = resolve;
        }),
    );

    const onUploaded = vi.fn();
    const onOperationStateChange = vi.fn();

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AvatarUploadField
          userId={101}
          role="student"
          currentPhotoUrl="http://example.com/owner-101.jpg"
          firstName="First"
          lastName="Owner"
          onUploaded={onUploaded}
          onOperationStateChange={onOperationStateChange}
        />
      </QueryClientProvider>,
    );

    const file = new File(["content"], "owner101.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(mockUploadAvatar).toHaveBeenCalledTimes(1);

    rerender(
      <QueryClientProvider client={queryClient}>
        <AvatarUploadField
          userId={202}
          role="student"
          currentPhotoUrl="http://example.com/owner-202.jpg"
          firstName="Second"
          lastName="Owner"
          onUploaded={onUploaded}
          onOperationStateChange={onOperationStateChange}
        />
      </QueryClientProvider>,
    );

    const currentImage = screen.getByRole("img") as HTMLImageElement;
    expect(currentImage.getAttribute("src")).toBe("http://example.com/owner-202.jpg");

    resolveFirstOwnerUpload(
      createMockUser({
        id: 101,
        first_name: "First",
        last_name: "Owner",
        email: "first@example.com",
        photo_path: "/storage/owner-101-new.png",
        thumbnail_path: "/storage/owner-101-new-thumb.png",
      }),
    );

    await waitFor(() => {
      const refreshedImage = screen.getByRole("img") as HTMLImageElement;
      expect(refreshedImage.getAttribute("src")).toBe("http://example.com/owner-202.jpg");
    });

    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.queryByText("Photo saved")).toBeNull();
  });

  it("prevents ABA race when switching owner A to B and back to A", async () => {
    const user = userEvent.setup();
    let resolveFirstSessionA: (res: User) => void = () => {};

    mockUploadAvatar.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirstSessionA = resolve;
        }),
    );

    const onUploaded = vi.fn();
    const onOperationStateChange = vi.fn();

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AvatarUploadField
          userId={505}
          role="student"
          currentPhotoUrl="http://example.com/owner-505-initial.jpg"
          firstName="Student"
          lastName="Five"
          onUploaded={onUploaded}
          onOperationStateChange={onOperationStateChange}
        />
      </QueryClientProvider>,
    );

    const fileA = new File(["contentA"], "sessionA.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, fileA);

    expect(mockUploadAvatar).toHaveBeenCalledTimes(1);

    rerender(
      <QueryClientProvider client={queryClient}>
        <AvatarUploadField
          userId={606}
          role="student"
          currentPhotoUrl="http://example.com/owner-606.jpg"
          firstName="Student"
          lastName="Six"
          onUploaded={onUploaded}
          onOperationStateChange={onOperationStateChange}
        />
      </QueryClientProvider>,
    );

    rerender(
      <QueryClientProvider client={queryClient}>
        <AvatarUploadField
          userId={505}
          role="student"
          currentPhotoUrl="http://example.com/owner-505-initial.jpg"
          firstName="Student"
          lastName="Five"
          onUploaded={onUploaded}
          onOperationStateChange={onOperationStateChange}
        />
      </QueryClientProvider>,
    );

    resolveFirstSessionA(
      createMockUser({
        id: 505,
        first_name: "Student",
        last_name: "Five",
        email: "five@example.com",
        photo_path: "/storage/stale-session-a.png",
        thumbnail_path: "/storage/stale-session-a-thumb.png",
      }),
    );

    await waitFor(() => {
      const refreshedImage = screen.getByRole("img") as HTMLImageElement;
      expect(refreshedImage.getAttribute("src")).toBe("http://example.com/owner-505-initial.jpg");
    });

    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.queryByText("Photo saved")).toBeNull();
  });

  it("preserves active object URL of concurrent owner when previous owner resolves", async () => {
    const user = userEvent.setup();
    let resolveOwnerA: (res: User) => void = () => {};

    mockUploadAvatar.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOwnerA = resolve;
        }),
    );
    mockUploadAvatar.mockImplementationOnce(() => new Promise(() => {}));

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AvatarUploadField
          userId={301}
          role="student"
          currentPhotoUrl={null}
          firstName="Owner"
          lastName="A"
          onUploaded={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const inputA = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(inputA, new File(["a"], "a.png", { type: "image/png" }));

    expect(createdObjectUrls.length).toBe(1);
    const objectUrlA = createdObjectUrls[0];

    rerender(
      <QueryClientProvider client={queryClient}>
        <AvatarUploadField
          userId={302}
          role="student"
          currentPhotoUrl={null}
          firstName="Owner"
          lastName="B"
          onUploaded={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const inputB = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(inputB, new File(["b"], "b.png", { type: "image/png" }));

    expect(createdObjectUrls.length).toBe(2);
    const objectUrlB = createdObjectUrls[1];

    resolveOwnerA(
      createMockUser({
        id: 301,
        first_name: "Owner",
        last_name: "A",
        email: "a@example.com",
        photo_path: "/a.png",
        thumbnail_path: "/a_thumb.png",
      }),
    );

    await waitFor(() => {
      expect(revokedObjectUrls).toContain(objectUrlA);
    });

    expect(revokedObjectUrls).not.toContain(objectUrlB);
    const activeImageB = screen.getByRole("img") as HTMLImageElement;
    expect(activeImageB.getAttribute("src")).toBe(objectUrlB);
  });

  it("blocks duplicate actions synchronously while upload is in progress", async () => {
    const user = userEvent.setup();
    mockUploadAvatar.mockImplementation(() => new Promise(() => {}));

    renderField();

    const file1 = new File(["photo1"], "avatar1.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file1);

    expect(mockUploadAvatar).toHaveBeenCalledTimes(1);
    expect(input.disabled).toBe(true);

    const file2 = new File(["photo2"], "avatar2.png", { type: "image/png" });
    await user.upload(input, file2);

    expect(mockUploadAvatar).toHaveBeenCalledTimes(1);
  });

  it("clears stale selectedFile on client validation rejection preventing retry of old file", async () => {
    const user = userEvent.setup();
    let rejectUpload: (err: unknown) => void = () => {};
    mockUploadAvatar.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectUpload = reject;
        }),
    );

    renderField();

    const validFile = new File(["valid"], "avatar.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, validFile);

    rejectUpload(new Error("Network disconnect"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    });

    const invalidTypeFile = new File(["text"], "document.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [invalidTypeFile] } });

    await waitFor(() => {
      expect(
        screen.getByText("Only JPEG and PNG images are supported"),
      ).toBeTruthy();
    });

    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByRole("button", { name: "Choose another file" })).toBeTruthy();
  });

});

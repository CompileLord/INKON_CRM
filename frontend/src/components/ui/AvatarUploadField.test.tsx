import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AxiosProgressEvent } from "axios";
import {
  AvatarUploadField,
} from "./AvatarUploadField";
import * as endpoints from "../../lib/users/endpoints";
import { AuthApiError } from "../../lib/auth/errors";
import { validateAvatarFile } from "../../lib/users/media";
import type { User } from "../../lib/users/types";
import i18n from "../../i18n";

vi.mock("../../lib/users/endpoints", () => ({
  uploadAvatar: vi.fn(),
}));

function createProgressEvent(loaded: number, total?: number): AxiosProgressEvent {
  return {
    loaded,
    total,
    bytes: loaded,
    lengthComputable: total !== undefined,
  };
}

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    role: "student",
    first_name: "Mock",
    last_name: "User",
    email: "mock@example.com",
    date_of_birth: null,
    phone: "+992900000000",
    parent_telegram_chat_id: null,
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

  it("distinguishes AuthApiError 400 invalid content from unsupported MIME format", async () => {
    const user = userEvent.setup();
    let rejectUpload: (err: unknown) => void = () => {};
    mockUploadAvatar.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectUpload = reject;
        }),
    );

    renderField();

    const file = new File(["bytes"], "corrupt.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    rejectUpload(new AuthApiError(400, "Invalid image file"));

    await waitFor(() => {
      expect(
        screen.getByText("The selected image file is corrupted or invalid"),
      ).toBeTruthy();
    });
  });

  it("distinguishes AuthApiError 400 unsupported format", async () => {
    const user = userEvent.setup();
    let rejectUpload: (err: unknown) => void = () => {};
    mockUploadAvatar.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectUpload = reject;
        }),
    );

    renderField();

    const file = new File(["bytes"], "avatar.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    rejectUpload(new AuthApiError(400, "Unsupported image format. PNG or JPEG only."));

    await waitFor(() => {
      expect(
        screen.getByText("Only JPEG and PNG images are supported"),
      ).toBeTruthy();
    });
  });

  it("distinguishes indeterminate progress from measured progress with tabular format", async () => {
    const user = userEvent.setup();
    let progressCallback: ((evt: AxiosProgressEvent) => void) | undefined;

    mockUploadAvatar.mockImplementation((_id, _file, options) => {
      progressCallback = options?.onUploadProgress;
      return new Promise(() => {});
    });

    renderField();

    const file = new File(["bytes"], "avatar.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(screen.getByText("Uploading...")).toBeTruthy();
    expect(screen.queryByText("%")).toBeNull();

    progressCallback?.(createProgressEvent(450, 1000));

    await waitFor(() => {
      const percentageText = screen.getByText("45%");
      expect(percentageText).toBeTruthy();
      expect(percentageText.className).toContain("tabular-nums");
    });
  });

  it("invokes latest parent callbacks on progress and completion when parent rerenders", async () => {
    const user = userEvent.setup();
    let progressCallback: ((evt: AxiosProgressEvent) => void) | undefined;
    let resolveUpload: (res: User) => void = () => {};

    mockUploadAvatar.mockImplementation((_id, _file, options) => {
      progressCallback = options?.onUploadProgress;
      return new Promise((resolve) => {
        resolveUpload = resolve;
      });
    });

    const initialCallback = vi.fn();
    const updatedCallback = vi.fn();

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AvatarUploadField
          userId={901}
          role="student"
          currentPhotoUrl={null}
          firstName="Callback"
          lastName="Test"
          onUploaded={vi.fn()}
          onOperationStateChange={initialCallback}
        />
      </QueryClientProvider>,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["c"], "c.png", { type: "image/png" }));

    rerender(
      <QueryClientProvider client={queryClient}>
        <AvatarUploadField
          userId={901}
          role="student"
          currentPhotoUrl={null}
          firstName="Callback"
          lastName="Test"
          onUploaded={vi.fn()}
          onOperationStateChange={updatedCallback}
        />
      </QueryClientProvider>,
    );

    progressCallback?.(createProgressEvent(50, 100));

    await waitFor(() => {
      expect(updatedCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "uploading",
          progress: 50,
        }),
      );
    });

    const resolvedUser = createMockUser({
      id: 901,
      first_name: "Callback",
      last_name: "Test",
      email: "callback@example.com",
      photo_path: "/photo.png",
      thumbnail_path: "/thumb.png",
    });

    resolveUpload(resolvedUser);

    await waitFor(() => {
      expect(updatedCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "saved",
          savedUser: resolvedUser,
        }),
      );
    });
  });

  it("provides accessible native button driving file input with readable typography", async () => {
    renderField({ currentPhotoUrl: null });

    const uploadButton = screen.getByRole("button", { name: "Upload photo" });
    expect(uploadButton).toBeTruthy();
    expect(uploadButton.tagName).toBe("BUTTON");
    expect(uploadButton.className).toContain("min-h-[44px]");
    expect(uploadButton.className).toContain("min-w-[44px]");
    expect(uploadButton.className).toContain("text-base");
    expect(uploadButton.className).toContain("md:text-sm");

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    uploadButton.focus();
    expect(document.activeElement).toBe(uploadButton);

    uploadButton.click();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("persists response, updates photo, and invokes callback once", async () => {
    const user = userEvent.setup();
    const mockUser = createMockUser({
      id: 55,
      first_name: "Farrukh",
      last_name: "Karimov",
      email: "farrukh@example.com",
      photo_path: "http://example.com/storage/farrukh-photo.png",
      thumbnail_path: "http://example.com/storage/farrukh-thumb.png",
    });

    mockUploadAvatar.mockResolvedValue(mockUser);

    const { onUploaded, onBusyChange, onOperationStateChange } = renderField({
      userId: 55,
      currentPhotoUrl: null,
    });

    const file = new File(["content"], "farrukh.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("Photo saved")).toBeTruthy();
    });

    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onUploaded).toHaveBeenCalledWith(mockUser);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);

    const updatedImage = screen.getByRole("img") as HTMLImageElement;
    expect(updatedImage.getAttribute("src")).toBe("http://example.com/storage/farrukh-thumb.png");

    expect(onOperationStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "saved",
        isBusy: false,
        userId: 55,
        savedUser: mockUser,
      }),
    );
  });

  it("cleans object URLs on unmount and owner change without leaks", async () => {
    const user = userEvent.setup();
    mockUploadAvatar.mockImplementation(() => new Promise(() => {}));

    const { unmount, rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AvatarUploadField
          userId={11}
          role="student"
          currentPhotoUrl="http://example.com/photo11.jpg"
          firstName="User"
          lastName="Eleven"
          onUploaded={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const file = new File(["data"], "sample.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(createdObjectUrls.length).toBe(1);
    const createdUrl = createdObjectUrls[0];

    rerender(
      <QueryClientProvider client={queryClient}>
        <AvatarUploadField
          userId={12}
          role="student"
          currentPhotoUrl="http://example.com/photo12.jpg"
          firstName="User"
          lastName="Twelve"
          onUploaded={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(revokedObjectUrls).toContain(createdUrl);

    unmount();
    expect(revokedObjectUrls.length).toBeGreaterThanOrEqual(1);
  });

  it("renders correctly in Russian locale and allows retry of held file", async () => {
    await i18n.changeLanguage("ru");
    const user = userEvent.setup();
    let attemptCount = 0;
    mockUploadAvatar.mockImplementation(() => {
      attemptCount += 1;
      if (attemptCount === 1) {
        return Promise.reject(new Error("Network glitch"));
      }
      return Promise.resolve(
        createMockUser({
          id: 77,
          first_name: "Test",
          last_name: "User",
          email: "test@example.com",
          photo_path: "/photo.png",
          thumbnail_path: "/thumb.png",
        }),
      );
    });

    renderField({ userId: 77 });

    const file = new File(["bytes"], "avatar.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });

    const retryButton = screen.getByRole("button", { name: "Повторить" });
    await user.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText("Фотография сохранена")).toBeTruthy();
    });

    expect(mockUploadAvatar).toHaveBeenCalledTimes(2);
  });

  it("renders correctly in Tajik locale and displays translated upload labels", async () => {
    await i18n.changeLanguage("tg");
    mockUploadAvatar.mockImplementation(() => new Promise(() => {}));

    renderField({ userId: 88, currentPhotoUrl: null });

    expect(screen.getByText("Акс")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Бор кардани акс" })).toBeTruthy();
  });

  it("validates files with localized boundary copy and rejects unsupported WebP format", async () => {
    const webpFile = new File(["webp-data"], "test.webp", { type: "image/webp" });
    const jpegFile = new File(["jpeg-data"], "test.jpg", { type: "image/jpeg" });
    const oversizedFile = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" });

    await i18n.changeLanguage("en");
    expect(validateAvatarFile(webpFile)).toBe("Only JPEG and PNG images are supported");
    expect(validateAvatarFile(jpegFile)).toBeNull();
    expect(validateAvatarFile(oversizedFile)).toBe("File is too large (maximum 5 MB)");

    await i18n.changeLanguage("ru");
    expect(validateAvatarFile(webpFile)).toBe("Поддерживаются только изображения JPEG и PNG");
    expect(validateAvatarFile(jpegFile)).toBeNull();
    expect(validateAvatarFile(oversizedFile)).toBe("Файл слишком большой (максимум 5 МБ)");

    await i18n.changeLanguage("tg");
    expect(validateAvatarFile(webpFile)).toBe("Танҳо тасвирҳои JPEG ва PNG дастгирӣ мешаванд");
    expect(validateAvatarFile(jpegFile)).toBeNull();
    expect(validateAvatarFile(oversizedFile)).toBe("Файл хеле калон аст (ҳадди аксар 5 МБ)");
  });
});

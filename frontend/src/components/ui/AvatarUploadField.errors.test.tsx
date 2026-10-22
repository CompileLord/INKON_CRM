import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

describe("AvatarUploadField errors and locales", () => {
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

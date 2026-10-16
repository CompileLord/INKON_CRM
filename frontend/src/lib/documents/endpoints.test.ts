import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/tokenStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/tokenStorage")>();
  return { ...actual, tokenStorage: actual.createMemoryTokenStorage() };
});

const { httpClient } = await import("../auth/httpClient");
const { tokenStorage } = await import("../auth/tokenStorage");
const { downloadDocument, saveDownloadedDocument } = await import("./endpoints");

const mock = new MockAdapter(httpClient);

beforeEach(() => {
  mock.reset();
  tokenStorage.clear();
  tokenStorage.setTokens({ accessToken: "download-token", refreshToken: "download-refresh" });
});

afterEach(() => {
  mock.resetHistory();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("downloadDocument", () => {
  it("downloads the authorized bytes through the authenticated API client as a Blob", async () => {
    const fileContents = new Blob(["%PDF authorized bytes"], { type: "application/octet-stream" });
    mock.onGet("/documents/37/download").reply((config) => {
      expect(config.responseType).toBe("blob");
      expect(config.headers?.Authorization).toBe("Bearer download-token");
      return [200, fileContents, { "content-disposition": "attachment; filename*=UTF-8''report.pdf" }];
    });

    const result = await downloadDocument(37);

    expect(result).toBeInstanceOf(Blob);
    await expect(result.text()).resolves.toBe("%PDF authorized bytes");
    expect(mock.history.get).toHaveLength(1);
    expect(mock.history.get[0].url).toBe("/documents/37/download");
  });
});

describe("saveDownloadedDocument", () => {
  it("uses the display filename and revokes its temporary object URL after activation", () => {
    vi.useFakeTimers();
    const createObjectUrl = vi.fn(() => "blob:authorized-document");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe("blob:authorized-document");
      expect(this.download).toBe("student-évaluation.pdf");
      expect(document.body.contains(this)).toBe(true);
    });
    const fileContents = new Blob(["authorized bytes"]);

    saveDownloadedDocument(fileContents, "student-évaluation.pdf");

    expect(createObjectUrl).toHaveBeenCalledWith(fileContents);
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download="student-évaluation.pdf"]')).toBeNull();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:authorized-document");
  });
});

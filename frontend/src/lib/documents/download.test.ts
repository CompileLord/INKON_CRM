import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosHeaders } from "axios";
import { httpClient } from "../auth/httpClient";
import { downloadDocument } from "./download";

describe("authenticated document downloads", () => {
  const createObjectURL = vi.fn(() => "blob:private-document");
  const revokeObjectURL = vi.fn();
  const content = new Blob(["private bytes"], { type: "application/pdf" });
  const response = { data: content, status: 200, statusText: "OK", headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() } };

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requests authorized document bytes and releases the attachment URL after the browser click", async () => {
    const get = vi.spyOn(httpClient, "get").mockResolvedValue(response);
    let clickedFilename = "";
    let clickedUrl = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedFilename = this.download;
      clickedUrl = this.href;
      expect(this.isConnected).toBe(true);
    });
    const controller = new AbortController();
    await downloadDocument(42, "folder/договор.pdf", controller.signal);
    expect(get).toHaveBeenCalledWith("/documents/42/download", { responseType: "blob", signal: controller.signal });
    expect(createObjectURL).toHaveBeenCalledWith(content);
    expect(clickedFilename).toBe("договор.pdf");
    expect(clickedUrl).toBe("blob:private-document");
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:private-document");
  });

  it("does not expose completed bytes after the request owner aborts", async () => {
    vi.spyOn(httpClient, "get").mockResolvedValue(response);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const controller = new AbortController();
    const pendingDownload = downloadDocument(42, "private.pdf", controller.signal);
    controller.abort();
    await pendingDownload;
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it("propagates denial for the translated retry UI without opening a public URL", async () => {
    const failure = new Error("Forbidden");
    vi.spyOn(httpClient, "get").mockRejectedValue(failure);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await expect(downloadDocument(42, "private.pdf")).rejects.toBe(failure);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});

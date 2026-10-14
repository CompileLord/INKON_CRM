import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { useState } from "react";
import i18n from "../../i18n";
import { DocumentsTab } from "./DocumentsTab";
import { DocumentFileName, DocumentUploadPolicy } from "./documentRules";
import { DocumentListHeader, documentDesktopColumnClasses } from "./DocumentRow";
import { useAuthStore } from "../../store/authStore";
import * as endpoints from "../../lib/documents/endpoints";
import * as downloads from "../../lib/documents/download";
import { AuthApiError } from "../../lib/auth/errors";
import type { Paginated } from "../../lib/pagination";
import type { DocumentItem } from "../../lib/documents/types";

const clients: QueryClient[] = [];

function documentItem(id: number, overrides: Partial<DocumentItem> = {}): DocumentItem {
  return { id, owner_type: "student", owner_id: 7, journal_id: null, file_path: `/private/${id}`, file_name: `report-${id}.pdf`, file_type: "application/pdf", file_size: 2048, uploaded_by_id: 1, uploaded_at: "2026-03-05T10:00:00Z", is_deleted: false, ...overrides };
}

function pageOf(items: DocumentItem[], page = 1, totalPages = 1): Paginated<DocumentItem> {
  return { items, total: items.length, page, page_size: 20, total_pages: totalPages };
}

function sizedFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function OwnerSwitcher({ canManage }: { canManage: boolean }) {
  const [ownerId, setOwnerId] = useState(7);
  return <><button onClick={() => setOwnerId(8)}>Switch owner</button><DocumentsTab ownerType="student" ownerId={ownerId} canManage={canManage} ownerName={`Owner ${ownerId}`} /></>;
}

function setup(canManage = true, ownerId = 7) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  clients.push(queryClient);
  render(<QueryClientProvider client={queryClient}><I18nextProvider i18n={i18n}>{ownerId === 7 ? <OwnerSwitcher canManage={canManage} /> : <DocumentsTab ownerType="student" ownerId={ownerId} canManage={canManage} />}</I18nextProvider></QueryClientProvider>);
  return queryClient;
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("File input must exist for managers");
  return input;
}

function chooseFile(file: File): void {
  fireEvent.change(fileInput(), { target: { files: [file] } });
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useAuthStore.setState({ status: "authenticated", role: "superadmin", userId: 1 });
  vi.spyOn(endpoints, "fetchDocuments").mockImplementation(async params => pageOf([documentItem(1), documentItem(2)], params.page ?? 1, 1));
});

afterEach(async () => {
  cleanup();
  for (const client of clients.splice(0)) { await client.cancelQueries(); client.clear(); }
  vi.restoreAllMocks();
});

describe("Documents pane upload rules", () => {
  it("lists the exact backend families and the 50 MiB limit in the picker and help", async () => {
    setup();
    await screen.findByText("report-1");
    expect(fileInput().accept).toBe(DocumentUploadPolicy.pickerAccept);
    expect(fileInput().accept).not.toMatch(/zip|\.doc(,|$)|msword/);
    expect(DocumentUploadPolicy.maximumBytes).toBe(50 * 1024 * 1024);
    expect(screen.getByText(/up to 50 MB/)).toBeDefined();
  });

  it("accepts exactly 50 MiB and rejects 50 MiB plus one byte client-side without a request", async () => {
    const upload = vi.spyOn(endpoints, "uploadDocument").mockResolvedValue(documentItem(9));
    setup();
    await screen.findByText("report-1");
    chooseFile(sizedFile("limit.pdf", "application/pdf", 50 * 1024 * 1024));
    await screen.findByText(/Saved\./);
    expect(upload).toHaveBeenCalledTimes(1);
    chooseFile(sizedFile("over.pdf", "application/pdf", 50 * 1024 * 1024 + 1));
    expect((await screen.findByRole("alert")).textContent).toContain("larger than 50 MB");
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it.each([["legacy.doc", "application/msword"], ["bundle.zip", "application/zip"]])("rejects %s client-side with translated feedback and allows the same file again", async (name, type) => {
    const upload = vi.spyOn(endpoints, "uploadDocument").mockResolvedValue(documentItem(9));
    setup();
    await screen.findByText("report-1");
    const file = new File(["x"], name, { type });
    chooseFile(file);
    expect((await screen.findByRole("alert")).textContent).toContain("This file type is not accepted");
    expect(fileInput().value).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("alert")).toBeNull();
    chooseFile(file);
    expect((await screen.findByRole("alert")).textContent).toContain("This file type is not accepted");
    expect(upload).not.toHaveBeenCalled();
  });

  it("clears the native input after an accepted request so the same file can be reselected", async () => {
    const upload = vi.spyOn(endpoints, "uploadDocument").mockResolvedValue(documentItem(9));
    setup();
    await screen.findByText("report-1");
    const file = new File(["%PDF"], "same.pdf", { type: "application/pdf" });
    chooseFile(file);
    await screen.findByText(/Saved\./);
    expect(fileInput().value).toBe("");
    chooseFile(file);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  });

  it("shows distinct translated messages for unsupported-type and invalid-content server errors", async () => {
    vi.spyOn(endpoints, "uploadDocument")
      .mockRejectedValueOnce(new AuthApiError(400, "Unsupported file format"))
      .mockRejectedValueOnce(new AuthApiError(400, "Invalid file contents for specified file type"));
    setup();
    await screen.findByText("report-1");
    chooseFile(new File(["x"], "a.pdf", { type: "application/pdf" }));
    const unsupported = (await screen.findByRole("alert")).textContent;
    expect(unsupported).toContain("This file type is not accepted");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByRole("button", { name: "Choose another file" })).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    chooseFile(new File(["x"], "b.png", { type: "image/png" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("do not match its type"));
    expect(screen.getByRole("alert").textContent).not.toContain("not accepted");
  });

  it("persistent Retry reuses the same in-memory file and offers Reselect", async () => {
    const upload = vi.spyOn(endpoints, "uploadDocument").mockRejectedValueOnce(new AuthApiError(503, "Unavailable")).mockResolvedValue(documentItem(9));
    setup();
    await screen.findByText("report-1");
    const file = new File(["%PDF"], "retry.pdf", { type: "application/pdf" });
    chooseFile(file);
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Choose another file" })).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText(/Saved\./);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0][0].file).toBe(file);
    expect(upload.mock.calls[1][0].file).toBe(file);
  });

  it("refetches the list after a network or generic failure and never claims nothing was saved", async () => {
    const fetchDocuments = vi.mocked(endpoints.fetchDocuments);
    vi.spyOn(endpoints, "uploadDocument").mockRejectedValueOnce(new AuthApiError(503, "Unavailable"));
    setup();
    await screen.findByText("report-1");
    const callsBefore = fetchDocuments.mock.calls.length;
    chooseFile(new File(["%PDF"], "maybe.pdf", { type: "application/pdf" }));
    const alert = await screen.findByRole("alert");
    expect(fetchDocuments.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(alert.textContent).toContain("may not have completed");
    expect(alert.textContent).toContain("Check the list below");
    expect(alert.textContent).not.toMatch(/nothing was saved/i);
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });

  it("does not refetch after a deterministic server rejection", async () => {
    const fetchDocuments = vi.mocked(endpoints.fetchDocuments);
    vi.spyOn(endpoints, "uploadDocument").mockRejectedValueOnce(new AuthApiError(400, "Unsupported file format"));
    setup();
    await screen.findByText("report-1");
    const callsBefore = fetchDocuments.mock.calls.length;
    chooseFile(new File(["x"], "a.pdf", { type: "application/pdf" }));
    await screen.findByRole("alert");
    expect(fetchDocuments.mock.calls.length).toBe(callsBefore);
  });

  it("sends one request when a second file arrives during an in-flight upload", async () => {
    let finish: (item: DocumentItem) => void = () => { throw new Error("Upload did not start"); };
    const upload = vi.spyOn(endpoints, "uploadDocument").mockReturnValue(new Promise<DocumentItem>(resolve => { finish = resolve; }));
    setup();
    await screen.findByText("report-1");
    chooseFile(new File(["%PDF"], "first.pdf", { type: "application/pdf" }));
    await screen.findByText("Uploading. The file is saved when this finishes.");
    expect(screen.getByRole("button", { name: "Upload Document" }).hasAttribute("disabled")).toBe(true);
    chooseFile(new File(["%PDF"], "second.pdf", { type: "application/pdf" }));
    expect(upload).toHaveBeenCalledTimes(1);
    await act(async () => { finish(documentItem(9)); });
    await screen.findByText(/Saved\./);
  });

  it("returns to page 1 after a successful upload and shows the new file", async () => {
    const fetchDocuments = vi.mocked(endpoints.fetchDocuments);
    const stored: DocumentItem[] = [documentItem(1)];
    fetchDocuments.mockImplementation(async params => (params.page === 2 ? pageOf([documentItem(1)], 2, 2) : pageOf(stored, 1, 2)));
    vi.spyOn(endpoints, "uploadDocument").mockImplementation(async () => { const created = documentItem(99, { file_name: "fresh-upload.pdf" }); stored.unshift(created); return created; });
    setup();
    await screen.findByText("report-1");
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() => expect(fetchDocuments).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));
    chooseFile(new File(["%PDF"], "fresh-upload.pdf", { type: "application/pdf" }));
    await screen.findByText(/Saved\./);
    await screen.findByText("fresh-upload");
    expect(fetchDocuments.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ page: 1 }));
  });
});

describe("Documents pane ownership and roles", () => {
  it("owner change resets page, upload state and deletion target and ignores a stale completion", async () => {
    let finish: (item: DocumentItem) => void = () => { throw new Error("Upload did not start"); };
    vi.spyOn(endpoints, "uploadDocument").mockReturnValue(new Promise<DocumentItem>(resolve => { finish = resolve; }));
    vi.mocked(endpoints.fetchDocuments).mockImplementation(async params => pageOf([documentItem(1)], params.page ?? 1, 3));
    setup();
    await screen.findByText("report-1");
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() => expect(endpoints.fetchDocuments).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 7, page: 2 })));
    chooseFile(new File(["%PDF"], "slow.pdf", { type: "application/pdf" }));
    await screen.findByText("Uploading. The file is saved when this finishes.");
    await userEvent.click(screen.getByRole("button", { name: "Actions for report-1.pdf" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("dialog")).toBeDefined();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Switch owner" }));
    await waitFor(() => expect(endpoints.fetchDocuments).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 8, page: 1 })));
    expect(screen.queryByText("Uploading. The file is saved when this finishes.")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => { finish(documentItem(50, { file_name: "slow.pdf" })); });
    expect(screen.queryByText(/Saved\./)).toBeNull();
    expect(screen.queryByText(/slow\.pdf/)).toBeNull();
  });

  it("read-only roles get no mutation controls and read-only empty copy", async () => {
    vi.mocked(endpoints.fetchDocuments).mockResolvedValue(pageOf([documentItem(1)]));
    setup(false);
    await screen.findByText("report-1");
    expect(screen.queryByRole("button", { name: "Upload Document" })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Download report-1.pdf" })).toBeDefined();
    cleanup();
    vi.mocked(endpoints.fetchDocuments).mockResolvedValue(pageOf([]));
    setup(false);
    await screen.findByText("No attached documents");
    expect(screen.getByText("Files added by the administration will appear here.")).toBeDefined();
    expect(screen.queryByText(/Upload the first file/)).toBeNull();
  });

  it("managers get upload-directed empty copy", async () => {
    vi.mocked(endpoints.fetchDocuments).mockResolvedValue(pageOf([]));
    setup(true);
    await screen.findByText("No attached documents");
    expect(screen.getByText(/Upload the first file with the Upload Document button/)).toBeDefined();
  });
});

describe("Documents pane deletion, errors and rendering", () => {
  it("names the file in the confirmation and keeps the dialog with an error when deletion fails", async () => {
    const remove = vi.spyOn(endpoints, "deleteDocument").mockRejectedValueOnce(new AuthApiError(503, "Unavailable")).mockResolvedValue(undefined);
    setup();
    await screen.findByText("report-1");
    await userEvent.click(screen.getByRole("button", { name: "Actions for report-1.pdf" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Delete "report-1\.pdf"\?/)).toBeDefined();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await screen.findByText("Failed to delete the document. It was not deleted.");
    expect(screen.getByRole("dialog")).toBeDefined();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(remove).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Document deleted")).toBeDefined();
  });

  it("falls back to the previous page when the last item on page 2 is deleted", async () => {
    const remaining: { page2: DocumentItem[] } = { page2: [documentItem(3)] };
    vi.mocked(endpoints.fetchDocuments).mockImplementation(async params => {
      if (params.page === 2) return remaining.page2.length ? pageOf(remaining.page2, 2, 2) : { items: [], total: 20, page: 2, page_size: 20, total_pages: 1 };
      return pageOf([documentItem(1)], 1, remaining.page2.length ? 2 : 1);
    });
    vi.spyOn(endpoints, "deleteDocument").mockImplementation(async () => { remaining.page2 = []; });
    setup();
    await screen.findByText("report-1");
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    await screen.findByText("report-3");
    await userEvent.click(screen.getByRole("button", { name: "Actions for report-3.pdf" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await screen.findByText("report-1");
    expect(screen.queryByText("report-3")).toBeNull();
    expect(vi.mocked(endpoints.fetchDocuments).mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ page: 1 }));
  });

  it("fetch error Retry preserves the page and recovers", async () => {
    const fetchDocuments = vi.mocked(endpoints.fetchDocuments);
    fetchDocuments.mockImplementation(async params => pageOf([documentItem(1)], params.page ?? 1, 3));
    setup();
    await screen.findByText("report-1");
    fetchDocuments.mockRejectedValueOnce(new AuthApiError(503, "Unavailable"));
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    await screen.findByText("Failed to load documents");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("report-1");
    const lastCall = fetchDocuments.mock.calls.at(-1)?.[0];
    expect(lastCall).toEqual(expect.objectContaining({ page: 2, owner_id: 7 }));
  });

  it("keeps the extension of a very long filename in its own non-wrapping span", async () => {
    const longName = `${"quarterly-attendance-and-grade-summary-".repeat(5)}final.docx`;
    vi.mocked(endpoints.fetchDocuments).mockResolvedValue(pageOf([documentItem(1, { file_name: longName, file_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })]));
    setup();
    const extension = await screen.findByText(".docx");
    expect(extension.className).toContain("whitespace-nowrap");
    expect(extension.parentElement?.textContent).toBe(longName);
    expect(new DocumentFileName("archive.tar.gz").extension).toBe(".gz");
    expect(new DocumentFileName(".hidden").extension).toBe("");
    expect(new DocumentFileName("noext").baseName).toBe("noext");
  });

  it.each([
    ["en", "2 KB"],
    ["ru", "2 КБ"],
    ["tg", "2 КБ"],
  ])("renders localized size units in %s", async (language, expected) => {
    await i18n.changeLanguage(language);
    setup();
    await waitFor(() => expect(document.body.textContent).toContain(expected));
    const sizeCell = Array.from(document.querySelectorAll("li span")).find(element => element.textContent === expected);
    expect(sizeCell?.closest("div")?.className).toContain("tabular-nums");
  });

  it("shows megabytes and bytes with translated units", async () => {
    vi.mocked(endpoints.fetchDocuments).mockResolvedValue(pageOf([documentItem(1, { file_size: 512 }), documentItem(2, { file_size: 5 * 1024 * 1024 })]));
    await i18n.changeLanguage("ru");
    setup();
    await waitFor(() => expect(document.body.textContent).toContain("512 Б"));
    expect(document.body.textContent).toContain("5 МБ");
  });

  it("downloads once at a time and offers a translated retry after failure", async () => {
    let fail: (error: Error) => void = () => { throw new Error("Download did not start"); };
    const download = vi.spyOn(downloads, "downloadDocument").mockReturnValueOnce(new Promise<void>((_resolve, reject) => { fail = reject; })).mockResolvedValue(undefined);
    setup();
    await screen.findByText("report-1");
    const first = screen.getByRole("button", { name: "Download report-1.pdf" });
    await userEvent.click(first);
    await userEvent.click(screen.getByRole("button", { name: "Download report-2.pdf" }));
    expect(download).toHaveBeenCalledTimes(1);
    await act(async () => { fail(new Error("denied")); });
    expect((await screen.findByRole("alert")).textContent).toContain("Could not download report-1.pdf");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
    expect(download.mock.calls[1][1]).toBe("report-1.pdf");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("shares one desktop column template between the header and every row", async () => {
    render(<I18nextProvider i18n={i18n}><DocumentListHeader /></I18nextProvider>);
    const headerTemplate = Array.from(document.querySelector('[aria-hidden="true"]')?.classList ?? []).find(name => name.startsWith("lg:grid-cols-"));
    expect(headerTemplate).toBe(documentDesktopColumnClasses);
    cleanup();
    setup(false);
    await screen.findByText("report-1");
    const rows = Array.from(document.querySelectorAll("li"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(Array.from(row.classList).find(name => name.startsWith("lg:grid-cols-"))).toBe(documentDesktopColumnClasses);
  });

  it("does not claim the new file is already in the list when Saved appears", async () => {
    vi.spyOn(endpoints, "uploadDocument").mockResolvedValue(documentItem(9));
    setup();
    await screen.findByText("report-1");
    chooseFile(new File(["%PDF"], "claim.pdf", { type: "application/pdf" }));
    const status = await screen.findByText(/Saved\./);
    expect(status.textContent).not.toMatch(/top of the list/i);
  });

  it("shows a visible Download label beside the filename-specific accessible name", async () => {
    setup(false);
    await screen.findByText("report-1");
    const button = screen.getByRole("button", { name: "Download report-1.pdf" });
    expect(button.textContent).toBe("Download");
    expect(button.className).toContain("min-h-11");
  });

  it("takes the owner name only from the explicit prop", async () => {
    const queryClient = setup();
    queryClient.setQueryData(["users", "students", "profile", 7], { user: { first_name: "Cached", last_name: "Person" } });
    await screen.findByText("report-1");
    expect(screen.queryByText(/Cached Person/)).toBeNull();
    expect(screen.getByText("Files attached to Owner 7")).toBeDefined();
  });

  it("shows a skeleton with the owner name while loading and the profile context in the heading", async () => {
    vi.mocked(endpoints.fetchDocuments).mockReturnValue(new Promise(() => undefined));
    setup();
    expect(document.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText("Files attached to Owner 7")).toBeDefined();
  });
});

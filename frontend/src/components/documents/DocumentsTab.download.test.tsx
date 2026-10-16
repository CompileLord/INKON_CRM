import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import common from "../../i18n/locales/en/common.json";
import documents from "../../i18n/locales/en/documents.json";
import type { DocumentItem } from "../../lib/documents/types";

vi.mock("../../lib/documents/hooks", () => ({
  useDocuments: () => ({
    data: { items: [documentItem], total: 1, page: 1, page_size: 20, total_pages: 1 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUploadDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../../lib/documents/endpoints", () => ({
  downloadDocument: vi.fn(),
  saveDownloadedDocument: vi.fn(),
}));

const documentItem: DocumentItem = {
  id: 37,
  owner_type: "student",
  owner_id: 12,
  journal_id: null,
  file_path: "/storage/student/12/private.pdf",
  file_name: "private-évaluation.pdf",
  file_type: "application/pdf",
  file_size: 22,
  uploaded_by_id: 1,
  uploaded_at: "2026-10-14T08:00:00Z",
  is_deleted: false,
};

const { downloadDocument, saveDownloadedDocument } = await import("../../lib/documents/endpoints");
const { DocumentsTab } = await import("./DocumentsTab");

async function renderDocumentsTab() {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { common, documents } },
    defaultNS: "documents",
  });
  return render(<I18nextProvider i18n={i18n}><DocumentsTab ownerType="student" ownerId={12} /></I18nextProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DocumentsTab authenticated download", () => {
  it("passes the document ID and original filename to the browser download helper", async () => {
    const user = userEvent.setup();
    const fileBlob = new Blob(["authorized bytes"]);
    vi.mocked(downloadDocument).mockResolvedValue(fileBlob);
    const view = await renderDocumentsTab();

    await user.click(screen.getByRole("button", { name: common.download }));

    expect(downloadDocument).toHaveBeenCalledWith(documentItem.id);
    expect(saveDownloadedDocument).toHaveBeenCalledWith(fileBlob, documentItem.file_name);
    expect(view.queryByRole("link", { name: common.download })).toBeNull();
  });

  it("shows a translated failure result and does not create a browser download", async () => {
    const user = userEvent.setup();
    vi.mocked(downloadDocument).mockRejectedValue(new Error("forbidden"));
    await renderDocumentsTab();

    await user.click(screen.getByRole("button", { name: common.download }));

    expect(await screen.findByText(documents.downloadError)).toBeTruthy();
    expect(saveDownloadedDocument).not.toHaveBeenCalled();
  });
});

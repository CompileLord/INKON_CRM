import { httpClient } from "../auth/httpClient";
import type { Paginated } from "../pagination";
import type { DocumentItem, ListDocumentsParams, UploadDocumentParams } from "./types";

export async function fetchDocuments(params: ListDocumentsParams): Promise<Paginated<DocumentItem>> {
  const searchParams = new URLSearchParams();
  if (params.owner_type) searchParams.append("owner_type", params.owner_type);
  if (params.owner_id !== undefined) searchParams.append("owner_id", params.owner_id.toString());
  if (params.journal_id !== undefined) searchParams.append("journal_id", params.journal_id.toString());
  if (params.page !== undefined) searchParams.append("page", params.page.toString());
  if (params.page_size !== undefined) searchParams.append("page_size", params.page_size.toString());

  const response = await httpClient.get(`/documents/?${searchParams.toString()}`);
  return response.data;
}

export async function uploadDocument(params: UploadDocumentParams): Promise<DocumentItem> {
  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("owner_type", params.owner_type);
  formData.append("owner_id", params.owner_id.toString());
  if (params.journal_id !== undefined) {
    formData.append("journal_id", params.journal_id.toString());
  }

  const response = await httpClient.post("/documents/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
}

export async function deleteDocument(id: number): Promise<void> {
  await httpClient.delete(`/documents/${id}`);
}

export async function downloadDocument(id: number): Promise<Blob> {
  const response = await httpClient.get<Blob>(`/documents/${id}/download`, {
    responseType: "blob",
  });
  return response.data;
}

export function saveDownloadedDocument(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = objectUrl;
  downloadLink.download = fileName;
  downloadLink.hidden = true;
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

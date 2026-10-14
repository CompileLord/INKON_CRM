import { httpClient } from "../auth/httpClient";

export async function downloadDocument(id: number, filename: string, signal?: AbortSignal): Promise<void> {
  const response = await httpClient.get<Blob>(`/documents/${id}/download`, { responseType: "blob", signal });
  if (signal?.aborted) return;
  const objectUrl = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "") || "document";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

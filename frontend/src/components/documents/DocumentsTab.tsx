import { useRef, useState } from "react";
import { FileText, Upload, Trash2, Download, AlertCircle, File, Image as ImageIcon, Archive } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDeleteDocument, useDocuments, useUploadDocument } from "../../lib/documents/hooks";
import { resolveMediaUrl } from "../../lib/users/media";
import type { DocumentItem } from "../../lib/documents/types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Toast } from "../ui/Toast";
import { Pagination } from "../ui/Pagination";

import { useAuthStore } from "../../store/authStore";

interface DocumentsTabProps {
  ownerType: "student" | "mentor";
  ownerId: number;
  canManage?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string) {
  if (fileType.includes("pdf") || fileType.includes("document") || fileType.includes("text")) {
    return <FileText className="text-blue-600" size={20} />;
  }
  if (fileType.includes("image")) {
    return <ImageIcon className="text-emerald-600" size={20} />;
  }
  if (fileType.includes("zip") || fileType.includes("rar") || fileType.includes("tar") || fileType.includes("compressed")) {
    return <Archive className="text-amber-600" size={20} />;
  }
  return <File className="text-slate-500" size={20} />;
}

export function DocumentsTab({ ownerType, ownerId, canManage }: DocumentsTabProps) {
  const { t, i18n } = useTranslation(["documents", "common"]);
  const role = useAuthStore((s) => s.role);
  const allowManage = canManage ?? (role === "superadmin");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean; variant: "success" | "error" }>({
    message: "",
    visible: false,
    variant: "success",
  });

  const { data, isLoading, isError, refetch } = useDocuments({
    owner_type: ownerType,
    owner_id: ownerId,
    page,
    page_size: 20,
  });

  const uploadDoc = useUploadDocument();
  const deleteDoc = useDeleteDocument();

  const showToast = (message: string, variant: "success" | "error" = "success") => {
    setToast({ message, visible: true, variant });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      showToast(t("maxSizeError"), "error");
      return;
    }

    try {
      await uploadDoc.mutateAsync({
        file,
        owner_type: ownerType,
        owner_id: ownerId,
      });
      showToast(t("uploadSuccess"));
    } catch {
      showToast(t("uploadError"), "error");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      showToast(t("deleteSuccess"));
    } catch {
      showToast(t("deleteError"), "error");
    }
  };

  const docs = data?.items ?? [];

  return (
    <div className="flex flex-col gap-5">
      {/* Header & Upload Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <FileText size={20} className="text-maroon" /> {t("title")}
          </h3>
          <p className="text-xs text-muted">{t("subtitle")}</p>
        </div>

        {allowManage && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip"
            />
            <button
              type="button"
              disabled={uploadDoc.isPending}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full bg-maroon px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-maroon/90 disabled:opacity-50"
            >
              <Upload size={14} />
              {uploadDoc.isPending ? t("uploading") : t("uploadDoc")}
            </button>
          </div>
        )}
      </div>

      {/* Content Area */}
      {isLoading && (
        <div className="rounded-xl border border-border-warm bg-card p-6 text-center text-sm text-muted">
          {t("loadingDocs")}
        </div>
      )}

      {!isLoading && isError && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border-warm bg-card p-6 text-center">
          <AlertCircle className="text-rose-500" size={24} />
          <p className="text-sm text-muted">{t("loadError")}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-border-warm bg-card px-3 py-1.5 text-xs font-semibold text-ink hover:bg-strip"
          >
            {t("common:retry")}
          </button>
        </div>
      )}

      {!isLoading && !isError && docs.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border-warm bg-card p-8 text-center">
          <FileText className="text-muted/50" size={36} />
          <p className="text-sm font-semibold text-ink">{t("noDocs")}</p>
          <p className="text-xs text-muted">{t("emptyHelp")}</p>
        </div>
      )}

      {!isLoading && !isError && docs.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((doc) => {
              const fileUrl = resolveMediaUrl(doc.file_path);
              return (
                <div
                  key={doc.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border-warm bg-card p-4 transition-colors hover:bg-row-hover"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 rounded-lg bg-beige/60 p-2 shrink-0">{getFileIcon(doc.file_type)}</div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink" title={doc.file_name}>
                        {doc.file_name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted font-mono">
                        {formatFileSize(doc.file_size)} • {new Date(doc.uploaded_at).toLocaleDateString(i18n.language)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {fileUrl && (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-strip hover:text-ink transition-colors"
                        title={t("common:download", "Скачать / открыть")}
                      >
                        <Download size={15} />
                      </a>
                    )}

                    {allowManage && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(doc)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                        title={t("common:delete", "Удалить")}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {data && data.total_pages > 1 && (
            <div className="flex justify-end pt-2">
              <Pagination page={page} totalPages={data.total_pages} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}

      {/* Confirm Delete */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("deleteTitle", "Удалить документ")}
        message={t("deleteMsg", { fileName: deleteTarget?.file_name, defaultValue: `Удалить документ "${deleteTarget?.file_name}"? Это действие нельзя отменить.` })}
        pending={deleteDoc.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <Toast message={toast.message} show={toast.visible} variant={toast.variant} />
    </div>
  );
}

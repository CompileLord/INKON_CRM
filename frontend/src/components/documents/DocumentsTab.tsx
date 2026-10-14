import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, CheckCircle2, FileText, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDeleteDocument, useDocuments, useUploadDocument } from "../../lib/documents/hooks";
import { downloadDocument } from "../../lib/documents/download";
import type { DocumentItem } from "../../lib/documents/types";
import { useAuthStore } from "../../store/authStore";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Pagination } from "../ui/Pagination";
import { DocumentUploadPolicy } from "./documentRules";
import { DocumentListHeader, DocumentRow, DocumentSkeletonRows } from "./DocumentRow";
import { DocumentUploadStatus, type DocumentUploadState } from "./DocumentUploadStatus";

interface DocumentsTabProps {
  ownerType: "student" | "mentor";
  ownerId: number;
  canManage?: boolean;
  ownerName?: string;
}

const documentsPageSize: number = 20;

export function DocumentsTab({ ownerType, ownerId, canManage, ownerName }: DocumentsTabProps) {
  const role = useAuthStore(state => state.role);
  const userId = useAuthStore(state => state.userId);
  return <DocumentsWorkspace key={`${role}:${userId}:${ownerType}:${ownerId}`} ownerType={ownerType} ownerId={ownerId} canManage={canManage ?? role === "superadmin"} ownerName={ownerName} />;
}

function DocumentsWorkspace({ ownerType, ownerId, canManage, ownerName }: { ownerType: "student" | "mentor"; ownerId: number; canManage: boolean; ownerName?: string }) {
  const { t } = useTranslation(["documents", "common"]);
  const resolvedOwnerName: string | undefined = ownerName;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef<boolean>(true);
  const uploadLockRef = useRef<boolean>(false);
  const pendingFileRef = useRef<File | null>(null);
  const downloadControllerRef = useRef<AbortController | null>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const deleteLockRef = useRef<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [uploadState, setUploadState] = useState<DocumentUploadState>({ phase: "idle" });
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [failedDownload, setFailedDownload] = useState<DocumentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [deleteNotice, setDeleteNotice] = useState<boolean>(false);

  const { data, isLoading, isError, refetch } = useDocuments({ owner_type: ownerType, owner_id: ownerId, page, page_size: documentsPageSize });
  const uploadDocument = useUploadDocument();
  const deleteDocument = useDeleteDocument();

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = useAuthStore.subscribe((current, previous) => {
      if (current.role !== previous.role || current.userId !== previous.userId) downloadControllerRef.current?.abort();
    });
    return () => {
      mountedRef.current = false;
      unsubscribe();
      downloadControllerRef.current?.abort();
      downloadControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (data && data.total_pages >= 1 && page > data.total_pages) setPage(data.total_pages);
  }, [data, page]);

  const sendFile = async (file: File) => {
    if (uploadLockRef.current) return;
    uploadLockRef.current = true;
    pendingFileRef.current = file;
    setUploadState({ phase: "uploading", fileName: file.name });
    try {
      await uploadDocument.mutateAsync({ file, owner_type: ownerType, owner_id: ownerId });
      if (!mountedRef.current) return;
      pendingFileRef.current = null;
      setPage(1);
      setUploadState({ phase: "saved", fileName: file.name });
    } catch (error) {
      if (!mountedRef.current) return;
      const failure = DocumentUploadPolicy.failureFor(error);
      if (failure === "network" || failure === "generic") await refetch().catch(() => undefined);
      if (!mountedRef.current) return;
      setUploadState({ phase: "error", fileName: file.name, reason: failure, retryable: failure === "network" || failure === "generic" });
    } finally {
      uploadLockRef.current = false;
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file: File | undefined = input.files?.[0];
    input.value = "";
    if (!file || uploadLockRef.current) return;
    const rejection = DocumentUploadPolicy.rejectionFor(file);
    if (rejection) {
      pendingFileRef.current = null;
      setUploadState({ phase: "error", fileName: file.name, reason: rejection, retryable: false });
      return;
    }
    void sendFile(file);
  };

  const retryUpload = () => {
    const file: File | null = pendingFileRef.current;
    if (file) void sendFile(file);
  };

  const reselectFile = () => fileInputRef.current?.click();

  const startDownload = async (document: DocumentItem) => {
    if (downloadControllerRef.current && !downloadControllerRef.current.signal.aborted) return;
    const controller = new AbortController();
    downloadControllerRef.current = controller;
    setDownloadingId(document.id);
    setFailedDownload(null);
    try {
      await downloadDocument(document.id, document.file_name, controller.signal);
    } catch {
      if (!controller.signal.aborted && mountedRef.current) setFailedDownload(document);
    } finally {
      if (downloadControllerRef.current === controller) {
        downloadControllerRef.current = null;
        if (mountedRef.current) setDownloadingId(null);
      }
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteLockRef.current) return;
    deleteLockRef.current = true;
    setDeleteError(undefined);
    const target: DocumentItem = deleteTarget;
    const wasLastOnPage: boolean = (data?.items.length ?? 0) === 1 && page > 1;
    try {
      await deleteDocument.mutateAsync(target.id);
      if (!mountedRef.current) return;
      if (wasLastOnPage) setPage(page - 1);
      setDeleteTarget(null);
      setDeleteNotice(true);
    } catch {
      if (mountedRef.current) setDeleteError(t("deleteError"));
    } finally {
      deleteLockRef.current = false;
    }
  };

  const documents: DocumentItem[] = data?.items ?? [];
  const showList: boolean = !isLoading && !isError && documents.length > 0;
  const showEmpty: boolean = !isLoading && !isError && documents.length === 0;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink"><FileText size={20} className="shrink-0 text-nav" />{t("title")}</h2>
          <p className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{resolvedOwnerName ? t("subtitleNamed", { owner: resolvedOwnerName }) : t("subtitle")}</p>
        </div>
        {canManage && <div className="flex min-w-0 flex-col items-start gap-1 sm:items-end">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept={DocumentUploadPolicy.pickerAccept} tabIndex={-1} aria-hidden="true" />
          <Button type="button" disabled={uploadState.phase === "uploading"} onClick={reselectFile}><Upload size={16} />{t("uploadDoc")}</Button>
          <p id="documents-upload-help" className="max-w-xs text-xs text-muted sm:text-right">{t("uploadHelp")}</p>
        </div>}
      </div>

      {canManage && <DocumentUploadStatus state={uploadState} ownerName={resolvedOwnerName} onRetry={retryUpload} onReselect={reselectFile} onDismiss={() => setUploadState({ phase: "idle" })} />}

      {deleteNotice && <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-sm text-ink">
        <span className="flex min-w-0 items-center gap-2"><CheckCircle2 size={16} className="shrink-0 text-success" />{t("deleteSuccess")}</span>
        <Button variant="secondary" onClick={() => setDeleteNotice(false)}>{t("common:close")}</Button>
      </div>}

      {failedDownload && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-card p-3 text-sm text-destructive">
        <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t("downloadErrorNamed", { filename: failedDownload.file_name })}</p>
        <div className="flex gap-2">
          <Button variant="primary" disabled={downloadingId !== null} onClick={() => void startDownload(failedDownload)}>{t("common:retry")}</Button>
          <Button variant="secondary" onClick={() => setFailedDownload(null)}>{t("common:close")}</Button>
        </div>
      </div>}

      {isLoading && <div role="status" aria-busy="true" className="rounded-2xl border border-border-warm bg-card">
        <div className="flex items-center gap-2 px-4 pt-4 text-sm text-muted"><BrandActivityIndicator size={20} />{t("loadingDocs")}</div>
        <DocumentListHeader />
        <ul className="divide-y divide-border"><DocumentSkeletonRows /></ul>
      </div>}

      {!isLoading && isError && <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-border-warm bg-card p-6 text-center">
        <AlertCircle className="text-destructive" size={24} />
        <p className="text-sm text-muted">{t("loadError")}</p>
        <Button variant="secondary" onClick={() => void refetch()}>{t("common:retry")}</Button>
      </div>}

      {showEmpty && <div className="flex flex-col items-center gap-2 rounded-2xl border border-border-warm bg-card p-8 text-center">
        <FileText className="text-muted" size={32} />
        <p className="text-sm font-semibold text-ink">{t("noDocs")}</p>
        <p className="max-w-md text-xs text-muted">{canManage ? t("emptyHelpManage") : t("emptyHelpReadOnly")}</p>
      </div>}

      {showList && <div className="flex min-w-0 flex-col gap-4">
        <div className="rounded-2xl border border-border-warm bg-card">
          <DocumentListHeader />
          <ul className="divide-y divide-border">
            {documents.map(document => <DocumentRow key={document.id} document={document} canManage={canManage} downloading={downloadingId === document.id} downloadLocked={downloadingId !== null} onDownload={item => void startDownload(item)} onDelete={(item, trigger) => { deleteTriggerRef.current = trigger; setDeleteError(undefined); setDeleteTarget(item); }} />)}
          </ul>
        </div>
        {data && data.total_pages > 1 && <div className="flex justify-end"><Pagination page={page} totalPages={data.total_pages} onPageChange={setPage} /></div>}
      </div>}

      <ConfirmDialog
        open={deleteTarget !== null && canManage}
        title={t("deleteTitle")}
        message={deleteTarget ? t("deleteMsg", { fileName: deleteTarget.file_name }) : ""}
        pending={deleteDocument.isPending}
        errorMessage={deleteError}
        finalFocus={deleteTriggerRef}
        onConfirm={() => void confirmDelete()}
        onCancel={() => { setDeleteTarget(null); setDeleteError(undefined); }}
      />
    </div>
  );
}

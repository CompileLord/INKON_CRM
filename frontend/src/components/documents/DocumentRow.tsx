import { Download, FileText, Image as ImageIcon, Music } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../i18n/formatters";
import type { DocumentItem } from "../../lib/documents/types";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";
import { DocumentFileName, DocumentSizeFormatter } from "./documentRules";
import { DocumentRowMenu } from "./DocumentRowMenu";

export const documentDesktopColumnClasses: string = "lg:grid-cols-[minmax(0,1fr)_96px_128px_176px]";

export const documentRowGridClasses: string =
  `grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 p-4 ${documentDesktopColumnClasses} lg:items-center lg:gap-y-0 lg:px-4 lg:py-3`;

function TypeIcon({ fileType }: { fileType: string }) {
  const Icon = fileType.startsWith("image") ? ImageIcon : fileType.startsWith("audio") ? Music : FileText;
  return <div aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-beige text-nav"><Icon size={18} /></div>;
}

export function DocumentListHeader() {
  const { t } = useTranslation("documents");
  return <div aria-hidden="true" className={`hidden gap-x-3 border-b border-border px-4 py-2 text-xs font-medium text-label lg:grid ${documentDesktopColumnClasses}`}>
    <span>{t("columns.name")}</span><span>{t("columns.size")}</span><span>{t("columns.uploaded")}</span><span />
  </div>;
}

interface DocumentRowProps {
  document: DocumentItem;
  canManage: boolean;
  downloading: boolean;
  downloadLocked: boolean;
  onDownload: (document: DocumentItem) => void;
  onDelete: (document: DocumentItem, trigger: HTMLElement | null) => void;
}

export function DocumentRow({ document, canManage, downloading, downloadLocked, onDownload, onDelete }: DocumentRowProps) {
  const { t, i18n } = useTranslation(["documents", "common"]);
  const name = new DocumentFileName(document.file_name);
  const size = new DocumentSizeFormatter(t, i18n.language).format(document.file_size);
  return (
    <li className={documentRowGridClasses}>
      <div className="col-start-1 row-start-1 lg:hidden"><TypeIcon fileType={document.file_type} /></div>
      <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-3 lg:col-start-1">
        <div className="hidden lg:block"><TypeIcon fileType={document.file_type} /></div>
        <p className="min-w-0 text-sm font-semibold leading-5 text-ink">
          <span className="[overflow-wrap:anywhere]">{name.baseName}</span><span className="whitespace-nowrap">{name.extension}</span>
        </p>
      </div>
      <div className="col-start-2 row-start-2 flex min-w-0 flex-wrap gap-x-2 text-xs text-muted tabular-nums lg:contents">
        <span className="lg:col-start-2 lg:row-start-1 lg:text-sm">{size}</span>
        <span aria-hidden="true" className="lg:hidden">·</span>
        <span className="lg:col-start-3 lg:row-start-1 lg:text-sm">{formatDate(document.uploaded_at, i18n.language)}</span>
      </div>
      <div className="col-start-3 row-span-2 row-start-1 flex items-center justify-end gap-1 max-sm:col-start-2 max-sm:row-span-1 max-sm:row-start-3 max-sm:justify-start lg:col-start-4 lg:row-span-1">
        <button
          type="button"
          onClick={() => onDownload(document)}
          disabled={downloadLocked}
          aria-busy={downloading}
          aria-label={t("downloadNamed", { filename: document.file_name })}
          title={downloading ? t("downloading") : t("common:download")}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-medium text-nav hover:bg-strip hover:text-ink motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {downloading ? <BrandActivityIndicator size={20} /> : <Download size={18} />}
          <span>{downloading ? t("downloading") : t("common:download")}</span>
        </button>
        {canManage && <DocumentRowMenu document={document} onDelete={onDelete} />}
      </div>
    </li>
  );
}

export function DocumentSkeletonRows() {
  return <>{[0, 1, 2, 3].map(index => (
    <li key={index} aria-hidden="true" className={`${documentRowGridClasses} motion-safe:animate-pulse`}>
      <div className="col-start-1 row-start-1 h-8 w-8 rounded-lg bg-beige lg:hidden" />
      <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-3 lg:col-start-1">
        <div className="hidden h-8 w-8 shrink-0 rounded-lg bg-beige lg:block" />
        <div className="h-5 w-full max-w-64 rounded bg-beige" />
      </div>
      <div className="col-start-2 row-start-2 flex gap-2 lg:contents">
        <div className="h-4 w-14 rounded bg-beige lg:col-start-2 lg:row-start-1" />
        <div className="h-4 w-20 rounded bg-beige lg:col-start-3 lg:row-start-1" />
      </div>
      <div className="col-start-3 row-span-2 row-start-1 flex gap-1 max-sm:col-start-2 max-sm:row-span-1 max-sm:row-start-3 lg:col-start-4 lg:row-span-1">
        <div className="h-11 w-11 rounded-[10px] bg-beige" /><div className="h-11 w-11 rounded-[10px] bg-beige" />
      </div>
    </li>
  ))}</>;
}

import type { TFunction } from "i18next";
import { AuthApiError, NetworkError } from "../../lib/auth/errors";
import { formatNumber } from "../../i18n/formatters";

export type DocumentRejection = "tooLarge" | "unsupportedType";
export type DocumentUploadFailure = "tooLarge" | "unsupportedType" | "invalidContent" | "network" | "generic";

export class DocumentUploadPolicy {
  static readonly maximumBytes: number = 50 * 1024 * 1024;
  static readonly acceptedMimeFamilies: readonly string[] = [
    "audio",
    "image",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];
  static readonly pickerAccept: string = [
    "audio/*",
    "image/*",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    ".pdf",
    ".docx",
    ".txt",
  ].join(",");

  static rejectionFor(file: File): DocumentRejection | null {
    if (file.size > DocumentUploadPolicy.maximumBytes) return "tooLarge";
    const accepted: boolean = DocumentUploadPolicy.acceptedMimeFamilies.some(family => file.type.startsWith(family));
    return accepted ? null : "unsupportedType";
  }

  static failureFor(error: unknown): DocumentUploadFailure {
    if (error instanceof NetworkError) return "network";
    if (!(error instanceof AuthApiError)) return "generic";
    if (error.status === 413) return "tooLarge";
    const detail: string = typeof error.detail === "string" ? error.detail : "";
    if (error.status === 400 && detail.startsWith("Unsupported file format")) return "unsupportedType";
    if (error.status === 400 && detail.startsWith("Invalid file contents")) return "invalidContent";
    return "generic";
  }
}

export class DocumentFileName {
  readonly baseName: string;
  readonly extension: string;

  constructor(fileName: string) {
    const lastSegment: string = fileName.split(/[\\/]/).pop() ?? fileName;
    const dotIndex: number = lastSegment.lastIndexOf(".");
    const hasExtension: boolean = dotIndex > 0 && dotIndex < lastSegment.length - 1;
    this.baseName = hasExtension ? lastSegment.slice(0, dotIndex) : lastSegment;
    this.extension = hasExtension ? lastSegment.slice(dotIndex) : "";
  }
}

export class DocumentSizeFormatter {
  private readonly translate: TFunction;
  private readonly language: string;

  constructor(translate: TFunction, language: string) {
    this.translate = translate;
    this.language = language;
  }

  format(bytes: number): string {
    const number = (value: number): string => formatNumber(value, this.language, { maximumFractionDigits: 1 });
    if (bytes < 1024) return this.translate("documents:size.bytes", { value: number(bytes) });
    if (bytes < 1024 * 1024) return this.translate("documents:size.kilobytes", { value: number(bytes / 1024) });
    return this.translate("documents:size.megabytes", { value: number(bytes / (1024 * 1024)) });
  }
}

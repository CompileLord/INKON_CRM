import { useState, useRef, useEffect, type ChangeEvent, type DragEvent } from "react";
import { Upload, X, ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { resolveMediaUrl } from "../../lib/users/media";

interface CourseImageUploadFieldProps {
  courseId?: number;
  currentPhotoPath?: string | null;
  selectedFile?: File | null;
  disabled?: boolean;
  onFileSelected?: (file: File | null) => void;
}

export function CourseImageUploadField({
  currentPhotoPath,
  selectedFile,
  disabled = false,
  onFileSelected,
}: CourseImageUploadFieldProps) {
  const { t } = useTranslation(["courses", "common"]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedFile) {
      try {
        const objectUrl = URL.createObjectURL(selectedFile);
        setPreviewUrl(objectUrl);
        return () => {
          URL.revokeObjectURL?.(objectUrl);
        };
      } catch {
        setPreviewUrl(null);
      }
    } else {
      setPreviewUrl(null);
    }
  }, [selectedFile]);

  const currentMediaUrl = resolveMediaUrl(currentPhotoPath);
  const displayUrl = previewUrl || currentMediaUrl;

  useEffect(() => {
    setImageError(false);
  }, [displayUrl]);

  const validateAndProcessFile = (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(t("form.imageFormatError"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t("form.imageSizeError"));
      return;
    }

    setError(null);
    if (onFileSelected) {
      onFileSelected(file);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndProcessFile(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndProcessFile(file);
    }
  };

  const handleRemoveSelected = () => {
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (onFileSelected) {
      onFileSelected(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-ink">
          {t("form.imageSection")}{" "}
          <span className="text-xs font-normal text-muted">({t("form.imageOptional")})</span>
        </label>
        <span className="text-xs text-muted">{t("form.imageFormats")}</span>
      </div>

      <div
        data-testid="course-image-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center min-h-[140px] rounded-xl border-2 border-dashed overflow-hidden motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${
          disabled ? "pointer-events-none opacity-50" : ""
        } ${
          isDragging
            ? "border-accent bg-accent/10"
            : displayUrl
            ? "border-border-warm bg-card"
            : "border-border-warm bg-beige/40 hover:bg-beige/70"
        }`}
      >
        <input
          ref={fileInputRef}
          id="course-cover-image-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          disabled={disabled}
          className="sr-only"
          aria-label={t("form.imageSection")}
        />

        {displayUrl ? (
          <div className="relative w-full h-40 group">
            {!imageError ? (
              <img
                src={displayUrl}
                alt={t("form.imageSection")}
                onError={() => setImageError(true)}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full bg-strip text-muted gap-2">
                <ImageOff size={28} />
                <span className="text-xs">{t("form.imageSection")}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-ink/40 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-out flex items-center justify-center gap-3 p-3">
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="min-h-11 px-4 py-2 rounded-lg bg-card text-xs font-semibold text-ink shadow-md hover:bg-strip motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("form.imageChange")}
              </button>
              {selectedFile ? (
                <button
                  type="button"
                  aria-label={t("form.imageRemove")}
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveSelected();
                  }}
                  className="min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-card text-destructive shadow-md hover:bg-strip motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X size={18} />
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <label
            htmlFor="course-cover-image-input"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className="flex flex-col items-center p-4 text-center cursor-pointer w-full h-full justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-strip text-ink mb-2">
              <Upload size={20} />
            </div>
            <span className="min-h-11 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-card text-xs font-semibold text-ink border border-border-warm shadow-xs hover:bg-strip motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]">
              {t("form.imageUploadDrop")}
            </span>
            <span className="text-[11px] text-muted mt-2">{t("form.imageFormats")}</span>
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

import { useState, useRef, useEffect, type ChangeEvent, type DragEvent } from "react";
import { Upload, X } from "lucide-react";
import { resolveMediaUrl } from "../../lib/users/media";

interface CourseImageUploadFieldProps {
  courseId?: number;
  currentPhotoPath?: string | null;
  onPhotoUploaded?: (photoPath: string) => void;
  onFileSelected?: (file: File | null) => void;
}

export function CourseImageUploadField({
  courseId: _courseId,
  currentPhotoPath,
  onPhotoUploaded: _onPhotoUploaded,
  onFileSelected,
}: CourseImageUploadFieldProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke previous object URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const currentMediaUrl = resolveMediaUrl(currentPhotoPath);
  const displayUrl = previewUrl || currentMediaUrl;

  const validateAndProcessFile = (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Формат файла должен быть JPEG, PNG или WEBP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Максимальный размер изображения: 5 МБ");
      return;
    }

    setError(null);
    // Revoke previous object URL before creating a new one
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    if (onFileSelected) {
      onFileSelected(file);
    }
    // Upload is deferred to the form's onSubmit handler so it happens
    // exactly once after the course record is created/updated.
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndProcessFile(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndProcessFile(file);
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (onFileSelected) {
      onFileSelected(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-ink flex items-center justify-between">
        <span>Обложка курса (Изображение)</span>
        <span className="text-xs text-muted font-normal">JPEG, PNG, WEBP до 5MB</span>
      </label>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center min-h-[140px] rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden group ${
          isDragging
            ? "border-blue-500 bg-blue-50/50"
            : displayUrl
            ? "border-border-warm bg-card"
            : "border-border-warm bg-beige/40 hover:bg-beige/70 hover:border-border-warm"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />

        {displayUrl ? (
          <div className="relative w-full h-36 group">
            <img
              src={displayUrl}
              alt="Course Cover"
              className="w-full h-full object-cover rounded-lg"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-3 py-1.5 rounded-lg bg-white/90 text-xs font-semibold text-ink hover:bg-white transition-colors"
              >
                Изменить
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
                className="p-1.5 rounded-lg bg-red-600/90 text-white hover:bg-red-600 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center p-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 mb-2 group-hover:scale-110 transition-transform">
              <Upload size={18} />
            </div>
            <p className="text-sm font-medium text-ink">
              Нажмите или перетащите файл изображения
            </p>
            <p className="text-xs text-muted mt-0.5">
              Изображение будет отображаться в карточке курса
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  );
}

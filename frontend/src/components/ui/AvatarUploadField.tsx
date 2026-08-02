import { useRef, useState, type ChangeEvent } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "./PersonAvatar";
import { validateAvatarFile } from "../../lib/users/media";
import { useUploadAvatar } from "../../lib/users/hooks";
import type { User } from "../../lib/users/types";

interface AvatarUploadFieldProps {
  userId: number;
  role: "student" | "mentor";
  currentPhotoUrl: string | null;
  firstName: string;
  lastName: string;
  onUploaded: (user: User) => void;
}

/** Avatar upload needs an existing user id, so this only ever renders in edit mode. */
export function AvatarUploadField({
  userId,
  role,
  currentPhotoUrl,
  firstName,
  lastName,
  onUploaded,
}: AvatarUploadFieldProps) {
  const { t } = useTranslation("common");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadAvatar = useUploadAvatar(role);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validationError = validateAvatarFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(undefined);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setProgress(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    uploadAvatar.mutate(
      {
        id: userId,
        file,
        signal: controller.signal,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            setProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
          }
        },
      },
      {
        onSuccess: (user) => {
          setProgress(null);
          URL.revokeObjectURL(objectUrl);
          setPreviewUrl(null);
          onUploaded(user);
        },
        onError: () => {
          setProgress(null);
          URL.revokeObjectURL(objectUrl);
          setPreviewUrl(null);
          if (controller.signal.aborted) return; // user-initiated cancel, not a real failure
          setError(t("uploadError", "Не удалось загрузить фото"));
        },
      },
    );
  };

  const displayUrl = previewUrl ?? currentPhotoUrl ?? undefined;

  return (
    <div>
      <label className="text-sm font-medium text-ink">{t("photo", "Фото")}</label>
      <div className="mt-1.5 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-warm bg-beige">
          <PersonAvatar firstName={firstName} lastName={lastName} photoUrl={displayUrl} size={64} />
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-border-warm bg-card px-3 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-strip">
            {t("uploadPhoto", "Загрузить фото")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
              disabled={progress !== null}
            />
          </label>
          {progress !== null && (
            <div className="flex w-40 items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-beige">
                <div
                  className="h-full rounded-full bg-maroon transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <button
                type="button"
                onClick={() => abortControllerRef.current?.abort()}
                aria-label={t("cancelUpload", "Отменить загрузку")}
                className="text-muted transition-colors duration-150 hover:text-red-600"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

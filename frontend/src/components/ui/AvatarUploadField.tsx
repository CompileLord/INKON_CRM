import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "./PersonAvatar";
import { BrandActivityIndicator } from "./BrandActivityIndicator";
import { formatNumber } from "../../i18n/formatters";
import { getAvatarValidationError, resolveMediaUrl } from "../../lib/users/media";
import { useUploadAvatar } from "../../lib/users/hooks";
import { AuthApiError } from "../../lib/auth/errors";
import type { User } from "../../lib/users/types";

export type AvatarUploadStatus = "idle" | "uploading" | "saved" | "error";

export interface AvatarOperationState {
  status: AvatarUploadStatus;
  isBusy: boolean;
  userId: number;
  progress: number | null;
  error: string | null;
  savedUser: User | null;
}

export interface AvatarUploadFieldProps {
  userId: number;
  role: "student" | "mentor";
  currentPhotoUrl: string | null;
  firstName: string;
  lastName: string;
  onUploaded: (user: User) => void;
  onBusyChange?: (busy: boolean) => void;
  onOperationStateChange?: (state: AvatarOperationState) => void;
  hideLabel?: boolean;
}

export function AvatarUploadField({
  userId,
  role,
  currentPhotoUrl,
  firstName,
  lastName,
  onUploaded,
  onBusyChange,
  onOperationStateChange,
  hideLabel = false,
}: AvatarUploadFieldProps) {
  const { t } = useTranslation("common");
  const inputId = useId();

  const [savedPhotoUrl, setSavedPhotoUrl] = useState<string | null>(currentPhotoUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<AvatarUploadStatus>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isUploadingRef = useRef<boolean>(false);
  const activeOwnerKeyRef = useRef<string>(`${role}:${userId}`);
  const ownerGenerationRef = useRef<number>(0);
  const operationIdRef = useRef<number>(0);
  const activeObjectUrlsRef = useRef<Set<string>>(new Set());

  const onUploadedRef = useRef(onUploaded);
  const onBusyChangeRef = useRef(onBusyChange);
  const onOperationStateChangeRef = useRef(onOperationStateChange);

  useEffect(() => {
    onUploadedRef.current = onUploaded;
    onBusyChangeRef.current = onBusyChange;
    onOperationStateChangeRef.current = onOperationStateChange;
  });

  const uploadAvatarMutation = useUploadAvatar(role);

  useEffect(() => {
    isMountedRef.current = true;
    const activeObjectUrls: Set<string> = activeObjectUrlsRef.current;
    return () => {
      isMountedRef.current = false;
      for (const url of activeObjectUrls) {
        URL.revokeObjectURL(url);
      }
      activeObjectUrls.clear();
    };
  }, []);

  useEffect(() => {
    const currentOwnerKey = `${role}:${userId}`;
    if (activeOwnerKeyRef.current !== currentOwnerKey) {
      activeOwnerKeyRef.current = currentOwnerKey;
      ownerGenerationRef.current += 1;
      isUploadingRef.current = false;

      for (const url of activeObjectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      activeObjectUrlsRef.current.clear();

      setPreviewUrl(null);
      setSavedPhotoUrl(currentPhotoUrl);
      setStatus("idle");
      setProgress(null);
      setErrorText(null);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      onBusyChangeRef.current?.(false);
      onOperationStateChangeRef.current?.({
        status: "idle",
        isBusy: false,
        userId,
        progress: null,
        error: null,
        savedUser: null,
      });
    } else {
      setSavedPhotoUrl(currentPhotoUrl);
    }
  }, [userId, role, currentPhotoUrl]);

  const executeUpload = (fileToUpload: File) => {
    if (isUploadingRef.current) {
      return;
    }
    isUploadingRef.current = true;

    operationIdRef.current += 1;
    const thisOpId = operationIdRef.current;
    const thisOwnerGen = ownerGenerationRef.current;
    const targetUserId = userId;

    setErrorText(null);
    setStatus("uploading");
    setProgress(null);

    onBusyChangeRef.current?.(true);
    onOperationStateChangeRef.current?.({
      status: "uploading",
      isBusy: true,
      userId: targetUserId,
      progress: null,
      error: null,
      savedUser: null,
    });

    const thisObjectUrl = URL.createObjectURL(fileToUpload);
    activeObjectUrlsRef.current.add(thisObjectUrl);
    setPreviewUrl(thisObjectUrl);

    uploadAvatarMutation.mutate(
      {
        id: targetUserId,
        file: fileToUpload,
        onUploadProgress: (progressEvent) => {
          if (
            !isMountedRef.current ||
            ownerGenerationRef.current !== thisOwnerGen ||
            operationIdRef.current !== thisOpId
          ) {
            return;
          }
          if (progressEvent.total && progressEvent.total > 0) {
            const calculatedPercentage = Math.min(
              100,
              Math.max(
                0,
                Math.round((progressEvent.loaded / progressEvent.total) * 100),
              ),
            );
            setProgress(calculatedPercentage);
            onOperationStateChangeRef.current?.({
              status: "uploading",
              isBusy: true,
              userId: targetUserId,
              progress: calculatedPercentage,
              error: null,
              savedUser: null,
            });
          } else {
            setProgress(null);
          }
        },
      },
      {
        onSuccess: (updatedUser: User) => {
          if (activeObjectUrlsRef.current.has(thisObjectUrl)) {
            URL.revokeObjectURL(thisObjectUrl);
            activeObjectUrlsRef.current.delete(thisObjectUrl);
          }

          if (
            !isMountedRef.current ||
            ownerGenerationRef.current !== thisOwnerGen ||
            operationIdRef.current !== thisOpId
          ) {
            return;
          }

          isUploadingRef.current = false;
          setPreviewUrl(null);
          const nextPhotoUrl = resolveMediaUrl(
            updatedUser.thumbnail_path ?? updatedUser.photo_path,
          );
          setSavedPhotoUrl(nextPhotoUrl);
          setStatus("saved");
          setProgress(null);
          setErrorText(null);

          onBusyChangeRef.current?.(false);
          onOperationStateChangeRef.current?.({
            status: "saved",
            isBusy: false,
            userId: targetUserId,
            progress: null,
            error: null,
            savedUser: updatedUser,
          });
          onUploadedRef.current?.(updatedUser);
        },
        onError: (err: unknown) => {
          if (activeObjectUrlsRef.current.has(thisObjectUrl)) {
            URL.revokeObjectURL(thisObjectUrl);
            activeObjectUrlsRef.current.delete(thisObjectUrl);
          }

          if (
            !isMountedRef.current ||
            ownerGenerationRef.current !== thisOwnerGen ||
            operationIdRef.current !== thisOpId
          ) {
            return;
          }

          isUploadingRef.current = false;
          setPreviewUrl(null);
          setStatus("error");
          setProgress(null);

          let message = t("avatar.uploadError");
          if (err instanceof AuthApiError) {
            if (err.status === 413) {
              message = t("avatar.fileTooLarge");
            } else if (err.status === 400) {
              const detail =
                typeof err.detail === "string" ? err.detail.toLowerCase() : "";
              if (detail.includes("unsupported") || detail.includes("format")) {
                message = t("avatar.invalidType");
              } else if (detail.includes("invalid") || detail.includes("image")) {
                message = t("avatar.invalidContent");
              }
            }
          } else if (err && typeof err === "object" && "response" in err) {
            const response = (
              err as {
                response?: { status?: number; data?: { detail?: string } };
              }
            ).response;
            if (response?.status === 413) {
              message = t("avatar.fileTooLarge");
            } else if (response?.status === 400) {
              const detail =
                typeof response.data?.detail === "string"
                  ? response.data.detail.toLowerCase()
                  : "";
              if (detail.includes("unsupported") || detail.includes("format")) {
                message = t("avatar.invalidType");
              } else if (detail.includes("invalid") || detail.includes("image")) {
                message = t("avatar.invalidContent");
              }
            }
          }
          setErrorText(message);

          onBusyChangeRef.current?.(false);
          onOperationStateChangeRef.current?.({
            status: "error",
            isBusy: false,
            userId: targetUserId,
            progress: null,
            error: message,
            savedUser: null,
          });
        },
      },
    );
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isUploadingRef.current) {
      event.target.value = "";
      return;
    }

    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const validationCode = getAvatarValidationError(file);
    if (validationCode === "invalid_type" || validationCode === "file_too_large") {
      setSelectedFile(null);
      const message =
        validationCode === "invalid_type"
          ? t("avatar.invalidType")
          : t("avatar.fileTooLarge");
      setStatus("error");
      setErrorText(message);
      onBusyChangeRef.current?.(false);
      onOperationStateChangeRef.current?.({
        status: "error",
        isBusy: false,
        userId,
        progress: null,
        error: message,
        savedUser: null,
      });
      return;
    }

    setSelectedFile(file);
    executeUpload(file);
  };

  const handleRetry = () => {
    if (!selectedFile || isUploadingRef.current) {
      return;
    }
    executeUpload(selectedFile);
  };

  const displayUrl = previewUrl ?? savedPhotoUrl ?? currentPhotoUrl ?? undefined;
  const hasPhoto = Boolean(displayUrl);

  return (
    <div className="flex flex-col gap-2">
      <span className={hideLabel ? "sr-only" : "text-sm font-medium text-ink"}>{t("avatar.label")}</span>
      <div className="flex items-center gap-4">
        <div
          data-testid="avatar-preview-container"
          className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-control-border bg-beige shadow-xs"
        >
          <PersonAvatar
            firstName={firstName}
            lastName={lastName}
            photoUrl={displayUrl}
            size={64}
          />
          {status === "uploading" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-cream/75 backdrop-blur-[1px]">
              <BrandActivityIndicator size={20} aria-label={t("avatar.uploading")} />
            </div>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          id={inputId}
          tabIndex={-1}
          aria-hidden="true"
          accept="image/jpeg,image/png"
          className="sr-only"
          onChange={handleFileChange}
          disabled={status === "uploading"}
        />

        <div className="flex flex-col items-start gap-1.5 min-w-0">
          {status === "idle" ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] border border-control-border bg-card px-4 py-2.5 text-base md:text-sm font-medium text-ink shadow-xs motion-safe:transition-[background-color,transform,box-shadow,border-color] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              {hasPhoto ? t("avatar.changePhoto") : t("avatar.uploadPhoto")}
            </button>
          ) : null}

          {status === "uploading" ? (
            <div className="flex flex-col items-start gap-1.5 min-w-[160px]">
              <div className="flex w-full items-center justify-between text-base md:text-sm text-muted">
                <span>{t("avatar.uploading")}</span>
                {progress !== null ? (
                  <span className="tabular-nums font-medium text-ink">
                    {formatNumber(progress / 100, undefined, {
                      style: "percent",
                      maximumFractionDigits: 0,
                    })}
                  </span>
                ) : null}
              </div>
              <div className="h-2 w-full min-w-[160px] overflow-hidden rounded-full bg-beige">
                {progress !== null ? (
                  <div
                    className="h-full w-full rounded-full bg-maroon motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
                    style={{
                      transform: `scaleX(${progress / 100})`,
                      transformOrigin: "left",
                    }}
                  />
                ) : (
                  <div className="h-full w-full rounded-full bg-maroon motion-safe:animate-pulse motion-reduce:opacity-75" />
                )}
              </div>
            </div>
          ) : null}

          {status === "saved" ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-success-surface px-3 py-2 text-base md:text-sm font-medium text-success">
                <Check size={18} aria-hidden="true" className="shrink-0" />
                <span>{t("avatar.saved")}</span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] border border-control-border bg-card px-4 py-2.5 text-base md:text-sm font-medium text-ink shadow-xs motion-safe:transition-[background-color,transform,box-shadow,border-color] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                {t("avatar.changePhoto")}
              </button>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="flex flex-col items-start gap-2">
              <div
                role="alert"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-danger-surface px-3 py-2 text-base md:text-sm font-medium text-destructive"
              >
                <AlertCircle size={18} aria-hidden="true" className="shrink-0" />
                <span>{errorText ?? t("avatar.uploadError")}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedFile ? (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] border border-control-border bg-card px-4 py-2.5 text-base md:text-sm font-medium text-ink shadow-xs motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                  >
                    {t("avatar.retry")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] border border-control-border bg-card px-4 py-2.5 text-base md:text-sm font-medium text-muted shadow-xs motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  {t("avatar.reselect")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

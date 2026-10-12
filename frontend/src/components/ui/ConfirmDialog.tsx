import { type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@base-ui/react/dialog";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "destructive";
  pending?: boolean;
  errorMessage?: string;
  finalFocus?: ComponentProps<typeof Dialog.Popup>["finalFocus"];
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmVariant = "destructive",
  pending = false,
  errorMessage,
  finalFocus,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation("common");

  const handleCancel = () => {
    if (!pending) {
      onCancel();
    }
  };

  const handleConfirm = () => {
    if (!pending) {
      onConfirm();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      title={title}
      finalFocus={finalFocus}
      closeDisabled={pending}
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm text-ink">{message}</p>
        {errorMessage ? (
          <p role="alert" className="text-sm text-destructive break-words">
            {errorMessage}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancel}
            disabled={pending}
          >
            {cancelLabel ?? t("cancel")}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={handleConfirm}
            loading={pending}
            disabled={pending}
          >
            {confirmLabel ?? (confirmVariant === "destructive" ? t("delete") : t("confirm"))}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

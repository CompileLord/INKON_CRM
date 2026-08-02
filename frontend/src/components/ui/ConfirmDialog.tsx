import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation("common");
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="flex flex-col gap-5">
        <p className="text-sm text-ink">{message}</p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
            {cancelLabel ?? t("cancel", "Отмена")}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} loading={pending}>
            {confirmLabel ?? t("delete", "Удалить")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Modal } from "../ui/Modal";

interface AccountAccessLabels {
  title: string;
  password: string;
  show: string;
  hide: string;
  unavailable: string;
}

interface AccountAccessDialogProps {
  open: boolean;
  rawPassword: string | null | undefined;
  labels: AccountAccessLabels;
  onClose: () => void;
}

export function AccountAccessDialog({ open, rawPassword, labels, onClose }: AccountAccessDialogProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false);

  useEffect(() => {
    if (!open) setIsPasswordVisible(false);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={labels.title}>
      <div className="flex items-center gap-2 p-4 text-sm">
        {rawPassword ? (
          <>
            <span className="text-muted">{labels.password}</span>
            <span className="font-mono font-semibold tracking-wider text-ink [overflow-wrap:anywhere]">{isPasswordVisible ? rawPassword : "••••••••"}</span>
            <button
              type="button"
              onClick={() => setIsPasswordVisible((visible: boolean) => !visible)}
              aria-label={isPasswordVisible ? labels.hide : labels.show}
              className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-nav hover:bg-strip hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,color] motion-safe:duration-150 motion-safe:ease-out"
            >
              {isPasswordVisible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </>
        ) : (
          <span className="text-muted">{labels.unavailable}</span>
        )}
      </div>
    </Modal>
  );
}

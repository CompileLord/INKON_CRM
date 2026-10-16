import { useCallback, useEffect, useRef, useState } from "react";

export type TransientToastVariant = "success" | "error";

export interface TransientToastState {
  message: string;
  show: boolean;
  variant: TransientToastVariant;
}

const TOAST_VISIBLE_MILLISECONDS: number = 2500;

export function useTransientToast() {
  const [toast, setToast] = useState<TransientToastState>({ message: "", show: false, variant: "success" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((message: string, variant: TransientToastVariant = "success"): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    setToast({ message, show: true, variant });
    timer.current = setTimeout(() => setToast((current) => ({ ...current, show: false })), TOAST_VISIBLE_MILLISECONDS);
  }, []);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  return { toast, announce };
}

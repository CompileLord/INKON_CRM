import { PaymentEntryDialog, type PaymentEntryProps } from "./PaymentEntryDialog";

interface PaymentModalProps extends PaymentEntryProps {
  isOpen: boolean;
}

export function PaymentModal({ isOpen, ...entry }: PaymentModalProps) {
  return isOpen ? <PaymentEntryDialog {...entry} /> : null;
}

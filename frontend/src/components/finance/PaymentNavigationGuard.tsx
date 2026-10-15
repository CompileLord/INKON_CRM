import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

export interface NavigationDecision {
  proceed: () => void;
  cancel: () => void;
}

interface PaymentNavigationGuardProps {
  active: boolean;
  pending: boolean;
  onRequest: (decision: NavigationDecision) => void;
}

export function PaymentNavigationGuard({ active, pending, onRequest }: PaymentNavigationGuardProps) {
  const blocker = useBlocker(active);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (pending) blocker.reset();
    else onRequest({ proceed: blocker.proceed, cancel: blocker.reset });
  }, [blocker, pending, onRequest]);
  return null;
}

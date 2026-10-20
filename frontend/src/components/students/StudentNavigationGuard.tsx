import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

export interface NavigationDecision {
  proceed: () => void;
  reset: () => void;
}

export function StudentNavigationGuard({
  active,
  onBlock,
}: {
  active: boolean;
  onBlock: (decision: NavigationDecision) => void;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      onBlock({ proceed: blocker.proceed, reset: blocker.reset });
    }
  }, [blocker.state, onBlock]);

  return null;
}

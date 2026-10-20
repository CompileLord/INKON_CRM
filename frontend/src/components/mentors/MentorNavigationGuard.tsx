import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

export interface NavigationDecision {
  proceed: () => void;
  reset: () => void;
}

export function MentorNavigationGuard({
  active,
  onBlock,
  shouldAllowNavigation,
}: {
  active: boolean;
  onBlock: (decision: NavigationDecision) => void;
  shouldAllowNavigation: () => boolean;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && !shouldAllowNavigation() && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      onBlock({ proceed: blocker.proceed, reset: blocker.reset });
    }
  }, [blocker.state, onBlock]);

  return null;
}

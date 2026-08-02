import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { FullscreenSpinner } from "./FullscreenSpinner";

export function GuestRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const mustSetPassword = useAuthStore((s) => s.mustSetPassword);

  if (status === "initializing") return <FullscreenSpinner />;

  if (status === "authenticated") {
    return <Navigate to={mustSetPassword ? "/set-password" : "/"} replace />;
  }

  return <>{children}</>;
}

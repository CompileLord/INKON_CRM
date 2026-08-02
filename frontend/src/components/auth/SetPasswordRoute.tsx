import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { FullscreenSpinner } from "./FullscreenSpinner";

export function SetPasswordRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const mustSetPassword = useAuthStore((s) => s.mustSetPassword);

  if (status === "initializing") return <FullscreenSpinner />;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  if (!mustSetPassword) return <Navigate to="/" replace />;

  return <>{children}</>;
}

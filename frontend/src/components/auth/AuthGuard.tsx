import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { FullscreenSpinner } from "./FullscreenSpinner";

export function AuthGuard() {
  const status = useAuthStore((s) => s.status);
  const mustSetPassword = useAuthStore((s) => s.mustSetPassword);
  const location = useLocation();

  if (status === "initializing") return <FullscreenSpinner />;

  if (status === "unauthenticated") {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  if (mustSetPassword) return <Navigate to="/set-password" replace />;

  return <Outlet />;
}

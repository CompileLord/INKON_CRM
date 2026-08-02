import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { isPathAllowed } from "../../lib/auth/roleAccess";

export function RoleGuard() {
  const role = useAuthStore((s) => s.role);
  const userId = useAuthStore((s) => s.userId);
  const location = useLocation();

  if (!role) return <Outlet />;
  if (!isPathAllowed(role, location.pathname, userId)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

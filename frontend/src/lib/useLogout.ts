import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { logout } from "./auth/endpoints";
import { tokenStorage } from "./auth/tokenStorage";

export function useLogout() {
  const navigate = useNavigate();
  const setUnauthenticated = useAuthStore((s) => s.setUnauthenticated);

  return async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    if (refreshToken) {
      // Best-effort server-side revoke — local logout must proceed either way.
      await logout(refreshToken).catch(() => {});
    }
    setUnauthenticated();
    navigate("/login", { replace: true });
  };
}

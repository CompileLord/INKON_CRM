import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "../../lib/users/hooks";
import { resolveMediaUrl } from "../../lib/users/media";
import type { Role } from "../../lib/users/types";
import { useAuthStore } from "../../store/authStore";
import { PersonAvatar } from "../ui/PersonAvatar";

export class OwnProfileRoute {
  static for(role: Role, userId: number | null): string {
    if (role === "student" && userId !== null) return `/students/${userId}`;
    if (role === "mentor" && userId !== null) return `/mentors/${userId}`;
    return "/settings";
  }
}

interface CurrentUserLinkProps {
  className?: string;
}

export function CurrentUserLink({ className = "" }: CurrentUserLinkProps) {
  const { t } = useTranslation("common");
  const { role, userId } = useAuthStore();
  const { data: user, isLoading } = useCurrentUser();
  if (!role) return null;
  if (isLoading) return <div aria-hidden="true" className={`flex min-h-11 items-center gap-2 px-3 ${className}`}><div className="size-8 rounded-full bg-border motion-safe:animate-pulse" /><div className="h-4 w-24 rounded bg-border motion-safe:animate-pulse" /></div>;
  if (!user) return null;
  const fullName: string = `${user.first_name} ${user.last_name}`.trim();
  return (
    <Link
      to={OwnProfileRoute.for(role, userId)}
      aria-label={`${t("nav.ownProfile")}: ${fullName}`}
      className={`flex min-h-11 min-w-0 items-center gap-2 rounded-[10px] px-3 text-sm font-medium text-ink hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out active:scale-[0.96] ${className}`}
    >
      <PersonAvatar firstName={user.first_name} lastName={user.last_name} photoUrl={resolveMediaUrl(user.thumbnail_path ?? user.photo_path) ?? undefined} size={32} />
      <span className="min-w-0 truncate">{fullName}</span>
    </Link>
  );
}

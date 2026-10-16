import { useMentorProfile } from "../../lib/users/hooks";
import { resolveMediaUrl } from "../../lib/users/media";
import { PersonAvatar } from "../ui/PersonAvatar";

interface TeacherLineProps {
  mentorId: number;
  size?: number;
}

export function TeacherLine({ mentorId, size = 24 }: TeacherLineProps) {
  const { data: profile, isLoading } = useMentorProfile(mentorId);

  if (isLoading) {
    return <div data-testid="teacher-skeleton" className="h-6 w-32 rounded-md bg-beige-dark motion-safe:animate-pulse" />;
  }
  if (!profile) return null;

  const { first_name: firstName, last_name: lastName, thumbnail_path: thumbnailPath, photo_path: photoPath } = profile.user;
  return (
    <span className="flex min-w-0 items-center gap-2" data-testid="teacher-line">
      <PersonAvatar firstName={firstName} lastName={lastName} photoUrl={resolveMediaUrl(thumbnailPath ?? photoPath) ?? undefined} size={size} />
      <span className="min-w-0 truncate text-sm font-medium text-ink">
        {firstName} {lastName}
      </span>
    </span>
  );
}

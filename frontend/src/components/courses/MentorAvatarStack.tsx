import { PersonAvatar } from "../ui/PersonAvatar";
import { resolveMediaUrl } from "../../lib/users/media";

export interface MentorAvatarStackPerson {
  id: number;
  first_name: string;
  last_name: string;
  thumbnail_path?: string | null;
  photo_path?: string | null;
}

interface MentorAvatarStackProps {
  mentors: MentorAvatarStackPerson[];
  max?: number;
}

export function MentorAvatarStack({ mentors, max = 3 }: MentorAvatarStackProps) {
  if (mentors.length === 0) {
    return <span className="text-[13px] text-muted">Менторы не назначены</span>;
  }

  const visible = mentors.slice(0, max);
  const overflow = mentors.length - visible.length;
  const names = mentors
    .slice(0, 2)
    .map((m) => `${m.first_name} ${m.last_name[0]}.`)
    .join(", ");

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex shrink-0 items-center">
        {visible.map((mentor, i) => (
          <div
            key={mentor.id}
            className={`rounded-full border-2 border-white ${i === 0 ? "" : "-ml-2"}`}
            style={{ zIndex: visible.length - i }}
          >
            <PersonAvatar
              firstName={mentor.first_name}
              lastName={mentor.last_name}
              photoUrl={resolveMediaUrl(mentor.thumbnail_path ?? mentor.photo_path) ?? undefined}
              size={28}
            />
          </div>
        ))}
        {overflow > 0 && (
          <div
            className="-ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white bg-beige text-[11px] font-semibold text-nav"
            style={{ zIndex: 0 }}
          >
            +{overflow}
          </div>
        )}
      </div>
      <span className="truncate text-[13px] text-muted">{names}</span>
    </div>
  );
}

import { CourseInitials } from "../../lib/students/CourseInitials";

interface CourseCoverProps {
  photoUrl: string;
  muted?: boolean;
  onFailed: () => void;
}

export function CourseCover({ photoUrl, muted = false, onFailed }: CourseCoverProps) {
  return (
    <div data-testid="course-cover" className="relative aspect-[2/1] w-full overflow-hidden bg-info-surface">
      <img src={photoUrl} alt="" onError={onFailed} className={`h-full w-full object-cover ${muted ? "opacity-75" : ""}`} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-card/70 to-transparent" />
    </div>
  );
}

export function InitialsTile({ title }: { title: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="course-initials"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info-surface text-sm font-semibold text-info"
    >
      {CourseInitials.of(title)}
    </span>
  );
}

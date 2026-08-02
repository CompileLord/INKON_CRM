import { ArrowRight, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatMoney } from "../../lib/money";
import { dateOnlyToDate } from "../../lib/users/dates";
import { MentorAvatarStack } from "./MentorAvatarStack";
import { resolveMediaUrl } from "../../lib/users/media";
import type { CourseResponse } from "../../lib/courses/types";
import type { User } from "../../lib/users/types";

interface CourseCardProps {
  course: CourseResponse;
  mentor?: User;
  justCreated?: boolean;
}

const EXAM_TYPE_META: Record<CourseResponse["exam_type"], { label: string; from: string; to: string; textClass: string }> = {
  weekly: { label: "Еженедельный экзамен", from: "#DBEAFE", to: "#EFF6FF", textClass: "text-blue-600" },
  monthly: { label: "Ежемесячный экзамен", from: "#EDE9FE", to: "#F5F3FF", textClass: "text-violet-600" },
};

function formatDateOnly(dateStr: string): string {
  const date = dateOnlyToDate(dateStr);
  if (!date) return dateStr;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
}

export function CourseCard({ course, mentor, justCreated = false }: CourseCardProps) {
  const navigate = useNavigate();
  const meta = EXAM_TYPE_META[course.exam_type];
  const isActive = course.status === "active";
  const coursePhotoUrl = resolveMediaUrl(course.photo_path);

  return (
    <div
      onClick={() => navigate(`/courses/${course.id}`)}
      className={[
        "group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border-warm bg-card transition-all duration-200",
        "hover:-translate-y-0.75 hover:border-[#DCC9B4] hover:shadow-[0_8px_24px_rgba(139,46,46,0.08)]",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        justCreated ? "animate-[card-scale-in_300ms_ease-out] motion-reduce:animate-none" : "",
      ].join(" ")}
    >
      <div className="relative h-28 shrink-0 overflow-hidden" style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}>
        {coursePhotoUrl ? (
          <img
            src={coursePhotoUrl}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : null}
        <span
          className={[
            "absolute left-3 top-3 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium shadow-xs backdrop-blur-xs",
            isActive ? "bg-green-500/90 text-white" : "bg-gray-800/80 text-white",
          ].join(" ")}
        >
          {isActive ? "Активен" : "Архив"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-5 py-4.5">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${meta.textClass}`}>{meta.label}</span>
        <h3 className="truncate text-[17px] font-semibold text-ink">{course.title}</h3>
        <p className="line-clamp-2 text-[13px] text-muted">{course.description}</p>

        <div className="mt-1 flex items-center gap-1.5 text-[13px] text-nav">
          <Calendar size={14} />
          {formatDateOnly(course.start_date)} – {formatDateOnly(course.end_date)}
        </div>

        <MentorAvatarStack mentors={mentor ? [mentor] : []} />
      </div>

      <div className="flex items-center justify-between border-t border-beige px-5 py-3">
        <span className="whitespace-nowrap text-[15px] font-bold tabular-nums text-maroon">
          {formatMoney(course.price, { suffix: "TJS/мес" })}
        </span>
        <button
          type="button"
          aria-label="Подробнее"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-strip hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

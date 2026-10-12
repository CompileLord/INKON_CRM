import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { MoreVertical, Pencil, Copy, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CourseResponse } from "../../lib/courses/types";

interface AdminCourseMenuProps {
  course: CourseResponse;
  onEdit: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
  onDuplicate: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
  onDelete: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
}

export function AdminCourseMenu({
  course,
  onEdit,
  onDuplicate,
  onDelete,
}: AdminCourseMenuProps) {
  const { t } = useTranslation(["courses", "common"]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const itemClass =
    "flex w-full min-h-[44px] items-center gap-2.5 px-3 py-2 text-sm font-medium text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-strip focus:bg-strip focus-visible:outline-none cursor-pointer select-none";

  return (
    <Menu.Root>
      <Menu.Trigger
        ref={triggerRef}
        type="button"
        aria-label={`${t("courseActions")}: ${course.title}`}
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[10px] text-muted motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 motion-safe:ease-out hover:bg-strip hover:text-ink motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2"
        onClick={(e) => e.stopPropagation()}
      >
        <MoreVertical size={18} />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Menu.Popup
            className="min-w-44 overflow-hidden rounded-xl border border-border bg-card p-1 text-ink shadow-lg motion-safe:animate-[card-scale-in_200ms_ease-out] origin-[var(--transform-origin)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Menu.Item
              className={itemClass}
              onClick={() => onEdit(course, triggerRef.current)}
            >
              <Pencil size={15} className="text-muted shrink-0" />
              <span>{t("edit")}</span>
            </Menu.Item>

            <Menu.Item
              className={itemClass}
              onClick={() => onDuplicate(course, triggerRef.current)}
            >
              <Copy size={15} className="text-muted shrink-0" />
              <span>{t("duplicate")}</span>
            </Menu.Item>

            <div className="my-1 border-t border-border" />

            <Menu.Item
              className={`${itemClass} text-destructive hover:bg-destructive/10 focus:bg-destructive/10`}
              onClick={() => onDelete(course, triggerRef.current)}
            >
              <Trash2 size={15} className="text-destructive shrink-0" />
              <span>{t("delete")}</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { User } from "../../lib/users/types";

interface MentorRowMenuProps {
  mentor: User;
  onEdit: (mentor: User, triggerElement?: HTMLElement | null) => void;
  onDelete: (mentor: User, triggerElement?: HTMLElement | null) => void;
}

export function MentorRowMenu({ mentor, onEdit, onDelete }: MentorRowMenuProps) {
  const { t } = useTranslation(["mentors", "common"]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const itemClass =
    "flex w-full min-h-[44px] items-center gap-2.5 px-3 py-2 text-sm font-medium text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-strip focus:bg-strip focus-visible:outline-none cursor-pointer select-none";

  const mentorFullName = `${mentor.first_name} ${mentor.last_name}`;

  return (
    <Menu.Root>
      <Menu.Trigger
        ref={triggerRef}
        type="button"
        aria-label={`${t("mentorActions")}: ${mentorFullName}`}
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[10px] text-muted motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 motion-safe:ease-out hover:bg-strip hover:text-ink motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2"
        onClick={(event) => event.stopPropagation()}
      >
        <MoreVertical size={18} />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Menu.Popup
            className="min-w-44 overflow-hidden rounded-xl border border-border bg-card p-1 text-ink shadow-lg motion-safe:animate-[card-scale-in_200ms_ease-out] origin-[var(--transform-origin)]"
            onClick={(event) => event.stopPropagation()}
          >
            <Menu.Item
              className={itemClass}
              onClick={() => onEdit(mentor, triggerRef.current)}
            >
              <Pencil size={15} className="text-muted shrink-0" />
              <span>{t("common:edit")}</span>
            </Menu.Item>

            <div className="my-1 border-t border-border" />

            <Menu.Item
              className={`${itemClass} text-destructive hover:bg-destructive/10 focus:bg-destructive/10`}
              onClick={() => onDelete(mentor, triggerRef.current)}
            >
              <Trash2 size={15} className="text-destructive shrink-0" />
              <span>{t("common:delete")}</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

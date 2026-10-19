import { useRef, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { MenuItem } from "../ui/Menu";
import type { CourseListItemResponse, CourseResponse } from "../../lib/courses/types";

export interface CourseMenuHandlers {
  onEdit: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
  onDuplicate: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
  onDelete: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
}

export interface CourseMenu {
  rootRef: RefObject<HTMLDivElement | null>;
  items: readonly MenuItem[];
  label: string;
}

export function useCourseMenu(course: CourseListItemResponse, handlers: CourseMenuHandlers | null, journalAction: (() => void) | null = null): CourseMenu {
  const { t } = useTranslation("courses");
  const navigate = useNavigate();
  const rootRef: RefObject<HTMLDivElement | null> = useRef<HTMLDivElement | null>(null);
  const findTrigger = (): HTMLElement | null => rootRef.current?.querySelector<HTMLElement>('button[aria-haspopup="menu"]') ?? null;
  const journalItems: readonly MenuItem[] = journalAction === null ? [] : [
    { key: "journal", label: t("openJournal"), onSelect: () => { journalAction(); navigate(`/journals/${course.id}`); } },
  ];
  const adminItems: readonly MenuItem[] = handlers === null ? [] : [
    { key: "edit", label: t("edit"), onSelect: () => handlers.onEdit(course, findTrigger()) },
    { key: "duplicate", label: t("duplicate"), onSelect: () => handlers.onDuplicate(course, findTrigger()) },
    { key: "delete", label: t("delete"), destructive: true, onSelect: () => handlers.onDelete(course, findTrigger()) },
  ];
  const items: readonly MenuItem[] = [...journalItems, ...adminItems];
  return { rootRef, items, label: `${t("courseActions")}: ${course.title}` };
}

import { useEffect, useState } from "react";
import { Controller, type Control, type FieldErrors } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Select } from "../ui/Select";
import type { ListboxOption } from "../ui/ListboxPicker";
import { CourseFormField } from "./CourseFormField";
import { useCourseMentorHistory } from "../../lib/courses/hooks";
import { useMentors } from "../../lib/users/hooks";
import type { CourseFormValues } from "../../lib/courseFormSchema";
import type { CourseResponse } from "../../lib/courses/types";
import type { User } from "../../lib/users/types";

interface CourseMentorFieldProps {
  control: Control<CourseFormValues>;
  errors: FieldErrors<CourseFormValues>;
  course?: CourseResponse;
  isEditing: boolean;
  isSuperAdmin: boolean;
  open: boolean;
  disabled: boolean;
}

const MENTOR_PAGE_SIZE: number = 50;

export function CourseMentorField({ control, errors, course, isEditing, isSuperAdmin, open, disabled }: CourseMentorFieldProps) {
  const { t } = useTranslation(["courses", "common"]);
  const [mentorPage, setMentorPage] = useState<number>(1);
  const [loadedMentors, setLoadedMentors] = useState<User[]>([]);
  const [authoritativeTotal, setAuthoritativeTotal] = useState<number | null>(null);

  const { data: mentorsPage, isLoading, isFetching, isError, refetch } = useMentors({ page: mentorPage, page_size: MENTOR_PAGE_SIZE }, isSuperAdmin && open);
  const { data: mentorHistory } = useCourseMentorHistory(course?.id, isSuperAdmin && isEditing && open);
  const currentHistoryItem = mentorHistory?.find((entry) => entry.mentor_id === course?.mentor_id);
  const currentMentorName: string = currentHistoryItem
    ? `${currentHistoryItem.mentor.first_name} ${currentHistoryItem.mentor.last_name}`
    : t("form.currentMentor");

  useEffect(() => {
    if (mentorsPage?.total !== undefined) setAuthoritativeTotal(mentorsPage.total);
    if (mentorsPage?.items) {
      setLoadedMentors((previous: User[]) => {
        const knownIds: Set<number> = new Set(previous.map((mentor) => mentor.id));
        return [...previous, ...mentorsPage.items.filter((mentor) => !knownIds.has(mentor.id))];
      });
    }
  }, [mentorsPage?.total, mentorsPage?.items]);

  const total: number | null = authoritativeTotal ?? mentorsPage?.total ?? null;
  const hasMore: boolean = total !== null ? loadedMentors.length < total : false;
  const isInitialLoading: boolean = isLoading && loadedMentors.length === 0;
  const isBusy: boolean = isLoading || isFetching;
  const needsCurrentFallback: boolean = Boolean(course?.mentor_id) && !loadedMentors.some((mentor) => mentor.id === course?.mentor_id);
  const options: readonly ListboxOption[] = [
    ...(needsCurrentFallback ? [{ value: String(course!.mentor_id), label: currentMentorName }] : []),
    ...loadedMentors.map((mentor) => ({ value: String(mentor.id), label: `${mentor.first_name} ${mentor.last_name}` })),
  ];
  const retryClass: string = "inline-flex min-h-11 items-center text-sm font-medium text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
  const mentorError = errors.mentor_id;

  return (
    <CourseFormField
      id="course-mentor-field"
      label={t("form.mentorLabel")}
      required
      error={mentorError ? t(mentorError.message ?? "form.requiredFieldError") : undefined}
      errorId="course-mentor-error"
      aside={total !== null && total > 0 ? <span className="text-xs text-muted tabular-nums">{t("form.mentorsCount", { loaded: loadedMentors.length, total })}</span> : undefined}
    >
      {isInitialLoading ? (
        <div className="flex min-h-12 items-center rounded-[10px] border border-control-border bg-strip px-3 text-sm text-muted">{t("form.mentorsLoading")}</div>
      ) : isError && loadedMentors.length === 0 ? (
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-[10px] border border-destructive px-3 text-sm text-destructive">
          <span>{t("form.mentorsLoadError")}</span>
          <button type="button" onClick={() => refetch()} disabled={disabled} className={retryClass}>{t("common:retry")}</button>
        </div>
      ) : options.length === 0 ? (
        <div className="flex min-h-12 items-center rounded-[10px] border border-control-border bg-strip px-3 text-sm text-muted">{t("form.mentorsEmpty")}</div>
      ) : (
        <div className="flex flex-col gap-2">
          <Controller
            control={control}
            name="mentor_id"
            render={({ field }) => (
              <Select
                id="course-mentor-field"
                label={t("form.mentorLabel")}
                options={options}
                value={field.value}
                onChange={field.onChange}
                placeholder={t("form.selectMentor")}
                disabled={disabled}
                invalid={Boolean(mentorError)}
                describedBy={mentorError ? "course-mentor-error" : undefined}
              />
            )}
          />
          {isError && loadedMentors.length > 0 && (
            <div className="flex items-center justify-between gap-3 text-sm text-destructive">
              <span>{t("form.mentorsPageLoadError", { page: mentorPage })}</span>
              <button type="button" onClick={() => void refetch()} disabled={isBusy || disabled} className={retryClass}>{t("common:retry")}</button>
            </div>
          )}
          {hasMore && !isError && (
            <button type="button" onClick={() => setMentorPage((previous: number) => previous + 1)} disabled={isBusy || disabled} className={`${retryClass} self-start`}>
              {isBusy ? t("form.mentorsLoading") : t("form.mentorsLoadMore")}
            </button>
          )}
        </div>
      )}
    </CourseFormField>
  );
}

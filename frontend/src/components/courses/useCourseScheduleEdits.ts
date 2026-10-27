import { useState } from "react";
import { useCourseSchedule } from "../../lib/courses/hooks";
import {
  areScheduleTimesValid,
  buildScheduleUpdatePayload,
  hasScheduleTimeChanges,
  type ScheduleTimeEdit,
  type ScheduleTimeEdits,
} from "../../lib/courses/formMapping";
import type { CourseScheduleCreate, CourseScheduleResponse } from "../../lib/courses/types";

export interface CourseScheduleEdits {
  query: ReturnType<typeof useCourseSchedule>;
  rows: CourseScheduleResponse[] | undefined;
  edits: ScheduleTimeEdits;
  hasChanges: boolean;
  showMissingErrors: boolean;
  setTimes: (scheduleId: number, times: ScheduleTimeEdit) => void;
  buildPayloadIfValid: () => CourseScheduleCreate[] | null;
}

export function useCourseScheduleEdits(courseId: number | undefined, isEditing: boolean): CourseScheduleEdits {
  const query = useCourseSchedule(courseId);
  const rows = query.data;
  const [edits, setEdits] = useState<ScheduleTimeEdits>({});
  const [showMissingErrors, setShowMissingErrors] = useState(false);
  const hasChanges: boolean = isEditing && Boolean(rows) && hasScheduleTimeChanges(rows ?? [], edits);

  const setTimes = (scheduleId: number, times: ScheduleTimeEdit) => {
    setEdits((current) => ({ ...current, [scheduleId]: times }));
  };

  const buildPayloadIfValid = (): CourseScheduleCreate[] | null => {
    if (!rows || !areScheduleTimesValid(rows, edits)) {
      setShowMissingErrors(true);
      return null;
    }
    return buildScheduleUpdatePayload(rows, edits);
  };

  return { query, rows, edits, hasChanges, showMissingErrors, setTimes, buildPayloadIfValid };
}

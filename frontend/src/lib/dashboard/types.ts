export interface AttentionLesson {
  course_id: number;
  course_title: string;
  time_start: string;
  time_end: string;
  mentor_name: string;
  mentor_phone: string | null;
  journal_id: number | null;
}

export interface AttentionAbsentStudent {
  student_id: number;
  student_name: string;
  consecutive_absences: number;
}

export interface DashboardAttention {
  lessons_in_progress: AttentionLesson[];
  attendance_not_marked: AttentionLesson[];
  absent_students: (AttentionLesson & { students: AttentionAbsentStudent[] })[];
  payments: { student_id: number; student_name: string; course_id: number; course_title: string; enrollment_id: number; due_date: string; remaining_amount: string }[];
}

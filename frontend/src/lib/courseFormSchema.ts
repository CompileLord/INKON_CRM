import { z } from "zod";
import { isPositiveMoney } from "./money";

const scheduleRowSchema = z
  .object({
    day_of_week: z.string().refine((v) => /^[0-6]$/.test(v), "Выберите день недели"),
    time_start: z.string().min(1, "Укажите время начала"),
    time_end: z.string().min(1, "Укажите время окончания"),
  })
  .refine((row) => row.time_end > row.time_start, {
    message: "Время окончания должно быть позже начала",
    path: ["time_end"],
  });

/**
 * exam_type/price/schedules are only ever collected on create — the edit
 * form renders them read-only and seeds them with placeholder values (see
 * buildCourseFormValues), so they must not be validated when editing.
 * Validating them there blocks submission on an error the user can never
 * see, since ScheduleEditor (the only place it'd render) isn't mounted.
 */
function courseFormSchemaFor(mode: "create" | "edit") {
  return z
    .object({
      title: z.string().trim().min(1, "Введите название").max(255, "Максимум 255 символов"),
      description: z.string().trim().min(1, "Введите описание"),
      start_date: z.string().min(1, "Укажите дату начала"),
      end_date: z.string().min(1, "Укажите дату окончания"),
      exam_type: z.enum(["weekly", "monthly"]),
      price: mode === "create"
        ? z.string().trim().min(1, "Укажите цену").refine((v) => isPositiveMoney(v), "Цена должна быть больше нуля")
        : z.string(),
      mentor_id: z.string().min(1, "Выберите ментора"),
      status: z.enum(["active", "archived"]),
      schedules:
        mode === "create"
          ? z.array(scheduleRowSchema).min(1, "Добавьте хотя бы одно занятие")
          : z.array(z.object({ day_of_week: z.string(), time_start: z.string(), time_end: z.string() })),
    })
    .refine((values) => values.end_date >= values.start_date, {
      message: "Дата окончания не может быть раньше даты начала",
      path: ["end_date"],
    });
}

export const courseFormSchema = courseFormSchemaFor("create");
export const courseEditFormSchema = courseFormSchemaFor("edit");

export type CourseFormValues = z.infer<typeof courseFormSchema>;

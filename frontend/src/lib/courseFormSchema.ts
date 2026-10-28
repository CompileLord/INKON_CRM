import { z } from "zod";
import { isPositiveMoney } from "./money";

const scheduleRowSchema = z
  .object({
    day_of_week: z.string().refine((v) => /^[0-6]$/.test(v), "form.dayOfWeek"),
    time_start: z.string().min(1, "form.timeStart"),
    time_end: z.string().min(1, "form.timeEnd"),
  })
  .refine((row) => row.time_end > row.time_start, {
    message: "form.timeOrderError",
    path: ["time_end"],
  });

const schedulesCreateSchema = z
  .array(scheduleRowSchema)
  .min(1, "form.minScheduleError")
  .refine(
    (rows) => {
      const days = rows.map((r) => r.day_of_week);
      return new Set(days).size === days.length;
    },
    {
      message: "form.duplicateDayError",
    },
  );

function courseFormSchemaFor(mode: "create" | "edit") {
  return z
    .object({
      title: z.string().trim().min(1, "form.requiredFieldError").max(255, "form.titleTooLongError"),
      description: z.string().trim(),
      start_date: z.string().min(1, "form.requiredFieldError"),
      end_date: z.string().min(1, "form.requiredFieldError"),
      exam_type: z.enum(["weekly", "monthly"]),
      price: mode === "create"
        ? z.string().trim().min(1, "form.requiredFieldError").refine((v) => isPositiveMoney(v), "form.positivePriceError")
        : z.string(),
      mentor_id: z.string().min(1, "form.requiredFieldError"),
      status: z.enum(["active", "archived"]),
      schedules:
        mode === "create"
          ? schedulesCreateSchema
          : z.array(z.object({ day_of_week: z.string(), time_start: z.string(), time_end: z.string() })),
    })
    .refine(
      (values) => mode === "create"
        ? values.end_date > values.start_date
        : values.end_date >= values.start_date,
      {
      message: "form.dateOrderError",
      path: ["end_date"],
      },
    );
}

export const courseFormSchema = courseFormSchemaFor("create");
export const courseEditFormSchema = courseFormSchemaFor("edit");

export type CourseFormValues = z.infer<typeof courseFormSchema>;

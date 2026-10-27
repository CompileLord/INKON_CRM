import { getSchoolCalendarDate } from "../../i18n/formatters";
import type { AuditChange, AuditEvent, KnownAuditAction } from "./api";
import type { AuditCategory } from "./types";

export type AuditValueKind = "none" | "empty" | "text";

export interface AuditValueDescriptor {
  kind: AuditValueKind;
  text: string;
}

export interface AuditDayGroup {
  day: string;
  items: AuditEvent[];
}

export type AuditDayRelation = "today" | "yesterday" | "earlier";

export type AuditChangeShape = "set" | "cleared" | "changed";

export interface AuditScheduleChange {
  weekday: number;
  start: AuditChange | null;
  end: AuditChange | null;
}

export interface AuditQueueMarker {
  kind: "credentials" | "password";
  reason: string;
  channel: string;
}

export class AuditPresentation {
  static readonly queueFields: readonly string[] = ["credentials_queued", "password_sms_queued"];
  private static readonly categoryByEntity: Readonly<Record<string, AuditCategory>> = {
    payment: "payments",
    discount: "payments",
    adjustment: "payments",
    allocation: "payments",
    accounting_period: "payments",
    user: "students",
    student: "students",
    enrollment: "students",
    course: "courses",
    journal: "journal",
    journal_entry: "journal",
  };
  private static readonly schedulePattern: RegExp = /^schedules\.([0-6])\.(time_start|time_end)$/;

  static categoryOf(entityType: string, changes: readonly AuditChange[]): AuditCategory {
    if (changes.some((change) => AuditPresentation.queueFields.includes(change.field_name))) return "system";
    return AuditPresentation.categoryByEntity[entityType] ?? "system";
  }

  static queueMarker(changes: readonly AuditChange[]): AuditQueueMarker | null {
    for (const change of changes) {
      if (!AuditPresentation.queueFields.includes(change.field_name) || change.new_value === null) continue;
      const [reason, channel] = change.new_value.split(":");
      if (reason && channel) return { kind: change.field_name === "credentials_queued" ? "credentials" : "password", reason, channel };
    }
    return null;
  }

  static scheduleSlot(fieldName: string): { weekday: number; edge: "start" | "end" } | null {
    const match: RegExpMatchArray | null = fieldName.match(AuditPresentation.schedulePattern);
    return match ? { weekday: Number(match[1]), edge: match[2] === "time_start" ? "start" : "end" } : null;
  }

  static splitScheduleChanges(changes: readonly AuditChange[]): { schedules: AuditScheduleChange[]; others: AuditChange[] } {
    const byWeekday: Map<number, AuditScheduleChange> = new Map();
    const others: AuditChange[] = [];
    for (const change of changes) {
      const slot = AuditPresentation.scheduleSlot(change.field_name);
      if (slot === null) {
        others.push(change);
        continue;
      }
      const entry: AuditScheduleChange = byWeekday.get(slot.weekday) ?? { weekday: slot.weekday, start: null, end: null };
      if (slot.edge === "start") entry.start = change;
      else entry.end = change;
      byWeekday.set(slot.weekday, entry);
    }
    return { schedules: [...byWeekday.values()].sort((first, second) => first.weekday - second.weekday), others };
  }

  static expandChangedFields(changes: readonly AuditChange[]): { fieldNames: string[]; listed: boolean } {
    const fieldNames: string[] = [];
    let listed: boolean = false;
    for (const change of changes) {
      if (change.field_name !== "changed_fields") {
        fieldNames.push(change.field_name);
        continue;
      }
      listed = true;
      try {
        const parsed: unknown = JSON.parse(change.new_value ?? "[]");
        if (Array.isArray(parsed)) fieldNames.push(...parsed.filter((entry): entry is string => typeof entry === "string"));
      } catch {
        continue;
      }
    }
    return { fieldNames, listed };
  }

  static trimTime(value: string | null): string {
    return value === null ? "" : (value.match(/^(\d{2}:\d{2})(:\d{2})?$/)?.[1] ?? value);
  }

  static describeValue(value: string | null): AuditValueDescriptor {
    if (value === null) return { kind: "none", text: "" };
    if (value === "") return { kind: "empty", text: "" };
    return { kind: "text", text: value };
  }

  static changeShape(oldValue: string | null, newValue: string | null): AuditChangeShape {
    if (oldValue === null && newValue !== null) return "set";
    if (oldValue !== null && newValue === null) return "cleared";
    return "changed";
  }

  static isReferenceField(fieldName: string): boolean {
    return fieldName.endsWith("_id");
  }

  static enumLookupKey(value: string): string {
    const qualified: RegExpMatchArray | null = value.match(/^[A-Za-z]+\.([A-Z][A-Z_]*)$/);
    return qualified ? qualified[1].toLowerCase() : value;
  }

  static isSnakeCaseIdentifier(value: string): boolean {
    return /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(value);
  }

  static isKnownAction(action: string): action is KnownAuditAction {
    return ["create", "update", "delete", "void", "refund", "close_period", "reopen_period"].includes(action);
  }

  static humanizeIdentifier(identifier: string): string {
    const spaced: string = identifier.replace(/_/g, " ").trim();
    return spaced === "" ? identifier : spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  static schoolDayOf(isoTimestamp: string): string {
    return getSchoolCalendarDate(new Date(isoTimestamp));
  }

  static groupByDay(items: readonly AuditEvent[]): AuditDayGroup[] {
    const groups: AuditDayGroup[] = [];
    for (const item of items) {
      const day: string = AuditPresentation.schoolDayOf(item.created_at);
      const last: AuditDayGroup | undefined = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(item);
      else groups.push({ day, items: [item] });
    }
    return groups;
  }

  static relateDay(day: string, reference: Date = new Date()): AuditDayRelation {
    const today: string = getSchoolCalendarDate(reference);
    if (day === today) return "today";
    const yesterday: string = getSchoolCalendarDate(new Date(reference.getTime() - 24 * 60 * 60 * 1000));
    return day === yesterday ? "yesterday" : "earlier";
  }
}

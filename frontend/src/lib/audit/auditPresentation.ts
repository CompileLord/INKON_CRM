import { getSchoolCalendarDate } from "../../i18n/formatters";
import type { AuditEvent, KnownAuditAction } from "./api";

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

export class AuditPresentation {
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

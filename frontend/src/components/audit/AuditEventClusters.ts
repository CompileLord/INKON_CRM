import type { AuditEvent } from "../../lib/audit/api";

export interface AuditCluster {
  key: string;
  events: AuditEvent[];
}

export class AuditEventClusters {
  static signature(event: AuditEvent): string {
    const fields: string = event.changes.map((change) => change.field_name).sort().join(",");
    return [event.actor_name, event.action, event.entity_type, event.entity_label, event.course_title, fields].join("|");
  }

  static cluster(events: readonly AuditEvent[]): AuditCluster[] {
    const clusters: AuditCluster[] = [];
    for (const event of events) {
      const signature: string = AuditEventClusters.signature(event);
      const last: AuditCluster | undefined = clusters[clusters.length - 1];
      if (last && AuditEventClusters.signature(last.events[0]) === signature) last.events.push(event);
      else clusters.push({ key: String(event.id), events: [event] });
    }
    return clusters;
  }
}

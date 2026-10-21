import { useState } from "react";
import type { AuditEvent } from "../../lib/audit/api";
import { AuditEventClusters, type AuditCluster } from "./AuditEventClusters";
import { AuditEventRow } from "./AuditEventRow";

interface AuditClusterListProps {
  events: readonly AuditEvent[];
  onOpen: (event: AuditEvent, trigger: HTMLButtonElement) => void;
}

export function AuditClusterList({ events, onOpen }: AuditClusterListProps) {
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(new Set());
  const clusters: AuditCluster[] = AuditEventClusters.cluster(events);
  const toggle = (key: string): void => {
    setExpandedKeys((current: ReadonlySet<string>) => {
      const next: Set<string> = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <ul className="flex flex-col rounded-2xl border border-border bg-card p-1">
      {clusters.map((cluster: AuditCluster) => {
        const isExpanded: boolean = expandedKeys.has(cluster.key);
        if (cluster.events.length === 1) return <AuditEventRow key={cluster.key} event={cluster.events[0]} onOpen={onOpen} />;
        return (
          <li key={cluster.key} data-audit-cluster={cluster.events.length}>
            <ul className="flex flex-col">
              {(isExpanded ? cluster.events : cluster.events.slice(0, 1)).map((event: AuditEvent, index: number) => (
                <AuditEventRow
                  key={event.id}
                  event={event}
                  onOpen={onOpen}
                  similarCount={index === 0 ? cluster.events.length : 1}
                  onToggleSimilar={index === 0 ? () => toggle(cluster.key) : undefined}
                  isExpanded={isExpanded}
                />
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

import { useRef } from "react";
import { useTranslation } from "react-i18next";

export type CourseBucket = "active" | "archive";

interface StudentBucketTabsProps {
  selected: CourseBucket;
  activeCount: number | null;
  archiveCount: number | null;
  onSelect: (bucket: CourseBucket) => void;
}

const BUCKETS: readonly CourseBucket[] = ["active", "archive"];

export function StudentBucketTabs({ selected, activeCount, archiveCount, onSelect }: StudentBucketTabsProps) {
  const { t } = useTranslation("student");
  const tabRefs = useRef<Map<CourseBucket, HTMLButtonElement>>(new Map());
  const countOf = (bucket: CourseBucket): number | null => (bucket === "active" ? activeCount : archiveCount);

  const moveSelection = (event: React.KeyboardEvent<HTMLButtonElement>, bucket: CourseBucket): void => {
    const index: number = BUCKETS.indexOf(bucket);
    const nextIndex: number | null =
      event.key === "ArrowRight" ? (index + 1) % BUCKETS.length
      : event.key === "ArrowLeft" ? (index - 1 + BUCKETS.length) % BUCKETS.length
      : event.key === "Home" ? 0
      : event.key === "End" ? BUCKETS.length - 1
      : null;
    if (nextIndex === null) return;
    event.preventDefault();
    onSelect(BUCKETS[nextIndex]);
    tabRefs.current.get(BUCKETS[nextIndex])?.focus();
  };

  return (
    <div role="tablist" aria-label={t("bucketTabsLabel")} className="grid w-full grid-cols-2 gap-1 rounded-xl border border-border-warm bg-strip p-1 sm:inline-grid sm:w-auto">
      {BUCKETS.map((bucket) => {
        const isSelected: boolean = bucket === selected;
        const count: number | null = countOf(bucket);
        return (
          <button
            key={bucket}
            ref={(element) => {
              if (element) tabRefs.current.set(bucket, element);
              else tabRefs.current.delete(bucket);
            }}
            type="button"
            role="tab"
            id={`bucket-tab-${bucket}`}
            aria-selected={isSelected}
            aria-controls="bucket-panel"
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(bucket)}
            onKeyDown={(event) => moveSelection(event, bucket)}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${
              isSelected ? "bg-card font-semibold text-ink shadow-xs" : "font-medium text-nav hover:text-ink"
            }`}
          >
            {bucket === "active" ? t("activeSegment") : t("archiveSegment")}
            <span className="min-w-6 rounded-full bg-beige px-2 text-center text-xs font-semibold tabular-nums text-muted" data-testid={`bucket-count-${bucket}`}>
              {count === null ? "–" : count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

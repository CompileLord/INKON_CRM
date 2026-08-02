import { useTranslation } from "react-i18next";
import type { CourseProgressChartResponse } from "../../lib/courses/types";

const COLOR_PALETTE = [
  "#E53E3E", "#319795", "#3182CE", "#D69E2E", "#D53F8C",
  "#805AD5", "#DD6B20", "#38A169", "#00B5D8", "#B83280",
  "#4C51BF", "#C05621", "#2B6CB0", "#2F855A", "#9B2C2C",
  "#2C7A7B", "#6B46C1", "#975A16", "#702459", "#1A365D"
];

export function CourseProgressChart({ data }: { data: CourseProgressChartResponse }) {
  const { t } = useTranslation("courses");

  if (data.labels.length === 0 || data.datasets.length === 0) {
    return (
      <div className="rounded-2xl border border-border-warm bg-card px-5 py-10 text-center">
        <p className="text-sm text-muted">{t("noProgressData")}</p>
      </div>
    );
  }

  const lastIndex = data.labels.length - 1;
  const max = Math.max(...data.datasets.flatMap((d) => d.scores), 1);
  const used = new Set<string>();

  const datasets = data.datasets.map((d, idx) => {
    let color = d.color_hex;
    if (!color || color === "#FF5733" || used.has(color)) {
      color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
    }
    used.add(color);
    return { ...d, color_hex: color };
  });

  return (
    <div className="rounded-2xl border border-border-warm bg-card p-5">
      <p className="text-sm font-semibold text-ink">{t("courseProgress")}</p>
      <div className="mt-4 flex flex-col gap-4">
        {datasets.map((dataset) => (
          <div key={dataset.student_id} className="flex flex-col gap-1.5">
            <span className="truncate text-xs font-medium text-ink" style={{ color: dataset.color_hex }}>
              {dataset.name}
            </span>
            <div className="flex items-end gap-2">
              {dataset.scores.map((score, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-10 w-full items-end overflow-hidden rounded-md bg-beige/40">
                    <div
                      className="w-full rounded-t-sm transition-[height] duration-300 ease-out"
                      style={{
                        height: `${Math.max(4, (score / max) * 100)}%`,
                        backgroundColor: i === lastIndex ? "#9CA3AF" : dataset.color_hex,
                      }}
                    />
                  </div>
                  <span className="w-full truncate text-center text-[10px] tabular-nums text-muted">
                    {data.labels[i]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

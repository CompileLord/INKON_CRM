import { CheckCircle2, ClipboardList } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCourses } from "../../lib/courses/hooks";

const labelClass = "text-xs font-medium uppercase tracking-[0.5px] text-muted";
const valueClass = "mt-1.5 text-[26px] font-bold tabular-nums text-ink";
const cardClass =
  "flex h-23 flex-col justify-center rounded-xl border border-border-warm bg-card px-5 py-4";

export function JournalsStatsStrip() {
  const { t } = useTranslation("journals");
  const { data: allPage } = useCourses({ page_size: 1 });
  const { data: activePage } = useCourses({ status: "active", page_size: 1 });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-maroon" />
          <p className={labelClass}>{t("totalJournals")}</p>
        </div>
        <p className={valueClass}>{allPage?.total ?? "—"}</p>
      </div>

      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-600" />
          <p className={labelClass}>{t("activeCourses")}</p>
        </div>
        <p className={valueClass}>{activePage?.total ?? "—"}</p>
      </div>
    </div>
  );
}

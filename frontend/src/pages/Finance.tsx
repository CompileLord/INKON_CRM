import { useState } from "react";
import { TrendingUp, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FinanceAnalyticsTab } from "../components/finance/FinanceAnalyticsTab";
import { DebtorsTab } from "../components/finance/DebtorsTab";

export function Finance() {
  const { t } = useTranslation("finance");
  const [activeTab, setActiveTab] = useState<"analytics" | "debtors">("analytics");

  return (
    <div className="flex flex-col gap-6">
      {/* Top Page Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-ink">{t("title")}</h2>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-border gap-6">
        <button
          onClick={() => setActiveTab("analytics")}
          className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition-all ${
            activeTab === "analytics"
              ? "border-maroon text-maroon"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <TrendingUp size={18} /> {t("tabs.analytics")}
        </button>
        <button
          onClick={() => setActiveTab("debtors")}
          className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition-all ${
            activeTab === "debtors"
              ? "border-maroon text-maroon"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <AlertTriangle size={18} /> {t("tabs.debtors")}
        </button>
      </div>

      {/* Active Tab Content */}
      {activeTab === "analytics" ? <FinanceAnalyticsTab /> : <DebtorsTab />}
    </div>
  );
}

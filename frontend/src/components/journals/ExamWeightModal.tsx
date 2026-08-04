import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, X } from "lucide-react";

interface ExamWeightModalProps {
  isOpen: boolean;
  currentWeight: number;
  onClose: () => void;
  onSave: (newWeight: number) => Promise<void>;
}

export const ExamWeightModal: React.FC<ExamWeightModalProps> = ({
  isOpen,
  currentWeight,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation(["journals", "common"]);
  const [val, setVal] = useState<number>(currentWeight);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSave(val);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || t("table.examMaxUpdateFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card text-card-foreground border border-border rounded-xl shadow-lg w-full max-w-md p-6 relative animate-in fade-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted hover:text-ink transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-semibold mb-2">{t("table.examWeightTitle")}</h3>

        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 rounded-lg text-xs mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{t("table.examWeightWarning")}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              {t("table.examWeightLabel")}
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={val}
              onChange={(e) => setVal(Number(e.target.value))}
              className="w-full px-3 py-2 border border-border rounded-lg bg-card text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium border border-border rounded-lg text-muted hover:bg-beige hover:text-ink transition-colors"
              disabled={loading}
            >
              {t("common:cancel", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold bg-accent text-white rounded-lg hover:bg-accent-dark disabled:opacity-50 transition-colors"
            >
              {loading ? t("loading") : t("common:save", "Save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

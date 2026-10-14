import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, X } from "lucide-react";
import { AuthApiError } from "../../lib/auth/errors";

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
    } catch (err: unknown) {
      setError(err instanceof AuthApiError && typeof err.detail === "string" ? err.detail : t("table.examMaxUpdateFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
      <div className="bg-card text-ink border border-border rounded-2xl shadow-lg w-full max-w-md p-6 relative motion-safe:animate-[card-scale-in_200ms_ease-out]">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common:close")}
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-semibold mb-2">{t("table.examWeightTitle")}</h3>

        <div className="flex items-start gap-2 p-3 bg-warning-surface border border-warning/40 text-warning rounded-[10px] text-sm mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{t("table.examWeightWarning")}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger-surface border border-destructive/40 text-destructive text-sm rounded-[10px]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              {t("table.examWeightLabel")}
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={val}
              onChange={(e) => setVal(Number(e.target.value))}
              className="h-12 w-full px-3 border border-control-border rounded-[10px] bg-card text-ink text-base focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 px-4 text-sm font-medium border border-control-border rounded-[10px] text-ink hover:bg-beige focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={loading}
            >
              {t("common:cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="min-h-11 px-4 text-sm font-semibold bg-maroon text-on-primary rounded-[10px] hover:bg-maroon-dark disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {loading ? t("loading") : t("common:save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

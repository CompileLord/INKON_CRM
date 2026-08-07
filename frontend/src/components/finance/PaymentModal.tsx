import { useState } from "react";
import { X, DollarSign, Building, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PaymentMethod, PaymentCreatePayload } from "../../lib/finance/types";
import { useCreatePayment } from "../../lib/finance/hooks";
import { useStudentProfile, useStudents } from "../../lib/users/hooks";
import { AuthApiError } from "../../lib/auth/errors";
import { formatSum } from "../../lib/money";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultStudentId?: number;
  defaultStudentName?: string;
  defaultCourseId?: number;
  defaultCourseName?: string;
}

export function PaymentModal({
  isOpen,
  onClose,
  onSuccess,
  defaultStudentId,
  defaultStudentName,
  defaultCourseId,
  defaultCourseName,
}: PaymentModalProps) {
  const { t } = useTranslation(["finance", "common"]);

  const [studentQuery, setStudentQuery] = useState("");
  const [studentId, setStudentId] = useState<number | undefined>(defaultStudentId);
  const [studentName, setStudentName] = useState<string | undefined>(defaultStudentName);
  const [courseId, setCourseId] = useState<number | undefined>(defaultCourseId);

  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidAt, setPaidAt] = useState<string>(new Date().toISOString().split("T")[0]);
  const [comment, setComment] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const needsStudentPicker = defaultStudentId === undefined;
  const needsCoursePicker = defaultCourseId === undefined;

  const { data: studentResults } = useStudents(
    { search: studentQuery, page_size: 8 },
    needsStudentPicker && studentQuery.length > 0,
  );
  const { data: studentProfile } = useStudentProfile(needsCoursePicker ? studentId : undefined);

  const createPayment = useCreatePayment();

  if (!isOpen) return null;

  const resetAndClose = () => {
    setStudentQuery("");
    setStudentId(defaultStudentId);
    setStudentName(defaultStudentName);
    setCourseId(defaultCourseId);
    setAmount("");
    setMethod("cash");
    setComment("");
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !courseId) return;
    setError(null);

    // Money is sent as the raw string — parsing through a float would round it.
    const payload: PaymentCreatePayload = {
      student_id: studentId,
      course_id: courseId,
      amount,
      paid_at: new Date(`${paidAt}T00:00:00`).toISOString(),
      method,
      comment: comment || undefined,
    };

    try {
      await createPayment.mutateAsync(payload);
      onSuccess();
      resetAndClose();
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : t("paymentModal.saveError"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h3 className="text-xl font-bold text-ink">{t("paymentModal.title")}</h3>
          <button
            onClick={resetAndClose}
            className="rounded-lg p-1.5 text-muted hover:bg-cream hover:text-ink transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          )}

          {/* Student selection */}
          <div>
            <label className="text-xs font-semibold text-muted">{t("debtors.table.student")}</label>
            {!needsStudentPicker || studentId ? (
              <div className="mt-1 flex items-center justify-between rounded-xl border border-border bg-cream/50 px-3.5 py-2.5 text-sm font-medium text-ink">
                {studentName ?? `#${studentId}`}
                {needsStudentPicker && (
                  <button
                    type="button"
                    onClick={() => {
                      setStudentId(undefined);
                      setStudentName(undefined);
                      setCourseId(undefined);
                    }}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    {t("common:edit")}
                  </button>
                )}
              </div>
            ) : (
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} />
                <input
                  type="text"
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder={t("common:search")}
                  className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm text-ink focus:border-maroon focus:outline-none"
                />
                {studentResults && studentResults.items.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-md">
                    {studentResults.items.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setStudentId(s.id);
                          setStudentName(`${s.first_name} ${s.last_name}`);
                          setStudentQuery("");
                        }}
                        className="block w-full px-3.5 py-2 text-left text-sm text-ink hover:bg-cream"
                      >
                        {s.first_name} {s.last_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Course selection */}
          {studentId && (
            <div>
              <label className="text-xs font-semibold text-muted">{t("debtors.table.course")}</label>
              {!needsCoursePicker ? (
                <div className="mt-1 rounded-xl border border-border bg-cream/50 px-3.5 py-2.5 text-sm font-medium text-ink">
                  {defaultCourseName ?? `#${defaultCourseId}`}
                </div>
              ) : (
                <select
                  value={courseId ?? ""}
                  onChange={(e) => setCourseId(Number(e.target.value))}
                  required
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-ink focus:border-maroon focus:outline-none"
                >
                  <option value="" disabled>
                    {t("paymentModal.selectCourse")}
                  </option>
                  {studentProfile?.courses.map((c) => (
                    <option key={c.course.id} value={c.course.id}>
                      {c.course.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted">{t("paymentModal.amount")} (TJS)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-ink focus:border-maroon focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted">{t("paymentModal.date")}</label>
              <input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-ink focus:border-maroon focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted">{t("paymentModal.method")}</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod("cash")}
                className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold transition-all ${
                  method === "cash"
                    ? "border-maroon bg-maroon/10 text-maroon shadow-xs"
                    : "border-border bg-card text-muted hover:border-slate-300"
                }`}
              >
                <DollarSign size={15} /> {t("common:enums.paymentMethod.cash")}
              </button>
              <button
                type="button"
                onClick={() => setMethod("transfer")}
                className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold transition-all ${
                  method === "transfer"
                    ? "border-maroon bg-maroon/10 text-maroon shadow-xs"
                    : "border-border bg-card text-muted hover:border-slate-300"
                }`}
              >
                <Building size={15} /> {t("common:enums.paymentMethod.transfer")}
              </button>
            </div>
          </div>

          {/* A payment records cash received. Concessions are recorded
              separately as discounts so they reduce what the student owes
              instead of shrinking the credit for money handed over. */}
          <div className="rounded-xl border border-border bg-cream/40 px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted">{t("paymentModal.totalToCredit")}</span>
              <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                {formatSum(amount || 0)} TJS
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted">{t("paymentModal.discountHint")}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted">{t("paymentModal.comment")}</label>
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("paymentModal.commentPlaceholder")}
              className="mt-1 w-full rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-ink focus:border-maroon focus:outline-none"
            />
          </div>

          <div className="mt-2 flex items-center justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted hover:bg-cream"
            >
              {t("common:cancel")}
            </button>
            <button
              type="submit"
              disabled={createPayment.isPending || !studentId || !courseId}
              className="rounded-xl bg-maroon px-5 py-2.5 text-sm font-semibold text-white hover:bg-maroon/90 shadow-sm disabled:opacity-50"
            >
              {createPayment.isPending ? t("common:saving") : t("paymentModal.acceptPayment")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

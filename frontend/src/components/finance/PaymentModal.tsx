import { useCallback, useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { PaymentMethod, PaymentCreatePayload, PaymentItem } from "../../lib/finance/types";
import { useCreatePayment } from "../../lib/finance/hooks";
import { useStudentProfile, useStudents } from "../../lib/users/hooks";
import { AuthApiError } from "../../lib/auth/errors";
import { formatExactMoney, isPositiveMoney, isValidMoneyString } from "../../lib/money";
import { getSchoolCalendarDate, schoolCalendarDateToTimestamp, formatNumber } from "../../i18n/formatters";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (payment: PaymentItem) => void;
  defaultStudentId?: number;
  defaultStudentName?: string;
  defaultCourseId?: number;
  defaultCourseName?: string;
}

interface NavigationDecision { proceed: () => void; cancel: () => void }

function PaymentNavigationGuard({ active, pending, onRequest }: { active: boolean; pending: boolean; onRequest: (decision: NavigationDecision) => void }) {
  const blocker = useBlocker(active);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (pending) blocker.reset();
    else onRequest({ proceed: blocker.proceed, cancel: blocker.reset });
  }, [blocker, pending, onRequest]);
  return null;
}

const inputClasses = "mt-1 min-h-11 min-w-0 w-full rounded-[10px] border border-control-border bg-card px-3 py-2 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-strip disabled:text-muted";

export function PaymentModal({ isOpen, onClose, onSuccess, defaultStudentId, defaultStudentName, defaultCourseId, defaultCourseName }: PaymentModalProps) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [studentId, setStudentId] = useState(defaultStudentId);
  const [studentName, setStudentName] = useState(defaultStudentName);
  const [courseId, setCourseId] = useState(defaultCourseId);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidAt, setPaidAt] = useState(getSchoolCalendarDate);
  const [initialDate, setInitialDate] = useState(paidAt);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [dismissDecision, setDismissDecision] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const navigation = useRef<NavigationDecision | null>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const amountField = useRef<HTMLInputElement>(null);
  const dateField = useRef<HTMLInputElement>(null);
  const courseField = useRef<HTMLSelectElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const searchResults = useRef<HTMLDivElement>(null);
  const needsStudentPicker = defaultStudentId === undefined;
  const needsCoursePicker = defaultCourseId === undefined;
  const students = useStudents({ search: studentQuery, page: studentPage, page_size: 8 }, isOpen && needsStudentPicker && !studentId && studentQuery.trim().length > 0);
  const profile = useStudentProfile(isOpen && needsCoursePicker ? studentId : undefined);
  const createPayment = useCreatePayment();
  const pending = submitting || createPayment.isPending;
  const dirty = amount !== "" || comment !== "" || method !== "cash" || paidAt !== initialDate || studentQuery !== "" || studentId !== defaultStudentId || courseId !== defaultCourseId;
  const eligibleCourse = !needsCoursePicker ? Boolean(courseId) : Boolean(!profile.isError && profile.data?.courses.some(entry => entry.course.id === courseId));
  const canonicalAmount = amount.trim().replace(",", ".");
  const amountValid = isValidMoneyString(canonicalAmount) && isPositiveMoney(canonicalAmount);

  useEffect(() => {
    if (!isOpen) return;
    const today = getSchoolCalendarDate();
    setStudentQuery(""); setStudentPage(1); setStudentId(defaultStudentId); setStudentName(defaultStudentName); setCourseId(defaultCourseId);
    setAmount(""); setMethod("cash"); setPaidAt(today); setInitialDate(today); setComment(""); setError(null); setDismissDecision(false); setVerificationRequired(false);
  }, [isOpen, defaultStudentId, defaultStudentName, defaultCourseId]);
  useEffect(() => { if (dismissDecision) keepEditing.current?.focus(); }, [dismissDecision]);
  useEffect(() => {
    if (!isOpen || (!dirty && !pending)) return;
    const handleUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [isOpen, dirty, pending]);
  const requestNavigation = useCallback((decision: NavigationDecision) => { navigation.current = decision; setDismissDecision(true); }, []);
  const requestClose = () => { if (inFlight.current || pending) return; if (dirty) setDismissDecision(true); else onClose(); };
  const cancelDismiss = () => { navigation.current?.cancel(); navigation.current = null; setDismissDecision(false); firstField.current?.focus(); };
  const discard = () => { const decision = navigation.current; navigation.current = null; setDismissDecision(false); onClose(); decision?.proceed(); };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || pending || verificationRequired) return;
    if (!studentId) { setError(t("paymentModal.chooseStudent")); firstField.current?.focus(); return; }
    if (!courseId || !eligibleCourse) { setError(t("paymentModal.chooseCourse")); courseField.current?.focus(); return; }
    if (!amountValid) { setError(t("paymentModal.invalidAmount")); amountField.current?.focus(); return; }
    const timestamp = schoolCalendarDateToTimestamp(paidAt);
    if (!timestamp) { setError(t("paymentModal.invalidDate")); dateField.current?.focus(); return; }
    const payload: PaymentCreatePayload = { student_id: studentId, course_id: courseId, amount: canonicalAmount, paid_at: timestamp, method, ...(comment.trim() ? { comment: comment.trim() } : {}) };
    setError(null); inFlight.current = true; setSubmitting(true);
    let payment: PaymentItem;
    try { payment = await createPayment.mutateAsync(payload); }
    catch (failure) {
      const confirmedRejection = failure instanceof AuthApiError && failure.status >= 400 && failure.status < 500;
      const closedPeriod = confirmedRejection && typeof failure.detail === "string" && failure.detail.toLowerCase().includes("closed");
      const unavailableEnrollment = confirmedRejection && typeof failure.detail === "string" && failure.detail.toLowerCase().includes("enrolled");
      setVerificationRequired(!confirmedRejection);
      setError(t(!confirmedRejection ? "paymentModal.ambiguousResult" : failure.status === 403 ? "paymentModal.permissionError" : closedPeriod ? "paymentModal.closedPeriod" : unavailableEnrollment ? "paymentModal.enrollmentError" : "paymentModal.saveError"));
      if (closedPeriod) dateField.current?.focus();
      else if (unavailableEnrollment && needsCoursePicker) { setCourseId(undefined); profile.refetch(); courseField.current?.focus(); }
      else amountField.current?.focus();
      return;
    } finally { inFlight.current = false; setSubmitting(false); }
    try { onSuccess(payment); } finally { onClose(); }
  };

  const footer = dismissDecision ? <div className="flex flex-col gap-3"><p className="text-sm text-ink">{t("paymentModal.discardBody")}</p><Button ref={keepEditing} onClick={cancelDismiss}>{t("paymentModal.keepEditing")}</Button><Button variant="secondary" onClick={discard}>{t("paymentModal.discardChanges")}</Button></div> : <div className="flex flex-col gap-3"><p className="break-words text-sm text-muted tabular-nums">{amountValid ? t("paymentModal.summary", { amount: formatExactMoney(canonicalAmount), method: t(`common:enums.paymentMethod.${method}`) }) : t("paymentModal.enterAmount")}</p><div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end"><Button variant="secondary" disabled={pending} onClick={requestClose}>{t("common:cancel")}</Button><Button type="submit" form="shared-payment-form" loading={pending} disabled={!studentId || !eligibleCourse || verificationRequired}>{t(pending ? "paymentModal.recording" : "paymentModal.acceptPayment")}</Button></div></div>;

  return <>
    {dataRouter && <PaymentNavigationGuard active={isOpen && (dirty || pending)} pending={pending} onRequest={requestNavigation} />}
    <Modal open={isOpen} onClose={requestClose} title={t(dismissDecision ? "paymentModal.discardTitle" : "paymentModal.title")} maxWidthClassName="sm:max-w-[520px]" fullScreenOnMobile initialFocus={firstField} footer={footer} closeDisabled={pending}>
      <form id="shared-payment-form" onSubmit={handleSubmit} aria-busy={pending} className="flex flex-col gap-4">
        {error && <div role="alert" className="rounded-xl border border-destructive bg-danger-surface p-3 text-sm text-destructive">{error}</div>}
        {verificationRequired && <label className="flex min-h-11 items-center gap-3 text-sm text-ink"><input type="checkbox" onChange={event => { if (event.target.checked) setVerificationRequired(false); }} />{t("paymentModal.verifiedNotRecorded")}</label>}
        <fieldset disabled={pending || dismissDecision} className="flex min-w-0 flex-col gap-4">
          <div>
            <label htmlFor="payment-student" className="text-sm font-medium text-muted">{t("debtors.table.student")}</label>
            {studentId ? <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-strip p-3 text-sm text-ink"><div className="min-w-0 break-words"><p>{studentName}</p><p className="text-muted">{t("analytics.studentNumber", { id: formatNumber(studentId, i18n.language) })}</p></div>{needsStudentPicker && <Button variant="secondary" onClick={() => { setStudentId(undefined); setStudentName(undefined); setCourseId(undefined); setStudentPage(1); }}>{t("common:edit")}</Button>}</div> : <>
              <input id="payment-student" ref={firstField} value={studentQuery} onChange={event => { setStudentQuery(event.target.value); setStudentPage(1); }} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); searchResults.current?.querySelector<HTMLButtonElement>("button")?.focus(); } }} autoComplete="off" className={inputClasses} placeholder={t("common:search")} aria-controls="payment-student-results" />
              {studentQuery.trim() && <div id="payment-student-results" ref={searchResults} aria-busy={students.isFetching} className="mt-2 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-border" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); firstField.current?.focus(); } if (event.key === "ArrowDown" || event.key === "ArrowUp") { const buttons = Array.from(searchResults.current?.querySelectorAll<HTMLButtonElement>("button") ?? []); const index = buttons.findIndex(button => button === document.activeElement); const next = buttons[index + (event.key === "ArrowDown" ? 1 : -1)]; if (next) { event.preventDefault(); next.focus(); } } }}>
                {students.isError ? <div role="alert" className="p-3 text-sm text-destructive"><p>{t("paymentModal.studentSearchError")}</p><Button variant="secondary" loading={students.isFetching} onClick={() => students.refetch()}>{t("common:retry")}</Button></div> : students.isLoading || students.isPlaceholderData ? <p role="status" className="p-3 text-sm text-muted">{t("common:loading")}</p> : students.data?.items.length === 0 ? <p role="status" className="p-3 text-sm text-muted">{t("paymentModal.noStudents")}</p> : <>
                  <p role="status" className="px-3 py-2 text-sm text-muted tabular-nums">{t("paymentModal.searchPage", { page: students.data?.page, total: students.data?.total })}</p>
                  {students.data?.items.map(student => <button type="button" key={student.id} className="block min-h-11 w-full break-words border-t border-border px-3 py-2 text-left text-sm text-ink hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setStudentId(student.id); setStudentName(student.first_name + " " + student.last_name); setStudentQuery(""); setCourseId(undefined); }}><span className="block font-medium">{student.first_name} {student.last_name}</span><span className="block text-muted">{t("analytics.studentNumber", { id: student.id })} · {student.email}</span></button>)}
                  <div className="flex flex-wrap gap-2 p-2">{studentPage > 1 && <Button variant="secondary" onClick={() => setStudentPage(page => page - 1)}>{t("paymentModal.previousResults")}</Button>}{students.data && studentPage < students.data.total_pages && <Button variant="secondary" onClick={() => setStudentPage(page => page + 1)}>{t("paymentModal.moreResults")}</Button>}</div>
                </>}
              </div>}
            </>}
          </div>
          {studentId && <div><label htmlFor="payment-course" className="text-sm font-medium text-muted">{t("paymentModal.priorityCourse")}</label>{!needsCoursePicker ? <p className="mt-1 break-words rounded-xl bg-strip p-3 text-sm text-ink">{defaultCourseName ?? t("analytics.courseNumber", { id: courseId })}</p> : profile.isLoading ? <p role="status" className="mt-1 text-sm text-muted">{t("common:loading")}</p> : profile.isError ? <div role="alert" className="mt-1 text-sm text-destructive"><p>{t("paymentModal.courseError")}</p><Button variant="secondary" loading={profile.isFetching} onClick={() => profile.refetch()}>{t("common:retry")}</Button></div> : !profile.data?.courses.length ? <p className="mt-1 text-sm text-muted">{t("paymentModal.noCourses")}</p> : <select id="payment-course" ref={courseField} value={courseId ?? ""} onChange={event => setCourseId(Number(event.target.value))} className={inputClasses}><option value="">{t("paymentModal.selectCourse")}</option>{profile.data.courses.map(entry => <option key={entry.course.id} value={entry.course.id}>{entry.course.title}</option>)}</select>}<p className="mt-2 text-sm text-muted">{t("paymentModal.allocationHelp")}</p></div>}
          <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="payment-amount" className="text-sm font-medium text-muted">{t("paymentModal.amountLabel")}</label><input id="payment-amount" ref={element => { amountField.current = element; if (!needsStudentPicker) firstField.current = element; }} type="text" inputMode="decimal" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} className={inputClasses} /></div><div><label htmlFor="payment-date" className="text-sm font-medium text-muted">{t("paymentModal.date")}</label><input id="payment-date" ref={dateField} type="date" value={paidAt} onChange={event => setPaidAt(event.target.value)} className={inputClasses} /></div></div>
          <fieldset><legend className="text-sm font-medium text-muted">{t("paymentModal.method")}</legend><div className="mt-2 grid grid-cols-2 gap-3">{(["cash", "transfer"] as const).map(option => <label key={option} className={`flex min-h-11 items-center justify-center gap-2 rounded-[10px] border p-2 text-sm ${method === option ? "border-maroon bg-strip text-maroon" : "border-control-border bg-card text-ink"}`}><input type="radio" name="payment-method" value={option} checked={method === option} onChange={() => setMethod(option)} />{t(`common:enums.paymentMethod.${option}`)}</label>)}</div></fieldset>
          <div><label htmlFor="payment-comment" className="text-sm font-medium text-muted">{t("paymentModal.comment")}</label><textarea id="payment-comment" rows={2} value={comment} onChange={event => setComment(event.target.value)} className={inputClasses} placeholder={t("paymentModal.commentPlaceholder")} /></div>
        </fieldset>
      </form>
    </Modal>
  </>;
}

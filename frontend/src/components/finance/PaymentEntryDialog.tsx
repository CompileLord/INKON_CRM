import { useCallback, useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { UNSAFE_DataRouterContext } from "react-router-dom";
import { BookOpen, Lock, Plus, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PaymentCreatePayload, PaymentItem, PaymentMethod } from "../../lib/finance/types";
import { useCreatePayment, usePayableCourses } from "../../lib/finance/hooks";
import { PaymentAmountParser, type PaymentAmountProblem } from "../../lib/finance/paymentAmountParser";
import { PaymentSubmissionOutcome, type PaymentFailureKind } from "../../lib/finance/paymentSubmissionOutcome";
import type { StudentSearchResult } from "../../lib/finance/studentSearch";
import { formatExactMoney } from "../../lib/money";
import { getSchoolCalendarDate, schoolCalendarDateToTimestamp } from "../../i18n/formatters";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { PAYMENT_COURSE_TRIGGER_ID, PaymentCourseField } from "./PaymentCourseField";
import { PaymentMethodRadios } from "./PaymentMethodRadios";
import { PaymentNavigationGuard, type NavigationDecision } from "./PaymentNavigationGuard";
import { SchoolDatePicker } from "./SchoolDatePicker";
import { StudentSearchField } from "./StudentSearchField";

export interface PaymentEntryProps {
  onClose: () => void;
  onSuccess: (payment: PaymentItem) => void;
  defaultStudentId?: number;
  defaultStudentName?: string;
  defaultCourseId?: number;
  defaultCourseName?: string;
}

interface SelectedStudent {
  id: number;
  name: string;
}

type EntryField = "student" | "course" | "amount" | "date";

interface FieldProblem {
  field: EntryField;
  messageKey: string;
}

const INPUT_CLASSES: string =
  "min-h-12 w-full min-w-0 rounded-[10px] border bg-card px-3 py-2 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-strip disabled:text-muted";

const FAILURE_MESSAGE_KEYS: Record<PaymentFailureKind, string> = {
  ambiguous: "paymentModal.ambiguousResult",
  permission: "paymentModal.permissionError",
  closedPeriod: "paymentModal.closedPeriod",
  enrollment: "paymentModal.enrollmentError",
  rejected: "paymentModal.saveError",
};

const AMOUNT_PROBLEM_KEYS: Record<PaymentAmountProblem, string> = {
  empty: "paymentModal.amountRequired",
  invalid: "paymentModal.invalidAmount",
  notPositive: "paymentModal.invalidAmount",
};

function borderFor(isInvalid: boolean): string {
  return isInvalid ? "border-destructive" : "border-control-border";
}

export function PaymentEntryDialog({ onClose, onSuccess, defaultStudentId, defaultStudentName, defaultCourseId, defaultCourseName }: PaymentEntryProps) {
  const { t } = useTranslation(["finance", "common"]);
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const isLocked: boolean = defaultStudentId !== undefined;
  const initialStudent: SelectedStudent | null = defaultStudentId !== undefined ? { id: defaultStudentId, name: defaultStudentName ?? "" } : null;
  const [student, setStudent] = useState<SelectedStudent | null>(initialStudent);
  const [courseId, setCourseId] = useState<number | null>(defaultCourseId ?? null);
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [initialDate] = useState<string>(getSchoolCalendarDate);
  const [paidAt, setPaidAt] = useState<string>(initialDate);
  const [comment, setComment] = useState<string>("");
  const [problem, setProblem] = useState<FieldProblem | null>(null);
  const [failure, setFailure] = useState<PaymentFailureKind | null>(null);
  const [verificationRequired, setVerificationRequired] = useState<boolean>(false);
  const [dismissDecision, setDismissDecision] = useState<boolean>(false);
  const inFlight = useRef<boolean>(false);
  const navigation = useRef<NavigationDecision | null>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const changeStudentButton = useRef<HTMLButtonElement>(null);
  const amountField = useRef<HTMLInputElement>(null);
  const dateField = useRef<HTMLButtonElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  const createPayment = useCreatePayment();
  const payableCourses = usePayableCourses(isLocked ? undefined : student?.id);
  const pending: boolean = createPayment.isPending;
  const parsedAmount = PaymentAmountParser.parse(amount);
  const dirty: boolean =
    amount !== "" || comment !== "" || method !== "cash" || paidAt !== initialDate || student?.id !== initialStudent?.id || courseId !== (defaultCourseId ?? null);
  const eligibleCourse: boolean = isLocked ? courseId !== null : Boolean(payableCourses.data?.some((course) => course.courseId === courseId));
  const studentLabel: string = student?.name ?? "";

  useEffect(() => {
    if (dismissDecision) keepEditing.current?.focus();
  }, [dismissDecision]);

  useEffect(() => {
    if (!dirty && !pending) return;
    const handleUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [dirty, pending]);

  useEffect(() => {
    const previous: Element | null = opener.current;
    return () => {
      if (previous instanceof HTMLElement) queueMicrotask(() => previous.isConnected && previous.focus());
    };
  }, []);

  const requestNavigation = useCallback((decision: NavigationDecision): void => {
    navigation.current = decision;
    setDismissDecision(true);
  }, []);

  const requestClose = (): void => {
    if (inFlight.current || pending) return;
    if (dirty) setDismissDecision(true);
    else onClose();
  };

  const keepEditingAgain = (): void => {
    navigation.current?.cancel();
    navigation.current = null;
    setDismissDecision(false);
    (isLocked ? amountField : student ? changeStudentButton : searchField).current?.focus();
  };

  const discard = (): void => {
    const decision: NavigationDecision | null = navigation.current;
    navigation.current = null;
    setDismissDecision(false);
    onClose();
    decision?.proceed();
  };

  const chooseStudent = (selected: StudentSearchResult): void => {
    setStudent({ id: selected.id, name: `${selected.first_name} ${selected.last_name}` });
    setCourseId(null);
    setProblem(null);
    requestAnimationFrame(() => changeStudentButton.current?.focus());
  };

  const changeStudent = (): void => {
    setStudent(null);
    setCourseId(null);
    requestAnimationFrame(() => searchField.current?.focus());
  };

  const focusProblem = (field: EntryField): void => {
    const target: HTMLElement | null | undefined =
      field === "student" ? searchField.current : field === "course" ? document.getElementById(PAYMENT_COURSE_TRIGGER_ID) : field === "amount" ? amountField.current : dateField.current;
    target?.focus();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (inFlight.current || pending || verificationRequired) return;
    const found: FieldProblem | null =
      student === null
        ? { field: "student", messageKey: "paymentModal.chooseStudent" }
        : courseId === null || !eligibleCourse
          ? { field: "course", messageKey: "paymentModal.chooseCourse" }
          : parsedAmount.canonical === null
            ? { field: "amount", messageKey: AMOUNT_PROBLEM_KEYS[parsedAmount.problem] }
            : schoolCalendarDateToTimestamp(paidAt) === null
              ? { field: "date", messageKey: "paymentModal.invalidDate" }
              : null;
    setProblem(found);
    setFailure(null);
    if (found !== null) {
      focusProblem(found.field);
      return;
    }
    const payload: PaymentCreatePayload = {
      student_id: (student as SelectedStudent).id,
      course_id: courseId as number,
      amount: parsedAmount.canonical as string,
      paid_at: schoolCalendarDateToTimestamp(paidAt) as string,
      method,
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    };
    inFlight.current = true;
    let payment: PaymentItem;
    try {
      payment = await createPayment.mutateAsync(payload);
    } catch (error) {
      const kind: PaymentFailureKind = PaymentSubmissionOutcome.classify(error);
      setVerificationRequired(!PaymentSubmissionOutcome.isConfirmedRejection(kind));
      setFailure(kind);
      if (kind === "closedPeriod") dateField.current?.focus();
      else if (kind === "enrollment" && !isLocked) {
        setCourseId(null);
        void payableCourses.refetch();
        requestAnimationFrame(() => document.getElementById(PAYMENT_COURSE_TRIGGER_ID)?.focus());
      } else amountField.current?.focus();
      return;
    } finally {
      inFlight.current = false;
    }
    try {
      onSuccess(payment);
    } finally {
      onClose();
    }
  };

  const summaryText: string =
    parsedAmount.canonical !== null
      ? t("finance:paymentModal.summary", { amount: formatExactMoney(parsedAmount.canonical), method: t(`common:enums.paymentMethod.${method}`) })
      : t("finance:paymentModal.enterAmount");

  const footer = dismissDecision ? (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink">{t("finance:paymentModal.discardBody")}</p>
      <Button ref={keepEditing} onClick={keepEditingAgain}>
        {t("finance:paymentModal.keepEditing")}
      </Button>
      <Button variant="secondary" onClick={discard}>
        {t("finance:paymentModal.discardChanges")}
      </Button>
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      <p className="break-words text-sm text-muted tabular-nums">{summaryText}</p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button variant="secondary" disabled={pending} onClick={requestClose}>
          {t("common:cancel")}
        </Button>
        <Button type="submit" form="shared-payment-form" loading={pending} disabled={!student || !eligibleCourse || verificationRequired}>
          {!pending && <Plus size={18} aria-hidden="true" />}
          {t(pending ? "finance:paymentModal.recording" : "finance:paymentModal.acceptPayment")}
        </Button>
      </div>
    </div>
  );

  const problemFor = (field: EntryField): string | null => (problem?.field === field ? t(`finance:${problem.messageKey}`) : null);
  const problemId = (field: EntryField): string => `payment-${field}-problem`;

  return (
    <>
      {dataRouter && <PaymentNavigationGuard active={dirty || pending} pending={pending} onRequest={requestNavigation} />}
      <Modal
        open
        onClose={requestClose}
        title={t(dismissDecision ? "finance:paymentModal.discardTitle" : "finance:paymentModal.title")}
        maxWidthClassName="sm:max-w-[520px]"
        fullScreenOnMobile
        initialFocus={isLocked ? amountField : student ? changeStudentButton : searchField}
        footer={footer}
        closeDisabled={pending}
      >
        <form id="shared-payment-form" onSubmit={handleSubmit} aria-busy={pending} noValidate className="flex flex-col gap-4">
          <p role="status" className="sr-only">
            {pending ? t("finance:paymentModal.recording") : ""}
          </p>
          {failure && (
            <div role="alert" className="rounded-xl border border-destructive bg-danger-surface p-3 text-sm text-destructive">
              {t(`finance:${FAILURE_MESSAGE_KEYS[failure]}`)}
            </div>
          )}
          {verificationRequired && (
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                onChange={(event) => {
                  if (event.target.checked) setVerificationRequired(false);
                }}
              />
              {t("finance:paymentModal.verifiedNotRecorded")}
            </label>
          )}
          <fieldset disabled={pending || dismissDecision} className="flex min-w-0 flex-col gap-4">
            {isLocked ? (
              <div className="rounded-xl bg-strip p-3 text-sm text-ink">
                <p className="flex items-center gap-2 break-words font-medium">
                  <UserRound size={16} aria-hidden="true" className="shrink-0 text-muted" />
                  <span>{studentLabel || t("finance:row.unknownStudent")}</span>
                  <Lock size={14} aria-hidden="true" className="ml-auto shrink-0 text-muted" />
                  <span className="sr-only">{t("finance:paymentModal.locked")}</span>
                </p>
                <p className="mt-1 flex items-center gap-2 break-words text-muted">
                  <BookOpen size={16} aria-hidden="true" className="shrink-0" />
                  {defaultCourseName ?? t("finance:paymentsTab.selectedCourse")}
                </p>
              </div>
            ) : (
              <>
                {student ? (
                  <div>
                    <p className="text-sm font-medium text-label">{t("finance:debtors.table.student")}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-strip p-3 text-sm text-ink">
                      <p className="flex min-w-0 items-center gap-2 break-words font-medium">
                        <UserRound size={16} aria-hidden="true" className="shrink-0 text-muted" />
                        {student.name}
                      </p>
                      <button
                        ref={changeStudentButton}
                        type="button"
                        onClick={changeStudent}
                        className="inline-flex min-h-11 shrink-0 items-center rounded-[10px] px-3 text-sm font-medium text-maroon hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
                      >
                        {t("finance:paymentModal.changeStudent")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <StudentSearchField
                      label={t("finance:debtors.table.student")}
                      inputRef={searchField}
                      invalid={problem?.field === "student"}
                      describedBy={problem?.field === "student" ? problemId("student") : undefined}
                      onSelect={chooseStudent}
                    />
                    {problemFor("student") && (
                      <p id={problemId("student")} role="alert" className="mt-1 text-sm text-destructive">
                        {problemFor("student")}
                      </p>
                    )}
                  </div>
                )}
                {student && (
                  <div>
                    <PaymentCourseField
                      studentId={student.id}
                      courseId={courseId}
                      invalid={problem?.field === "course"}
                      describedBy={problem?.field === "course" ? problemId("course") : undefined}
                      onChange={(selected) => {
                        setCourseId(selected);
                        setProblem(null);
                      }}
                    />
                    {problemFor("course") && (
                      <p id={problemId("course")} role="alert" className="mt-1 text-sm text-destructive">
                        {problemFor("course")}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="payment-amount" className="text-sm font-medium text-label">
                  {t("finance:paymentModal.amountLabel")}
                </label>
                <input
                  id="payment-amount"
                  ref={amountField}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-invalid={problem?.field === "amount" || undefined}
                  aria-describedby={problem?.field === "amount" ? problemId("amount") : undefined}
                  className={`mt-1 tabular-nums ${INPUT_CLASSES} ${borderFor(problem?.field === "amount")}`}
                />
                {problemFor("amount") && (
                  <p id={problemId("amount")} role="alert" className="mt-1 text-sm text-destructive">
                    {problemFor("amount")}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="payment-date" className="text-sm font-medium text-label">
                  {t("finance:paymentModal.date")}
                </label>
                <SchoolDatePicker
                  id="payment-date"
                  value={paidAt}
                  onChange={setPaidAt}
                  triggerRef={dateField}
                  invalid={problem?.field === "date"}
                  describedBy={problem?.field === "date" ? problemId("date") : undefined}
                />
                {problemFor("date") && (
                  <p id={problemId("date")} role="alert" className="mt-1 text-sm text-destructive">
                    {problemFor("date")}
                  </p>
                )}
              </div>
            </div>
            <PaymentMethodRadios value={method} onChange={setMethod} />
            <div>
              <label htmlFor="payment-comment" className="text-sm font-medium text-label">
                {t("finance:paymentModal.comment")}
              </label>
              <textarea
                id="payment-comment"
                rows={2}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={t("finance:paymentModal.commentPlaceholder")}
                className={`mt-1 ${INPUT_CLASSES} ${borderFor(false)}`}
              />
            </div>
          </fieldset>
        </form>
      </Modal>
    </>
  );
}

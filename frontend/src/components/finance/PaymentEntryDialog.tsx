import { useCallback, useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { UNSAFE_DataRouterContext } from "react-router-dom";
import { Lock, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PaymentCreatePayload, PaymentItem, PaymentMethod, PaymentOption } from "../../lib/finance/types";
import { useCreatePayment, usePaymentOptions } from "../../lib/finance/hooks";
import { PaymentTargets, type PaymentTargetError, type PaymentTargetPlan, type TargetDrafts } from "../../lib/finance/paymentTargets";
import { PaymentSubmissionOutcome, type PaymentFailureKind } from "../../lib/finance/paymentSubmissionOutcome";
import type { StudentSearchResult } from "../../lib/finance/studentSearch";
import { getSchoolCalendarDate, schoolCalendarDateToTimestamp } from "../../i18n/formatters";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import type { TargetRowProblem } from "./PaymentTargetRows";
import { PaymentTargetsSection } from "./PaymentTargetsSection";
import { PaymentMethodRadios } from "./PaymentMethodRadios";
import { PaymentNavigationGuard, type NavigationDecision } from "./PaymentNavigationGuard";
import { DatePicker } from "../ui/DatePicker";
import { StudentSearchField } from "./StudentSearchField";

export interface PaymentEntryProps {
  onClose: () => void;
  onSuccess: (payment: PaymentItem) => void;
  defaultStudentId?: number;
  defaultStudentName?: string;
  defaultCourseId?: number;
}

interface SelectedStudent {
  id: number;
  name: string;
}

const PAYMENT_DATE_FIELD_ID: string = "payment-date";

type EntryField = "student" | "targets" | "date";

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
  withdrawnExceedsDebt: "paymentModal.withdrawnExceedsDebt",
  rejected: "paymentModal.saveError",
};

const TARGET_ERROR_KEYS: Record<Exclude<PaymentTargetError["code"], "payment_target_exceeds_balance">, string> = {
  payment_target_sum_mismatch: "paymentModal.targetSumMismatch",
  invalid_payment_target: "paymentModal.targetInvalid",
  duplicate_payment_target: "paymentModal.targetDuplicate",
  payment_target_required: "paymentModal.targetRequired",
};

function borderFor(isInvalid: boolean): string {
  return isInvalid ? "border-destructive" : "border-control-border";
}

export function PaymentEntryDialog({ onClose, onSuccess, defaultStudentId, defaultStudentName, defaultCourseId }: PaymentEntryProps) {
  const { t } = useTranslation(["finance", "common"]);
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const isLocked: boolean = defaultStudentId !== undefined;
  const initialStudent: SelectedStudent | null = defaultStudentId !== undefined ? { id: defaultStudentId, name: defaultStudentName ?? "" } : null;
  const [student, setStudent] = useState<SelectedStudent | null>(initialStudent);
  const [drafts, setDrafts] = useState<TargetDrafts>({});
  const [rowProblems, setRowProblems] = useState<Record<number, TargetRowProblem>>({});
  const [targetFailureKey, setTargetFailureKey] = useState<string | null>(null);
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
  const baselineDrafts = useRef<TargetDrafts>({});
  const prefilled = useRef<boolean>(false);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  const createPayment = useCreatePayment();
  const paymentOptions = usePaymentOptions(student?.id);
  const options: readonly PaymentOption[] = paymentOptions.data?.enrollments ?? [];
  const pending: boolean = createPayment.isPending;
  const plan: PaymentTargetPlan = PaymentTargets.plan(options, drafts);
  const draftsChanged: boolean = Object.keys(drafts).some((key) => (drafts[Number(key)] ?? "") !== (baselineDrafts.current[Number(key)] ?? ""));
  const dirty: boolean = draftsChanged || comment !== "" || method !== "cash" || paidAt !== initialDate || student?.id !== initialStudent?.id;
  const studentLabel: string = student?.name ?? "";

  useEffect(() => {
    if (prefilled.current || defaultCourseId === undefined || !paymentOptions.data) return;
    prefilled.current = true;
    const match: PaymentOption | undefined = paymentOptions.data.enrollments.find((option) => option.course_id === defaultCourseId);
    if (match === undefined || !PaymentTargets.hasDebt(match)) return;
    const fill: TargetDrafts = { [match.enrollment_id]: PaymentTargets.debtFill(match) };
    baselineDrafts.current = fill;
    setDrafts(fill);
  }, [defaultCourseId, paymentOptions.data]);

  useEffect(() => {
    const refreshed: readonly PaymentOption[] = paymentOptions.data?.enrollments ?? [];
    baselineDrafts.current = PaymentTargets.clampDrafts(refreshed, baselineDrafts.current);
    setDrafts((current) => PaymentTargets.clampDrafts(refreshed, current));
  }, [paymentOptions.data]);

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
    (isLocked ? null : student ? changeStudentButton : searchField)?.current?.focus();
  };

  const discard = (): void => {
    const decision: NavigationDecision | null = navigation.current;
    navigation.current = null;
    setDismissDecision(false);
    onClose();
    decision?.proceed();
  };

  const resetTargets = (): void => {
    setDrafts({});
    setRowProblems({});
    setTargetFailureKey(null);
    baselineDrafts.current = {};
    prefilled.current = true;
  };

  const changeDraft = (enrollmentId: number, value: string): void => {
    setDrafts((current) => ({ ...current, [enrollmentId]: value }));
    setRowProblems((current) => {
      if (!(enrollmentId in current)) return current;
      const { [enrollmentId]: _removed, ...rest } = current;
      return rest;
    });
    setProblem(null);
    setTargetFailureKey(null);
  };

  const fillDebt = (option: PaymentOption): void => changeDraft(option.enrollment_id, PaymentTargets.debtFill(option));

  const chooseStudent = (selected: StudentSearchResult): void => {
    setStudent({ id: selected.id, name: `${selected.first_name} ${selected.last_name}` });
    resetTargets();
    setProblem(null);
    requestAnimationFrame(() => changeStudentButton.current?.focus());
  };

  const changeStudent = (): void => {
    setStudent(null);
    resetTargets();
    requestAnimationFrame(() => searchField.current?.focus());
  };

  const focusProblem = (field: EntryField): void => {
    const firstPayable: PaymentOption | undefined = options.find(PaymentTargets.isPayable);
    const target: HTMLElement | null | undefined =
      field === "student" ? searchField.current : field === "targets" ? document.getElementById(`payment-amount-${firstPayable?.enrollment_id}`) : document.getElementById(PAYMENT_DATE_FIELD_ID);
    target?.focus();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (inFlight.current || pending || verificationRequired) return;
    const found: FieldProblem | null =
      student === null
        ? { field: "student", messageKey: "paymentModal.chooseStudent" }
        : plan.targets.length === 0 && plan.invalidEnrollmentIds.length === 0
          ? { field: "targets", messageKey: "paymentModal.amountRequired" }
          : schoolCalendarDateToTimestamp(paidAt) === null
            ? { field: "date", messageKey: "paymentModal.invalidDate" }
            : null;
    setProblem(found);
    setFailure(null);
    setTargetFailureKey(null);
    setRowProblems(Object.fromEntries(plan.invalidEnrollmentIds.map((id: number): [number, TargetRowProblem] => [id, { messageKey: "paymentModal.invalidAmount" }])));
    if (plan.invalidEnrollmentIds.length > 0) {
      document.getElementById(`payment-amount-${plan.invalidEnrollmentIds[0]}`)?.focus();
      return;
    }
    if (found !== null) {
      focusProblem(found.field);
      return;
    }
    const payload: PaymentCreatePayload = {
      student_id: (student as SelectedStudent).id,
      targets: plan.targets,
      amount: plan.total,
      paid_at: schoolCalendarDateToTimestamp(paidAt) as string,
      method,
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    };
    inFlight.current = true;
    let payment: PaymentItem;
    try {
      payment = await createPayment.mutateAsync(payload);
    } catch (error) {
      const targetError: PaymentTargetError | null = PaymentTargets.parseError(error);
      if (targetError !== null) {
        if (targetError.code === "payment_target_exceeds_balance" && targetError.enrollmentId !== null) {
          setRowProblems({ [targetError.enrollmentId]: { messageKey: "paymentModal.targetExceedsBalance", maximum: targetError.maximum ?? "0" } });
          document.getElementById(`payment-amount-${targetError.enrollmentId}`)?.focus();
        } else {
          setTargetFailureKey(TARGET_ERROR_KEYS[targetError.code === "payment_target_exceeds_balance" ? "invalid_payment_target" : targetError.code]);
          void paymentOptions.refetch();
        }
        return;
      }
      const kind: PaymentFailureKind = PaymentSubmissionOutcome.classify(error);
      setVerificationRequired(!PaymentSubmissionOutcome.isConfirmedRejection(kind));
      setFailure(kind);
      if (kind === "closedPeriod") document.getElementById(PAYMENT_DATE_FIELD_ID)?.focus();
      else if (kind === "enrollment") void paymentOptions.refetch();
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
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button variant="secondary" disabled={pending} onClick={requestClose}>
          {t("common:cancel")}
        </Button>
        <Button type="submit" form="shared-payment-form" loading={pending} disabled={verificationRequired}>
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
        initialFocus={isLocked ? undefined : student ? changeStudentButton : searchField}
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
                        className="inline-flex min-h-11 shrink-0 items-center rounded-[10px] px-3 text-sm font-medium text-maroon-text hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
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
              </>
            )}
            {student && (
              <PaymentTargetsSection
                studentId={student.id}
                paymentOptions={paymentOptions}
                drafts={drafts}
                problems={rowProblems}
                total={plan.total}
                fieldProblem={problemFor("targets")}
                failureKey={targetFailureKey}
                onChange={changeDraft}
                onFill={fillDebt}
              />
            )}
            <div>
              <label htmlFor={PAYMENT_DATE_FIELD_ID} className="text-sm font-medium text-label">
                {t("finance:paymentModal.date")}
              </label>
              <div className="mt-1">
                <DatePicker
                  id={PAYMENT_DATE_FIELD_ID}
                  label={t("finance:paymentModal.date")}
                  value={paidAt}
                  onChange={setPaidAt}
                  invalid={problem?.field === "date"}
                  describedBy={problem?.field === "date" ? problemId("date") : undefined}
                />
              </div>
              {problemFor("date") && (
                <p id={problemId("date")} role="alert" className="mt-1 text-sm text-destructive">
                  {problemFor("date")}
                </p>
              )}
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

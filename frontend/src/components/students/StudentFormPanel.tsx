import { useContext, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";
import { SlideOver } from "../ui/SlideOver";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { AvatarUploadField } from "../ui/AvatarUploadField";
import { createStudentFormSchema, type StudentFormValues } from "../../lib/studentFormSchema";

interface NavigationDecision {
  proceed: () => void;
  reset: () => void;
}

function StudentNavigationGuard({
  active,
  onBlock,
}: {
  active: boolean;
  onBlock: (decision: NavigationDecision) => void;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      onBlock({ proceed: blocker.proceed, reset: blocker.reset });
    }
  }, [blocker.state, onBlock]);

  return null;
}
import {
  applyFieldErrors,
  buildCreatePayload,
  buildUpdatePayload,
  buildUserFormValues,
  describeUserApiError,
  isDuplicateEmailError,
} from "../../lib/users/formMapping";
import { useCreateUser, useUpdateUser } from "../../lib/users/hooks";
import { resolveMediaUrl } from "../../lib/users/media";
import { AuthApiError } from "../../lib/auth/errors";
import type { User } from "../../lib/users/types";

interface StudentFormPanelProps {
  open: boolean;
  mode?: "create" | "edit";
  student?: User;
  onClose: () => void;
  onSaved: (action: "created" | "updated", user?: User) => void;
  onAvatarSaved?: (user?: User) => void;
  finalFocus?: ComponentProps<typeof SlideOver>["finalFocus"];
}

export function StudentFormPanel({
  open,
  mode,
  student,
  onClose,
  onSaved,
  onAvatarSaved,
  finalFocus,
}: StudentFormPanelProps) {
  if (!open) {
    return null;
  }

  const effectiveMode = mode ?? (student ? "edit" : "create");

  return (
    <StudentFormPanelInner
      key={student?.id ?? "new"}
      open={open}
      mode={effectiveMode}
      student={student}
      onClose={onClose}
      onSaved={onSaved}
      onAvatarSaved={onAvatarSaved}
      finalFocus={finalFocus}
    />
  );
}

interface StudentFormPanelInnerProps {
  open: boolean;
  mode?: "create" | "edit";
  student?: User;
  onClose: () => void;
  onSaved: (action: "created" | "updated", user?: User) => void;
  onAvatarSaved?: (user?: User) => void;
  finalFocus?: ComponentProps<typeof SlideOver>["finalFocus"];
}

const inputClass =
  "w-full min-h-[48px] rounded-xl border border-control-border bg-card px-3.5 py-2.5 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out disabled:pointer-events-none disabled:opacity-60";

const labelClass = "text-sm font-medium text-ink";

function StudentFormPanelInner({
  open,
  mode = "create",
  student,
  onClose,
  onSaved,
  onAvatarSaved,
  finalFocus,
}: StudentFormPanelInnerProps) {
  const { t } = useTranslation(["students", "common"]);
  const isEditing = mode === "edit" && Boolean(student);

  const formRef = useRef<HTMLFormElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const lastActiveFieldRef = useRef<HTMLElement | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const submitGenRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const savedUserRef = useRef<User | undefined>(student);
  const blockerDecisionRef = useRef<NavigationDecision | null>(null);
  const dataRouter = useContext(UNSAFE_DataRouterContext);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isAvatarBusy, setIsAvatarBusy] = useState<boolean>(false);
  const [hasSavedAvatar, setHasSavedAvatar] = useState<boolean>(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const createUser = useCreateUser("student");
  const updateUser = useUpdateUser("student");

  const formSchema = useMemo(() => createStudentFormSchema((k: string) => t(k)), [t]);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, dirtyFields, isDirty },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildUserFormValues(student),
  });


  const firstNameReg = register("firstName");
  const lastNameReg = register("lastName");
  const emailReg = register("email");
  const phoneReg = register("phone");
  const birthDateReg = register("birthDate");
  const parentPhoneReg = register("parentPhone");
  const parentTelegramChatIdReg = register("parentTelegramChatId");
  const paymentDayReg = register("paymentDay");

  const isPending = createUser.isPending || updateUser.isPending;
  const isLocked = isPending || isSubmitting || isAvatarBusy;

  const initialFocusTarget = () => {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      const heading = document.querySelector<HTMLElement>('[role="dialog"] h2');
      if (heading) return heading;
    }
    return firstInputRef.current;
  };

  const getFirstInvalidElement = (): HTMLElement | null => {
    if (!formRef.current) return null;
    const domInvalid = formRef.current.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (domInvalid) return domInvalid;

    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      const el = formRef.current.querySelector<HTMLElement>(`#student-${errorKeys[0]}`);
      if (el) return el;
    }
    return null;
  };

  const handleAttemptClose = () => {
    if (isSubmittingRef.current || isLocked) return;
    if (isDirty || hasSavedAvatar) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const handleDiscardChanges = () => {
    if (isSubmittingRef.current || isLocked) return;
    setShowDiscardConfirm(false);
    if (blockerDecisionRef.current) {
      blockerDecisionRef.current.proceed();
      blockerDecisionRef.current = null;
    }
    reset();
    if (hasSavedAvatar && savedUserRef.current) {
      onSaved("updated", savedUserRef.current);
    }
    onClose();
  };

  const handleKeepEditing = () => {
    if (isSubmittingRef.current || isLocked) return;
    setShowDiscardConfirm(false);
    if (blockerDecisionRef.current) {
      blockerDecisionRef.current.reset();
      blockerDecisionRef.current = null;
    }
    requestAnimationFrame(() => {
      const target = lastActiveFieldRef.current ?? getFirstInvalidElement();
      if (target) {
        target.focus({ preventScroll: false });
      }
    });
  };

  const handleError = (err: unknown) => {
    if (isDuplicateEmailError(err)) {
      setError("email", { type: "server", message: t("validation.emailTaken") });
      const emailInput = formRef.current?.querySelector<HTMLElement>("#student-email");
      emailInput?.focus();
      return;
    }
    if (err instanceof AuthApiError && err.status === 422) {
      let firstInvalidFieldName: string | null = null;
      const applied = applyFieldErrors(err.fieldErrors, (field, error) => {
        if (!firstInvalidFieldName) firstInvalidFieldName = field;
        setError(field, error);
      });
      if (firstInvalidFieldName) {
        requestAnimationFrame(() => {
          const el = formRef.current?.querySelector<HTMLElement>(`#student-${firstInvalidFieldName}`);
          el?.focus({ preventScroll: false });
        });
      }
      if (!applied) setFormError(err.message);
      return;
    }
    setFormError(describeUserApiError(err, (k: string) => t(k)));
  };

  const onSubmit = async (values: StudentFormValues) => {
    if (isSubmittingRef.current || isLocked) return;
    isSubmittingRef.current = true;
    const currentGen = ++submitGenRef.current;
    setIsSubmitting(true);
    setFormError(undefined);

    try {
      if (student) {
        const updatePayload = buildUpdatePayload(values, dirtyFields);
        const hasDirtyChanges = Object.keys(updatePayload).length > 0;

        if (!hasDirtyChanges) {
          if (!isMountedRef.current || currentGen !== submitGenRef.current) return;
          onClose();
          return;
        }

        const updatedStudent = await updateUser.mutateAsync({
          id: student.id,
          payload: updatePayload,
        });

        if (!isMountedRef.current || currentGen !== submitGenRef.current) return;
        onClose();
        onSaved("updated", updatedStudent);
      } else {
        const createdStudent = await createUser.mutateAsync(buildCreatePayload(values));

        if (!isMountedRef.current || currentGen !== submitGenRef.current) return;
        onClose();
        onSaved("created", createdStudent);
      }
    } catch (err) {
      if (!isMountedRef.current || currentGen !== submitGenRef.current) return;
      handleError(err);
      requestAnimationFrame(() => {
        const firstInvalid = getFirstInvalidElement();
        if (firstInvalid) {
          firstInvalid.focus({ preventScroll: false });
        }
      });
    } finally {
      if (isMountedRef.current && currentGen === submitGenRef.current) {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    }
  };

  const onInvalidSubmit = (fieldErrors: FieldErrors<StudentFormValues>) => {
    requestAnimationFrame(() => {
      const firstKey = Object.keys(fieldErrors)[0];
      if (firstKey && formRef.current) {
        const el =
          formRef.current.querySelector<HTMLElement>(`#student-${firstKey}`) ??
          formRef.current.querySelector<HTMLElement>(`[name="${firstKey}"]`);
        if (el) {
          el.focus({ preventScroll: false });
          return;
        }
      }
      const firstInvalid = getFirstInvalidElement();
      if (firstInvalid) {
        firstInvalid.focus({ preventScroll: false });
      }
    });
  };

  const handleFocusCapture = (event: React.FocusEvent) => {
    const target = event.target as HTMLElement;
    if (target && formRef.current?.contains(target)) {
      lastActiveFieldRef.current = target;
    }
  };

  return (
    <>
      {dataRouter && (
        <StudentNavigationGuard
          active={open && isDirty && !isSubmitting}
          onBlock={(decision) => {
            blockerDecisionRef.current = decision;
            setShowDiscardConfirm(true);
          }}
        />
      )}
      <SlideOver
        open={open}
        onClose={handleAttemptClose}
        closeDisabled={isLocked}
        title={isEditing ? t("form.editStudentTitle") : t("form.newStudentTitle")}
        initialFocus={initialFocusTarget}
        finalFocus={finalFocus}
        footer={
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleAttemptClose}
              disabled={isLocked}
              className="min-h-[44px]"
            >
              {t("common:cancel")}
            </Button>
            <Button
              type="submit"
              form="student-form"
              variant="primary"
              loading={isLocked}
              disabled={isLocked}
              aria-busy={isLocked}
              className="min-h-[44px]"
            >
              {isLocked
                ? t("form.saving")
                : isEditing
                  ? t("common:save")
                  : t("common:create")}
            </Button>
          </div>
        }
      >
        <form
          ref={formRef}
          id="student-form"
          onSubmit={handleSubmit(onSubmit, onInvalidSubmit)}
          onFocusCapture={handleFocusCapture}
          noValidate
          className="flex flex-col gap-6"
        >
          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
            >
              {formError}
            </div>
          )}

          {student && (
            <div className="rounded-xl border border-border bg-strip p-4">
              <AvatarUploadField
                userId={student.id}
                role="student"
                currentPhotoUrl={resolveMediaUrl(student.thumbnail_path ?? student.photo_path)}
                firstName={student.first_name}
                lastName={student.last_name}
                onUploaded={(updatedUser) => {
                  setHasSavedAvatar(true);
                  savedUserRef.current = updatedUser;
                  onAvatarSaved?.(updatedUser);
                }}
                onBusyChange={(busy) => setIsAvatarBusy(busy)}
              />
            </div>
          )}

          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-ink border-b border-border pb-2">
              {t("form.sectionIdentity")}
            </h3>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="student-firstName" className={labelClass}>
                {t("form.firstNameLabel")} <span className="text-destructive">*</span>
              </label>
              <input
                id="student-firstName"
                autoComplete="given-name"
                aria-required="true"
                aria-invalid={Boolean(errors.firstName)}
                aria-describedby={errors.firstName ? "student-firstName-error" : undefined}
                className={inputClass}
                {...firstNameReg}
                ref={(el) => {
                  firstNameReg.ref(el);
                  firstInputRef.current = el;
                }}
              />
              {errors.firstName?.message && (
                <span id="student-firstName-error" role="alert" className="text-xs text-destructive">
                  {errors.firstName.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="student-lastName" className={labelClass}>
                {t("form.lastNameLabel")} <span className="text-destructive">*</span>
              </label>
              <input
                id="student-lastName"
                autoComplete="family-name"
                aria-required="true"
                aria-invalid={Boolean(errors.lastName)}
                aria-describedby={errors.lastName ? "student-lastName-error" : undefined}
                className={inputClass}
                {...lastNameReg}
              />
              {errors.lastName?.message && (
                <span id="student-lastName-error" role="alert" className="text-xs text-destructive">
                  {errors.lastName.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="student-email" className={labelClass}>
                {t("form.emailLabel")} <span className="text-destructive">*</span>
              </label>
              <input
                id="student-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                aria-required="true"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "student-email-error" : undefined}
                className={inputClass}
                {...emailReg}
              />
              {errors.email?.message && (
                <span id="student-email-error" role="alert" className="text-xs text-destructive">
                  {errors.email.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="student-birthDate" className={labelClass}>
                {t("form.dobLabel")}
              </label>
              <input
                id="student-birthDate"
                type="date"
                autoComplete="bday"
                aria-invalid={Boolean(errors.birthDate)}
                aria-describedby={errors.birthDate ? "student-birthDate-error" : undefined}
                className={inputClass}
                {...birthDateReg}
              />
              {errors.birthDate?.message && (
                <span id="student-birthDate-error" role="alert" className="text-xs text-destructive">
                  {errors.birthDate.message}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-ink border-b border-border pb-2">
              {t("form.sectionContacts")}
            </h3>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="student-phone" className={labelClass}>
                  {t("form.phoneLabel")}
                </label>
                <span className="text-xs text-muted">
                  {t("form.phoneHelp")}
                </span>
              </div>
              <input
                id="student-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+992901234567"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={
                  errors.phone
                    ? "student-phone-error"
                    : "student-phone-help"
                }
                className={inputClass}
                {...phoneReg}
              />
              <span id="student-phone-help" className="sr-only">
                {t("form.phoneHelp")}
              </span>
              {errors.phone?.message && (
                <span id="student-phone-error" role="alert" className="text-xs text-destructive">
                  {errors.phone.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="student-parentPhone" className={labelClass}>
                {t("form.parentPhoneLabel")}
              </label>
              <input
                id="student-parentPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+992901234567"
                aria-invalid={Boolean(errors.parentPhone)}
                aria-describedby={errors.parentPhone ? "student-parentPhone-error" : undefined}
                className={inputClass}
                {...parentPhoneReg}
              />
              {errors.parentPhone?.message && (
                <span id="student-parentPhone-error" role="alert" className="text-xs text-destructive">
                  {errors.parentPhone.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="student-parentTelegramChatId" className={labelClass}>
                {t("form.telegramChatIdLabel")}
              </label>
              <input
                id="student-parentTelegramChatId"
                inputMode="numeric"
                placeholder="123456789"
                aria-invalid={Boolean(errors.parentTelegramChatId)}
                aria-describedby={
                  errors.parentTelegramChatId
                    ? "student-parentTelegramChatId-error"
                    : "student-parentTelegramChatId-help"
                }
                className={inputClass}
                {...parentTelegramChatIdReg}
              />
              <span id="student-parentTelegramChatId-help" className="text-xs text-muted">
                {t("form.telegramChatIdHelp")}
              </span>
              {errors.parentTelegramChatId?.message && (
                <span id="student-parentTelegramChatId-error" role="alert" className="text-xs text-destructive">
                  {errors.parentTelegramChatId.message}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-ink border-b border-border pb-2">
              {t("form.sectionPayment")}
            </h3>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="student-paymentDay" className={labelClass}>
                  {t("form.paymentDayLabel")}
                </label>
                <span className="text-xs text-muted">
                  {t("form.paymentDayHelp")}
                </span>
              </div>
              <input
                id="student-paymentDay"
                type="number"
                min={1}
                max={28}
                inputMode="numeric"
                placeholder="10"
                aria-invalid={Boolean(errors.paymentDay)}
                aria-describedby={
                  errors.paymentDay
                    ? "student-paymentDay-error"
                    : "student-paymentDay-help"
                }
                className={inputClass}
                {...paymentDayReg}
              />
              <span id="student-paymentDay-help" className="sr-only">
                {t("form.paymentDayHelp")}
              </span>
              {errors.paymentDay?.message && (
                <span id="student-paymentDay-error" role="alert" className="text-xs text-destructive">
                  {errors.paymentDay.message}
                </span>
              )}
            </div>
          </div>
        </form>
      </SlideOver>

      <ConfirmDialog
        open={showDiscardConfirm}
        title={t("form.discardTitle")}
        message={
          hasSavedAvatar
            ? t("form.discardWithSavedAvatar")
            : t("form.discardPrompt")
        }
        confirmLabel={t("form.discardConfirm")}
        cancelLabel={t("form.keepEditing")}
        confirmVariant="primary"
        onConfirm={handleDiscardChanges}
        onCancel={handleKeepEditing}
      />
    </>
  );
}

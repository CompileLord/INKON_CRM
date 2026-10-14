import { useContext, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";
import { SlideOver } from "../ui/SlideOver";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { AvatarUploadField } from "../ui/AvatarUploadField";
import { createMentorFormSchema, type MentorFormValues } from "../../lib/mentorFormSchema";
import {
  buildMentorCreatePayload,
  buildMentorFormValues,
  buildMentorUpdatePayload,
  isDuplicateEmailError,
} from "../../lib/users/formMapping";
import { useCreateUser, useUpdateUser } from "../../lib/users/hooks";
import { resolveMediaUrl } from "../../lib/users/media";
import { AuthApiError } from "../../lib/auth/errors";
import type { User } from "../../lib/users/types";
import { useAuthStore } from "../../store/authStore";

interface NavigationDecision {
  proceed: () => void;
  reset: () => void;
}

function MentorNavigationGuard({
  active,
  onBlock,
  shouldAllowNavigation,
}: {
  active: boolean;
  onBlock: (decision: NavigationDecision) => void;
  shouldAllowNavigation: () => boolean;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && !shouldAllowNavigation() && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      onBlock({ proceed: blocker.proceed, reset: blocker.reset });
    }
  }, [blocker.state, onBlock]);

  return null;
}

interface MentorFormPanelProps {
  open: boolean;
  mode?: "create" | "edit";
  mentor?: User;
  onClose: () => void;
  onSaved: (action: "created" | "updated", user?: User) => void;
  onAvatarSaved?: (user?: User) => void;
  finalFocus?: ComponentProps<typeof SlideOver>["finalFocus"];
}

export function MentorFormPanel({
  open,
  mode,
  mentor,
  onClose,
  onSaved,
  onAvatarSaved,
  finalFocus,
}: MentorFormPanelProps) {
  if (!open) {
    return null;
  }

  const effectiveMode = mode ?? (mentor ? "edit" : "create");

  return (
    <MentorFormPanelInner
      key={mentor?.id ?? "new"}
      open={open}
      mode={effectiveMode}
      mentor={mentor}
      onClose={onClose}
      onSaved={onSaved}
      onAvatarSaved={onAvatarSaved}
      finalFocus={finalFocus}
    />
  );
}

interface MentorFormPanelInnerProps {
  open: boolean;
  mode?: "create" | "edit";
  mentor?: User;
  onClose: () => void;
  onSaved: (action: "created" | "updated", user?: User) => void;
  onAvatarSaved?: (user?: User) => void;
  finalFocus?: ComponentProps<typeof SlideOver>["finalFocus"];
}

const inputClass =
  "w-full min-h-[48px] rounded-xl border border-control-border bg-card px-3.5 py-2.5 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out disabled:pointer-events-none disabled:opacity-60";

const labelClass = "text-sm font-medium text-ink";

function MentorFormPanelInner({
  open,
  mode = "create",
  mentor,
  onClose,
  onSaved,
  onAvatarSaved,
  finalFocus,
}: MentorFormPanelInnerProps) {
  const { t } = useTranslation(["mentors", "common"]);
  const isEditing = mode === "edit" && Boolean(mentor);

  const formRef = useRef<HTMLFormElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const lastActiveFieldRef = useRef<HTMLElement | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const submitGenRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const savedUserRef = useRef<User | undefined>(mentor);
  const blockerDecisionRef = useRef<NavigationDecision | null>(null);
  const allowRouteChangeRef = useRef<boolean>(false);
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const authOwner = useAuthStore((state) => `${state.role ?? "anonymous"}:${state.userId ?? "none"}`);
  const panelOwnerRef = useRef(authOwner);

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

  useEffect(() => {
    let previousOwner = authOwner;
    return useAuthStore.subscribe((state) => {
      const nextOwner = `${state.role ?? "anonymous"}:${state.userId ?? "none"}`;
      if (nextOwner !== previousOwner) {
        previousOwner = nextOwner;
        submitGenRef.current++;
      }
    });
  }, []);

  const createUser = useCreateUser("mentor");
  const updateUser = useUpdateUser("mentor");

  const formSchema = useMemo(() => createMentorFormSchema((k: string) => t(k)), [t]);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, dirtyFields, isDirty },
  } = useForm<MentorFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildMentorFormValues(mentor),
  });

  const firstNameReg = register("firstName");
  const lastNameReg = register("lastName");
  const emailReg = register("email");
  const phoneReg = register("phone");
  const birthDateReg = register("birthDate");

  const isPending = createUser.isPending || updateUser.isPending;
  const isLocked = isPending || isSubmitting || isAvatarBusy;
  const isLockedRef = useRef<boolean>(isLocked);
  isLockedRef.current = isLocked;

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
      const el = formRef.current.querySelector<HTMLElement>(`#mentor-${errorKeys[0]}`);
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
      const emailInput = formRef.current?.querySelector<HTMLElement>("#mentor-email");
      emailInput?.focus();
      return;
    }
    if (err instanceof AuthApiError && err.status === 422) {
      let firstInvalidFieldName: string | null = null;
      let applied = false;

      for (const [apiKey, msg] of Object.entries(err.fieldErrors)) {
        let fieldName: keyof MentorFormValues | null = null;
        if (apiKey === "first_name") fieldName = "firstName";
        else if (apiKey === "last_name") fieldName = "lastName";
        else if (apiKey === "email") fieldName = "email";
        else if (apiKey === "phone") fieldName = "phone";
        else if (apiKey === "date_of_birth") fieldName = "birthDate";

        if (fieldName) {
          if (!firstInvalidFieldName) firstInvalidFieldName = fieldName;
          let localizedMessage = t("validation.invalidField");
          const lowerMsg = (msg || "").toLowerCase();
          if (lowerMsg.includes("required") || lowerMsg.includes("missing")) {
            if (fieldName === "firstName") localizedMessage = t("validation.firstNameRequired");
            else if (fieldName === "lastName") localizedMessage = t("validation.lastNameRequired");
            else if (fieldName === "email") localizedMessage = t("validation.emailRequired");
            else localizedMessage = t("validation.required");
          } else if (fieldName === "email") {
            localizedMessage = t("validation.invalidEmail");
          } else if (fieldName === "phone") {
            localizedMessage = t("validation.invalidPhone");
          }
          setError(fieldName, { type: "server", message: localizedMessage });
          applied = true;
        }
      }

      if (firstInvalidFieldName) {
        requestAnimationFrame(() => {
          const el = formRef.current?.querySelector<HTMLElement>(`#mentor-${firstInvalidFieldName}`);
          el?.focus({ preventScroll: false });
        });
      }
      if (!applied) {
        setFormError(t("validation.generalValidationError"));
      }
      return;
    }
    setFormError(t("form.saveError"));
  };

  const onSubmit = async (values: MentorFormValues) => {
    if (isSubmittingRef.current || isLocked) return;
    isSubmittingRef.current = true;
    const currentGen = ++submitGenRef.current;
    const submittedOwner = useAuthStore.getState();
    const isCurrentSubmission = () => {
      const currentOwner = useAuthStore.getState();
      return (
        isMountedRef.current &&
        currentGen === submitGenRef.current &&
        currentOwner.role === submittedOwner.role &&
        currentOwner.userId === submittedOwner.userId
      );
    };
    setIsSubmitting(true);
    setFormError(undefined);

    try {
      if (mentor) {
        const updatePayload = buildMentorUpdatePayload(values, dirtyFields);
        const hasDirtyChanges = Object.keys(updatePayload).length > 0;

        if (!hasDirtyChanges) {
          if (!isCurrentSubmission()) return;
          onClose();
          return;
        }

        const updatedMentor = await updateUser.mutateAsync({
          id: mentor.id,
          payload: updatePayload,
        });

        if (!isCurrentSubmission()) return;
        blockerDecisionRef.current?.reset();
        blockerDecisionRef.current = null;
        allowRouteChangeRef.current = true;
        onClose();
        onSaved("updated", updatedMentor);
      } else {
        const createdMentor = await createUser.mutateAsync(buildMentorCreatePayload(values));

        if (!isCurrentSubmission()) return;
        blockerDecisionRef.current?.reset();
        blockerDecisionRef.current = null;
        allowRouteChangeRef.current = true;
        onClose();
        onSaved("created", createdMentor);
      }
    } catch (err) {
      if (!isCurrentSubmission()) return;
      handleError(err);
      requestAnimationFrame(() => {
        const firstInvalid = getFirstInvalidElement();
        if (firstInvalid) {
          firstInvalid.focus({ preventScroll: false });
        }
      });
    } finally {
      if (isMountedRef.current) {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    }
  };

  const onInvalidSubmit = (fieldErrors: FieldErrors<MentorFormValues>) => {
    requestAnimationFrame(() => {
      const firstKey = Object.keys(fieldErrors)[0];
      if (firstKey && formRef.current) {
        const el =
          formRef.current.querySelector<HTMLElement>(`#mentor-${firstKey}`) ??
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
        <MentorNavigationGuard
          active={open && (isDirty || isLocked)}
          shouldAllowNavigation={() => allowRouteChangeRef.current}
          onBlock={(decision) => {
            blockerDecisionRef.current = decision;
            if (isLockedRef.current) {
              decision.reset();
              blockerDecisionRef.current = null;
              return;
            }
            setShowDiscardConfirm(true);
          }}
        />
      )}
      <SlideOver
        open={open}
        onClose={handleAttemptClose}
        closeDisabled={isLocked}
        title={isEditing ? t("form.editMentorTitle") : t("form.newMentorTitle")}
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
              form="mentor-form"
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
          id="mentor-form"
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

          {mentor && (
            <div className="rounded-xl border border-border bg-strip p-4">
              <AvatarUploadField
                userId={mentor.id}
                role="mentor"
                currentPhotoUrl={resolveMediaUrl(mentor.thumbnail_path ?? mentor.photo_path)}
                firstName={mentor.first_name}
                lastName={mentor.last_name}
                onUploaded={(updatedUser) => {
                  const currentOwner = useAuthStore.getState();
                  const currentOwnerIdentity = `${currentOwner.role ?? "anonymous"}:${currentOwner.userId ?? "none"}`;
                  if (currentOwnerIdentity !== panelOwnerRef.current) return;
                  setHasSavedAvatar(true);
                  savedUserRef.current = updatedUser;
                  if (onAvatarSaved) onAvatarSaved(updatedUser);
                  else onSaved("updated", updatedUser);
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
              <label htmlFor="mentor-firstName" className={labelClass}>
                {t("form.firstNameLabel")} <span className="text-destructive">*</span>
              </label>
              <input
                id="mentor-firstName"
                autoComplete="given-name"
                aria-required="true"
                aria-invalid={Boolean(errors.firstName)}
                aria-describedby={errors.firstName ? "mentor-firstName-error" : undefined}
                className={inputClass}
                {...firstNameReg}
                ref={(el) => {
                  firstNameReg.ref(el);
                  firstInputRef.current = el;
                }}
              />
              {errors.firstName?.message && (
                <span id="mentor-firstName-error" role="alert" className="text-xs text-destructive">
                  {errors.firstName.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="mentor-lastName" className={labelClass}>
                {t("form.lastNameLabel")} <span className="text-destructive">*</span>
              </label>
              <input
                id="mentor-lastName"
                autoComplete="family-name"
                aria-required="true"
                aria-invalid={Boolean(errors.lastName)}
                aria-describedby={errors.lastName ? "mentor-lastName-error" : undefined}
                className={inputClass}
                {...lastNameReg}
              />
              {errors.lastName?.message && (
                <span id="mentor-lastName-error" role="alert" className="text-xs text-destructive">
                  {errors.lastName.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="mentor-email" className={labelClass}>
                {t("form.emailLabel")} <span className="text-destructive">*</span>
              </label>
              <input
                id="mentor-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                aria-required="true"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "mentor-email-error" : undefined}
                className={inputClass}
                {...emailReg}
              />
              {errors.email?.message && (
                <span id="mentor-email-error" role="alert" className="text-xs text-destructive">
                  {errors.email.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="mentor-birthDate" className={labelClass}>
                {t("form.dobLabel")}
              </label>
              <input
                id="mentor-birthDate"
                type="date"
                autoComplete="bday"
                aria-invalid={Boolean(errors.birthDate)}
                aria-describedby={errors.birthDate ? "mentor-birthDate-error" : undefined}
                className={inputClass}
                {...birthDateReg}
              />
              {errors.birthDate?.message && (
                <span id="mentor-birthDate-error" role="alert" className="text-xs text-destructive">
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
                <label htmlFor="mentor-phone" className={labelClass}>
                  {t("form.phoneLabel")}
                </label>
                <span className="text-xs text-muted">
                  {t("form.phoneHelp")}
                </span>
              </div>
              <input
                id="mentor-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t("form.phonePlaceholder")}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={
                  errors.phone
                    ? "mentor-phone-error"
                    : "mentor-phone-help"
                }
                className={inputClass}
                {...phoneReg}
              />
              <span id="mentor-phone-help" className="sr-only">
                {t("form.phoneHelp")}
              </span>
              {errors.phone?.message && (
                <span id="mentor-phone-error" role="alert" className="text-xs text-destructive">
                  {errors.phone.message}
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

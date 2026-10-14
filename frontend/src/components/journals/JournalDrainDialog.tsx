import React from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import type { NavigationGuard } from "../../lib/journals/useJournalNavigationGuard";

interface JournalDrainDialogProps {
  guard: NavigationGuard;
  onReview: () => void;
}

export const JournalDrainDialog: React.FC<JournalDrainDialogProps> = ({ guard, onReview }) => {
  const { t } = useTranslation("journals");
  const { state } = guard;
  const open: boolean = state.phase !== "idle";
  const isBusy: boolean = state.phase === "draining" || state.phase === "discarding";

  let body: string = t("drain.savingBody");
  let title: string = t("drain.title");
  if (state.phase === "discarding") body = t("drain.discarding");
  if (state.phase === "blocked") {
    title = t("drain.failedTitle");
    body =
      state.result.kind === "conflict"
        ? t("drain.conflictBody")
        : state.result.kind === "unavailable"
          ? t("drain.unavailableBody")
          : t("drain.failedBody");
  }

  return (
    <Modal
      open={open}
      onClose={guard.stay}
      title={title}
      closeDisabled={isBusy}
      footer={
        state.phase === "blocked" ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button type="button" variant="destructive" onClick={guard.discard}>
              {t("drain.discard")}
            </Button>
            <Button type="button" variant="secondary" onClick={guard.stay}>
              {t("drain.stay")}
            </Button>
            {state.result.kind === "conflict" ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  guard.stay();
                  onReview();
                }}
              >
                {t("drain.review")}
              </Button>
            ) : (
              <Button type="button" variant="primary" onClick={guard.retry}>
                {t("drain.retry")}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <p role="status" aria-live="polite" className="text-sm text-ink" data-testid="drain-dialog-body">
        {body}
      </p>
      {state.phase === "blocked" && state.discardFailed && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {t("drain.discardFailed")}
        </p>
      )}
    </Modal>
  );
};

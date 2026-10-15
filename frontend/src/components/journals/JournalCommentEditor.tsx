import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

interface JournalCommentEditorProps {
  studentName: string;
  formattedDate: string;
  initialComment: string | null;
  onSave: (comment: string) => void;
  onClose: () => void;
}

export const JournalCommentEditor: React.FC<JournalCommentEditorProps> = ({
  studentName,
  formattedDate,
  initialComment,
  onSave,
  onClose,
}) => {
  const { t } = useTranslation("journals");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<string>(initialComment ?? "");
  const [confirmingDiscard, setConfirmingDiscard] = useState<boolean>(false);
  const isDirty: boolean = draft !== (initialComment ?? "");

  const requestDismiss = (): void => {
    if (!isDirty) {
      onClose();
      return;
    }
    setConfirmingDiscard(true);
  };

  const save = (): void => {
    onSave(draft.trim());
    onClose();
  };

  const continueEditing = (): void => {
    setConfirmingDiscard(false);
    textareaRef.current?.focus();
  };

  const footer = confirmingDiscard ? (
    <div role="alert" className="flex flex-col gap-3">
      <p className="text-sm text-ink">{t("comment.discardPrompt")}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={continueEditing}>
          {t("comment.continueEditing")}
        </Button>
        <Button type="button" variant="destructive" onClick={onClose}>
          {t("comment.discard")}
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      {isDirty && <p className="text-sm text-muted">{t("comment.cancelConsequence")}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("table.commentCancel")}
        </Button>
        <Button type="button" onClick={save}>
          {t("table.commentSave")}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={requestDismiss}
      title={t("comment.title", { name: studentName, date: formattedDate })}
      maxWidthClassName="max-w-[480px]"
      initialFocus={textareaRef}
      footer={footer}
    >
      <label className="mb-1 block text-sm font-medium text-ink" htmlFor="journal-comment-field">
        {t("table.comment")}
      </label>
      <textarea
        id="journal-comment-field"
        ref={textareaRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            save();
          }
        }}
        rows={5}
        placeholder={t("table.commentPlaceholder")}
        className="min-h-32 w-full resize-y rounded-[10px] border border-control-border bg-card p-3 text-base text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </Modal>
  );
};

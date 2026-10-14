import React, { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard } from "lucide-react";

const SHORTCUT_IDS: readonly string[] = ["arrows", "grade", "attendance", "comment", "clear", "close"];

export const JournalKeyboardHelp: React.FC = () => {
  const { t } = useTranslation("journals");
  const [open, setOpen] = useState<boolean>(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId: string = useId();

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent): void => {
      const target: Node = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((previous) => !previous)}
        className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-control-border bg-card px-3 text-sm font-medium text-ink hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        <Keyboard className="h-4 w-4" aria-hidden="true" />
        {t("help.button")}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label={t("help.title")}
          className="absolute left-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-4 text-ink shadow-lg"
        >
          <h3 className="mb-3 text-sm font-semibold">{t("help.title")}</h3>
          <dl className="space-y-2 text-sm">
            {SHORTCUT_IDS.map((shortcutId) => (
              <div key={shortcutId} className="flex items-start justify-between gap-4">
                <dt className="shrink-0 rounded-md border border-control-border bg-strip px-2 py-0.5 text-xs font-semibold tabular-nums">
                  {t(`help.keycap.${shortcutId}`)}
                </dt>
                <dd className="text-right text-muted">{t(`help.${shortcutId}`)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">{t("help.scope")}</p>
        </div>
      )}
    </div>
  );
};

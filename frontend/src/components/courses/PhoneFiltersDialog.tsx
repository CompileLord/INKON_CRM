import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Check } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "../ui/Button";
import type { SortOption } from "./CoursesToolbar";

interface PhoneFiltersDialogProps {
  open: boolean;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function PhoneFiltersDialog({
  open,
  sort,
  onSortChange,
  onClose,
  triggerRef,
}: PhoneFiltersDialogProps) {
  const { t } = useTranslation(["courses", "common"]);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const returnFocus = () =>
    triggerRef?.current?.isConnected
      ? triggerRef.current
      : (document.getElementById("main-content") ?? null);

  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia("(min-width: 768px)");
    const handler = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) onClose();
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    }
  }, [open]);

  if (!open) return null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-60 bg-scrim" />
        <Dialog.Popup
          id="phone-courses-filter-popup"
          finalFocus={returnFocus}
          className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 z-70 flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-32px)] w-[min(380px,calc(100%-32px))] -translate-x-1/2 origin-bottom flex-col overflow-hidden rounded-2xl border border-border bg-card text-ink shadow-xl motion-safe:animate-[card-scale-in_200ms_ease-out] has-focus-visible:animate-none"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Dialog.Title className="text-base font-semibold text-ink">
              {t("filters")}
            </Dialog.Title>
            <Dialog.Close
              ref={closeButtonRef}
              aria-label={t("common:close")}
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[10px] text-muted motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-strip hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon"
            >
              <X size={20} />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-4 overflow-y-auto overscroll-contain p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                {t("sortBy")}
              </p>
              <fieldset
                className="flex flex-col gap-1.5 border-0 p-0 m-0"
                aria-label={t("sortBy")}
              >
                <label
                  htmlFor="phone-sort-newest"
                  className={[
                    "flex min-h-[44px] w-full cursor-pointer items-center justify-between rounded-[10px] px-3.5 py-2.5 text-sm font-medium motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out focus-within:ring-2 focus-within:ring-maroon",
                    sort === "newest"
                      ? "bg-beige text-maroon font-semibold"
                      : "text-ink hover:bg-strip",
                  ].join(" ")}
                >
                  <span>{t("sort.newest")}</span>
                  <input
                    id="phone-sort-newest"
                    type="radio"
                    name="phone-courses-sort"
                    value="newest"
                    checked={sort === "newest"}
                    onChange={() => onSortChange("newest")}
                    className="sr-only"
                  />
                  {sort === "newest" ? (
                    <Check size={18} className="text-maroon shrink-0" />
                  ) : null}
                </label>

                <label
                  htmlFor="phone-sort-price"
                  className={[
                    "flex min-h-[44px] w-full cursor-pointer items-center justify-between rounded-[10px] px-3.5 py-2.5 text-sm font-medium motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out focus-within:ring-2 focus-within:ring-maroon",
                    sort === "price"
                      ? "bg-beige text-maroon font-semibold"
                      : "text-ink hover:bg-strip",
                  ].join(" ")}
                >
                  <span>{t("sort.price")}</span>
                  <input
                    id="phone-sort-price"
                    type="radio"
                    name="phone-courses-sort"
                    value="price"
                    checked={sort === "price"}
                    onChange={() => onSortChange("price")}
                    className="sr-only"
                  />
                  {sort === "price" ? (
                    <Check size={18} className="text-maroon shrink-0" />
                  ) : null}
                </label>
              </fieldset>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-border bg-card p-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onSortChange("newest")}
              className="min-h-[44px] min-w-[44px] px-4"
            >
              {t("reset")}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] px-5"
            >
              {t("done")}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

import { useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { ChevronDown, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StudentSearchResult } from "../../lib/finance/studentSearch";
import { StudentSearchField } from "./StudentSearchField";

interface PaymentStudentFilterProps {
  studentName: string | null;
  onSelect: (student: StudentSearchResult) => void;
}

export function PaymentStudentFilter({ studentName, onSelect }: PaymentStudentFilterProps) {
  const { t } = useTranslation("finance");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const searchRef = useRef<HTMLInputElement>(null);
  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-control-border bg-card px-3 text-sm text-ink hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        <Users size={16} aria-hidden="true" className="text-muted" />
        <span className="text-label">{t("paymentsTab.studentLabel")}</span>
        <span className="max-w-40 truncate font-medium">{studentName ?? t("paymentsTab.all")}</span>
        <ChevronDown size={14} aria-hidden="true" className="text-muted" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={16} className="z-70">
          <Popover.Popup
            initialFocus={() => searchRef.current}
            className="w-[min(24rem,calc(100vw-32px))] origin-[var(--transform-origin)] rounded-2xl border border-border-warm bg-card p-4 shadow-lg transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none motion-safe:transition-[opacity,transform] data-[starting-style]:opacity-0 motion-safe:data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:duration-100 motion-safe:data-[ending-style]:scale-[0.96]"
          >
            <Popover.Title className="mb-2 text-sm font-semibold text-ink">{t("paymentsTab.studentTitle")}</Popover.Title>
            <StudentSearchField
              label={t("paymentsTab.studentSearch")}
              hideLabel
              inputRef={searchRef}
              onSelect={(student) => {
                onSelect(student);
                setIsOpen(false);
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "../ui/PersonAvatar";
import { formatPhoneDisplay } from "../../i18n/formatters";
import { resolveMediaUrl } from "../../lib/users/media";
import type { EligibleCandidateResponse } from "../../lib/enrollments/types";
import type { EnrollFailureKey } from "./enrollFailureKey";

interface EnrollCandidateRowProps {
  candidate: EligibleCandidateResponse;
  isSelected: boolean;
  isEnrolled: boolean;
  failure: EnrollFailureKey | undefined;
  disabled: boolean;
  onToggle: (candidate: EligibleCandidateResponse) => void;
}

export function EnrollCandidateRow({ candidate, isSelected, isEnrolled, failure, disabled, onToggle }: EnrollCandidateRowProps) {
  const { t } = useTranslation("courses");
  const contact: string = candidate.email ?? (candidate.phone ? formatPhoneDisplay(candidate.phone) : "");
  const borderClass: string = failure ? "border-destructive/40" : isSelected ? "border-maroon dark:border-accent" : "border-border";

  return (
    <label
      className={`flex min-h-[52px] cursor-pointer select-none items-center gap-3 rounded-xl border bg-card p-3 text-left hover:bg-row-hover focus-within:ring-2 focus-within:ring-maroon dark:focus-within:ring-accent motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] ${borderClass}`}
    >
      <input
        type="checkbox"
        value={candidate.id}
        checked={isSelected || isEnrolled}
        disabled={disabled || isEnrolled}
        onChange={() => onToggle(candidate)}
        className="h-4 w-4 shrink-0 accent-maroon focus:ring-0"
      />
      <PersonAvatar
        firstName={candidate.first_name}
        lastName={candidate.last_name}
        photoUrl={resolveMediaUrl(candidate.thumbnail_path ?? candidate.photo_path) ?? undefined}
        size={36}
      />
      <div className="min-w-0 flex-1">
        <span className="block break-words text-base font-medium text-ink md:text-sm">{candidate.first_name} {candidate.last_name}</span>
        {contact ? <span className="block break-words text-xs text-muted">{contact}</span> : null}
        {failure ? <span role="alert" className="block break-words text-xs text-destructive">{t(`enrollment.${failure}`)}</span> : null}
      </div>
      {isEnrolled ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-surface px-2.5 py-0.5 text-xs font-medium text-success">
          <Check size={12} aria-hidden="true" />
          {t("enrollment.enrolledBadge")}
        </span>
      ) : null}
    </label>
  );
}

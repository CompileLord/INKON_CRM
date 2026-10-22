import { CanonicalPhone } from "../../lib/users/CanonicalPhone";
import { useId, useState, type KeyboardEvent, type Ref } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDebouncedText, useStudentSearch, type StudentSearchResult } from "../../lib/finance/studentSearch";
import { formatNumber } from "../../i18n/formatters";
import { Button } from "../ui/Button";

interface StudentSearchFieldProps {
  label: string;
  onSelect: (student: StudentSearchResult) => void;
  inputRef?: Ref<HTMLInputElement>;
  invalid?: boolean;
  describedBy?: string;
  hideLabel?: boolean;
}

const INPUT_CLASSES: string =
  "min-h-12 w-full min-w-0 rounded-[10px] border bg-card py-2 pl-9 pr-3 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function StudentSearchField({ label, onSelect, inputRef, invalid = false, describedBy, hideLabel = false }: StudentSearchFieldProps) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const fieldId: string = useId();
  const listId: string = `${fieldId}-results`;
  const [query, setQuery] = useState<string>("");
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const settledQuery: string = useDebouncedText(query);
  const hasQuery: boolean = query.trim().length > 0;
  const isCurrent: boolean = settledQuery.trim() === query.trim();
  const search = useStudentSearch(settledQuery, true);
  const students: StudentSearchResult[] = search.data?.pages.flatMap((page) => page.items) ?? [];
  const total: number = search.data?.pages[0]?.total ?? 0;
  const isSearching: boolean = hasQuery && (!isCurrent || (search.isPending && !search.isError));
  const showResults: boolean = hasQuery && isCurrent && search.isSuccess && students.length > 0;
  const showEmpty: boolean = hasQuery && isCurrent && search.isSuccess && students.length === 0;
  const showError: boolean = hasQuery && isCurrent && search.isError && !search.isFetching;

  const announcement: string = isSearching
    ? t("paymentModal.searching")
    : showResults
      ? t("paymentModal.resultsShown", { shown: formatNumber(students.length, i18n.language), total: formatNumber(total, i18n.language) })
      : showEmpty
        ? t("paymentModal.noStudents")
        : showError
          ? t("paymentModal.studentSearchError")
          : "";

  const choose = (student: StudentSearchResult): void => {
    onSelect(student);
    setQuery("");
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" && showResults) {
      event.preventDefault();
      setActiveIndex((current) => Math.min(students.length - 1, current + 1));
    } else if (event.key === "ArrowUp" && showResults) {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter" && showResults && activeIndex >= 0) {
      event.preventDefault();
      choose(students[activeIndex]);
    } else if (event.key === "Escape" && hasQuery) {
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
      setActiveIndex(-1);
    }
  };

  return (
    <div>
      <label htmlFor={fieldId} className={hideLabel ? "sr-only" : "text-sm font-medium text-label"}>
        {label}
      </label>
      <div className={`relative ${hideLabel ? "" : "mt-1"}`}>
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          id={fieldId}
          ref={inputRef}
          role="combobox"
          aria-expanded={showResults}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showResults && activeIndex >= 0 ? `${fieldId}-option-${activeIndex}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          placeholder={t("paymentModal.searchPlaceholder")}
          className={`${INPUT_CLASSES} ${invalid ? "border-destructive" : "border-control-border"}`}
        />
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {isSearching && (
        <p aria-hidden="true" className="mt-2 px-1 text-sm text-muted">
          {t("paymentModal.searching")}
        </p>
      )}
      {showError && (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm text-destructive">
          <p>{t("paymentModal.studentSearchError")}</p>
          <Button variant="secondary" loading={search.isFetching} onClick={() => void search.refetch()}>
            {t("common:retry")}
          </Button>
        </div>
      )}
      {showEmpty && <p aria-hidden="true" className="mt-2 px-1 text-sm text-muted">{t("paymentModal.noStudents")}</p>}
      <ul
        id={listId}
        role="listbox"
        aria-label={t("paymentModal.resultsLabel")}
        hidden={!showResults}
        className="mt-2 max-h-64 divide-y divide-border overflow-y-auto overscroll-contain rounded-xl border border-border"
      >
        {showResults &&
          students.map((student, index) => (
            <li
              key={student.id}
              id={`${fieldId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(student)}
              onMouseEnter={() => setActiveIndex(index)}
              ref={(element) => {
                if (index === activeIndex) element?.scrollIntoView?.({ block: "nearest" });
              }}
              className={`min-h-11 cursor-pointer break-words px-3 py-2 text-sm text-ink motion-safe:transition-colors motion-safe:duration-150 ${index === activeIndex ? "bg-row-hover" : ""}`}
            >
              <span className="block font-medium">
                {student.first_name} {student.last_name}
              </span>
              <span className="block text-xs text-muted">
                {t("analytics.studentNumber", { id: formatNumber(student.id, i18n.language) })} · {student.email ?? CanonicalPhone.prefill(student.phone)}
              </span>
            </li>
          ))}
      </ul>
      {showResults && search.hasNextPage && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted tabular-nums">
            {t("paymentModal.resultsShown", { shown: formatNumber(students.length, i18n.language), total: formatNumber(total, i18n.language) })}
          </p>
          <Button variant="secondary" loading={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>
            {t("paymentModal.moreResults")}
          </Button>
        </div>
      )}
    </div>
  );
}

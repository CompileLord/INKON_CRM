import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import type { JournalPeriod } from "../../lib/courses/types";

interface CoursePeriodParamInput {
  isProgressTab: boolean;
  journals: JournalPeriod[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onUnknownPeriod: () => void;
}

export function useCoursePeriodParam({ isProgressTab, journals, isLoading, isError, onUnknownPeriod }: CoursePeriodParamInput): void {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!isProgressTab || isLoading || isError) return;
    const requestedPeriod: string | null = searchParams.get("period");
    if (!requestedPeriod) return;

    const replacePeriod = (nextPeriod: number | null): void => {
      setSearchParams(
        (previous: URLSearchParams) => {
          const next: URLSearchParams = new URLSearchParams(previous);
          if (nextPeriod === null) next.delete("period");
          else next.set("period", String(nextPeriod));
          return next;
        },
        { replace: true },
      );
    };

    const parsedPeriodId: number = Number(requestedPeriod);
    if (!Number.isSafeInteger(parsedPeriodId) || parsedPeriodId <= 0) {
      replacePeriod(null);
      return;
    }
    if (!journals) return;
    if (journals.length === 0) {
      replacePeriod(null);
      return;
    }
    if (!journals.some((journal: JournalPeriod) => journal.id === parsedPeriodId)) {
      onUnknownPeriod();
      replacePeriod(journals[0].id);
    }
  }, [isProgressTab, isLoading, isError, journals, searchParams, setSearchParams, onUnknownPeriod]);
}

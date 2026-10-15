import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getStudents } from "../users/endpoints";
import type { User } from "../users/types";

export const STUDENT_SEARCH_PAGE_SIZE: number = 8;
const SEARCH_DEBOUNCE_MILLISECONDS: number = 200;

export function useDebouncedText(text: string): string {
  const [settled, setSettled] = useState<string>(text);
  useEffect(() => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => setSettled(text), SEARCH_DEBOUNCE_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [text]);
  return settled;
}

export function useStudentSearch(term: string, enabled: boolean) {
  const trimmed: string = term.trim();
  return useInfiniteQuery({
    queryKey: ["users", "students", "payment-search", trimmed],
    queryFn: ({ pageParam }) => getStudents({ search: trimmed, page: pageParam, page_size: STUDENT_SEARCH_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined),
    enabled: enabled && trimmed.length > 0,
  });
}

export type StudentSearchResult = Pick<User, "id" | "first_name" | "last_name" | "email">;

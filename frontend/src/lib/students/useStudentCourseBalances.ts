import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { httpClient } from "../auth/httpClient";
import type { PaymentOption, PaymentOptions } from "../finance/types";

export interface StudentCourseBalance {
  isGrant: boolean;
  openDebt: string;
}

export function useStudentCourseBalances(studentId: number, enabled: boolean): UseQueryResult<Map<number, StudentCourseBalance>> {
  return useQuery({
    queryKey: ["students", "course-balances", studentId],
    queryFn: async (): Promise<Map<number, StudentCourseBalance>> => {
      const response = await httpClient.get<PaymentOptions>(`/finance/students/${studentId}/payment-options`);
      return new Map(
        response.data.enrollments.map((option: PaymentOption): [number, StudentCourseBalance] => [
          option.course_id,
          { isGrant: option.billing_mode === "grant", openDebt: option.open_debt },
        ]),
      );
    },
    enabled,
  });
}

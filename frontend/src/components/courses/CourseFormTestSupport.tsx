import { vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CourseMentorHistoryResponse, CourseResponse } from "../../lib/courses/types";
import "../../i18n";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
});
window.HTMLElement.prototype.scrollIntoView = vi.fn();
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => "blob:mock-url";
  globalThis.URL.revokeObjectURL = () => {};
} else {
  vi.spyOn(globalThis.URL, "createObjectURL").mockReturnValue("blob:mock-url");
  vi.spyOn(globalThis.URL, "revokeObjectURL").mockImplementation(() => {});
}

export interface MockMentorItem {
  id: number;
  first_name: string;
  last_name: string;
}

export interface MockMentorsQueryResult {
  data?: {
    items: MockMentorItem[];
    total: number;
  };
  isLoading: boolean;
  isError: boolean;
  refetch: ReturnType<typeof vi.fn>;
}

export const mockCreateMutateAsync = vi.fn();
export const mockUpdateMutateAsync = vi.fn();
export const mockUploadImageMutateAsync = vi.fn();
export const mockRefetchMentors = vi.fn();
export const mockRefetchSchedule = vi.fn();

function defaultMentorsState(): MockMentorsQueryResult {
  return {
    data: { items: [{ id: 10, first_name: "Alisher", last_name: "Navoi" }], total: 1 },
    isLoading: false,
    isError: false,
    refetch: mockRefetchMentors,
  };
}

function defaultScheduleState() {
  return {
    data: [{ id: 1, course_id: 101, day_of_week: 0, time_start: "09:00:00", time_end: "11:00:00" }],
    isLoading: false,
    isError: false,
    refetch: mockRefetchSchedule,
  };
}

export const formState: {
  mentors: MockMentorsQueryResult;
  schedule: ReturnType<typeof defaultScheduleState>;
  createIsPending: boolean;
  updateIsPending: boolean;
  uploadIsPending: boolean;
  mentorHistory: { data?: CourseMentorHistoryResponse[]; isLoading?: boolean; isError?: boolean };
} = {
  mentors: defaultMentorsState(),
  schedule: defaultScheduleState(),
  createIsPending: false,
  updateIsPending: false,
  uploadIsPending: false,
  mentorHistory: { data: [] },
};

export const mockUseCourseSchedule = vi.fn((_id?: number) => formState.schedule);
export const mockUseCourseMentorHistory = vi.fn((_id?: number, _enabled?: boolean) => formState.mentorHistory);
export const mockUseMentors = vi.fn((_params?: unknown, _enabled?: boolean): MockMentorsQueryResult => formState.mentors);

export function buildCoursesHooksMock() {
  return {
    useCreateCourse: () => ({ mutateAsync: mockCreateMutateAsync, isPending: formState.createIsPending }),
    useUpdateCourse: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: formState.updateIsPending }),
    useUploadCourseImage: () => ({ mutateAsync: mockUploadImageMutateAsync, isPending: formState.uploadIsPending }),
    useCourseSchedule: (id?: number) => mockUseCourseSchedule(id),
    useCourseMentorHistory: (id?: number, enabled?: boolean) => mockUseCourseMentorHistory(id, enabled),
  };
}

export function buildUsersHooksMock() {
  return {
    useMentors: (params: unknown, enabled?: boolean) => mockUseMentors(params, enabled),
  };
}

export function resetCourseFormMocks(): void {
  vi.clearAllMocks();
  formState.createIsPending = false;
  formState.updateIsPending = false;
  formState.uploadIsPending = false;
  formState.mentorHistory = { data: [] };
  formState.mentors = defaultMentorsState();
  formState.schedule = defaultScheduleState();
  mockUseMentors.mockImplementation(() => formState.mentors);
}

export function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

export async function chooseMentor(user: ReturnType<typeof userEvent.setup>, mentorName: string): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Mentor" }));
  await user.click(await screen.findByRole("option", { name: mentorName }));
}

export function typeDate(label: RegExp, typedValue: string): void {
  const input: HTMLElement = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value: typedValue } });
  fireEvent.blur(input);
}

export const sampleCourse: CourseResponse = {
  id: 101,
  title: "Python Pro",
  description: "Advanced Python Course",
  photo_path: null,
  start_date: "2026-10-01",
  end_date: "2026-12-31",
  exam_type: "weekly",
  price: "1500.00",
  mentor_id: 10,
  status: "active",
  is_deleted: false,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
};

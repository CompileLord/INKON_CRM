import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import type { AxiosProgressEvent } from "axios";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createUser,
  deleteUser,
  generateTelegramLinkCode,
  getCurrentUser,
  getMentorAnalytics,
  getMentorProfile,
  getMentors,
  getMyMentorProfile,
  getMyStudentJournalPage,
  getMyStudentProfile,
  getStudentProfile,
  getStudents,
  listPasswordSmsDeliveries,
  resendPasswordSms,
  updateOwnProfile,
  updateUser,
  uploadAvatar,
} from "./endpoints";
import { AuthApiError } from "../auth/errors";
import type { CredentialsChannel, ListStudentsParams, ListUsersParams, StudentJournalHistoryPage, UserCreate, UserSelfUpdate, UserUpdate } from "./types";

/**
 * There's no GET /users/{id} — no single-user fetch hook exists. Edit/avatar
 * actions work off the row object already in hand from a list query.
 */
type ListableRole = "student" | "mentor";

function resourceFor(role: ListableRole) {
  return role === "student" ? "students" : "mentors";
}

function listQueryKey(role: ListableRole, params: ListUsersParams | ListStudentsParams) {
  return ["users", resourceFor(role), params] as const;
}

export function useStudents(params: ListStudentsParams = {}, enabled = true) {
  return useQuery({
    queryKey: listQueryKey("student", params),
    queryFn: () => getStudents(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useMentors(params: ListUsersParams = {}, enabled = true) {
  return useQuery({
    queryKey: listQueryKey("mentor", params),
    queryFn: () => getMentors(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCreateUser(role: ListableRole) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Omit<UserCreate, "role">) => createUser({ ...payload, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", resourceFor(role)] });
    },
  });
}

export function useUpdateUser(role: ListableRole) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UserUpdate }) => updateUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", resourceFor(role)] });
    },
  });
}

export function useUpdateOwnProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UserSelfUpdate) => updateOwnProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["users", "me"],
    queryFn: getCurrentUser,
  });
}

export function useDeleteUser(role: ListableRole) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", resourceFor(role)] });
    },
  });
}

interface UploadAvatarInput {
  id: number;
  file: File | Blob;
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
  signal?: AbortSignal;
}

export function useUploadAvatar(role: ListableRole) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file, onUploadProgress, signal }: UploadAvatarInput) =>
      uploadAvatar(id, file, { onUploadProgress, signal }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users", resourceFor(role)] });
      queryClient.invalidateQueries({ queryKey: ["users", resourceFor(role), "profile", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["users", "me"] });
    },
  });
}

export function useGenerateTelegramLinkCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (studentId: number) => generateTelegramLinkCode(studentId),
    onSuccess: (_data, studentId) => {
      queryClient.invalidateQueries({ queryKey: ["users", "students"] });
      queryClient.invalidateQueries({ queryKey: ["users", "students", "profile", studentId] });
    },
  });
}

const DEFAULT_QUERY_MAX_RETRIES = 3;

type QueryRetryDefault = boolean | number | ((failureCount: number, error: Error) => boolean) | undefined;

export function shouldRetryProfileRequest(clientRetryDefault: QueryRetryDefault, failureCount: number, error: Error): boolean {
  if (error instanceof AuthApiError && error.status >= 400 && error.status <= 499) return false;
  if (clientRetryDefault === undefined) return failureCount < DEFAULT_QUERY_MAX_RETRIES;
  if (typeof clientRetryDefault === "boolean") return clientRetryDefault;
  if (typeof clientRetryDefault === "number") return failureCount < clientRetryDefault;
  return clientRetryDefault(failureCount, error);
}

function useProfileRetryPolicy(): (failureCount: number, error: Error) => boolean {
  const clientRetryDefault: QueryRetryDefault = useQueryClient().getDefaultOptions().queries?.retry;
  return (failureCount, error) => shouldRetryProfileRequest(clientRetryDefault, failureCount, error);
}

export function useStudentProfile(id: number | undefined) {
  const retry = useProfileRetryPolicy();
  return useQuery({
    queryKey: ["users", "students", "profile", id],
    queryFn: () => getStudentProfile(id!),
    enabled: id !== undefined,
    retry,
  });
}

/** The logged-in student's own profile, identified from their bearer token — no id needed. */
export function useMyStudentProfile() {
  return useQuery({
    queryKey: ["users", "students", "profile", "me"],
    queryFn: () => getMyStudentProfile(),
  });
}

export function useMyStudentJournalHistory(courseId?: number, enabled: boolean = true): UseInfiniteQueryResult<InfiniteData<StudentJournalHistoryPage>, Error> {
  const retry: ReturnType<typeof useProfileRetryPolicy> = useProfileRetryPolicy();
  return useInfiniteQuery({
    queryKey: ["users", "students", "journal-history", "me", courseId, true, 20],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => getMyStudentJournalPage({ course_id: courseId, started_only: true, page_size: 20, cursor: pageParam }),
    getNextPageParam: (page: StudentJournalHistoryPage): string | undefined => page.next_cursor ?? undefined,
    enabled,
    retry,
  });
}

export function useMentorProfile(id: number | undefined) {
  const retry = useProfileRetryPolicy();
  return useQuery({
    queryKey: ["users", "mentors", "profile", id],
    queryFn: () => getMentorProfile(id!),
    enabled: id !== undefined,
    retry,
  });
}

export function useMentorAnalytics(id: number | undefined) {
  const retry = useProfileRetryPolicy();
  return useQuery({
    queryKey: ["users", "mentors", "analytics", id],
    queryFn: () => getMentorAnalytics(id!),
    enabled: id !== undefined,
    retry,
  });
}

export function useMyMentorProfile() {
  return useQuery({
    queryKey: ["users", "mentors", "profile", "me"],
    queryFn: () => getMyMentorProfile(),
  });
}

export function passwordSmsDeliveriesQueryKey(userId: number) {
  return ["users", "password-sms-deliveries", userId] as const;
}

export function usePasswordSmsDeliveries(userId: number, enabled: boolean = true) {
  return useQuery({
    queryKey: passwordSmsDeliveriesQueryKey(userId),
    queryFn: () => listPasswordSmsDeliveries(userId),
    enabled,
  });
}

export function useResendPasswordSms(userId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (channel?: CredentialsChannel) => resendPasswordSms(userId, channel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: passwordSmsDeliveriesQueryKey(userId) });
    },
  });
}

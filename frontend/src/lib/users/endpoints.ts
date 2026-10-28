import type { AxiosProgressEvent } from "axios";
import { httpClient } from "../auth/httpClient";
import type {
  ListStudentsParams,
  ListUsersParams,
  StudentListItemResponse,
  MentorAnalyticsResponse,
  MentorProfileResponse,
  MentorProfileResult,
  PaginatedUsers,
  PasswordSmsDelivery,
  PasswordResendRequest,
  CredentialsChannel,
  PasswordSmsResendResponse,
  StudentJournalHistoryPage,
  StudentJournalHistoryParams,
  StudentProfileResponse,
  TelegramLinkCode,
  User,
  UserCreate,
  UserCreateResponse,
  UserSelfUpdate,
  UserUpdate,
} from "./types";

const PASSWORD_SMS_DELIVERY_STATUSES: string[] = ["pending", "claimed", "delivered", "failed", "expired"];

export function createUser(payload: UserCreate): Promise<UserCreateResponse> {
  return httpClient.post<UserCreateResponse>("/users/", payload).then((res) => res.data);
}

export function updateUser(id: number, payload: UserUpdate): Promise<User> {
  return httpClient.patch<User>(`/users/${id}`, payload).then((res) => res.data);
}

export function updateOwnProfile(payload: UserSelfUpdate): Promise<User> {
  return httpClient.patch<User>("/users/me", payload).then((res) => res.data);
}

export function getCurrentUser(): Promise<User> {
  return httpClient.get<User>("/users/me").then((res) => res.data);
}

export function deleteUser(id: number): Promise<void> {
  return httpClient.delete<void>(`/users/${id}`).then(() => undefined);
}

interface UploadAvatarOptions {
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
  signal?: AbortSignal;
}

export function uploadAvatar(
  id: number,
  file: File | Blob,
  options: UploadAvatarOptions = {},
): Promise<User> {
  const formData = new FormData();
  formData.append("file", file);

  return httpClient
    .post<User>(`/users/${id}/avatar/`, formData, {
      // Our shared client defaults Content-Type to application/json; clearing
      // it here lets axios detect the FormData body and set the multipart
      // boundary itself, per the API's requirements.
      headers: { "Content-Type": undefined },
      onUploadProgress: options.onUploadProgress,
      signal: options.signal,
    })
    .then((res) => res.data);
}

/** GET /api/v1/students/ — role-scoped user listing (role=student). */
export function getStudents(params: ListStudentsParams = {}): Promise<PaginatedUsers<StudentListItemResponse>> {
  return httpClient.get<PaginatedUsers<StudentListItemResponse>>("/students/", { params }).then((res) => res.data);
}

/** GET /api/v1/mentors/ — role-scoped user listing (role=mentor). */
export function getMentors(params: ListUsersParams = {}): Promise<PaginatedUsers> {
  return httpClient.get<PaginatedUsers>("/mentors/", { params }).then((res) => res.data);
}

/** No id needed — identifies the caller from their own bearer token. */
export function getMyStudentProfile(): Promise<StudentProfileResponse> {
  return httpClient.get<StudentProfileResponse>("/students/me/profile").then((res) => res.data);
}

export function getMyStudentJournalPage(params: StudentJournalHistoryParams = {}): Promise<StudentJournalHistoryPage> {
  return httpClient.get<StudentJournalHistoryPage>("/students/me/journals/page", { params }).then((response) => response.data);
}

export function getStudentProfile(id: number): Promise<StudentProfileResponse> {
  return httpClient
    .get<StudentProfileResponse>(`/students/${id}/profile`)
    .then((res) => res.data);
}

/** No id needed — identifies the caller from their own bearer token. */
export function getMyMentorProfile(): Promise<MentorProfileResponse> {
  return httpClient.get<MentorProfileResponse>("/mentors/me/profile").then((res) => res.data);
}

export function getMentorProfile(id: number): Promise<MentorProfileResult> {
  return httpClient.get<MentorProfileResult>(`/mentors/${id}/profile`).then((res) => res.data);
}

export function getMentorAnalytics(id: number): Promise<MentorAnalyticsResponse> {
  return httpClient.get<MentorAnalyticsResponse>(`/mentors/${id}/analytics`).then((res) => res.data);
}

export function generateTelegramLinkCode(studentId: number): Promise<TelegramLinkCode> {
  return httpClient
    .post<TelegramLinkCode>(`/students/${studentId}/telegram-link-code`)
    .then((res) => res.data);
}

export function resendPasswordSms(userId: number, channel?: CredentialsChannel): Promise<PasswordSmsResendResponse> {
  const body: PasswordResendRequest = channel ? { channel } : {};
  return httpClient
    .post<PasswordSmsResendResponse>(`/users/${userId}/resend-password-sms`, body)
    .then((res) => res.data);
}

export function listPasswordSmsDeliveries(userId: number): Promise<PasswordSmsDelivery[]> {
  return httpClient
    .get<PasswordSmsDelivery[]>("/users/password-sms-deliveries", {
      params: { user_id: userId, status: PASSWORD_SMS_DELIVERY_STATUSES },
      paramsSerializer: { indexes: null },
    })
    .then((res) => res.data);
}

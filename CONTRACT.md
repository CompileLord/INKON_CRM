# IMKON CRM Complete API Contracts

This document is auto-generated from the OpenAPI schema and contains all endpoints and their contracts.

Regenerate with `python -m scripts.generate_contract` from the `backend/` directory.

**Base URL:** `/api/v1`
**Authentication:** `Authorization: Bearer <access_token>`

## POST /api/v1/auth/login

**Summary:** Login

**Request Body (JSON):**
```json
{
  "login?": string,
  "email?": string,
  "password": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "access_token": string,
    "refresh_token?": string,
    "token_type?": string,
    "must_set_password?": boolean,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/auth/refresh

**Summary:** Refresh

**Request Body (JSON):**
```json
{
  "refresh_token": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "access_token": string,
    "refresh_token?": string,
    "token_type?": string,
    "must_set_password?": boolean,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/auth/logout

**Summary:** Logout

**Request Body (JSON):**
```json
{
  "refresh_token": string,
}
```

**Responses:**
- **204**: Successful Response
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/auth/verify-code

**Summary:** Verify Code

**Request Body (JSON):**
```json
{
  "email": string,
  "code": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "access_token": string,
    "refresh_token?": string,
    "token_type?": string,
    "must_set_password?": boolean,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/auth/resend-code

**Summary:** Resend Code

**Request Body (JSON):**
```json
{
  "email": string,
}
```

**Responses:**
- **204**: Successful Response
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/auth/set-password

**Summary:** Set Password

**Request Body (JSON):**
```json
{
  "new_password": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "access_token": string,
    "refresh_token?": string,
    "token_type?": string,
    "must_set_password?": boolean,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/auth/change-password

**Summary:** Change Password

**Request Body (JSON):**
```json
{
  "current_password": string,
  "new_password": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "access_token": string,
    "refresh_token?": string,
    "token_type?": string,
    "must_set_password?": boolean,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/auth/password-reset/request

**Summary:** Password Reset Request

Accepts login (email or E.164 phone) or the legacy email field, plus an optional SMS channel. Accounts with an email receive a reset code by email; accounts without one, or requests naming a channel, receive a pending SMS password with a short expiration (ten minutes by default). The current password and sessions remain valid until the SMS password is used at login. The response is identical whether or not the account or channel exists.

**Request Body (JSON):**
```json
{
  "login?": string,
  "email?": string,
  "language?": "en" | "ru" | "tg",
  "channel?": "student_phone" | "parent_phone",
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "message": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/auth/password-reset/verify

**Summary:** Password Reset Verify

**Request Body (JSON):**
```json
{
  "email": string,
  "code": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  object
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/auth/password-reset/confirm

**Summary:** Password Reset Confirm

**Request Body (JSON):**
```json
{
  "reset_token": string,
  "new_password": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "access_token": string,
    "refresh_token?": string,
    "token_type?": string,
    "must_set_password?": boolean,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/users/

**Summary:** Create User

**Phone inputs:** Optional nullable `phone` and `parent_phone` must match `^\+[1-9][0-9]{1,14}$`: mandatory leading plus, nonzero first digit, 2–15 ASCII digits. Missing plus, whitespace, punctuation, empty strings and Unicode digits return 422; new inputs are not silently normalized. Students must supply at least one of `phone` or `parent_phone`; omitting both or setting both to null returns 422. Legacy response phone strings remain readable without rewriting stored values. A student whose only supplied phones have fewer than 8 digits cannot receive the password SMS and returns 422 with a `phone` or `parent_phone` field error before anything is persisted; a deliverable parent phone is used when the student phone is too short.

**Request Body (JSON):**
```json
{
  "preferred_language?": "en" | "ru" | "tg",
  "email?": string,
  "first_name": string,
  "last_name": string,
  "role": "superadmin" | "mentor" | "student" | "accountant",
  "date_of_birth?": string,
  "phone?": string,
  "parent_phone?": string,
  "payment_day_of_month?": integer,
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "preferred_language?": "en" | "ru" | "tg",
    "id": integer,
    "email?": string,
    "first_name": string,
    "last_name": string,
    "role": "superadmin" | "mentor" | "student" | "accountant",
    "date_of_birth?": string,
    "phone?": string,
    "parent_telegram_chat_id?": integer,
    "parent_linked?": boolean,
    "parent_link_code_expires_at?": string,
    "parent_phone?": string,
    "photo_path?": string,
    "thumbnail_path?": string,
    "payment_day_of_month?": integer,
    "must_set_password": boolean,
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
    "parent_link_code?": string,
    "password_sms_destination?": "student_phone" | "parent_phone",
    "credentials_channel?": "email" | "student_phone" | "parent_phone",
    "credentials_masked_phone?": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/users/password-sms-deliveries

**Summary:** List Password Sms Deliveries

**Parameters:**
- `user_id` [query]
- `status` [query]
- `limit` [query]

**Responses:**
- **200**: Successful Response
  ```json
  [
    {
      "id": integer,
      "user_id?": integer,
      "status": "pending" | "claimed" | "delivered" | "failed" | "expired",
      "masked_phone?": string,
      "attempt_count": integer,
      "max_attempts": integer,
      "last_error?": string,
      "provider_message_id?": string,
      "provider_status?": "pending" | "queued" | "accepted" | "sent" | "delivered",
      "created_at": string,
      "delivered_at?": string,
    }
  ]
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/users/{id}/resend-password-sms

**Summary:** Resend Password Sms

**Parameters:**
- `id` [path] *(required)*

**Request Body (JSON):**
```json
{
  "channel?": "email" | "student_phone" | "parent_phone",
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "destination?": "student_phone" | "parent_phone",
    "channel": "email" | "student_phone" | "parent_phone",
    "masked_phone?": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/users/me

**Summary:** Get Own Profile

**Responses:**
- **200**: Successful Response
  ```json
  {
    "preferred_language?": "en" | "ru" | "tg",
    "id": integer,
    "email?": string,
    "first_name": string,
    "last_name": string,
    "role": "superadmin" | "mentor" | "student" | "accountant",
    "date_of_birth?": string,
    "phone?": string,
    "parent_telegram_chat_id?": integer,
    "parent_linked?": boolean,
    "parent_link_code_expires_at?": string,
    "parent_phone?": string,
    "photo_path?": string,
    "thumbnail_path?": string,
    "payment_day_of_month?": integer,
    "must_set_password": boolean,
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```

---

## PATCH /api/v1/users/me

**Summary:** Update Own Profile

**Phone input:** Nullable `phone` uses strict `^\+[1-9][0-9]{1,14}$` validation (mandatory plus, 2–15 ASCII digits, nonzero first digit); noncanonical inputs return 422. Omitting `phone` preserves its stored value, including legacy representations; explicit null clears it only if a student retains another contact phone (otherwise 422). This self-update does not permit guardian destination fields.

**Request Body (JSON):**
```json
{
  "preferred_language?": "en" | "ru" | "tg",
  "first_name?": string,
  "last_name?": string,
  "date_of_birth?": string,
  "phone?": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "preferred_language?": "en" | "ru" | "tg",
    "id": integer,
    "email?": string,
    "first_name": string,
    "last_name": string,
    "role": "superadmin" | "mentor" | "student" | "accountant",
    "date_of_birth?": string,
    "phone?": string,
    "parent_telegram_chat_id?": integer,
    "parent_linked?": boolean,
    "parent_link_code_expires_at?": string,
    "parent_phone?": string,
    "photo_path?": string,
    "thumbnail_path?": string,
    "payment_day_of_month?": integer,
    "must_set_password": boolean,
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## PATCH /api/v1/users/{id}

**Summary:** Update User

**Phone inputs:** Nullable `phone` and `parent_phone` use strict `^\+[1-9][0-9]{1,14}$` validation; noncanonical inputs return 422. Omitted fields retain stored values; explicit null clears them only if a student retains at least one contact phone (otherwise 422). Replacing an otherwise-valid historical optional-plus parent number with the same canonical number preserves the linked Telegram guardian. Real parent-number changes or clearing revoke the prior binding unless an authorized explicit guardian destination is supplied. Historical comparison accepts only 2–15 ASCII digits with optional plus; malformed stored numbers are not normalized or equated with null. Output phone strings remain permissive for legacy reads. A student whose only supplied phones have fewer than 8 digits cannot receive the password SMS and returns 422 with a `phone` or `parent_phone` field error before anything is persisted; a deliverable parent phone is used when the student phone is too short.

**Parameters:**
- `id` [path] *(required)*

**Request Body (JSON):**
```json
{
  "preferred_language?": "en" | "ru" | "tg",
  "email?": string,
  "first_name?": string,
  "last_name?": string,
  "date_of_birth?": string,
  "phone?": string,
  "parent_phone?": string,
  "payment_day_of_month?": integer,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "preferred_language?": "en" | "ru" | "tg",
    "id": integer,
    "email?": string,
    "first_name": string,
    "last_name": string,
    "role": "superadmin" | "mentor" | "student" | "accountant",
    "date_of_birth?": string,
    "phone?": string,
    "parent_telegram_chat_id?": integer,
    "parent_linked?": boolean,
    "parent_link_code_expires_at?": string,
    "parent_phone?": string,
    "photo_path?": string,
    "thumbnail_path?": string,
    "payment_day_of_month?": integer,
    "must_set_password": boolean,
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## DELETE /api/v1/users/{id}

**Summary:** Delete User

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **204**: Successful Response
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/users/{id}/avatar/

**Summary:** Upload Avatar

**Parameters:**
- `id` [path] *(required)*

**Request Body (multipart/form-data):**
```json
{
  "file": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "preferred_language?": "en" | "ru" | "tg",
    "id": integer,
    "email?": string,
    "first_name": string,
    "last_name": string,
    "role": "superadmin" | "mentor" | "student" | "accountant",
    "date_of_birth?": string,
    "phone?": string,
    "parent_telegram_chat_id?": integer,
    "parent_linked?": boolean,
    "parent_link_code_expires_at?": string,
    "parent_phone?": string,
    "photo_path?": string,
    "thumbnail_path?": string,
    "payment_day_of_month?": integer,
    "must_set_password": boolean,
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/students/

**Summary:** Get Students

**Parameters:**
- `search` [query]
- `course_id` [query]
- `payment_status` [query]
- `page` [query]
- `page_size` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "preferred_language?": "en" | "ru" | "tg",
        "id": integer,
        "email?": string,
        "first_name": string,
        "last_name": string,
        "role": "superadmin" | "mentor" | "student" | "accountant",
        "date_of_birth?": string,
        "phone?": string,
        "parent_telegram_chat_id?": integer,
        "parent_linked?": boolean,
        "parent_link_code_expires_at?": string,
        "parent_phone?": string,
        "photo_path?": string,
        "thumbnail_path?": string,
        "payment_day_of_month?": integer,
        "must_set_password": boolean,
        "is_deleted": boolean,
        "created_at": string,
        "updated_at": string,
        "courses": array[],
        "debt_amount": string,
        "payment_status": "debt" | "ok" | "grant",
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/students/{id}/telegram-link-code

**Summary:** Generate Telegram Link Code

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **201**: Successful Response
  ```json
  {
    "code": string,
    "expires_at": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/students/me/profile

**Summary:** Get My Profile

**Responses:**
- **200**: Successful Response
  ```json
  {
    "user": {
      "preferred_language?": "en" | "ru" | "tg",
      "id": integer,
      "email?": string,
      "first_name": string,
      "last_name": string,
      "role": "superadmin" | "mentor" | "student" | "accountant",
      "date_of_birth?": string,
      "phone?": string,
      "parent_telegram_chat_id?": integer,
      "parent_linked?": boolean,
      "parent_link_code_expires_at?": string,
      "parent_phone?": string,
      "photo_path?": string,
      "thumbnail_path?": string,
      "payment_day_of_month?": integer,
      "must_set_password": boolean,
      "is_deleted": boolean,
      "created_at": string,
      "updated_at": string,
    },
    "totals": {
      "avg_percentage": number,
      "total_score?": integer,
      "total_max_score?": integer,
      "attendance_percentage": number,
      "absences": integer,
      "total_lessons": integer,
      "active_course_count": integer,
      "archived_course_count": integer,
    },
    "courses": [
      {
        "course": {
          "id": any,
          "title": any,
          "description": any,
          "photo_path?": any,
          "start_date": any,
          "end_date": any,
          "exam_type": any,
          "price": any,
          "mentor_id": any,
          "status": any,
          "is_deleted": any,
          "created_at": any,
          "updated_at": any,
        },
        "enrollment_status": string,
        "bucket": string,
        "my_avg_percentage": number,
        "my_total_score?": integer,
        "my_total_max_score?": integer,
        "class_avg_score?": number,
        "attendance_percentage": number,
        "absences": integer,
        "periods_total": integer,
        "periods_graded": integer,
        "my_rank": integer,
        "class_size": integer,
        "class_avg_percentage": number,
        "next_lesson_at?": string,
        "performance?": any,
      }
    ],
    "avg_score?": number,
    "absences?": integer,
    "total_lessons?": integer,
    "performance?": {
      "scope?": string,
      "measured_population?": string,
      "denominator_basis?": string,
      "grading_state": "missing" | "unknown",
      "grading_provenance?": string,
      "raw_avg_percentage?": number,
      "attendance_percentage?": number,
      "attendance_denominator?": integer,
      "attended_lessons?": integer,
      "absences?": integer,
      "total_lessons?": integer,
      "period_summaries_count?": integer,
      "periods_with_max_score_count?": integer,
      "total_score?": integer,
      "total_max_score?": integer,
    },
  }
  ```

---

## GET /api/v1/students/me/journals/page

**Summary:** Get My Journal Page

**History bounds:** `page_size` defaults to 20 and must be between 1 and 100. `course_id`, when provided, must name a nondeleted enrollment belonging to the authenticated student; otherwise the response is 403. Unknown query fields and malformed, modified, cross-student or cross-filter cursors return 422.
`next_cursor` is `string | null`; null means the bounded traversal has no remaining page. Cursors bind the student, course filter, started-only setting and date cutoff. Pages sort by `period_start DESC, journal_id DESC`. `started_only=true` freezes the school-date cutoff across pages. `has_upcoming_periods` reports whether an eligible period starts after the current school date, without returning future history; ownership and the course filter apply to this flag.
The legacy `/students/me/journals` array preserves complete responses for at most 100 periods and returns 409 on overflow; it never silently truncates. Clients must migrate navigation and chart windows before releasing histories exceeding that limit. Course-wide totals come from existing profile aggregates, not a partial history page.

**Parameters:**
- `page_size` [query]
- `course_id` [query]
- `started_only` [query]
- `cursor` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "journal_id": integer,
        "course_id": integer,
        "course_title": string,
        "period_label": string,
        "period_start": string,
        "period_end": string,
        "homework_score?": number,
        "attendance_score?": number,
        "exam_score?": number,
        "bonus_score?": number,
        "sum_score": number,
        "max_period_score": number,
        "percentage": number,
        "attendance_count": integer,
        "total_lessons": integer,
        "state": string,
      }
    ],
    "next_cursor": string,
    "has_upcoming_periods": boolean,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/students/me/journals

**Summary:** Get My Journals

**Parameters:**
- `course_id` [query]

**Responses:**
- **200**: Successful Response
  ```json
  [
    {
      "journal_id": integer,
      "course_id": integer,
      "course_title": string,
      "period_label": string,
      "period_start": string,
      "period_end": string,
      "homework_score?": number,
      "attendance_score?": number,
      "exam_score?": number,
      "bonus_score?": number,
      "sum_score": number,
      "max_period_score": number,
      "percentage": number,
      "attendance_count": integer,
      "total_lessons": integer,
      "state": string,
    }
  ]
  ```
- **409**: History exceeds 100 periods; use the cursor-paged history endpoint
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/students/{id}/profile

**Summary:** Get Student Profile

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "user": {
      "preferred_language?": "en" | "ru" | "tg",
      "id": integer,
      "email?": string,
      "first_name": string,
      "last_name": string,
      "role": "superadmin" | "mentor" | "student" | "accountant",
      "date_of_birth?": string,
      "phone?": string,
      "parent_telegram_chat_id?": integer,
      "parent_linked?": boolean,
      "parent_link_code_expires_at?": string,
      "parent_phone?": string,
      "photo_path?": string,
      "thumbnail_path?": string,
      "payment_day_of_month?": integer,
      "must_set_password": boolean,
      "is_deleted": boolean,
      "created_at": string,
      "updated_at": string,
    },
    "totals": {
      "avg_percentage": number,
      "total_score?": integer,
      "total_max_score?": integer,
      "attendance_percentage": number,
      "absences": integer,
      "total_lessons": integer,
      "active_course_count": integer,
      "archived_course_count": integer,
    },
    "courses": [
      {
        "course": {
          "id": any,
          "title": any,
          "description": any,
          "photo_path?": any,
          "start_date": any,
          "end_date": any,
          "exam_type": any,
          "price": any,
          "mentor_id": any,
          "status": any,
          "is_deleted": any,
          "created_at": any,
          "updated_at": any,
        },
        "enrollment_status": string,
        "bucket": string,
        "my_avg_percentage": number,
        "my_total_score?": integer,
        "my_total_max_score?": integer,
        "class_avg_score?": number,
        "attendance_percentage": number,
        "absences": integer,
        "periods_total": integer,
        "periods_graded": integer,
        "my_rank": integer,
        "class_size": integer,
        "class_avg_percentage": number,
        "next_lesson_at?": string,
        "performance?": any,
      }
    ],
    "avg_score?": number,
    "absences?": integer,
    "total_lessons?": integer,
    "performance?": {
      "scope?": string,
      "measured_population?": string,
      "denominator_basis?": string,
      "grading_state": "missing" | "unknown",
      "grading_provenance?": string,
      "raw_avg_percentage?": number,
      "attendance_percentage?": number,
      "attendance_denominator?": integer,
      "attended_lessons?": integer,
      "absences?": integer,
      "total_lessons?": integer,
      "period_summaries_count?": integer,
      "periods_with_max_score_count?": integer,
      "total_score?": integer,
      "total_max_score?": integer,
    },
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/mentors/

**Summary:** Get Mentors

**Parameters:**
- `search` [query]
- `page` [query]
- `page_size` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "preferred_language?": "en" | "ru" | "tg",
        "id": integer,
        "email?": string,
        "first_name": string,
        "last_name": string,
        "role": "superadmin" | "mentor" | "student" | "accountant",
        "date_of_birth?": string,
        "phone?": string,
        "parent_telegram_chat_id?": integer,
        "parent_linked?": boolean,
        "parent_link_code_expires_at?": string,
        "parent_phone?": string,
        "photo_path?": string,
        "thumbnail_path?": string,
        "payment_day_of_month?": integer,
        "must_set_password": boolean,
        "is_deleted": boolean,
        "created_at": string,
        "updated_at": string,
        "active_courses?": array[],
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/mentors/me/profile

**Summary:** Get My Profile

**Responses:**
- **200**: Successful Response
  ```json
  {
    "user": {
      "preferred_language?": "en" | "ru" | "tg",
      "id": integer,
      "email?": string,
      "first_name": string,
      "last_name": string,
      "role": "superadmin" | "mentor" | "student" | "accountant",
      "date_of_birth?": string,
      "phone?": string,
      "parent_telegram_chat_id?": integer,
      "parent_linked?": boolean,
      "parent_link_code_expires_at?": string,
      "parent_phone?": string,
      "photo_path?": string,
      "thumbnail_path?": string,
      "payment_day_of_month?": integer,
      "must_set_password": boolean,
      "is_deleted": boolean,
      "created_at": string,
      "updated_at": string,
    },
    "active_courses": [
      {
        "id": integer,
        "title": string,
        "description": string,
        "photo_path?": string,
        "start_date": string,
        "end_date": string,
        "exam_type": "weekly" | "monthly",
        "price": string,
        "mentor_id": integer,
        "status": "active" | "archived",
        "is_deleted": boolean,
        "created_at": string,
        "updated_at": string,
      }
    ],
    "active_students_count": integer,
    "avg_score": number,
    "active_students_population": string,
    "avg_score_grading_state": "missing" | "unknown",
    "avg_score_provenance": string,
    "avg_score_basis": string,
    "avg_score_summary_count": integer,
    "avg_score_defined_ratio_count": integer,
    "avg_score_undefined_ratio_count": integer,
    "avg_score_defined_ratios_mean": number,
  }
  ```

---

## GET /api/v1/mentors/me/grading-queue

**Summary:** Get My Grading Queue

**Responses:**
- **200**: Successful Response
  ```json
  [
    {
      "journal_id": integer,
      "course_id": integer,
      "course_title": string,
      "period_label": string,
      "period_start": string,
      "period_end": string,
      "state": string,
      "cells_filled": integer,
      "cells_expected": integer,
      "is_current": boolean,
    }
  ]
  ```

---

## GET /api/v1/mentors/{id}/profile

**Summary:** Get Mentor Profile

Students receive only public mentor identity and course identity for their nondeleted enrollments on nondeleted courses belonging to this nondeleted mentor. Historical enrollment statuses remain eligible. The `active_courses` name is retained for caller compatibility; it does not impose an active enrollment or course status filter. No contact, DOB, parent, account metadata, full course details or mentor-wide statistics are returned. The response union is `MentorProfileResponse | StudentMentorCardResponse`; the staff response above is unchanged. Students without an eligible relationship, unrelated mentors and accountants receive 403.

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response (mentor owner or superadmin)
  ```json
  {
    "user": {
      "preferred_language?": "en" | "ru" | "tg",
      "id": integer,
      "email?": string,
      "first_name": string,
      "last_name": string,
      "role": "superadmin" | "mentor" | "student" | "accountant",
      "date_of_birth?": string,
      "phone?": string,
      "parent_telegram_chat_id?": integer,
      "parent_linked?": boolean,
      "parent_link_code_expires_at?": string,
      "parent_phone?": string,
      "photo_path?": string,
      "thumbnail_path?": string,
      "payment_day_of_month?": integer,
      "must_set_password": boolean,
      "is_deleted": boolean,
      "created_at": string,
      "updated_at": string,
    },
    "active_courses": [
      {
        "id": integer,
        "title": string,
        "description": string,
        "photo_path?": string,
        "start_date": string,
        "end_date": string,
        "exam_type": "weekly" | "monthly",
        "price": string,
        "mentor_id": integer,
        "status": "active" | "archived",
        "is_deleted": boolean,
        "created_at": string,
        "updated_at": string,
      }
    ],
    "active_students_count": integer,
    "avg_score": number,
    "active_students_population": string,
    "avg_score_grading_state": "missing" | "unknown",
    "avg_score_provenance": string,
    "avg_score_basis": string,
    "avg_score_summary_count": integer,
    "avg_score_defined_ratio_count": integer,
    "avg_score_undefined_ratio_count": integer,
    "avg_score_defined_ratios_mean": number,
  }
  ```
- **200**: Alternative response (StudentMentorCardResponse)
  ```json
  {
    "user": {
      "id": integer,
      "first_name": string,
      "last_name": string,
      "photo_path?": string,
      "thumbnail_path?": string,
    },
    "active_courses": [
      {
        "id": integer,
        "title": string,
        "photo_path?": string,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/mentors/{id}/analytics

**Summary:** Get Mentor Analytics

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "active_courses_count": integer,
    "active_courses_population": string,
    "total_students_count": integer,
    "total_students_population": string,
    "average_student_score": number,
    "average_student_score_grading_state": "missing" | "unknown",
    "average_student_score_provenance": string,
    "average_student_score_basis": string,
    "average_student_score_summary_count": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/courses/

**Summary:** List Courses

**Parameters:**
- `search` [query] Case-insensitive title search before pagination
- `sort` [query] created_at_desc (default), created_at_asc, title_asc, title_desc, price_asc, price_desc, start_date_asc or start_date_desc; ties use id ascending
- `status` [query]
- `page` [query]
- `page_size` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "id": integer,
        "title": string,
        "description": string,
        "photo_path?": string,
        "start_date": string,
        "end_date": string,
        "exam_type": "weekly" | "monthly",
        "price": string,
        "mentor_id": integer,
        "status": "active" | "archived",
        "is_deleted": boolean,
        "created_at": string,
        "updated_at": string,
        "schedules": array[],
        "active_student_count": integer,
        "current_period_label": string,
        "last_graded_lesson_date": string,
        "ungraded_lessons_count": integer,
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/courses/

**Summary:** Create Course

**Request Body (JSON):**
```json
{
  "title": string,
  "description": string,
  "start_date": string,
  "end_date": string,
  "exam_type": "weekly" | "monthly",
  "price": number,
  "mentor_id": integer,
  "schedules": [
    {
      "day_of_week": integer,
      "time_start": string,
      "time_end": string,
    }
  ],
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "id": integer,
    "title": string,
    "description": string,
    "photo_path?": string,
    "start_date": string,
    "end_date": string,
    "exam_type": "weekly" | "monthly",
    "price": string,
    "mentor_id": integer,
    "status": "active" | "archived",
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/courses/{id}

**Summary:** Get Course

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "title": string,
    "description": string,
    "photo_path?": string,
    "start_date": string,
    "end_date": string,
    "exam_type": "weekly" | "monthly",
    "price": string,
    "mentor_id": integer,
    "status": "active" | "archived",
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## PATCH /api/v1/courses/{id}

**Summary:** Update Course

**Parameters:**
- `id` [path] *(required)*

**Request Body (JSON):**
```json
{
  "title?": string,
  "description?": string,
  "start_date?": string,
  "end_date?": string,
  "mentor_id?": integer,
  "status?": "active" | "archived",
  "schedules?": [
    {
      "day_of_week": integer,
      "time_start": string,
      "time_end": string,
    }
  ],
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "title": string,
    "description": string,
    "photo_path?": string,
    "start_date": string,
    "end_date": string,
    "exam_type": "weekly" | "monthly",
    "price": string,
    "mentor_id": integer,
    "status": "active" | "archived",
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## DELETE /api/v1/courses/{id}

**Summary:** Delete Course

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **204**: Successful Response
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/courses/{id}/image/

**Summary:** Upload Course Image

**Parameters:**
- `id` [path] *(required)*

**Request Body (multipart/form-data):**
```json
{
  "file": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "title": string,
    "description": string,
    "photo_path?": string,
    "start_date": string,
    "end_date": string,
    "exam_type": "weekly" | "monthly",
    "price": string,
    "mentor_id": integer,
    "status": "active" | "archived",
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/courses/{id}/schedule

**Summary:** Get Course Schedule

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  [
    {
      "id": integer,
      "course_id": integer,
      "day_of_week": integer,
      "time_start": string,
      "time_end": string,
    }
  ]
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/courses/{id}/copy/

**Summary:** Copy Course

**Parameters:**
- `id` [path] *(required)*

**Request Body (JSON):**
```json
{
  "title": string,
  "description": string,
  "start_date": string,
  "end_date": string,
  "exam_type": "weekly" | "monthly",
  "price": number,
  "mentor_id": integer,
  "schedules": [
    {
      "day_of_week": integer,
      "time_start": string,
      "time_end": string,
    }
  ],
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "id": integer,
    "title": string,
    "description": string,
    "photo_path?": string,
    "start_date": string,
    "end_date": string,
    "exam_type": "weekly" | "monthly",
    "price": string,
    "mentor_id": integer,
    "status": "active" | "archived",
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/courses/{id}/mentor-history

**Summary:** Get Course Mentor History

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  [
    {
      "id": integer,
      "course_id": integer,
      "mentor_id": integer,
      "assigned_from": string,
      "assigned_to?": string,
      "mentor": {
        "id": integer,
        "first_name": string,
        "last_name": string,
        "email": string,
        "is_deleted": boolean,
      },
    }
  ]
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/courses/{id}/journals

**Summary:** List Course Journals

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  [
    {
      "id": integer,
      "course_id": integer,
      "period_label": string,
      "period_start": string,
      "period_end": string,
      "period_type": "week" | "month",
      "exam_max_score": integer,
      "bonus_max_score?": integer,
      "student_count?": integer,
      "lesson_count?": integer,
      "cells_expected?": integer,
      "cells_filled?": integer,
      "avg_percentage?": number,
      "avg_score?": number,
      "state?": string,
    }
  ]
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/courses/{id}/journal-metrics

**Summary:** Get Course Journal Metrics

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "class_avg_percentage": number,
    "class_avg_score?": number,
    "class_avg_max_score?": number,
    "attendance_rate": number,
    "periods_total": integer,
    "periods_complete": integer,
    "at_risk_count": integer,
    "at_risk_threshold?": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/courses/{id}/staff-progress

**Summary:** Get Staff Progress

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "course_id": integer,
    "periods": [
      {
        "id": integer,
        "period_label": string,
        "period_start": string,
        "period_end": string,
        "class_avg_score?": number,
        "class_avg_max_score?": number,
        "class_avg_percentage?": number,
        "graded_count?": integer,
        "has_graded_entries?": boolean,
      }
    ],
    "students": [
      {
        "student_id": integer,
        "first_name": string,
        "last_name": string,
        "period_results": array[],
        "grading_provenance?": string,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/courses/{id}/class-progress

**Summary:** Get Class Progress

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "course_id": integer,
    "periods": [
      {
        "id": integer,
        "period_label": string,
        "period_start": string,
        "period_end": string,
        "class_avg_score?": number,
        "class_avg_max_score?": number,
        "class_avg_percentage?": number,
        "graded_count?": integer,
        "has_graded_entries?": boolean,
      }
    ],
    "students": [
      {
        "student_id": integer,
        "first_name": string,
        "last_name": string,
        "period_results": array[],
        "grading_provenance?": string,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/courses/{id}/progress-chart

**Summary:** Get Progress Chart

Bounded chart: defaults to the newest 12 scheduled periods (maximum 52), returned chronologically, and the first 30 active staff-roster series (maximum 100), ordered by student_id. Student responses contain only their own series plus cohort aggregates; roster paging is ignored. All grading counts, averages and ranks use selected periods only. Eligible grades are explicitly graded, started, and have a positive maximum. Period class means include active students with eligible grades. The final series value is the selected-range average; the final class value weights eligible active-student range means equally. Ranks order unrounded range means descending, then student_id ascending. Withdrawn students retain their own history but do not contribute to cohort means or ranks.

**Parameters:**
- `id` [path] *(required)*
- `period_offset` [query] Periods to skip from newest, ordered by period_start then id descending. Default 0, maximum 2147483647.
- `period_limit` [query] Maximum periods returned chronologically. Default 12, maximum 52.
- `student_offset` [query] Active staff-roster series to skip in student_id ascending order. Ignored for students. Default 0, maximum 2147483647.
- `student_limit` [query] Maximum staff-roster series. Ignored for students. Default 30, maximum 100.

**Responses:**
- **200**: Successful Response
  ```json
  {
    "period_offset": integer,
    "period_limit": integer,
    "periods_total": integer,
    "aggregation_scope?": string,
    "student_offset": integer,
    "student_limit": integer,
    "students_total": integer,
    "labels": array[string],
    "periods": [
      {
        "id": integer,
        "period_label": string,
      }
    ],
    "datasets": [
      {
        "student_id": integer,
        "name": string,
        "color_hex": string,
        "scores": array[],
        "max_scores": array[],
        "percentages": array[],
        "grading_states": array["missing" | "ungraded" | "unknown" | "graded" | "upcoming"],
        "graded_periods_count": integer,
        "eligible_periods_count": integer,
      }
    ],
    "class_avg_series": array[number],
    "class_eligible_counts": array[integer],
  }
  ```
- **200**: Alternative response (StudentChartResponse)
  ```json
  {
    "period_offset": integer,
    "period_limit": integer,
    "periods_total": integer,
    "aggregation_scope?": string,
    "periods": [
      {
        "id": integer,
        "period_label": string,
      }
    ],
    "my_series": array[number],
    "class_avg_series": array[number],
    "my_grading_states": array["missing" | "ungraded" | "unknown" | "graded" | "upcoming"],
    "my_graded_periods_count": integer,
    "my_eligible_periods_count": integer,
    "class_eligible_counts": array[integer],
    "my_rank": integer,
    "class_size": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/enrollments/

**Summary:** List Enrollments

**Parameters:**
- `course_id` [query]
- `student_id` [query]
- `status` [query]
- `page` [query]
- `page_size` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "id": integer,
        "student_id": integer,
        "course_id": integer,
        "price_at_enrollment": string,
        "color_hex": string,
        "enrolled_at": string,
        "status": "active" | "withdrawn" | "completed",
        "is_deleted": boolean,
        "billing_mode": "paid" | "grant",
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/enrollments/

**Summary:** Enroll Student

**Request Body (JSON):**
```json
{
  "student_id": integer,
  "course_id": integer,
  "price_at_enrollment?": number,
  "billing_mode?": "paid" | "grant",
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "id": integer,
    "student_id": integer,
    "course_id": integer,
    "price_at_enrollment": string,
    "color_hex": string,
    "enrolled_at": string,
    "status": "active" | "withdrawn" | "completed",
    "is_deleted": boolean,
    "billing_mode": "paid" | "grant",
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/enrollments/preview

**Summary:** Preview Enrollment

**Request Body (JSON):**
```json
{
  "student_id": integer,
  "course_id": integer,
  "price_at_enrollment?": number,
  "billing_mode?": "paid" | "grant",
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "billing_mode": "paid" | "grant",
    "price_at_enrollment": string,
    "billed_months": integer,
    "total_amount": string,
    "first_charge?": {
      "period_start": string,
      "due_date": string,
      "amount": string,
    },
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## PATCH /api/v1/enrollments/{id}/billing-mode

**Summary:** Change Billing Mode

**Parameters:**
- `id` [path] *(required)*

**Request Body (JSON):**
```json
{
  "billing_mode": "paid" | "grant",
  "reason": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "enrollment": {
      "id": integer,
      "student_id": integer,
      "course_id": integer,
      "price_at_enrollment": string,
      "color_hex": string,
      "enrolled_at": string,
      "status": "active" | "withdrawn" | "completed",
      "is_deleted": boolean,
      "billing_mode": "paid" | "grant",
    },
    "cancelled_months": integer,
    "cancelled_amount": string,
    "written_off_amount": string,
    "generated_months": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/enrollments/{id}/withdraw-preview

**Summary:** Preview Withdrawal

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "still_owed": string,
    "cancelled_amount": string,
    "months_cancelled": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## PATCH /api/v1/enrollments/{id}/withdraw

**Summary:** Withdraw Student

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "student_id": integer,
    "course_id": integer,
    "price_at_enrollment": string,
    "color_hex": string,
    "enrolled_at": string,
    "status": "active" | "withdrawn" | "completed",
    "is_deleted": boolean,
    "billing_mode": "paid" | "grant",
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/enrollments/courses/{course_id}/roster

**Summary:** Get Course Roster

**Parameters:**
- `course_id` [path] *(required)*
- `page` [query]
- `page_size` [query]
- `search` [query]
- `status` [query]
- `sort` [query]
- `student_id` [query]
- `locate_student_id` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "id": integer,
        "enrollment_id": integer,
        "student_id": integer,
        "course_id": integer,
        "price_at_enrollment": string,
        "color_hex": string,
        "enrolled_at": string,
        "status": "active" | "withdrawn" | "completed",
        "billing_mode": "paid" | "grant",
        "student": {
          "id": any,
          "first_name": any,
          "last_name": any,
          "email?": any,
          "phone?": any,
          "photo_path?": any,
          "thumbnail_path?": any,
        },
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
    "active_count": integer,
    "located_page?": integer,
    "located_index?": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/enrollments/courses/{course_id}/roster/locate

**Summary:** Locate Course Roster Student

**Parameters:**
- `course_id` [path] *(required)*
- `student_id` [query] *(required)*
- `page_size` [query]
- `search` [query]
- `status` [query]
- `sort` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "student_id": integer,
    "enrollment_id": integer,
    "page": integer,
    "index": integer,
    "total": integer,
    "item": {
      "id": integer,
      "enrollment_id": integer,
      "student_id": integer,
      "course_id": integer,
      "price_at_enrollment": string,
      "color_hex": string,
      "enrolled_at": string,
      "status": "active" | "withdrawn" | "completed",
      "billing_mode": "paid" | "grant",
      "student": {
        "id": integer,
        "first_name": string,
        "last_name": string,
        "email?": any,
        "phone?": any,
        "photo_path?": any,
        "thumbnail_path?": any,
      },
    },
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/enrollments/courses/{course_id}/eligible-candidates

**Summary:** Get Course Eligible Candidates

**Parameters:**
- `course_id` [path] *(required)*
- `page` [query]
- `page_size` [query]
- `search` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "id": integer,
        "first_name": string,
        "last_name": string,
        "email?": string,
        "phone?": string,
        "photo_path?": string,
        "thumbnail_path?": string,
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/journals/{id}

**Summary:** Get Journal

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  object
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/journals/{id}/class

**Summary:** Get Class Journal

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "journal_id": integer,
    "course_id": integer,
    "period_label": string,
    "period_start": string,
    "period_end": string,
    "period_type": "week" | "month",
    "exam_max_score": integer,
    "bonus_max_score?": integer,
    "lesson_dates": array[string],
    "students": [
      {
        "student_id": integer,
        "first_name": string,
        "last_name": string,
        "color_hex": string,
        "is_self": boolean,
        "entries": array[],
        "summary?": any,
      }
    ],
    "my_rank": integer,
    "class_size": integer,
    "class_avg_percentage": number,
    "class_avg_score?": number,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## PUT /api/v1/journals/{id}/entries

**Summary:** Batch Update Entries

**Autosave bounds:** The request remains a top-level JSON array with 0–250 entries. Empty arrays are accepted as no-ops.
Every normalized `(student_id, lesson_date)` pair must be unique; identical and conflicting duplicate keys both return 422 before service work.
Each optional nullable comment is limited to 1000 Unicode code points; longer comments return 422 without truncation.
Actual HTTP request bodies exceeding 4,194,304 bytes return 413 before JSON decoding, including chunked requests or misleading Content-Length headers.
Only this PUT route is capped; document and image upload limits are unchanged.
Accepted batches retain existing partial-conflict, optimistic-version and idempotent retry behavior.

**Parameters:**
- `id` [path] *(required)*

**Request Body (JSON):**
```json
[
  {
    "student_id": integer,
    "lesson_date": string,
    "attendance": boolean,
    "score": integer,
    "comment?": string,
    "version": integer,
  }
]
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "applied": [
      {
        "student_id": integer,
        "lesson_date": string,
        "attendance": boolean,
        "score": integer,
        "comment?": string,
        "is_graded?": boolean,
        "version": integer,
      }
    ],
    "conflicts": [
      {
        "student_id": integer,
        "lesson_date": string,
        "submitted_version": integer,
        "current?": any,
      }
    ],
    "summaries": [
      {
        "id": integer,
        "journal_id": integer,
        "student_id": integer,
        "homework_score": integer,
        "attendance_score": integer,
        "exam_score": integer,
        "bonus_score": integer,
        "sum_score": integer,
        "max_period_score": integer,
        "percentage": number,
        "attendance_count": integer,
        "total_lessons": integer,
        "version": integer,
      }
    ],
  }
  ```
- **413**: Autosave request body exceeds 4194304 bytes
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## PATCH /api/v1/journals/{journal_id}/students/{student_id}/summary

**Summary:** Update Exam Or Bonus

**Parameters:**
- `journal_id` [path] *(required)*
- `student_id` [path] *(required)*

**Request Body (JSON):**
```json
{
  "exam_score": integer,
  "bonus_score": integer,
  "version": integer,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "journal_id": integer,
    "student_id": integer,
    "homework_score": integer,
    "attendance_score": integer,
    "exam_score": integer,
    "bonus_score": integer,
    "sum_score": integer,
    "max_period_score": integer,
    "percentage": number,
    "attendance_count": integer,
    "total_lessons": integer,
    "version": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## PATCH /api/v1/journals/{id}/exam-max-score

**Summary:** Update Exam Max Score

**Parameters:**
- `id` [path] *(required)*

**Request Body (JSON):**
```json
{
  "exam_max_score?": integer,
  "bonus_max_score?": integer,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "journal": {
      "id": integer,
      "course_id": integer,
      "period_label": string,
      "period_start": string,
      "period_end": string,
      "period_type": "week" | "month",
      "exam_max_score": integer,
      "bonus_max_score?": integer,
      "student_count?": integer,
      "lesson_count?": integer,
      "cells_expected?": integer,
      "cells_filled?": integer,
      "avg_percentage?": number,
      "avg_score?": number,
      "state?": string,
    },
    "summaries": [
      {
        "id": integer,
        "journal_id": integer,
        "student_id": integer,
        "homework_score": integer,
        "attendance_score": integer,
        "exam_score": integer,
        "bonus_score": integer,
        "sum_score": integer,
        "max_period_score": integer,
        "percentage": number,
        "attendance_count": integer,
        "total_lessons": integer,
        "version": integer,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/finance/payments/

**Summary:** List Payments

**Parameters:**
- `student_id` [query]
- `course_id` [query] Payments that settled charges on this course
- `method` [query]
- `recorded_by` [query]
- `date_from` [query]
- `date_to` [query]
- `page` [query]
- `page_size` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "id": integer,
        "student_id": integer,
        "student_first_name?": string,
        "student_last_name?": string,
        "amount": string,
        "paid_at": string,
        "method?": any,
        "recorded_by_id": integer,
        "comment?": string,
        "created_at": string,
        "allocated_amount?": string,
        "unallocated_amount?": string,
        "is_voided?": boolean,
        "refunded_amount?": string,
        "allocations?": array[],
        "targets?": array[],
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/finance/payments/

**Summary:** Create Payment

Record cash received. Discounts are separate — see POST /finance/discounts/.

Supply targets or a legacy course_id. Invalid targets return 422 with detail.code invalid_payment_target, duplicate_payment_target, payment_target_sum_mismatch, payment_target_required or payment_target_exceeds_balance. The last includes enrollment_id and maximum as a decimal string.

Send an Idempotency-Key header to make retries safe. A first request answers 201. A repeat by the same recorder with the same key and payload answers 200 with the original payment and records nothing new. The same key with a different payload answers 409 with detail.code idempotency_key_payload_mismatch. Requests without the header are never deduplicated.

**Parameters:**
- `Idempotency-Key` [header] 1-128 characters from A-Z a-z 0-9 _ -. A retry by the same recorder with the same key and payload returns the original payment with 200 instead of 201; the same key with a different payload returns 409.

**Request Body (JSON):**
```json
{
  "student_id": integer,
  "course_id?": integer,
  "targets?": [
    {
      "enrollment_id": integer,
      "amount": string,
    }
  ],
  "amount": number,
  "paid_at": string,
  "method": "cash" | "transfer",
  "comment?": string,
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "id": integer,
    "student_id": integer,
    "student_first_name?": string,
    "student_last_name?": string,
    "amount": string,
    "paid_at": string,
    "method?": "cash" | "transfer",
    "recorded_by_id": integer,
    "comment?": string,
    "created_at": string,
    "allocated_amount?": string,
    "unallocated_amount?": string,
    "is_voided?": boolean,
    "refunded_amount?": string,
    "allocations?": [
      {
        "charge_id": integer,
        "course_id": integer,
        "course_title": string,
        "due_date": string,
        "amount": string,
      }
    ],
    "targets?": [
      {
        "enrollment_id": integer,
        "course_id": integer,
        "course_title": string,
        "amount": string,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/finance/students/{student_id}/payment-options

**Summary:** Get Payment Options

**Parameters:**
- `student_id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "wallet_credit": string,
    "enrollments": [
      {
        "enrollment_id": integer,
        "course_id": integer,
        "course_title": string,
        "open_debt": string,
        "overdue_days": integer,
        "remaining_contract_maximum": string,
        "billing_mode": string,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/finance/payments/{id}/void

**Summary:** Void Payment

**Parameters:**
- `id` [path] *(required)*

**Request Body (JSON):**
```json
{
  "reason_code": string,
  "comment?": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "student_id": integer,
    "type": "payment" | "discount" | "refund" | "adjustment" | "void" | "withdrawal_reversal",
    "amount": string,
    "method?": "cash" | "transfer",
    "occurred_at": string,
    "recorded_by_id": integer,
    "reverses_entry_id?": integer,
    "is_cash_out?": boolean,
    "reason_code?": string,
    "comment?": string,
    "created_at": string,
    "allocations?": [
      {
        "id": integer,
        "ledger_entry_id": integer,
        "charge_id": integer,
        "amount": string,
        "reversed_by_entry_id?": integer,
        "created_at": string,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/finance/payments/{id}/refund

**Summary:** Refund Payment

**Parameters:**
- `id` [path] *(required)*

**Request Body (JSON):**
```json
{
  "amount": number,
  "to_wallet?": boolean,
  "reason_code": string,
  "comment?": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "student_id": integer,
    "type": "payment" | "discount" | "refund" | "adjustment" | "void" | "withdrawal_reversal",
    "amount": string,
    "method?": "cash" | "transfer",
    "occurred_at": string,
    "recorded_by_id": integer,
    "reverses_entry_id?": integer,
    "is_cash_out?": boolean,
    "reason_code?": string,
    "comment?": string,
    "created_at": string,
    "allocations?": [
      {
        "id": integer,
        "ledger_entry_id": integer,
        "charge_id": integer,
        "amount": string,
        "reversed_by_entry_id?": integer,
        "created_at": string,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/finance/discounts/

**Summary:** Create Discount

**Request Body (JSON):**
```json
{
  "student_id": integer,
  "charge_id?": integer,
  "amount": number,
  "occurred_at?": string,
  "reason_code?": string,
  "comment?": string,
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "id": integer,
    "student_id": integer,
    "type": "payment" | "discount" | "refund" | "adjustment" | "void" | "withdrawal_reversal",
    "amount": string,
    "method?": "cash" | "transfer",
    "occurred_at": string,
    "recorded_by_id": integer,
    "reverses_entry_id?": integer,
    "is_cash_out?": boolean,
    "reason_code?": string,
    "comment?": string,
    "created_at": string,
    "allocations?": [
      {
        "id": integer,
        "ledger_entry_id": integer,
        "charge_id": integer,
        "amount": string,
        "reversed_by_entry_id?": integer,
        "created_at": string,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/finance/adjustments/

**Summary:** Create Adjustment

Post a correcting credit — the sanctioned fix for a closed period.

**Request Body (JSON):**
```json
{
  "student_id": integer,
  "amount": number,
  "occurred_at?": string,
  "reason_code": string,
  "comment?": string,
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "id": integer,
    "student_id": integer,
    "type": "payment" | "discount" | "refund" | "adjustment" | "void" | "withdrawal_reversal",
    "amount": string,
    "method?": "cash" | "transfer",
    "occurred_at": string,
    "recorded_by_id": integer,
    "reverses_entry_id?": integer,
    "is_cash_out?": boolean,
    "reason_code?": string,
    "comment?": string,
    "created_at": string,
    "allocations?": [
      {
        "id": integer,
        "ledger_entry_id": integer,
        "charge_id": integer,
        "amount": string,
        "reversed_by_entry_id?": integer,
        "created_at": string,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/finance/allocations/

**Summary:** Allocate Credit

Manually apply a student's wallet credit to a specific charge.

**Request Body (JSON):**
```json
{
  "student_id": integer,
  "charge_id": integer,
  "amount?": number,
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "id": integer,
    "student_id": integer,
    "type": "payment" | "discount" | "refund" | "adjustment" | "void" | "withdrawal_reversal",
    "amount": string,
    "method?": "cash" | "transfer",
    "occurred_at": string,
    "recorded_by_id": integer,
    "reverses_entry_id?": integer,
    "is_cash_out?": boolean,
    "reason_code?": string,
    "comment?": string,
    "created_at": string,
    "allocations?": [
      {
        "id": integer,
        "ledger_entry_id": integer,
        "charge_id": integer,
        "amount": string,
        "reversed_by_entry_id?": any,
        "created_at": string,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/finance/students/{student_id}/credit-allocations

**Summary:** Allocate Course Credit

**Parameters:**
- `student_id` [path] *(required)*

**Request Body (JSON):**
```json
{
  "enrollment_id": integer,
  "amount?": string,
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "allocated_amount": string,
    "wallet_credit": string,
    "allocations": [
      {
        "charge_id": integer,
        "ledger_entry_id": integer,
        "amount": string,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/finance/students/{id}/ledger

**Summary:** Get Student Ledger

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  array[object]
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/finance/students/{id}/balance

**Summary:** Get Student Balance

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "student_id": integer,
    "billed_to_date": string,
    "total_settled": string,
    "net_receivable": string,
    "credit_balance": string,
    "days_overdue": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/finance/charges/

**Summary:** List Charges

**Parameters:**
- `student_id` [query]
- `enrollment_id` [query]
- `status` [query]
- `page` [query]
- `page_size` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "id": integer,
        "enrollment_id": integer,
        "student_id": integer,
        "sequence_no": integer,
        "amount": string,
        "due_date": string,
        "type": "tuition" | "fee" | "late_fee",
        "status": "open" | "settled" | "cancelled",
        "allocated_amount?": string,
        "remaining_balance?": string,
        "student_name?": string,
        "course_title?": string,
        "billing_mode?": "paid" | "grant",
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/finance/credits/

**Summary:** List Student Credits

**Responses:**
- **200**: Successful Response
  ```json
  [
    {
      "student_id": integer,
      "student_name": string,
      "email?": string,
      "credit_balance": string,
    }
  ]
  ```

---

## GET /api/v1/finance/payments/{id}/receipt

**Summary:** Get Payment Receipt

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "receipt_number": string,
    "occurred_at": string,
    "student_id": integer,
    "student_name": string,
    "student_email?": string,
    "amount": string,
    "method?": "cash" | "transfer",
    "accepted_by_name": string,
    "allocations?": [
      {
        "charge_id": integer,
        "charge_type": string,
        "course_title": string,
        "due_date": string,
        "allocated_amount": string,
      }
    ],
    "targets?": [
      {
        "enrollment_id": integer,
        "course_id": integer,
        "course_title": string,
        "amount": string,
      }
    ],
    "comment?": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/finance/periods/{year}/{month}/close

**Summary:** Close Period

**Parameters:**
- `year` [path] *(required)*
- `month` [path] *(required)*

**Request Body (JSON):**
```json
{
  "comment?": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "year": integer,
    "month": integer,
    "status": "open" | "closed",
    "closed_by_id?": integer,
    "closed_at?": string,
    "reopen_reason?": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/finance/periods/{year}/{month}/reopen

**Summary:** Reopen Period

**Parameters:**
- `year` [path] *(required)*
- `month` [path] *(required)*

**Request Body (JSON):**
```json
{
  "reason_code": string,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "year": integer,
    "month": integer,
    "status": "open" | "closed",
    "closed_by_id?": integer,
    "closed_at?": string,
    "reopen_reason?": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/finance/debts/

**Summary:** Get Debts

**Parameters:**
- `search` [query] Case-insensitive name, email or phone search before pagination
- `course_id` [query]
- `student_id` [query]
- `min_debt` [query]
- `overdue_days` [query]
- `enrollment_status` [query] Defaults to all statuses; use 'active' to exclude withdrawn students
- `page` [query]
- `page_size` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "student": {
          "id": any,
          "first_name": any,
          "last_name": any,
          "email?": any,
          "payment_day_of_month?": any,
        },
        "course": {
          "id": any,
          "title": any,
        },
        "price_at_enrollment": string,
        "billing_mode": "paid" | "grant",
        "billed_to_date": string,
        "total_paid": string,
        "debt": string,
        "overdue_days": integer,
        "reminder_channel?": "telegram" | "sms",
        "reminder_masked_destination?": string,
        "parent_telegram_linked": boolean,
        "last_reminder_at": string,
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/finance/debts/reminders

**Summary:** Queue Debt Reminders

**Request Body (JSON):**
```json
{
  "student_ids": array[integer],
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "results": [
      {
        "student_id": integer,
        "outcome": "queued" | "no_parent_chat" | "no_debt" | "recently_reminded" | "not_found" | "no_channel",
        "channel?": "telegram" | "sms",
        "masked_destination?": string,
        "next_allowed_at": string,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/finance/analytics/

**Summary:** Get Analytics

**Parameters:**
- `date_from` [query]
- `date_to` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "gross_contract_value": string,
    "billed_to_date": string,
    "billed_in_period": string,
    "net_receivable": string,
    "collected_in_period": string,
    "outstanding_credit": string,
    "aging": {
      "d0_30?": string,
      "d31_60?": string,
      "d61_90?": string,
      "d90_plus?": string,
    },
    "unpaid_students_count": integer,
    "collection_rate": string,
    "debtors_preview": [
      {
        "student_id": integer,
        "first_name": string,
        "last_name": string,
        "email?": string,
        "debt": string,
      }
    ],
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/documents/

**Summary:** List Documents

**Parameters:**
- `owner_type` [query]
- `owner_id` [query]
- `journal_id` [query]
- `page` [query]
- `page_size` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "id": integer,
        "owner_type": "student" | "mentor",
        "owner_id": integer,
        "journal_id": integer,
        "file_path": string,
        "file_name": string,
        "file_type": string,
        "file_size": integer,
        "uploaded_by_id": integer,
        "uploaded_at": string,
        "is_deleted": boolean,
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/documents/

**Summary:** Upload Document

**Request Body (multipart/form-data):**
```json
{
  "file": string,
  "owner_type": string,
  "owner_id": integer,
  "journal_id?": integer,
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "id": integer,
    "owner_type": "student" | "mentor",
    "owner_id": integer,
    "journal_id": integer,
    "file_path": string,
    "file_name": string,
    "file_type": string,
    "file_size": integer,
    "uploaded_by_id": integer,
    "uploaded_at": string,
    "is_deleted": boolean,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## DELETE /api/v1/documents/{id}

**Summary:** Delete Document

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **204**: Successful Response
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/documents/{document_id}/download

**Summary:** Download Document

**Parameters:**
- `document_id` [path] *(required)*

**Responses:**
- **200**: Successful Response
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/audit-log/

**Summary:** List Audit Logs

**Parameters:**
- `page` [query]
- `page_size` [query]
- `actor_id` [query]
- `category` [query]
- `action` [query]
- `entity_type` [query]
- `entity_id` [query]
- `date_from` [query] Inclusive Dushanbe calendar day
- `date_to` [query] Inclusive Dushanbe calendar day
- `search` [query] Matches actor name, entity type or field name

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "id": integer,
        "user_id": integer,
        "actor_name?": string,
        "action": "create" | "update" | "delete" | "void" | "refund" | "close_period" | "reopen_period",
        "entity_type": string,
        "entity_id": integer,
        "entity_label?": string,
        "student_id?": integer,
        "course_id?": integer,
        "field_name": string,
        "old_value": string,
        "new_value": string,
        "created_at": string,
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/audit-log/events/

**Summary:** List Audit Events

**Parameters:**
- `page` [query]
- `page_size` [query]
- `actor_id` [query]
- `category` [query]
- `action` [query]
- `entity_type` [query]
- `entity_id` [query]
- `date_from` [query] Inclusive Dushanbe calendar day
- `date_to` [query] Inclusive Dushanbe calendar day
- `search` [query] Matches actor name, entity type or field name

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "id": integer,
        "user_id": integer,
        "actor_name?": string,
        "action": "create" | "update" | "delete" | "void" | "refund" | "close_period" | "reopen_period",
        "entity_type": string,
        "entity_id": integer,
        "entity_label?": string,
        "student_id?": integer,
        "course_id?": integer,
        "course_title?": string,
        "amount?": string,
        "created_at": string,
        "changes": array[],
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/audit-log/filter-options/

**Summary:** Get Audit Filter Options

**Responses:**
- **200**: Successful Response
  ```json
  {
    "actors": [
      {
        "id": integer,
        "name": string,
      }
    ],
    "entity_types": array[string],
  }
  ```

---

## GET /api/v1/notifications/

**Summary:** List Notifications

**Parameters:**
- `page` [query]
- `page_size` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "id": integer,
        "user_id?": integer,
        "recipient": string,
        "type": "payment_reminder_2d" | "payment_reminder_1d" | "exam_result" | "telegram_link_lockout",
        "related_entity_id": integer,
        "notification_date": string,
        "status": "queued" | "inflight" | "sent" | "failed",
        "attempts?": integer,
        "sent_at": string,
        "read_at?": string,
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/notifications/unread-count

**Summary:** Get Unread Count

**Responses:**
- **200**: Successful Response
  ```json
  {
    "unread_count": integer,
  }
  ```

---

## POST /api/v1/notifications/read-all

**Summary:** Mark All Notifications Read

**Responses:**
- **200**: Successful Response
  ```json
  {
    "updated_count": integer,
  }
  ```

---

## GET /api/v1/notifications/delivery-log

**Summary:** List Delivery Log

**Parameters:**
- `page` [query]
- `page_size` [query]
- `status` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "id": integer,
        "recipient_name?": string,
        "type": "payment_reminder_2d" | "payment_reminder_1d" | "exam_result" | "telegram_link_lockout",
        "notification_date": string,
        "status": "queued" | "inflight" | "sent" | "failed",
        "attempts": integer,
        "sent_at?": string,
        "student_id?": integer,
        "course_id?": integer,
        "course_title?": string,
        "amount?": string,
        "score?": integer,
      }
    ],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/notifications/logs/{id}/retry

**Summary:** Retry Delivery Log

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "recipient_name?": string,
    "type": "payment_reminder_2d" | "payment_reminder_1d" | "exam_result" | "telegram_link_lockout",
    "notification_date": string,
    "status": "queued" | "inflight" | "sent" | "failed",
    "attempts": integer,
    "sent_at?": string,
    "student_id?": integer,
    "course_id?": integer,
    "course_title?": string,
    "amount?": string,
    "score?": integer,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## PATCH /api/v1/notifications/{id}/read

**Summary:** Mark Notification Read

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "user_id?": integer,
    "recipient": string,
    "type": "payment_reminder_2d" | "payment_reminder_1d" | "exam_result" | "telegram_link_lockout",
    "related_entity_id": integer,
    "notification_date": string,
    "status": "queued" | "inflight" | "sent" | "failed",
    "attempts?": integer,
    "sent_at": string,
    "read_at?": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/telegram/webhook

**Summary:** Telegram Webhook

**Responses:**
- **200**: Successful Response
  ```json
  object
  ```

---

## GET /api/v1/settings/org

**Summary:** Get Org Settings

**Responses:**
- **200**: Successful Response
  ```json
  {
    "org_name": string,
    "address?": string,
    "phone?": string,
    "notify_payments": boolean,
    "notify_debts": boolean,
    "updated_at?": string,
  }
  ```

---

## PATCH /api/v1/settings/org

**Summary:** Update Org Settings

**Input keys:** Only `org_name`, `notify_payments` and `notify_debts` are accepted (`additionalProperties: false`). Any unknown key returns 422 for the whole request without applying its other fields.

**Request Body (JSON):**
```json
{
  "org_name?": string,
  "address?": string,
  "phone?": string,
  "notify_payments?": boolean,
  "notify_debts?": boolean,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "org_name": string,
    "address?": string,
    "phone?": string,
    "notify_payments": boolean,
    "notify_debts": boolean,
    "updated_at?": string,
  }
  ```
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/settings/telegram/test

**Summary:** Test Telegram Bot

**Responses:**
- **200**: Successful Response
  ```json
  {
    "reachable": boolean,
    "bot_username?": string,
  }
  ```

---

## POST /api/v1/cron/archive-courses

**Summary:** Trigger Archive Courses

**Parameters:**
- `x-cloud-scheduler-secret` [header]

**Responses:**
- **202**: Successful Response
  ```json
  {
    "status?": string,
    "task": "archive_expired_courses" | "check_payment_reminders",
    "job_id": string,
  }
  ```
- **503**: Maintenance queue unavailable; retry after 60 seconds
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## POST /api/v1/cron/payment-reminders

**Summary:** Trigger Payment Reminders

**Parameters:**
- `x-cloud-scheduler-secret` [header]

**Responses:**
- **202**: Successful Response
  ```json
  {
    "status?": string,
    "task": "archive_expired_courses" | "check_payment_reminders",
    "job_id": string,
  }
  ```
- **503**: Maintenance queue unavailable; retry after 60 seconds
- **422**: Validation Error
  ```json
  {
    "detail?": [
      {
        "loc": array[],
        "msg": string,
        "type": string,
        "input?": any,
        "ctx?": object,
      }
    ],
  }
  ```

---

## GET /api/v1/dashboard/attention

**Summary:** Attention

**Responses:**
- **200**: Successful Response
  ```json
  {
    "lessons_in_progress": [
      {
        "course_id": integer,
        "course_title": string,
        "time_start": string,
        "time_end": string,
        "mentor_name": string,
        "mentor_phone": string,
        "journal_id": integer,
      }
    ],
    "attendance_not_marked": [
      {
        "course_id": integer,
        "course_title": string,
        "time_start": string,
        "time_end": string,
        "mentor_name": string,
        "mentor_phone": string,
        "journal_id": integer,
      }
    ],
    "absent_students": [
      {
        "course_id": integer,
        "course_title": string,
        "time_start": string,
        "time_end": string,
        "mentor_name": string,
        "mentor_phone": string,
        "journal_id": integer,
        "students": array[],
      }
    ],
    "payments": [
      {
        "student_id": integer,
        "student_name": string,
        "course_id": integer,
        "course_title": string,
        "enrollment_id": integer,
        "due_date": string,
        "remaining_amount": string,
      }
    ],
  }
  ```

---

## GET /api/v1/system/version

**Summary:** Get Build Version

**Responses:**
- **200**: Successful Response
  ```json
  {
    "version": string,
    "commit_sha?": string,
    "commit_message?": string,
    "built_at?": string,
  }
  ```

---

## GET /health

**Summary:** Health Check

**Responses:**
- **200**: Successful Response

---

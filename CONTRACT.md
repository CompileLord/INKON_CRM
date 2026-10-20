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
  "email": string,
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

## POST /api/v1/auth/password-reset/request

**Summary:** Password Reset Request

**Request Body (JSON):**
```json
{
  "email": string,
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

**Request Body (JSON):**
```json
{
  "email": string,
  "first_name": string,
  "last_name": string,
  "role": "superadmin" | "mentor" | "student" | "accountant",
  "date_of_birth?": string,
  "phone?": string,
  "parent_telegram_chat_id?": integer,
  "parent_phone?": string,
  "payment_day_of_month?": integer,
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "id": integer,
    "email": string,
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
    "id": integer,
    "email": string,
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

**Request Body (JSON):**
```json
{
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
    "id": integer,
    "email": string,
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

**Parameters:**
- `id` [path] *(required)*

**Request Body (JSON):**
```json
{
  "email?": string,
  "first_name?": string,
  "last_name?": string,
  "date_of_birth?": string,
  "phone?": string,
  "parent_telegram_chat_id?": integer,
  "parent_phone?": string,
  "payment_day_of_month?": integer,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "email": string,
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
    "id": integer,
    "email": string,
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
- `page` [query]
- `page_size` [query]

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": [
      {
        "id": integer,
        "email": string,
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
      "id": integer,
      "email": string,
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
      "id": integer,
      "email": string,
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
        "id": integer,
        "email": string,
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
      "id": integer,
      "email": string,
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

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response (mentor owner or superadmin)
  ```json
  {
    "user": {
      "id": integer,
      "email": string,
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
- **200**: Student mentor card (alternative response)
  ```json
  {
    "user": {
      "id": integer,
      "first_name": string,
      "last_name": string,
      "photo_path?": string | null,
      "thumbnail_path?": string | null
    },
    "active_courses": [
      {
        "id": integer,
        "title": string,
        "photo_path?": string | null
      }
    ]
  }
  ```

  Students receive only public mentor identity and course identity for their nondeleted enrollments on nondeleted courses belonging to this nondeleted mentor. Historical enrollment statuses remain eligible. The `active_courses` name is retained for caller compatibility; it does not impose an active enrollment or course status filter. No contact, DOB, parent, account metadata, full course details or mentor-wide statistics are returned. The response union is `MentorProfileResponse | StudentMentorCardResponse`; the staff response above is unchanged. Students without an eligible relationship, unrelated mentors and accountants receive 403.

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

**Parameters:**
- `id` [path] *(required)*

**Responses:**
- **200**: Successful Response
  ```json
  {
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
        "grading_states": array[],
        "graded_periods_count": integer,
        "eligible_periods_count": integer,
      }
    ],
    "class_avg_series": array[number],
    "class_eligible_counts": array[integer],
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

**Role-dependent response:** The live OpenAPI response is `StaffChartResponse | StudentChartResponse`.
The generated example above shows the staff branch; the generator currently selects the first union branch and omits null alternatives.
All `scores`, `max_scores`, `percentages`, `my_series`, and `class_avg_series` elements are `number | null`.
Each series retains one slot per ordered period plus a trailing average. `grading_states` and `my_grading_states` contain one entry per period, without a trailing entry: `missing | ungraded | unknown | graded | upcoming`.

Student branch:
```json
{
  "periods": [{"id": integer, "period_label": string}],
  "my_series": [number | null],
  "class_avg_series": [number | null],
  "my_grading_states": ["missing | ungraded | unknown | graded | upcoming"],
  "my_graded_periods_count": integer,
  "my_eligible_periods_count": integer,
  "class_eligible_counts": [integer],
  "my_rank": integer | null,
  "class_size": integer
}
```

Only nondeleted active enrollments of nondeleted students contribute to class means and ranks.
An authorized historical student retains their own series but has no class rank.
A started summary explicitly marked graded contributes to `graded_periods_count`, including zero scores and zero maxima.
A percentage additionally requires a positive maximum; missing, untouched, unknown, future and zero-maximum ratios are null.
Student averages use eligible period ratios; the trailing class average uses the unrounded means of eligible active students.
Means and percentages round only for presentation. Ranks sort unrounded means descending, then student ID ascending; students without an eligible ratio have null rank.
`class_eligible_counts` has one entry per period and counts eligible active student ratios.
Student responses contain no peer identities or datasets.

---

## GET /api/v1/enrollments/

**Summary:** List Enrollments

**Parameters:**
- `course_id` [query]
- `student_id` [query]
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
        "student": {
          "id": any,
          "first_name": any,
          "last_name": any,
          "email": any,
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
      "student": {
        "id": integer,
        "first_name": string,
        "last_name": string,
        "email": string,
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
        "email": string,
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

**Request Body (JSON):**
```json
{
  "student_id": integer,
  "course_id": integer,
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
    "type": "payment" | "discount" | "refund" | "adjustment" | "void",
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
    "type": "payment" | "discount" | "refund" | "adjustment" | "void",
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
    "type": "payment" | "discount" | "refund" | "adjustment" | "void",
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
    "type": "payment" | "discount" | "refund" | "adjustment" | "void",
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
    "type": "payment" | "discount" | "refund" | "adjustment" | "void",
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
      "email": string,
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
    "student_email": string,
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
          "email": any,
          "payment_day_of_month?": any,
        },
        "course": {
          "id": any,
          "title": any,
        },
        "price_at_enrollment": string,
        "billed_to_date": string,
        "total_paid": string,
        "debt": string,
        "overdue_days": integer,
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
        "outcome": "queued" | "no_parent_chat" | "no_debt" | "recently_reminded" | "not_found",
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
        "email": string,
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
        "sent_at?": string,
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
    "sent_at?": string,
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
    "notify_payments": boolean,
    "notify_debts": boolean,
    "updated_at?": string,
  }
  ```

---

## PATCH /api/v1/settings/org

**Summary:** Update Org Settings

**Request Body (JSON):**
```json
{
  "org_name?": string,
  "notify_payments?": boolean,
  "notify_debts?": boolean,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "org_name": string,
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

## POST /api/v1/cron/payment-reminders

**Summary:** Trigger Payment Reminders

**Parameters:**
- `x-cloud-scheduler-secret` [header]

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

## GET /api/v1/system/version

**Summary:** Get Build Version

**Responses:**
- **200**: Successful Response
  ```json
  {
    "version": string,
    "commit_sha": string,
    "commit_message": string,
    "built_at": string,
  }
  ```

---

## GET /health

**Summary:** Health Check

**Responses:**
- **200**: Successful Response

---

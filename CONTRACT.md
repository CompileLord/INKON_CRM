# IMKON CRM Complete API Contracts

This document is auto-generated from the OpenAPI schema and contains all endpoints and their contracts.

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
    "refresh_token"?: any,
    "token_type"?: string,
    "must_set_password"?: boolean,
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
    "refresh_token"?: any,
    "token_type"?: string,
    "must_set_password"?: boolean,
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
    "refresh_token"?: any,
    "token_type"?: string,
    "must_set_password"?: boolean,
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
    "refresh_token"?: any,
    "token_type"?: string,
    "must_set_password"?: boolean,
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
  {}
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
  {}
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
    "refresh_token"?: any,
    "token_type"?: string,
    "must_set_password"?: boolean,
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
  "role": object,
  "date_of_birth"?: any,
  "phone"?: any,
  "parent_telegram_chat_id"?: any,
  "payment_day_of_month"?: any,
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
    "role": object,
    "date_of_birth"?: any,
    "phone"?: any,
    "parent_telegram_chat_id"?: any,
    "photo_path"?: any,
    "thumbnail_path"?: any,
    "payment_day_of_month"?: any,
    "must_set_password": boolean,
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```

---

## PATCH /api/v1/users/{id}

**Summary:** Update User

**Parameters:**
- `id` [path]  (Required)

**Request Body (JSON):**
```json
{
  "email"?: any,
  "first_name"?: any,
  "last_name"?: any,
  "date_of_birth"?: any,
  "phone"?: any,
  "parent_telegram_chat_id"?: any,
  "payment_day_of_month"?: any,
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
    "role": object,
    "date_of_birth"?: any,
    "phone"?: any,
    "parent_telegram_chat_id"?: any,
    "photo_path"?: any,
    "thumbnail_path"?: any,
    "payment_day_of_month"?: any,
    "must_set_password": boolean,
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```

---

## DELETE /api/v1/users/{id}

**Summary:** Delete User

**Parameters:**
- `id` [path]  (Required)

**Responses:**
- **204**: Successful Response

---

## POST /api/v1/users/{id}/avatar/

**Summary:** Upload Avatar

**Parameters:**
- `id` [path]  (Required)

**Request Body (Form-Data):**

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "email": string,
    "first_name": string,
    "last_name": string,
    "role": object,
    "date_of_birth"?: any,
    "phone"?: any,
    "parent_telegram_chat_id"?: any,
    "photo_path"?: any,
    "thumbnail_path"?: any,
    "payment_day_of_month"?: any,
    "must_set_password": boolean,
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
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
    "items": array[],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```

---

## GET /api/v1/students/me/profile

**Summary:** Get My Profile

**Responses:**
- **200**: Successful Response
  ```json
  {
    "user": object,
    "courses": array[],
    "avg_score": number,
    "absences": integer,
    "total_lessons": integer,
  }
  ```

---

## GET /api/v1/students/{id}/profile

**Summary:** Get Student Profile

**Parameters:**
- `id` [path]  (Required)

**Responses:**
- **200**: Successful Response
  ```json
  {
    "user": object,
    "courses": array[],
    "avg_score": number,
    "absences": integer,
    "total_lessons": integer,
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
    "items": array[],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```

---

## GET /api/v1/mentors/me/profile

**Summary:** Get My Profile

**Responses:**
- **200**: Successful Response
  ```json
  {
    "user": object,
    "active_courses": array[],
    "active_students_count": integer,
    "avg_score": number,
  }
  ```

---

## GET /api/v1/mentors/{id}/profile

**Summary:** Get Mentor Profile

**Parameters:**
- `id` [path]  (Required)

**Responses:**
- **200**: Successful Response
  ```json
  {
    "user": object,
    "active_courses": array[],
    "active_students_count": integer,
    "avg_score": number,
  }
  ```

---

## GET /api/v1/mentors/{id}/analytics

**Summary:** Get Mentor Analytics

**Parameters:**
- `id` [path]  (Required)

**Responses:**
- **200**: Successful Response
  ```json
  {}
  ```

---

## POST /api/v1/courses/

**Summary:** Create Course

**Request Body (JSON):**
```json
{
  "title": string,
  "description": string,
  "photo_path"?: any,
  "start_date": string,
  "end_date": string,
  "exam_type": object,
  "price": any,
  "mentor_id": integer,
  "schedules": array[],
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "id": integer,
    "title": string,
    "description": string,
    "photo_path"?: any,
    "start_date": string,
    "end_date": string,
    "exam_type": object,
    "price": string,
    "mentor_id": integer,
    "status": object,
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
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
    "items": array[],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```

---

## GET /api/v1/courses/{id}

**Summary:** Get Course

**Parameters:**
- `id` [path]  (Required)

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "title": string,
    "description": string,
    "photo_path"?: any,
    "start_date": string,
    "end_date": string,
    "exam_type": object,
    "price": string,
    "mentor_id": integer,
    "status": object,
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```

---

## PATCH /api/v1/courses/{id}

**Summary:** Update Course

**Parameters:**
- `id` [path]  (Required)

**Request Body (JSON):**
```json
{
  "title"?: any,
  "description"?: any,
  "photo_path"?: any,
  "start_date"?: any,
  "end_date"?: any,
  "mentor_id"?: any,
  "status"?: any,
}
```

**Responses:**
- **200**: Successful Response
  ```json
  {
    "id": integer,
    "title": string,
    "description": string,
    "photo_path"?: any,
    "start_date": string,
    "end_date": string,
    "exam_type": object,
    "price": string,
    "mentor_id": integer,
    "status": object,
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```

---

## DELETE /api/v1/courses/{id}

**Summary:** Delete Course

**Parameters:**
- `id` [path]  (Required)

**Responses:**
- **204**: Successful Response

---

## GET /api/v1/courses/{id}/schedule

**Summary:** Get Course Schedule

**Parameters:**
- `id` [path]  (Required)

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

---

## POST /api/v1/courses/{id}/copy/

**Summary:** Copy Course

**Parameters:**
- `id` [path]  (Required)

**Request Body (JSON):**
```json
{
  "title": string,
  "description": string,
  "photo_path"?: any,
  "start_date": string,
  "end_date": string,
  "exam_type": object,
  "price": any,
  "mentor_id": integer,
  "schedules": array[],
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "id": integer,
    "title": string,
    "description": string,
    "photo_path"?: any,
    "start_date": string,
    "end_date": string,
    "exam_type": object,
    "price": string,
    "mentor_id": integer,
    "status": object,
    "is_deleted": boolean,
    "created_at": string,
    "updated_at": string,
  }
  ```

---

## GET /api/v1/courses/{id}/mentor-history

**Summary:** Get Course Mentor History

**Parameters:**
- `id` [path]  (Required)

**Responses:**
- **200**: Successful Response
  ```json
  [
  {
      "id": integer,
      "course_id": integer,
      "mentor_id": integer,
      "assigned_from": string,
      "assigned_to"?: any,
      "mentor": object,
    }
  ]
  ```

---

## GET /api/v1/courses/{id}/progress-chart

**Summary:** Get Progress Chart

**Parameters:**
- `id` [path]  (Required)

**Responses:**
- **200**: Successful Response
  ```json
  {}
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
    "status": object,
    "is_deleted": boolean,
  }
  ```

---

## GET /api/v1/enrollments/

**Summary:** List Enrollments

**Parameters:**
- `page` [query] 
- `page_size` [query] 

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": array[],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```

---

## PATCH /api/v1/enrollments/{id}/withdraw

**Summary:** Withdraw Student

**Parameters:**
- `id` [path]  (Required)

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
    "status": object,
    "is_deleted": boolean,
  }
  ```

---

## GET /api/v1/journals/{id}

**Summary:** Get Journal

**Parameters:**
- `id` [path]  (Required)

**Responses:**
- **200**: Successful Response
  ```json
  {}
  ```

---

## PUT /api/v1/journals/{id}/entries

**Summary:** Batch Update Entries

**Parameters:**
- `id` [path]  (Required)

**Request Body (JSON):**
```json
[
{
    "student_id": integer,
    "lesson_date": string,
    "attendance": boolean,
    "score": integer,
    "comment"?: any,
    "version": integer,
  }
]
```

**Responses:**
- **200**: Successful Response
  ```json
  {}
  ```

---

## PATCH /api/v1/journals/{journal_id}/students/{student_id}/summary

**Summary:** Update Exam Or Bonus

**Parameters:**
- `journal_id` [path]  (Required)
- `student_id` [path]  (Required)

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
    "exam_score": integer,
    "bonus_score": integer,
    "sum_score": integer,
    "attendance_count": integer,
    "total_lessons": integer,
    "version": integer,
  }
  ```

---

## POST /api/v1/finance/payments/

**Summary:** Create Payment

**Request Body (JSON):**
```json
{
  "student_id": integer,
  "course_id": integer,
  "amount": any,
  "paid_at": string,
  "method": object,
  "discount_percent"?: integer,
  "comment"?: any,
}
```

**Responses:**
- **201**: Successful Response
  ```json
  {
    "id": integer,
    "student_id": integer,
    "course_id": integer,
    "amount": string,
    "paid_at": string,
    "method": object,
    "accepted_by_id": integer,
    "discount_percent": integer,
    "comment"?: any,
    "created_at": string,
    "effective_amount": string,
  }
  ```

---

## GET /api/v1/finance/payments/

**Summary:** List Payments

**Parameters:**
- `student_id` [query] 
- `course_id` [query] 
- `method` [query] 
- `page` [query] 
- `page_size` [query] 

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": array[],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```

---

## GET /api/v1/finance/debts/

**Summary:** Get Debts

**Parameters:**
- `course_id` [query] 
- `min_debt` [query] 
- `overdue_days` [query] 
- `page` [query] 
- `page_size` [query] 

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": array[],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
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
  {}
  ```

---

## POST /api/v1/documents/

**Summary:** Upload Document

**Request Body (Form-Data):**

**Responses:**
- **201**: Successful Response
  ```json
  {
    "id": integer,
    "owner_type": object,
    "owner_id": integer,
    "journal_id": any,
    "file_path": string,
    "file_name": string,
    "file_type": string,
    "file_size": integer,
    "uploaded_by_id": integer,
    "uploaded_at": string,
    "is_deleted": boolean,
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
    "items": array[],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```

---

## DELETE /api/v1/documents/{id}

**Summary:** Delete Document

**Parameters:**
- `id` [path]  (Required)

**Responses:**
- **204**: Successful Response

---

## GET /api/v1/audit-log/

**Summary:** List Audit Logs

**Parameters:**
- `page` [query] 
- `page_size` [query] 

**Responses:**
- **200**: Successful Response
  ```json
  {
    "items": array[],
    "total": integer,
    "page": integer,
    "page_size": integer,
    "total_pages": integer,
  }
  ```

---

## POST /api/v1/telegram/webhook

**Summary:** Telegram Webhook

**Responses:**
- **200**: Successful Response
  ```json
  {}
  ```

---

## GET /health

**Summary:** Health Check

**Responses:**
- **200**: Successful Response
  ```json
  any
  ```

---


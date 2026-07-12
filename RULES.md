# Development Rules & Guidelines (RULES.md)

This file contains the strict coding standards, architectural rules, and workflow processes that all developers and AI coding agents (Cursor, Windsurf, Claude Code, etc.) must follow when working on the **IMKON CRM** project.

---

## 1. Architectural Foundations

### 1.1. Full Object-Oriented Programming (OOP)
- All business logic, services, and repositories must be encapsulated within classes. Avoid global utility functions.
- Use class inheritance, abstract base classes (ABCs), Protocols, and polymorphism where appropriate to represent abstractions (e.g., file storage, repositories, mailing services).

### 1.2. SOLID Principles
- **S**ingle Responsibility: Each class must have exactly one reason to change. Separate endpoints (API controllers) from business logic (Services) and database queries (Repositories).
- **O**pen/Closed: Write extension-friendly code. Implement abstract interfaces so that behavior can be replaced (e.g., swapping `LocalStorageService` to `S3StorageService` without touching service logic).
- **L**iskov Substitution: Child implementations must be fully substitutable for their parent contracts.
- **I**nterface Segregation: Define narrow Protocols. Do not force classes to implement methods they do not need.
- **D**ependency Inversion: High-level modules (Services) must not depend on low-level database modules directly. They must depend on Repository Interfaces (Protocols). Implement this using **FastAPI Depends** injection.

### 1.3. Clean Layer Separation
- **Models**: Plain database mappings defining schemas, constraints, and relationships. No business logic here.
- **Repositories**: Exclusively handles database operations (SQL/SQLAlchemy). No business logic, validation, or HTTP exceptions.
- **Services**: Contains business workflows, transactional boundary limits, audits, and validation checks. This layer is database-technology-agnostic.
- **API Controllers**: Exclusively handles HTTP request decoding, schema parsing (Pydantic), endpoint authorization checks, and returning appropriate HTTP responses.

---

## 2. Coding Style & Documentation

### 2.1. Zero Comments Rule (Self-Documenting Code)
- **Do not write code comments.** Code must be so clean, structured, and descriptive that comments are completely redundant.
- Use verbose, meaningful naming conventions for variables, parameters, functions, classes, and tables (e.g., `calculate_student_overall_absence_count` instead of `get_abs`).
- Leverage Python **Type Hints** on all variable declarations, function parameters, and return signatures to make inputs/outputs obvious.
- *Strict Exception*: Code comments are permitted **only** when explaining complex math formulas (like the exact `Sum` aggregation) or cron scheduler offsets.

### 2.2. Robust Typing & Validation
- Enforce Pydantic v2 schemas for all incoming payloads and API outputs.
- Enable `extra = "forbid"` on input schemas to reject unrecognized fields.
- Validate telephone inputs strictly in E.164 formats.

---

## 3. Database & Query Optimization

### 3.1. Query Performance Standards
- **No N+1 queries**: Always use `joinedload` or `selectinload` when querying parent entities with their relationships (e.g., loading courses with schedules or students with summaries).
- **Leverage Indexes**: Utilize the indexing plan defined in the ER diagram (composite indexes on foreign keys, soft delete search fields like `(role, is_deleted)`).
- **Aggregates Optimization**: Perform heavy calculations (averages, sums, metrics counters) directly in SQL queries using `GROUP BY` and DB aggregates instead of pulling lists into Python memory and summing them manually.
- **Materialized or Cached Views**: Keep heavy operations like Financial Analytics and debtor tables cached in Redis with a reasonable TTL (e.g., 10 minutes).

### 3.2. Concurrency & Integrity
- **Optimistic Locking**: Always apply optimistic concurrency checks using SQLAlchemy `version_id_col` for critical update paths (`JournalEntry` and `JournalStudentSummary`).
- **Graceful Concurrency Failure**: Catch `StaleObjectError` concurrency conflicts during transactional commits, rollback, and raise a `409 Conflict` HTTP exception.

---

## 4. AI-Agent Workflow & Task Tracking

All AI coding assistants must follow this workflow to maintain project synchronization:

### 4.1. Task Status Updates (CRITICAL)
- Before starting any coding work, open `.taskmaster/tasks/tasks_index.json` to find the correct `tasks_X.json` target file.
- When starting a task, update its status in the JSON file to `"in_progress"`.
- When a task is completed, you **must** update its status from `"in_progress"` to `"completed"` in the respective `tasks_X.json` file.
- Do not mark a task as `"completed"` until:
  1. The code is written and follows all rules in this `RULES.md` document.
  2. The specific test strategy defined in the task is executed and passes successfully.

### 4.2. Sequential execution
- Always process tasks in order of their dependencies. Do not jump to Task 19 before Task 3 is completed.
- If a blocker is encountered, report it immediately, but keep other completed tasks marked as `"completed"`.

---

## 5. Development Environment & Tooling

### 5.1. Conda Environment
- **Conda Base**: In this project, we use the `conda base` environment. Do not create, activate, or use a custom conda or Python virtual environment (`venv`). All commands, installations, and testing must run using the default conda `base` environment.


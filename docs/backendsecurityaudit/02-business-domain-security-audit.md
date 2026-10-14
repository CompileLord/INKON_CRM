# Business and domain security audit

## 1. Scope

Every owned file received a security pass and a separate performance pass. Exact ownership (22 files):

- `backend/app/core/schedule_utils.py`
- `backend/app/core/scoring.py`
- `backend/app/core/security.py`
- `backend/app/services/audit_service.py`
- `backend/app/services/auth_service.py`
- `backend/app/services/course_service.py`
- `backend/app/services/document_service.py`
- `backend/app/services/email_service.py`
- `backend/app/services/enrollment_service.py`
- `backend/app/services/finance_service.py`
- `backend/app/services/journal_generation_service.py`
- `backend/app/services/journal_service.py`
- `backend/app/services/notification_service.py`
- `backend/app/services/settings_service.py`
- `backend/app/services/storage_service.py`
- `backend/app/services/sum_calculation_service.py`
- `backend/app/services/user_service.py`
- `backend/app/telegram_bot/bot.py`
- `backend/app/telegram_bot/handlers/start.py`
- `backend/app/workers/__init__.py`
- `backend/app/workers/settings.py`
- `backend/app/workers/tasks.py`

The prior quality plan and all three quality reports were reviewed as untrusted baseline, followed by both new plans and the complete security, performance and quality skills and both bundled pattern references. Referenced shared checklists are absent. Relevant auth/document/avatar/notification and finance/journal integration tests were read before their implementations. AGENTS.md, CONTRACT.md, routers, schemas, Depends/session wiring, models and repositories were read only to trace reachability. No finding independently audits another group's file.

Assets and boundaries: anonymous credentials/recovery codes to AuthService; authenticated role to financial mutations; student/parent identities to Telegram destinations; multipart input to local/object storage; producers to ARQ workers; request/worker sessions to PostgreSQL and Redis. STRIDE checks covered credential spoofing, object/property tampering, financial repudiation, document/grade disclosure, resource exhaustion and privilege escalation. No user-controlled server fetch, shell execution, eval or unsafe deserialization path was established in these owned files. JSON parsing of internally produced Redis records is not arbitrary-code deserialization.

Executed validation: Conda base Python with PYTHONDONTWRITEBYTECODE=1 successfully parsed all 22 files. Original security functions and original AuthService login/refresh/logout methods were AST-extracted and executed entirely in memory with a frozen clock, synthetic users, synthetic keys and repository doubles. Installed Python smtplib/ssl source and context defaults were inspected without network access. No application imports, pytest, uploads, real credentials/PII, database/service mutations, dependency changes or source edits occurred. Proposed regression tests below were not run.

## 2. Summary

**Verdict: request changes; security score 3/10.** New service-level evidence confirms the prior BUS-01 flaw can actually turn a student's refresh operation into an administrator access grant. Two distinct newly verified paths weaken recovery: SMTP STARTTLS omits certificate verification, and password recovery leaves stolen access credentials valid. Accounting-period closure also lacks synchronization with financial commands; this is a distinct closed-period authorization race, beyond the earlier overspend example. Scores describe static and isolated evidence, not a production penetration test.

Baseline context only: BUS-03–06 and BUS-08–18 remain important previously reported reversal, reset-grant, delivery, storage, scope and parent-binding concerns; they are not relabeled as new findings here. API-01 public document exposure is an API-owned issue. The newly identified student self-edit of parent destinations is primary SEC-API-01 in the API report; user_service.py:109-114 and workers/tasks.py:69-120 corroborate that path without duplicating it here.

## 3. Findings

### SEC-BUS-01 — Cross-user refresh produces a privileged access grant: service-level confirmation of BUS-01

**Impact: Critical. Category: OWASP API2 Broken Authentication / CWE-287. Review disposition: Critical:.**
**Owned locations:** backend/app/core/security.py:60-72; backend/app/services/auth_service.py:41-51,69-101.

**New evidence and realistic exploit:** The old report tested token generation. This audit executed the original login and refresh service methods with the original generator/HMAC functions and repository doubles matching the hash-only first-valid-row lookup. A synthetic administrator login was stored first, then a student login at the same frozen second; token equality was true and the student's refresh returned an access JWT whose subject was the administrator ID. This verifies the entire service resolution path, without claiming PostgreSQL ordering is guaranteed. Production exploitability is conditional on another account's valid colliding row being chosen: unordered first-row selection permits that choice. An attacker need not know the signing secret or victim ID; synchronizing their own issuance with another user's issuance supplies the same bearer credential. Critical remains appropriate for possible administrator impersonation, rather than a universally deterministic takeover of a selected victim.

**Source:** refresh issuance contains only exp/iat; AuthService.refresh ignores decoded identity and uses db_token.user_id. No subject or random jti can distinguish colliding sessions; token_hash is not unique in the read-only model context.

**Corrected proposal:** Add subject, token purpose and unpredictable jti, verify all three, and atomically consume exactly the stored credential bound to its subject. Illustrative issuance:

```python
def create_refresh_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({
        "sub": str(user_id), "type": "refresh", "jti": secrets.token_urlsafe(32),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)).timestamp()),
    }, settings.JWT_REFRESH_SECRET_KEY, algorithm="HS256")
```

Change every issuance call, including password recovery. In rotation, require type=refresh, parse/validate sub and jti, and use UPDATE ... WHERE token_hash=:hash AND user_id=:subject AND revoked_at IS NULL AND expires_at>:now RETURNING user_id. A unique hash constraint plus invalidation of legacy ambiguous credentials prevents residual collisions; keep consumption/new issuance in one transaction. Freeze time for multi-user issuance, same-second rotation and logout isolation; run separate-session replay tests against disposable PostgreSQL after authorization. Only the in-memory resolution trace was executed here.

### SEC-BUS-02 — SMTP STARTTLS accepts an unauthenticated server certificate

**Impact: High. Category: CWE-295 Improper Certificate Validation / CWE-319. Review disposition: Critical:.**
**Owned location:** backend/app/services/email_service.py:24-29.

**Problem and exploit:** server.starttls() supplies no SSLContext. Installed Python 3.12 smtplib.SMTP.starttls creates ssl._create_stdlib_context() when context is absent; the inspected context had verify_mode=CERT_NONE and check_hostname=False. Encryption therefore authenticates neither the issuing CA nor SMTP hostname. An on-path attacker able to intercept outbound SMTP can advertise STARTTLS, present an arbitrary certificate, receive server.login credentials, and receive verification/password-reset codes sent afterward. Those codes are login/recovery capabilities, so the impact extends beyond mail confidentiality. This requires network interception or a compromised route/DNS; it is not claimed remotely exploitable through arbitrary HTTP input.

**Exact source evidence:** `server.starttls()` immediately precedes `server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)` and `server.send_message(message)`. AuthService supplies actual verification/reset codes in message bodies.

**Corrected code:**

```python
with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
    server.ehlo()
    server.starttls(context=ssl.create_default_context())
    server.ehlo()
    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
    server.send_message(message)
```

Import ssl. Use a deliberately configured CA bundle if the organization requires a private CA; never turn verification off to make delivery pass. Proposed verification: controlled local SMTP fixtures with an untrusted certificate and trusted-but-wrong hostname must fail before AUTH or message transmission; trusted correct-host delivery must succeed. No SMTP connections were made in this audit.

### SEC-BUS-03 — Password recovery leaves previously stolen access tokens usable

**Impact: High. Category: CWE-613 Insufficient Session Expiration / OWASP API2. Review disposition: Required (no prefix).**
**Owned locations:** backend/app/services/auth_service.py:194-198,302-305; backend/app/core/security.py:47-54.

**Problem and exploit:** Setting/resetting the password changes password_hash and revokes refresh rows only. Access JWTs contain no session/password epoch. Read-only dependency context (core/deps.py:33-52) verifies signature/expiry and loads the current nondeleted user, with no credential-version check. An attacker holding an access credential from before the victim's successful recovery can continue acting as that account until its expiry, including privileged operations for a stolen staff credential. The default access lifetime is 30 minutes; this is a bounded continued-compromise window, not an indefinite session or a claim that logout must always revoke stateless JWTs. Unlike old BUS-05's reset-grant replay, this path needs no reset grant at all after recovery.

**Corrected proposal:** Increment a persisted auth_version on every password change/recovery, atomically with the password write and refresh revocation. Include that version in all access tokens and compare it with the already-loaded user in authentication:

```python
user.password_hash = await asyncio.to_thread(hash_password, new_password)
user.auth_version += 1
await self.revoke_all_user_tokens(user.id)
access_token = create_access_token(user.id, user.role, auth_version=user.auth_version)
```

Extend generator/DTO/model/migration deliberately; reject missing/old versions after rollout rather than silently accepting legacy credentials. The dependency should validate `payload["auth_version"] == user.auth_version`. Concurrent recovery should serialize/version the user update so older grants cannot win afterward. Proposed validation: issue access+refresh, perform successful recovery, assert both old credentials fail and the new pair succeeds, for student and privileged users. Source trace establishes the omission; no live recovery request was performed.

### SEC-BUS-04 — Financial posting can cross accounting-period closure without rechecking the policy

**Impact: Medium. Category: CWE-367 TOCTOU / OWASP API5 Broken Function Level Authorization. Review disposition: Required (no prefix).**
**Owned locations:** backend/app/services/finance_service.py:83-99,503-526,1597-1627.

**New path relative to BUS-02:** The previous concurrency finding concerned credit/refund totals. Here an accountant's payment reads an open (or absent) AccountingPeriod, an administrator closes that month and commits, then the already-authorized posting inserts/commits its payment dated into that now-closed month. No shared lock protects the check and closure; the close updates a different table than the ledger INSERT. The advertised rule rejects writes dated into a closed period, and sequential test_period_close_enforcement verifies that rule but cannot exercise this interleaving. This is a static reachable two-session trace, not an executed database race. It does not classify legitimate late payment settlement of an old obligation as forbidden.

**Corrected proposal:** Every posting takes a transaction-scoped shared advisory lock for its affected accounting month before checking status; close/reopen take the exclusive counterpart before looking up/creating/updating that month. This also covers absent period rows, where SELECT FOR UPDATE alone cannot lock a nonexistent row:

```python
period_key = year * 12 + month - 1
await db.execute(select(func.pg_advisory_xact_lock_shared(1701, period_key)))
await self._check_period_open(occurred_at)
```

For close/reopen use pg_advisory_xact_lock(1701, period_key), then read/change state. For void/refund lock both original/current month keys in deterministic sorted order. Retain all locks through commit, and apply the distinct BUS-02 student/account serialization to aggregate money mutations. This permits concurrent writers within an open month while closure waits for authorized in-flight work. Proposed separate-session test pauses posting after its initial check, closes concurrently, and verifies one serial order: posting completes before closure or observes closed and rejects; it must never commit as a post-close unchecked write.

## 4. What is done well

- Passwords use bcrypt cost 12; signed JWTs use fixed HS256 allowlists and separate refresh keys. Reset verification checks a dedicated token type; normal account authorization reads current deletion/role state.
- Finance routes restrict accountant/superadmin operations and refund/adjustment/closure are further restricted. Decimal money, append-only reversal history and ownership predicates on manual charge selection are useful defenses.
- Student journal detail narrows entry/summary reads to the requester; mentor mutations check current course ownership and archived status. Notification mark-as-read checks the owning user.
- ORM expressions parameterize values. Local storage strips basename/path characters and performs lexical containment; there is no established HTTP-created symlink attack path. This does not prove safety on an attacker-writable shared filesystem.
- Telegram verifies that a supplied contact belongs to its sender. Worker functions, settings, scoring and scheduling contain no independently verified new injection/secret flaw. Dependency advisories and infrastructure belong to group C.

## 5. Prioritized fixes and validation

| Priority | Action | Effort |
| --- | --- | --- |
| 1 | Replace ambiguous refresh identities, atomically consume identity-bound tokens, retire legacy credentials (SEC-BUS-01 / BUS-01). | M |
| 2 | Verify SMTP CA and hostname before AUTH/code delivery (SEC-BUS-02). | S |
| 3 | Add credential epoch and invalidate access grants on recovery (SEC-BUS-03). | M |
| 4 | Synchronize period policy and closure with shared/exclusive month locks; separately repair BUS-02 account races (SEC-BUS-04). | M |
| 5 | Execute adversarial certificate, recovery-revocation and concurrent PostgreSQL tests on disposable services after source fixes are authorized. | M |

S/M/L mean localized / several components / cross-layer redesign. Existing reset replay, public storage and parent-destination findings remain baseline/other-report priorities rather than invented new discoveries. No fixes were implemented.

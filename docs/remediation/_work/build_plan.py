from pathlib import Path
import json,re,hashlib,collections
ROOT=Path.cwd(); OUT=ROOT/'docs/remediation'
F={f['id']:f for f in json.loads((OUT/'_work/findings.json').read_text())}
W=[]
PREFIX={'s':'backend/app/services/','a':'backend/app/api/v1/','c':'backend/app/core/','m':'backend/app/models/','q':'backend/app/schemas/','r':'backend/app/repositories/sqlalchemy/','i':'backend/app/repositories/interfaces/','w':'backend/app/workers/','t':'backend/app/tests/integration/','script':'backend/scripts/','migration':'backend/alembic/versions/'}
def expand(x):
 if ':' in x:
  key,name=x.split(':',1)
  if key in PREFIX:return PREFIX[key]+name+('.sh' if key=='script' and name in {'setup_free_tier_vm','gcp_deploy'} else '.py')
 return x

def add(n,phase,slug,title,ids,files,steps,tests,accept,measure='',deps='',severity='Medium',effort='M',extra=''):
 w=dict(id=f'WP-{n:02}',number=n,phase=phase,slug=slug,title=title,findings=ids.split(),files=[expand(p) for p in files.split()],steps=steps.split(' || '),tests=tests.split(' || '),accept=accept,measure=measure,deps=[f'WP-{int(x):02}' for x in deps.split()],severity=severity,effort=effort,extra=extra)
 if phase not in (0,4):w['files'].append(f'backend/app/tests/integration/test_remediation_wp{n:02}.py')
 w['record']=f'docs/remediation/results/WP-{n:02}.md'
 w['files']+= [w['record'],'docs/remediation/STATUS.md']
 W.append(w)

add(1,0,'baseline','Record an isolated integration-test baseline','',
'docs/remediation/results/baseline-environment.md',
'Inspect test targets before importing the app: conftest hardcodes localhost:5432/imkon_test_db and imports Redis from app settings. Use an isolated disposable runtime/network where that PostgreSQL target belongs solely to this run; never repoint or stop an existing service to make room. || Set process-only TESTING=true, isolated REDIS_URL and a temporary STORAGE_PATH, plus synthetic required settings before collection; disable bytecode and direct pytest/cache/temp outputs to a disposable test workspace. Run the existing suite unchanged. || Record commit, versions, target identities without credentials, exact commands, exit codes and every failing test. Historical 100-pass onboarding is not this baseline.',
'Preflight must demonstrate that PostgreSQL schema deletion and Redis FLUSHDB can touch only this disposable runtime. || Run the existing backend integration suite and full backend suite; run frontend tests and typecheck as repository gates, recording existing failures without fixing them.',
'Baseline commands and actual results are recorded, or an explicit environment blocker is recorded. No original service data is modified.',
'Capture baseline suite duration and failure inventory; this is not a load benchmark.',severity='Baseline',effort='S',extra='No runtime/source edits in this WP. The future test runner may create isolated disposable services; this planning session does not execute it. Safety isolation is required even before WP-09 permanently fixes fixtures.')
add(2,0,'critical-reproductions','Add executable Critical regression reproductions','',
'backend/app/tests/regression/critical_reproductions.py',
'Use the isolated WP-01 runtime and shared fixtures. Put named pytest tests in critical_reproductions.py, which is explicitly invoked and intentionally outside default test_*.py collection. || Freeze token time and exercise two users through login/refresh; fetch private document bytes anonymously and as another student; synchronize two PostgreSQL sessions before allocation/refund reads using barriers, never timing sleeps. || Assert desired secure behavior so the current defects fail. Record baseline failures and selectors. Keep this test-only PR visibly red for these explicit cases; do not use skip, xfail or broad status alternatives.',
'test_refresh_cross_user_same_second: distinct credentials and correct access subject. || test_private_document_download: anonymous/other-owner cannot obtain bytes via returned legacy storage URL. || test_concurrent_allocation and test_concurrent_refund: aggregate allocated/refunded value never exceeds charge/payment, including two independent committed sessions.',
'Four reproducible failures are explained and reproducible on the baseline; tests are not described as passing or remediation complete. Fix PRs invoke their exact selector; WP-07 runs the entire reproduction module after the three root causes are fixed.',deps='1',severity='Baseline',effort='M',extra='References for test design: BUS-01/SEC-BUS-01, API-01 and BUS-02. Finding ownership remains exclusively with WP-03, WP-04 and WP-07. A baseline test PR can be reviewed/merged with explicit expected failing evidence because normal suite collection is unchanged; no claim of a fully green security regression suite is allowed.')
add(3,1,'refresh-identity','Make refresh credentials unique and atomically single-use','BUS-01 SEC-BUS-01 DATA-04',
'c:security s:auth_service m:refresh_token i:refresh_token_repository r:refresh_token_repository migration:rwp03_refresh_identity',
'Issue a random jti plus subject and refresh type; validate purpose/subject and update every issuance path. || Replace lookup-then-revoke with identity-bound conditional UPDATE RETURNING in the same transaction as successor insertion; require one winner. || In a forward migration invalidate ambiguous legacy credentials and resolve duplicate legacy hashes before adding uniqueness. Never guess which colliding user owns an old token.',
'Run WP-02 same-second test before fixing. Add same-user rotation, two-user logout isolation, malformed purpose/subject, expired credential and two-session replay cases. || Assert failed rotation rolls back consumption and successful concurrent rotation issues exactly one successor.',
'No cross-user resolution; distinct same-second credentials; exactly one successful consume; all issuance sites updated and migration rehearsed.',deps='2',severity='Critical',extra='Legacy sessions must sign in again. Rollback must not restore identity-free tokens; roll forward or keep refresh disabled. Keep access-token format work limited to what refresh needs.')
add(4,1,'private-downloads','Protect private document bytes and revoke public paths','API-01',
'backend/app/main.py a:documents s:document_service s:storage_service q:document frontend/src/lib/documents/endpoints.ts frontend/src/lib/documents/types.ts frontend/src/components/documents/DocumentsTab.tsx CONTRACT.md',
'Replace whole-tree StaticFiles with explicit public avatar/course-asset mounts. Add an authenticated document-ID download that enforces current role/object policy and excludes deleted records before opening bytes. || Return private/no-store headers and stop public cache headers on private paths. Keep GCS objects private; do not return permanent public bucket URLs. || Update browser downloads to authenticated fetch/blob with prompt URL revocation, or a short-lived authorized private URL. Document purge/expiry of historical public cache copies as an operational follow-up.',
'Run WP-02 private-document test first. Seed two owners and deleted documents; test direct old storage URL, anonymous, wrong owner, authorized owner/staff, path traversal and private cache headers. || Exercise browser download without placing bearer credentials in URLs; public avatar/course images still work.',
'No unauthenticated private bytes from old or new URLs; canonical role policy applies to bytes; browser flow and response contract stay synchronized.',deps='2',severity='Critical',extra='Current listing permits mentors to see student documents broadly (document_service.py:138-145). Do not silently infer a new mentor-document policy from directory scope; stop for a specific policy decision if changing that behavior is necessary. Keep private files unavailable during rollback; cached external copies cannot be revoked by an application code revert.')
add(5,1,'cron-authorization','Fail closed for scheduler authentication','API-03',
'a:cron',
'Centralize a router dependency that rejects absent/empty configured secrets and absent/wrong headers. || Use constant-time comparison for configured credentials and preserve the existing route contract; unavailable configuration must never open maintenance actions.',
'For both cron routes test unset, empty, absent header, wrong header and correct secret before implementation; spy that unauthorized requests never invoke jobs.',
'Only authenticated scheduler calls invoke maintenance; no configuration-dependent bypass.',deps='2',severity='Critical',effort='S')
add(6,1,'onboarding-scope','Keep setup tokens restricted throughout their lifetime','API-02',
'c:deps c:security a:auth s:auth_service',
'Validate a typed principal including purpose/scope and strictly parse subject claims. Default authenticated routes reject setup-only scope and users awaiting setup. || Give set-password an explicit setup dependency; retain purpose validation for reset tokens and ensure an old setup JWT stays restricted after the database flag changes.',
'Before fixing, use restricted tokens for student, mentor and superadmin against ordinary endpoints; complete setup then reuse the original token. Test malformed claim types and valid full tokens.',
'Setup flow succeeds only on its allowed endpoint; restricted tokens never inherit normal privileges, before or after setup.',deps='3',severity='Critical')
add(7,1,'ledger-serialization','Serialize financial writers on a stable account row','BUS-02',
's:finance_service s:enrollment_service m:ledger migration:rwp07_ledger_serialization',
'Add a single transaction-scoped account/student row lock before balance/availability reads for payment, allocation, discount, adjustment, refund, void, schedule generation and withdrawal. Lock multiple accounts in sorted order and retain locks through commit. || Re-read aggregates after acquiring the lock; do not commit early or lock only newly inserted allocation rows. Add one-void-per-payment database protection with duplicate preflight. || Preserve append-only reversal history and Decimal invariants; audit every mutation entrance including nested enrollment calls.',
'Run both WP-02 ledger races before fixing using independent committed sessions. Add concurrent allocation-to-same-charge, allocation-from-same-credit-to-different-charges, refund/refund and void/void races. || Assert aggregate balances, charge status, audit rows and rollback after timeout/cancellation; independent students can progress concurrently.',
'All financial mutation entry points share serialization; no over-allocation/over-refund/double void; the full WP-02 reproduction module now passes.',
'Measure lock wait and transaction p95 for 1/10 same-student versus different-student writers; correctness is mandatory regardless of throughput.',deps='3 4 2',severity='Critical',extra='Do not infer safety from sequential tests or SQLite. Keep financial mutations disabled rather than revert to unlocked writers if rollout fails. SEC-BUS-04 month closure gets its distinct lock protocol in WP-36.')
add(8,1,'reversal-eligibility','Reject refunds after a payment has been voided','BUS-03',
's:finance_service',
'Under the account lock introduced by WP-07, centralize payment reversal eligibility and check prior VOID before accepting REFUND. || Preserve both supported cash-out and wallet refund semantics and refuse any invalid reversal without ledger/allocation/audit changes.',
'Before fixing, exercise void-then-refund and refund-then-void, partial/full refunds and a concurrent void/refund pair; assert exact money totals and unchanged rejected transactions.',
'A voided payment cannot refund in either sequential or concurrent execution; existing permitted lifecycle tests pass.',deps='7',severity='Critical',effort='S')
add(9,1,'test-isolation','Make test database and Redis cleanup explicitly disposable','DATA-02',
'backend/app/tests/conftest.py',
'Validate dedicated test PostgreSQL and Redis targets before application imports or destructive fixture execution. Never derive test Redis from the ordinary runtime fallback. || Replace unrestricted FLUSHDB with run-owned key cleanup on a dedicated disposable connection and ensure API-only tests get the same cleanup. Inject both request and worker database factories consistently.',
'Before fixing, a fake production/shared target must be rejected before any delete/flush/drop call. Test client-only cleanup, failure cleanup and a sentinel key belonging to another namespace. || Use subprocesses to verify configuration is applied before module import; do not test safety by flushing a real shared database.',
'Tests cannot erase application/shared Redis state; target guards cover PostgreSQL schema deletion and all fixture variants.',deps='1',severity='Critical',extra='Run the WP-01 suite baseline in isolation before changing fixtures, then rerun after. Keep infrastructure safety tests independent of destructive fixture setup where necessary by launching controlled subprocesses.')
add(10,1,'reset-safety','Guard destructive reset tooling and remove fixed credentials','DATA-01',
'script:clean_db script:seed_demo_data script:reset_guard',
'Introduce an explicit disposable-target guard shared by both scripts; refuse production, require --reset plus expected database/storage identity and offer dry-run without secrets. || Remove fixed privileged passwords and credential logging; generate a one-time credential requiring change or use secure interactive provisioning. || Stage downloadable assets before reset and make database reset/seeding transactional where feasible; constrain storage deletion to an explicit disposable root.',
'Before fixing, run scripts with DB/filesystem doubles and verify production, missing flag, wrong target and unsafe storage fail before any side effect. Inject seed/download failure and validate retained original state or documented bounded recovery.',
'No default invocation truncates data, no fixed privileged credential remains, and dry-run reveals only safe target metadata.',deps='2',severity='Critical')
add(11,1,'configuration-contract','Make fresh URL-only deployments and migrations boot reproducibly','DATA-03',
'c:config backend/alembic/env.py backend/.env.example .github/workflows/deploy-backend.yml',
'Make DATABASE_URL canonical; remove redundant mandatory split PostgreSQL fields or construct the URL only when absent. || Give Alembic database-only configuration without importing SMTP/Telegram/JWT settings. || Validate the shipped production variable-name set with synthetic values and require a public HTTPS webhook URL when Telegram is enabled; make the enablement rule explicit.',
'Before fixing, instantiate configuration with only workflow-provided names and no .env; reproduce missing-field failure. Test missing DATABASE_URL, database-only Alembic initialization, and enabled Telegram with localhost webhook.',
'A fresh image boots with documented settings and migrations need only database configuration; secret values never enter tests/results.',deps='2',severity='Critical')
add(12,2,'smtp-tls','Verify SMTP certificates and bound socket operations','SEC-BUS-02',
's:email_service',
'Pass ssl.create_default_context to STARTTLS before AUTH and preserve post-TLS EHLO. || Configure a finite SMTP socket timeout, keep thread offload, and expose meaningful safe errors. Never disable verification for private CAs; use a deliberately configured trust bundle.',
'Test untrusted CA and trusted wrong-host certificates fail before AUTH/body; trusted correct-host delivery succeeds. A controlled stalled socket reaches the timeout without hanging the suite.',
'SMTP authenticates the server before transmitting credentials/codes; each socket operation has a finite budget.',
'Record timeout behavior and active thread counts. Full removal of mail from DB transactions is WP-18.',deps='9',severity='High',effort='S')
add(13,2,'redis-trust','Secure the Redis boundary and unify ARQ DSN handling','SEC-DATA-01 DATA-06',
'script:setup_free_tier_vm c:redis w:settings backend/.env.example backend/config/redis.conf.example',
'Publish only loopback for colocated clients or an explicit private interface with authorized VPC ingress for remote clients; never leave all-interface unauthenticated publication. || Document/provision Redis ACL and TLS consistently without printing credentials. Parse REDIS_URL once for app, producer and worker, preserving database/password/TLS. || Treat Redis writers as trusted job submitters. If switching from pickle to a data-only codec, drain/version the queue and test all payload types; network/ACL isolation is the required first control, serializer change is defense in depth only.',
'Parse synthetic nondefault database/auth/rediss URLs in producer and worker. In an isolated network assert unauthorized connection/commands fail and authorized harmless jobs reach the intended worker. Check shell commands never publish a public URL.',
'Redis is private/authenticated and the worker and producer use the same secure endpoint. Record firewall verification limits; do not claim an uninspected cloud firewall is fixed.',deps='11',severity='High')
add(14,2,'build-exclusions','Keep private uploads out of build uploads and image layers','SEC-DATA-02',
'backend/Dockerfile backend/.dockerignore backend/.gcloudignore script:gcp_deploy',
'Remove COPY storage and create empty writable runtime directories. Exclude uploads and seed caches from both Docker context and the Cloud Build upload context (.gcloudignore). || Build from a disposable context containing a harmless sentinel and inspect sent files plus all image layers. Inventory potentially affected historic artifacts through an operator procedure; do not delete artifacts without the required release owner decision.',
'Ensure sentinel uploads never appear in gcloud upload listings, Docker context or exported image layers; image boot and normal private upload/download smoke checks succeed.',
'No operational upload enters either remote build artifacts or runtime images. Historical cleanup is tracked with owner/evidence rather than claimed complete.',deps='4',severity='High',effort='S')
add(15,2,'guardian-binding','Close guardian property bypasses and bind the correct parent contact','SEC-API-01 BUS-17',
'q:user s:user_service backend/app/telegram_bot/handlers/start.py frontend/src/lib/users/types.ts frontend/src/lib/users/formMapping.ts CONTRACT.md',
'Remove guardian chat/phone from ordinary self-update schema and assignments while preserving authorized administrator provisioning. || Match bot contact to the configured parent_phone, verify sender ownership and private chat, and refuse replacement of an existing binding unless an administrator explicitly resets it. || Normalize lookup consistently; document safe initial-binding/rebinding behavior. A new invitation product is not required for this bounded fix.',
'Student PATCH guardian fields fails and leaves destination unchanged; distinct student/parent phones bind only the parent; group chat, foreign contact and unauthorized replacement fail. Shared-parent siblings bind to the verified destination under the explicit policy.',
'Only the configured verified guardian destination can receive results; student self-service cannot replace it.',deps='6 9',severity='High')
add(16,2,'mentor-directory','Restrict student directory count and results to mentor ownership','SEC-API-02',
'a:students s:user_service r:user_repository i:user_repository',
'Derive mentor_id from the authenticated principal, never the request; pass it through service/protocol to the repository. || Apply the same nondeleted-course/enrollment ownership predicate to count, search and page queries. Preserve administrator/accountant directory access and explicitly state withdrawn-enrollment policy.',
'Seed two mentors, unrelated students and parent contacts. Test own-course results, unrelated search/total exclusion and a mentor with zero courses.',
'No unrelated student or parent PII leaks through items, search or total counts.',deps='15',severity='High')
add(17,2,'recovery-revocation','Make password recovery single-use and invalidate old access','SEC-BUS-03 BUS-05',
'c:security c:deps s:auth_service m:user migration:rwp17_auth_version',
'Add persisted auth_version and require it in newly issued access and reset grants. Lock/version the user during reset confirmation and increment the epoch atomically with password change and refresh revocation. || Bind reset grant to subject, purpose, expiry and current epoch; only one concurrent reset may match and advance that epoch. Update all token issuance paths and reject legacy/missing epochs after the coordinated cutover.',
'Before fixing, replay a valid reset grant and use a pre-recovery access token. Test concurrent confirmations, rollback, privileged/student accounts and successful new access/refresh pairs.',
'One reset grant cannot change the password twice; all prior access and refresh credentials fail after recovery commits; rollback cannot consume the only usable recovery state.',deps='3 6',severity='High',extra='This merges two defects under one credential-epoch root cause without introducing a second reset storage system. Expect reauthentication during rollout; do not roll back by accepting old epochs.')
add(18,2,'mail-outbox','Deliver verification mail after its business transaction commits','PERF-BUS-01',
's:email_service s:auth_service s:user_service m:outbox_event backend/app/models/__init__.py s:outbox_service w:outbox w:settings migration:rwp18_outbox',
'Add a narrow durable outbox row and bounded claiming worker. Insert mail intent within the user/reset transaction; do not await SMTP while it holds a DB checkout. || Dispatch only committed intents with finite attempts, claim lease, socket deadlines and code-expiry/queue-age checks. Ensure verification state is valid before sending and rolled-back user creation cannot emit a usable invitation. || Protect transient recovery-code payloads, avoid logging them and remove expired/delivered sensitive payloads; retain only safe delivery metadata. Keep this PR limited to mail plus the reusable outbox primitive.',
'Rollback user creation emits no mail; crash/retry cannot lose the intent; expired codes are never sent. Fault-inject connect/read stalls and verify unrelated request work does not retain a mail-dependent transaction. Test claim cancellation and finite retries.',
'HTTP business commit completes independently of remote SMTP; no DB transaction is held throughout a stalled send; outbox delivery/retry/expiry semantics are explicit.',
'At 1/10/30 mail requests compare DB checkout hold/wait, active threads, queue age and unrelated p95/p99 against WP-01 baseline under identical controlled stalls.',deps='12 13 17',severity='High',extra='Additive migration; a worker rollback leaves durable intents pending, never falls back to synchronous sends inside transactions. Keep this a mail-only vertical slice; notification producers join in WP-29.')
add(19,2,'analytics-generation','Replace precommit cache scans with transactional generations','PERF-BUS-03',
's:finance_service s:enrollment_service m:cache_generation backend/app/models/__init__.py migration:rwp19_cache_generation',
'Advance a durable finance generation in the same transaction as every affected payment/allocation/reversal/schedule/withdrawal mutation. || Read the committed generation for analytics keys; old generations expire by TTL. Remove full Redis SCAN invalidation and ensure old computations publish only to their own generation. || Keep the generation write short and measure contention; do not perform remote Redis work while holding account locks.',
'Pause reader before writer commit and after generation read; verify no stale result populates the new generation. Rollbacks do not advance visible generation; enrollment and withdrawal invalidate relevant results.',
'Committed finance changes have a defined freshness boundary; no mutation scans unrelated Redis keys; stale old-key computations cannot overwrite current analytics.',
'Compare SCAN count (target zero), transaction/lock duration and Redis CPU while unrelated keyspace grows; measure contention on generation row. This is required groundwork for the High stampede fix.',deps='7 8',severity='Medium',extra='Contribution to BUS-11 closure, uniquely owned by WP-29. A global generation row may serialize writes; if measured contention exceeds the budget, stop and propose a partitioned or outbox design rather than silently broadening this WP.')
add(20,2,'analytics-coalescing','Coalesce identical analytics misses across instances','PERF-BUS-02',
's:finance_service s:analytics_cache_service',
'Wrap exact generation/date-key recomputation in a Redis lease with random owner, finite expiry, compare-and-delete release, cancellation cleanup and bounded waiter jitter. || Recheck cache after acquiring the lease; set results only under the observed generation. Define timeout behavior explicitly and preserve Decimal-derived financial values.',
'Two processes making 30 identical cold requests produce one recomputation in the controlled normal lease lifetime. Test leader failure, expired lease, cancellation, distinct keys and writer generation change.',
'Identical misses are coalesced without unbounded waits or stale-generation publication; financial response values are equivalent.',
'Count actual SQL calls/recompute winners at 1/10/30 requests, pool wait, transferred rows/RSS and p95/p99; source baseline is 13 SELECT sites per cold computation, not measured production latency.',deps='19 13',severity='High')
add(21,2,'autosave-transactions','Batch audit writes and translate the full journal conflict boundary','BUS-13 PERF-BUS-05',
's:journal_service s:audit_service s:sum_calculation_service c:deps',
'Make audit construction stage rows without unconditional flush or swallowing session-invalidating errors. || Wrap entry mutation, recalculation, flush and request commit conflict translation in rollback-to-409 handling. Recalculate only affected students and preserve partial-conflict/version contracts. || Avoid per-cell flushes and no-op whole-journal recalculation; retain every required audit record.',
'Two independent sessions edit same entry and different entries sharing a summary; force conflict during audit flush, summary flush and commit. Assert 409 rather than failed-session 500 and verify applied/conflict response versions.',
'Autosave preserves audit/version semantics; all optimistic conflicts are translated with rollback; flush count is bounded by batch stages, not changed-cell count.',
'Instrument flush invocations separately from SQL executions for 1/10/100 changed cells and no-op replay; compare transaction p95 and exact audit rows. Baseline K+2 is a flush-invocation model.',deps='17',severity='Medium (promoted to Phase 2)',extra='Scheduled early at the user’s explicit request despite source performance impact Medium. Avoid catching arbitrary DB errors as version conflicts.')
add(22,2,'auth-budgets','Make authentication limits atomic and success-independent','API-04 DATA-05 PERF-API-03',
'c:rate_limiter a:auth',
'Use one atomic Redis threshold/increment/TTL operation and explicit window semantics. || Add resend cooldown before code generation plus account/client/aggregate work budgets; preserve failed-login lockout separately from a budget that successful login never clears. || Trust client identity only from configured ingress; return accurate Retry-After and keep failure closed on limiter errors.',
'Concurrent requests at limit-1 cannot all pass. Repeated resend does not overwrite code/send mail. The 31st synthetic successful login at the configured example 30/minute budget is denied, while failed-login behavior remains correct.',
'Budgets hold across processes and success does not erase capacity limits; retry headers and code cooldown are deterministic.',
'Measure throttled/accepted counts, login p95, unrelated loop lag and refresh insert rate; calibrate limits with legitimate traffic rather than enshrining example values.',deps='13 17',severity='High (remediation priority)')
add(23,2,'atomic-challenges','Atomically count and consume verification/reset codes','BUS-06',
's:auth_service c:verification_codes',
'Implement atomic compare, attempt count and single-use consume for both code namespaces using a typed Redis result. Preserve TTL and maximum attempts. || Integrate without resetting cooldown/capacity keys; define recovery if DB work fails after consumption and never issue multiple grants from one code.',
'Five concurrent failures exhaust exactly the intended budget; simultaneous correct submissions issue at most one grant; expiry, malformed state and Redis error do not authorize.',
'No lost attempt increments or duplicate consumption in real disposable Redis concurrency tests.',deps='18 22',severity='High (remediation priority)')

(OUT/'_work/work-packages.json').write_text(json.dumps(W,indent=2))
print('Stage 2 checkpoint:',len(W),'work packages saved; remaining Phase 3/4 definitions follow.')
add(24,3,'money-invariants','Validate persisted money and generate positive installments','API-08 BUS-16',
'q:common q:payment q:ledger q:course s:finance_service CONTRACT.md frontend/src/lib/finance/types.ts frontend/src/lib/courses/types.ts',
'Use one positive two-decimal Numeric(10,2)-compatible input type across payment/refund/discount/adjustment/allocation/course price inputs. || Generate schedules using integer-cent quotient/remainder. Reject prices smaller than installment count in cents with a clear validation/business error before any writes; preserve total price exactly.',
'Subcent, three-place, maximum, overflow and tiny-price/many-month cases fail or succeed at the specified boundary; all generated charges are positive and sum exactly to contract price.',
'Valid requests cannot fail because of unvalidated money precision/range; no zero/negative installment is inserted.',deps='8',severity='Medium')
add(25,3,'immutable-storage-keys','Make upload keys unique and deletion independent','BUS-04',
's:storage_service s:document_service s:user_service s:course_service',
'Generate immutable UUID/object keys for both local and GCS writes while retaining original filename metadata. || Stage replacement images under new keys; remove previous objects only after successful DB commit through the established outbox or an explicitly durable cleanup intent. Preserve legacy object resolution.',
'Two identical filenames under one owner and across journals retain distinct bytes; deleting one preserves the other. Failed replacement leaves old photo/document usable and eventually removes orphan staged objects.',
'Uploads never overwrite another document by filename; replacements and deletes have documented transaction/cleanup behavior.',deps='4 18')
add(26,3,'storage-injection','Use the configured storage backend across API and workers','BUS-14',
's:storage_service s:document_service s:user_service s:course_service c:deps a:documents a:users a:courses w:tasks w:settings',
'Inject the configured StorageService into constructors and FastAPI dependency factories; remove direct local constructors from upload paths. || Add a backend-neutral stream/download interface for worker attachments and private authorized URL creation, avoiding private filesystem helpers. || Test both local and fake object storage; keep private objects inaccessible through permanent public URLs.',
'Upload on API instance A and download/send on instance B using shared object-store double; local compatibility, deleted objects and denied access remain correct.',
'GCS configuration selects GCS everywhere and separate workers can read permitted attachments without local disk assumptions.',
'Compare bounded memory for streamed attachments and connection cleanup; no unmeasured throughput claim.',deps='25 13')
add(27,3,'webhook-lifecycle','Give Telegram webhook registration one deployment owner','API-05',
'backend/app/main.py script:register_telegram_webhook',
'Remove unconditional global webhook deletion from instance shutdown and close only the local bot session in finally. || Add an explicit idempotent deployment/admin registration command with configuration validation and useful safe logging; document how the release owner invokes it once.',
'Two overlapping lifespans: closing either must not remove webhook for the survivor; cancellation/startup failure closes local resources; registration failure is observable.',
'Rolling deploy/scale-down cannot unregister another instance’s shared webhook.',deps='4 11',effort='S')
add(28,3,'webhook-errors','Make Telegram acknowledgements reflect successful processing','API-06',
'a:telegram',
'Separate malformed JSON/update validation from transient processing failures; respond 400/422 for bad input and retryable 5xx for operational errors. || Keep existing secret verification and avoid logging sensitive update bodies; ensure retried contact updates remain idempotent.',
'Invalid JSON, invalid update schema, controlled DB failure and successful retry have precise status codes and no duplicate state changes.',
'A failed handler is never acknowledged as successful; valid processing retains 200.',deps='15',effort='S')
add(29,3,'notification-outbox','Publish notification intents only after committed business changes','BUS-11 PERF-BUS-04',
's:journal_service s:document_service s:outbox_service w:outbox w:tasks',
'Reuse WP-18 outbox for journal-result/document intents in the same transaction as business rows. Remove direct precommit enqueue and request-local create_pool calls. || Dispatch with the lifecycle-owned producer and stable intent IDs, preserving retry after Redis failure; consumers read committed versions. || Close BUS-11 only after WP-19 proves commit-safe finance/enrollment generation changes too.',
'Pause worker ahead of request commit; no uncommitted score/document is sent. Rollback emits no event. Redis failure preserves intent and retry; repeated uploads do not create per-request ARQ pools.',
'Notifications see committed business state; no silent lost enqueue; the full BUS-11 job and cache scope is covered by this WP plus completed WP-19.',
'Measure U uploads against producer creation count (one process-owned producer), connected clients and transaction duration; shutdown returns clients to baseline.',deps='18 19 21 26')
add(30,3,'delivery-claims','Claim notification delivery and record actual outcomes','BUS-08 BUS-09',
's:notification_service m:notification_log w:tasks migration:rwp30_delivery_claims q:notification CONTRACT.md frontend/src/lib/notifications/types.ts',
'Use one delivery owner with atomic revision claim, lease and claim token. Carry notification ID into the task and finalize only the owning claim. || Represent queued/inflight separately from SENT; SENT follows Telegram success, permanent error follows FAILED. Recover expired leases with finite attempts. || Document at-least-once behavior for crash-after-send because Telegram offers no general idempotency key; do not promise exactly-once transport.',
'Two workers retry a FAILED/revised row: one valid claim sends. Enqueue success followed by Telegram failure records FAILED; abandoned claims retry and stale owners cannot finalize.',
'Logs report delivery rather than enqueue; concurrent claim races are controlled and residual remote ambiguity is documented.',deps='29')
add(31,3,'exam-notification-identity','Separate sibling notifications and document revisions','BUS-10',
'w:tasks s:notification_service m:notification_log migration:rwp31_exam_revision',
'Key exam notifications by student summary or explicit student+journal identity rather than journal alone. || Persist a revision fingerprint including score/summary version and document identity; safely migrate/retire legacy idempotency identities without resending all history.',
'Siblings sharing chat and score each receive their own result; same revision deduplicates; new document with unchanged score triggers one correct attachment; retry remains safe.',
'No sibling suppression/misattribution and document-only revisions are delivered once per claim semantics.',deps='30')
add(32,3,'ledger-reminders','Select due ledger balances and honor notification switches','BUS-07 BUS-18',
'w:tasks s:settings_service r:payment_repository i:payment_repository',
'Replace retired Payment-table/month-total logic with a bounded due-Charge query subtracting active allocations and excluding cancelled/withdrawn obligations under policy. || Map payment/debt switches to notification types and check them before enqueue/claim/send; reuse a typed repository query rather than duplicate ledger math. || Batch selection by due date/ID so work does not issue queries per student/enrollment.',
'Fully paid, partial, discounted, refunded and withdrawn enrollments produce exact reminders; both disabled switches prevent enqueue/send/SENT logs. Query counts stay bounded as students increase.',
'Reminders reflect current ledger balances and organization policy; disabled notifications do not send.',
'Measure SQL count/rows and RSS for 10/100/1000 eligible enrollments; batch work grows with batches, not nested student/enrollment queries.',deps='31 8')
add(33,3,'grading-state','Represent actual grading separately from precreated rows','BUS-12 DATA-07',
'm:journal_entry m:journal_student_summary s:enrollment_service s:journal_service s:sum_calculation_service r:user_repository migration:rwp33_grading_state',
'Introduce explicit touched/graded state that distinguishes untouched rows from intentional zero/absence; set it in grading commands, including a deliberate zero update whose score values did not change. || Define period completion and summary grading from that state; apply to profile counts/averages/history and future periods, preserving positive maxima as denominators only. || Backfill only provable prior edits using available audit evidence; do not invent grading history from positive maxima or scores alone. Record ambiguous legacy rows for review.',
'Untouched enrollment is empty; one edit partial; intentional zero counts as graded; full grid complete; future periods excluded. Exact counts/means/ranks, not shape-only assertions.',
'All owned consumers use explicit grading evidence; no precreated zero row or positive denominator is mistaken for a completed grade.',deps='21 29 24',extra='One grading-state root cause spans models and consumers. Do not change API shapes in this package; existing state strings remain. If legacy evidence cannot recover a zero-grade distinction, report that limitation and preserve an explicit unknown state internally.')
add(34,3,'course-progress','Unify chart cohorts and make summary grouping linear','API-07 PERF-API-01',
'a:courses s:course_progress_service r:course_progress_repository q:course_progress CONTRACT.md frontend/src/lib/courses/types.ts',
'Extract the existing chart operation into a typed CourseProgressService/repository result with one active/historical cohort and explicit graded-period denominator. || Return an absent rank for students outside the ranked cohort instead of class_size+1; coordinate nullable type in the client contract. || Index retained summaries once by journal/student so grouping is O(S+J), preserving privacy; this fixes computation, while request range/roster bounds are WP-58.',
'Use missing/zero-max/untouched-positive-max/graded-zero periods and withdrawn students. Assert identical policy for staff/student means, valid ranks, and no peer identities in student response. Instrument summary-ID reads.',
'Exact cohort/mean/rank tests pass; repeated J×S scans are removed without broadening data visibility.',
'At 30/300 students and 52/104 periods measure summary inspections, response bytes, query count, loop lag/RSS/p95 under equal conditions. No timing gain is assumed.',deps='33')
add(35,3,'autosave-bounds','Bound autosave bodies, comments and unique cells','SEC-API-04 PERF-API-02',
'a:journals q:journal backend/app/main.py frontend/src/lib/journals/types.ts frontend/src/lib/journals/useJournalAutosave.ts CONTRACT.md',
'Validate a documented finite batch size, unique student/date keys and finite comment length; reject conflicting duplicates rather than select an arbitrary winner. || Enforce a route-specific pre-JSON body-byte cap including chunked requests, with 413 and no unbounded buffering. Align frontend batching to accepted capacity without changing partial-conflict semantics.',
'1/100/maximum legitimate unique cells succeed; duplicate keys, maximum+1 and oversized comments fail before service work. Chunked body over cap is rejected and ordinary uploads remain supported.',
'Request/response amplification is bounded; accepted partial/no-op batches preserve versions and conflict behavior.',
'Measure bytes, peak RSS, output cardinality, loop lag and autosave p95 at fixed fixture sizes before/after.',deps='21 27')
add(36,3,'period-serialization','Serialize accounting closure with posting policy checks','SEC-BUS-04',
's:finance_service',
'Use transaction-scoped shared month locks for posting and exclusive month locks for close/reopen, including an absent period row. Lock all affected original/current months in sorted order. || Document and enforce one global order with WP-07 account locks; no path may acquire them in the reverse order. Retain through commit and recheck period status after locking.',
'Barrier-controlled posting/closure and absent-month creation races produce a serial outcome; void/refund across months does not deadlock. Legitimate late settlement of an old obligation remains permitted under existing rules.',
'No unchecked posting commits across a completed closure; lock ordering and bounded rollback behavior are verified.',
'Measure same-month/different-student throughput, close wait and deadlock/timeout rates in disposable PostgreSQL.',deps='7 24')
add(37,3,'installment-identity','Enforce active tuition installment uniqueness','DATA-09',
'm:charge s:finance_service migration:rwp37_installment_identity',
'Preflight duplicate active tuition installments and stop for explicit reconciliation; never delete debt silently. || Add a partial unique identity on enrollment/sequence for the intended active tuition domain; keep generation under the stable account/enrollment lock and handle uniqueness races by reading the winning schedule.',
'Two sessions generating the first schedule produce one set; repeat generation is idempotent; other allowed charge types do not collide. Existing balances remain unchanged by migration.',
'Persistence prevents duplicate receivables and generation retries do not duplicate installments.',deps='36')
add(38,3,'seed-identities','Keep demo course IDs and sequences consistent','DATA-08',
'script:seed_demo_data',
'Prefer generated course IDs and map seed-definition IDs to persisted IDs for photo, enrollment and finance references; alternatively synchronize sequences within the seed transaction. || Keep WP-10 disposable-target controls intact.',
'Seed a disposable database then create an ordinary API course; ID is unique and all seeded references resolve. Re-run the seed only through the explicit reset guard.',
'First ordinary course creation after seeding cannot collide with a seeded ID.',deps='10',effort='S')
add(39,3,'profile-ranking','Compute student ranks in one partitioned query','DATA-10',
'r:user_repository',
'Aggregate by course/student once and rank through a partitioned SQL window before selecting the requesting student. || Preserve WP-33 grading/cohort semantics with an explicit tie rule and deterministic ordering; avoid materializing all class IDs per course.',
'Profiles across 1/10/100 courses have constant query-count growth for ranking; equal-score ties, zero grades and missing periods match specified results.',
'No sequential rank query per course; exact rank and authorization behavior preserved.',
'Compare SQL count, returned rows, buffers and p95 on identical seeded rosters; source baseline adds one query per course.',deps='33 16')
add(40,3,'journal-history','Page student journal history with a stable cursor','DATA-11',
'r:user_repository i:user_repository a:students q:user frontend/src/lib/users/types.ts frontend/src/lib/users/endpoints.ts frontend/src/lib/users/hooks.ts frontend/src/pages/StudentProfile.tsx CONTRACT.md',
'Add a capped page operation ordered by period_start DESC,id DESC; retrieve summaries only for that page and authorize enrollment before paging. || Add an explicit versioned/paged endpoint and migrate the client; retire or strictly bound the legacy unbounded path in the same PR, without silent truncation. Keep contract and client behavior aligned.',
'Tied dates across pages have no duplicates/skips; unauthorized course filters fail; history size never increases one-page result/IN-list size beyond cap.',
'No supported history path materializes a student’s full lifetime; navigation and response types are synchronized.',
'Measure fetched rows, SQL parameters, response bytes and RSS at 100/10k periods with a fixed page cap.',deps='39',extra='If a legacy consumer outside the repository prevents retirement, stop and obtain an explicit compatibility schedule; do not leave the finding falsely closed.')
add(41,3,'student-mentor-card','Return only authorized mentor information to students','SEC-API-03',
'a:mentors q:user frontend/src/lib/users/types.ts frontend/src/pages/MentorProfile.tsx CONTRACT.md',
'Keep the enrollment existence guard but return a dedicated student mentor card or strictly enrolled-course projection. || Exclude unrelated courses and private contact/parent/DOB fields; staff responses retain their permitted complete shape. Update discriminator/union handling deliberately.',
'Student enrolled only in A cannot learn B via mentor profile; forbidden contact fields absent even when populated; authorized mentor/admin profile still works.',
'Student profile responses cannot bypass direct-course authorization or leak unneeded personal properties.',deps='40',effort='S')
add(42,3,'migration-gates','Test the migration chain and fail deployment on migration errors','DATA-13 PERF-DATA-03',
'.github/workflows/deploy-backend.yml script:gcp_deploy backend/app/tests/migrations/test_migration_chain.py docs/remediation/results/migration-runbook.md',
'Add a separate disposable migration job for empty-to-head and prior-revision-to-head with representative data/constraints; keep it independent from metadata.create_all tests. || Make missing migration credentials, migration failure and unavailable runner access block deployment; remove warning-only fallthrough and document a reachable job runner. || Rehearse the historical scoring upgrade with a bounded maintenance window. Do not edit an already-applied revision; if an unupgraded large database exceeds the window, stop rollout and create an approved expand/backfill plan.',
'Forced Alembic failure must prevent deploy. Upgrade fixtures assert exact pre-clamp-derived scores and constraints; compare head schema with models. Exercise rollback/recovery rehearsal on disposable data.',
'Deployment cannot serve a new image after skipped/failed migrations; migration-chain correctness and size-dependent rollout evidence are recorded.',
'On an upgrade-requiring clone at 10k/100k/1M summaries measure update rows, WAL, lock waits, duration and writer p95. Existing source predicts 2S+B+X updates; no forward migration can retroactively speed an applied historical revision.',deps='11 14')
add(43,3,'resource-lifecycle','Own client lifetimes and configure a deployment connection budget','DATA-15 PERF-DATA-01',
'c:redis backend/app/db/session.py backend/app/main.py c:config w:settings .github/workflows/deploy-backend.yml script:gcp_deploy backend/.env.example',
'Initialize the shared ARQ producer once (or lock lazy creation); close ARQ, normal Redis, bot session and DB engine in cancellation-safe finally paths for API/worker owners. || Make pool size/overflow and query/lock/idle transaction deadlines explicit from a total DB budget including workers and overlapping revisions. Align local and CI deployment instance limits. || Use separate maintenance deadlines; never compensate for long transaction holds by blindly enlarging pools.',
'Concurrent cold initialization produces one pool; partial startup/cancellation releases resources. Controlled lock wait times out with rollback and subsequent requests succeed.',
'No overwritten pool handle or unclosed process-owned client; configured ceilings fit a recorded DB budget and timeout policy.',
'Measure checkout wait/hold, idle-in-transaction sessions, p95/p99 at 1/2/5 instances with revision overlap; 150/300 are potential ceilings, not observed use.',deps='13 18 27 42')
add(44,3,'stable-pagination','Avoid empty-page queries and make directory order stable','DATA-14 PERF-DATA-04',
'r:base_repository r:user_repository',
'Return immediately when count is zero; add feature-specific stable ordering with an ID tie-breaker rather than overriding all repository queries. || Profile deep offsets and substring search while preserving existing page/count contracts. Record whether a separate cursor/search-index change is justified; do not silently replace numbered pagination.',
'Empty search executes only count; repeated tied-name pages have deterministic membership. Role/search filters and exact count remain correct; concurrent writes have documented offset limitations.',
'Empty-page waste and missing ordering fixed; deep-offset/search cost is measured and explicitly dispositioned. No unsupported index/cursor rewrite.',
'At 10k/100k/1M users compare first/deep/empty page SQL count, p50/p95 and EXPLAIN buffers for common/rare terms. Record residual offset cost and proposed follow-up if beyond the measured budget.',deps='39 16',extra='The source finding includes a performance hypothesis. Closure requires measured acceptance at actual expected scale or a separately tracked residual; an empty-page shortcut alone is not evidence that deep pagination is fast.')
add(45,3,'refresh-retention','Bound retention of expired authentication rows','PERF-DATA-05',
'm:refresh_token r:refresh_token_repository i:refresh_token_repository w:token_retention w:settings migration:rwp45_refresh_retention',
'Define expiry/revocation retention consistent with WP-03 replay detection; purge only eligible rows in bounded ordered batches. || Add cleanup/active-user indexes only when actual query plans justify them; schedule cleanup with bounded locks/WAL and safe retries.',
'Live tokens and required replay evidence survive; expired eligible rows purge in batches; crash/restart is idempotent; concurrent rotation is unaffected.',
'Token storage has an explicit retention policy and bounded cleanup, without weakening replay protection.',
'Measure daily inserts, relation/index bytes, vacuum/WAL and lookup/revoke/purge plans at 100k/1M representative rows; illustrative annual growth is not production traffic.',deps='3 43')
add(46,3,'course-copy-budget','Bound and measure synchronous course-copy creation','PERF-BUS-06',
's:course_service s:enrollment_service c:schedule_utils i:course_repository i:user_repository c:deps a:courses',
'Compute destination lesson dates once and pass typed precomputed inputs through enrollment. Inject the existing course/user protocols so this path can be characterized without concrete constructors. || Establish a documented synchronous roster/duration/row budget and reject oversized copies before destination mutation; preserve current transaction behavior and define existing skipped-enrollment handling explicitly. || Do not introduce a multi-commit background-copy product in this PR. If required by measured real workloads, stop and propose a separate resumable-copy WP.',
'At the boundary, output matches ordinary enrollment/maxima/charges; excessive copy is rejected before writes; repeated dates are computed once; no duplicate enrollment/installment on retry.',
'One copy cannot create an unbounded lifetime footprint; retained synchronous path has measured limits and clear failure semantics.',
'Vary students and course duration; record inserted rows, flush/execute count, transaction duration and peak RSS versus N(1+L+J+M) source model.',deps='26 33 37')
add(47,3,'provisioning-secrets','Remove credentials from provisioning output and argv','SEC-DATA-03',
'script:setup_free_tier_vm script:seed_admin',
'Replace printed password/DSN values with status metadata; use restricted secret files and POSTGRES_PASSWORD_FILE. || Accept admin password via stdin/file descriptor for automation and getpass interactively; avoid value-bearing command arguments and preserve validation.',
'Capture dummy-credential stdout/stderr/argv and assert the value is absent; invalid protected-file permissions fail safely; interactive and stdin provisioning validate inputs.',
'Provisioning does not disclose password values through intended logs or process arguments.',deps='10 13',effort='S')
add(48,3,'release-provenance','Freeze release dependencies and isolate deployment credentials','SEC-DATA-05',
'backend/requirements.txt backend/requirements.lock backend/pyproject.toml backend/Dockerfile .github/workflows/deploy-backend.yml .github/workflows/deploy-frontend.yml script:setup_free_tier_vm',
'Resolve and review a Python 3.12 transitive lock with hashes; use identical locked dependencies for tests, image and migrations and keep manifests aligned. || Pin actions to reviewed commit SHAs and base image digests; replace curl-to-root installer with verified package installation. Separate package/build execution from the minimally privileged deploy/migration identity and select one supported Google auth mode. || Recheck advisory reachability against the actual shipping graph; do not promote installed-environment FYI flags into proven runtime vulnerabilities.',
'Altered artifacts fail hash verification; test/image/migration wheel graphs match. Build job cannot access production secrets; workflows remain parseable and trusted PRs cannot obtain deployment credentials.',
'Releases have reproducible reviewed inputs and a documented privilege boundary. Real SHA/digest values come from verified upstream releases.',deps='42 43 47',effort='M',extra='If IAM/WIF resources require an external owner, record the concrete required configuration and keep rollout blocked until verified; repository edits cannot prove external IAM. No deployment is authorized by this planning task.')
add(49,3,'input-consistency','Reject misspelled settings and normalize phone inputs','API-12',
'q:org_settings q:user q:common frontend/src/lib/users/types.ts frontend/src/lib/settings/types.ts CONTRACT.md',
'Add extra=forbid to organization update input. || Share a canonical E.164 boundary type/normalizer producing a leading plus, and plan legacy stored-value normalization without silently breaking guardian matches.',
'Unknown setting keys fail; canonical phones, missing plus, malformed symbols and equivalent historical values follow one documented policy; guardian lookup tests stay green.',
'Silent settings typos and inconsistent accepted phone representations are removed.',deps='15 41',effort='S')
add(50,3,'behavioral-regressions','Replace weak regression assertions with adversarial fixtures','API-09',
't:test_student_cabinet_backend t:test_coverage_gaps t:test_documents',
'Seed distinct peers/documents and archived/withdrawn enrollment states; assert identifiers excluded and exact grading/rank values. || Test refresh after logout using the actual rotated token and schema-valid invalid reset tokens plus successful reset/replay. Replace broad status alternatives with the precise fixture outcome.',
'Each corrected assertion must fail against the pre-fix behavior or an isolated deliberate wrong-result double; no source mutation is required. Confirm tests exercise domain logic rather than fail early on invalid payload shape.',
'Claimed privacy, rank, bucket, logout and reset invariants each have explicit behavior assertions.',deps='3 4 17 34 40',effort='S')
add(51,3,'repository-contracts','Complete typed feature repository contracts','DATA-12',
'i:base_repository i:user_repository i:audit_log_repository i:document_repository i:enrollment_repository r:user_repository r:audit_log_repository r:document_repository r:enrollment_repository s:audit_service s:document_service s:enrollment_service a:students c:deps q:common',
'Define typed feature page/filter/result methods matching real callers, including student history and audit/document/enrollment lists. || Keep SQLAlchemy Select construction inside SQL implementations and wire protocols through named dependency factories; leave generic persistence mechanics private. || Preserve current transaction owner and reuse existing Page/DTO types where possible; do not create pass-through wrapper layers.',
'A lightweight alternate repository satisfies each feature contract without importing SQLAlchemy; HTTP behavior, filters/ownership/counts and request commit/rollback remain equivalent.',
'Services/routers depend only on declared feature methods, with typed returns and no required implementation-only Select API.',deps='29 40 44 50')
add(52,3,'api-boundaries','Finish typed API response and domain boundaries','API-10',
'a:mentors a:students a:journals a:finance q:user q:journal q:ledger c:deps s:mentor_analytics_service r:mentor_analytics_repository frontend/src/lib/users/types.ts frontend/src/lib/journals/types.ts frontend/src/lib/finance/types.ts CONTRACT.md',
'Move mentor analytics SQL to a typed repository-backed service and inject it via Depends; retain role-specific profile policies. || Replace remaining generic journal-detail/ledger/analytics response boundaries with explicit DTOs matching the actual payload. Call the public payment decoration façade from WP-53 and consolidate duplicated access helpers with behavior tests. || Verify chart extraction (WP-34), configured storage injection (WP-26) and repository contracts (WP-51) satisfy the other API-10 subclaims before marking the owner complete.',
'Golden response-shape and role/privacy tests cover staff/student chart/profile/journal/ledger variants; generated OpenAPI and frontend types agree; no permission branch is lost by extraction.',
'API-10 closes only when its distributed contributions and this focused boundary PR pass; routers no longer own the remaining mentor SQL or call private finance helpers.',deps='34 26 51 53')
add(53,3,'finance-boundary','Separate finance reporting from commands behind a stable façade','BUS-19',
's:finance_service s:finance_reporting_service i:finance_reporting_repository r:finance_reporting_repository',
'Move read-only analytics/debt/receipt query construction into a typed reporting collaborator; keep ledger/account/month locking and the single transaction owner unchanged. || Expose public decorated-payment operation for router consumers; use typed optional results instead of incorrect nonoptional annotations. Preserve existing public façade during this mechanical extraction. || BUS-19 also needs completed auth dependency injection (WP-63), course injection/date reuse (WP-46), journal policy/date consolidation (WP-55) and storage injection (WP-26); this owner cannot close before those contributors.',
'Characterization tests compare exact reports/receipts and command side effects before/after; alternate reporting repository can be injected; no hidden commit is introduced.',
'One finance reporting boundary is extracted with stable behavior and explicit dependencies; all listed BUS-19 subclaims have completed contributors.',deps='20 54 55 63 46',extra='One focused finance extraction PR, not a rewrite of every service. Stop and rescope if the extraction cannot preserve transaction ownership in one session.')
add(54,3,'finance-bulk-queries','Batch finance availability and ledger aggregates','BUS-20',
's:finance_service',
'Fetch active allocation/refund sums grouped by entry/charge once for the requested account/page and replace aggregate queries inside loops. || Preserve account locking, ordering, reversal exclusions and Decimal totals. Bound transfer to the requested result scope rather than aggregating irrelevant accounts. || BUS-20 closure also requires affected-student recalculation (WP-21), batched reminders (WP-32), queue batching (WP-55) and bounded finance histories (WP-56); do not close it for query batching alone.',
'Query counts stay constant or batch-proportional as credit entries/charges increase; financial invariants and receipt/reconciliation results match across void/refund/discount cases.',
'No per-entry/per-charge finance aggregate loop; all named BUS-20 contributors complete before owner closure.',
'Compare SQL count, fetched rows, lock/transaction p95 and RSS at 10/100/1000 ledger entries; keep improvements beyond measurement variance.',deps='21 32 55 56')
add(55,3,'journal-query-policy','Batch mentor grading queue and consolidate its shared policy','',
's:journal_service s:enrollment_service c:schedule_utils',
'Query mentor-course journal aggregates in one set rather than one service call per course, preserving explicit grading state. || Consolidate repeated journal mutation authorization into one tested policy and use the canonical lesson-date helper from both services. This bounded journal PR contributes to BUS-19 and BUS-20; their unique owners are WP-53 and WP-54.',
'Queue query count does not grow by five per course; own/foreign/archived roles and date boundaries remain identical. Test empty/partial/complete/upcoming states.',
'Queue selection has bounded set-based queries and policy/date logic has one implementation.',
'Compare query count, rows and p95 for 1/10/100 mentor courses; validate exact queue ordering and results.',deps='33 46')
add(56,3,'finance-pagination','Bound ledger and credit response histories','API-11',
'a:finance s:finance_service q:ledger frontend/src/lib/finance/api.ts frontend/src/lib/finance/hooks.ts frontend/src/lib/finance/types.ts frontend/src/pages/Finance.tsx CONTRACT.md',
'Add capped stable cursor pages for ledger events and credit-account lists; compute opening/cumulative balances using SQL so pagination cannot silently reset financial totals. || Migrate in-repository clients and retire or explicitly bound legacy unbounded routes without silent truncation. || Close API-11 only after WP-34/WP-58 chart work, WP-40 student history and WP-57 queued cron are complete.',
'Tied timestamps across pages, mixed charges/reversals and opening balances produce no duplicates/skips; full displayed totals equal the unpaged reference; unauthorized access remains denied.',
'Finance response work is bounded per page and existing client behavior is migrated; all API-11 contributors complete.',
'Measure returned rows/bytes, query count, RSS and p95 for fixed page size across growing account histories.',deps='37 40 57 58')
add(57,3,'queued-cron','Queue maintenance requests with stable deduplication','',
'a:cron w:settings c:redis q:maintenance CONTRACT.md',
'After WP-05 authentication, enqueue registered ARQ maintenance functions with stable schedule-window IDs and return a typed accepted job identifier. || Keep retries bounded and prevent duplicate overlapping scheduler work; do not run the whole job in the HTTP request. This contributes to API-11, uniquely owned by WP-56.',
'Concurrent/repeated authorized triggers enqueue one job per intended window; unauthorized requests enqueue none; enqueue failure returns a retryable error, not accepted.',
'Scheduler request duration is bounded by enqueue and duplicate overlap is controlled.',
'Measure enqueue/request p95 and job concurrency under 30 repeated triggers; existing job data semantics stay unchanged.',deps='5 32 43')
add(58,3,'chart-bounds','Bound chart periods and staff series without leaking peers','',
'a:courses s:course_progress_service r:course_progress_repository q:course_progress frontend/src/lib/courses/endpoints.ts frontend/src/lib/courses/hooks.ts frontend/src/lib/courses/types.ts frontend/src/pages/CourseProfile.tsx frontend/src/pages/student/MyCourseDetail.tsx CONTRACT.md',
'Add explicit bounded period range and capped staff roster-series paging; keep student output to its own series plus authorized aggregate. || Make historical/range-dependent ranking and average semantics explicit and aligned with WP-34; update client navigation and types. This is the remaining chart contribution to API-11.',
'Large histories/rosters never exceed bounds; all pages preserve access filtering and deterministic range behavior; no peer identifiers appear in student output.',
'Chart computation/input/output scale with the chosen bounded range/page, not the entire course lifetime.',
'Measure query rows, response bytes, RSS and loop lag at 30/300 students and 52/104/1000 periods with equal requested ranges.',deps='34')
add(59,3,'model-cleanup','Remove the accidental course-history annotation','DATA-16',
'm:course_mentor_history',
'Remove only the accidental Length: 792 module annotation; preserve mappings and relationships.',
'No new mirror test is needed; run existing mapper/mentor-history tests and parse/import the model in the isolated test runtime.',
'Annotation removed with no schema or runtime behavior change.',deps='9',severity='Low (Nit)',effort='S')
add(60,3,'password-offload','Bound asynchronous password hashing and verification','BUS-15',
'c:security s:auth_service s:user_service',
'Run bcrypt hash/verify through a bounded offload adapter from async workflows, preserving bcrypt cost and byte/error semantics. || Apply a finite concurrency budget coordinated with endpoint capacity limits; do not move expensive work to an unbounded executor queue. || BUS-15 also includes image transformation: close only after WP-61 completes.',
'Password success/failure/reset behavior stays correct; controlled expensive hash work does not block an unrelated event-loop heartbeat; concurrent jobs respect configured bound.',
'Password CPU work leaves the event loop and stays bounded; image contribution WP-61 also complete.',
'Compare login/reset p95, unrelated endpoint p95, loop lag, CPU and executor saturation at 1/10/30 concurrency. Do not lower bcrypt cost to meet a latency target.',deps='23 22 61')
add(61,3,'avatar-offload','Bound and reuse avatar transformation work','',
's:user_service',
'Read uploads under a finite byte limit, enforce image pixel/dimension limits, and offload one decode/verify/resize/encode helper through bounded CPU work. || Reuse the thumbnail result instead of decoding twice; preserve the existing API image sizes unless an explicitly approved contract change is needed. This completes the image contribution to BUS-15, owned by WP-60.',
'Invalid/truncated/oversized/decompression-bomb inputs fail before excessive allocation; PNG/JPEG output dimensions and replacement cleanup remain correct; heartbeat stays responsive.',
'Avatar transformations are bounded, offloaded and computed once with unchanged accepted-image semantics.',
'Compare decoded pixels, peak RSS, transformation count, loop lag and unrelated p95 under concurrent uploads.',deps='26')
add(63,3,'auth-injection','Inject narrow authentication collaborators','',
's:auth_service c:deps a:auth s:user_service i:user_repository i:refresh_token_repository s:email_service',
'Accept typed user/token/mail-or-outbox collaborators in AuthService and supply them through named Depends factories and explicit nested-service composition. || Remove concrete construction from auth business methods while preserving one request transaction owner. This is a bounded contribution to BUS-19, uniquely owned by WP-53.',
'Run auth behavior/recovery/scope/replay tests with SQL implementations and narrow doubles; no hidden service commit or optional insecure fallback appears.',
'Auth workflows can substitute declared collaborators without changing route logic or security behavior.',deps='60 51')
add(62,4,'reaudit','Re-audit every finding and record residual risks','',
'docs/remediation/results/final-reaudit.md docs/remediation/results/coverage-after-fixes.md docs/remediation/results/retention-policy-decision.md',
'Reopen every original cited source location or its successor after all implementation packages merge; preserve original audit reports unchanged. || Re-run the full backend/frontend gates, explicit Critical reproduction module, migration smoke suite and representative performance/security checks; compare measurements with their recorded baselines. || Mark each of the 75 IDs fixed, still open, measurement-accepted or deferred with current evidence. Revisit SEC-DATA-04 with the data owner for retention/backup/financial exceptions; draft a separate future erasure WP only after that policy exists.',
'All Critical reproductions must pass with desired secure outcomes; audit all acceptance evidence and actual branch/PR completion before declaring closure. Check source ownership exceptions, migrations and compatibility debt.',
'Independent fresh source review and actual checks substantiate each disposition; unresolved policy/performance/runtime assumptions remain explicit, not hidden behind an overall score.',
'Repeat equal-condition latency/query/lock/RSS tests from performance WPs and report variance; do not infer speedups from static complexity alone.',deps=' '.join(str(n) for n in range(1,64) if n!=62),severity='Verification',effort='M',extra='This future re-audit may read all source and audit reports as explicitly listed read-only context, but writes only the listed remediation results and STATUS. Existing audits are immutable. The current planning session uses no subagents; later delegation is optional according to the roadmap.')

# Persist work packages before rendering task files.
(OUT/'_work/work-packages.json').write_text(json.dumps(W,indent=2))
print('Stage 2 complete:',len(W),'work packages persisted.')

add(64,3,'roster-index-experiment','Measure course roster plans and add only a justified index','PERF-DATA-02',
'm:enrollment migration:rwp64_roster_index',
'Apply the complete migration chain in a disposable database and inspect course-leading index availability. || EXPLAIN the exact course roster/class-size predicates at representative cardinalities; compare a partial course/student index, read buffers and write overhead. || Add a forward concurrent index migration and matching model metadata only if evidence supports it; never edit historical applied revisions. If benefit is absent, retain the evidence and mark the hypothesis not actionable at the measured scale.',
'Course-filtered results stay identical, including soft deletes; migration upgrade/downgrade and invalid concurrent-index recovery are rehearsed. Verify insert/update overhead and index storage.',
'A measured keep/reject decision resolves the hypothesis; an index is not added solely because an earlier migration removed one.',
'Use 10k/100k/1M enrollments with realistic course distributions; record EXPLAIN ANALYZE BUFFERS, actual/estimated rows, p95, index bytes and writes under equal cache conditions.',deps='42 39',severity='Medium (hypothesis)')
next(w for w in W if w['number']==62)['deps'].append('WP-64')
(OUT/'_work/work-packages.json').write_text(json.dumps(W,indent=2))
print('Final work package checkpoint:',len(W))
# Scope corrections after tracing in-repository consumers and response timing.
by_number={w['number']:w for w in W}
by_number[21]['files'].append('backend/app/api/v1/journals.py')
by_number[21]['steps'].append('Ensure conflict translation/commit occurs before response transmission: use a supported function-scoped session dependency or an explicit journal command transaction boundary with one owner. A yield teardown running after the response cannot turn a commit conflict into an HTTP 409.')
by_number[17]['extra'] += ' Existing test helpers call create_access_token with two arguments. A generator default epoch of zero may preserve new-user fixtures, but every runtime issuance must explicitly pass the loaded user epoch and validation must reject missing epochs; never add a permissive validation fallback to satisfy tests.'
by_number[40]['files'].remove('frontend/src/pages/StudentProfile.tsx')
by_number[40]['files'] += ['frontend/src/pages/student/MyCourseDetail.tsx','frontend/src/components/dashboard/StudentDashboard.tsx','frontend/src/lib/users/endpoints.test.ts']
by_number[41]['files'] += ['frontend/src/lib/users/hooks.ts','frontend/src/lib/users/endpoints.ts','frontend/src/pages/student/MyCourseDetail.tsx','frontend/src/components/dashboard/StudentDashboard.tsx']
by_number[34]['files'] += ['frontend/src/components/student/StudentTrendChart.tsx']
by_number[34]['steps'].append('If the chart returns explicit grading metadata to distinguish a graded zero, adapt StudentTrendChart rather than inferring graded periods from percentage > 0. Keep this a contract-consumer adjustment, not a frontend redesign.')
by_number[58]['files'] += ['frontend/src/components/student/StudentTrendChart.tsx']
(OUT/'_work/work-packages.json').write_text(json.dumps(W,indent=2))

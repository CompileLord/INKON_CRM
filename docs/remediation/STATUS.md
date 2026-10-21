# Remediation progress

Sole record; failed/unrun gates block acceptance. Frontend separately owned; no push/deploy/operational changes.

Evidence: `~/.local/state/imkon-remediation/`. Disposable Python3.12 pods root-audit-pod/wp30-sol-pod; one suite per pod.

| WP | Status | Branch / PR | Date (UTC) | Tests run and result | Notes / evidence |
|---|---|---|---|---|---|
| WP-01 | done | remediation/wp-01-baseline | 2026-10-14 | Backend integration 100 pass (58.04s) | Disposable Conda baseline; frontend exceptions separately owned. Evidence 0d9a51d. |
| WP-02 | done | remediation/wp-02-critical-reproductions | 2026-10-14 | Default backend 100 pass (56.51s) | Test-only expected-red exception; no fix claimed. Evidence 524999f. |
| WP-03 | done | remediation/wp-03-refresh-identity | 2026-10-14 | Independent full backend 115 pass (60.86s) | PASS; identity/rotation and migration. Evidence a0e31a7. |
| WP-04 | done | remediation/wp-04-private-downloads | 2026-10-14 | Backend 128 pass (67.92s) | PASS backend privacy; browser integration separately owned. Evidence eb5c613. |
| WP-05 | done | remediation/wp-05-cron-authorization | 2026-10-14 | Backend 133 pass (65.89s) | PASS fail-closed cron. Evidence 268c92b. |
| WP-06 | done | remediation/wp-06-onboarding-scope | 2026-10-15 | Backend 164 pass (70.42s) | PASS onboarding token scope. Evidence f69339c. |
| WP-07 | done | remediation/wp-07-ledger-serialization | 2026-10-15 | Backend 162 pass (76.64s) | PASS ledger serialization; contention cost accepted, no speedup. Measurements 89a8033. |
| WP-08 | done | remediation/wp-08-zero-id-reversals | 2026-10-15 | Follow-up independent backend 240 pass (146.43s) | PASS zero-ID follow-up. Evidence 78f7ea8. |
| WP-09 | done | remediation/wp-09-test-isolation | 2026-10-15 | Backend 182 pass (92.61s) | PASS explicit disposable targets/run-owned Redis keys. Evidence 1dc548a. |
| WP-10 | done | remediation/wp-10-reset-safety | 2026-10-15 | Backend 228 pass (119.54s) | PASS reset safety; combined 297-pass gate at 4355ac9. Evidence 9e03740. |
| WP-11 | done | remediation/wp-11-configuration-contract | 2026-10-15 | Backend 298 pass (235.22s) | PASS portable tests; 70240e0. Logs wp11-recovery/wp11-root-*.log; original configuration evidence: f4e9eb9. |
| WP-12 | done | remediation/wp-12-smtp-tls | 2026-10-15 | Backend 231 pass (113.52s) | PASS TLS/timeout; stall ~1.31→0.36s (test timeout). History 25890fd. |
| WP-13 | done | remediation/wp-13-python312-compatibility | 2026-10-15 | Deployment Python3.12 backend 363 pass (157.78s) | PASS after reopening; annotation-only fixes. 8e54808. Logs wp13-compatibility/. |
| WP-14 | done | remediation/wp-14-build-exclusions | 2026-10-15 | Backend 313 pass (180.92s) | PASS after corrections; logs wp14-recovery/evidence/. |
| WP-15 | done | remediation/wp-15-guardian-binding | 2026-10-15 | Backend 309 pass (181.97s) | PASS; e7a5f50. Logs wp15-recovery/wp15-root-*.log. Frontend owner must remove both guardian fields from UserSelfUpdate. |
| WP-16 | done | remediation/wp-16-mentor-directory | 2026-10-15 | Backend 313 pass (319.24s) | PASS after correction; mentor ownership applies before search/count/page, deleted relations excluded, historical enrollment retained. Logs wp15-recovery/wp16-root-*.log. |
| WP-17 | done | remediation/wp-17-recovery-revocation | 2026-10-15 | Python3.12 backend 399 pass (222.54s) | PASS after two Luna FAILs and Sol correction; immutable reset identity, strict expiry, atomic epoch/revocation, serialized downgrade. Logs wp13-compatibility/wp17-evidence/wp17-*.log. Legacy credentials require reauthentication. |
| WP-18 | done | main | 2026-10-16 | Combined622 and focused99 pass | PASS 7871f60; DB hold 599→28ms. No total SMTP deadline (→WP-66). Evidence wp13-compatibility/wp18-evidence/. |
| WP-19 | done | main | 2026-10-17 | Python3.12 combined686 pass347.61s | PASS 70240e0; transaction generations, SCAN removed; no universal speedup. wp19-sol/evidence/. |
| WP-20 | done | main | 2026-10-17 | Python3.12 full698 pass386.62s | PASS finite owner leases/atomic publish; cold recomputes 30→1. wp20-sol/evidence/. |
| WP-21 | done | main | 2026-10-16 | Combined622 and focused99 pass | PASS beaca20; transaction audit/version retained.15trials100cells:flush102→2,SQL208→109,p95319→114ms. wp21-sol-fresh/evidence/; root-transaction-*.log. |
| WP-22 | done | main | 2026-10-16 | Combined622 and focused99 pass | PASS a1667c6; atomic budgets retained.5trials overload50→30admitted/20denied; no speedup. wp22-sol-integration/root-audit.json; prior wp14-recovery/evidence/wp22/. |
| WP-23 | done | main | 2026-10-17 | Python3.12 full664 pass380.05s | PASS consume-before-DB/recovery, fixedTTL/budgets. OpenAPI75paths unchanged. wp23-sol/{root-audit,source-hashes}.json; root-{mutation,restored}.log. |
| WP-24 | done | main | 2026-10-18 | Executor backend 843 pass (462s) on rebased branch | PASS commit 239bfb0 (one typing nit corrected after audit). Decimal-string frontend inputs unchanged; CONTRACT.md byte-identical. logs wp24-sol/finish/. Post-merge combined run pending with WP-26/36. |
| WP-25 | done | main | 2026-10-18 | Executor backend 715 pass (430.74s) | PASS after correction 8d8d704/d6fc7f6. Gaps: earlier mutations not rerun; existing untyped locals remain. Alembic heads fixed3fe0534, parentd4e5f6a7b8c9; replay/full881 pass beforeWP26. Task parent stale. logs wp25-sol/correction{2,3}-*. |
| WP-26 | done | master | 2026-10-18 | Executor backend 778 pass/6 fail (all six known Alembic multiple-heads, reproduced on b64b617) | PASS (accepted with gaps) commit f12d2ae; registry fails closed, services/workers use configured backend, worker streams and uses expiring private URLs. Gaps: no real GCS adapter (fake client only), app/main.py still serves /storage avatar/course from local disk, DocumentDeliveryService unchanged, red phase was import failure only. Added paths: core/config.py, storage_lifecycle_service.py, storage_cleanup.py. Logs wp26-sol/. |
| WP-27 | done | remediation/wp-27-webhook-lifecycle | 2026-10-15 | Backend 356 pass (200.44s) | PASS after one FAIL correction. Explicit registration CLI; instance shutdown closes local resources. Owner /root/wp05_executor. Logs wp13-recovery/wp27-root-*.log. Real registration not executed. |
| WP-28 | done | remediation/wp-28-webhook-errors | 2026-10-15 | Backend 363 pass (195.18s) | PASS; malformed JSON/UTF-8 400, invalid schema 422, processing failure 503, real rollback/retry preserves one binding. earlier executor storage-override failure resolved. |
| WP-29 | done | master | 2026-10-18 | Executor backend 909 pass | PASS; exam-result and document intents written in the business transaction, stable job IDs, retry after Redis failure, shared producer closed on shutdown. Scope revision: outbox model, repository-free migration rwp29, workers/settings, approved replacement of one WP-13 test. logs wp29-sol/. |
| WP-30 | done | master | 2026-10-19 | Python3.12 baseline988 pass | PASS code4a5eb95, merge587d2c6. Atomic claims, finite bounded recovery, source checks; at-least-once transport and drain-before-worker-owner-switch required. Frontend owner must add queued/inflight types and translated DeliveryLog states; frontend checks excluded. Evidence wp30-sol/ and root-audit/wp30-*. |
| WP-31 | done | master | 2026-10-20 | Python3.12 baseline1088 pass | PASS code7ed3131, merge874c46e; merged backend byte-identical to tested candidate. Separate sibling/document revisions and cross-date dedup; conservative cutover observations preserve history. Drain pending work before worker owner switch; previous-image recovery unsupported. Evidence wp31-sol/ and root-audit/wp31-*. |
| WP-32 | in_progress | master | 2026-10-20 | Full1125 pass674.24s/5 warnings; focused51; root10; allocation mutation caught/restored | Upcoming scope PASS codef77365f merge04e2893; merged backend matches full candidate. SQL51/501/5001→2/3/21. Debt candidate1edcb37 focused62/root15 pass; mutation caught; combined full running. logs wp32-sol/, root-audit/wp32-*.log. |
| WP-33 | done | master | 2026-10-20 | Full1103 pass645.87s/5 warnings | PASS code6d5aaa6 mergebd1d301; backend byte-identical to full-tested candidate. Explicit zero/unknown grading; SQL ranks/aggregates; client rank0 handoff pending separate frontend owner. logs wp33-sol/, root-audit/wp33-*.log. |
| WP-34 | in_progress | master | 2026-10-20 | Full1108 pass601.27s; focused35; root5; cohort mutation caught/restored; merged WP32/34 integration31 pass | Backend PASS code9a2afe9 merge3a2fe90. Client nullable series/rank/metadata types + endpoint union/validation pending separate owner. Reads3276000→31200; larger payload/timing noise. logs wp34-sol/, root-audit/wp34-*, wp32-wp34-integration.log. |
| WP-35 | in_progress | remediation/wp-35-autosave-bounds | 2026-10-20 | Focused74/root25 pass; red7 fail/1 pass; mutation caught | Backend f984c79; full1173 pass; synced FIN-focused63 pass; frontend batching pending. logs wp35-sol/, root-audit/wp35-*. |
| WP-36 | done | master | 2026-10-18 | Executor backend 874 pass/7 fail vs baseline 865 pass/same 7 fail (six Alembic multiple-heads, test_avatar_upload_and_thumbnail) | PASS commit dc3018d; shared/exclusive advisory month locks, sorted order, held to commit. Gaps: no throughput/deadlock-rate measurements; the 7 failures pre-date WP-36 (multiple Alembic heads introduced by WP-25 + main credentials migration, fix in progress). Logs wp36-sol/. |
| WP-37 | done | master | 2026-10-20 | Combined1148 pass623.19s/5 warnings | PASS e46313e; duplicate preflight preserves finances; SQL compatibility only. logs wp37-sol/, root-audit/wp37-*. |
| WP-38 | done | remediation/wp-38-seed-identities | 2026-10-15 | Independent Python3.12 365 pass (235.85s), critical 4 pass (4.81s) | PASS generated IDs with offset/default sequences, repeated guarded seed, finance/photo references and subsequent API creation. Logs wp13-recovery/wp38-root-*.log. Source/test bytes matched executed copy. |
| WP-39 | done | master | 2026-10-20 | Combined1148 pass | PASS 21ea78d; WP33 production retained. SQL8/17/107→8/8/8. logs wp39-sol/, root-audit/wp39-*. |
| WP-40 | in_progress | remediation/wp-40-journal-history | 2026-10-20 | Focused59/root59 pass; cursor mutation caught/restored | Candidate49487ba; full gate pending; FE-R40 required. wp40-sol/. |
| WP-41 | in_progress | remediation/wp-41-mentor-privacy | 2026-10-20 | Focused13/root13 pass; filter mutation caught | Candidateea64cdc; combined full1003 pass then stale WP37 head failed; fixedfb5118a. FE-R41 pending. |
| WP-42 | done | remediation/wp-42-migration-gates | 2026-10-15 | Python3.12 integrated backend 411 pass (204.87s) | PASS after correction; no speedup claim. Needs self-hosted migration runner; real deploy not exercised. Logs wp14-recovery/evidence/wp42-*. |
| WP-43 | in_progress | remediation/wp-43-resource-lifecycle | 2026-10-20 | Focused253/root26 pass; failed-close mutation caught | Candidate224b80d; split checks33 pass; full gate running. wp43-sol/. |
| WP-44 | in_progress | remediation/wp-44-stable-pagination | 2026-10-20 | Red-first implementation | Staged audited WP40 prerequisite49487ba; integration awaits full gate. wp44-sol/. |
| WP-45 | in_progress | remediation/wp-45-refresh-retention | 2026-10-20 | Red-first implementation | Audited WP43 prerequisite224b80d staged; integration awaits full gate. wp45-sol/. |
| WP-46 | in_progress | remediation/wp-46-course-copy-budget | 2026-10-20 | Red-first implementation | Audited WP40/49 prerequisites staged; bounded copy scope refreshed. wp46-sol/. |
| WP-47 | done | remediation/wp-47-provisioning-secrets | 2026-10-15 | Integrated Python3.12 backend 430 pass (199.01s) | PASS after correction: real fresh PostgreSQL smoke, actual stdin/FD password persistence and non-echoing terminal verified. Secret outside PGDATA; no real provisioning. Evidence wp13-recovery/wp47-*.log. |
| WP-48 | in_progress | remediation/wp-48-release-provenance | 2026-10-21 | b1f8ef5 audited; full 1290 pass; 10 mutations caught | Lock frozen to venv versions with hashes, actions/images pinned, PR build has no deploy secrets. Google-auth item obsolete (SSH deploy). Awaits master merge. Advisories →WP-70. |
| WP-49 | in_progress | remediation/wp-49-canonical-inputs | 2026-10-20 | Focused129/root129 pass; legacy-binding mutation caught | Candidate86b71a9; full gate running. FE-R49 required. wp49-sol/. |
| WP-50 | todo | — | — | — | Pending. |
| WP-51 | todo | — | — | — | Pending. |
| WP-52 | todo | — | — | — | Pending. |
| WP-53 | todo | — | — | — | Pending. |
| WP-54 | todo | — | — | — | Pending. |
| WP-55 | todo | — | — | — | Pending. |
| WP-56 | todo | — | — | — | Pending. |
| WP-57 | todo | — | — | — | Pending. |
| WP-58 | todo | — | — | — | Pending. |
| WP-59 | done | main | 2026-10-18 | Pod full backend before 2 fail/732 pass, after 2 fail/734 pass (same two failures: test_avatar_upload_and_thumbnail, wp11 alembic online init) | PASS commit 7783942 (one stray line removed). Unrelated pod failures uninvestigated; no mutation check (not required). logs wp59-sol/. |
| WP-60 | done | master | 2026-10-19 | Executor backend 921 pass/3 fail | PASS after one audit FAIL (fail-fast 503 rejected 28/30 burst logins; fixed with 64-waiter/5s bounded queue). 2 bcrypt workers; burst-30 90 successes/0 503; mean p95 login 263/1380/4009ms at c1/10/30 (warm in-process ASGI). Residual: workers/outbox.py still verifies synchronously (out of scope). logs wp60-sol/. |
| WP-61 | done | master | 2026-10-18 | Executor backend 913 pass/1 fail (baseline 886/14) | PASS; bounded read, dimension/pixel limits before decode, two-slot cancellation-safe worker, one encoded thumbnail. Synthetic 3 trials: resizes 24->12, decoded pixels halved, health p95 ~51->~18-24ms. logs wp61-sol/. |
| WP-62 | todo | — | 2026-10-19 | Not run | User approved retention policy: application audit logs 7 days; deleted profiles/uploads 30-day recovery then remove/anonymize; encrypted rolling backups 30 days with deletion replay on restore; analytics caches 10 minutes plus deletion invalidation. No automatic financial/ledger deletion until accountant sets period. Implementation and operational evidence pending. No deletion implemented yet. |
| WP-63 | todo | — | — | — | Pending. |
| WP-64 | todo | — | — | — | Pending. |
| WP-65 | done | master | 2026-10-21 | targeted 56 pass; full 1201 pass, residual fails match base (wp11/25/37 env) | PASS def63dd, merged f0d7684. Mentor docs limited to active-enrolment students; 5 mutations caught. Fixes 3/4 left to WP-41/49. wp20 lease fix not mutated. |
| WP-66 | in_progress | kitob/prod-2-delivery | 2026-10-21 | c65a273 audited; targeted 47 pass; awaits master merge (SMS dispatcher must adopt begin_attempt/release_claim) | Audit: attempts only on transport, SMTP deadline, archive timezone, downgrade drain guards, migration timeouts. |
| WP-67 | done | master | 2026-10-21 | deploy regression 21 pass (rerun by orchestrator); 8 mutations caught; bash -n 14 files | PASS 3078682/0577497/f92e34b. Real GitHub/VPS not exercised. ARQ check uses default 1h interval (→WP-68). |
| WP-68 | todo | — | — | — | Audit: production TESTING/CORS guards, separate outbox key, uniform resend-code, short ARQ health interval. After WP-66. |
| WP-69 | todo | — | — | — | Audit: payment idempotency, ordered copy locks, debtor cache, SQL analytics, measured indexes. After WP-46/53. |
| WP-70 | todo | — | — | — | WP-48 pip-audit: aiohttp, pillow, certifi, ecdsa, python-jose (20 advisories). After WP-48. |

43/70 accepted; 27 remain. 2026-10-21: orchestration taken over (previous agent idle since 10-20 20:15); candidates 32/35/37/40/41/43/49 on remediation/combined-audit-20261020 await integration with master; 44/45/46 worktrees dirty, to resume. WP-65–69 added from production audit. Frontend handoffs in UX plan.

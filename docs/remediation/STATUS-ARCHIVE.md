# Remediation status archive

Accepted rows WP-01 to WP-35, moved from STATUS.md to keep it under the 20 KB file limit. Not edited further.

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
| WP-26 | done | master | 2026-10-18 | Executor backend 778 pass/6 fail (all six known Alembic multiple-heads, reproduced on b64b617) | PASS with gaps f12d2ae: registry fails closed, expiring private URLs. Gaps: fake GCS only; main.py serves /storage locally; DocumentDeliveryService unchanged. logs wp26-sol/. |
| WP-27 | done | remediation/wp-27-webhook-lifecycle | 2026-10-15 | Backend 356 pass (200.44s) | PASS after one FAIL correction. Explicit registration CLI; instance shutdown closes local resources. Owner /root/wp05_executor. Logs wp13-recovery/wp27-root-*.log. Real registration not executed. |
| WP-28 | done | remediation/wp-28-webhook-errors | 2026-10-15 | Backend 363 pass (195.18s) | PASS; malformed JSON/UTF-8 400, invalid schema 422, processing failure 503, real rollback/retry preserves one binding. earlier executor storage-override failure resolved. |
| WP-29 | done | master | 2026-10-18 | Executor backend 909 pass | PASS; exam-result and document intents written in the business transaction, stable job IDs, retry after Redis failure, shared producer closed on shutdown. Scope revision: outbox model, repository-free migration rwp29, workers/settings, approved replacement of one WP-13 test. logs wp29-sol/. |
| WP-30 | done | master | 2026-10-19 | Python3.12 baseline988 pass | PASS code4a5eb95, merge587d2c6. Atomic claims, finite bounded recovery, source checks; at-least-once transport and drain-before-worker-owner-switch required. Frontend owner must add queued/inflight types and translated DeliveryLog states; frontend checks excluded. Evidence wp30-sol/ and root-audit/wp30-*. |
| WP-31 | done | master | 2026-10-20 | Python3.12 baseline1088 pass | PASS code7ed3131, merge874c46e; merged backend byte-identical to tested candidate. Separate sibling/document revisions and cross-date dedup; conservative cutover observations preserve history. Drain pending work before worker owner switch; previous-image recovery unsupported. Evidence wp31-sol/ and root-audit/wp31-*. |
| WP-32 | done | master | 2026-10-21 | int1 full 1531 pass, 2 env fails = master (wp11/25) | Integrated 0fe2147 via remediation/integration-r1. |
| WP-33 | done | master | 2026-10-20 | Full1103 pass645.87s/5 warnings | PASS code6d5aaa6 mergebd1d301; backend byte-identical to full-tested candidate. Explicit zero/unknown grading; SQL ranks/aggregates; client rank0 handoff pending separate frontend owner. logs wp33-sol/, root-audit/wp33-*.log. |
| WP-34 | done | master | 2026-10-22 | Full1108 pass601.27s; focused35; cohort mutation caught | Backend PASS code9a2afe9 merge3a2fe90; client nullable types closed by FE-R34 (ux-overhaul, accepted). Reads3276000→31200. logs wp34-sol/, root-audit/wp34-*. |
| WP-35 | done | master | 2026-10-21 | int1 full 1531 pass, 2 env fails = master (wp11/25) | Integrated 0fe2147 via remediation/integration-r1. |

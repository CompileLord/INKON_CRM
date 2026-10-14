# Remediation roadmap

All work here is planned, not executed. The planner worked alone. Phase order is mandatory; within a phase use the dependency-ready waves below. Numbering identifies packages, not a blanket numerical execution order: e.g. WP-63 and WP-64 are Phase 3 contributors and WP-62 is the final re-audit.

## Phases and risk ordering

- **Phase 0 — baseline (2 WPs):** isolate and record existing suites, then write reproducible Critical failures. Do not run destructive fixtures against ordinary services.
- **Phase 1 — Critical fixes (9 WPs):** account isolation/private bytes first, small fail-closed cron/scope fixes, ledger serialization then reversal eligibility, plus operational/test/configuration blockers. Each distinct Critical root cause has its own PR.
- **Phase 2 — High security/performance and prerequisites (12 WPs):** TLS, Redis, artifacts, guardian/directory controls, recovery, mail transactions, analytics coalescing, atomic authentication budgets. Autosave is explicitly promoted for conflict correctness and per-cell flush cost. Cache generations precede coalescing so optimization cannot preserve stale data.
- **Phase 3 — Medium/Low and structure (40 WPs):** bounded data paths, delivery correctness, grading semantics, migrations, resource budgets, typed interfaces and focused extractions. Performance hypotheses require measured keep/reject decisions; no automatic speculative index/cursor rewrite.
- **Phase 4 — re-audit (1 WP):** independently verify every ID, Critical reproduction, migration and performance claim; revisit the policy deferral without changing old reports.

Risk/effort rule: cheap directly reachable boundary fixes are early, but token identity, private bytes and money integrity dominate. Dependencies override apparent speed. Phase 0 uses temporary isolation to safely obtain a pre-fix baseline; permanent fixture safety is WP-09. No deployment occurs until Critical gates are green.

## Recommended single-agent sequence

WP-01 → WP-02 → WP-03 → WP-04 → WP-05 → WP-06 → WP-07 → WP-08 → WP-09 → WP-10 → WP-11 → WP-12 → WP-13 → WP-14 → WP-15 → WP-16 → WP-17 → WP-18 → WP-19 → WP-20 → WP-21 → WP-22 → WP-23 → WP-24 → WP-25 → WP-26 → WP-27 → WP-28 → WP-29 → WP-30 → WP-31 → WP-32 → WP-33 → WP-34 → WP-35 → WP-36 → WP-37 → WP-38 → WP-39 → WP-40 → WP-41 → WP-42 → WP-43 → WP-44 → WP-45 → WP-46 → WP-47 → WP-48 → WP-49 → WP-50 → WP-51 → WP-55 → WP-57 → WP-58 → WP-56 → WP-54 → WP-59 → WP-61 → WP-60 → WP-63 → WP-53 → WP-52 → WP-64 → WP-62.

First five packages: **WP-01, WP-02, WP-03, WP-04, WP-05**.

## Parallel-ready waves

Each row is a maximal currently ready wave under the conservative file-order graph. Finish the prior wave in that phase before starting the next row. Packages in one row have disjoint source write sets and no dependency on one another. Separate disposable DB/Redis test targets are required. `STATUS.md` is the sole shared administrative exception: merge row updates one at a time at integration, never overwrite the ledger.

| Phase | Wave | WPs eligible together |
|---|---|---|
| 0 | 1 | WP-01 |
| 0 | 2 | WP-02 |
| 1 | 3 | WP-03, WP-04, WP-05, WP-09, WP-10, WP-11 |
| 1 | 4 | WP-06, WP-07 |
| 1 | 5 | WP-08 |
| 2 | 6 | WP-12, WP-13, WP-14, WP-15, WP-17 |
| 2 | 7 | WP-16, WP-21, WP-22 |
| 2 | 8 | WP-18 |
| 2 | 9 | WP-19, WP-23 |
| 2 | 10 | WP-20 |
| 3 | 11 | WP-24, WP-25, WP-27, WP-28, WP-38, WP-42, WP-47, WP-59 |
| 3 | 12 | WP-26, WP-36 |
| 3 | 13 | WP-29, WP-61 |
| 3 | 14 | WP-30, WP-60 |
| 3 | 15 | WP-31 |
| 3 | 16 | WP-32, WP-33 |
| 3 | 17 | WP-34, WP-37, WP-39 |
| 3 | 18 | WP-35 |
| 3 | 19 | WP-40, WP-43 |
| 3 | 20 | WP-41, WP-44, WP-45, WP-46, WP-48, WP-50 |
| 3 | 21 | WP-49, WP-64 |
| 3 | 22 | WP-51, WP-57 |
| 3 | 23 | WP-55, WP-58, WP-63 |
| 3 | 24 | WP-56 |
| 3 | 25 | WP-54 |
| 3 | 26 | WP-53 |
| 3 | 27 | WP-52 |
| 4 | 28 | WP-62 |

## Sequential boundaries

The backlog/task files explicitly list every overlapping file and required predecessor. In particular: refresh identity precedes scope/recovery/offload/refactoring; account serialization precedes refund/period/installment changes; mail outbox precedes notification outbox/claims/revisions; grading-state precedes chart/rank/history work; contract-producing PRs and the Alembic revision chain are serialized. Do not parallelize two finance_service.py or user_repository.py edits merely because the functions differ.

## Good candidates for subagents later

Use agents only when implementation is authorized. Small disjoint security fixes (SMTP certificate handling, build exclusions, mentor-directory filtering where the ready-wave prerequisites permit), model cleanup, index measurement and isolated webhook handling are useful independent assignments. Each agent receives only README plus its own self-contained WP. Keep ledger locking, recovery state, grading-state design and shared finance/refactor integration under one accountable owner; their shared-file order is intentional. Use the actual ready-wave table rather than launching all Phase 2 or all Phase 3 packages together.

## Gates and residuals

WP-02 produces explicit failing security tests in a module outside default collection; record them as known red, never skip/xfail or call them fixed. WP-03/WP-04 run their targeted selectors and WP-07 runs the whole module; WP-62 runs it again. Existing integration tests remain required before/after each fix. External IAM/firewall, legacy cache/artifact cleanup and retention decisions require concrete recorded operational evidence; repository edits alone do not prove them.

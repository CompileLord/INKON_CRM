# Remediation progress

Allowed statuses: todo, in_progress, blocked, done. A failing or unrun required gate cannot be marked done.

| WP | Status | Branch / PR | Date (UTC) | Tests run and result | Notes |
|---|---|---|---|---|---|
| WP-01 | done | remediation/wp-01-baseline / no PR | 2026-10-14 | Backend integration 100 passed (58.04s); full backend 100 passed (55.47s); Vitest 115 passed; root tsc exit 0 | Conda base resolved in disposable Podman runtime. Extra app typecheck failed; npm audit 7 high/11 moderate. Frontend exceptions assigned to other agent by user; see results/WP-01.md. |
| WP-02 | done | remediation/wp-02-critical-reproductions / no PR | 2026-10-14 | Default backend 100 passed (56.51s); explicit module 4 expected assertion failures in four runs (final 3.74s) | Expected-failing test-only acceptance exception; no defects closed. Independent review approved; see results/WP-02.md. Frontend owned separately by user instruction. |
| WP-03 | done | remediation/wp-03-refresh-identity / no PR | 2026-10-14 | Independent full backend 115 passed (60.86s); targeted 16 passed; expiry mutation caught; migration replay exit 0 | PASS after one correction audit. Unique identity-bound refresh, atomic rotation and legacy revocation. Executor /root/wp02_review; see results/WP-03.md. Frontend owned separately. |
| WP-05 | done | remediation/wp-05-cron-authorization / no PR | 2026-10-14 | Independent backend 133 passed (65.89s); targeted 18 passed; inverted comparison caught (4 failures) | PASS; accepted fix pending sequential integration after WP-04 audit. Executor /root/wp05_executor, isolated pod/worktree; see results/WP-05.md. Frontend owned separately. |
| WP-06 | done | remediation/wp-06-onboarding-scope / no PR | 2026-10-14 | Independent backend 164 passed (70.42s); targeted 31 passed; three guard mutations caught | PASS after two FAIL audits and /root takeover; independent reviewer approved. Executor /root/wp05_executor retained. Accepted fix pending sequential integration; see results/WP-06.md. Frontend separately owned. |

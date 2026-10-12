# KITOB implementation

Group 01 is accepted. Group 02 has an accepted directory, course identity/Overview, shared drawer and roster/candidate contract. Students/enrollment and course forms are being implemented. Remaining page groups have not started.

[Current task/session record](ledger.json) is the recovery entry point. [Subgroup boundaries](SUBGROUPS.md) define session reuse, dependencies and parallel ownership. Taskmaster remains the source of task definitions and completion status. Do not infer completion from an agent report or screenshot count.

## Accepted work and visual evidence

| Area | Final audit | Screenshots and interaction evidence |
| --- | --- | --- |
| Shared foundation | [Audit](group-01/task-01/audit-codex.md) | [Actual component captures](group-01/task-01/codex-screenshots/) |
| Identity prerequisite | [Audit](group-01/task-02/audit.md) | [Identity renders](group-01/task-02/screenshots/) |
| Shell and navigation | [Audit](group-01/task-03/audit.md) | [Role/theme captures](group-01/task-03/screenshots/) |
| Editable SVG artwork | [Audit](group-01/task-svg/audit.md) | [Final verification](group-01/task-svg/root-final/) |
| Login | [Audit](group-01/task-04/audit.md) | [Final renders](group-01/task-04/attempt3/screenshots/) |
| Verify email | [Audit](group-01/task-05/audit.md) | [Final renders](group-01/task-05/attempt2/screenshots/) |
| Set password | [Audit](group-01/task-06/audit.md) | [Final renders](group-01/task-06/attempt4/screenshots/) |
| Superadmin dashboard | [Audit](group-01/task-07/audit.md) | [Final renders](group-01/task-07/attempt4/screenshots/) |
| Mentor dashboard | [Audit](group-01/task-08/audit.md) | [Final renders](group-01/task-08/attempt4/screenshots/) |
| Student dashboard | [Audit](group-01/task-09/audit.md) | [Final renders](group-01/task-09/attempt4/screenshots/) |
| Accountant dashboard | [Audit](group-01/task-10/audit.md) | [Before/after entry point](group-01/task-10/takeover/README.md) |
| Attention-to-Finance | [Audit](group-01/task-11/audit.md) | [Before/after entry point](group-01/task-11/README.md) |
| Group 01 integration | [Audit](group-01/task-12/audit.md) | [Before/after entry point](group-01/task-12/README.md) |
| Course directory | [Audit](group-02/task-01/audit.md) | [Before/after entry point](group-02/task-01/README.md) |
| Course identity and Overview | [Audit](group-02/task-02/audit.md) | [Final screenshot manifest](group-02/task-02/independent-attempt9/manifest.json), [interaction probes](group-02/task-02/independent-attempt9/probes.json) |
| Native drawer | [Audit](group-02/course-forms/drawer-audit.md) | [Final screenshot manifest](group-02/course-forms/drawer-attempt3/manifest.json) |
| Roster/candidate contract | [Audit](group-02/students-enrollment/contract-audit.md) | Contract-only prerequisite; no page screenshots |

Final capture directories retain their original names so existing links and screenshot manifests remain valid. Images may show labeled simulations for loading or error states. Only the final audit establishes accepted scope; legacy content visible inside a screenshot may still belong to a pending task.

## Retention rules

Mandatory for planners, orchestrators, auditors and executors: [AGENTS.md sections 4.3–4.4](../../AGENTS.md).

Keep one final audit per accepted task, its final test results, screenshot manifest/probes and accepted images. Keep the current handoff and unresolved failure evidence for unfinished work. Keep session IDs, dependencies, accepted commits and hardware/external gaps in the current status record.

Remove superseded retry handoffs/results, intermediate audits and rejected capture folders after the final evidence replaces them. Git history retains removed historical artifacts. Do not retain another report that only repeats the audit or task status. Agents must not edit status records, and a documentation cleanup must not delete their active inputs or logs.

Capture and verification helpers remain at this folder's root. Original baseline galleries and design specifications stay in [redesign-audit](../redesign-audit/README.md).

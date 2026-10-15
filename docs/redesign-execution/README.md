# KITOB implementation

Group 01 and Group 02 are accepted with recorded hardware gaps. Group 03 has accepted both Students and Mentors directories with create/edit workflows and the shared avatar/pagination prerequisites. Student profiles and the Mentor API prerequisite are accepted. Authorized document byte delivery, Mentor profiles, the Documents panes and the Group 03 integration audit are accepted; Group 03 is complete. Group 04 journal persistence (queue owner, drain, conflicts) the journals hub and the workspace routing/desktop grid the phone/tablet Lesson view Summary/breakdown, Period settings, Progress and the Group 04 integration audit are accepted; Group 04 is complete. Profile performance provenance and nullable account-field persistence prerequisites are accepted. The user-requested journal conflict hotfix is accepted separately from the future Group 04 redesign. Groups 05–06 redesign work remains.

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
| Course create/edit | [Audit](group-02/course-forms/form/audit.md) | [Manifest](group-02/course-forms/form-attempt1/manifest.json), [probes](group-02/course-forms/form-attempt1/probes.json) |
| Course lifecycle integration | [Audit](group-02/course-forms/lifecycle/audit.md) | [Manifest](group-02/course-forms/lifecycle/evidence/manifest.json), [probes](group-02/course-forms/lifecycle/evidence/probes.json) |
| Students, enrollment and withdrawal | [Audit](group-02/students-enrollment/students/audit.md) | [Manifest](group-02/students-enrollment/students-attempt1/manifest.json), [probes](group-02/students-enrollment/students-attempt1/probes.json) |
| Course Progress | [Audit](group-02/progress/ui/audit.md) | [Evidence](group-02/progress/ui/evidence/manifest.json) |
| Group 02 integration | [Audit](group-02/integration/audit.md) | Final integration and regression checks |
| Students directory and forms | [Audit](group-03/students/directory/audit.md) | [Screenshots](group-03/students/directory/evidence/screenshots/), [manifest](group-03/students/directory/evidence/manifest.json), [probes](group-03/students/directory/evidence/probes.json) |
| Mentors directory and forms | [Audit](group-03/mentors/directory/audit.md) | [Screenshots](group-03/mentors/directory/evidence/screenshots/), [manifest](group-03/mentors/directory/evidence/manifest.json), [probes](group-03/mentors/directory/evidence/probes.json) |
| Shared pagination | [Audit](group-03/pagination/audit.md) | Real pagination captures in the Mentors evidence above |
| Profile performance contract | [Audit](group-03/student-profile/contract/audit.md) | Contract-only prerequisite; no page screenshot claim |
| Nullable profile field persistence | [Audit](group-03/nullable-profile-patch/audit.md) | [API regression evidence](group-03/nullable-profile-patch/evidence/probes.json) |
| Student profiles | [Audit](group-03/student-profile/page/audit.md) | [Screenshots](group-03/student-profile/page/evidence/screenshots/), [manifest](group-03/student-profile/page/evidence/manifest.json), [probes](group-03/student-profile/page/evidence/probes.json) |
| Mentor aggregate contract | [Audit](group-03/mentor-profile/contract/audit.md) | API-only prerequisite; recorded SQL/HTTPX evidence |
| Mentor profiles | [Audit](group-03/mentor-profile/page/audit.md) | [Screenshots](group-03/mentor-profile/page/evidence/screenshots/), [manifest](group-03/mentor-profile/page/evidence/manifest.json), [probes](group-03/mentor-profile/page/evidence/probes.json) |
| Authorized document byte delivery | [Audit](group-03/documents/contract/audit.md) | [Guarded-download captures](group-03/documents/contract/evidence/manifest.json), [byte-delivery probes](group-03/documents/contract/evidence/probes.json) |
| Documents panes | [Audit](group-03/documents/pane/audit.md) | [Screenshots](group-03/documents/pane/evidence/screenshots/), [manifest](group-03/documents/pane/evidence/manifest.json), [probes](group-03/documents/pane/evidence/probes.json) |
| Group 03 integration | [Audit](group-03/integration/audit.md) | [Screenshots](group-03/integration/evidence/screenshots/), [manifest](group-03/integration/evidence/manifest.json), [probes](group-03/integration/evidence/probes.json) |
| Journal persistence owner | [Audit](group-04/reliability/audit.md) | [Screenshots](group-04/reliability/evidence/screenshots/), [manifest](group-04/reliability/evidence/manifest.json), [probes](group-04/reliability/evidence/probes.json) |
| Journals hub | [Audit](group-04/hub/audit.md) | [Screenshots](group-04/hub/evidence/screenshots/), [manifest](group-04/hub/evidence/manifest.json), [probes](group-04/hub/evidence/probes.json) |
| Journal workspace and desktop grid | [Audit](group-04/workspace/audit.md) | [Screenshots](group-04/workspace/evidence/screenshots/), [manifest](group-04/workspace/evidence/manifest.json), [probes](group-04/workspace/evidence/probes.json) |
| Journal Lesson view | [Audit](group-04/lesson/audit.md) | [Screenshots](group-04/lesson/evidence/screenshots/), [manifest](group-04/lesson/evidence/manifest.json), [probes](group-04/lesson/evidence/probes.json) |
| Journal Summary and breakdown | [Audit](group-04/summary/audit.md) | [Screenshots](group-04/summary/evidence/screenshots/), [manifest](group-04/summary/evidence/manifest.json), [probes](group-04/summary/evidence/probes.json) |
| Journal Period settings | [Audit](group-04/settings-progress/audit.md) | [Screenshots](group-04/settings-progress/evidence/screenshots/), [manifest](group-04/settings-progress/evidence/manifest.json), [probes](group-04/settings-progress/evidence/probes.json) |
| Journal Progress | [Audit](group-04/settings-progress/audit.md) | [Screenshots](group-04/settings-progress/evidence/progress/screenshots/), [manifest](group-04/settings-progress/evidence/progress/manifest.json), [probes](group-04/settings-progress/evidence/progress/probes.json) |
| Group 04 integration | [Audit](group-04/integration/audit.md) | [Screenshots](group-04/integration/evidence/screenshots/), [manifest](group-04/integration/evidence/manifest.json), [probes](group-04/integration/evidence/probes.json) |
| Journal conflict hotfix | [Audit](hotfix-journal-conflicts/audit.md) | [Screenshots](hotfix-journal-conflicts/evidence/screenshots/), [manifest](hotfix-journal-conflicts/evidence/manifest.json), [probes](hotfix-journal-conflicts/evidence/probes.json) |

Final capture directories retain their original names so existing links and screenshot manifests remain valid. Images may show labeled simulations for loading or error states. Only the final audit establishes accepted scope; legacy content visible inside a screenshot may still belong to a pending task.

## Retention rules

Mandatory for planners, orchestrators, auditors and executors: [AGENTS.md sections 4.3–4.5](../../AGENTS.md).

Keep one final audit per accepted task, its final test results, screenshot manifest/probes and accepted images. Keep the current handoff and unresolved failure evidence for unfinished work. Keep session IDs, dependencies, accepted commits and hardware/external gaps in the current status record.

Remove superseded retry handoffs/results, intermediate audits and rejected capture folders after the final evidence replaces them. Git history retains removed historical artifacts. Do not retain another report that only repeats the audit or task status. Agents must not edit status records, and a documentation cleanup must not delete their active inputs or logs.

Capture and verification helpers remain at this folder's root. Original baseline galleries and design specifications stay in [redesign-audit](../redesign-audit/README.md).

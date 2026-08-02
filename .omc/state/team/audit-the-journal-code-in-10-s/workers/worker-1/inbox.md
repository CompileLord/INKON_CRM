## REQUIRED: Task Lifecycle Commands
You MUST run these commands. Do NOT skip any step.

1. Claim your task:
   omc team api claim-task --input '{"team_name":"audit-the-journal-code-in-10-s","task_id":"1","worker":"worker-1"}' --json
   Save the claim_token from the response.
2. Do the work described below.
3. On completion (use claim_token from step 1):
   omc team api transition-task-status --input '{"team_name":"audit-the-journal-code-in-10-s","task_id":"1","from":"in_progress","to":"completed","claim_token":"<claim_token>","result":"Summary: <what changed>\\nVerification: <tests/checks run>\\nSubagent skip reason: worker protocol forbids nested subagents; completed focused probe in-session"}' --json
   The result field is required for completion evidence. For broad delegated tasks, include either "Subagent skip reason: <why no nested worker was needed/allowed>" or, only when explicitly allowed by the leader, "Subagent spawn evidence: <child task names/thread ids and integrated findings>".
4. On failure (use claim_token from step 1):
   omc team api transition-task-status --input '{"team_name":"audit-the-journal-code-in-10-s","task_id":"1","from":"in_progress","to":"failed","claim_token":"<claim_token>"}' --json
5. ACK/progress replies are not a stop signal. Keep executing your assigned or next feasible work until the task is actually complete or failed, then transition and exit.

## Task Assignment
Task ID: 1
Worker: worker-1
Subject: audit the journal code in 10 sentences

audit the journal code in 10 sentences

REMINDER: You MUST run transition-task-status before exiting. Do NOT write done.json or edit task files directly.
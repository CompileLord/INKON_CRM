# Frontend rollback (Cloudflare Pages)

Project: `imkon-crm`. Every deploy is an immutable Pages deployment, so rollback re-promotes an earlier one.

## Dashboard

1. Cloudflare dashboard, Workers & Pages, `imkon-crm`, Deployments.
2. Pick the last good deployment in the Production (branch `main`) list.
3. Open its menu and choose "Rollback to this deployment".

## CLI

```
npx wrangler pages deployment list --project-name=imkon-crm
```

Rollback is a dashboard action. From the CLI, redeploy the last good tag instead: run the "Deploy Frontend" workflow through workflow_dispatch with environment `production`, selecting the previous `v*` tag as the ref.

## Notes

- Staging is the Pages branch alias `staging`; PR previews are `pr-<number>`.
- If the API contract changed, roll back the backend first (see the backend runbook), then the frontend.
- Hashed `/assets/*` are immutable and old ones stay served, so a rollback never leaves a half-cached bundle.

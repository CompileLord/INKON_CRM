from pathlib import Path
import json,re,os,collections,ast
R=Path.cwd(); O=R/'docs/remediation'; F={f['id']:f for f in json.loads((O/'_work/findings.json').read_text())}; W=json.loads((O/'_work/work-packages.json').read_text()); D={w['id']:w for w in W}
contrib={
'WP-02':['BUS-01','SEC-BUS-01','API-01','BUS-02'],
'WP-12':['PERF-BUS-01'],
'WP-19':['BUS-11'],
'WP-21':['BUS-20'],
'WP-26':['API-10','BUS-19'],
'WP-32':['BUS-20'],
'WP-34':['API-10','API-11'],
'WP-40':['API-11'],
'WP-46':['BUS-19'],
'WP-51':['API-10'],
'WP-53':['API-10'],
'WP-55':['BUS-19','BUS-20'],
'WP-56':['BUS-20'],
'WP-57':['API-11'],
'WP-58':['API-11'],
'WP-61':['BUS-15'],
'WP-63':['BUS-19'],
}
owner={i:w['id'] for w in W for i in w['findings']}

def topo():
 out=[]; done=set()
 while len(out)<len(W):
  ready=sorted([w for w in W if w['id'] not in done and set(w['deps'])<=done],key=lambda w:(w['phase'],w['number']))
  if not ready:raise ValueError('Dependency cycle: '+str({w['id']:set(w['deps'])-done for w in W if w['id'] not in done}))
  w=ready[0];out.append(w);done.add(w['id'])
 return out
order=topo(); last={}
for w in order:
 w['semantic_deps']=w['deps'][:]; w['shared_order']={}
 resources=[p for p in w['files'] if not p.startswith('docs/remediation/')]
 if any('/alembic/versions/' in p for p in resources):resources+=['Alembic single-head revision chain']
 for p in resources:
  if p in last:
   prior=last[p]
   w['shared_order'].setdefault(prior,[]).append(p)
   if prior not in w['deps']:w['deps'].append(prior)
  last[p]=w['id']
 w['contributes']=contrib.get(w['id'],[])
order=topo()
# Every numbered finding has exactly one closure owner or an explicit disposition.
assert len(owner)==74
assert set(F)-set(owner)=={'SEC-DATA-04'}
assert all(D[d]['phase']<=w['phase'] for w in W for d in w['deps'])
# Source references are verified on this planning snapshot; missing paths are deliberate NEW files.
def references(w):
 ids=w['findings']+w['contributes']; refs=[]
 for i in ids:
  for p,r in F[i]['locations']:
   if (p,r) not in refs:refs.append((p,r))
 if not refs:
  refs=[('backend/app/tests/conftest.py','10-28,59-80'),('backend/app/core/security.py','60-72'),('backend/app/main.py','67-70'),('backend/app/services/finance_service.py','736-770')]
 return refs

def source_line(p,w):
 for f,r in references(w):
  if f==p:return int(re.match(r'\d+',r)[0])
 if p.endswith('.py'):
  try:
   tree=ast.parse((R/p).read_text()); nodes=[n for n in tree.body if isinstance(n,(ast.ClassDef,ast.FunctionDef,ast.AsyncFunctionDef))]
   if nodes:return nodes[0].lineno
  except (SyntaxError,FileNotFoundError):pass
 return 1

def link(path,base,label=None,anchor=''):
 return '['+(label or path)+']('+os.path.relpath(R/path,base)+anchor+')'

def slug(s):return re.sub(r'[^\w\- ]','',s.lower()).replace(' ','-')
def reportlink(fid,base):
 f=F[fid];header=next(l[4:] for l in (R/f['source']).read_text().splitlines() if l.startswith('### '+fid+' —'))
 return link(f['source'],base,fid+' — report section','#'+slug(header))
def taskname(w):return w['id']+'-'+w['slug']+'.md'
def mdcell(s):return str(s).replace('|','/').replace('\n',' ')

common_checks='''Activate the repository Conda **base** environment (never create a venv):

```bash
source /workspace/miniconda3/etc/profile.d/conda.sh
conda activate base
```

Before and after the change, using the dedicated disposable runtime from WP-01/WP-09:

```bash
cd /workspace/INKON_CRM/backend
PYTHONDONTWRITEBYTECODE=1 python -m pytest app/tests -q -p no:cacheprovider
cd /workspace/INKON_CRM/frontend
npx vitest run
npx tsc --noEmit
```

Also run the targeted tests described here. Configure test storage/temp output and service targets **before imports**; the original fixture drops a PostgreSQL schema and flushes application-configured Redis. Never run it against ordinary shared services. Record exact commands, exit codes, baseline failures and new failures in this WP’s result file. No test result in this plan is an executed remediation result. Do not claim success from historical onboarding. Existing unrelated frontend/typecheck failures must be recorded and escalated, not silently fixed outside scope.
'''
for w in W:
 base=O/'tasks'; p=base/taskname(w); refs=references(w); lines=[]
 lines += ['# '+w['id']+' — '+w['title'],'',f"Phase **{w['phase']}** · Priority **{w['severity']}** · Effort **{w['effort']}** · Status **todo**",'', '## Goal','',w['title']+'. One bounded implementation session and one branch/PR; stop for rescoping if this scope will not fit.','','## Why it matters','']
 if w['findings']:
  for fid in w['findings']:lines += [f"- **{fid}** ({F[fid]['severity']}): {F[fid]['title']}. {reportlink(fid,base)}. Verification: {F[fid]['verification']}"]
 else:lines += ['This is an enabling, contributor or verification package; it does not independently own a source finding.']
 if w['contributes']:
  lines+=['','Contributes without duplicating coverage ownership: '+ '; '.join(f"{reportlink(fid,base)} (closure owner {owner.get(fid,'deferred')})" for fid in w['contributes'])+'.']
 lines+=['','Reports are provenance links, not required reading for execution; the relevant problem, evidence and action are included here. All source line numbers describe commit `32d7a07` as inspected on 2026-10-14. Locate the named operation after dependencies land; stop if behavior/assumptions have materially changed.','','## Exact files and lines','', '### Allowed writes','', '| File | Snapshot location / intent |','|---|---|']
 for f in dict.fromkeys(w['files']):
  if (R/f).exists():
   ln=source_line(f,w) if not f.startswith('docs/remediation/') else 1
   detail=f'Existing file, anchor line {ln}; only this WP’s stated behavior may change.'
   label=f'{f}:{ln}'
  else: detail='NEW file, no existing line number; exact creation path authorized by this WP.';label=f
  if f=='docs/remediation/STATUS.md':detail='Shared administrative progress ledger; integrate row updates serially, never overwrite another WP’s row.'
  lines += ['| '+link(f,base,label)+' | '+detail+' |']
 lines += ['','Only these exact paths may change. `NEW` paths are planned artifacts, not claims that the files already exist. Do not edit historical migration versions, audit reports, unrelated source or `.taskmaster`. Generated CONTRACT.md is permitted only where listed. Any additional path needs a plan revision before implementation.','','### Verified source evidence and read-only context','']
 for f,ra in refs:lines += ['- '+link(f,base,f+':'+ra)+' — current source range checked during planning. Context does not grant write ownership.']
 if w['number']==62:lines+=['- All repository source and all 12 original audit Markdown files may be read for the final re-audit; only listed results and STATUS may be written.']
 else:lines += ['- Callers, models, schemas, fixtures, dependency definitions and already-implemented dependency APIs may be read solely to validate this package; only the allowlist above may be edited. Among remediation planning documents, read only `00-README.md` and this task. Repository policy still applies; its relevant conventions are summarized in README.']
 first,ra=refs[0];a=int(re.match(r'\d+',ra)[0]); src=(R/first).read_text().splitlines(); excerpt=[]
 for i in range(a-1,min(a+7,len(src))):
  line=src[i]
  if 'password' in line.lower() and any(q in line for q in ['hash_password("','password="','logger.','echo ']):line='[credential-bearing source redacted]'
  excerpt.append(f'{i+1}: {line}')
 lines += ['','Snapshot excerpt from `'+first+'`:','','```text',*excerpt,'```','','## Step-by-step change','']
 for i,step in enumerate(w['steps'],1):lines += [f'{i}. {step}']
 if w['extra']:lines+=['',w['extra']]
 lines += ['','## Tests to write BEFORE the fix','']
 for test in w['tests']:lines+=['- '+test]
 if w['phase'] not in (0,4):lines += ['',f"Put new targeted tests in `backend/app/tests/integration/test_remediation_wp{w['number']:02}.py` unless an explicitly allowed existing test file is the relevant test. Use disposable PostgreSQL for locking/constraint races and separate sessions with barriers. Do not substitute a sequential mock for a concurrency invariant."]
 if w['severity']=='Critical':lines+=['','Critical rule: capture the reproducing failure **before** implementation, then demonstrate the same assertion passes afterward. No skip/xfail, weakened assertion or response-shape-only substitute. If reproducing evidence contradicts this plan, stop and report.']
 if w['number'] in (3,4,7):
  sel={3:' -k refresh_cross_user_same_second',4:' -k private_document_download',7:''}[w['number']]
  lines+=['','Explicit baseline module (run from backend):','','```bash','PYTHONDONTWRITEBYTECODE=1 python -m pytest app/tests/regression/critical_reproductions.py'+sel+' -q -p no:cacheprovider','```']
 lines += ['','## Acceptance criteria','',w['accept'],'','- The file allowlist is respected and all required checks have actual results recorded.','- Security, money, authorization, version and transaction invariants remain intact; no broader redesign is hidden in this PR.','- A failing gate is recorded as blocked, not done; no audit finding is closed solely because code changed.','','## How to verify','',common_checks]
 if w['measure']:lines += ['','Performance / operational evidence: '+w['measure'],'','Use equal datasets, hardware, concurrency and warm/cold conditions, repeat trials and record variance. Source-derived counts are not latency measurements. A hypothesis can be resolved by measured no-action evidence; retain the benchmark and residual decision instead of inventing an optimization win.']
 else:lines+=['','Verification focuses on the exact behavioral/security tests above. No speculative performance benchmark is required.']
 if any(f.endswith('CONTRACT.md') for f in w['files']):lines+=['','Regenerate contract with `python backend/scripts/generate_contract.py` from repository root in the isolated test environment; synchronize only the listed client types/callers and verify them by reading their contents (frontend/src/lib is broadly gitignored). New visible text must use existing translations or stop to add exact locale paths to the plan.']
 if any('/alembic/versions/' in f for f in w['files']):lines+=['','Use the exact NEW migration filename listed, a unique revision ID and the current single Alembic head after dependencies. Test upgrade, data preflight and rollback/recovery in a disposable database. Do not rewrite an applied revision or silently discard conflicting financial/authentication data.']
 lines+=['','## Risks and rollback','']
 if w['phase']==0: risk='Tests can destroy service state if isolation is wrong. Verify disposable targets before imports; stop on ambiguity. Rollback removes only this WP’s test/docs artifacts and disposes its dedicated runtime; never reset an existing user database.'
 elif w['phase']==4:risk='Re-audit can overstate closure if it relies on old reports or unrun tests. Preserve original evidence and record unresolved claims. Rollback only the new assessment documents; never alter old audits to match the desired verdict.'
 elif w['severity']=='Critical' or w['severity'].startswith('High'):risk='A rollback can reopen the verified security/integrity defect. Prefer roll-forward; if needed disable the affected operation while restoring the last safe code. Preserve durable records, token revocations and audit history. Rehearse additive schema compatibility before rollout; do not undo constraints by deleting data.'
 else:risk='Primary risks are semantic drift, migration/client incompatibility and larger shared-file changes after dependencies. Capture before/after behavior and measurements. Revert only this WP’s code or disable its optional optimization; retain earlier security fixes and durable data. For schema changes prefer forward correction after backup/rehearsal, never destructive data rollback.'
 lines += [risk,'', '## Dependencies and execution order','']
 lines += ['Functional prerequisites: '+(', '.join(w['semantic_deps']) or 'none')+'.']
 if w['shared_order']:
  lines+=['','Required shared-file / migration ordering:']
  for prior,paths in w['shared_order'].items():lines+=['- '+prior+' → '+w['id']+': '+', '.join('`'+p+'`' for p in paths)+'.']
 lines+=['','Complete prerequisites first and start from their merged result. Do not require reading their WP files: their IDs, required interfaces/behavior and shared-file order are given here. Stop if the prerequisite result is absent. Parallel work is allowed only with disjoint source files and no dependency; STATUS row integration is serialized.','','## Effort and completion','',f"**{w['effort']}**: "+{'S':'localized change or narrowly scoped evidence collection.','M':'one focused cross-layer root cause or bounded extraction with targeted tests.','L':'larger but still single-session change; rescope before implementation if it does not fit.'}[w['effort']], '',f"Use branch `remediation/{w['id'].lower()}-{w['slug']}` and one PR for this WP. Save actual evidence in `{w['record']}` and update only its row in `docs/remediation/STATUS.md` with branch/PR, date, tests/results and residual risks. No push/PR publication occurs in this planning task.", '']
 p.write_text('\n'.join(lines))
# Persist finalized dependencies and ownership before writing overview files.
(O/'_work/work-packages.json').write_text(json.dumps(W,indent=2))
counts=collections.Counter(w['phase'] for w in W)
rows=['# Master remediation backlog','','Snapshot: `32d7a07`, reviewed 2026-10-14. **75 source findings; 74 uniquely assigned, 1 deferred, 0 rejected. 64 work packages.** All implementation statuses start at `todo`. No fixes or runtime test results are claimed.','','A work package is one focused branch/PR. A broad finding has exactly one accountable closure owner; smaller contributors are not duplicate coverage mappings. That owner depends on all named contributions and must verify its complete scope before closing the finding. Baseline/re-audit and supporting extraction packages may own no additional finding. Quality `Required`/`Optional`/`Nit` labels are preserved in the findings table; backlog priority is a separately stated risk decision. Phase 2 explicitly includes autosave (source Medium) and enabling cache generation work.','','| WP | Title | Phase | Severity / priority | Source finding IDs (closure owner) | Exact allowed files | Depends on | Effort | Status |','|---|---|---|---|---|---|---|---|---|']
for w in order:
 vals=[link('docs/remediation/tasks/'+taskname(w),O,w['id']),w['title'],w['phase'],w['severity'],', '.join(w['findings']) or 'Enabler/contributor: '+(', '.join(w['contributes']) or 'baseline/re-audit'),'<br>'.join('`'+p+'`' for p in w['files']),', '.join(w['deps']) or '—',w['effort'],'todo']
 rows += ['| '+' | '.join(map(mdcell,vals))+' |']
rows+=['','## Coverage: one disposition per source finding','','| Source ID | Source report | Source severity / impact | Closure owner / disposition | Reason / contributor completion gate |','|---|---|---|---|---|']
for fid,f in F.items():
 contributors=[w['id'] for w in W if fid in w['contributes'] and w['number']!=2]
 disposition=owner.get(fid,'deferred')
 reason='Verified current source; '+('complete contributors '+', '.join(contributors)+' before closure.' if contributors else 'bounded fix/measurement in owning WP.')
 if fid=='SEC-DATA-04':reason='Deferred: no approved retention duration, financial/legal exception or backup policy. Data/product owner must specify these; WP-62 revisits. Do not erase PII or financial evidence by inference. Source mechanism confirmed.'
 rows+=['| '+' | '.join(map(mdcell,[fid,link(f['source'],O,Path(f['source']).name),f['severity'],disposition,reason]))+' |']
rows+=['','Coverage arithmetic: **48 quality + 13 security + 14 performance = 75**. **74 WP assignments + 1 explicit deferral = 75**. Unmapped IDs: **none**. Duplicate owners: **none**. Rejected IDs: **none**. No source issue was found to be obsolete; citation/qualification corrections are recorded in the master findings table.','','SEC-BUS-01 is confirmation of BUS-01 and shares WP-03 with DATA-04. All nine distinct Critical root causes have a dedicated WP (WP-03 through WP-11); no unrelated Critical issues are combined. Required/High work is not silently demoted by deduplication.','','## Deferred policy decision','','SEC-DATA-04 remains open. Owner: data/product owner with financial-record and backup stakeholders. Required input: purpose, lawful/operational retention durations by store, approved erasure authority, financial exceptions and backup expiry. Revisit at WP-62 (or sooner if policy arrives); then create a focused implementation WP. No invented legal requirement or automatic deletion schedule is authorized.','']
(O/'01-master-backlog.md').write_text('\n'.join(rows))
# Scheduling waves respect all dependencies, shared file order, migrations and phase boundaries.
waves=[];done=set()
for phase in range(5):
 pending={w['id'] for w in W if w['phase']==phase}
 while pending:
  ready=sorted([D[i] for i in pending if set(D[i]['deps'])<=done],key=lambda w:w['number'])
  assert ready,('stuck',phase,pending)
  source_sets=[set(p for p in w['files'] if not p.startswith('docs/remediation/')) for w in ready]
  assert all(not a&b for i,a in enumerate(source_sets) for b in source_sets[i+1:])
  waves.append((phase,[w['id'] for w in ready]));done.update(w['id'] for w in ready);pending-=done
road=['# Remediation roadmap','','All work here is planned, not executed. The planner worked alone. Phase order is mandatory; within a phase use the dependency-ready waves below. Numbering identifies packages, not a blanket numerical execution order: e.g. WP-63 and WP-64 are Phase 3 contributors and WP-62 is the final re-audit.','','## Phases and risk ordering','','- **Phase 0 — baseline (2 WPs):** isolate and record existing suites, then write reproducible Critical failures. Do not run destructive fixtures against ordinary services.','- **Phase 1 — Critical fixes (9 WPs):** account isolation/private bytes first, small fail-closed cron/scope fixes, ledger serialization then reversal eligibility, plus operational/test/configuration blockers. Each distinct Critical root cause has its own PR.','- **Phase 2 — High security/performance and prerequisites (12 WPs):** TLS, Redis, artifacts, guardian/directory controls, recovery, mail transactions, analytics coalescing, atomic authentication budgets. Autosave is explicitly promoted for conflict correctness and per-cell flush cost. Cache generations precede coalescing so optimization cannot preserve stale data.','- **Phase 3 — Medium/Low and structure (40 WPs):** bounded data paths, delivery correctness, grading semantics, migrations, resource budgets, typed interfaces and focused extractions. Performance hypotheses require measured keep/reject decisions; no automatic speculative index/cursor rewrite.','- **Phase 4 — re-audit (1 WP):** independently verify every ID, Critical reproduction, migration and performance claim; revisit the policy deferral without changing old reports.','','Risk/effort rule: cheap directly reachable boundary fixes are early, but token identity, private bytes and money integrity dominate. Dependencies override apparent speed. Phase 0 uses temporary isolation to safely obtain a pre-fix baseline; permanent fixture safety is WP-09. No deployment occurs until Critical gates are green.','','## Recommended single-agent sequence','',' → '.join(w['id'] for w in order)+'.','','First five packages: **WP-01, WP-02, WP-03, WP-04, WP-05**.','','## Parallel-ready waves','','Each row is a maximal currently ready wave under the conservative file-order graph. Finish the prior wave in that phase before starting the next row. Packages in one row have disjoint source write sets and no dependency on one another. Separate disposable DB/Redis test targets are required. `STATUS.md` is the sole shared administrative exception: merge row updates one at a time at integration, never overwrite the ledger.','','| Phase | Wave | WPs eligible together |','|---|---|---|']
for ix,(phase,ids) in enumerate(waves,1):road+=['| '+str(phase)+' | '+str(ix)+' | '+', '.join(ids)+' |']
road+=['','## Sequential boundaries','','The backlog/task files explicitly list every overlapping file and required predecessor. In particular: refresh identity precedes scope/recovery/offload/refactoring; account serialization precedes refund/period/installment changes; mail outbox precedes notification outbox/claims/revisions; grading-state precedes chart/rank/history work; contract-producing PRs and the Alembic revision chain are serialized. Do not parallelize two finance_service.py or user_repository.py edits merely because the functions differ.','','## Good candidates for subagents later','','Use agents only when implementation is authorized. Small disjoint security fixes (SMTP certificate handling, build exclusions, mentor-directory filtering where the ready-wave prerequisites permit), model cleanup, index measurement and isolated webhook handling are useful independent assignments. Each agent receives only README plus its own self-contained WP. Keep ledger locking, recovery state, grading-state design and shared finance/refactor integration under one accountable owner; their shared-file order is intentional. Use the actual ready-wave table rather than launching all Phase 2 or all Phase 3 packages together.','','## Gates and residuals','','WP-02 produces explicit failing security tests in a module outside default collection; record them as known red, never skip/xfail or call them fixed. WP-03/WP-04 run their targeted selectors and WP-07 runs the whole module; WP-62 runs it again. Existing integration tests remain required before/after each fix. External IAM/firewall, legacy cache/artifact cleanup and retention decisions require concrete recorded operational evidence; repository edits alone do not prove them.','']
(O/'02-roadmap.md').write_text('\n'.join(road))
readme='''# Backend remediation plan

This folder turns the existing quality, security and performance audits into implementation-sized work. The planning snapshot is commit `32d7a07`, verified against current source on 2026-10-14. **75 findings, 64 work packages: 74 findings assigned once, 1 policy deferral, 0 rejected.** This planning pass changed documentation only, used no subagents and did not execute integration/load tests or implement fixes.

## Folder map

- `00-README.md`: execution rules for every implementation agent.
- `01-master-backlog.md`: closure owners, exact files, dependencies and all 75 source-ID dispositions.
- `02-roadmap.md`: phase order, conservative sequential boundaries and disjoint parallel waves.
- `STATUS.md`: initially empty progress ledger; never infer completion from this plan.
- `tasks/WP-NN-*.md`: self-contained branch/PR scopes, evidence, test-first actions, acceptance and rollback.
- `_work/findings-table.md`: every source finding, original labels, exact locations and source verification.
- `_work/findings.json`, `work-packages.json`, `source-evidence.md`: saved extraction/planning checkpoints, including qualified source evidence. `_work/baseline.json` and `verification.md` support write-boundary and coverage checks. Build/render scripts reproduce these planning documents; implementation agents must not run them.
- `results/`: future per-WP test/measurement records; absence means evidence has not yet been recorded.

## Strict execution rules

1. **Among remediation planning documents, read only this README and your own WP file.** Each task includes its own evidence, dependencies and interfaces; audit links are provenance, not required extra reading. Read source, tests and applicable repository policy as necessary. WP-62 explicitly authorizes read-only full re-audit context.
2. **Change only files explicitly listed in your WP.** NEW files are exact planned paths, not existing citations. Read-only context is not an edit permission. Do not edit audit reports, other task plans, unrelated source or `.taskmaster`; this scoped instruction overrides broad tracker-update defaults. Stop and report missing paths/incorrect assumptions before broadening scope.
3. **Critical items require tests first.** Reproduce the defect with desired secure assertions before implementation and demonstrate the same tests pass after. Use independent PostgreSQL sessions and barriers for races. No skip/xfail or weakened assertions. WP-02 is a deliberate test-only baseline package with explicit known-red results, outside default collection; subsequent fix PRs and final re-audit invoke those tests explicitly.
4. **Run the test suite before and after.** Use Conda base, dedicated disposable PostgreSQL/Redis/storage and synthetic settings established before imports. Original fixtures drop a schema and FLUSHDB; never point them at ordinary services. Required repository gates are backend `python -m pytest app/tests -q`, frontend `npx vitest run`, and `npx tsc --noEmit`; targeted/migration/security/performance checks are listed per WP. Record actual commands, exit codes and existing failures. An unrun or failing required gate is a blocker, not a pass.
5. **One WP per branch and PR.** Start from merged prerequisites, preserve their fixes and keep the PR’s problem/behavior/test evidence focused. Do not treat this plan as authorization to implement, deploy, push, publish a PR, rotate production secrets or delete operational data now. Future implementation follows the authorization then in effect.
6. **Update STATUS.md when work starts, blocks or completes.** Write the WP’s result file with evidence, then update only its status row with branch/PR, date, tests and notes. Status updates from parallel branches must be integrated serially. Mark done only when acceptance and required checks pass; a documentation plan is not completion.
7. **Respect dependencies and shared-file order.** Single-head Alembic migrations and contract generation are serialized. Do not let separate agents edit the same source file in parallel; use separate disposable test targets. A broad finding has one closure owner plus explicitly named contributors; the owner cannot close it while a contribution remains unfinished.
8. **Stop and report if assumptions are wrong.** Re-check named functions after earlier WPs shift line numbers. Do not blindly apply proposed audit snippets, edit applied migrations, infer production reachability, invent benchmark wins or silently choose an unapproved data-erasure policy. Preserve existing authorization, Decimal money, audit history and transaction ownership.
9. **Keep repository conventions.** Use typed Pydantic inputs/results, feature services/repositories and FastAPI Depends; avoid unneeded pass-through abstractions. No ordinary code comments except the repository’s math/cron exceptions. New user-facing strings require existing i18n keys or an explicit file-scope revision for all three locales. If an API contract changes, regenerate CONTRACT.md and update the listed client types in the same PR; frontend/src/lib is broadly gitignored, so read/diff it explicitly. Never stage secrets, uploads or environment files.
10. **Size discipline.** S is localized; M is one bounded cross-layer root cause/extraction. No WP authorizes a broad subsystem rewrite. If implementation exceeds one session or requires new files outside its allowlist, stop with a concrete split proposal. Tests and small supporting refactors belong to the fix; unrelated architecture work waits for its own WP.

## Scope and evidence limits

All 12 input audit Markdown files were read in full and each of the 75 numbered findings was checked against cited current code and relevant callers/configuration. The prior reports’ historical tests and in-memory experiments are not newly executed results. Conditional Redis/artifact/SMTP threats remain conditional, and query/index/latency claims retain measurement gates. SEC-DATA-04 (PII retention) is deferred until the data/product owner supplies retention periods, financial exceptions and backup policy; WP-62 revisits it. No source finding was rejected as obsolete. Minor citation corrections and operational limitations are recorded in the master table.

The first five packages are WP-01 baseline, WP-02 Critical reproductions, WP-03 refresh identity, WP-04 private downloads and WP-05 fail-closed cron. Phase counts: baseline 2; Critical 9; High/prerequisite work 12; Medium/Low/structure 40; re-audit 1.
'''
(O/'00-README.md').write_text(readme)
(O/'STATUS.md').write_text('# Remediation progress\n\nImplementation has not started. Add one row per WP when work begins; allowed statuses: todo, in_progress, blocked, done. A failing or unrun required gate cannot be marked done.\n\n| WP | Status | Branch / PR | Date (UTC) | Tests run and result | Notes |\n|---|---|---|---|---|---|\n')
(O/'_work/execution-order.json').write_text(json.dumps({'order':[w['id'] for w in order],'waves':waves,'counts':counts},indent=2))
print('Rendered',len(W),'task files; phase counts',dict(sorted(counts.items())),'waves',len(waves))

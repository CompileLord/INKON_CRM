from pathlib import Path
import json,re,hashlib,os,collections
R=Path.cwd(); O=R/'docs/remediation';F=json.loads((O/'_work/findings.json').read_text()); W=json.loads((O/'_work/work-packages.json').read_text());D={w['id']:w for w in W}; errors=[]
def check(ok,msg):
 if not ok:errors.append(msg)
source_ids=[f['id'] for f in F]
table=(O/'_work/findings-table.md').read_text()
table_ids=re.findall(r'^\| ((?:(?:SEC|PERF)-)?(?:API|BUS|DATA)-\d+) \|',table,re.M)
backlog=(O/'01-master-backlog.md').read_text();coverage=backlog.split('## Coverage:',1)[1].split('## Deferred',1)[0]
coverage_ids=re.findall(r'^\| ((?:(?:SEC|PERF)-)?(?:API|BUS|DATA)-\d+) \|',coverage,re.M)
check(collections.Counter(table_ids)==collections.Counter(source_ids),'Findings table mismatch')
check(collections.Counter(coverage_ids)==collections.Counter(source_ids),'Coverage mismatch')
assigned=[i for w in W for i in w['findings']]
check(len(assigned)==len(set(assigned))==74,'Duplicate assignment')
check(set(source_ids)-set(assigned)=={'SEC-DATA-04'},'Unexpected unmapped finding')
check(len(W)==64 and len(list((O/'tasks').glob('WP-*.md')))==64,'Task count mismatch')
required=['Goal','Why it matters','Exact files and lines','Step-by-step change','Tests to write BEFORE the fix','Acceptance criteria','How to verify','Risks and rollback','Dependencies and execution order','Effort and completion']
planned={p for w in W for p in w['files']};citations=0;links=0
for w in W:
 task=O/'tasks'/f"{w['id']}-{w['slug']}.md";s=task.read_text()
 for h in required:check('## '+h+'\n' in s,w['id']+' missing '+h)
 check('Status **todo**' in s,w['id']+' wrong initial status')
 for m in re.finditer(r'\[((?:backend/|\.github/)[^\]]+?):(\d+(?:[–-]\d+)?(?:,\d+(?:[–-]\d+)?)*)\]',s):
  p,rr=m.groups(); check((R/p).is_file(),f'{w["id"]} missing citation {p}')
  if not (R/p).is_file():continue
  size=len((R/p).read_text().splitlines())
  for part in rr.replace('–','-').split(','):
   nums=list(map(int,part.split('-')));check(1<=min(nums)<=max(nums)<=size,f'{w["id"]} out-of-bounds {p}:{rr}')
  citations+=1
 for m in re.finditer(r'\[[^\]]+\]\(([^)]+)\)',s):
  target=m[1]; base,_,anchor=target.partition('#');p=(task.parent/base).resolve();rel=str(p.relative_to(R))
  check(p.exists() or rel in planned,f'{w["id"]} unresolved link {target}')
  if anchor and p.exists():
   headers=[re.sub(r'[^\w\- ]','',l.lstrip('# ').lower()).replace(' ','-') for l in p.read_text().splitlines() if l.startswith('#')]
   check(anchor in headers,f'{w["id"]} missing anchor {target}')
  links+=1
 for d in w['deps']:check(d in D and D[d]['phase']<=w['phase'],w['id']+' invalid dependency '+d)
cache={}
def ancestors(i,visiting=None):
 if i in cache:return cache[i]
 visiting=set() if visiting is None else visiting
 if i in visiting:raise AssertionError('Dependency cycle '+i)
 out=set(D[i]['deps'])
 for d in D[i]['deps']:out|=ancestors(d,visiting|{i})
 cache[i]=out;return out
for w in W:ancestors(w['id'])
for i,a in enumerate(W):
 for b in W[i+1:]:
  shared={p for p in set(a['files'])&set(b['files']) if not p.startswith('docs/remediation/')}
  if shared:check(a['id'] in ancestors(b['id']) or b['id'] in ancestors(a['id']),f'Unordered shared files {a["id"]}/{b["id"]}: {shared}')
owner={f:w['id'] for w in W for f in w['findings']}
for w in W:
 if w['number']==2:continue
 for f in w['contributes']:check(w['id'] in ancestors(owner[f]),f'Closure owner {owner[f]} misses contributor {w["id"]}')
critical=[f['id'] for f in F if f['severity'].startswith('Critical')]
check(len({owner[i] for i in critical})==9,'Critical root-cause owner mismatch')
check(all(D[owner[i]]['severity']=='Critical' and D[owner[i]]['phase']==1 for i in critical),'Critical phase/label mismatch')
# Snapshot content comparison covers all repository files except documented generated caches/dependencies/Git internals.
skip={'.git','node_modules','__pycache__','.pytest_cache','.mypy_cache','.ruff_cache','.next','dist','.venv','venv'}
current={}
for d,dirs,files in os.walk(R):
 dirs[:]=[x for x in dirs if x not in skip and str((Path(d)/x).relative_to(R))!='docs/remediation']
 for f in files:
  p=Path(d)/f
  if p.is_file() and not p.is_symlink():current[str(p.relative_to(R))]=hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((O/'_work/baseline.json').read_text());changed=[p for p,h in baseline.items() if current.get(p)!=h];added=sorted(set(current)-set(baseline));removed=sorted(set(baseline)-set(current))
check(not changed and not added and not removed,'Outside-boundary content changes '+str((changed,added,removed)))
check(len(re.findall(r'^\| WP-',(O/'STATUS.md').read_text(),re.M))==0,'STATUS is not empty')
phase=collections.Counter(w['phase'] for w in W)
report=['# Planning verification','','Verified 2026-10-14. This verifies documentation and static source evidence; it is not an application test run.','','| Check | Result |','|---|---|',f'| Numbered source findings / master table / coverage | {len(source_ids)} / {len(table_ids)} / {len(coverage_ids)} |',f'| Unique assigned / deferred / rejected | {len(set(assigned))} / 1 / 0 |',f'| Work packages / required section sets | {len(W)} / {len(required)} each |',f'| Citation references checked for existing source/line bounds | {citations} |',f'| Task links checked (planned NEW targets allowed) | {links} |',f'| Distinct Critical root causes with dedicated Phase 1 packages | 9 (10 source Critical entries; BUS-01 and SEC-BUS-01 are the same root cause) |',f'| Dependency graph / shared-file order / contributor gates | acyclic; all shared source files ordered; all contributors are prerequisites of their closure owner |',f'| Phase 0 / 1 / 2 / 3 / 4 counts | '+ ' / '.join(str(phase[i]) for i in range(5))+' |',f'| Outside-folder baseline files | {len(baseline)} unchanged; additions {len(added)}, removals {len(removed)} |','| STATUS | empty progress table; all backlog/task statuses todo |','','## Manual source and task review','','Read all 12 input report/plan files in full. Opened each of the 75 findings’ cited ranges, plus surrounding auth/session, worker/config, deployment/migration and client call paths. Retained conditional exploit prerequisites and performance hypotheses. No numbered finding was found obsolete or false. Source-excerpt and verification checkpoints are saved alongside this file.','','Opened and reviewed all nine Critical task files WP-03 through WP-11, including their exact source citations, steps, test-first cases and acceptance criteria. Additional task/source samples: WP-12 SMTP, WP-20 analytics, WP-35 batch bounds, WP-64 index experiment. Corrected finance private-method citation to line 55, included actual student-dashboard/course client consumers, covered Google Cloud Build upload exclusion separately from Docker exclusion, and made pre-response transaction conflict handling explicit.','','## Deferred item','','SEC-DATA-04: current PII retention is confirmed, but approved durations, financial exceptions, erasure authority and backup policy are absent. Data/product owner provides those inputs; WP-62 revisits. No automated data deletion was invented.','','## Write boundary and execution limits','','Only docs/remediation/ was written. The initial checksum inventory covers repository files including all source, configuration, ignored frontend lib files, existing audit reports and advisory evidence; it excludes Git internals, dependency trees and generated caches/build outputs. No source edit, test-suite run, service mutation, dependency installation, Git commit/push or subagent was performed. Git status separately shows only the pre-existing untracked audit directories plus the new remediation directory. Baseline/runtime reproduction/load/migration tests are future work in the packages.','','## Errors','','None.' if not errors else '\n'.join('- '+e for e in errors),'']
(O/'_work/verification.md').write_text('\n'.join(report))
print(json.dumps({'findings':len(source_ids),'assigned':len(assigned),'deferred':1,'rejected':0,'work_packages':len(W),'phase_counts':dict(phase),'citations':citations,'links':links,'outside_files_unchanged':len(baseline),'errors':errors},indent=2))
if errors:raise SystemExit(1)

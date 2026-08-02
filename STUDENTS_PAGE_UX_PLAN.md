# Students Page — Structure, Interface and Motion Plan

Status: planned, not implemented.
Scope: `frontend/src/pages/Students.tsx`, `frontend/src/components/students/StudentsTable.tsx`,
and the shared primitives this page exposes defects in (`Modal`, `SlideOver`, `Toast`).
Audience: the agent implementing this. Read end to end before editing.

---

## 0. Context the implementer needs

- **No motion library.** `framer-motion`/`motion` are not in `package.json`. All motion is CSS
  transitions plus the one existing keyframe (`card-scale-in`, `src/index.css:145`).
- **Reduced motion is handled by Tailwind's `motion-safe:` prefix**, not a global media query.
  `Modal.tsx:36` is the precedent. Every non-essential animation added here must carry it.
- **Design tokens** live in `src/index.css` (`--imkon-*` → `--color-*`). Use token classes
  (`bg-card`, `text-ink`, `border-border-warm`, `bg-strip`, `bg-row-hover`), never raw hex. Both
  light and dark values already exist for every token — a change that only looks right in one
  theme is not done.
- **The press-scale of record is `0.96`** (`Button.tsx:29`). The table drifted to `0.95`.
- **Existing motion timings**: 150ms `ease-out` for interactive state changes, 200ms for surfaces
  (`SlideOver.tsx:32,42`). Keep those; do not introduce a third duration.
- **`useStudents` sets `placeholderData: keepPreviousData`** (`lib/users/hooks.ts:35`). This
  matters for every loading-state decision below.

## 1. Assumed decisions

These two were proposed and not explicitly settled. Implement as written unless told otherwise.

1. **Delete confirmation shows the real enrollment count.** `handleConfirmDelete`
   (`Students.tsx:63-80`) already calls `fetchFilteredEnrollments` to withdraw active enrollments.
   Move that fetch to when the dialog *opens*, show the count in the message, and keep a static
   warning line as the fallback if the request fails.
2. **Search progress is a spinner inside the input**, not a dimmed table. Dimming the table body
   on every keystroke is exactly the high-frequency motion the design guidance rules out.

---

## 2. Structure

### 2.1 Split the header from the filter bar

Today the page header holds the title and a floating total (`Students.tsx:84-89`), while the
primary action sits at the far right of the filter row (`:123-128`). The two rows have no clear
division of labour.

- **Header row**: title, and the total as a small pill next to it (`bg-strip text-muted`,
  `rounded-full px-2 py-0.5 text-xs tabular-nums`) rather than a detached right-aligned span.
  Move **Add student** to the right end of this row — it is the page's primary action, not a
  filter.
- **Filter row**: search, page size, and (see 2.2) the status filter. Everything in this row
  narrows the list; nothing in it creates anything.

### 2.2 Unify the filter controls

`Students.tsx:104` (`rounded-full`, `py-2`), `:114` (`rounded-lg`, `py-2`) and the `Button`
(`rounded-lg`, `py-2.5`) give one row three corner treatments and two heights.

- One radius: `rounded-lg`. One height: `h-10` on all three.
- Add a **clear button** (`X`, 16px) inside the search input, visible only when `search !== ""`,
  which resets search and page. Do not shift the input's text padding when it appears — reserve
  the right padding permanently.
- **Status filter (active / archived / all)** only if `ListUsersParams` already supports it —
  check `lib/users/types.ts` and the backend list endpoint first. If it does not, leave it out;
  adding a backend filter is not in this scope.

### 2.3 Table structure

- **Sticky header** on the desktop table: `sticky top-0 z-10` on the `<thead>` row with the
  existing `bg-strip`. With 100 rows per page the column meanings currently scroll away.
- **Two empty states**, replacing the single `t("table.empty")` at `StudentsTable.tsx:147` and
  `:176`. The table needs to know which one to show, so pass an `isFiltered` prop from the page:
  - no students at all → short line plus an **Add student** button that opens the create panel;
  - no matches for a query → "Nothing found for «X»" plus a **Clear search** button.
  Both centered in the table body, ~`py-12`, with the existing muted type.
- **Concentric radii** (`StudentsTable.tsx:57,157,180`): container `rounded-xl` (12) wrapping a
  `p-3` (12) region whose cards are `rounded-lg` (8). Change to container `rounded-2xl` (16),
  wrapper `p-2` (8), cards `rounded-lg` (8) — `8 + 8 = 16`.

### 2.4 Page-state correctness

- **Reset the page index after a delete** (`Students.tsx:63-80`). Deleting the only row on the
  last page currently strands the user on an empty page. After a successful delete, clamp
  `page` to the new `total_pages`.
- **Name cell becomes a real link** (`StudentsTable.tsx:92`): `<Link to={/students/${id}}>`
  carrying the existing `hover:underline`. Keep the row `onClick` as a convenience, and keep the
  `stopPropagation` on the actions cell. This is what makes the row keyboard-reachable and
  middle-clickable; the `hover:underline` on a plain `<div>` is a promise the page doesn't keep.

---

## 3. Interface

| Area | Change | Location |
| --- | --- | --- |
| Focus | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon/30` on both icon buttons, desktop and mobile | `StudentsTable.tsx:125,136,200,208` |
| Dark mode | Add `dark:hover:bg-red-950/40` to the mobile delete button, matching its desktop twin | `StudentsTable.tsx:208` |
| Press scale | `active:scale-95` → `active:scale-[0.96]` | `StudentsTable.tsx:125,136,169,200,208` |
| Destructive copy | Dialog states what happens: name, plus "N active enrollments will be withdrawn" | `Students.tsx:152-163` |
| Transition specificity | `transition-all` → `transition-[opacity,translate]` | `Toast.tsx:19` |
| Search feedback | Spinner (existing `animate-spin` ring from `Button.tsx:36`) at the input's right edge while `isFetching && !isLoading` | `Students.tsx:92-106` |

New i18n keys are required for the delete copy, both empty states, and the clear-search label.
Add them to every locale file under the `students` and `common` namespaces — check which locales
exist before writing, and do not leave a locale with a missing key falling back to a raw key name.

---

## 4. Motion

The page currently animates three things: row hover colour, icon-button press, and the
SlideOver/Modal surfaces. The additions below are deliberately few — the table is a
high-frequency surface and most of it should stay instant.

### 4.1 Motion rules for this page

- Interactive state changes (hover, focus, press): **150ms `ease-out`**, transition only the exact
  properties. Never `transition-all`.
- Surfaces entering or leaving (panels, dialogs, toasts): **200ms**,
  `cubic-bezier(0.2, 0, 0, 1)`.
- Exits are softer than enters: opacity plus a small fixed `translateY`, never an animated height.
- Everything non-essential carries `motion-safe:`.
- **No stagger anywhere in the table.** Rows re-render on every keystroke, page change and page
  size change; a staggered entrance would replay on all of them.

### 4.2 Skeleton → content

`TableSkeletonRows` (5 pulsing rows) is swapped for real rows in one frame. Cross-fade instead:
wrap the tbody content so the skeleton fades out and rows fade in over 150ms. Because
`keepPreviousData` keeps old rows on screen during a refetch, the skeleton only appears on the
true first load — so this animation is infrequent and worth having.

### 4.3 Row removal

When a student is deleted the row disappears instantly and everything below jumps up. Add a brief
exit: mark the deleted row's id in local state, apply `opacity-0 translate-y-[-4px]` with a 150ms
transition, then let the query invalidation remove it. Subtle, fixed offset, no height animation
(principle: exits stay softer than enters).

### 4.4 Fix Modal's missing exit

`Modal.tsx:30` does `if (!open) return null`, so it scales in (`card-scale-in`) and then pops out
with no exit at all. Make it mirror `SlideOver`: stay mounted, drive `opacity`/`scale` from the
`open` prop, so both directions are interruptible CSS transitions. This affects `ConfirmDialog`
across the whole app, so verify other callers after changing it.

### 4.5 SlideOver: a real bug to fix while you're here

`SlideOver` never unmounts (`SlideOver.tsx:31`). When closed it is `opacity-0` and
`pointer-events-none`, but its inputs and buttons **remain in the tab order** — a keyboard user
tabbing through the Students page walks into the invisible student form. Add the `inert`
attribute when `!open` (it also implies `aria-hidden`, so the existing attribute can go). While
there: focus the panel on open and return focus to the trigger on close.

### 4.6 Leave alone

Row hover (`StudentsTable.tsx:82`) is already a 150ms colour transition — correct as is. Do not
animate row hover with transforms, do not animate the pagination transition, and do not add
entrance animation to the toolbar.

---

## 5. Phases

Each phase ends with a verification step. Do not start the next until the current one passes.

1. **Interface fixes** (§3, excluding search feedback): focus rings, dark-mode hover, press
   scale, `Toast` transition. Purely mechanical, no behaviour change.
   *Verify:* tab through the table and confirm every control shows a ring; toggle dark mode and
   hover the mobile delete button.
2. **Structure** (§2.1–2.3): header/filter split, control unification, clear button, sticky
   header, split empty states, concentric radii.
   *Verify:* render with 0 students, with a query matching nothing, and with a full page; check
   both breakpoints against the `md` boundary.
3. **Page-state correctness** (§2.4): name link, page clamp after delete.
   *Verify:* keyboard-only, reach a student profile from the table; delete the last row of the
   last page and confirm the list lands on a valid page.
4. **Destructive-action copy** (§1.1, §3): enrollment count in the confirm dialog.
   *Verify:* a student with active enrollments shows the right count; a failed count request
   still shows the static warning and the delete still works.
5. **Search feedback** (§1.2): spinner driven by `isFetching`.
   *Verify:* throttle the network, type, and confirm the spinner appears during the debounce +
   request window and that rows never blank out.
6. **Motion** (§4): cross-fade, row exit, `Modal` exit, `SlideOver` `inert` + focus handling.
   *Verify:* replay each in the browser's Animations panel at 10% speed; confirm every one is
   interruptible mid-flight; re-run with `prefers-reduced-motion: reduce` and confirm all of it
   is suppressed while the interface stays fully usable.

## 6. Verification for the whole change

- `npm run build` and the linter clean.
- Light and dark, at `sm`, `md` and `lg`.
- Keyboard-only pass: reach and operate search, clear, page size, add, every row link, every edit
  and delete button, the dialog, and the slide-over — with no stop on an invisible control.
- States walked: first load, refetching, error + retry, empty (no data), empty (no matches),
  single page, many pages.
- No regression in `Mentors.tsx`, which uses the same `Modal`, `Toast` and `Pagination`
  primitives — check it after phases 1 and 6.

## 7. Explicitly out of scope

Sortable columns, bulk selection, a multi-delete flow, and any new backend filter. These are
features, not polish, and each needs its own decision on API support.

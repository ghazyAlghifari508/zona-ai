# P6 — Component discovery: Log Aktivitas

Discovery performed before P6 UI code. No browser QA, no Playwright, no remote installer. Continues `docs/p2-component-discovery.md`, `docs/p4-component-discovery.md`, `docs/p5-component-discovery.md`.

## Baseline evidence

- HEAD `08b2fea` on branch `main`; `git status --short` clean before work. Prompt reference snapshot `7c4962c` differs, so file structure was re-read instead of assumed.
- `components.json`: shadcn `default` style, `@/components/ui`, CSS `src/styles/app.css`, CSS variables on.
- Installed from `package.json`: React 19.2.8, Tailwind 4.1.13, `@radix-ui/react-dialog` 1.1.23, `@base-ui-components/react` 1.0.0-rc.0, `@hugeicons/react` 1.1.10, `lucide-react` 1.37.0, TanStack Query 5.102.8, TanStack Router 1.170.32.
- Installed UI: `src/components/ui/{button,dialog,dropdown-menu,native-select,popover,toast,StatusText,ProviderIcons,UserAvatar,cnippet-accordion}.tsx`. The existing admin table in `src/routes/admin/audit-log.tsx` is hand-rolled HTML, not a shadcn `Table`.
- Tokens in `src/styles/app.css`: `paper`, `pure-white`, `ink`, `graphite`, `stone`, `hairline`, `hairline-strong`, `notion-blue`, with `.dark` counterparts and a global `*:focus-visible` outline. No new palette or design system is needed.

## Needs → candidates → decision

| Need | Candidate (source) | Decision | Compatibility / a11y / license / dependency |
|---|---|---|---|
| Semantic activity table with header/body/cell slots | **shadcn Table** ([docs](https://ui.shadcn.com/docs/components/table), [registry source](https://ui.shadcn.com/r/styles/default/table.json)) | **Chosen.** Copy the official composition into `src/components/ui/table.tsx`, then adapt styling to existing `hairline`/`paper`/`ink`/`stone` tokens. No new dependency. | Plain React DOM primitives, React 19 compatible; MIT; native `<table>` keyboard/screen-reader semantics retained. No new Radix/Base UI dependency. |
| Detail overlay, closable with Escape/focus return | **Already-installed shadcn Dialog** (`src/components/ui/dialog.tsx`, Radix Dialog 1.1.23) | **Chosen.** Reuse as-is. | Radix dialog owns focus management, Escape and ARIA. MIT. No new dependency. |
| Collapsed-by-default “Informasi teknis” disclosure | **Already-installed Base UI Accordion wrapper** (`src/components/ui/cnippet-accordion.tsx`; [Base UI Accordion API](https://base-ui.com/react/components/accordion), [shadcn Base UI accordion](https://ui.shadcn.com/docs/components/base/accordion)) | **Chosen.** `Accordion.Root` with no initially open item; one item for technical details. | Base UI 1.0.0-rc.0 is installed; `defaultValue`/`value` is an array and an empty array means collapsed ([Context7 `/mui/base-ui` docs](https://github.com/mui/base-ui/blob/master/docs/src/app/(docs)/react/components/accordion/types.md)). MIT; button trigger and panel semantics come from the primitive. |
| Human-readable filter for internal event codes | **shadcn Native Select** (`src/components/ui/native-select.tsx`, from P5; [docs](https://ui.shadcn.com/docs/components/native-select)) | **Chosen.** Reuse the P5 shared control; values stay internal codes. | Native `<select>` semantics, browser typeahead and keyboard; MIT; no new dependency. |
| Search input with icon | Installed Hugeicons icon + native `<input>` in a `<form>` | **Chosen.** Existing admin pattern; no new primitive needed. | Native form submit, visible label via `aria-label`, global focus outline. |
| Data grid with sorting/selection/virtualization | **HeroUI Table** ([docs](https://www.heroui.com/docs/components/table)) | Rejected: P6 needs a read-only 20-item server-paginated list, not selection/resizing/virtualization. Installing it would add React Aria + a parallel visual system. | MIT but incompatible with the restrained admin shell without broad restyling. |
| Decorative/motion registries | [Magic UI](https://magicui.design/docs/components) (dialog/animation focused, no audit table primitive), [React Bits](https://reactbits.dev/components/accordion-gallery) (animated accordion gallery), [Tuff UI](https://tuffui.com/components) (agent/chat UI), [Thinking Orbs](https://www.thinkingorbs.com/#orbs), [Affect UI](https://www.affectui.com/components), [CUI](https://yappologistic.github.io/CUI/), [Sakani UI](https://www.sakaniui.com/) | Rejected for P6: none solves a restrained admin activity list; P6 explicitly forbids decorative motion, glow and parallel design systems. Some sites were only reachable through search snippets; no component name or availability is inferred from a failed fetch. | N/A; nothing installed from them. |

## Actually used

- `src/components/ui/table.tsx` — shadcn Table composition adapted to `border-hairline`, `bg-paper`, `text-ink`, `text-stone`; imported by `src/routes/admin/audit-log.tsx`.
- `src/components/ui/dialog.tsx` — existing Radix Dialog; imported by `src/routes/admin/audit-log.tsx`.
- `src/components/ui/cnippet-accordion.tsx` — existing Base UI Accordion; imported by `src/routes/admin/audit-log.tsx` for the collapsed technical section.
- `src/components/ui/native-select.tsx` — existing P5 Native Select; imported by `src/routes/admin/audit-log.tsx`.
- `src/components/ui/UserAvatar.tsx` — existing avatar primitive; imported by the activity list.

No dependency added, no registry installer run, no existing component overwritten.

## Visual contract for P9 (no browser QA in P6)

- Reading this as: restrained admin activity log for administrators, in the existing Notion-inspired Zona language, dial ENERGY 1 / RHYTHM 1 / MOTION 1. Header, one search/filter row, one text-first table, one detail dialog. Whitespace and hairline borders carry hierarchy; the only accent is the existing focus/link blue.
- Light/dark parity uses semantic tokens only. Date/time format is locale `id-ID`; if a zone label is shown it must name the actual zone used, never claim WIB for browser-local time.
- Keyboard path: Tab to search → filter → detail buttons → pagination; Enter opens detail; Escape closes; technical disclosure is a real button. Loading, error with retry, empty and disabled states remain in the same layout.
- P9 must verify desktop and 375px, light and dark, long names/IDs, and all interactive states. No visual QA is performed in P6.

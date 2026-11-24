# P5 — Component discovery and select inventory

Discovery performed before any P5 code change on 2026-11-24. No browser QA, no Playwright, no remote installer. Continues `docs/p2-component-discovery.md` and `docs/p4-component-discovery.md`.

## Baseline evidence

- HEAD `6124bd9` (`docs(p4): record verification evidence and P5/P9 handoff`); `git status --short` clean before work. Branch `main` in this checkout; working reference snapshot in prompt is `7c4962c`.
- `components.json`: shadcn `default` style, `@/components/ui`, CSS `src/styles/app.css`, CSS variables on.
- Installed: React 19.2.8, `lucide-react` 1.37.0 (ISC), `@base-ui-components/react` 1.0.0-rc.0 (MIT), Radix `dialog`/`dropdown-menu`/`popover`/`slot`, Tailwind 4.1.13, `clsx` + `tailwind-merge` via `src/lib/utils.ts`.
- Installed UI: `src/components/ui/{button,dialog,dropdown-menu,popover,toast,StatusText,ProviderIcons,UserAvatar}.tsx`. There is no installed `select`, `native-select`, `command`/`cmdk`, or `@radix-ui/react-select` (`node_modules/@radix-ui/react-select` absent).
- Tokens in `src/styles/app.css`: `paper`, `pure-white`, `ink`, `graphite`, `stone`, `hairline`, `hairline-strong`, `notion-blue`, `accent`, `coral`, with `.dark` counterparts. Global `*:focus-visible` outline is defined in the same file.

## Needs → candidates → decision

| Need | Candidate (verified source) | Decision | Compatibility / a11y / license |
|---|---|---|---|
| One shared styled control for 11 simple value selects; native form semantics must survive, exactly one chevron, whole trigger clickable | **shadcn Native Select** ([docs](https://ui.shadcn.com/docs/components/radix/native-select), [registry source JSON](https://ui.shadcn.com/r/styles/new-york-v4/native-select.json)): wrapper + native `<select>` with `appearance-none`, `pr-9`, absolutely positioned `ChevronDownIcon` with `aria-hidden` + `pointer-events-none`; plus [MDN `appearance`](https://developer.mozilla.org/en-US/docs/Web/CSS/appearance) confirming `none` removes native widget appearance without changing functionality | **Chosen.** Copy the official shadcn component composition into `src/components/ui/native-select.tsx`, replacing shadcn's default-theme classes with Zona semantic tokens and adding an `sm` size for the artifact toolbar. No new package: the registry component depends only on React, `lucide-react` and `cn`, all installed. | MIT (shadcn) + ISC (lucide). Native `<select>` keeps keyboard, typeahead, focus return, form submit, `disabled`, labels and screen-reader semantics. `appearance: none` removes the browser arrow so there is no duplicate chevron. Focus outline comes from the existing global token rule. |
| Non-native select with search/typeahead | [shadcn Select](https://ui.shadcn.com/docs/components/radix/select) (Radix `Select`, `onValueChange`), [Radix Select docs](https://www.radix-ui.com/primitives/docs/components/select), shadcn [Combobox](https://ui.shadcn.com/docs/components/radix/combobox) | Rejected for these 11 controls: every control has a short finite option set and no search; converting controlled `onChange` filters to `onValueChange` would risk filter/mutation drift. Radix Select would add `@radix-ui/react-select` for no functional gain. [WAI listbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/) documents the keyboard/ARIA burden a non-native replacement would own. | MIT; React 19 compatible, but unnecessary dependency and semantics change. |
| Already-installed Base UI Select | [Base UI Select docs](https://base-ui.com/react/components/select), installed `@base-ui-components/react` 1.0.0-rc.0 exports `./select` | Rejected: non-native button+listbox primitive; docs now target renamed `@base-ui/react`, while this checkout has the older package name. Would change form semantics and introduce a second select system alongside shadcn. No installed usage found. | MIT; good a11y, wrong shape for plain filters. |
| HeroUI Select | [HeroUI Select docs](https://www.heroui.com/docs/react/components/select) | Rejected: adds a parallel design system/React Aria dependency and its own `Select.Trigger`/`Select.Popover`/`ListBox` composition for the same plain options. | MIT; heavier dependency, visual language conflicts with restrained Zona theme. |
| Decorative registries (Magic UI, React Bits, Thinking Orbs, Affect UI, Tuff UI, CUI, Sakani UI) | Checked in `docs/p2-component-discovery.md` and `docs/p4-component-discovery.md`; unchanged in this phase | Rejected: none solves a value picker; P5 forbids new motion/decoration. No component installed from them. | N/A. |

## Actually used

- New shared component: `src/components/ui/native-select.tsx` — official shadcn `NativeSelect` composition, adapted to `border-hairline`, `bg-paper`/`bg-pure-white` override, `text-ink`, `text-stone`, global focus outline and a compact `size="sm"` for the artifact toolbar. Exports `NativeSelect` and `NativeSelectOption` only.
- Imports in all migrated routes/components: `import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'` (alias from `components.json`).
- No dependency changed, no remote installer run, no second design system.

## Inventory — every discovered value select

Baseline was 11 native `<select>` controls; all 11 use the shared component. No option value, filter key, mutation, `onChange` payload, route or `disabled` condition changes. Copy normalization is limited to sentence case for the four all-options labels; `value="all"` is unchanged.

| # | Surface | Before | After |
|---|---|---|---|
| 1 | `src/routes/admin/models.tsx` provider filter | `h-9 ... border-hairline bg-paper px-3`, native arrow at border, `Semua Provider` | `NativeSelect size="default"`; `Semua provider` |
| 2 | `src/routes/admin/users.tsx` role filter | `h-9 ... px-2.5`, `Semua Peran` | `NativeSelect`; `Semua peran` |
| 3 | `src/routes/admin/users.tsx` status filter | same as #2, `Semua Status` | `NativeSelect`; `Semua status` |
| 4 | `src/routes/admin/feedback.tsx` status filter | `h-9 ... px-3`, `Semua Status` | `NativeSelect`; `Semua status` |
| 5 | `src/routes/admin/feedback.tsx` category filter | same as #4, `Semua Kategori` | `NativeSelect`; `Semua kategori` |
| 6 | `src/routes/admin/feedback.tsx` change-status field | `mt-1 h-9 w-full ... bg-paper px-3`, `<label htmlFor>` | `NativeSelect className="mt-1 w-full"`; paper surface, label and id preserved |
| 7 | `src/routes/admin/audit-log.tsx` action filter | `h-9 ... px-3` | `NativeSelect`; `COMMON_ACTIONS` labels unchanged |
| 8 | `src/routes/admin/credits.tsx` adjustment mode | `mt-1 h-9 w-full ... bg-pure-white px-3`, `<label htmlFor>` | `NativeSelect className="mt-1 w-full bg-pure-white"`; add/deduct/set payload unchanged |
| 9 | `src/routes/settings.tsx` default model | `w-full ... bg-pure-white px-3 py-1.5`, `data-testid` only | `NativeSelect className="bg-pure-white font-medium"`; 36px default height, dynamic catalog values unchanged |
| 10 | `src/routes/settings.tsx` default skill | same as #9 | `NativeSelect className="bg-pure-white font-medium"`; `SKILL_IDS` values unchanged |
| 11 | `src/components/artifacts/ArtifactHeader.tsx` version selector | `h-7 ... bg-pure-white px-1.5`, native arrow at border | `NativeSelect size="sm" className="bg-pure-white"`; keeps 28px height, id, `aria-label`, `disabled={versions.length === 0}` and exact version IDs |

### Exceptions — deliberately unchanged

| Control | Reason |
|---|---|
| `src/components/artifacts/ArtifactMentionPicker.tsx` `role="listbox"` | Not a value-select dropdown: an inline `@` mention picker with its own search/selection state and keyboard handling, covered by P4 tests. Replacing it is out of P5 scope. |
| `src/components/chat/ModelSelector.tsx`, `SkillSelector.tsx` | Installed Radix `Popover` with search, grouping, compare switch and checkmarks (P4 decision, `docs/p4-component-discovery.md`). No chevron-on-border issue and no native `<select>` semantics to preserve. |
| `src/components/layout/Sidebar.tsx` and `src/routes/admin/models.tsx` `DropdownMenuTrigger` kebab menus | Action menus, not value selectors; using them as selects is explicitly forbidden. History horizontal-dot icon belongs to P8. |
| `src/components/ui/cnippet-accordion.tsx` `ChevronDownIcon` | Disclosure rotation in an accordion, not a select indicator. |

## Visual contract for P9 (no browser QA in P5)

- Default control: 36px height, 12px left padding, 14px right clearance for a 16px vertically centered chevron, 8px radius, 13–14px text. Compact artifact control: 28px height, 8px left padding, 14px chevron with 8px right inset.
- Light: paper or white surface, `ink` text, `hairline` border, `stone` icon, `notion-blue` global focus outline. Dark: same tokens resolve to dark surfaces, light ink, white-alpha hairline and blue focus outline; no literal colors in the component.
- Desktop toolbars and mobile wrap layouts: `min-w-0`/`max-w-full` prevent overflow; long labels stop before the reserved arrow inset. P9 must verify at desktop and 375px, light and dark, including the artifact compact control and disabled/empty states.

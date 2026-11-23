# P4 — Component discovery and status inventory

Discovery performed before P4 UI changes on 2026-11-24. No browser QA, no Playwright, no remote installer, no Tavily. Continues `docs/p2-component-discovery.md`.

## Installed state (verified)

- `components.json`: shadcn default style, `@/components/ui`, CSS `src/styles/app.css`, CSS variables on.
- `package.json`: React 19.2.8, `@radix-ui/react-popover` 1.1.23, `@radix-ui/react-dialog` 1.1.23, `@radix-ui/react-dropdown-menu` 2.1.24, `@base-ui-components/react` 1.0.0-rc, Tailwind 4.1.13, `@hugeicons/react` 1.1.10.
- Installed UI: `src/components/ui/popover.tsx` (Radix), `dialog.tsx` (Radix), `dropdown-menu.tsx` (Radix), `button.tsx` (CVA), `ProviderIcons.tsx`, `UserAvatar.tsx`. There is no installed `command`/`cmdk`, no badge primitive.
- Tokens in `src/styles/app.css`: `paper`, `pure-white`, `ink`, `graphite`, `stone`, `hairline`, `notion-blue`, `accent`, `coral`, `warning-strong`, `success`, with `.dark` counterparts.

## Needs → candidates → decision

| Need | Candidates (verified source) | Decision | Compatibility / a11y / license |
|---|---|---|---|
| Model picker with search, vendor groups, compare switch, selected checkmark, disabled/insufficient state | Installed Radix `Popover` (`src/components/ui/popover.tsx`; [shadcn Popover](https://ui.shadcn.com/docs/components/popover)); [shadcn Command](https://ui.shadcn.com/docs/components/command) (`cmdk`); [shadcn AI Elements Model Selector](https://ui.shadcn.com/docs/ai-elements/base/model-selector) (DropdownMenu + InputGroup) | **Keep installed Radix Popover** and its existing search input/buttons. Command would add `cmdk` for a short list already filtered by `filterModelCatalogEntry`; AI Elements selector has no search, no credits, no compare limits and hardcodes model examples in its docs. MIT (shadcn/Radix). | React 19 + Radix 1.1.23; Escape/focus/return-focus from Radix; buttons remain natively keyboard/touch operable; light/dark via existing tokens. |
| Status/metadata presentation (provider, role, active/inactive, feedback status/category) | [GOV.UK Tag](https://design-system.service.gov.uk/components/tag/) (status-only adjectives, non-interactive, prefers few statuses); [Atlassian Badge](https://atlassian.design/components/badge/) (numeric salience; neutral by default); [WCAG 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) (text/shape in addition to color) | **Plain text in table cells and option sublines**; keep only genuinely numeric counters. Rejected HeroUI [Chip](https://www.heroui.com/docs/components/chip) (`accent/success/warning/danger` colored containers are exactly the slop being removed) and shadcn Badge (new pill boxes). No badge library installed. | GOV.UK/USW/WCAG guidance is framework-neutral; implementation uses semantic HTML + existing Tailwind text tokens. |
| Functional controls (toggles, dialogs, row actions, compare switch) | Installed `Button`, `Dialog`, `DropdownMenu`, `Popover`; [shadcn Switch](https://ui.shadcn.com/docs/components/radix/switch); HeroUI Switch | **Keep existing controls.** The compare switch and admin toggle are already native `<button role="switch">` with `aria-checked`; replacing them would add a dependency without changing semantics. Admin toggle track changes from green to neutral/accent only. | Keyboard/focus already present; no new dependency. |
| Decorative/animated candidates ([Magic UI](https://magicui.design/), [React Bits](https://reactbits.dev/), [Thinking Orbs](https://www.thinkingorbs.com/#orbs), [Affect UI](https://www.affectui.com/components), [Tuff UI](https://tuffui.com/), [CUI](https://yappologistic.github.io/CUI/), [Sakani UI](https://www.sakaniui.com/)) | Registry/docs checked in P2 and unchanged in scope | **Rejected.** P4 removes status decoration; no animation, glow, gradient or empty filler solves this task. Same conclusion as `docs/p2-component-discovery.md`. | N/A — nothing installed. |

## Actually used

- `src/components/chat/ModelSelector.tsx` imports `Popover`/`PopoverTrigger`/`PopoverContent` from `src/components/ui/popover.tsx` (installed Radix wrapper), `HugeiconsIcon` (functional icons), `ProviderIcon` from `src/components/ui/ProviderIcons.tsx`.
- `src/routes/admin/models.tsx` already imports installed `Dialog*`, `DropdownMenu*`, `Button`-equivalent styled buttons and `ProviderIcon`; those stay.
- New domain helper `src/lib/models/presentation.ts` formats credits, context window, route labels and availability from registry/DTO values. It is a pure formatter, not a UI primitive or design system.
- Shared status text uses one small local component in `src/components/ui/StatusText.tsx` composed from plain text tokens; no background, no border, no colored dot for routine metadata.

## Status inventory — before → after

| Surface | Before | After | Kept / rationale |
|---|---|---|---|
| `admin/models.tsx` status cell | `Aktif` green bg+border+text; `Nonaktif` red bg+border+text; `Belum dievaluasi` gray box | Plain sentence-case text; inactive reason on wrapping subline with full `title`; pending uses honest evaluation label | Toggle is a real control, stays `role=switch`; destructive menu action stays coral. Status color removed; text carries meaning. |
| `admin/models.tsx` provider cell | Gray rounded box | Plain text | Vendor already has its own column; box adds no information. |
| `admin/models.tsx` copy | `Kredit / Req`, `1.048,576k tokens`-style formatting risk | `Kredit / permintaan`, `Kapasitas konteks`, `Aksi`; `Intl.NumberFormat('id-ID')` full token count; `—` for null | Exact copy required by P4. |
| `admin/models.tsx` toggle | Green track for on | Neutral track off, blue accent on; `aria-checked` and label preserved | State is also conveyed by thumb position, label and `aria-checked`. |
| `admin/users.tsx` role/status | `ADMIN`/`USER` colored boxes, `Aktif` green, `Diblokir` red | `Admin` / `Pengguna`, `Tidak diblokir` / `Diblokir` plain text | Ban/unban, delete and filter actions unchanged. Diblokir is an explicit account state, not an online indicator. |
| `admin/feedback.tsx` status/type | Four colored status boxes, three colored type boxes | `Baru` / `Diproses` / `Selesai` / `Ditolak` and `Umum` / `Saran fitur` / `Laporan bug` as plain text with functional icons where they already existed | Status update action and filters unchanged; WCAG color-only issue removed. |
| `admin/index.tsx` metric cards | `Ditangguhkan` red / `Perlu respon` marigold text | Neutral secondary text; value itself is the salient number | Numeric counts kept (genuine salience). |
| `admin/index.tsx` recent audit feed | Boxed action label | Plain text | P6 owns action copy mapping; P4 only removes redundant container. |
| `admin/audit-log.tsx` | Boxed action and boxed uppercase target type | Plain text; IDs keep monospace | P6 owns copy and detail formatting; semantic mapping untouched. |
| `admin/credits.tsx` | Colored status banner, boxed role | Plain status text; role as plain text | Credit mutations and error banner unchanged; errors remain visible. |
| `ModelSelector` option row | Vendor pill, Premium pill, warning "Sedang tidak tersedia" pill, truncated name, metadata in same flex row | Vendor only as group heading; name wraps to 2 lines; secondary line with vision/route/cost; inactive/pending shown disabled with honest text | Credits derived from `creditCost`; no hardcoded `1 kredit`; two DeepSeek routes remain separate with `cor-prod` / `zro-prod` route labels. |
| `ModelSelector` trigger | Name + hidden-on-mobile warning pill + cost pill | Compact name/selection only; disabled selection explained inline with an actionable hint | Preserves checkmark, compare count, search, keyboard and mobile behavior. |
| `CompareGrid` disabled column banner | Uppercase amber tinted banner, truncated reason | Plain text line with icon, sentence case, reason wraps and keeps full accessible text | Important warning stays visible; retry stays disabled for inactive routes. |
| `ModelColumn` / `CompareGrid` generation status | No colored status badge; per-column errors already typed | Unchanged | Per-generation failure isolation is real state; no badge added. |
| `AttachmentPreview` | Colored rounded status chips | Plain status text with existing functional icons; retry remains a button | Upload/processing/failure are real states; failure text stays visible. |
| `ArtifactProgress` | Uppercase section pill | Plain secondary text; progress/error icon kept | Real phase data; no new status dot. |
| `Composer` compare status | Functional counter with blue dot | Unchanged; dot marks an active compare session, not a status label | Actionable control/session indicator, not metadata. Selected-model unavailability gains an inline actionable line. |
| `settings` / user `feedback` success | Tinted success banner/icon | Unchanged | Confirmation of an executed action; not routine metadata. |
| `pricing` | `Populer` / `Paket saat ini` pills | Plain text; billing action button unchanged | No price/billing semantics changed. |
| `GlobalNav` / `ProfileMenu` / `Sidebar` | Plan link, avatar, nav icons | Unchanged | Interactive controls and navigation, not status badges. |
| `UserAvatar`, `ProviderIcon` | Circular/avatar shapes | Unchanged | Identity/iconography, not status pills. |

## Expected visual verification (P9 only)

Light and dark must both show plain text with adequate contrast via existing tokens; no status meaning may depend on color. P9 browser QA must cover model selection (single + compare), disabled/pending model explanation, two DeepSeek route labels, admin tables, feedback statuses, and pricing state. No browser automation was run in P4.

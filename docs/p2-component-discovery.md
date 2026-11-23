# P2 — Component discovery log

Discovery performed before UI implementation (P2, 2026-11-23). No browser QA, no remote installer.

## Installed state (verified)

- `components.json`: shadcn default style, aliases `@/components/ui`, CSS `src/styles/app.css`, CSS variables enabled.
- `package.json`: `@radix-ui/react-dialog` 1.1.23, `@radix-ui/react-dropdown-menu` 2.1.24, `@radix-ui/react-popover` 1.1.23, `@base-ui-components/react` 1.0.0-rc, Tailwind 4.1.13, React 19.2.8, `@tanstack/react-query` 5.x.
- Existing primitives in `src/components/ui/`: `button.tsx` (CVA variants incl. destructive/outline/ghost, semantic accent), `dialog.tsx` (Radix Dialog with overlay/header/footer/close), `dropdown-menu.tsx` (Radix DropdownMenu with item/separator), `popover.tsx`, `toast.tsx`, `ProviderIcons.tsx`.
- Admin shell: `src/components/admin/AdminShell.tsx`, `AdminSidebar.tsx`. Admin models table is a hand-written `<table>` in `src/routes/admin/models.tsx`.

## Needs → candidates → decision

| Need | Candidates (source) | Decision | Compatibility / license / a11y |
|---|---|---|---|
| Add/Edit two-step form, disable reason, delete confirmation | Installed `Dialog` (`src/components/ui/dialog.tsx`, Radix), [shadcn Alert Dialog](https://ui.shadcn.com/docs/components/radix/alert-dialog), HeroUI Modal | **Use installed Radix `Dialog`** for both flows; destructive confirm inside same dialog composition. Rejected new install: installed Radix already provides focus trap, Escape, return focus, `aria-modal`. MIT (shadcn/Radix). | React 19 + Radix 1.1.23 + Tailwind v4 tokens; keyboard + SR; light/dark via tokens. |
| Row actions (Edit / Uji koneksi / separator / Hapus) | Installed `DropdownMenu` (`src/components/ui/dropdown-menu.tsx`, Radix), [shadcn Dropdown Menu](https://ui.shadcn.com/docs/components/radix/dropdown-menu), HeroUI Dropdown | **Use installed Radix `DropdownMenu`** with `DropdownMenuSeparator` and destructive item styling. Rejected HeroUI: would add a parallel design system/React Aria dependency. MIT. | Radix 2.1.24, keyboard roving focus, `aria-*`, light/dark tokens. |
| Table with model/provider/credit/context/status/actions | Current hand-written table in `src/routes/admin/models.tsx`; [shadcn Data Table guide](https://ui.shadcn.com/docs/components/aria/data-table); [shadcn Table](https://ui.shadcn.com/docs/components/radix/table); [HeroUI Table](https://heroui.com/docs/components/table) | **Keep and extend current table.** shadcn guide explicitly says data tables are unique and recommends starting from `<Table/>`; current table already uses semantic tokens and is accessible with `<th scope>` semantics. Rejected HeroUI Table (parallel system, extra dependency), rejected adding `@tanstack/react-table` (pagination is P7, no sorting requested). MIT. | Existing markup, no new deps; horizontal scroll container kept for narrow screens. |
| Primary/secondary/destructive buttons | Installed `Button` (`src/components/ui/button.tsx`, CVA + Slot), [shadcn Button](https://ui.shadcn.com/docs/components/radix/button) | **Use installed `Button`** with `variant="default"` (semantic accent blue) for primary, `outline`/`ghost` for secondary, `destructive` for delete. MIT. | Focus-visible ring uses `--notion-blue`; disabled semantics native. |
| Inputs, select, search | Installed native `<input>/<select>` in current admin page; [shadcn Input](https://ui.shadcn.com/docs/components/radix/input), [shadcn Select](https://ui.shadcn.com/docs/components/radix/select), HeroUI Select | **Keep native controls** for admin-only compact form; no new registry install. Radix Select would add another dependency for a single provider filter; native `<select>` is keyboard/touch accessible. | Existing styling, light/dark via tokens. |
| Toast / brief success feedback | Installed `toast.tsx`; [shadcn Sonner](https://ui.shadcn.com/docs/components/aria/sonner) | **Reuse existing inline status line**, no stacked banners. Rejected Sonner: new dependency and heavier than one short status message. | N/A |
| Decorative / animated candidates | [Magic UI](https://magicui.design/docs/components), [Thinking Orbs](https://www.thinkingorbs.com/#orbs), [Affect UI](https://www.affectui.com/components), [React Bits](https://reactbits.dev/), [HeroUI](https://www.heroui.com/), [CUI](https://yappologistic.github.io/CUI/), [Sakani UI](https://www.sakaniui.com/), [Tuff UI](https://tuffui.com/) | **Rejected.** P2 explicitly forbids decorative animation, gradient/glow and empty filler; none of these solve the admin CRUD flow. No components installed from them. | N/A |

## Actually used

- `src/routes/admin/models.tsx` imports `Dialog*` from `src/components/ui/dialog.tsx`, `DropdownMenu*` from `src/components/ui/dropdown-menu.tsx`, `Button` from `src/components/ui/button.tsx`, `ProviderIcon` from `src/components/ui/ProviderIcons.tsx`.
- No new packages, no remote `shadcn add`, no second design system. Styling uses existing semantic tokens (`paper`, `pure-white`, `ink`, `stone`, `hairline`, `accent`, `coral`).

## Verification boundary

Sources above were fetched via web read/search on 2026-11-23. Installed versions came from `package.json` and component files. No component was installed from an unverified source. Browser QA deferred to P9 per prompt.

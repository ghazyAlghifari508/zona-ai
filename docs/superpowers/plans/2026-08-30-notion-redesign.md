# Notion Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti design system MindMarket lama dengan Notion style (DESIGN.md terbaru) di seluruh aplikasi, dan membangun ulang shell + halaman `/` + `/chat` mengikuti `preview.html` (hero highlight-pill, starter cards, sidebar collapsible, topbar model selector) tanpa mengubah logika produksi.

**Architecture:** Shell rebuild + logic port. `WorkspaceShell`, `Sidebar`, route `/`, dan topbar chat ditulis ulang mengikuti struktur `preview.html`; komponen logika (`Composer`, `MessageList`, `CompareGrid`, selector) hanya di-restyle ke token baru. Satu refactor state terkendali: `modelId` chat diangkat ke `ChatThread` via props terkontrol `modelValue`/`onModelChange`.

**Tech Stack:** Bun, TanStack Start + React 19, Tailwind CSS v4 (`@theme` di `src/styles/app.css`), Hugeicons, Radix primitives, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-30-notion-redesign-design.md`

## Global Constraints

- Runtime Bun. Semua command via `bun` / `bun x`.
- Dilarang `as any`, `as never`, `as unknown as`, `@ts-ignore`, `@ts-expect-error` (kecuali boundary SDK yang sudah terdokumentasi di kode).
- Nilai token warna/radius disalin verbatim dari DESIGN.md: canvas `#f6f5f4`, primary `#0075de`, hover `#0068c5`, sidebar `#f2f1ef`, sky-tint `#e6f3fe`, marigold `#ffb110`, coral `#f64932`, sky-wash `#62aef0`, midnight `#02093a`, hairline `rgba(0, 0, 0, 0.08)`, hairline-strong `rgba(0, 0, 0, 0.12)`.
- Radius: card `12px` (`rounded-lg`), button `8px` (`rounded-md`), pill `9999px` (`rounded-full`), composer `18px` (`rounded-xl`).
- Shadow hanya diizinkan di: composer `shadow-[0_4px_12px_rgba(0,0,0,0.07)]`, dropdown/popover `shadow-[0_8px_24px_rgba(0,0,0,0.08)]`, sidebar mobile overlay `shadow-[10px_0_30px_rgba(0,0,0,0.08)]`. Card/dialog lain tanpa shadow.
- Tanpa dependensi baru. Tanpa emoji di UI chrome. Ikon hanya dari `@hugeicons/react` (nama ikon yang dipakai plan sudah diverifikasi ada di `@hugeicons/core-free-icons`: `SidebarLeft01Icon`, `SourceCodeIcon`, `Compass01Icon`, `Idea01Icon`, plus ikon yang sudah dipakai kodebase).
- Semua `data-testid` yang ada hari ini HARUS dipertahankan (daftar di bawah). Testid baru ditandai `[baru]`.
  - Shell: `hamburger`, `guest-sidebar`, `brand-mark`, `guest-new-chat`, `guest-sign-in`, `sidebar`, `new-chat-button`
  - Chat: `web-search-toast`, `regenerate-button`, `message-list`, `routed-badge`, `typing-dots`, `inline-error`, `citation-toggle`, `citation-drawer`, `compare-grid`, `model-column`, `mobile-compare-tabs`, `composer-compare-banner`, `composer`, `drag-overlay`, `composer-error`, `composer-input`, `stop-button`, `send-button`, `file-input`, `attachment-btn`, `web-toggle`, `model-selector-trigger`, `compare-trigger-label`, `compare-counter`, `compare-switch`, `skill-selector-trigger`, `attachment-preview`, `attachment-item`, `attachment-status-*`, `attachment-retry`, `attachment-remove`
  - Lain: `home-sign-in`, `auth-card`, `error-toast`, `credit-widget`, `credit-balance`, `reset-credits-btn`
- Mapping kelas lama → baru (dipakai di semua task restyle; pilih varian hover/fill sesuai konteks):

| Lama | Baru | Catatan |
|---|---|---|
| `text-ink-black` | `text-ink` | |
| `text-stone-deep` | `text-stone` | |
| `border-hairline-mist` | `border-hairline` | |
| `bg-hairline-mist` | `bg-hairline-strong` | switch off, dot |
| `bg-sandstone` pada hover | `hover:bg-ink/5` | |
| `bg-sandstone` fill/chip/skeleton | `bg-paper` | |
| `bg-cream-paper` | `bg-paper` | canvas & chip inset |
| `bg-fresh-grass` | `bg-notion-blue` | CTA, send, switch on |
| `text-fresh-grass` / `border-fresh-grass` | `text-notion-blue` / `border-notion-blue` | |
| `bg-ink-black` fill gelap | `bg-midnight` (stop button: `bg-ink`) | |
| `border-ink-black` | `border-hairline-strong` atau dihapus | lihat konteks task |
| `outline-ink-black` / `ring-ink-black` | `outline-notion-blue` / `ring-notion-blue` | |
| `bg-coral-pop` | `bg-coral` | |
| `bg-stone-gray` | `bg-ink/10` | |
| `bg-stone-deep` | `bg-stone` | |
| `bg-pure-ink` | `bg-ink` | |
| `bg-sky-pop` | dihapus | dekorasi tanpa fungsi |
| `rounded-[10px]` / `rounded-[12px]` / `rounded-[16px]` / `rounded-[50px]` | `rounded-lg` | card 12px |
| `rounded-[24px]` | `rounded-xl` | composer 18px |
| `rounded-[9px]` / `rounded-[14px]` / `rounded-[15px]` | `rounded-md` | |

- Verifikasi per task: `bun x tsc --noEmit` + `bun x biome check ./src` wajib lolos. `bun x vitest run` wajib lolos mulai Task 6. **Suite e2e (`bun x playwright test`) hanya dijalankan penuh di Task 12** — asersi warna/geometry e2e lama memang akan gagal selama transisi dan diperbaiki di Task 12 (bukan melunakkan asersi, tapi mengupdate ke nilai desain baru).
- Commit atomik setiap task dengan message yang diberikan.

---

### Task 1: Token Notion + Font (`app.css`, `__root.tsx`)

**Files:**
- Modify: `src/styles/app.css`
- Modify: `src/routes/__root.tsx:42`

**Interfaces:**
- Produces: token Tailwind v4 `bg-paper`, `bg-sidebar`, `bg-notion-blue`, `bg-blue-hover` (pakai `hover:bg-blue-hover`), `text-ink`, `text-stone`, `text-graphite`, `bg-sky-tint`, `bg-marigold`, `bg-coral`, `bg-midnight`, `border-hairline`, `border-hairline-strong`, `font-editorial`, `rounded-md|lg|xl`. Task 2–11 mengonsumsi token ini.

- [ ] **Step 1: Tulis ulang isi `@theme` di `src/styles/app.css`**

Ganti seluruh blok `@theme` dengan konten berikut (token Notion + legacy color saja; skala teks lama `--text-body-sm` s.d. `--text-display-lg` dan radius lama `--radius-lg: 10px`, `--radius-2xl`, `--radius-3xl`, `--radius-full`, `--radius-full-2` DIHAPUS):

```css
@import "tailwindcss";

@theme {
  /* Colors — Notion style (DESIGN.md) */
  --color-notion-blue: #0075de;
  --color-blue-hover: #0068c5;
  --color-paper: #f6f5f4;
  --color-sidebar: #f2f1ef;
  --color-pure-white: #ffffff;
  --color-ink: #000000;
  --color-graphite: #615d59;
  --color-stone: #757575;
  --color-sky-tint: #e6f3fe;
  --color-marigold: #ffb110;
  --color-coral: #f64932;
  --color-sky-wash: #62aef0;
  --color-midnight: #02093a;
  --color-hairline: rgba(0, 0, 0, 0.08);
  --color-hairline-strong: rgba(0, 0, 0, 0.12);

  /* Typography — Font Families */
  --font-inter:
    "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", Roboto, sans-serif;
  --font-editorial: Georgia, "Times New Roman", serif;

  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 18px;

  /* === Legacy MindMarket colors — dihapus di Task 11 === */
  --color-fresh-grass: #8ed462;
  --color-cream-paper: #f5f1e4;
  --color-ink-black: #2c2e2a;
  --color-sandstone: #e0dbce;
  --color-stone-gray: #80827f;
  --color-stone-deep: #6a6c68;
  --color-hairline-mist: #d5d5d4;
  --color-pure-ink: #000000;
  --color-sky-pop: #2ba0ff;
  --color-coral-pop: #ff705d;
  --color-sunshine-pop: #f5e211;
}
```

- [ ] **Step 2: Update rule di luar `@theme`**

```css
body {
  background: var(--color-paper);
  font-family: var(--font-inter);
  color: var(--color-ink);
}

/* Accessibility — visible focus ring (WCAG 2.1 AA, 2.4.7). */
@layer base {
  *:focus-visible {
    outline: 2px solid var(--color-notion-blue);
    outline-offset: 2px;
  }
}
```

Blok `@media (prefers-reduced-motion: reduce)` yang ada dipertahankan apa adanya.

- [ ] **Step 3: Update font link di `src/routes/__root.tsx` line 42**

```tsx
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
```

- [ ] **Step 4: Verifikasi**

Run: `bun x tsc --noEmit && bun x biome check ./src`
Expected: PASS.

Run: `rg -n "text-(body-sm|body-lg|subheading|heading|heading-sm|heading-lg|display|display-lg)\b" src; rg -n "rounded-(2xl|3xl|full-2)\b" src`
Expected: tidak ada match. Jika ada match, ganti dengan nilai arbitrary px sesuai konteks (mis. `text-[22px]`) sebelum lanjut.

- [ ] **Step 5: Commit**

```bash
git add src/styles/app.css src/routes/__root.tsx
git commit -m "feat(design): add Notion design tokens and Inter weights 400-700"
```

---

### Task 2: WorkspaceShell rebuild (collapse + guest sidebar)

**Files:**
- Modify: `src/components/layout/WorkspaceShell.tsx` (tulis ulang penuh)

**Interfaces:**
- Consumes: token Task 1, `Sidebar` dari Task 3 dengan props baru `collapsed?: boolean` dan `onToggleCollapse?: () => void`.
- Produces: testid `sidebar-collapse` `[baru]`, `brand-mark`, `guest-sidebar`, `guest-new-chat`, `guest-sign-in`, `hamburger` (semua nilai lama dipertahankan). State collapse diangkat ke shell supaya konsisten di kedua sidebar.

Catatan deviasi kecil dari spec: collapse juga berlaku di guest sidebar (bukan hanya authed) supaya bisa di-e2e tanpa login Google — perilaku identik, tidak menambah logika.

- [ ] **Step 1: Tulis ulang `WorkspaceShell.tsx`**

```tsx
import {
  GitCompareIcon,
  Login03Icon,
  Menu01Icon,
  MessageAdd01Icon,
  Search01Icon,
  SidebarLeft01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { Sidebar } from './Sidebar'

type Props = {
  children: React.ReactNode
  credits?: number
  onNewChat?: () => void
  onSelectConversation?: (id: string) => void
  activeConversationId?: string
  guest?: boolean
  onSignIn?: () => void
  signingIn?: boolean
}

export function WorkspaceShell({
  children,
  credits = 85,
  onNewChat,
  onSelectConversation,
  activeConversationId,
  guest = false,
  onSignIn,
  signingIn = false,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="flex min-h-screen bg-paper">
      <button
        type="button"
        data-testid="hamburger"
        aria-label={sidebarOpen ? 'Tutup sidebar' : 'Buka sidebar'}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen((v) => !v)}
        className="fixed top-3 left-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-pure-white text-ink lg:hidden"
      >
        <HugeiconsIcon
          icon={Menu01Icon}
          size={18}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      {guest ? (
        <aside
          data-testid="guest-sidebar"
          className={`${sidebarOpen ? 'fixed' : 'hidden'} inset-y-0 left-0 z-30 flex h-screen shrink-0 flex-col border-r border-hairline bg-sidebar transition-[width] duration-200 lg:sticky lg:flex ${
            collapsed ? 'w-[76px]' : 'w-[280px]'
          }`}
        >
          <div className="flex h-full flex-col p-3">
            <div className="flex items-center gap-2">
              <span
                data-testid="brand-mark"
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 border-notion-blue bg-pure-white text-[13px] font-extrabold tracking-[-0.04em] text-notion-blue"
              >
                ZA
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1 flex-col">
                  <span className="block text-[15px] font-bold tracking-[-0.02em] text-ink">
                    ZonaAI
                  </span>
                  <span className="block text-[11px] text-ink/40">
                    Your intelligent space
                  </span>
                </span>
              )}
              <button
                type="button"
                data-testid="sidebar-collapse"
                aria-label={collapsed ? 'Perbesar sidebar' : 'Perkecil sidebar'}
                onClick={() => setCollapsed((v) => !v)}
                className="ml-auto hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink lg:flex"
              >
                <HugeiconsIcon
                  icon={SidebarLeft01Icon}
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            </div>
            <button
              type="button"
              data-testid="guest-new-chat"
              onClick={() => {
                setSidebarOpen(false)
                onNewChat?.()
              }}
              className={`mt-4 flex min-h-[42px] w-full items-center gap-2.5 rounded-md bg-notion-blue text-[13px] font-semibold text-pure-white transition-colors duration-200 hover:bg-blue-hover ${
                collapsed ? 'justify-center px-0' : 'px-3'
              }`}
            >
              <HugeiconsIcon
                icon={MessageAdd01Icon}
                size={17}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {!collapsed && 'Chat baru'}
            </button>
            {!collapsed && (
              <>
                <div className="mt-5 flex-1">
                  <p className="px-2.5 pb-2 text-[10px] font-bold tracking-[0.11em] text-ink/40 uppercase">
                    Jelajahi
                  </p>
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={onNewChat}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink"
                    >
                      <HugeiconsIcon
                        icon={Search01Icon}
                        size={16}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      Cari jawaban dengan AI
                    </button>
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink"
                    >
                      <HugeiconsIcon
                        icon={GitCompareIcon}
                        size={16}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      Bandingkan model
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-hairline bg-pure-white p-4">
                  <p className="text-[14px] font-semibold text-ink">
                    Simpan percakapanmu
                  </p>
                  <p className="mt-1 text-[13px] leading-5 text-stone">
                    Masuk untuk membuka riwayat chat di perangkat mana pun.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="guest-sign-in"
                  onClick={onSignIn}
                  disabled={signingIn}
                  className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-notion-blue px-4 text-[14px] font-medium text-pure-white transition-colors duration-200 hover:bg-blue-hover disabled:opacity-60"
                >
                  <HugeiconsIcon
                    icon={Login03Icon}
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  {signingIn ? 'Menghubungkan...' : 'Masuk'}
                </button>
              </>
            )}
          </div>
        </aside>
      ) : (
        <Sidebar
          credits={credits}
          onNewChat={onNewChat}
          onSelectConversation={onSelectConversation}
          activeConversationId={activeConversationId}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      )}
      <main className="min-w-0 flex-1 bg-paper p-4 lg:p-6">
        <div className="mx-auto h-full max-w-[920px] pt-12 lg:pt-0">
          {children}
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Verifikasi**

Run: `bun x tsc --noEmit && bun x biome check ./src`
Expected: PASS (tsc akan error sampai Task 3 menambah props `collapsed`/`onToggleCollapse` di Sidebar — jika ingin hijau lebih awal, kerjakan Task 3 sebelum verifikasi; keduanya satu commit-unit konseptual).

Catatan: commit Task 2 + Task 3 boleh digabung menjadi satu commit jika tsc tidak lolos terpisah; pisahkan hanya jika keduanya hijau mandiri.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/WorkspaceShell.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(layout): rebuild workspace shell with collapsible Notion sidebar"
```

---

### Task 3: Sidebar rebuild

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: props baru dari Task 2 (`collapsed?: boolean`, `onToggleCollapse?: () => void`), token Task 1, `CreditWidget` (interface lama, di-restyle Task 9).
- Produces: testid `sidebar`, `new-chat-button`, `sidebar-collapse` `[baru]`. SEMUA logika lama (query `getConversations`, mutation create/rename/archive/delete, optimistic cache, dialog hapus, load more) dipertahankan persis — hanya JSX/classNames yang berubah.

- [ ] **Step 1: Update `Props` type**

```tsx
type Props = {
  credits?: number
  onNewChat?: () => void
  onSelectConversation?: (id: string) => void
  activeConversationId?: string
  /** Mobile: visibility toggled by hamburger. On desktop (>=lg), always visible. */
  mobileOpen?: boolean
  onMobileClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}
```

Tambahkan ke parameter destructure: `collapsed = false, onToggleCollapse`.

- [ ] **Step 2: Ganti seluruh return JSX `aside` (logika hook/mutation TIDAK diubah)**

Struktur baru — potongan kunci (pertahankan semua handler yang ada):

```tsx
    <aside
      data-testid="sidebar"
      className={`${mobileOpen ? 'fixed' : 'hidden'} inset-y-0 left-0 z-30 flex h-screen shrink-0 flex-col border-r border-hairline bg-sidebar transition-[width] duration-200 lg:sticky lg:flex ${
        collapsed ? 'w-[76px]' : 'w-[280px]'
      }`}
    >
      <div className="flex h-full flex-col p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 border-notion-blue bg-pure-white text-[13px] font-extrabold tracking-[-0.04em] text-notion-blue">
            ZA
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1 flex-col">
              <span className="block text-[15px] font-bold tracking-[-0.02em] text-ink">
                ZonaAI
              </span>
              <span className="block text-[11px] text-ink/40">
                Your intelligent space
              </span>
            </span>
          )}
          <button
            type="button"
            data-testid="sidebar-collapse"
            aria-label={collapsed ? 'Perbesar sidebar' : 'Perkecil sidebar'}
            onClick={onToggleCollapse}
            className="ml-auto hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink lg:flex"
          >
            <HugeiconsIcon
              icon={SidebarLeft01Icon}
              size={18}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
        </div>
        <button
          type="button"
          onClick={/* handler lama: onMobileClose + onNewChat/createMutation */}
          disabled={createMutation.isPending}
          data-testid="new-chat-button"
          className={`mt-4 flex min-h-[42px] w-full items-center gap-2.5 rounded-md bg-notion-blue text-[13px] font-semibold text-pure-white transition-colors duration-200 hover:bg-blue-hover disabled:cursor-wait disabled:opacity-60 ${
            collapsed ? 'justify-center px-0' : 'px-3'
          }`}
        >
          {createMutation.isPending ? (
            <HugeiconsIcon
              icon={Loading03Icon}
              size={16}
              strokeWidth={1.75}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <HugeiconsIcon
              icon={PlusSignIcon}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          )}
          {!collapsed && 'Chat baru'}
        </button>
        {!collapsed && (
          <label className="relative mt-4 block">
            <span className="sr-only">Cari percakapan</span>
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari percakapan..."
              className="w-full rounded-md border border-hairline bg-pure-white py-2 pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-stone focus-visible:border-notion-blue"
            />
          </label>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <p
          className={`px-2.5 pb-2 text-[10px] font-bold tracking-[0.11em] text-ink/40 uppercase ${
            collapsed ? 'text-center' : ''
          }`}
        >
          Recent
        </p>
        {/* Skeleton: ganti bg-sandstone → bg-paper, rounded-[10px] → rounded-md */}
        {/* Error box: border-hairline-mist → border-hairline, text-stone-deep → text-stone */}
        {/* Empty state: border-hairline bg-pure-white rounded-md p-4; judul text-ink, sub text-stone */}
        <nav aria-label="Riwayat percakapan" className="space-y-0.5">
          {conversationItems.map((conversation) => (
            <div
              key={conversation.id}
              className={`group flex items-center rounded-md transition-colors duration-200 ${
                activeConversationId === conversation.id
                  ? 'bg-pure-white shadow-[inset_0_0_0_1px_var(--color-hairline)]'
                  : 'hover:bg-ink/5'
              }`}
            >
              {/* editing input: rounded-md border-hairline bg-pure-white focus-visible:border-notion-blue */}
              {/* tombol item: min-w-0 flex-1 px-2.5 py-2 text-left */}
              <span className="block truncate text-[13px] text-ink/80 group-hover:text-ink">
                {conversation.title ?? 'New Chat'}
              </span>
              {/* baris tanggal: text-[11px] text-ink/35, ikon Clock01Icon dipertahankan */}
              {/* DropdownMenu trigger: mr-1 rounded-md p-1.5 text-stone opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100 */}
              {/* DropdownMenuContent dari Task 9 — biarkan memakai default */}
            </div>
          ))}
        </nav>
        {/* Load more: mt-3 w-full rounded-md border border-hairline px-3 py-2 text-[12px] text-ink/60 hover:bg-ink/5 */}
      </div>

      <div className="border-t border-hairline">
        {!collapsed && <CreditWidget credits={credits} />}
        <div className="p-3">
          <button
            type="button"
            onClick={/* handler lama: authClient.signOut */}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <HugeiconsIcon
              icon={Logout03Icon}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            {!collapsed && 'Keluar'}
          </button>
        </div>
      </div>
      <Dialog /* ...persis seperti semula, hanya hapus className="rounded-[50px]" dari DialogContent... */>
    </aside>
```

- [ ] **Step 3: Verifikasi**

Run: `bun x tsc --noEmit && bun x biome check ./src`
Expected: PASS.

- [ ] **Step 4: Commit**

Commit bersama Task 2 (lihat Step 3 Task 2). Jika dipisah: `git commit -m "feat(layout): rebuild sidebar with Notion tokens and collapse"`.

---

### Task 4: Halaman `/` rebuild (hero + starter cards)

**Files:**
- Modify: `src/routes/index.tsx`

**Interfaces:**
- Consumes: token Task 1, `Composer` (interface lama — `placement="inline"` tetap dipakai, model selector tetap di composer untuk halaman ini).
- Produces: testid `starter-build`, `starter-compare`, `starter-research`, `starter-review` `[baru]`; `home-sign-in` dipertahankan. Starter klik → `setDraft(prompt)` + bump `composerKey` (pola draft yang sudah ada).

- [ ] **Step 1: Tambah import ikon + konstanta STARTERS (setelah import blok)**

```tsx
import {
  Compass01Icon,
  GitCompareIcon,
  Idea01Icon,
  SourceCodeIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

const STARTERS = [
  {
    id: 'build',
    title: 'Build something',
    sub: 'Rancang produk, fitur, atau arsitektur aplikasi.',
    prompt: 'Bantu saya merancang aplikasi AI dari nol',
    icon: SourceCodeIcon,
    iconClass: 'bg-sky-tint text-notion-blue',
  },
  {
    id: 'compare',
    title: 'Compare AI models',
    sub: 'Bandingkan kualitas, speed, dan use case model.',
    prompt: 'Bandingkan beberapa model AI untuk coding',
    icon: GitCompareIcon,
    iconClass: 'bg-[#fff0e8] text-coral',
  },
  {
    id: 'research',
    title: 'Research a topic',
    sub: 'Susun riset yang lebih terarah dan mudah dipahami.',
    prompt: 'Bantu saya riset teknologi yang sedang relevan',
    icon: Compass01Icon,
    iconClass: 'bg-[#fff4cf] text-[#8a5a00]',
  },
  {
    id: 'review',
    title: 'Review an idea',
    sub: 'Bedah ide, UX, positioning, dan risiko produk.',
    prompt: 'Review ide produk saya dan kasih kritik',
    icon: Idea01Icon,
    iconClass: 'bg-[#e9edff] text-midnight',
  },
] as const
```

- [ ] **Step 2: Ganti return JSX `ChatHome` (logika signIn/handleSend/handleSendCompare TIDAK diubah)**

```tsx
  return (
    <WorkspaceShell
      guest={!session?.user}
      signingIn={signingIn}
      onSignIn={() => void signIn()}
      onNewChat={() => {
        setDraft('')
        setAuthError(null)
        setComposerKey((current) => current + 1)
      }}
      onSelectConversation={(conversationId) => {
        void navigate({
          to: '/chat/$conversationId',
          params: { conversationId },
        })
      }}
    >
      <div className="flex min-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex min-h-12 items-center justify-end">
          {!session?.user && (
            <button
              type="button"
              data-testid="home-sign-in"
              onClick={() => void signIn()}
              disabled={signingIn}
              className="flex min-h-9 items-center rounded-md bg-notion-blue px-4 text-[14px] font-medium text-pure-white transition-colors duration-200 hover:bg-blue-hover disabled:opacity-60"
            >
              {signingIn ? 'Menghubungkan...' : 'Masuk'}
            </button>
          )}
        </header>
        <div className="flex flex-1 items-center justify-center py-6 sm:px-6">
          <div className="-translate-y-[2vh] w-full max-w-[820px] px-1 sm:px-4">
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-notion-blue bg-pure-white text-[15px] font-extrabold tracking-[-0.04em] text-notion-blue">
              ZA
            </div>
            <h1 className="mt-6 max-w-[690px] text-[clamp(42px,5.8vw,72px)] leading-[1.02] font-bold tracking-[-0.048em] text-ink">
              Ada yang bisa{' '}
              <span className="inline-block -rotate-1 rounded-full bg-marigold px-[0.25em] pt-[0.02em] pb-[0.12em] leading-[0.9]">
                dibantu?
              </span>
            </h1>
            <p className="mt-5 max-w-[640px] font-editorial text-[18px] leading-[1.6] text-graphite">
              Tanya apa saja, bandingkan ide, riset teknologi, bantu coding,
              atau ubah gagasan mentah jadi sesuatu yang siap dibangun.
            </p>
            <div className="mt-10 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter.id}
                  type="button"
                  data-testid={`starter-${starter.id}`}
                  onClick={() => {
                    setDraft(starter.prompt)
                    setComposerKey((current) => current + 1)
                  }}
                  className="flex min-h-[118px] flex-col items-start justify-between rounded-lg border border-hairline bg-pure-white p-[18px] text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-hairline-strong"
                >
                  <span
                    className={`flex h-[30px] w-[30px] items-center justify-center rounded-full ${starter.iconClass}`}
                  >
                    <HugeiconsIcon
                      icon={starter.icon}
                      size={15}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-[18px] block">
                    <span className="block text-[14px] font-semibold leading-[1.35] text-ink">
                      {starter.title}
                    </span>
                    <span className="mt-1 block text-[12px] leading-[1.4] text-ink/45">
                      {starter.sub}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-6">
              <Composer
                key={composerKey}
                placement="inline"
                guest={!session?.user}
                onSignIn={() => void signIn()}
                initialContent={draft}
                isStreaming={submitting}
                autoFocusInput
                compareEnabled={compareEnabled}
                onCompareEnabledChange={setCompareEnabled}
                compareModelIds={compareModelIds}
                onCompareModelIdsChange={setCompareModelIds}
                onSend={handleSend}
                onSendCompare={handleSendCompare}
              />
            </div>
            {authError && (
              <p role="alert" className="mt-3 text-center text-[13px] text-ink">
                {authError}
              </p>
            )}
            {!session?.user && (
              <p className="mt-3 text-center text-[13px] text-stone">
                Pesanmu tetap tersimpan saat kamu masuk.
              </p>
            )}
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
```

- [ ] **Step 3: Verifikasi**

Run: `bun x tsc --noEmit && bun x biome check ./src && bun x vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat(home): Notion hero with highlight pill and starter cards"
```

---

### Task 5: Topbar chat + pengangkatan state model

**Files:**
- Modify: `src/routes/chat/$conversationId.tsx`
- Modify: `src/components/chat/Composer.tsx`

**Interfaces:**
- Consumes: token Task 1; `ModelSelector` (interface lama `value/onChange/credits/compareEnabled/onCompareEnabledChange/compareModelIds/onCompareModelIdsChange`).
- Produces: `Composer` props baru `modelValue?: string`, `onModelChange?: (id: string)` — kontrol terangkat; saat `modelValue` diberikan dan `compareEnabled === false`, selector TIDAK dirender di composer (ada di topbar). Testid baru: `topbar-compare-label`. Testid lama dipertahankan: `regenerate-button`, `web-search-toast`. Header judul percakapan (`<h1>`) dihapus dari halaman chat.

- [ ] **Step 1: Composer — tambah props terkontrol**

Di `Composer.tsx`, tambahkan ke `type Props`:

```tsx
  modelValue?: string
  onModelChange?: (id: string) => void
```

Tambahkan ke destructure: `modelValue, onModelChange`.

Ganti state model:

```tsx
  const [internalModelId, setInternalModelId] = useState(initialModel)
  const modelId = modelValue ?? internalModelId
  const changeModel = (id: string) => {
    setInternalModelId(id)
    onModelChange?.(id)
  }
```

Di JSX, bungkus `ModelSelector` composer:

```tsx
              {(modelValue === undefined || compareEnabled) && (
                <ModelSelector
                  value={modelId}
                  onChange={changeModel}
                  credits={credits}
                  compareEnabled={compareEnabled}
                  onCompareEnabledChange={(enabled) =>
                    onCompareEnabledChange?.(enabled)
                  }
                  compareModelIds={compareModelIds}
                  onCompareModelIdsChange={(ids) =>
                    onCompareModelIdsChange?.(ids)
                  }
                />
              )}
```

Catatan: `isPremium` tetap membaca `modelId` — tidak ada perubahan lain di Composer (restyle visual di Task 8).

- [ ] **Step 2: ChatThread — state model + topbar**

Di `$conversationId.tsx`:

1. Import `ModelSelector`:
```tsx
import { ModelSelector } from '@/components/chat/ModelSelector'
```
2. Tambah state (dekat state compare):
```tsx
  const [modelId, setModelId] = useState('auto')
```
3. Ganti blok header (baris `<header className="mb-4 ...">...</header>`) dengan:

```tsx
        <header className="flex h-16 shrink-0 items-center gap-3 px-1 lg:px-2">
          {!compareEnabled ? (
            <ModelSelector
              value={modelId}
              onChange={setModelId}
              credits={credits}
              compareEnabled={compareEnabled}
              onCompareEnabledChange={setCompareEnabled}
              compareModelIds={compareModelIds}
              onCompareModelIdsChange={setCompareModelIds}
            />
          ) : (
            <span
              data-testid="topbar-compare-label"
              className="text-[14px] font-bold text-ink"
            >
              Mode banding · {compareModelIds.length} model
            </span>
          )}
          <span className="flex-1" />
          {!showCompare &&
            messages.some(
              (m) => m.role === 'assistant' && !m.streaming,
            ) && (
              <button
                type="button"
                data-testid="regenerate-button"
                onClick={() => {
                  const lastAssistant = [...messages]
                    .reverse()
                    .find((m) => m.role === 'assistant')
                  if (lastAssistant) handleRegenerate(lastAssistant.id)
                }}
                disabled={isStreaming}
                className="flex min-h-9 items-center rounded-md px-3 text-[13px] text-stone transition-colors duration-200 hover:bg-ink/5 hover:text-ink disabled:opacity-50"
              >
                Buat ulang
              </button>
            )}
        </header>
```

4. Hapus blok "Buat ulang" yang lama (setelah `MessageList`, baris 770-787) — sudah pindah ke topbar.
5. Container tinggi: ganti `flex h-[calc(100vh-2rem)] flex-col` → `flex h-[calc(100dvh-2rem)] flex-col lg:h-[calc(100dvh-3rem)]`.
6. Toast web search: mapping kelas → `rounded-md border border-hairline bg-pure-white px-4 py-3 text-[13px] text-ink` (posisi/role tetap).
7. Composer call: tambahkan `modelValue={modelId} onModelChange={setModelId}`.
8. Restyle `ConversationError` (mapping): teks `text-ink` / `text-stone`, link `rounded-md border border-hairline-strong bg-pure-white px-4 py-2 text-[14px] font-medium text-ink hover:bg-ink/5`.

- [ ] **Step 3: Verifikasi**

Run: `bun x tsc --noEmit && bun x biome check ./src`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/chat/$conversationId.tsx src/components/chat/Composer.tsx
git commit -m "feat(chat): move model selector to topbar with lifted modelId state"
```

---

### Task 6: MessageList + subkomponen pesan (restyle)

**Files:**
- Modify: `src/components/chat/MessageList.tsx`
- Modify: `src/components/chat/TypingDots.tsx`
- Modify: `src/components/chat/InlineError.tsx`
- Modify: `src/components/chat/CodeBlock.tsx`
- Modify: `src/components/chat/CitationDrawer.tsx`
- Modify: `src/components/chat/AttachmentPreview.tsx`

**Interfaces:**
- Consumes: token Task 1, mapping global.
- Produces: `ChatMessage` type & export tetap identik. Layout pesan baru ala preview: grid avatar 34px (user = border coral, AI = border biru), meta nama, konten. Bubble user kanan DIHAPUS (jadi satu kolom percakapan). Testid `message-list`, `routed-badge` dipertahankan.

- [ ] **Step 1: Tulis ulang `MessageItem` di `MessageList.tsx`**

```tsx
function MessageItem({
  message,
  catalog,
}: {
  message: ChatMessage
  catalog: ReturnType<typeof useModelCatalog>
}) {
  const entry = findCatalogEntry(catalog, message.modelId)
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-3.5 py-5">
      <div
        className={
          message.role === 'user'
            ? 'flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-coral bg-pure-white text-[11px] font-extrabold text-ink'
            : 'flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-notion-blue bg-pure-white text-[11px] font-extrabold tracking-[-0.04em] text-notion-blue'
        }
      >
        {message.role === 'user' ? 'K' : 'ZA'}
      </div>
      <div className="min-w-0 pt-0.5">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[13px] font-bold text-ink">
            {message.role === 'user'
              ? 'Kamu'
              : (entry?.displayName ?? 'Zona.ai')}
          </span>
          {message.role !== 'user' && message.routerModelId && message.routingReason && (
            <span
              data-testid="routed-badge"
              className="rounded-full bg-sky-tint px-2 py-0.5 text-[10px] font-bold text-notion-blue"
            >
              Routed to {message.routerModelId}
            </span>
          )}
        </div>
        {message.role === 'user' ? (
          <div className="text-[15px] leading-[1.7] text-ink [overflow-wrap:anywhere]">
            {message.content}
          </div>
        ) : (
          <div className="min-w-0 space-y-2">
            <div className="prose prose-sm max-w-none text-[15px] leading-[1.7] text-ink [overflow-wrap:anywhere]">
              <ReactMarkdown
                rehypePlugins={[rehypeSanitize, rehypeHighlight]}
                components={{
                  code: ({ children, className }) => {
                    const isBlock =
                      String(children).includes('\n') || Boolean(className)
                    if (isBlock) {
                      return <CodeBlock>{String(children)}</CodeBlock>
                    }
                    return (
                      <code className="rounded bg-paper px-1 py-0.5 text-[14px]">
                        {children}
                      </code>
                    )
                  },
                  pre: ({ children }) => <>{children}</>,
                }}
              >
                {message.content}
              </ReactMarkdown>
              {message.streaming && !message.content && <TypingDots />}
            </div>
            {message.errorMessage && (
              <InlineError
                code={message.errorCode}
                message={message.errorMessage}
                onRetry={message.onRetry}
              />
            )}
            {message.webSources && message.webSources.length > 0 && (
              <CitationDrawer sources={message.webSources} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update container `MessageList`**

- Root: `min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4` tetap.
- Branch non-virtual: `flex flex-col gap-6` → `flex flex-col`.
- Branch virtual: hapus `className="pb-6"` pada wrapper item (py-5 MessageItem sudah memberi spacing).
- Empty state:

```tsx
        <div className="flex flex-1 items-center justify-center py-20 text-center">
          <div className="space-y-2">
            <h2 className="text-[22px] font-bold tracking-[-0.242px] text-ink">
              Mulai percakapan
            </h2>
            <p className="text-[14px] text-stone">Tanyakan apa saja ke Zona.ai</p>
          </div>
        </div>
```

- [ ] **Step 3: Restyle subkomponen kecil (mapping global)**

Jalankan `rg -n "cream-paper|fresh-grass|sandstone|hairline-mist|stone-deep|stone-gray|ink-black" src/components/chat/TypingDots.tsx src/components/chat/InlineError.tsx src/components/chat/CodeBlock.tsx src/components/chat/CitationDrawer.tsx src/components/chat/AttachmentPreview.tsx`, lalu terapkan mapping global pada setiap hit. Panduan konteks:
- `TypingDots`: dot `bg-ink` dengan opacity berjenjang tetap; warna lama `bg-ink-black` → `bg-ink`.
- `InlineError`: container `rounded-md border border-coral/30 bg-[#fff0e8] px-3 py-2 text-[13px] text-ink`; tombol retry `rounded-md text-notion-blue hover:bg-ink/5`.
- `CodeBlock`: container putih `rounded-lg border border-hairline`, header `bg-paper text-stone`, tombol copy hover `bg-ink/5`.
- `CitationDrawer`: toggle `rounded-full bg-paper px-2.5 py-1 text-[12px] text-stone hover:text-ink`; drawer `rounded-lg border border-hairline bg-pure-white p-3`; item sumber `hover:bg-paper`.
- `AttachmentPreview`: item `rounded-md border border-hairline bg-pure-white`; status pending/processing `bg-sky-tint text-notion-blue`, completed `bg-sky-tint text-notion-blue`, failed `bg-[#fff0e8] text-coral`; tombol remove/retry `text-stone hover:text-ink`.

- [ ] **Step 4: Verifikasi**

Run: `bun x tsc --noEmit && bun x biome check ./src && bun x vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/MessageList.tsx src/components/chat/TypingDots.tsx src/components/chat/InlineError.tsx src/components/chat/CodeBlock.tsx src/components/chat/CitationDrawer.tsx src/components/chat/AttachmentPreview.tsx
git commit -m "feat(chat): conversation-style messages with Notion avatars"
```

---

### Task 7: Compare components restyle

**Files:**
- Modify: `src/components/chat/CompareGrid.tsx`
- Modify: `src/components/chat/ModelColumn.tsx`
- Modify: `src/components/chat/MobileCompareTabs.tsx`

**Interfaces:**
- Consumes: token Task 1, mapping global. Semua props/testid tetap.

- [ ] **Step 1: `CompareGrid`** — bubble prompt user:

```tsx
          <div className="max-w-[70%] rounded-lg border border-hairline bg-pure-white px-3 py-2 text-[15px] leading-relaxed [overflow-wrap:anywhere] text-ink">
```

- [ ] **Step 2: `ModelColumn`**

- Root: `flex min-h-[400px] flex-col overflow-hidden rounded-lg border border-hairline bg-pure-white`
- Header: `sticky top-0 flex items-center justify-between rounded-t-lg border-b border-hairline bg-pure-white p-3`
- Icon box: `rounded-md border border-hairline bg-pure-white text-ink`
- Nama model: `text-[14px] font-semibold text-ink`
- Tombol retry header: `inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-notion-blue hover:bg-ink/5`
- Tombol stop & copy: `inline-flex h-7 w-7 items-center justify-center rounded-md text-stone hover:bg-ink/5 hover:text-ink`
- `copied` label: `text-xs text-stone`
- Retry body: `inline-flex items-center gap-1 rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-sm text-ink hover:bg-ink/5`
- Skeleton queued: `bg-paper`
- Reasoning details: `mb-2 rounded-md border border-hairline bg-paper p-2`; summary `cursor-pointer text-xs text-stone`; isi `text-sm text-ink`
- Inline code markdown: `rounded bg-paper px-1 py-0.5 text-[14px]`

- [ ] **Step 3: `MobileCompareTabs`**

- Container tab: `flex gap-1 overflow-x-auto rounded-full border border-hairline bg-pure-white p-1`
- Tab aktif: `bg-sky-tint font-bold text-notion-blue` ; tab pasif: `text-stone hover:text-ink border border-transparent` (keduanya `rounded-full px-3 py-1.5 text-xs`)
- Dot aktif: `bg-ink` ; pasif: `bg-hairline-strong`

- [ ] **Step 4: Verifikasi**

Run: `bun x tsc --noEmit && bun x biome check ./src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/CompareGrid.tsx src/components/chat/ModelColumn.tsx src/components/chat/MobileCompareTabs.tsx
git commit -m "feat(chat): restyle compare grid, model columns, and mobile tabs"
```

---

### Task 8: Composer + ModelSelector + SkillSelector restyle

**Files:**
- Modify: `src/components/chat/Composer.tsx`
- Modify: `src/components/chat/ModelSelector.tsx`
- Modify: `src/components/chat/SkillSelector.tsx`

**Interfaces:**
- Consumes: token Task 1; props `modelValue`/`onModelChange` dari Task 5.
- Produces: tampilan composer ala preview (putih radius 18px, shadow lembut, send bulat biru). Semua testid tetap.

- [ ] **Step 1: `Composer` container & tombol**

- Wrapper fixed: `bg-cream-paper` → `bg-paper`; inner `max-w-[800px]` → `max-w-[860px]` (kedua placement).
- Container `data-testid="composer"`:

```tsx
          className="relative flex flex-col gap-2 rounded-xl border border-hairline-strong bg-pure-white p-2.5 shadow-[0_4px_12px_rgba(0,0,0,0.07)] transition-colors duration-200 focus-within:border-ink/30"
```

- Drag overlay: `rounded-xl border-2 border-dashed border-ink/40 bg-paper text-[15px] font-medium text-stone`
- Compare banner: `rounded-md border border-hairline bg-sky-tint px-3 py-2 text-[13px] text-ink`; teks insufficient: `text-xs text-stone`
- Error box: `rounded-md border border-hairline bg-paper px-3 py-2 text-[13px] text-ink`
- Textarea: `text-[15px] leading-[1.5] ... placeholder:text-ink/35` (kelas lama `text-[16px]`/`placeholder:text-stone-deep` diganti)
- Send button: `bg-notion-blue text-pure-white hover:bg-blue-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-50`
- Stop button: `bg-ink text-pure-white hover:bg-ink/80`
- Attachment btn: `border border-hairline bg-pure-white text-ink hover:bg-ink/5`
- Web toggle: aktif `border-notion-blue bg-sky-tint text-notion-blue` ; pasif `border-hairline bg-pure-white text-ink hover:bg-ink/5`
- Note premium / kredit kurang: `text-stone`

- [ ] **Step 2: `ModelSelector`**

- Trigger:

```tsx
          className="flex min-h-[38px] items-center gap-2 rounded-md px-2.5 text-ink transition-colors duration-200 hover:bg-ink/5"
```

- Nama model: `text-[14px] font-bold tracking-[-0.015em]`; label compare `data-testid="compare-trigger-label"` tetap.
- Cost pill: `rounded-full bg-sky-tint px-2 py-0.5 text-[10px] font-bold text-notion-blue`
- Chevron: `text-ink/40`
- PopoverContent: `w-[340px] rounded-lg border border-hairline bg-pure-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)]`
- Label header: `text-[10px] font-bold tracking-[0.11em] text-ink/40 uppercase`; counter `text-xs font-bold text-ink`
- Row compare: `rounded-md bg-paper px-3 py-2`; switch on `bg-notion-blue` / off `bg-hairline-strong`
- Option: `isSelected ? 'bg-paper' : 'hover:bg-ink/5'`; icon box auto `border-ink bg-ink` / lainnya `border-hairline bg-pure-white text-ink`
- Vendor pill: `bg-paper px-1.5 py-0.5 text-[10.5px] text-stone`
- Premium pill: `bg-sky-tint px-1.5 py-0.5 text-[10.5px] font-semibold text-notion-blue`
- Intelligence bars — ganti style `background`:

```tsx
                              background:
                                slot <= m.intelligenceLevel
                                  ? m.intelligenceLevel === 4
                                    ? 'var(--color-coral)'
                                    : m.intelligenceLevel === 3
                                      ? 'var(--color-marigold)'
                                      : 'var(--color-sky-wash)'
                                  : 'var(--color-hairline-strong)',
```

- Tick normal: `text-notion-blue`
- Checkbox compare: selected `border-notion-blue bg-notion-blue` + ikon `text-pure-white` ; unselected `border-hairline-strong bg-pure-white`

- [ ] **Step 3: `SkillSelector`**

Jalankan `rg -n "cream-paper|fresh-grass|sandstone|hairline-mist|stone-deep|ink-black" src/components/chat/SkillSelector.tsx`, terapkan pola yang sama persis dengan ModelSelector: trigger `min-h-[38px] rounded-md px-2.5 hover:bg-ink/5`, popover `rounded-lg border-hairline shadow-[0_8px_24px_rgba(0,0,0,0.08)]`, option selected `bg-paper`, label header uppercase `text-ink/40`. Testid `skill-selector-trigger`, `skill-option-*` tetap.

- [ ] **Step 4: Verifikasi**

Run: `bun x tsc --noEmit && bun x biome check ./src && bun x vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/Composer.tsx src/components/chat/ModelSelector.tsx src/components/chat/SkillSelector.tsx
git commit -m "feat(chat): Notion composer and selectors"
```

---

### Task 9: UI primitives + halaman sekunder

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/dropdown-menu.tsx`
- Modify: `src/components/ui/popover.tsx`
- Modify: `src/components/ui/toast.tsx`
- Modify: `src/routes/auth/sign-in.tsx`
- Modify: `src/routes/auth/sign-up.tsx`
- Modify: `src/routes/error.tsx`
- Modify: `src/components/layout/PublicShell.tsx`
- Modify: `src/components/layout/CreditWidget.tsx`

**Interfaces:**
- Consumes: token Task 1, mapping global. API semua komponen tidak berubah.
- Produces: variant Button baru — `default` = biru solid, `destructive` = coral, `outline` = hairline-strong, `secondary` = sky-tint, `ghost`, `link`.

- [ ] **Step 1: Ganti `buttonVariants` di `button.tsx`**

```tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-notion-blue disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-notion-blue text-pure-white hover:bg-blue-hover',
        destructive: 'bg-coral text-pure-white hover:bg-coral/90',
        outline:
          'border-hairline-strong bg-pure-white text-ink hover:bg-ink/5',
        secondary: 'bg-sky-tint text-notion-blue hover:bg-sky-tint/70',
        ghost: 'text-ink hover:bg-ink/5',
        link: 'text-ink underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
```

- [ ] **Step 2: Primitives lain (mapping + standar)**

- `dialog.tsx`: Content `rounded-lg border border-hairline bg-pure-white` (overlay tetap); title `text-[18px] font-bold text-ink`; description `text-[14px] text-stone`.
- `dropdown-menu.tsx`: Content `rounded-lg border border-hairline bg-pure-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]`; Item `rounded-md text-ink outline-none focus:bg-ink/5`; semua warna lama → mapping.
- `popover.tsx`: Content default `rounded-lg border border-hairline bg-pure-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]`.
- `toast.tsx`: `rounded-lg border border-hairline bg-pure-white text-ink`.

- [ ] **Step 3: Halaman sekunder**

- `sign-in.tsx`: wrapper `bg-paper`; card `w-full max-w-[420px] rounded-lg border border-hairline bg-pure-white p-10`; h1 `text-[24px] font-bold tracking-[-0.02em] text-ink`; sub `text-[15px] text-stone`; tombol Google `rounded-md border border-hairline-strong bg-pure-white px-5 py-3 text-[15px] font-medium text-ink hover:bg-ink/5 disabled:opacity-50`. Testid `auth-card` tetap.
- `sign-up.tsx`: pola sama dengan sign-in.
- `error.tsx`: wrapper `bg-paper`; card `rounded-lg border border-hairline bg-pure-white p-8`; icon box `border border-hairline bg-paper`; link `rounded-md border border-hairline-strong bg-pure-white px-5 py-2 text-[15px] font-medium text-ink hover:bg-ink/5`.
- `PublicShell.tsx`: wrapper `bg-paper`; nav `rounded-lg border border-hairline bg-pure-white px-4 py-2`; brand `flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-notion-blue bg-pure-white text-[13px] font-extrabold text-notion-blue` berisi `ZA`; link hover `rounded-md px-3 py-1 hover:bg-ink/5`; tombol menu `rounded-md text-ink hover:bg-ink/5`; link Masuk: hapus `<span className="bg-sky-pop">`, style `rounded-md border border-hairline-strong px-4 py-2 text-ink hover:bg-ink/5`.
- `CreditWidget.tsx`: border `border-t border-hairline p-4`; teks `text-ink`; ikon gem `text-stone`; track bar `bg-paper`; fill `bg-notion-blue`, low `bg-coral`; reset button `rounded-md border border-hairline-strong px-3 py-1 text-xs font-medium text-ink hover:bg-ink/5`.

- [ ] **Step 4: Verifikasi**

Run: `bun x tsc --noEmit && bun x biome check ./src && bun x vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui src/routes/auth src/routes/error.tsx src/components/layout/PublicShell.tsx src/components/layout/CreditWidget.tsx
git commit -m "feat(ui): Notion primitives, auth pages, error page, public shell, credits"
```

---

### Task 10: Update aturan desain (docs)

**Files:**
- Modify: `.agents/rules/anti-ai-slop.md`
- Modify: `AGENTS.md` (prinsip #3 saja)

- [ ] **Step 1: `anti-ai-slop.md`**

Edit bagian berikut (sisanya dipertahankan):

1. Blockquote atas → `Sumber kebenaran visual aplikasi ini adalah **DESIGN.md** (Notion Style: *warm paper notebook under afternoon sun*).`
2. §1 "Aturan Sesuai DESIGN.md" → surface stack: Level 0 Paper `#f6f5f4`, Level 1 Pure White `#ffffff`, Level 2 Sidebar `#f2f1ef`; border hairline `rgba(0,0,0,0.08)`. Tambahkan paragraf pengecualian: shadow lembut HANYA diizinkan untuk composer (`0 4px 12px rgba(0,0,0,.07)`), dropdown/popover (`0 8px 24px rgba(0,0,0,.08)`), dan sidebar mobile overlay (`10px 0 30px rgba(0,0,0,.08)`).
3. §2 palette → **Primary Accent:** Notion Blue (`#0075de`) — satu-satunya warna tombol aksi terisi; **Teks Utama:** Ink Black (`#000000`) dengan hierarki alpha (100/95/60/45/40%); **Teks Sekunder:** Stone (`#757575`), Graphite (`#615d59`); **Aksen card:** Marigold (`#ffb110`), Coral (`#f64932`), Sky Wash (`#62aef0`), Midnight (`#02093a`) — hanya sebagai background card aksen.
4. §3 → radius resmi: card 12px, button 8px, pill 9999px, composer 18px (mobile 16px).
5. §5 → tema **Light Editorial** di kanvas paper hangat `#f6f5f4` (larangan dark glass tetap).
6. §6 → Inter untuk semua UI; serif editorial (stack Georgia) HANYA untuk welcome copy halaman `/`.
7. Self-check item 1 → `Apakah background halaman berwarna Paper (#f6f5f4) dan bukan putih polos / hitam?`; tambah item 8: `Apakah shadow hanya muncul di composer / dropdown-popover / sidebar mobile overlay?`

- [ ] **Step 2: `AGENTS.md` prinsip #3**

Ganti teks prinsip 3 menjadi:

```markdown
3. **Restrained Notion-Style Aesthetic**: Rooted in warm paper (`#f6f5f4`), pure white (`#ffffff`), and hairline borders (`rgba(0,0,0,0.08)`); Notion Blue (`#0075de`) is the single chromatic action color. Zero `shadow-xl`, zero neon accents, and zero decorative emojis in UI chrome (soft shadows allowed only on composer, dropdown/popover, and mobile sidebar overlay).
```

- [ ] **Step 3: Commit**

```bash
git add .agents/rules/anti-ai-slop.md AGENTS.md
git commit -m "docs: update design rules to Notion style tokens"
```

---

### Task 11: Hapus token lama + sweep verifikasi

**Files:**
- Modify: `src/styles/app.css` (hapus blok Legacy MindMarket)
- Modify: semua file yang masih menyisakan kelas lama (per grep)

- [ ] **Step 1: Hapus blok "Legacy MindMarket colors" dari `@theme` di `app.css`**

- [ ] **Step 2: Sweep grep**

Run:
```
rg -n "cream-paper|fresh-grass|sandstone|hairline-mist|stone-gray|stone-deep|ink-black|sky-pop|coral-pop|sunshine-pop|pure-ink" src
```
Expected: no matches. Jika ada (termasuk `ProviderIcons.tsx`, konstanta hex lama), terapkan mapping global atau ganti hex ke token terdekat (`--color-hairline` untuk warna bar kosong, dst).

Run juga: `rg -n "var\(--color-(fresh-grass|cream-paper|ink-black|sandstone|stone-gray|stone-deep|hairline-mist|pure-ink|sky-pop|coral-pop|sunshine-pop)\)" src`
Expected: no matches (ganti ke var token baru yang setara).

- [ ] **Step 3: Verifikasi penuh**

Run: `bun x tsc --noEmit && bun x biome check ./src && bun x vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "refactor(design): remove legacy MindMarket tokens"
```

---

### Task 12: E2E updates + verifikasi penuh + QA visual

**Files:**
- Modify: `tests/e2e/landing.spec.ts`
- Modify: `tests/e2e/compare.spec.ts`, `tests/e2e/upload.spec.ts`, `tests/e2e/rag.spec.ts` (per grep)
- Modify: e2e lain yang gagal karena redesign (selector/teks/geometry), BUKAN melunakkan asersi.

- [ ] **Step 1: Update `landing.spec.ts`**

Ganti asersi yang menyentuh desain lama:

1. Background body: `'rgb(246, 245, 244)'`.
2. Tombol Masuk (primary radius 8px): ganti asersi pill lama
   ```ts
   expect(masukShape.radius).toBeLessThanOrEqual(10)
   ```
3. Border composer sebelum fokus: `'rgba(0, 0, 0, 0.12)'` (hairline-strong); setelah fokus: `'rgba(0, 0, 0, 0.3)'` (`focus-within:border-ink/30`). Asersi border `'rgb(213, 213, 212)'` dan `'rgb(142, 212, 98)'` dihapus.
4. Posisi composer: sebelum `boundingBox()` tambahkan `await page.getByTestId('composer').scrollIntoViewIfNeeded()`, lalu `expect(composerBox?.y).toBeGreaterThan(250)` (batas atas 650 dihapus karena hero+starters lebih tinggi).
5. Tambah dua test baru di akhir file:

```ts
test('starter cards prefill the composer', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('starter-build').click()
  await expect(page
    .getByTestId('composer-input'))
    .toHaveValue('Bantu saya merancang aplikasi AI dari nol')
  await expect(page.getByTestId('composer-input')).toBeFocused()
})

test('sidebar collapses to icon rail on desktop', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('sidebar-collapse').click()
  await expect(page.getByTestId('guest-sidebar')).toHaveCSS('width', '76px')
  await expect(page.getByTestId('brand-mark')).toBeVisible()
  await page.getByTestId('sidebar-collapse').click()
  await expect(page.getByTestId('guest-sidebar')).toHaveCSS('width', '280px')
})
```

Catatan: asersi teks yang masih valid dipertahankan (`guest-sidebar` count, `PILIH SKILL`, compare flow, font Inter loaded). Asersi posisi x new-chat/sign-in (12–16px) dipertahankan — sidebar tetap padding 12px.

- [ ] **Step 2: Sweep token lama di tests/**

Run: `rg -n "cream-paper|fresh-grass|sandstone|hairline-mist|stone-deep|stone-gray|ink-black|rgb\(245, 241, 228\)|rgb\(213, 213, 212\)|rgb\(142, 212, 98\)" tests`
Perbaiki setiap hit di `compare.spec.ts`, `upload.spec.ts`, `rag.spec.ts` (dan lainnya) dengan nilai baru: warna paper `rgb(246, 245, 244)`, hairline `rgba(0, 0, 0, 0.08)`, notion-blue `rgb(0, 117, 222)`.

- [ ] **Step 3: Jalankan e2e penuh**

Run: `bun x playwright test`
Expected: PASS. Kegagalan yang disebabkan redesign (teks/geometry/kelas) diperbaiki dengan mengupdate asersi ke desain baru; kegagalan yang disebabkan bug nyata → perbaiki kode produksi. DILARANG mengganti asersi dengan `.toBeDefined()`/`.toBeTruthy()`.

- [ ] **Step 4: QA visual manual**

Run: `bun run dev` lalu cek di browser:
- `/` guest: canvas paper, hero pill marigold, starters 2×2, composer putih radius 18px.
- Collapse sidebar ⇄ 280/76px.
- `/chat/$id` (login): topbar model selector, pesan avatar coral/biru, compare grid, composer.
- `/auth/sign-in`, `/error`: card putih radius 12px di paper.
- Self-check `anti-ai-slop.md` (8 item) lulus.

- [ ] **Step 5: Commit**

```bash
git add tests
git commit -m "test(e2e): update assertions to Notion design and cover starters + collapse"
```

---

## Self-Review (sudah dijalankan saat penulisan)

1. **Spec coverage** — token (Task 1, 11), shell+collapse (Task 2-3), home+starters (Task 4), topbar+model lift (Task 5), pesan (Task 6), compare (Task 7), composer+selector (Task 8), sweep sekunder (Task 9), docs rules (Task 10), verifikasi (Task 11-12). Semua bagian spec §4-§10 terpetakan.
2. **Placeholder scan** — tidak ada TBD/TODO; potongan dengan komentar `{/* ...handler lama... */}` adalah instruksi eksplisit mempertahankan kode yang sudah ada (bukan placeholder implementasi baru).
3. **Type consistency** — `collapsed`/`onToggleCollapse` (Task 2 ↔ 3), `modelValue`/`onModelChange` (Task 5 ↔ 8), token `--color-hairline` dipakai via `shadow-[...var(--color-hairline)]` konsisten.

# Spec — Redesign Notion Style (DESIGN.md + preview.html)

**Tanggal:** 2026-08-30
**Status:** Disetujui via brainstorming (2026-08-30)
**Path:** Architectural (ganti design system, semua halaman)

## 1. Ringkasan

Ganti design system MindMarket lama (cream `#f5f1e4`, fresh-grass, sandstone) dengan **Notion style** sesuai `DESIGN.md` terbaru (canvas `#f6f5f4`, primary `#0075de`, hairline border, accent cards). Halaman `/` dan `/chat` mengadopsi struktur & interaksi dari `preview.html` (referensi visual user). Pendekatan: **shell rebuild + logic port** — presentasi dibangun ulang, logika produksi tidak disentuh.

## 2. Goals

1. Semua token lama hilang dari `src/` (25 file): swap penuh ke token Notion.
2. `/` dan `/chat` meniru `preview.html`: hero highlight-pill + starter cards, sidebar collapsible, topbar model selector, message avatars, composer putih radius 18px.
3. Fitur preview baru diadopsi: (a) 4 starter cards mengisi composer, (b) sidebar collapse desktop (280px → 76px), (c) model selector di topbar chat.
4. Semua fungsionalitas tetap: dynamic model registry, compare mode, auth guest flow, rename/archive/delete conversation, attachments, web search, credits, RAG.

## 3. Non-Goals

- Tidak mengubah `DESIGN.md` (sudah versi Notion).
- Tidak mengubah schema DB, server functions, AI pipeline, auth logic.
- Tidak menambah dark mode, animasi spring, atau fitur di luar preview.
- Tidak mendownload webfont baru; serif = stack Georgia (stand-in Lyon Text, sama seperti preview.html).

## 4. Design Tokens (`src/styles/app.css`)

Ganti total isi `@theme`:

```css
/* Warna */
--color-notion-blue: #0075de;      /* primary CTA, aksi aktif */
--color-blue-hover: #0068c5;
--color-paper: #f6f5f4;            /* canvas halaman */
--color-sidebar: #f2f1ef;          /* sidebar bg */
--color-pure-white: #ffffff;
--color-ink: #000000;              /* teks; hierarki via alpha */
--color-graphite: #615d59;         /* body text hangat */
--color-stone: #757575;            /* teks sekunder */
--color-sky-tint: #e6f3fe;         /* ghost CTA, status pill */
--color-marigold: #ffb110;         /* highlight pill hero */
--color-coral: #f64932;            /* avatar user, aksen */
--color-sky-wash: #62aef0;
--color-midnight: #02093a;
--color-hairline: rgba(0, 0, 0, 0.08);
--color-hairline-strong: rgba(0, 0, 0, 0.12);

/* Radius */
--radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px; --radius-pill: 9999px;
--radius-composer: 18px;           /* mobile 16px */
```

- **Font**: `--font-inter` tetap; tambah `--font-serif: Georgia, "Times New Roman", serif` untuk welcome copy.
- **Skala**: hero `clamp(42px, 5.8vw, 72px)` / 1.02 / `-0.048em` / 650; heading-sm 22px `-0.242px`; body 15–16px; caption 12px.
- **Motion**: 200ms ease; block `prefers-reduced-motion` dipertahankan.
- **Focus ring**: `outline 2px #0075de` (ganti dari ink lama).
- Token lama dihapus: `fresh-grass`, `cream-paper`, `ink-black (#2c2e2a)`, `sandstone`, `stone-gray`, `stone-deep`, `hairline-mist`, `sky-pop`, `coral-pop`, `sunshine-pop`, skala teks lama (30/53/81/140/144px), radius lama (10/20/25.5/50/63.75).

**Pengecualian shadow** (satu-satunya, sesuai preview): composer `0 4px 12px rgba(0,0,0,.07)`, sidebar mobile overlay `10px 0 30px rgba(0,0,0,.08)`, topbar blur `rgba(246,245,244,.94)` + `backdrop-blur(16px)`. Card/popover/dialog tetap tanpa shadow (hairline saja) — popover menu boleh `0 8px 24px rgba(0,0,0,.08)` ala preview `.model-menu`.

## 5. Shell (`WorkspaceShell` + `Sidebar`)

- Grid `grid-template-columns: var(--sidebar-w) 1fr`; `--sidebar-w` 280px, collapse → 76px (desktop `lg` saja).
- Tombol collapse (⇤/⇥) di sidebar-top; saat collapse: brand-copy, label, teks item, profil disembunyikan; New Chat & item jadi icon-only center.
- Sidebar: bg `--color-sidebar`, padding 12px, border-right hairline.
  - Brand: mark lingkaran 34px putih + border 2px biru, teks "ZonaAI" + sub "Your intelligent space".
  - New Chat: biru solid `#0075de`, radius 8px, min-height 42px, ikon ＋.
  - Search input: putih/hairline, radius 8px (fungsi debounce lama tetap).
  - Label section `RECENT` 10px uppercase tracking .11em.
  - Item chat: min-height 40px radius 8px; hover `rgba(0,0,0,.045)`; **aktif = bg putih + inset hairline**. Dropdown menu (rename/archive/delete) tetap ada, restyle.
  - Load more, skeleton, empty state: restyle.
- Bottom: profil (avatar 32px border coral 2px, inisial), CreditWidget (restyle), tombol keluar.
- Mobile (<lg): sidebar fixed overlay + backdrop click-close (pola lama), hamburger di topbar.
- Guest sidebar: fungsi sama (CTA masuk, new chat, tips), restyle konsisten; collapse tidak berlaku untuk guest (skip — sederhana).
- Main: `grid-template-rows: 64px minmax(0,1fr) auto` untuk halaman chat; halaman `/` konten center.

## 6. Halaman `/` (index.tsx)

- Hero ala preview:
  - Mark "ZA" 52px lingkaran putih border 2px biru.
  - H1: "Ada yang bisa <pill>dibantu?</pill>" — pill marigold, radius pill, `rotate(-1deg)`, padding `.02em .25em .12em`.
  - Sub-copy serif 18px graphite max-w 640px: "Tanya apa saja, bandingkan ide, riset teknologi, bantu coding, atau ubah gagasan mentah jadi sesuatu yang siap dibangun."
- **4 starter cards** (2×2, mobile 1 kolom): white radius 12 hairline, min-height 118px, hover translateY(-2px). Icon circle 30px tint: (1) sky-tint/biru "Build something", (2) `#fff0e8`/coral "Compare AI models", (3) `#fff4cf`/amber "Research a topic", (4) `#e9edff`/midnight "Review an idea" — title 14px/650 + sub 12px stone. Klik → isi draft composer + fokus (pakai state `draft` yang sudah ada).
- Composer inline: semua props yang ada tetap (model selector, skill, compare, attach, web, guest sign-in).
- CTA "Masuk" (guest): primary blue radius 8px.
- Error auth: teks kecil stone di bawah composer.

## 7. Halaman Chat (`/chat/$conversationId.tsx`)

- **Topbar 64px** sticky: hamburger (mobile) + **ModelSelector dipindah ke sini**.
  - State `modelId` diangkat ke `ChatThread`; `Composer` dapat props `modelValue` + `onModelChange` (kontrol tunggal, tanpa duplikasi). Default `auto`.
  - Saat compare aktif: selector topbar disabled; pemilihan 2–4 model tetap di composer.
  - Kanan topbar: tombol "Buat ulang" (regenerate existing) sebagai ghost text button.
  - Judul percakapan tidak ditampilkan di topbar (ala preview); judul tetap terlihat lewat item aktif di sidebar.
- **MessageList**: layout grid `36px 1fr` gap 14px, padding 20px 0.
  - Avatar 34px: user = border coral 2px (inisial), AI = border biru 2px "ZA".
  - Meta: nama 13px/700 + waktu 11px `rgba(0,0,0,.36)`.
  - Teks: 15px/1.7 `#262523`; kontainer markdown (list/table/quote) → white card radius 12 hairline padding 16px.
  - Aksi (copy/feedback/regenerate): icon button 30px, hover `rgba(0,0,0,.045)`.
  - TypingDots, InlineError, CodeBlock, AttachmentPreview: restyle token.
- **CompareGrid/ModelColumn/MobileCompareTabs**: kolom white card radius 12 hairline; header model (dot sky-tint + nama) + status pill; streaming & error state restyle; tabs mobile konsisten.
- **Composer**: white radius 18px, border hairline-strong, shadow lembut; textarea 15px placeholder 36% alpha; baris bawah: attach/web/skill kiri, spacer, compare toggle, send bulat 36px biru (panah ↑); catatan disclaimer 10px center.
- Toast web-search: white radius 8 hairline, posisi kanan-atas (sudah ada).

## 8. Sweep Sisanya

- `auth/sign-in.tsx`, `auth/sign-up.tsx`: card putih radius 12 di canvas paper, primary blue CTA, Google button ghost.
- `error.tsx`, `PublicShell`, `CreditWidget`, `__root.tsx`: token baru.
- Primitives `ui/button.tsx` (variants: primary=blue, ghost=sky-tint, ghost-text, outline), `ui/dialog.tsx`, `ui/dropdown-menu.tsx`, `ui/popover.tsx`, `ui/toast.tsx`: hairline + radius 8/12, tanpa shadow kecuali dropdown.
- **`.agents/rules/anti-ai-slop.md`**: ganti referensi token MindMarket → Notion; larangan tetap (shadow tebal, neon, emoji UI, gradien, dark glass); pengecualian shadow eksplisit (composer, sidebar overlay mobile, topbar blur, dropdown).
- **`AGENTS.md`** prinsip #3: palet diperbarui ke Notion (`#f6f5f4`, `#0075de`, hairline `rgba(0,0,0,0.08)`).

## 9. Data Flow & Error Handling

Tidak ada perubahan logika. Satu refactor state: `modelId` Composer → diangkat ke `ChatThread` (props terkontrol). Composer internal tetap memiliki `skillId`, `attachments`, `enableWebSearch`, `compareModelIds`.

## 10. Testing

- `bun x tsc --noEmit` — wajib lolos (tanpa `as any`).
- `bun x biome check ./src` — lolos.
- `bun x vitest run` — semua unit/integration lolos; update test yang memakai token/teks lama (mis. e2e selector).
- `bun x playwright test` — e2e lolos; selector testid/teks dipertahankan; yang berbasis kelas warna lama diupdate.
- QA visual manual: screenshot `/` (guest + login), `/chat` normal + compare, auth, error; cek konsistensi token & self-check anti-slop.
- Uji interaksi baru: collapse sidebar, starter card prefill, model selector topbar sinkron dengan composer.

## 11. Risiko

- E2E yang mengandalkan teks/tata letak lama bisa gagal → update selector, jangan melunakkan assertion.
- Pengangkatan `modelId` ke `ChatThread` menyentuh `Composer` (559 baris) → perubahan minimal: props terkontrol + fallback state internal saat props tidak diberikan (halaman `/` tetap pakai internal).
- Token lama terlewat di file yang tidak terdaftar → verifikasi via grep `cream-paper|fresh-grass|sandstone|hairline-mist|stone-gray|stone-deep` = 0 hasil.

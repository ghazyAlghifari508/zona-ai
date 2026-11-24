# P7 Component Discovery — Pagination

Ditulis sebelum implementasi UI. Fokus: footer pagination untuk tabel Model AI dan feed Log Aktivitas di Ringkasan. Tidak ada browser QA/Playwright di fase ini.

## Kebutuhan

| Surface | Kebutuhan | Batas |
| --- | --- | --- |
| Model AI | Range + total, halaman 1 dari N, prev/next, pemilih ukuran halaman 10/20/50, filter search/provider/status, reset ke halaman 1 saat filter berubah, disabled saat loading/error | Data berasal dari server function ber-DTO, bukan `slice` klien |
| Ringkasan — Log Aktivitas | 5 record/halaman, prev/next, halaman 1 dari N, feed terpisah dari metrik/chart, tautan `Lihat semua` tetap ke `/admin/audit-log` | Tidak mengubah metrik/chart saat halaman berubah |

## Inventori lokal

- `src/components/ui/table.tsx` — shadcn Table, sudah dipakai P6; tidak diganti.
- `src/components/ui/native-select.tsx` — shadcn Native Select (P5), native/keyboard/touch accessible, ukuran `sm`; dipakai untuk pemilih ukuran halaman.
- `src/components/ui/button.tsx` — `buttonVariants` dengan token `outline/ghost`, `size="icon"`, dan fokus `focus-visible:outline-notion-blue`.
- `src/routes/admin/audit-log.tsx` — footer lokal "Menampilkan … / Halaman … dari …" dengan tombol prev/next. Pola ini menjadi acuan copy, tetapi belum reusable.
- `src/components/ui/pagination.tsx` — **belum ada** sebelum P7.

## Kandidat eksternal yang diperiksa

| Kandidat | Sumber | Cocok | Keputusan |
| --- | --- | --- | --- |
| shadcn/ui Pagination (base + aria + radix) | `https://ui.shadcn.com/docs/components/base/pagination`, `https://ui.shadcn.com/docs/components/aria/pagination`, registry `https://ui.shadcn.com/r/styles/new-york-v4/pagination.json` | Ya: `<nav>`, `<ul>/<li>`, `aria-current="page"`, ikon chevron, komposisi `PaginationPrevious`/`PaginationNext` | **Dipilih** |
| shadcn data-table pagination + rows-per-page | `https://ui.shadcn.com/docs/components/aria/data-table` | Ya: pola footer tabel dengan pemilih baris per halaman | **Dipakai sebagai pola**, bukan dependency baru |
| Carbon Pagination guidelines | `https://www.carbondesignsystem.com/building-blocks/core/components/pagination/guidelines/` | Pedoman: footer melekat di bawah tabel tanpa padding, range + current/total + prev/next tetap ada di layar kecil, prev/next aktif via Space/Enter | **Dipakai sebagai pedoman** |
| HeroUI Pagination | `https://heroui.com/en/docs/react/components/pagination` | Fungsional, tetapi butuh `@heroui/react` + React Aria dan sistem warna sendiri | **Ditolak**: library/design system paralel; tidak sesuai stack shadcn yang sudah terpasang |
| affectUI Pagination | `https://www.affectui.com/components/pagination` | Kontrol paling dekat (page/pageSize/total/onPageChange), MIT, React 19 | **Ditolak**: butuh `npx shadcn@latest add https://…` (installer remote) dan menambah komponen parallel dengan shadcn resmi; source/diff belum diaudit |
| Magic UI / React Bits / Thinking Orbs / Sakani / Tuff UI / CUI | Pencarian registry: tidak ada kandidat pagination yang lebih cocok daripada shadcn/HeroUI/affectUI | Tidak relevan | **Ditolak** |

Karena kedua surface P7 memakai state/server function, bukan URL navigation, `PaginationPrevious`/`PaginationNext` dan link halaman diadaptasi menjadi **tombol native** (`onClick`, `disabled`, `aria-current="page"`). Ini sesuai persistensi filter dan state dan mencegah prev/next aktif saat loading. Perubahan ini dicatat sebagai adaptasi, bukan komponen baru dari nol.

1. Salin komposisi resmi shadcn Pagination ke `src/components/ui/pagination.tsx` tanpa installer remote. Struktur: `Pagination` (`<nav>`), `PaginationContent` (`<ul>`), `PaginationItem` (`<li>`), `PaginationLink`, `PaginationPrevious`, `PaginationNext`, `PaginationEllipsis`.
2. Karena kedua surface P7 memakai state/server function, bukan URL navigation, `PaginationPrevious`/`PaginationNext` dan link halaman diadaptasi menjadi **tombol.native** (`onClick`, `disabled`, `aria-current="page"`). Ini sesuai persistensi filter担 state dan mencegah prev/next aktif saat loading. Perubahan ini dicatat sebagai adaptasi, bukan komponen baru dari nol.
3. `src/components/admin/TablePagination.tsx` menjadi satu footer bersama: range (`1–10 dari 53` / `0 dari 0` bila kosong), `Halaman X dari Y`, prev/next berlabel, dan opsional pemilih ukuran halaman memakai `NativeSelect`. Footer ditempatkan tepat di bawah tabel/feed dengan jarak minimal sesuai Carbon.
4. `NativeSelect` dipakai hanya di Model AI; Ringkasan memakai ukuran tetap 5 dari konstanta dan tidak menampilkan pemilih ukuran.

## Kompatibilitas, lisensi, aksesibilitas, dependency

- **Lisensi**: kode shadcn/ui berada di bawah MIT (`https://github.com/shadcn-ui/ui/blob/main/LICENSE`); copy source lokal tidak mengubah lisensi dependency. `lucide-react`, `@radix-ui/react-slot`, `class-variance-authority` sudah terpasang di `package.json`.
- **Dependency baru**: tidak ada. Tidak menjalankan installer remote; source registry shadcn dibaca dan disalin manual.
- **Tailwind v4**: memakai utility yang sudah ada (`border-hairline`, `bg-pure-white`, `text-ink`, `text-stone`, `bg-paper/40`, `focus-visible:outline-notion-blue`) dan `cn()`; tidak menambah config Tailwind.
- **A11y**: `<nav aria-label>` untuk setiap footer, tombol nyata dengan teks "Sebelumnya"/"Berikutnya" + ikon, `disabled` pada batas, `aria-current="page"` pada halaman aktif, `aria-live="polite"` pada teks range, label eksplisit pada pemilih ukuran. Fokus mengikuti pola global `src/styles/app.css`. State kosong/error tidak menyajikan angka palsu.
- **Responsive**: baris footer membungkus pada layar kecil; range dan prev/next tetap tampil (Carbon).

## Komponen yang benar-benar dipakai

| File | Peran |
| --- | --- |
| `src/components/ui/pagination.tsx` | Primitif pagination shadcn yang diadaptasi ke tombol |
| `src/components/admin/TablePagination.tsx` | Footer bersama untuk Model AI dan Ringkasan |
| `src/components/ui/native-select.tsx` | Pemilih `pageSize` Model AI |
| `src/components/ui/table.tsx` | Tabel Model AI yang sudah ada |
| `src/lib/admin/audit-activity.ts` | `presentAuditActivity` untuk render feed Ringkasan |

Tidak ada komponen HeroUI/affectUI yang dipasang atau diimpor.
